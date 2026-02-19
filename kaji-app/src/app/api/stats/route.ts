import { NextResponse } from "next/server";

import { badRequest, requireSession } from "@/lib/api";
import { getStatsRange } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { StatsPeriodKey } from "@/lib/types";
import { addDays, startOfJstDay } from "@/lib/time";

const VALID_PERIODS: StatsPeriodKey[] = ["week", "month", "half", "year", "all", "custom"];

export async function GET(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") as StatsPeriodKey) || "week";
  if (!VALID_PERIODS.includes(period)) return badRequest("不正な期間です。");

  const customFrom = searchParams.get("from") ?? undefined;
  const customTo = searchParams.get("to") ?? undefined;
  const range = getStatsRange(period, new Date(), customFrom, customTo);
  if (!range) return badRequest("カスタム期間は from / to を YYYY-MM-DD 形式で指定してください。");

  const tomorrowStart = addDays(startOfJstDay(new Date()), 1);
  const where =
    range.start === undefined
      ? {
        householdId: session.householdId,
        isInitial: false,
        isSkipped: false,
        performedAt: { lt: tomorrowStart },
      }
      : {
        householdId: session.householdId,
        isInitial: false,
        isSkipped: false,
        performedAt: {
          gte: range.start,
          lte: range.end,
          lt: tomorrowStart,
        },
      };

  const [choreCountsRaw, userCountsRaw, bigTaskUserCountsRaw, choreUserCountsRaw, chores, users] =
    await Promise.all([
      prisma.choreRecord.groupBy({
        by: ["choreId"],
        where,
        _count: { _all: true },
      }),
      prisma.choreRecord.groupBy({
        by: ["userId"],
        where,
        _count: { _all: true },
      }),
      prisma.choreRecord.groupBy({
        by: ["userId"],
        where: {
          ...where,
          chore: { isBigTask: true },
        },
        _count: { _all: true },
      }),
      prisma.choreRecord.groupBy({
        by: ["choreId", "userId"],
        where,
        _count: { _all: true },
      }),
      prisma.chore.findMany({
        where: { householdId: session.householdId, archived: false },
        select: { id: true, title: true, isBigTask: true },
        orderBy: [{ isBigTask: "desc" }, { createdAt: "asc" }],
      }),
      prisma.user.findMany({
        where: { householdId: session.householdId },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const choreCountMap = new Map(choreCountsRaw.map((r) => [r.choreId, r._count._all]));
  const userCountMap = new Map(userCountsRaw.map((r) => [r.userId, r._count._all]));
  const bigTaskUserCountMap = new Map(bigTaskUserCountsRaw.map((r) => [r.userId, r._count._all]));
  const choreUserCountMap = new Map(
    choreUserCountsRaw.map((r) => [`${r.choreId}:${r.userId}`, r._count._all]),
  );

  const choreCounts = chores.map((c) => {
    const count = choreCountMap.get(c.id) ?? 0;
    return {
      choreId: c.id,
      title: c.title,
      isBigTask: c.isBigTask,
      count,
      userCounts: users.map((u) => {
        const userCount = choreUserCountMap.get(`${c.id}:${u.id}`) ?? 0;
        return {
          userId: u.id,
          name: u.name,
          count: userCount,
          ratio: count > 0 ? userCount / count : 0,
        };
      }),
    };
  });

  const userCounts = users.map((u) => ({
    userId: u.id,
    name: u.name,
    count: userCountMap.get(u.id) ?? 0,
  }));

  const bigTaskUserCounts = users.map((u) => ({
    userId: u.id,
    name: u.name,
    count: bigTaskUserCountMap.get(u.id) ?? 0,
  }));

  return NextResponse.json({
    rangeLabel: range.label,
    choreCounts,
    userCounts,
    bigTaskUserCounts,
  });
}
