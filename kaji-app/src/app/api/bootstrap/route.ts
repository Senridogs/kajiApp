import { NextResponse } from "next/server";

import { computeChore, splitChoresForHome } from "@/lib/dashboard";
import { ensureDemoDataForHousehold } from "@/lib/dummy-data";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({
      needsRegistration: true,
      sessionUser: null,
      users: [],
      chores: [],
      todayChores: [],
      tomorrowChores: [],
      upcomingBigChores: [],
      householdInviteCode: null,
      notificationSettings: null,
    });
  }

  await ensureDemoDataForHousehold(session.householdId, session.userId);

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
    return NextResponse.json({
      needsRegistration: true,
      sessionUser: null,
      users: [],
      chores: [],
      todayChores: [],
      tomorrowChores: [],
      upcomingBigChores: [],
      householdInviteCode: null,
      notificationSettings: null,
    });
  }

  const chores = await prisma.chore.findMany({
    where: {
      householdId: household.id,
      archived: false,
    },
    orderBy: [{ isBigTask: "desc" }, { createdAt: "asc" }],
    include: {
      records: {
        take: 1,
        orderBy: { performedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  const computed = chores.map((c) => computeChore(c));
  const homeSplit = splitChoresForHome(computed);

  return NextResponse.json({
    needsRegistration: false,
    sessionUser: { id: sessionUser.id, name: sessionUser.name },
    users: household.users.map((u) => ({ id: u.id, name: u.name })),
    chores: computed,
    todayChores: homeSplit.todayChores,
    tomorrowChores: homeSplit.tomorrowChores,
    upcomingBigChores: homeSplit.upcomingBigChores,
    householdInviteCode: household.inviteCode,
    notificationSettings: {
      reminderTimes: household.reminderTimes,
      notifyDueToday: household.notifyDueToday,
      remindDailyIfOverdue: household.remindDailyIfOverdue,
      notifyCompletion: household.notifyCompletion,
    },
  });
}
