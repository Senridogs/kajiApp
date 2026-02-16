import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const records = await prisma.choreRecord.findMany({
    where: { householdId: session.householdId },
    orderBy: { performedAt: "desc" },
    take: 200,
    include: {
      chore: { select: { id: true, title: true } },
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    records: records.map((r) => ({
      id: r.id,
      performedAt: r.performedAt.toISOString(),
      memo: r.memo,
      chore: r.chore,
      user: r.isInitial ? { id: r.user.id, name: "初回登録" } : r.user,
      isInitial: r.isInitial,
      isSkipped: r.isSkipped,
    })),
  });
}

