import { badRequest, requireSession } from "@/lib/api";
import {
  buildCalendarMonthCountsByDate,
  isValidMonthKey,
} from "@/lib/calendar-month-summary";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month")?.trim() ?? "";
  if (!isValidMonthKey(month)) {
    return badRequest("month は YYYY-MM 形式で指定してください。");
  }

  const chores = await prisma.chore.findMany({
    where: {
      householdId: session.householdId,
      archived: false,
    },
    select: {
      id: true,
      intervalDays: true,
      createdAt: true,
      records: {
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
  });

  const countsByDate = buildCalendarMonthCountsByDate(
    month,
    chores.map((chore) => ({
      id: chore.id,
      intervalDays: chore.intervalDays,
      createdAt: chore.createdAt,
      latestRecord: chore.records[0]
        ? {
          performedAt: chore.records[0].performedAt,
          isSkipped: chore.records[0].isSkipped,
        }
        : null,
      scheduleOverrides: chore.scheduleOverrides,
    })),
  );

  return Response.json({
    month,
    countsByDate,
    generatedAt: new Date().toISOString(),
  });
}
