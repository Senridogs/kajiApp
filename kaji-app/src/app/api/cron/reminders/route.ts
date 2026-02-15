import { NextResponse } from "next/server";

import { buildReminderPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { addDays, nowJstHourMinute, startOfJstDay } from "@/lib/time";

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

  const slot = nowJstHourMinute(new Date());
  const slotOnHour = `${slot.slice(0, 2)}:00`;
  const households = await prisma.household.findMany({
    where: {
      reminderTimes: {
        hasSome: [slot, slotOnHour],
      },
    },
    select: { id: true, notifyDueToday: true, remindDailyIfOverdue: true },
  });

  let sent = 0;
  for (const household of households) {
    const chores = await prisma.chore.findMany({
      where: { householdId: household.id, archived: false },
      include: {
        records: {
          take: 1,
          orderBy: { performedAt: "desc" },
          select: { performedAt: true },
        },
      },
    });
    const now = new Date();
    const todayStart = startOfJstDay(now);
    const tomorrowStart = addDays(todayStart, 1);

    const dueChores = chores
      .map((c) => {
        const latest = c.records[0];
        const base = latest?.performedAt ?? c.createdAt;
        const dueAt = addDays(base, c.intervalDays);
        return {
          title: c.title,
          dueAt,
          isOverdue: dueAt < todayStart,
          isDueToday: dueAt >= todayStart && dueAt < tomorrowStart,
        };
      })
      .filter(
        (c) =>
          (household.notifyDueToday && c.isDueToday) ||
          (household.remindDailyIfOverdue && c.isOverdue),
      );

    if (!dueChores.length) continue;

    const subs = await prisma.pushSubscription.findMany({
      where: { householdId: household.id, enabled: true },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    const payload = buildReminderPayload({
      chores: dueChores.map((x) => ({ title: x.title, dueAt: x.dueAt })),
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

  return NextResponse.json({ ok: true, slot, slotOnHour, households: households.length, sent });
}
