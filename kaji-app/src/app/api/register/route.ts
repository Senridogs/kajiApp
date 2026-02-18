import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { badRequest, readJsonBody } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";
import { touchHousehold } from "@/lib/sync";

const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 65536, r: 8, p: 1 };

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  const salt = parts[0] ?? "";
  const storedHash = parts[1] ?? "";
  let derived: Buffer;
  try {
    derived = scryptSync(password, salt || randomBytes(16).toString("hex"), SCRYPT_KEYLEN, SCRYPT_PARAMS);
  } catch {
    derived = randomBytes(SCRYPT_KEYLEN);
  }
  const storedBuf = Buffer.from(storedHash.padEnd(SCRYPT_KEYLEN * 2, "0"), "hex");
  try {
    return timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

function generateInviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[bytes[i] % alphabet.length];
  }
  return code;
}

async function createHouseholdWithUniqueInviteCode(maxRetries = 5) {
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      return await prisma.household.create({
        data: {
          inviteCode: generateInviteCode(),
          reminderTimes: ["08:00", "18:00"],
          notifyReminder: true,
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
    const body = await readJsonBody<{
      name?: string;
      password?: string;
      inviteCode?: string;
      color?: string;
    }>(request);
    if (!body) return badRequest("リクエスト形式が不正です。");

    const name = body?.name?.trim();
    const password = body?.password;
    const inviteCodeInput = body?.inviteCode?.trim().toUpperCase();
    const color = body?.color && /^#[0-9A-Fa-f]{6}$/.test(body.color) ? body.color : undefined;

    if (!name) return badRequest("ユーザー名を入力してください。");
    if (name.length > 24) return badRequest("ユーザー名は24文字以内で入力してください。");
    if (!password) return badRequest("パスワードを入力してください。");
    if (password.length < 8) return badRequest("パスワードは8文字以上で入力してください。");
    if (password.length > 128) return badRequest("パスワードが長すぎます。");

    const existingUser = await prisma.user.findUnique({
      where: { name },
      include: { household: { select: { inviteCode: true } } },
    });

    if (existingUser) {
      if (existingUser.passwordHash) {
        // Password already set: verify it
        if (!verifyPassword(password, existingUser.passwordHash)) {
          return badRequest("パスワードが正しくありません。");
        }
      } else {
        // Migration path: first login after password feature was added.
        // Use WHERE passwordHash IS NULL to prevent race condition when
        // two concurrent requests try to set the password simultaneously.
        const updated = await prisma.user.updateMany({
          where: { id: existingUser.id, passwordHash: null },
          data: { passwordHash: hashPassword(password) },
        });
        if (updated.count === 0) {
          // Another concurrent request already set the hash; fetch it and verify.
          const fresh = await prisma.user.findUnique({
            where: { id: existingUser.id },
            select: { passwordHash: true },
          });
          if (!fresh?.passwordHash || !verifyPassword(password, fresh.passwordHash)) {
            return badRequest("パスワードが正しくありません。");
          }
        }
      }

      await setSession(
        { userId: existingUser.id, householdId: existingUser.householdId },
        { secure: isHttpsRequest(request) },
      );

      return NextResponse.json({
        user: { id: existingUser.id, name: existingUser.name },
        householdInviteCode: existingUser.household.inviteCode,
        isExistingUser: true,
        onboardingRequired: false,
      });
    }

    // New user
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
        passwordHash: hashPassword(password),
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
      isExistingUser: false,
      onboardingRequired: !inviteCodeInput,
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return badRequest("このユーザー名はすでに使われています。別の名前を選んでください。");
    }
    console.error("[api/register] failed", error);
    return registerErrorResponse(error);
  }
}
