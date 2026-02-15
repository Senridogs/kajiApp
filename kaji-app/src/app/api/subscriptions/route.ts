import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type SubscriptionBody = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<SubscriptionBody>(request);
  if (!body) return badRequest("リクエスト形式が不正です。");
  const endpoint = body?.endpoint?.trim();
  const p256dh = body?.keys?.p256dh?.trim();
  const auth = body?.keys?.auth?.trim();

  if (!endpoint || !p256dh || !auth) {
    return badRequest("Push購読情報が不足しています。");
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      userId: session.userId,
      householdId: session.householdId,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent"),
      enabled: true,
    },
    create: {
      endpoint,
      p256dh,
      auth,
      userId: session.userId,
      householdId: session.householdId,
      userAgent: request.headers.get("user-agent"),
      enabled: true,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const body = await readJsonBody<{ endpoint?: string }>(request);
  if (!body) return badRequest("リクエスト形式が不正です。");
  const endpoint = body?.endpoint?.trim();
  if (!endpoint) return badRequest("endpoint が必要です。");

  await prisma.pushSubscription.updateMany({
    where: {
      endpoint,
      householdId: session.householdId,
    },
    data: { enabled: false },
  });

  return NextResponse.json({ ok: true });
}
