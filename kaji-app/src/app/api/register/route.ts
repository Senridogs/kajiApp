import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { badRequest, readJsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function createHouseholdWithUniqueInviteCode(maxRetries = 5) {
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      return await prisma.household.create({
        data: {
          inviteCode: generateInviteCode(),
          reminderTimes: ["06:00", "20:00"],
          notifyDueToday: true,
          remindDailyIfOverdue: true,
          notifyCompletion: true,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("招待コードの発行に失敗しました。");
}

function isHttpsRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0].trim() === "https";
  }
  return new URL(request.url).protocol === "https:";
}

export async function POST(request: Request) {
  const body = await readJsonBody<{ name?: string; inviteCode?: string }>(request);
  if (!body) return badRequest("リクエスト形式が不正です。");
  const name = body?.name?.trim();
  const inviteCodeInput = body?.inviteCode?.trim().toUpperCase();

  if (!name) return badRequest("ユーザー名を入力してください。");
  if (name.length > 24) return badRequest("ユーザー名は24文字以内で入力してください。");

  let household = inviteCodeInput
    ? await prisma.household.findUnique({ where: { inviteCode: inviteCodeInput } })
    : null;

  if (!inviteCodeInput) {
    try {
      household = await createHouseholdWithUniqueInviteCode();
    } catch {
      return badRequest("世帯情報の作成に失敗しました。", 500);
    }
  }

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
