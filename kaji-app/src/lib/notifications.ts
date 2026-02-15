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
  chores: Array<{ title: string; isOverdue: boolean; overdueDays: number }>;
}): PushPayload {
  const lines = params.chores.slice(0, 5).map((c) => {
    if (c.isOverdue) {
      return `${c.title}（${c.overdueDays}日超過）`;
    }
    return `${c.title}（今日）`;
  });
  const remaining = params.chores.length - lines.length;
  if (remaining > 0) {
    lines.push(`ほか${remaining}件`);
  }
  return {
    type: "reminder",
    title: `家事リマインド（${params.chores.length}件）`,
    body: lines.join("\n"),
    url: "/",
  };
}

export function buildCompletionPayload(params: {
  choreTitle: string;
  userName: string;
  memo?: string | null;
}): PushPayload {
  const lines = [`${params.userName} が ${params.choreTitle} を完了しました`];
  if (params.memo?.trim()) {
    lines.push(params.memo.trim());
  }
  return {
    type: "completion",
    title: lines[0],
    body: lines.slice(1).join("\n"),
    url: "/",
  };
}
