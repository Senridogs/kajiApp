import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { computeChore, splitChoresForHome } from "@/lib/dashboard";
import { ensureDemoDataForHousehold } from "@/lib/dummy-data";
import { buildOccurrenceReadModelByDate } from "@/lib/occurrence-read-model";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { addDays, buildHomeDateKeys, startOfJstDay } from "@/lib/time";

function emptyBootstrapPayload() {
  return {
    needsRegistration: true,
    sessionUser: null,
    users: [],
    chores: [],
    todayChores: [],
    tomorrowChores: [],
    assignments: [],
    householdInviteCode: null,
    notificationSettings: null,
    customIcons: [],
    scheduleOverrides: [],
    homeProgressByDate: {},
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(emptyBootstrapPayload());
  }

  try {
    const enableDemoData = process.env.KAJI_ENABLE_DEMO_DATA === "true";
    if (enableDemoData) {
      await ensureDemoDataForHousehold(session.householdId, session.userId);
    }

    const [household, sessionUser] = await Promise.all([
      prisma.household.findUnique({
        where: { id: session.householdId },
        include: {
          users: {
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: session.userId },
      }),
    ]);

    if (!household || !sessionUser) {
      return NextResponse.json(emptyBootstrapPayload());
    }

    const [chores, customIcons, scheduleOverrides] = await Promise.all([
      prisma.chore.findMany({
        where: {
          householdId: household.id,
          archived: false,
        },
        orderBy: [{ createdAt: "asc" }],
        include: {
          defaultAssignee: { select: { id: true, name: true } },
          records: {
            take: 1,
            orderBy: { performedAt: "desc" },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.customIcon.findMany({
        where: { householdId: household.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, icon: true, iconColor: true, bgColor: true },
      }),
      prisma.choreOccurrence.findMany({
        where: {
          status: "pending",
          chore: { householdId: household.id, archived: false },
        },
        orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
        select: { id: true, choreId: true, dateKey: true, createdAt: true },
      }),
    ]);

    const computed = chores.map((c) => computeChore(c));
    const homeSplit = splitChoresForHome(computed);
    const todayStart = startOfJstDay(new Date());
    const yesterdayStart = addDays(todayStart, -1);
    const dayAfterTomorrowStart = addDays(todayStart, 2);
    const homeDateKeyRange = buildHomeDateKeys(todayStart);
    const homeDateKeys = [
      homeDateKeyRange.yesterday,
      homeDateKeyRange.today,
      homeDateKeyRange.tomorrow,
    ];
    const scheduleOverridesByChore = new Map<string, Array<{ id: string; choreId: string; date: string; createdAt: Date }>>();
    for (const override of scheduleOverrides) {
      const list = scheduleOverridesByChore.get(override.choreId) ?? [];
      list.push({ id: override.id, choreId: override.choreId, date: override.dateKey, createdAt: override.createdAt });
      scheduleOverridesByChore.set(override.choreId, list);
    }
    if (scheduleOverridesByChore.size === 0) {
      const legacyOverrides = await prisma.choreScheduleOverride.findMany({
        where: { chore: { householdId: household.id, archived: false } },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        select: { id: true, choreId: true, date: true, createdAt: true },
      });
      for (const override of legacyOverrides) {
        const list = scheduleOverridesByChore.get(override.choreId) ?? [];
        list.push({ id: override.id, choreId: override.choreId, date: override.date, createdAt: override.createdAt });
        scheduleOverridesByChore.set(override.choreId, list);
      }
    }
    const choreIds = computed.map((chore) => chore.id);
    const homeProgressRecords =
      choreIds.length > 0
        ? await prisma.choreRecord.findMany({
          where: {
            householdId: household.id,
            choreId: { in: choreIds },
            isInitial: false,
            OR: [
              { scheduledDate: { in: homeDateKeys } },
              {
                scheduledDate: null,
                performedAt: { gte: yesterdayStart, lt: dayAfterTomorrowStart },
              },
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
        })
        : [];
    const homeOccurrenceReadModelByDate = buildOccurrenceReadModelByDate({
      dateKeys: homeDateKeys,
      chores: computed.map((chore) => ({
        id: chore.id,
        intervalDays: chore.intervalDays,
        dailyTargetCount: chore.dailyTargetCount,
        dueAt: chore.dueAt ? new Date(chore.dueAt) : null,
        scheduleOverrides: (scheduleOverridesByChore.get(chore.id) ?? []).map((override) => ({ date: override.date })),
      })),
      records: homeProgressRecords,
    });
    const homeProgressByDate = Object.fromEntries(
      Object.entries(homeOccurrenceReadModelByDate).map(([dateKey, byChore]) => [
        dateKey,
        Object.fromEntries(
          Object.entries(byChore).map(([choreId, entry]) => [
            choreId,
            {
              total: entry.scheduled,
              completed: entry.completed,
              skipped: entry.skipped,
              pending: entry.pending,
              latestState:
                entry.pending > 0
                  ? "pending"
                  : entry.completed > 0
                    ? "done"
                    : entry.skipped > 0
                      ? "skipped"
                      : "pending",
            },
          ]),
        ),
      ]),
    );

    return NextResponse.json({
      needsRegistration: false,
      sessionUser: { id: sessionUser.id, name: sessionUser.name, color: sessionUser.color ?? null },
      users: household.users.map((u) => ({ id: u.id, name: u.name, color: u.color ?? null })),
      chores: computed,
      todayChores: homeSplit.todayChores,
      tomorrowChores: homeSplit.tomorrowChores,
      assignments: [],
      householdInviteCode: household.inviteCode,
      notificationSettings: {
        reminderTimes: household.reminderTimes,
        notifyReminder:
          household.notifyReminder ??
          (household.notifyDueToday || household.remindDailyIfOverdue),
        notifyCompletion: household.notifyCompletion,
      },
      customIcons,
      scheduleOverrides: Array.from(scheduleOverridesByChore.values()).flat().map((override) => ({
        id: override.id,
        choreId: override.choreId,
        date: override.date,
        createdAt: override.createdAt.toISOString(),
      })),
      homeProgressByDate,
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return NextResponse.json(
        {
          ...emptyBootstrapPayload(),
          error: "データベースのスキーマが不足しています。`npm run db:init:local` を実行してから Next.js を再起動してください。",
          code: "DB_SCHEMA_MISSING",
        },
        { status: 500 },
      );
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json(
        {
          ...emptyBootstrapPayload(),
          error: "データベース接続に失敗しました。DATABASE_URL を確認してください。",
          code: "DB_CONNECTION_FAILED",
        },
        { status: 500 },
      );
    }

    console.error("[api/bootstrap] failed", error);
    return NextResponse.json(
      {
        ...emptyBootstrapPayload(),
        error: "初期データの読み込みに失敗しました。",
      },
      { status: 500 },
    );
  }
}
