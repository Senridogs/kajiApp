import { NextResponse } from "next/server";

import { badRequest, parseJsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function isHttpsRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0].trim() === "https";
  }
  return new URL(request.url).protocol === "https:";
}

export async function POST(request: Request) {
  const body = parseJsonBody<{ name?: string; inviteCode?: string }>(await request.json());
  const name = body?.name?.trim();
  const inviteCodeInput = body?.inviteCode?.trim().toUpperCase();

  if (!name) return badRequest("ユーザー名を入力してください。");
  if (name.length > 24) return badRequest("ユーザー名は24文字以内で入力してください。");

  const household = inviteCodeInput
    ? await prisma.household.findUnique({ where: { inviteCode: inviteCodeInput } })
    : await prisma.household.create({
        data: {
          inviteCode: generateInviteCode(),
          reminderTimes: ["06:00", "20:00"],
          notifyDueToday: true,
          remindDailyIfOverdue: true,
          notifyCompletion: true,
        },
      });

  if (!household) {
    return badRequest("招待コードが見つかりません。");
  }

  const user = await prisma.user.create({
    data: {
      name,
      householdId: household.id,
    },
  });

  await setSession(
    { userId: user.id, householdId: household.id },
    { secure: isHttpsRequest(request) },
  );

  return NextResponse.json({
    user: { id: user.id, name: user.name },
    householdInviteCode: household.inviteCode,
  });
}
