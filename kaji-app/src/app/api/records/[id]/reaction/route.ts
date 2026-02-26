import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { buildReactionPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type Body = {
  emoji?: string;
};

type RouteParams = { params: Promise<{ id: string }> };

const ALLOWED_REACTIONS = new Set(["👏", "❤️", "✨", "🎉"]);

export async function PUT(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const body = await readJsonBody<Body>(request);
  if (!body || typeof body.emoji !== "string") {
    return badRequest("絵文字を指定してください。");
  }
  const emoji = body.emoji.trim();
  if (!ALLOWED_REACTIONS.has(emoji)) {
    return badRequest("絵文字は定義済みリアクションのみ指定できます。");
  }

  const [record, reactor] = await Promise.all([
    prisma.choreRecord.findFirst({
      where: { id, householdId: session.householdId, isInitial: false, isSkipped: false },
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
  if (!reactor) return badRequest("ユーザーが見つかりません。", 404);

  const saved = await prisma.choreRecordReaction.upsert({
    where: {
      recordId_userId: {
        recordId: record.id,
        userId: session.userId,
      },
    },
    create: {
      recordId: record.id,
      userId: session.userId,
      emoji,
    },
    update: {
      emoji,
    },
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  await touchHousehold(session.householdId);

  if (record.user.id !== session.userId && canSendPush()) {
    const subs = await prisma.pushSubscription.findMany({
      where: { householdId: session.householdId, enabled: true, userId: record.user.id },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    if (subs.length > 0) {
      const payload = buildReactionPayload({
        reactorName: reactor.name,
        emoji,
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
    reaction: {
      id: saved.id,
      emoji: saved.emoji,
      userId: saved.userId,
      userName: saved.user.name,
      createdAt: saved.createdAt.toISOString(),
    },
  });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  await prisma.choreRecordReaction.deleteMany({
    where: { recordId: id, userId: session.userId, record: { householdId: session.householdId } },
  });

  await touchHousehold(session.householdId);

  return Response.json({ ok: true });
}
