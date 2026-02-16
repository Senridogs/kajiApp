import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export async function PATCH(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const body = await readJsonBody<{ name?: string; color?: string | null }>(request);
  if (!body) return badRequest("リクエスト形式が不正です。");

  const data: { name?: string; color?: string | null } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return badRequest("ユーザー名を入力してください。");
    if (name.length > 24) return badRequest("ユーザー名は24文字以内にしてください。");
    data.name = name;
  }

  if (body.color !== undefined) {
    if (body.color !== null && !HEX_COLOR_RE.test(body.color)) {
      return badRequest("カラーコードの形式が不正です。");
    }
    data.color = body.color;
  }

  if (Object.keys(data).length === 0) {
    return badRequest("更新する項目がありません。");
  }

  const user = await prisma.user.update({
    where: { id: session.userId },
    data,
    select: { id: true, name: true, color: true },
  });

  await touchHousehold(session.householdId);

  return NextResponse.json({ user });
}
