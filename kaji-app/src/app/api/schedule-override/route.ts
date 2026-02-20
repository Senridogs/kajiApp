import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isDateKey,
  rebuildScheduleDateKeys,
  resolveCurrentScheduleDateKeys,
  resolveScheduleWindow,
  sortedDateKeys,
} from "@/lib/schedule-policy";
import { touchHousehold } from "@/lib/sync";
import { addDays, parseDateKey, startOfJstDay, toJstDateKey } from "@/lib/time";

type Body = {
  choreId?: string;
  date?: string;
  sourceDate?: string;
  recalculateFuture?: boolean;
  mergeIfDuplicate?: boolean;
  sourceRecordId?: string;
  mode?: "move" | "add";
  allowDuplicate?: boolean;
};

function removeOneOccurrence(dateKeys: string[], targetDateKey: string) {
  const next = [...dateKeys];
  const index = next.findIndex((dateKey) => dateKey === targetDateKey);
  if (index >= 0) {
    next.splice(index, 1);
  }
  return next;
}

function includeSourceDateIfMissing(dateKeys: string[], sourceDateKey: string) {
  if (dateKeys.includes(sourceDateKey)) return dateKeys;
  return [...dateKeys, sourceDateKey].sort((a, b) => a.localeCompare(b));
}

function mapOverridesForResponse(
  overrides: Array<{ id: string; choreId: string; date: string; createdAt: Date }>,
) {
  return overrides.map((override) => ({
    id: override.id,
    choreId: override.choreId,
    date: override.date,
    createdAt: override.createdAt.toISOString(),
  }));
}

function isDuplicateScheduleOverrideError(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.includes("choreId") && target.includes("date");
  }
  if (typeof target === "string") {
    return target.includes("choreId") && target.includes("date");
  }
  return false;
}

const DUPLICATE_SCHEDULE_MESSAGE = "その日には同じ家事がすでに登録されています。";
const DUPLICATE_INDEX_MISMATCH_CODE = "SCHEDULE_OVERRIDE_DUPLICATE_INDEX_CONFLICT";

function moveDateKeepingTimeOfDay(
  originalPerformedAt: Date,
  targetDateKey: string,
) {
  const targetMidnightJst = parseDateKey(targetDateKey);
  const jstOffsetMs = 9 * 60 * 60 * 1000;
  if (!targetMidnightJst) return new Date(Number.NaN);
  const originalJst = new Date(originalPerformedAt.getTime() + jstOffsetMs);
  return new Date(
    targetMidnightJst.getTime() +
    (originalJst.getUTCHours() * 60 + originalJst.getUTCMinutes()) * 60 * 1000 +
    originalJst.getUTCSeconds() * 1000,
  );
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<Body>(request);
  const choreId = body?.choreId?.trim();
  const date = body?.date?.trim();
  const sourceDate = body?.sourceDate?.trim();
  const sourceRecordId = body?.sourceRecordId?.trim();
  const mode = body?.mode;
  const recalculateFuture = body?.recalculateFuture === true;
  const mergeIfDuplicate = body?.mergeIfDuplicate !== false;
  const allowDuplicate = body?.allowDuplicate === true;
  const todayDateKey = toJstDateKey(startOfJstDay(new Date()));
  const tomorrowStart = addDays(startOfJstDay(new Date()), 1);

  if (!choreId || !date) return badRequest("家事IDと日付は必須です。");
  if (!isDateKey(date)) return badRequest("日付は YYYY-MM-DD 形式で指定してください。");
  if (sourceDate && !isDateKey(sourceDate)) {
    return badRequest("元の日付は YYYY-MM-DD 形式で指定してください。");
  }

  const chore = await prisma.chore.findFirst({
    where: { id: choreId, householdId: session.householdId, archived: false },
    select: {
      id: true,
      intervalDays: true,
      dailyTargetCount: true,
      createdAt: true,
      records: {
        where: { performedAt: { lt: tomorrowStart } },
        take: 1,
        orderBy: { performedAt: "desc" },
        select: { performedAt: true },
      },
    },
  });
  if (!chore) return badRequest("対象の家事が見つかりません。", 404);

  try {
    if (mode === "add") {
      if (date < todayDateKey) {
        return badRequest("過去の日付には予定を追加できません。");
      }

      const currentOverrides = await prisma.choreScheduleOverride.findMany({
        where: { choreId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { date: true },
      });
      const dueBase = chore.records[0]?.performedAt ?? chore.createdAt;
      const dueDateKey = toJstDateKey(addDays(dueBase, chore.intervalDays));
      const window = resolveScheduleWindow(todayDateKey, date);
      const currentDateKeys =
        currentOverrides.length > 0
          ? sortedDateKeys(currentOverrides.map((entry) => entry.date))
          : resolveCurrentScheduleDateKeys({
            overrideDateKeys: [],
            dueDateKey,
            intervalDays: chore.intervalDays,
            dailyTargetCount: chore.dailyTargetCount,
            window,
          });
      const scheduledCount = currentDateKeys.filter((dateKey) => dateKey === date).length;
      if (scheduledCount > 0 && !allowDuplicate) {
        return badRequest(DUPLICATE_SCHEDULE_MESSAGE, 409);
      }

      const nextDateKeys = sortedDateKeys([...currentDateKeys, date]);
      const savedOverrides = await prisma.$transaction(async (tx) => {
        await tx.choreScheduleOverride.deleteMany({ where: { choreId } });
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
        added: true,
        choreId,
        date,
        allowDuplicate,
        overrides: mapOverridesForResponse(savedOverrides),
      });
    }

  if (sourceRecordId) {
    const record = await prisma.choreRecord.findFirst({
      where: { id: sourceRecordId, householdId: session.householdId, choreId },
      select: { id: true, performedAt: true },
    });
    if (!record) return badRequest("対象の記録が見つかりません。", 404);
    const sourceRecordDateKey = toJstDateKey(startOfJstDay(new Date(record.performedAt)));

    const currentOverrides = await prisma.choreScheduleOverride.findMany({
      where: { choreId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: { date: true },
    });
    const dueBase = chore.records[0]?.performedAt ?? chore.createdAt;
    const dueDateKey = toJstDateKey(addDays(dueBase, chore.intervalDays));
    const window = resolveScheduleWindow(sourceRecordDateKey, date);
    const currentDateKeys = resolveCurrentScheduleDateKeys({
      overrideDateKeys: currentOverrides.map((entry) => entry.date),
      dueDateKey,
      intervalDays: chore.intervalDays,
      dailyTargetCount: chore.dailyTargetCount,
      window,
    });
    const currentDateKeysForMove = includeSourceDateIfMissing(
      currentDateKeys,
      sourceRecordDateKey,
    );
    const nextDateKeys = rebuildScheduleDateKeys({
      currentDateKeys: currentDateKeysForMove,
      sourceDateKey: sourceRecordDateKey,
      targetDateKey: date,
      recalculateFuture,
      mergeIfDuplicate,
      intervalDays: chore.intervalDays,
      dailyTargetCount: chore.dailyTargetCount,
      window,
    });
    const remainingDateKeys = removeOneOccurrence(nextDateKeys, date);
    const newPerformedAt = moveDateKeepingTimeOfDay(record.performedAt, date);

    const savedOverrides = await prisma.$transaction(async (tx) => {
      await tx.choreRecord.update({
        where: { id: sourceRecordId },
        data: { performedAt: newPerformedAt },
      });
      await tx.choreScheduleOverride.deleteMany({ where: { choreId } });
      if (remainingDateKeys.length > 0) {
        await tx.choreScheduleOverride.createMany({
          data: remainingDateKeys.map((dateKey) => ({ choreId, date: dateKey })),
        });
      }
      return tx.choreScheduleOverride.findMany({
        where: { choreId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { id: true, choreId: true, date: true, createdAt: true },
      });
    });

    await touchHousehold(session.householdId);
    return Response.json({
      moved: true,
      choreId,
      sourceDate: sourceRecordDateKey,
      date,
      recalculateFuture,
      mergeIfDuplicate,
      sourceRecordId,
      overrides: mapOverridesForResponse(savedOverrides),
    });
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
    dailyTargetCount: chore.dailyTargetCount,
    window,
  });

  if (!currentDateKeys.includes(sourceDate)) {
    return badRequest("元の日付は現在の予定に含まれていません。", 409);
  }

  const nextDateKeys = rebuildScheduleDateKeys({
    currentDateKeys,
    sourceDateKey: sourceDate,
    targetDateKey: date,
    recalculateFuture,
    mergeIfDuplicate,
    intervalDays: chore.intervalDays,
    dailyTargetCount: chore.dailyTargetCount,
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
    mergeIfDuplicate,
    overrides: mapOverridesForResponse(savedOverrides),
  });
  } catch (error) {
    if (isDuplicateScheduleOverrideError(error)) {
      if (mode === "add" && allowDuplicate) {
        return Response.json(
          {
            error: "重複予定の登録に失敗しました。DBの一意制約が残っている可能性があります。",
            code: DUPLICATE_INDEX_MISMATCH_CODE,
          },
          { status: 409 },
        );
      }
      return badRequest(DUPLICATE_SCHEDULE_MESSAGE, 409);
    }
    throw error;
  }
}

