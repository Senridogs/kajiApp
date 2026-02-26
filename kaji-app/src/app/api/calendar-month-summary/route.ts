import { badRequest, requireSession } from "@/lib/api";
import {
  buildCalendarMonthReadModelByDate,
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

  const [chores, pendingOccurrences] = await Promise.all([
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
        scheduleOverrides: {
          select: { date: true },
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
      // Prefer ChoreOccurrence (reflects reschedules); fall back to ChoreScheduleOverride for legacy chores.
      scheduleOverrides: occurrencesByChore.has(chore.id)
        ? (occurrencesByChore.get(chore.id) ?? []).map((dateKey) => ({ date: dateKey }))
        : chore.scheduleOverrides,
    })),
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
