import webpush from "web-push";

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
    }
  | {
      type: "reaction";
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

const ICON_EMOJI_MAP: Record<string, string> = {
  toilet: "🚽",
  bath: "🛁",
  showerHead: "🛁",
  "shower-head": "🛁",
  dishwasher: "🍽",
  utensils: "🍽",
  "utensils-crossed": "🍽",
  broom: "🧹",
  mop: "🧹",
  "washing-machine": "👕",
  shirt: "👕",
  trash2: "🗑️",
  "trash-2": "🗑️",
  recycle: "♻️",
  droplets: "💧",
  cookingPot: "🍳",
  "cooking-pot": "🍳",
};

function toKebabCase(value: string) {
  return value
    .replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
    .replace(/^[-]+/, "")
    .toLowerCase();
}

function iconToEmoji(iconName?: string | null) {
  if (!iconName) return "✅";
  const normalized = toKebabCase(iconName);
  return (
    ICON_EMOJI_MAP[iconName] ??
    ICON_EMOJI_MAP[normalized] ??
    ICON_EMOJI_MAP[normalized.replace(/-/g, "")] ??
    "✅"
  );
}

export function buildReminderPayload(params: {
  chores: Array<{ title: string; icon?: string | null }>;
}): PushPayload {
  const lines = params.chores.slice(0, 5).map((c) => `${iconToEmoji(c.icon)} ${c.title}`);
  const remaining = params.chores.length - lines.length;
  if (remaining > 0) {
    lines.push(`ほか${remaining}件`);
  }
  return {
    type: "reminder",
    title: `きょうのにんむ（${params.chores.length}件）`,
    body: lines.join("\n"),
    url: "/",
  };
}

export function buildCompletionPayload(params: {
  choreTitle: string;
  choreIcon?: string | null;
  userName: string;
  memo?: string | null;
}): PushPayload {
  const lines = [`${params.userName}さんがやってくれたよ！`];
  if (params.memo?.trim()) {
    lines.push(params.memo.trim());
  }
  return {
    type: "completion",
    title: `${iconToEmoji(params.choreIcon)} ${params.choreTitle}`,
    body: lines.join("\n"),
    url: "/",
  };
}

export function buildReactionPayload(params: {
  reactorName: string;
  emoji: string;
  choreTitle: string;
  choreIcon?: string | null;
}): PushPayload {
  const iconEmoji = iconToEmoji(params.choreIcon);
  return {
    type: "reaction",
    title: `${params.emoji} ${params.reactorName}がリアクション`,
    body: `${iconEmoji} ${params.choreTitle} に${params.emoji}を送りました`,
    url: "/",
  };
}
