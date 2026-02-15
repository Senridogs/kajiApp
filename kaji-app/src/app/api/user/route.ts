import { NextResponse } from "next/server";

import { badRequest, parseJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const body = parseJsonBody<{ name?: string }>(await request.json());
  const name = body?.name?.trim();
  if (!name) return badRequest("ユーザー名を入力してください。");
  if (name.length > 24) return badRequest("ユーザー名は24文字以内にしてください。");

  const user = await prisma.user.update({
    where: { id: session.userId },
    data: { name },
    select: { id: true, name: true },
  });

  return NextResponse.json({ user });
}

