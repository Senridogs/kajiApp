import { NextResponse } from "next/server";

import { badRequest, parseJsonBody, requireSession } from "@/lib/api";
import { computeChore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";

type CreateChoreBody = {
  title?: string;
  intervalDays?: number;
  isBigTask?: boolean;
  icon?: string;
  iconColor?: string;
  bgColor?: string;
  lastPerformedAt?: string;
};

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const chores = await prisma.chore.findMany({
    where: { householdId: session.householdId, archived: false },
    orderBy: [{ isBigTask: "desc" }, { createdAt: "asc" }],
    include: {
      records: {
        take: 1,
        orderBy: { performedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    chores: chores.map((c) => computeChore(c)),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = parseJsonBody<CreateChoreBody>(await request.json());
  const title = body?.title?.trim();
  const intervalDays = Number(body?.intervalDays ?? 0);
  const lastPerformedAt = body?.lastPerformedAt;

  if (!title) return badRequest("Please provide a chore title.");
  if (!Number.isFinite(intervalDays) || intervalDays <= 0 || intervalDays > 365) {
    return badRequest("intervalDays must be between 1 and 365.");
  }
  if (!lastPerformedAt) {
    return badRequest("lastPerformedAt is required.");
  }

  const performedAt = new Date(lastPerformedAt);
  if (Number.isNaN(performedAt.getTime())) {
    return badRequest("lastPerformedAt is invalid.");
  }

  const chore = await prisma.$transaction(async (tx) => {
    const created = await tx.chore.create({
      data: {
        householdId: session.householdId,
        title,
        intervalDays,
        isBigTask: Boolean(body?.isBigTask),
        icon: body?.icon || "sparkles",
        iconColor: body?.iconColor || "#202124",
        bgColor: body?.bgColor || "#EAF5FF",
      },
    });

    await tx.choreRecord.create({
      data: {
        householdId: session.householdId,
        choreId: created.id,
        userId: session.userId,
        performedAt,
        memo: null,
      },
    });

    return tx.chore.findUnique({
      where: { id: created.id },
      include: {
        records: {
          take: 1,
          orderBy: { performedAt: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  });

  if (!chore) return badRequest("Failed to create chore.", 500);

  return NextResponse.json({ chore: computeChore(chore) });
}