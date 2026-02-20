import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { computeChore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type UpdateChoreBody = {
  title?: string;
  intervalDays?: number;
  dailyTargetCount?: number;
  isBigTask?: boolean;
  icon?: string;
  iconColor?: string;
  bgColor?: string;
  defaultAssigneeId?: string | null;
};

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;
  const body = await readJsonBody<UpdateChoreBody>(request);
  if (!body) return badRequest("リクエスト形式が不正です。");

  const data: Record<string, unknown> = {};
  if (typeof body?.title === "string") {
    const title = body.title.trim();
    if (!title) return badRequest("家事名を入力してください。");
    data.title = title;
  }
  if (typeof body?.intervalDays === "number") {
    if (!Number.isInteger(body.intervalDays) || body.intervalDays <= 0 || body.intervalDays > 365) {
      return badRequest("リマインド間隔は1〜365日で設定してください。");
    }
    data.intervalDays = body.intervalDays;
  }
  if (typeof body?.dailyTargetCount === "number") {
    if (
      !Number.isInteger(body.dailyTargetCount) ||
      body.dailyTargetCount < 1 ||
      body.dailyTargetCount > 5
    ) {
      return badRequest("dailyTargetCount must be an integer between 1 and 5.");
    }
    data.dailyTargetCount = body.dailyTargetCount;
  }
  if (typeof body?.isBigTask === "boolean") data.isBigTask = body.isBigTask;
  if (typeof body?.icon === "string") data.icon = body.icon;
  if (typeof body?.iconColor === "string") data.iconColor = body.iconColor;
  if (typeof body?.bgColor === "string") data.bgColor = body.bgColor;
  if (body?.defaultAssigneeId !== undefined) data.defaultAssigneeId = body.defaultAssigneeId || null;
  if (!Object.keys(data).length) return badRequest("更新する項目がありません。");

  const chore = await prisma.chore.findFirst({
    where: { id, householdId: session.householdId, archived: false },
  });
  if (!chore) return badRequest("家事が見つかりません。", 404);

  const updated = await prisma.chore.update({
    where: { id },
    data,
    include: {
      defaultAssignee: { select: { id: true, name: true } },
      records: {
        take: 1,
        orderBy: { performedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  await touchHousehold(session.householdId);

  return NextResponse.json({ chore: computeChore(updated) });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const chore = await prisma.chore.findFirst({
    where: { id, householdId: session.householdId, archived: false },
    select: { id: true },
  });
  if (!chore) return badRequest("家事が見つかりません。", 404);

  await prisma.chore.update({
    where: { id },
    data: { archived: true },
  });

  await touchHousehold(session.householdId);

  return NextResponse.json({ ok: true });
}
