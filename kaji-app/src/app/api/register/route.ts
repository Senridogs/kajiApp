import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { badRequest, readJsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { touchHousehold } from "@/lib/sync";

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
          notifyDueToday: false,
          remindDailyIfOverdue: false,
          notifyCompletion: false,
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

function registerErrorResponse(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  ) {
    return badRequest(
      "データベースの初期化が未完了です。Vercel の DATABASE_URL を確認し、`npx prisma db push` または `prisma migrate deploy` を実行してください。",
      500,
    );
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return badRequest(
      "データベース接続に失敗しました。Vercel の DATABASE_URL を確認してください。",
      500,
    );
  }

  return badRequest("登録処理に失敗しました。時間をおいて再試行してください。", 500);
}

export async function POST(request: Request) {
  try {
    const body = await readJsonBody<{ name?: string; inviteCode?: string; color?: string }>(request);
    if (!body) return badRequest("リクエスト形式が不正です。");
    const name = body?.name?.trim();
    const inviteCodeInput = body?.inviteCode?.trim().toUpperCase();
    const color = body?.color && /^#[0-9A-Fa-f]{6}$/.test(body.color) ? body.color : undefined;

    if (!name) return badRequest("ユーザー名を入力してください。");
    if (name.length > 24) return badRequest("ユーザー名は24文字以内で入力してください。");

    const existingUser = await prisma.user.findFirst({
      where: { name },
      include: { household: { select: { inviteCode: true } } },
      orderBy: { createdAt: "asc" },
    });

    if (existingUser) {
      await setSession(
        { userId: existingUser.id, householdId: existingUser.householdId },
        { secure: isHttpsRequest(request) },
      );

      return NextResponse.json({
        user: { id: existingUser.id, name: existingUser.name },
        householdInviteCode: existingUser.household.inviteCode,
      });
    }

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
        ...(color ? { color } : {}),
      },
    });

    await setSession(
      { userId: user.id, householdId: household.id },
      { secure: isHttpsRequest(request) },
    );

    // If a partner joined via invite code, notify existing devices
    if (inviteCodeInput) {
      await touchHousehold(household.id);
    }

    return NextResponse.json({
      user: { id: user.id, name: user.name },
      householdInviteCode: household.inviteCode,
    });
  } catch (error: unknown) {
    console.error("[api/register] failed", error);
    return registerErrorResponse(error);
  }
}
