import { NextResponse } from "next/server";

import { badRequest, requireSession } from "@/lib/api";
import { buildCompletionPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const { session, response } = await requireSession();
  if (!session) return response;
  if (!canSendPush()) return badRequest("プッシュ通知の設定が未完了です。");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true },
  });
  if (!user) return badRequest("ユーザーが見つかりません。", 404);

  const subs = await prisma.pushSubscription.findMany({
    where: { householdId: session.householdId, enabled: true },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (!subs.length) return badRequest("有効な通知購読がありません。");

  const payload = buildCompletionPayload({
    choreTitle: "通知テスト",
    userName: user.name,
    memo: "これはテスト通知です",
  });

  let sent = 0;
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
        sent += 1;
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

  return NextResponse.json({ ok: true, sent });
}
