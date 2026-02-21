import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { OCCURRENCE_SOURCE_GENERATOR } from "@/lib/chore-occurrence";
import { computeChore } from "@/lib/dashboard";
import { buildHomeProgressByDate } from "@/lib/home-occurrence";
import { prisma } from "@/lib/prisma";
import { buildRecurrenceDateKeys } from "@/lib/schedule-policy";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

type UpdateChoreBody = {
  title?: string;
  intervalDays?: number;
  dailyTargetCount?: number;
  icon?: string;
  iconColor?: string;
  bgColor?: string;
  scheduleAnchorDate?: string;
};

type RouteParams = { params: Promise<{ id: string }> };

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

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const dateKey = searchParams.get("date")?.trim() ?? null;

  if (dateKey && !isDateKey(dateKey)) {
    return badRequest("date must be in YYYY-MM-DD format.");
  }

  const chore = await prisma.chore.findFirst({
    where: { id, householdId: session.householdId, archived: false },
    include: {
      defaultAssignee: { select: { id: true, name: true } },
      records: {
        take: 1,
        orderBy: { performedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!chore) return badRequest("Chore not found.", 404);

  const computed = computeChore(chore);
  const scheduleOverrides = await prisma.choreOccurrence.findMany({
    where: { choreId: id, status: "pending" },
    orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
    select: { id: true, choreId: true, dateKey: true, createdAt: true },
  });

  let homeProgressEntry = null;
  if (dateKey) {
    const targetDayStart = startOfJstDay(new Date(`${dateKey}T00:00:00+09:00`));
    const nextDayStart = addDays(targetDayStart, 1);
    const records = await prisma.choreRecord.findMany({
      where: {
        householdId: session.householdId,
        choreId: id,
        isInitial: false,
        OR: [
          { scheduledDate: dateKey },
          { scheduledDate: null, performedAt: { gte: targetDayStart, lt: nextDayStart } },
        ],
      },
      orderBy: { performedAt: "desc" },
      select: {
        choreId: true,
        scheduledDate: true,
        performedAt: true,
        isSkipped: true,
        isInitial: true,
      },
    });

    const progressByDate = buildHomeProgressByDate({
      chores: [computed],
      dateKeys: [dateKey],
      scheduleOverridesByChore: new Map([
        [
          id,
          scheduleOverrides.map((override) => ({
            id: override.id,
            choreId: override.choreId,
            date: override.dateKey,
            createdAt: override.createdAt.toISOString(),
          })),
        ],
      ]),
      records,
    });

    homeProgressEntry = progressByDate[dateKey]?.[id] ?? null;
  }

  return NextResponse.json({
    chore: computed,
    scheduleOverrides: scheduleOverrides.map((override) => ({
      id: override.id,
      choreId: override.choreId,
      date: override.dateKey,
      createdAt: override.createdAt.toISOString(),
    })),
    homeProgressEntry,
    dateKey,
    generatedAt: toJstDateKey(startOfJstDay(new Date())),
  });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;
  const body = await readJsonBody<UpdateChoreBody>(request);
  if (!body) return badRequest("Request body is invalid.");
  const scheduleAnchorDate = body.scheduleAnchorDate?.trim();
  if (scheduleAnchorDate && !isDateKey(scheduleAnchorDate)) {
    return badRequest("scheduleAnchorDate must be in YYYY-MM-DD format.");
  }

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return badRequest("Title is required.");
    data.title = title;
  }
  if (typeof body.intervalDays === "number") {
    if (!Number.isInteger(body.intervalDays) || body.intervalDays <= 0 || body.intervalDays > 365) {
      return badRequest("intervalDays must be an integer between 1 and 365.");
    }
    data.intervalDays = body.intervalDays;
  }
  if (typeof body.dailyTargetCount === "number") {
    if (!Number.isInteger(body.dailyTargetCount) || body.dailyTargetCount < 1 || body.dailyTargetCount > 5) {
      return badRequest("dailyTargetCount must be an integer between 1 and 5.");
    }
    data.dailyTargetCount = body.dailyTargetCount;
  }
  if (typeof body.icon === "string") data.icon = body.icon;
  if (typeof body.iconColor === "string") data.iconColor = body.iconColor;
  if (typeof body.bgColor === "string") data.bgColor = body.bgColor;
  if (!Object.keys(data).length) return badRequest("No fields to update.");

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      const chore = await tx.chore.findFirst({
        where: { id, householdId: session.householdId, archived: false },
        select: {
          id: true,
          createdAt: true,
          intervalDays: true,
          dailyTargetCount: true,
        },
      });
      if (!chore) {
        return null;
      }

      const todayDateKey = toJstDateKey(startOfJstDay(new Date()));
      const latestRecord = await tx.choreRecord.findFirst({
        where: {
          householdId: session.householdId,
          choreId: id,
          performedAt: { lt: addDays(startOfJstDay(new Date()), 1) },
        },
        orderBy: { performedAt: "desc" },
        select: { performedAt: true },
      });
      const dueBase = latestRecord?.performedAt ?? chore.createdAt;
      const nextDueDateKey = toJstDateKey(addDays(dueBase, chore.intervalDays));
      const nextPending = await tx.choreOccurrence.findFirst({
        where: {
          choreId: id,
          status: "pending",
          dateKey: { gte: todayDateKey },
        },
        orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
        select: { dateKey: true },
      });
      const fallbackAnchorDateKey = nextPending?.dateKey ?? nextDueDateKey;
      const anchorDateKey = scheduleAnchorDate || fallbackAnchorDateKey;

      const intervalDaysAfter = typeof body.intervalDays === "number" ? body.intervalDays : chore.intervalDays;
      const dailyTargetCountAfter =
        typeof body.dailyTargetCount === "number" ? body.dailyTargetCount : chore.dailyTargetCount;
      const shouldRebuildFromAnchor =
        typeof body.intervalDays === "number" || typeof body.dailyTargetCount === "number";

      const updatedChore = await tx.chore.update({
        where: { id },
        data,
        include: {
          defaultAssignee: { select: { id: true, name: true } },
          records: {
            take: 1,
            orderBy: { performedAt: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });

      if (shouldRebuildFromAnchor) {
        await tx.choreOccurrence.updateMany({
          where: {
            choreId: id,
            status: "pending",
            dateKey: { gte: anchorDateKey },
          },
          data: { status: "consumed" },
        });

        const toDateKey = toJstDateKey(addDays(startOfJstDay(new Date(`${anchorDateKey}T00:00:00+09:00`)), 730));
        const generated = buildRecurrenceDateKeys({
          dueDateKey: anchorDateKey,
          intervalDays: intervalDaysAfter,
          dailyTargetCount: dailyTargetCountAfter,
          fromDateKey: anchorDateKey,
          toDateKey,
        });

        if (generated.length > 0) {
          await tx.choreOccurrence.createMany({
            data: generated.map((dateKey) => ({
              choreId: id,
              dateKey,
              status: "pending",
              sourceType: OCCURRENCE_SOURCE_GENERATOR,
            })),
          });
        }
      }

      return updatedChore;
    });
    if (!updated) return badRequest("Chore not found.", 404);
  } catch (error: unknown) {
    if (isChoreSchemaError(error) || error instanceof Prisma.PrismaClientInitializationError) {
      return choreSchemaErrorResponse();
    }
    throw error;
  }

  await touchHousehold(session.householdId);

  return NextResponse.json({ chore: computeChore(updated) });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const chore = await prisma.chore.findFirst({
    where: { id, householdId: session.householdId, archived: false },
    select: { id: true },
  });
  if (!chore) return badRequest("Chore not found.", 404);

  await prisma.chore.update({
    where: { id },
    data: { archived: true },
  });

  await touchHousehold(session.householdId);

  return NextResponse.json({ ok: true });
}
