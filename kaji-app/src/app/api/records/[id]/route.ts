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
  if (!record) return badRequest("対象の記録が見つかりません。", 404);

  const todayStart = startOfJstDay(new Date());
  const twoDaysAgo = addDays(todayStart, -1);
  if (record.performedAt < twoDaysAgo) {
    return badRequest("取り消せるのは今日または昨日の記録のみです。");
  }

  await prisma.choreRecord.delete({ where: { id } });
  await touchHousehold(session.householdId);

  return NextResponse.json({ ok: true });
}
