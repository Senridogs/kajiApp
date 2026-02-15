import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { setSession } from "@/lib/session";

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<{ inviteCode?: string }>(request);
  if (!body) return badRequest("リクエスト形式が不正です。");

  const inviteCode = body.inviteCode?.trim().toUpperCase();
  if (!inviteCode) return badRequest("家族コードを入力してください。");

  const household = await prisma.household.findUnique({
    where: { inviteCode },
  });
  if (!household) return badRequest("家族コードが見つかりません。");

  if (household.id === session.householdId) {
    return badRequest("すでにこの世帯に参加しています。");
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { householdId: household.id },
  });

  const isSecure =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" ||
    new URL(request.url).protocol === "https:";

  await setSession(
    { userId: session.userId, householdId: household.id },
    { secure: isSecure },
  );

  return NextResponse.json({ success: true });
}
