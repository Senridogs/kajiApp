import webpush from "web-push";

import { formatJst } from "@/lib/time";

type PushPayload =
  | {
      type: "reminder";
      title: string;
      body: string;
      url?: string;
    }
  | {
      type: "completion";
      title: string;
      body: string;
      url?: string;
    };

let isConfigured = false;

function ensureConfigured() {
  if (isConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  isConfigured = true;
  return true;
}

export function canSendPush() {
  return ensureConfigured();
}

export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
) {
  if (!ensureConfigured()) return;

  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    },
    JSON.stringify(payload),
  );
}

export function buildReminderPayload(params: {
  chores: Array<{ title: string; dueAt: Date | null }>;
}): PushPayload {
  const top = params.chores.slice(0, 2);
  const body = top
    .map((c) => `${c.title}${c.dueAt ? `・期限 ${formatJst(c.dueAt)}` : ""}`)
    .join(" / ");
  const suffix = params.chores.length > 2 ? ` ほか${params.chores.length - 2}件` : "";
  return {
    type: "reminder",
    title: "家事リマインド",
    body: `${body}${suffix}`,
    url: "/",
  };
}

export function buildCompletionPayload(params: {
  choreTitle: string;
  userName: string;
  memo?: string | null;
}): PushPayload {
  const memoPart = params.memo?.trim() ? ` メモ: ${params.memo.trim()}` : "";
  return {
    type: "completion",
    title: `完了: ${params.choreTitle}`,
    body: `${params.userName} が完了しました。${memoPart}`.trim(),
    url: "/",
  };
}
