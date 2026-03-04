import { badRequest, requireSession } from "@/lib/api";
import {
  buildCalendarMonthReadModelByDate,
  calendarGridDateKeys,
  isValidMonthKey,
} from "@/lib/calendar-month-summary";
import { prisma } from "@/lib/prisma";
import { addDays, startOfJstDay } from "@/lib/time";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const tomorrowStart = addDays(startOfJstDay(new Date()), 1);

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month")?.trim() ?? "";
  if (!isValidMonthKey(month)) {
    return badRequest("対象月は YYYY-MM 形式で指定してください。");
  }

  const gridDateKeys = calendarGridDateKeys(month);
  const gridStart = new Date(`${gridDateKeys[0]}T00:00:00+09:00`);
  const gridEnd = addDays(new Date(`${gridDateKeys[gridDateKeys.length - 1]}T00:00:00+09:00`), 1);

  const [chores, pendingOccurrences, calendarRecords] = await Promise.all([
    prisma.chore.findMany({
      where: {
        householdId: session.householdId,
        archived: false,
      },
      select: {
        id: true,
        intervalDays: true,
        dailyTargetCount: true,
        createdAt: true,
        records: {
          where: { performedAt: { lt: tomorrowStart } },
          take: 1,
          orderBy: { performedAt: "desc" },
          select: {
            performedAt: true,
            isSkipped: true,
          },
        },
      },
    }),
    prisma.choreOccurrence.findMany({
      where: {
        status: "pending",
        chore: { householdId: session.householdId, archived: false },
      },
      select: { choreId: true, dateKey: true },
    }),
    prisma.choreRecord.findMany({
      where: {
        householdId: session.householdId,
        isInitial: false,
        chore: { householdId: session.householdId, archived: false },
        OR: [
          { scheduledDate: { in: gridDateKeys } },
          { scheduledDate: null, performedAt: { gte: gridStart, lt: gridEnd } },
        ],
      },
      select: {
        choreId: true,
        scheduledDate: true,
        performedAt: true,
        isSkipped: true,
        isInitial: true,
      },
    }),
  ]);

  // Build a map of choreId -> pending occurrence dateKeys from ChoreOccurrence (new table).
  // When a chore has any pending ChoreOccurrence entries, those represent the authoritative
  // schedule (including rescheduled dates). Fall back to ChoreScheduleOverride (legacy) only
  // when no ChoreOccurrence entries exist for that chore.
  const occurrencesByChore = new Map<string, string[]>();
  for (const occ of pendingOccurrences) {
    const list = occurrencesByChore.get(occ.choreId) ?? [];
    list.push(occ.dateKey);
    occurrencesByChore.set(occ.choreId, list);
  }

  const occurrenceByDate = buildCalendarMonthReadModelByDate(
    month,
    chores.map((chore) => ({
      id: chore.id,
      intervalDays: chore.intervalDays,
      dailyTargetCount: chore.dailyTargetCount,
      createdAt: chore.createdAt,
      latestRecord: chore.records[0]
        ? {
          performedAt: chore.records[0].performedAt,
          isSkipped: chore.records[0].isSkipped,
        }
        : null,
      scheduleOverrides: (occurrencesByChore.get(chore.id) ?? []).map((dateKey) => ({ date: dateKey })),
    })),
    calendarRecords,
  );

  const countsByDate = Object.fromEntries(
    Object.entries(occurrenceByDate).map(([dateKey, byChore]) => [
      dateKey,
      Object.values(byChore).reduce((sum, entry) => sum + entry.scheduled, 0),
    ]),
  );

  return Response.json({
    month,
    countsByDate,
    occurrenceByDate,
    generatedAt: new Date().toISOString(),
  });
}
