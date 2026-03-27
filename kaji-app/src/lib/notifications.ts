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
    }
  | {
      type: "comment";
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
  chores: Array<{ title: string; icon?: string | null }>;
}): PushPayload {
  const lines = params.chores.slice(0, 5).map((c) => c.title);
  const remaining = params.chores.length - lines.length;
  if (remaining > 0) {
    lines.push(`ほか${remaining}件`);
  }

  return {
    type: "reminder",
    title: `今日 ${params.chores.length}件`,
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
  const lines = [`${params.userName}さんがやってくれたよ`];
  if (params.memo?.trim()) {
    lines.push(params.memo.trim());
  }

  return {
    type: "completion",
    title: params.choreTitle,
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
  return {
    type: "reaction",
    title: `${params.reactorName}がリアクション`,
    body: `${params.choreTitle} にリアクションしました`,
    url: "/",
  };
}

const COMMENT_BODY_TRUNCATE_LENGTH = 80;

export function buildCommentPayload(params: {
  commenterName: string;
  commentBody: string;
  choreTitle: string;
  choreIcon?: string | null;
}): PushPayload {
  const truncatedBody =
    params.commentBody.length > COMMENT_BODY_TRUNCATE_LENGTH
      ? `${params.commentBody.slice(0, COMMENT_BODY_TRUNCATE_LENGTH)}…`
      : params.commentBody;

  return {
    type: "comment",
    title: `${params.commenterName}からコメント`,
    body: `${params.choreTitle}: ${truncatedBody}`,
    url: "/",
  };
}
