import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { computeChore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type CreateChoreBody = {
  title?: string;
  intervalDays?: number;
  icon?: string;
  iconColor?: string;
  bgColor?: string;
  lastPerformedAt?: string;
};

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const now = new Date();

  const [chores, users] = await Promise.all([
    prisma.chore.findMany({
      where: { householdId: session.householdId, archived: false },
      orderBy: [{ createdAt: "asc" }],
      include: {
        records: {
          take: 1,
          orderBy: { performedAt: "desc" },
          select: {
            id: true,
            performedAt: true,
            isInitial: true,
            isSkipped: true,
            userId: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { householdId: session.householdId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    chores: chores.map((chore) => {
      const latestRecord = chore.records[0] ?? null;
      return computeChore(chore, latestRecord, users, now);
    }),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<CreateChoreBody>(request);
  if (!body) return badRequest("Request body is invalid.");

  const title = body.title?.trim();
  const intervalDays = Number(body.intervalDays ?? 0);
  const lastPerformedAt = body.lastPerformedAt;

  if (!title) return badRequest("Title is required.");
  if (!Number.isInteger(intervalDays) || intervalDays <= 0 || intervalDays > 365) {
    return badRequest("intervalDays must be an integer between 1 and 365.");
  }

  const now = new Date();
  const initialPerformedAt = lastPerformedAt ? new Date(lastPerformedAt) : now;
  if (Number.isNaN(initialPerformedAt.getTime())) {
    return badRequest("lastPerformedAt is invalid.");
  }

  const chore = await prisma.$transaction(async (tx) => {
    const created = await tx.chore.create({
      data: {
        householdId: session.householdId,
        title,
        intervalDays,
        icon: body.icon || "sparkles",
        iconColor: body.iconColor || "#C2410C",
        bgColor: body.bgColor || "#FFF1E8",
        defaultAssigneeId: null,
      },
    });

    await tx.choreRecord.create({
      data: {
        householdId: session.householdId,
        choreId: created.id,
        userId: session.userId,
        performedAt: initialPerformedAt,
        memo: null,
        isInitial: true,
      },
    });

    return tx.chore.findUnique({
      where: { id: created.id },
      include: {
        records: {
          take: 1,
          orderBy: { performedAt: "desc" },
          select: {
            id: true,
            performedAt: true,
            isInitial: true,
            isSkipped: true,
            userId: true,
          },
        },
      },
    });
  });

  if (!chore) return badRequest("Failed to create chore.", 500);

  await touchHousehold(session.householdId);

  const users = await prisma.user.findMany({
    where: { householdId: session.householdId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const latestRecord = chore.records[0] ?? null;
  return NextResponse.json({ chore: computeChore(chore, latestRecord, users, now) });
}
