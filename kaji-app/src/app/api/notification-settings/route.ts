import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type Body = {
  reminderTimes?: string[];
  notifyReminder?: boolean;
  // legacy payload compatibility
  notifyDueToday?: boolean;
  remindDailyIfOverdue?: boolean;
  notifyCompletion?: boolean;
};

function parseReminderHour(value: string): number | null {
  const match = /^([01]\d|2[0-3]):00$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? hour : null;
}

function normalizeReminderTimes(values: string[]): { values: string[] } | { error: string } {
  const normalized = [...new Set(values.map((x) => x.trim()))];
  const hours: number[] = [];

  for (const value of normalized) {
    const hour = parseReminderHour(value);
    if (hour === null || hour < 6 || hour > 23) {
      return { error: "通知時刻は 06:00〜23:00 の1時間単位で指定してください。" };
    }
    hours.push(hour);
  }

  if (hours.length < 1 || hours.length > 4) {
    return { error: "通知時刻は1件以上4件以下で設定してください。" };
  }

  hours.sort((a, b) => a - b);
  return { values: hours.map((hour) => `${String(hour).padStart(2, "0")}:00`) };
}

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const household = await prisma.household.findUnique({
    where: { id: session.householdId },
    select: {
      reminderTimes: true,
      notifyReminder: true,
      notifyDueToday: true,
      remindDailyIfOverdue: true,
      notifyCompletion: true,
      inviteCode: true,
    },
  });
  if (!household) return badRequest("世帯情報が見つかりません。", 404);

  return NextResponse.json({
    reminderTimes: household.reminderTimes,
    notifyReminder:
      household.notifyReminder ??
      (household.notifyDueToday || household.remindDailyIfOverdue),
    notifyCompletion: household.notifyCompletion,
    inviteCode: household.inviteCode,
  });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<Body>(request);
  if (!body) return badRequest("リクエスト形式が不正です。");
  const data: Record<string, unknown> = {};

  if (Array.isArray(body?.reminderTimes)) {
    const normalized = normalizeReminderTimes(body.reminderTimes);
    if ("error" in normalized) return badRequest(normalized.error);
    data.reminderTimes = normalized.values;
  }

  if (typeof body?.notifyReminder === "boolean") {
    data.notifyReminder = body.notifyReminder;
  }

  if (
    typeof body?.notifyReminder !== "boolean" &&
    (typeof body?.notifyDueToday === "boolean" || typeof body?.remindDailyIfOverdue === "boolean")
  ) {
    data.notifyReminder = Boolean(body.notifyDueToday || body.remindDailyIfOverdue);
  }
  if (typeof body?.notifyCompletion === "boolean") {
    data.notifyCompletion = body.notifyCompletion;
  }

  if (!Object.keys(data).length) {
    return badRequest("更新する設定がありません。");
  }

  const updated = await prisma.household.update({
    where: { id: session.householdId },
    data,
    select: {
      reminderTimes: true,
      notifyReminder: true,
      notifyCompletion: true,
    },
  });

  // touchHousehold is implicit here because the household.update already
  // bumps updatedAt — but we call it explicitly to ensure the sync token changes.
  await touchHousehold(session.householdId);

  return NextResponse.json({
    reminderTimes: updated.reminderTimes,
    notifyReminder: updated.notifyReminder,
    notifyCompletion: updated.notifyCompletion,
  });
}
