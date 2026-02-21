import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  OCCURRENCE_SOURCE_GENERATOR,
  OCCURRENCE_SOURCE_OVERRIDE,
  OCCURRENCE_STATUS_CONSUMED,
  OCCURRENCE_STATUS_PENDING,
  ensureOccurrenceBackfill,
  loadCurrentScheduledDateKeys,
} from "@/lib/chore-occurrence";
import {
  buildRecurrenceDateKeys,
  isDateKey,
  resolveScheduleWindow,
} from "@/lib/schedule-policy";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

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

function mapOverridesForResponse(
  rows: Array<{ id: string; choreId: string; dateKey: string; createdAt: Date }>,
) {
  return rows.map((row) => ({
    id: row.id,
    choreId: row.choreId,
    date: row.dateKey,
    createdAt: row.createdAt.toISOString(),
  }));
}

const DUPLICATE_SCHEDULE_MESSAGE = "その日には同じ家事がすでに登録されています。";

function moveDateKeepingTimeOfDay(originalPerformedAt: Date, targetDateKey: string) {
  const targetMidnightJst = new Date(`${targetDateKey}T00:00:00+09:00`);
  const jstOffsetMs = 9 * 60 * 60 * 1000;
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

  if (mode === "add" && date < todayDateKey) {
    return badRequest("過去の日付には予定を追加できません。");
  }

  if (sourceRecordId) {
    const record = await prisma.choreRecord.findFirst({
      where: { id: sourceRecordId, householdId: session.householdId, choreId },
      select: { id: true, performedAt: true },
    });
    if (!record) return badRequest("対象の記録が見つかりません。", 404);

    const sourceRecordDateKey = toJstDateKey(startOfJstDay(new Date(record.performedAt)));
    const saved = await prisma.$transaction(async (tx) => {
      await ensureOccurrenceBackfill(tx, choreId);
      await tx.choreRecord.update({
        where: { id: sourceRecordId },
        data: { performedAt: moveDateKeepingTimeOfDay(record.performedAt, date) },
      });
      await tx.choreOccurrence.create({
        data: {
          choreId,
          dateKey: sourceRecordDateKey,
          status: OCCURRENCE_STATUS_PENDING,
          sourceType: OCCURRENCE_SOURCE_OVERRIDE,
        },
      });
      const consumed = await tx.choreOccurrence.findFirst({
        where: { choreId, dateKey: date, status: OCCURRENCE_STATUS_PENDING },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });
      if (consumed) {
        await tx.choreOccurrence.update({
          where: { id: consumed.id },
          data: { status: OCCURRENCE_STATUS_CONSUMED },
        });
      }
      return tx.choreOccurrence.findMany({
        where: { choreId, status: OCCURRENCE_STATUS_PENDING },
        orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
        select: { id: true, choreId: true, dateKey: true, createdAt: true },
      });
    });

    await touchHousehold(session.householdId);
    return Response.json({ moved: true, choreId, sourceRecordId, date, overrides: mapOverridesForResponse(saved) });
  }

  let savedOverrides: Array<{ id: string; choreId: string; dateKey: string; createdAt: Date }> = []
  try {
    savedOverrides = await prisma.$transaction(async (tx) => {
    await ensureOccurrenceBackfill(tx, choreId);
    const dueBase = chore.records[0]?.performedAt ?? chore.createdAt;
    const dueDateKey = toJstDateKey(addDays(dueBase, chore.intervalDays));
    const window = resolveScheduleWindow(sourceDate ?? todayDateKey, date);

    if (mode === "add") {
      const currentDateKeys = await loadCurrentScheduledDateKeys(tx, {
        choreId,
        dueDateKey,
        intervalDays: chore.intervalDays,
        dailyTargetCount: chore.dailyTargetCount,
        window,
      });
      const scheduledCount = currentDateKeys.filter((dateKey) => dateKey === date).length;
      if (scheduledCount > 0 && !allowDuplicate) {
        throw new Error(DUPLICATE_SCHEDULE_MESSAGE);
      }
      await tx.choreOccurrence.create({
        data: {
          choreId,
          dateKey: date,
          status: OCCURRENCE_STATUS_PENDING,
          sourceType: OCCURRENCE_SOURCE_OVERRIDE,
        },
      });
    } else if (!sourceDate) {
      await tx.choreOccurrence.create({
        data: {
          choreId,
          dateKey: date,
          status: OCCURRENCE_STATUS_PENDING,
          sourceType: OCCURRENCE_SOURCE_OVERRIDE,
        },
      });
    } else {
      let sourceOccurrences = await tx.choreOccurrence.findMany({
        where: { choreId, dateKey: sourceDate, status: OCCURRENCE_STATUS_PENDING },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });

      if (sourceOccurrences.length === 0) {
        const hasPendingOccurrence = await tx.choreOccurrence.findFirst({
          where: { choreId, status: OCCURRENCE_STATUS_PENDING },
          select: { id: true },
        });

        if (!hasPendingOccurrence) {
          const generatedDateKeys = buildRecurrenceDateKeys({
            dueDateKey,
            intervalDays: chore.intervalDays,
            dailyTargetCount: chore.dailyTargetCount,
            fromDateKey: window.fromDateKey,
            toDateKey: window.toDateKey,
          });
          if (generatedDateKeys.length > 0) {
            await tx.choreOccurrence.createMany({
              data: generatedDateKeys.map((dateKey) => ({
                choreId,
                dateKey,
                status: OCCURRENCE_STATUS_PENDING,
                sourceType: OCCURRENCE_SOURCE_GENERATOR,
              })),
            });
          }
        }

        sourceOccurrences = await tx.choreOccurrence.findMany({
          where: { choreId, dateKey: sourceDate, status: OCCURRENCE_STATUS_PENDING },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true },
        });
      }

      if (sourceOccurrences.length === 0) {
        return [];
      }
      const movedCount = sourceOccurrences.length;
      await tx.choreOccurrence.updateMany({
        where: { id: { in: sourceOccurrences.map((occurrence) => occurrence.id) } },
        data: { status: OCCURRENCE_STATUS_CONSUMED },
      });

      if (recalculateFuture) {
        await tx.choreOccurrence.updateMany({
          where: {
            choreId,
            status: OCCURRENCE_STATUS_PENDING,
            sourceType: OCCURRENCE_SOURCE_GENERATOR,
            dateKey: { gte: sourceDate },
          },
          data: { status: OCCURRENCE_STATUS_CONSUMED },
        });
        const generated = buildRecurrenceDateKeys({
          dueDateKey: date,
          intervalDays: chore.intervalDays,
          dailyTargetCount: chore.dailyTargetCount,
          fromDateKey: date,
          toDateKey: window.toDateKey,
        });
        if (generated.length > 0) {
          await tx.choreOccurrence.createMany({
            data: generated.map((dateKey) => ({
              choreId,
              dateKey,
              status: OCCURRENCE_STATUS_PENDING,
              sourceType: OCCURRENCE_SOURCE_GENERATOR,
            })),
          });
        }
      } else {
        await tx.choreOccurrence.createMany({
          data: Array.from({ length: movedCount }).map(() => ({
            choreId,
            dateKey: date,
            status: OCCURRENCE_STATUS_PENDING,
            sourceType: OCCURRENCE_SOURCE_OVERRIDE,
          })),
        });
      }
    }

    return tx.choreOccurrence.findMany({
      where: { choreId, status: OCCURRENCE_STATUS_PENDING },
      orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
      select: { id: true, choreId: true, dateKey: true, createdAt: true },
    });
    });
  } catch (error) {
    if (error instanceof Error && error.message === DUPLICATE_SCHEDULE_MESSAGE) {
      return badRequest(DUPLICATE_SCHEDULE_MESSAGE, 409);
    }
    throw error;
  }

  await touchHousehold(session.householdId);

  return Response.json({
    choreId,
    sourceDate,
    date,
    recalculateFuture,
    mergeIfDuplicate,
    allowDuplicate,
    overrides: mapOverridesForResponse(savedOverrides),
  });
}
