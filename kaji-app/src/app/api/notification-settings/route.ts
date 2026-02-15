import { NextResponse } from "next/server";

import { badRequest, parseJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type Body = {
  reminderTimes?: string[];
  notifyDueToday?: boolean;
  remindDailyIfOverdue?: boolean;
  notifyCompletion?: boolean;
};

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const household = await prisma.household.findUnique({
    where: { id: session.householdId },
    select: {
      reminderTimes: true,
      notifyDueToday: true,
      remindDailyIfOverdue: true,
      notifyCompletion: true,
      inviteCode: true,
    },
  });
  if (!household) return badRequest("世帯情報が見つかりません。", 404);

  return NextResponse.json({
    reminderTimes: household.reminderTimes,
    notifyDueToday: household.notifyDueToday,
    remindDailyIfOverdue: household.remindDailyIfOverdue,
    notifyCompletion: household.notifyCompletion,
    inviteCode: household.inviteCode,
  });
}

export async function PATCH(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = parseJsonBody<Body>(await request.json());
  const data: Record<string, unknown> = {};

  if (Array.isArray(body?.reminderTimes)) {
    const normalized = [...new Set(body.reminderTimes.map((x) => x.trim()))].sort();
    if (!normalized.length) return badRequest("通知時刻を1件以上設定してください。");
    if (normalized.some((x) => !isValidTime(x))) {
      return badRequest("通知時刻は HH:mm 形式で入力してください。");
    }
    data.reminderTimes = normalized;
  }

  if (typeof body?.notifyDueToday === "boolean") {
    data.notifyDueToday = body.notifyDueToday;
  }
  if (typeof body?.remindDailyIfOverdue === "boolean") {
    data.remindDailyIfOverdue = body.remindDailyIfOverdue;
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
      notifyDueToday: true,
      remindDailyIfOverdue: true,
      notifyCompletion: true,
    },
  });

  return NextResponse.json(updated);
}
