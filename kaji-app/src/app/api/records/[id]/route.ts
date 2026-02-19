import { NextResponse } from "next/server";

import { badRequest, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay } from "@/lib/time";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const record = await prisma.choreRecord.findFirst({
    where: { id, householdId: session.householdId },
    select: { id: true, performedAt: true },
  });
  if (!record) return badRequest("済が見つかりません。", 404);

  const todayStart = startOfJstDay(new Date());
  const twoDaysAgo = addDays(todayStart, -1);
  if (record.performedAt < twoDaysAgo) {
    return badRequest("当日・昨日の済のみ取消できます。");
  }

  await prisma.choreRecord.delete({ where: { id } });

  // Notify other devices about the change
  await touchHousehold(session.householdId);

  return NextResponse.json({ ok: true });
}

