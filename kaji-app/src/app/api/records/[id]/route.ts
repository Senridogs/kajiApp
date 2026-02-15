import { NextResponse } from "next/server";

import { badRequest, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { startOfJstDay } from "@/lib/time";

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
  if (record.performedAt < todayStart) {
    return badRequest("当日済のみ取消できます。");
  }

  await prisma.choreRecord.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

