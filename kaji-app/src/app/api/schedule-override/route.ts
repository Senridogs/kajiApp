import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

const FUTURE_WINDOW_DAYS = 730;
const PAST_WINDOW_DAYS = 45;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type Body = {
  choreId?: string;
  date?: string;
  sourceDate?: string;
  recalculateFuture?: boolean;
  sourceRecordId?: string;
};

type WindowRange = {
  fromDateKey: string;
  toDateKey: string;
};

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKeyToJstDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`);
}

function uniqueSortedDateKeys(dateKeys: string[]) {
  return [...new Set(dateKeys)].sort((a, b) => a.localeCompare(b));
}

function resolveScheduleWindow(sourceDateKey: string, targetDateKey: string): WindowRange {
  const nowStart = startOfJstDay(new Date());
  const fallbackFrom = toJstDateKey(addDays(nowStart, -PAST_WINDOW_DAYS));
  const fromDateKey = sourceDateKey < fallbackFrom ? sourceDateKey : fallbackFrom;
  const maxDateKey = sourceDateKey > targetDateKey ? sourceDateKey : targetDateKey;
  const toDateKey = toJstDateKey(addDays(dateKeyToJstDate(maxDateKey), FUTURE_WINDOW_DAYS));
  return { fromDateKey, toDateKey };
}

function buildRecurrenceDateKeys(params: {
  dueDateKey: string;
  intervalDays: number;
  fromDateKey: string;
  toDateKey: string;
}) {
  const { dueDateKey, intervalDays, fromDateKey, toDateKey } = params;
  const dueDate = dateKeyToJstDate(dueDateKey);
  const fromDate = dateKeyToJstDate(fromDateKey);
  const toDate = dateKeyToJstDate(toDateKey);
  if (
    Number.isNaN(dueDate.getTime()) ||
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime())
  ) {
    return [];
  }
  if (intervalDays <= 0) return [];

  let cursor = dueDate;
  if (cursor.getTime() < fromDate.getTime()) {
    const diffDays = Math.floor((fromDate.getTime() - cursor.getTime()) / DAY_IN_MS);
    const jumpCount = Math.floor(diffDays / intervalDays);
    cursor = addDays(cursor, jumpCount * intervalDays);
    while (cursor.getTime() < fromDate.getTime()) {
      cursor = addDays(cursor, intervalDays);
    }
  }

  const results: string[] = [];
  while (cursor.getTime() <= toDate.getTime()) {
    results.push(toJstDateKey(cursor));
    cursor = addDays(cursor, intervalDays);
  }
  return results;
}

function resolveCurrentScheduleDateKeys(params: {
  overrideDateKeys: string[];
  dueDateKey: string;
  intervalDays: number;
  window: WindowRange;
}) {
  const { overrideDateKeys, dueDateKey, intervalDays, window } = params;
  if (overrideDateKeys.length > 0) {
    return uniqueSortedDateKeys(
      overrideDateKeys.filter(
        (dateKey) => dateKey >= window.fromDateKey && dateKey <= window.toDateKey,
      ),
    );
  }
  return buildRecurrenceDateKeys({
    dueDateKey,
    intervalDays,
    fromDateKey: window.fromDateKey,
    toDateKey: window.toDateKey,
  });
}

function rebuildScheduleDateKeys(params: {
  currentDateKeys: string[];
  sourceDateKey: string;
  targetDateKey: string;
  recalculateFuture: boolean;
  intervalDays: number;
  window: WindowRange;
}) {
  const { currentDateKeys, sourceDateKey, targetDateKey, recalculateFuture, intervalDays, window } = params;
  if (!recalculateFuture) {
    const moved = currentDateKeys.filter((dateKey) => dateKey !== sourceDateKey);
    moved.push(targetDateKey);
    return uniqueSortedDateKeys(moved);
  }

  const keepBefore = currentDateKeys.filter((dateKey) => dateKey < sourceDateKey);
  const toDate = dateKeyToJstDate(window.toDateKey);
  const futureDates: string[] = [];
  let cursor = dateKeyToJstDate(targetDateKey);
  if (!Number.isNaN(cursor.getTime()) && intervalDays > 0) {
    while (cursor.getTime() <= toDate.getTime()) {
      futureDates.push(toJstDateKey(cursor));
      cursor = addDays(cursor, intervalDays);
    }
  }
  return uniqueSortedDateKeys([...keepBefore, ...futureDates]);
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<Body>(request);
  const choreId = body?.choreId?.trim();
  const date = body?.date?.trim();
  const sourceDate = body?.sourceDate?.trim();
  const sourceRecordId = body?.sourceRecordId?.trim();
  const recalculateFuture = body?.recalculateFuture === true;

  if (!choreId || !date) return badRequest("choreId and date are required.");
  if (!isDateKey(date)) return badRequest("date must be YYYY-MM-DD format.");
  if (sourceDate && !isDateKey(sourceDate)) {
    return badRequest("sourceDate must be YYYY-MM-DD format.");
  }

  const chore = await prisma.chore.findFirst({
    where: { id: choreId, householdId: session.householdId, archived: false },
    select: {
      id: true,
      intervalDays: true,
      createdAt: true,
      records: {
        take: 1,
        orderBy: { performedAt: "desc" },
        select: { performedAt: true },
      },
    },
  });
  if (!chore) return badRequest("Target chore was not found.", 404);

  if (sourceRecordId) {
    // Move mode: update the completion record's date and clear any schedule overrides.
    const record = await prisma.choreRecord.findFirst({
      where: { id: sourceRecordId, householdId: session.householdId },
      select: { id: true, performedAt: true },
    });
    if (!record) return badRequest("Target record was not found.", 404);

    // Preserve the original time-of-day; only change the date portion.
    const original = record.performedAt;
    const targetMidnightJst = new Date(`${date}T00:00:00+09:00`);
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const originalJst = new Date(original.getTime() + jstOffsetMs);
    const newPerformedAt = new Date(
      targetMidnightJst.getTime() +
      (originalJst.getUTCHours() * 60 + originalJst.getUTCMinutes()) * 60 * 1000 +
      originalJst.getUTCSeconds() * 1000,
    );

    await prisma.$transaction(async (tx) => {
      await tx.choreRecord.update({
        where: { id: sourceRecordId },
        data: { performedAt: newPerformedAt },
      });
      await tx.choreScheduleOverride.deleteMany({ where: { choreId } });
    });

    await touchHousehold(session.householdId);
    return Response.json({ moved: true, choreId, date });
  }

  // Backward-compatible mode for old clients that only send "date".
  if (!sourceDate) {
    const override = await prisma.$transaction(async (tx) => {
      await tx.choreScheduleOverride.deleteMany({ where: { choreId } });
      return tx.choreScheduleOverride.create({ data: { choreId, date } });
    });

    await touchHousehold(session.householdId);

    return Response.json({
      override: {
        id: override.id,
        choreId: override.choreId,
        date: override.date,
        createdAt: override.createdAt.toISOString(),
      },
    });
  }

  const currentOverrides = await prisma.choreScheduleOverride.findMany({
    where: { choreId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { date: true },
  });
  const dueBase = chore.records[0]?.performedAt ?? chore.createdAt;
  const dueDateKey = toJstDateKey(addDays(dueBase, chore.intervalDays));
  const window = resolveScheduleWindow(sourceDate, date);
  const currentDateKeys = resolveCurrentScheduleDateKeys({
    overrideDateKeys: currentOverrides.map((entry) => entry.date),
    dueDateKey,
    intervalDays: chore.intervalDays,
    window,
  });

  if (!currentDateKeys.includes(sourceDate)) {
    return badRequest("sourceDate is not currently scheduled.", 409);
  }

  const nextDateKeys = rebuildScheduleDateKeys({
    currentDateKeys,
    sourceDateKey: sourceDate,
    targetDateKey: date,
    recalculateFuture,
    intervalDays: chore.intervalDays,
    window,
  });
  const savedOverrides = await prisma.$transaction(async (tx) => {
    await tx.choreScheduleOverride.deleteMany({ where: { choreId } });
    if (nextDateKeys.length === 0) return [];
    await tx.choreScheduleOverride.createMany({
      data: nextDateKeys.map((dateKey) => ({ choreId, date: dateKey })),
    });
    return tx.choreScheduleOverride.findMany({
      where: { choreId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { id: true, choreId: true, date: true, createdAt: true },
    });
  });

  await touchHousehold(session.householdId);

  return Response.json({
    choreId,
    sourceDate,
    date,
    recalculateFuture,
    overrides: savedOverrides.map((override) => ({
      id: override.id,
      choreId: override.choreId,
      date: override.date,
      createdAt: override.createdAt.toISOString(),
    })),
  });
}
