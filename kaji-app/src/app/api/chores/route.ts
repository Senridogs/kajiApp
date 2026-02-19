import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { computeChore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay } from "@/lib/time";

type CreateChoreBody = {
  title?: string;
  intervalDays?: number;
  isBigTask?: boolean;
  icon?: string;
  iconColor?: string;
  bgColor?: string;
  lastPerformedAt?: string;
  defaultAssigneeId?: string | null;
};

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const chores = await prisma.chore.findMany({
    where: { householdId: session.householdId, archived: false },
    orderBy: [{ isBigTask: "desc" }, { createdAt: "asc" }],
    include: {
      defaultAssignee: { select: { id: true, name: true } },
      records: {
        take: 1,
        orderBy: { performedAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    chores: chores.map((chore) => computeChore(chore)),
  });
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<CreateChoreBody>(request);
  if (!body) return badRequest("リクエスト形式が不正です。");

  const title = body.title?.trim();
  const intervalDays = Number(body.intervalDays ?? 0);
  const lastPerformedAt = body.lastPerformedAt;

  if (!title) return badRequest("家事名を入力してください。");
  if (!Number.isInteger(intervalDays) || intervalDays <= 0 || intervalDays > 365) {
    return badRequest("リマインド間隔は1〜365の整数で指定してください。");
  }
  if (!lastPerformedAt) {
    return badRequest("開始日を指定してください。");
  }

  const performedAt = new Date(lastPerformedAt);
  if (Number.isNaN(performedAt.getTime())) {
    return badRequest("開始日の形式が不正です。");
  }

  // If a future date is passed, treat it as "first scheduled date" (todo),
  // not as an already completed record on that future day.
  const todayStart = startOfJstDay(new Date());
  const selectedDayStart = startOfJstDay(performedAt);
  const initialPerformedAt =
    selectedDayStart > todayStart
      ? addDays(selectedDayStart, -intervalDays)
      : performedAt;

  const chore = await prisma.$transaction(async (tx) => {
    const created = await tx.chore.create({
      data: {
        householdId: session.householdId,
        title,
        intervalDays,
        isBigTask: Boolean(body.isBigTask),
        icon: body.icon || "sparkles",
        iconColor: body.iconColor || "#202124",
        bgColor: body.bgColor || "#EAF5FF",
        defaultAssigneeId: body.defaultAssigneeId || null,
      },
    });

    await tx.choreRecord.create({
      data: {
        householdId: session.householdId,
        choreId: created.id,
        userId: session.userId,
        performedAt: initialPerformedAt,
        memo: null,
        isInitial: true,
      },
    });

    return tx.chore.findUnique({
      where: { id: created.id },
      include: {
        defaultAssignee: { select: { id: true, name: true } },
        records: {
          take: 1,
          orderBy: { performedAt: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  });

  if (!chore) return badRequest("家事の作成に失敗しました。", 500);

  await touchHousehold(session.householdId);

  return NextResponse.json({ chore: computeChore(chore) });
}
