import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { buildCommentPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type RouteParams = { params: Promise<{ id: string }> };

const MAX_BODY_LENGTH = 500;

// POST — コメント追加
export async function POST(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const body = await readJsonBody<{ body?: string }>(request);
  if (!body || typeof body.body !== "string") {
    return badRequest("コメント本文を指定してください。");
  }

  const text = body.body.trim();
  if (text.length === 0) {
    return badRequest("コメント本文を指定してください。");
  }
  if (text.length > MAX_BODY_LENGTH) {
    return badRequest(`コメントは${MAX_BODY_LENGTH}文字以内で入力してください。`);
  }

  const [record, commenter] = await Promise.all([
    prisma.choreRecord.findFirst({
      where: { id, householdId: session.householdId },
      include: {
        chore: { select: { title: true, icon: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true },
    }),
  ]);

  if (!record) return badRequest("対象の記録が見つかりません。", 404);
  if (!commenter) return badRequest("ユーザーが見つかりません。", 404);

  const saved = await prisma.choreRecordComment.create({
    data: {
      recordId: record.id,
      userId: session.userId,
      body: text,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  await touchHousehold(session.householdId);

  // Push通知: 記録の実行者が自分以外の場合のみ送信
  if (record.user.id !== session.userId && canSendPush()) {
    const subs = await prisma.pushSubscription.findMany({
      where: { householdId: session.householdId, enabled: true, userId: record.user.id },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subs.length > 0) {
      const payload = buildCommentPayload({
        commenterName: commenter.name,
        commentBody: text,
        choreTitle: record.chore.title,
        choreIcon: record.chore.icon,
      });

      await Promise.all(
        subs.map(async (sub) => {
          try {
            await sendWebPush(
              {
                endpoint: sub.endpoint,
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
              payload,
            );
          } catch (error: unknown) {
            const statusCode = (error as { statusCode?: number })?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await prisma.pushSubscription.update({
                where: { id: sub.id },
                data: { enabled: false },
              });
            }
          }
        }),
      );
    }
  }

  return Response.json({
    comment: {
      id: saved.id,
      recordId: saved.recordId,
      userId: saved.userId,
      userName: saved.user.name,
      body: saved.body,
      createdAt: saved.createdAt.toISOString(),
    },
  });
}

// GET — コメント一覧取得
export async function GET(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const record = await prisma.choreRecord.findFirst({
    where: { id, householdId: session.householdId },
    select: { id: true },
  });

  if (!record) return badRequest("対象の記録が見つかりません。", 404);

  const comments = await prisma.choreRecordComment.findMany({
    where: { recordId: record.id },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, color: true } },
    },
  });

  return Response.json({
    comments: comments.map((c) => ({
      id: c.id,
      recordId: c.recordId,
      userId: c.userId,
      userName: c.user.name,
      userColor: c.user.color,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

// DELETE — コメント削除（自分のコメントのみ）
export async function DELETE(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const body = await readJsonBody<{ commentId?: string }>(request);
  if (!body || typeof body.commentId !== "string") {
    return badRequest("commentIdを指定してください。");
  }

  const comment = await prisma.choreRecordComment.findFirst({
    where: {
      id: body.commentId,
      recordId: id,
      record: { householdId: session.householdId },
    },
  });

  if (!comment) return badRequest("対象のコメントが見つかりません。", 404);

  if (comment.userId !== session.userId) {
    return badRequest("自分のコメントのみ削除できます。", 403);
  }

  await prisma.choreRecordComment.delete({
    where: { id: comment.id },
  });

  await touchHousehold(session.householdId);

  return Response.json({ ok: true });
}
