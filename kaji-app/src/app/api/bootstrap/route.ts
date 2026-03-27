import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { computeChore } from "@/lib/dashboard";
import { ensureDemoDataForHousehold } from "@/lib/dummy-data";
import { calcGardenScore } from "@/lib/garden-score";
import { generateHomeMessage } from "@/lib/home-message";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { calcHouseholdStreak } from "@/lib/streak";
import { toJstDateKey } from "@/lib/time";

function emptyBootstrapPayload() {
  return {
    needsRegistration: true,
    sessionUser: null,
    users: [],
    chores: [],
    householdInviteCode: null,
    notificationSettings: null,
    customIcons: [],
    gardenScore: 100,
    householdStreak: 0,
    homeMessage: { welcome: null, message: "" },
    recentRecords: [],
    recentAwards: [],
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json(emptyBootstrapPayload());
  }

  try {
    const { householdId } = session;
    const now = new Date();

    const enableDemoData = process.env.KAJI_ENABLE_DEMO_DATA === "true";
    if (enableDemoData) {
      await ensureDemoDataForHousehold(session.householdId, session.userId);
    }

    const [household, sessionUser] = await Promise.all([
      prisma.household.findUnique({
        where: { id: householdId },
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

    const userBelongsToHousehold = household.users.some(u => u.id === session.userId);
    if (!userBelongsToHousehold) {
      return NextResponse.json(emptyBootstrapPayload());
    }

    const users = household.users.map((u) => ({
      id: u.id,
      name: u.name,
      color: u.color ?? null,
    }));

    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Calculate the cutoff for recent awards (3 months ago in JST)
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const awardsMinYear = jstNow.getUTCMonth() < 3
      ? jstNow.getUTCFullYear() - 1
      : jstNow.getUTCFullYear();
    const awardsMinMonth = ((jstNow.getUTCMonth() - 3 + 12) % 12) + 1;

    const [chores, customIcons, streakRecords, recentRecords, recentAwards] =
      await Promise.all([
        prisma.chore.findMany({
          where: {
            householdId: household.id,
            archived: false,
          },
          orderBy: [{ createdAt: "asc" }],
          include: {
            records: {
              take: 1,
              orderBy: { performedAt: "desc" },
              select: {
                id: true,
                performedAt: true,
                isInitial: true,
                isSkipped: true,
                userId: true,
              },
            },
          },
        }),
        prisma.customIcon.findMany({
          where: { householdId: household.id },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            label: true,
            icon: true,
            iconColor: true,
            bgColor: true,
          },
        }),
        prisma.choreRecord.findMany({
          where: {
            householdId,
            isInitial: false,
            performedAt: { gte: sixtyDaysAgo },
          },
          select: { performedAt: true },
        }),
        prisma.choreRecord.findMany({
          where: {
            householdId,
            isInitial: false,
            performedAt: {
              gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            },
          },
          include: {
            user: true,
            chore: true,
            reactions: true,
            comments: {
              orderBy: { createdAt: "asc" },
              include: {
                user: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { performedAt: "desc" },
          take: 20,
        }),
        prisma.award.findMany({
          where: {
            householdId,
            OR: [
              { type: "monthly", year: { gte: awardsMinYear } },
              { type: "yearly" },
            ],
          },
          include: {
            user: { select: { id: true, name: true, color: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const computed = chores.map((c) =>
      computeChore(
        {
          id: c.id,
          title: c.title,
          icon: c.icon,
          iconColor: c.iconColor,
          bgColor: c.bgColor,
          intervalDays: c.intervalDays,
          archived: c.archived,
          defaultAssigneeId: c.defaultAssigneeId,
          createdAt: c.createdAt,
        },
        c.records[0] ?? null,
        users,
        now,
      ),
    );

    const performedDates = streakRecords.map((r) =>
      toJstDateKey(r.performedAt),
    );
    const todayKey = toJstDateKey(now);
    const householdStreak = calcHouseholdStreak(performedDates, todayKey);

    const ratios = computed.map((c) => c.freshnessRatio);
    const gardenScore = calcGardenScore(ratios);

    const staleCount = computed.filter((c) => c.freshnessRatio >= 1.5).length;
    const homeMessage = generateHomeMessage({
      streak: householdStreak,
      gardenScore,
      gardenScoreYesterday: null,
      staleCount,
      totalChores: computed.length,
      recentFamilyRecords: [],
      lastOpenedAt: null,
      now,
    });

    return NextResponse.json({
      needsRegistration: false,
      sessionUser: {
        id: sessionUser.id,
        name: sessionUser.name,
        color: sessionUser.color ?? null,
      },
      users,
      chores: computed,
      householdInviteCode: household.inviteCode,
      notificationSettings: {
        reminderTimes: household.reminderTimes,
        notifyReminder:
          household.notifyReminder ??
          (household.notifyDueToday || household.remindDailyIfOverdue),
        notifyCompletion: household.notifyCompletion,
      },
      customIcons,
      gardenScore,
      householdStreak,
      homeMessage,
      recentRecords: recentRecords.map((r) => ({
        id: r.id,
        performedAt: r.performedAt.toISOString(),
        memo: r.memo,
        chore: { id: r.choreId, title: r.chore.title },
        user: { id: r.userId, name: r.user.name },
        isSkipped: r.isSkipped,
        reactions: r.reactions.map((rx) => ({
          id: rx.id,
          userId: rx.userId,
          emoji: rx.emoji,
        })),
        comments: r.comments.map((c) => ({
          id: c.id,
          recordId: c.recordId,
          userId: c.userId,
          userName: c.user.name,
          body: c.body,
          createdAt: c.createdAt.toISOString(),
        })),
      })),
      recentAwards: recentAwards
        .filter((a) => {
          if (a.type === "yearly") return true;
          if (!a.month) return false;
          // Filter monthly awards to only last 3 months
          return a.year > awardsMinYear || (a.year === awardsMinYear && a.month >= awardsMinMonth);
        })
        .map((a) => ({
          id: a.id,
          userId: a.userId,
          type: a.type,
          awardKey: a.awardKey,
          title: a.title,
          emoji: a.emoji,
          description: a.description,
          month: a.month,
          year: a.year,
          metadata: a.metadata as Record<string, unknown> | null,
          createdAt: a.createdAt.toISOString(),
        })),
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return NextResponse.json(
        {
          ...emptyBootstrapPayload(),
          error:
            "データベースのスキーマが不足しています。`npm run db:init:local` を実行してから Next.js を再起動してください。",
          code: "DB_SCHEMA_MISSING",
        },
        { status: 500 },
      );
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json(
        {
          ...emptyBootstrapPayload(),
          error:
            "データベース接続に失敗しました。DATABASE_URL を確認してください。",
          code: "DB_CONNECTION_FAILED",
        },
        { status: 500 },
      );
    }

    console.error("[api/bootstrap] failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      {
        ...emptyBootstrapPayload(),
        error: "初期データの読み込みに失敗しました。",
      },
      { status: 500 },
    );
  }
}
