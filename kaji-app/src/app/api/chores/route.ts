import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { computeChore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay } from "@/lib/time";

type CreateChoreBody = {
  title?: string;
  intervalDays?: number;
  dailyTargetCount?: number;
  icon?: string;
  iconColor?: string;
  bgColor?: string;
  startDate?: string;
  lastPerformedAt?: string;
  defaultAssigneeId?: string | null;
};

const DB_SCHEMA_MISSING_CODE = "DB_SCHEMA_MISSING";
const DB_SCHEMA_MISSING_MESSAGE =
  "Database schema is outdated for dailyTargetCount. Run npm run db:init:current-env and restart the app.";

function isChoreSchemaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function choreSchemaErrorResponse() {
  return NextResponse.json(
    {
      error: DB_SCHEMA_MISSING_MESSAGE,
      code: DB_SCHEMA_MISSING_CODE,
    },
    { status: 500 },
  );
}

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const chores = await prisma.chore.findMany({
    where: { householdId: session.householdId, archived: false },
    orderBy: [{ createdAt: "asc" }],
    include: {
      defaultAssignee: { select: { id: true, name: true } },
      records: {
        take: 1,
        orderBy: { performedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    chores: chores.map((chore) => computeChore(chore)),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<CreateChoreBody>(request);
  if (!body) return badRequest("Request body is invalid.");

  const title = body.title?.trim();
  const intervalDays = Number(body.intervalDays ?? 0);
  const dailyTargetCount = Number(body.dailyTargetCount ?? 1);
  const startDate = body.startDate;
  const lastPerformedAt = body.lastPerformedAt;

  if (!title) return badRequest("Title is required.");
  if (!Number.isInteger(intervalDays) || intervalDays <= 0 || intervalDays > 365) {
    return badRequest("intervalDays must be an integer between 1 and 365.");
  }
  if (!Number.isInteger(dailyTargetCount) || dailyTargetCount < 1 || dailyTargetCount > 5) {
    return badRequest("dailyTargetCount must be an integer between 1 and 5.");
  }
  if (!startDate && !lastPerformedAt) {
    return badRequest("Start date is required.");
  }

  let initialPerformedAt: Date;
  if (startDate) {
    const startDateTime = new Date(startDate);
    if (Number.isNaN(startDateTime.getTime())) {
      return badRequest("Start date is invalid.");
    }
    const startDayStart = startOfJstDay(startDateTime);
    initialPerformedAt = addDays(startDayStart, -intervalDays);
  } else {
    const performedAt = new Date(lastPerformedAt!);
    if (Number.isNaN(performedAt.getTime())) {
      return badRequest("Start date is invalid.");
    }

    // Backward compatibility path for older clients that send lastPerformedAt.
    // If a future date is passed, treat it as "first scheduled date" (todo),
    // not as an already completed record on that future day.
    const todayStart = startOfJstDay(new Date());
    const selectedDayStart = startOfJstDay(performedAt);
    initialPerformedAt =
      selectedDayStart > todayStart
        ? addDays(selectedDayStart, -intervalDays)
        : performedAt;
  }

  let chore;
  try {
    chore = await prisma.$transaction(async (tx) => {
      const created = await tx.chore.create({
        data: {
          householdId: session.householdId,
          title,
          intervalDays,
          dailyTargetCount,
          icon: body.icon || "sparkles",
          iconColor: body.iconColor || "#202124",
          bgColor: body.bgColor || "#EAF5FF",
          defaultAssigneeId: body.defaultAssigneeId || null,
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
          defaultAssignee: { select: { id: true, name: true } },
          records: {
            take: 1,
            orderBy: { performedAt: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });
    });
  } catch (error: unknown) {
    if (isChoreSchemaError(error) || error instanceof Prisma.PrismaClientInitializationError) {
      return choreSchemaErrorResponse();
    }
    throw error;
  }

  if (!chore) return badRequest("Failed to create chore.", 500);

  await touchHousehold(session.householdId);

  return NextResponse.json({ chore: computeChore(chore) });
}

