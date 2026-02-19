import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  isDateKey,
  rebuildScheduleDateKeys,
  resolveCurrentScheduleDateKeys,
  resolveScheduleWindow,
} from "@/lib/schedule-policy";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

type Body = {
  choreId?: string;
  date?: string;
  sourceDate?: string;
  recalculateFuture?: boolean;
  sourceRecordId?: string;
};

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<Body>(request);
  const choreId = body?.choreId?.trim();
  const date = body?.date?.trim();
  const sourceDate = body?.sourceDate?.trim();
  const sourceRecordId = body?.sourceRecordId?.trim();
  const recalculateFuture = body?.recalculateFuture === true;
  const tomorrowStart = addDays(startOfJstDay(new Date()), 1);

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
        where: { performedAt: { lt: tomorrowStart } },
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
