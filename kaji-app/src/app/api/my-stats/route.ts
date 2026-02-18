import { badRequest, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

function toMonthKey(date: Date) {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(monthKey: string, delta: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+09:00`);
  if (Number.isNaN(start.getTime())) return null;
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const end = new Date(`${nextMonth}T00:00:00+09:00`);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start, end };
}

function isValidMonthKey(value: string) {
  return /^\d{4}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const url = new URL(request.url);
  const currentMonth = toMonthKey(new Date());
  const month = url.searchParams.get("month") ?? currentMonth;
  if (!isValidMonthKey(month)) {
    return badRequest("month は YYYY-MM 形式で指定してください。");
  }

  const allowedMonths = [currentMonth, addMonths(currentMonth, -1), addMonths(currentMonth, -2)];
  if (!allowedMonths.includes(month)) {
    return badRequest("直近3ヶ月分のみ取得できます。");
  }

  const targetRange = monthRange(month);
  if (!targetRange) return badRequest("month の形式が不正です。");

  const where = {
    householdId: session.householdId,
    userId: session.userId,
    isInitial: false,
    isSkipped: false,
    performedAt: { gte: targetRange.start, lte: targetRange.end },
  };

  const [currentMonthTotal, countsByChore, chores] = await Promise.all([
    prisma.choreRecord.count({ where }),
    prisma.choreRecord.groupBy({
      by: ["choreId"],
      where,
      _count: { _all: true },
    }),
    prisma.chore.findMany({
      where: { householdId: session.householdId, archived: false },
      select: { id: true, title: true, icon: true, iconColor: true, bgColor: true },
    }),
  ]);

  const choreMap = new Map(chores.map((chore) => [chore.id, chore]));
  const choreCounts = countsByChore
    .map((entry) => {
      const chore = choreMap.get(entry.choreId);
      if (!chore) return null;
      return {
        choreId: chore.id,
        title: chore.title,
        icon: chore.icon,
        iconColor: chore.iconColor,
        bgColor: chore.bgColor,
        count: entry._count._all,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.count - a.count);

  return Response.json({
    currentMonthTotal,
    choreCounts,
  });
}
