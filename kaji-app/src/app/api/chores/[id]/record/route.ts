import { NextResponse } from "next/server";

import { badRequest, parseJsonBody, requireSession } from "@/lib/api";
import { buildCompletionPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type Body = {
  memo?: string;
  performedAt?: string;
};

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;
  const body = parseJsonBody<Body>(await request.json());

  const chore = await prisma.chore.findFirst({
    where: { id, householdId: session.householdId, archived: false },
    select: { id: true, title: true },
  });
  if (!chore) return badRequest("対象の家事が見つかりません。", 404);

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return badRequest("ユーザーが見つかりません。", 404);

  const performedAt = body?.performedAt ? new Date(body.performedAt) : new Date();
  if (Number.isNaN(performedAt.getTime())) {
    return badRequest("実施日時の形式が不正です。");
  }

  const record = await prisma.choreRecord.create({
    data: {
      householdId: session.householdId,
      choreId: chore.id,
      userId: user.id,
      memo: body?.memo?.trim() || null,
      performedAt,
    },
  });

  if (canSendPush()) {
    const household = await prisma.household.findUnique({
      where: { id: session.householdId },
      select: { notifyCompletion: true },
    });

    if (household?.notifyCompletion) {
      const subs = await prisma.pushSubscription.findMany({
        where: { householdId: session.householdId, enabled: true },
        select: { id: true, endpoint: true, p256dh: true, auth: true },
      });

      const payload = buildCompletionPayload({
        choreTitle: chore.title,
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
