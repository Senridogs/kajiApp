import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { buildCompletionPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type Body = {
  memo?: string;
  performedAt?: string;
  skipped?: boolean;
};

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;
  const body = (await readJsonBody<Body>(request)) ?? {};

  const { householdId, userId } = session;

  const [chore, user] = await Promise.all([
    prisma.chore.findFirst({
      where: { id, householdId, archived: false },
      select: { id: true, title: true, icon: true },
    }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!chore) return badRequest("対象の家事が見つかりません。", 404);
  if (!user) return badRequest("ユーザーが見つかりません。", 404);

  const performedAt = body.performedAt ? new Date(body.performedAt) : new Date();
  if (Number.isNaN(performedAt.getTime())) {
    return badRequest("実施日時の形式が不正です。");
  }

  const memo = body.memo?.trim() || null;
  if (memo && memo.length > 500) {
    return badRequest("メモは500文字以内で入力してください。");
  }

  const skipped = body.skipped === true;

  const record = await prisma.choreRecord.create({
    data: {
      householdId,
      choreId: id,
      userId,
      memo,
      isSkipped: skipped,
      performedAt,
    },
  });

  await touchHousehold(householdId);

  if (!skipped && canSendPush()) {
    const [household, subs] = await Promise.all([
      prisma.household.findUnique({
        where: { id: householdId },
        select: { notifyCompletion: true },
      }),
      prisma.pushSubscription.findMany({
        where: { householdId, enabled: true, userId: { not: userId } },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      }),
    ]);

    if (household?.notifyCompletion) {
      const payload = buildCompletionPayload({
        choreTitle: chore.title,
        choreIcon: chore.icon,
        userName: user.name,
        memo: record.memo,
      });

      await Promise.all(
        subs.map(async (s) => {
          try {
            await sendWebPush(
              {
                endpoint: s.endpoint,
                p256dh: s.p256dh,
                auth: s.auth,
              },
              payload,
            );
          } catch (error: unknown) {
            const statusCode = (error as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await prisma.pushSubscription.update({
                where: { id: s.id },
                data: { enabled: false },
              });
            }
          }
        }),
      );
    }
  }

  return NextResponse.json({
    record: {
      id: record.id,
      performedAt: record.performedAt.toISOString(),
      memo: record.memo,
    },
  });
}
