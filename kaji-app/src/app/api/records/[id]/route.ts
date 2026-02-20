import { NextResponse } from "next/server";

import { badRequest, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const record = await prisma.choreRecord.findFirst({
    where: { id, householdId: session.householdId },
    select: { id: true, choreId: true, userId: true, performedAt: true, scheduledDate: true },
  });
  if (!record) return badRequest("対象の記録が見つかりません。", 404);

  const todayStart = startOfJstDay(new Date());
  const twoDaysAgo = addDays(todayStart, -1);
  if (record.performedAt < twoDaysAgo) {
    return badRequest("取り消せるのは今日または昨日の記録のみです。");
  }

  const tomorrowStart = addDays(todayStart, 1);
  const sourceDateKey = record.scheduledDate || toJstDateKey(startOfJstDay(record.performedAt));

  await prisma.$transaction(async (tx) => {
    await tx.choreRecord.delete({ where: { id } });

    const chore = await tx.chore.findFirst({
      where: { id: record.choreId, householdId: session.householdId, archived: false },
      select: { intervalDays: true },
    });
    if (!chore) return;

    // Undoing the first non-initial completion can leave this chore without
    // any baseline record for recurrence calculation. Recreate one so the
    // chore stays scheduled on the expected day.
    const latestPastOrTodayRecord = await tx.choreRecord.findFirst({
      where: {
        householdId: session.householdId,
        choreId: record.choreId,
        performedAt: { lt: tomorrowStart },
      },
      orderBy: { performedAt: "desc" },
      select: { id: true },
    });

    if (!latestPastOrTodayRecord) {
      await tx.choreRecord.create({
        data: {
          householdId: session.householdId,
          choreId: record.choreId,
          userId: record.userId,
          performedAt: addDays(record.performedAt, -Math.max(1, chore.intervalDays)),
          memo: null,
          isInitial: true,
          isSkipped: false,
        },
      });
    }

    // If this chore is currently driven by schedule overrides, restore one
    // occurrence on the undone day.
    const hasOverrides = await tx.choreScheduleOverride.findFirst({
      where: { choreId: record.choreId },
      select: { id: true },
    });
    if (hasOverrides) {
      await tx.choreScheduleOverride.create({
        data: { choreId: record.choreId, date: sourceDateKey },
      });
    }
  });

  await touchHousehold(session.householdId);

  return NextResponse.json({ ok: true });
}
