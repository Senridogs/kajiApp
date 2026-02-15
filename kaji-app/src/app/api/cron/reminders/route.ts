import { NextResponse } from "next/server";

import { buildReminderPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { addDays, startOfJstDay } from "@/lib/time";

export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  const auth = request.headers.get("authorization");
  const bearer = auth?.replace(/^Bearer\s+/i, "");
  const url = new URL(request.url);
  const secretQuery = url.searchParams.get("secret");
  return bearer === expected || secretQuery === expected;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canSendPush()) {
    return NextResponse.json({ ok: true, skipped: "push-not-configured" });
  }

  const households = await prisma.household.findMany({
    where: {
      OR: [{ notifyDueToday: true }, { remindDailyIfOverdue: true }],
    },
    select: { id: true, notifyDueToday: true, remindDailyIfOverdue: true },
  });

  const householdIds = households.map((h) => h.id);

  const [allChores, allSubs] = await Promise.all([
    prisma.chore.findMany({
      where: { householdId: { in: householdIds }, archived: false },
      include: {
        records: {
          take: 1,
          orderBy: { performedAt: "desc" },
          select: { performedAt: true },
        },
      },
    }),
    prisma.pushSubscription.findMany({
      where: { householdId: { in: householdIds }, enabled: true },
      select: { id: true, householdId: true, endpoint: true, p256dh: true, auth: true },
    }),
  ]);

  const choresByHousehold = new Map<string, typeof allChores>();
  for (const chore of allChores) {
    const list = choresByHousehold.get(chore.householdId) ?? [];
    list.push(chore);
    choresByHousehold.set(chore.householdId, list);
  }

  const subsByHousehold = new Map<string, typeof allSubs>();
  for (const sub of allSubs) {
    const list = subsByHousehold.get(sub.householdId) ?? [];
    list.push(sub);
    subsByHousehold.set(sub.householdId, list);
  }

  const now = new Date();
  const todayStart = startOfJstDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  let sent = 0;
  for (const household of households) {
    const chores = choresByHousehold.get(household.id) ?? [];

    const dueChores = chores
      .map((c) => {
        const latest = c.records[0];
        const base = latest?.performedAt ?? c.createdAt;
        const dueAt = addDays(base, c.intervalDays);
        const isOverdue = dueAt < todayStart;
        const overdueDays = isOverdue
          ? Math.floor((todayStart.getTime() - dueAt.getTime()) / (24 * 60 * 60 * 1000))
          : 0;
        return {
          title: c.title,
          dueAt,
          isOverdue,
          isDueToday: dueAt >= todayStart && dueAt < tomorrowStart,
          overdueDays,
        };
      })
      .filter(
        (c) =>
          (household.notifyDueToday && c.isDueToday) ||
          (household.remindDailyIfOverdue && c.isOverdue),
      );

    if (!dueChores.length) continue;

    const subs = subsByHousehold.get(household.id) ?? [];
    const payload = buildReminderPayload({
      chores: dueChores.map((x) => ({ title: x.title, isOverdue: x.isOverdue, overdueDays: x.overdueDays })),
    });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await sendWebPush(
            {
              endpoint: s.endpoint,
              p256dh: s.p256dh,
              auth: s.auth,
            },
            payload,
          );
          sent += 1;
        } catch (error: unknown) {
          const statusCode = (error as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.update({
              where: { id: s.id },
              data: { enabled: false },
            });
          }
        }
      }),
    );
  }

  return NextResponse.json({ ok: true, households: households.length, sent });
}
