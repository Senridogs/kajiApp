import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { buildCompletionPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { isDateKey } from "@/lib/schedule-policy";
import { touchHousehold } from "@/lib/sync";
import {
  OCCURRENCE_SOURCE_OVERRIDE,
  consumePendingOccurrences,
  ensureOccurrenceBackfill,
} from "@/lib/chore-occurrence";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

type Body = {
  memo?: string;
  performedAt?: string;
  skipped?: boolean;
  skipCount?: number;
  sourceDate?: string;
  scheduledDate?: string;
  recalculateFuture?: boolean;
  mergeIfDuplicate?: boolean;
};

type RouteParams = { params: Promise<{ id: string }> };

const SOURCE_DATE_NOT_SCHEDULED = "Source date is not part of the current schedule.";
const SKIP_COUNT_REQUIRES_SOURCE_DATE = "skipCount requires sourceDate.";
const SKIP_COUNT_ONLY_FOR_SKIP = "skipCount can be used only when skipped=true.";
const SKIP_COUNT_INVALID = "skipCount must be an integer greater than or equal to 1.";
const SKIP_COUNT_OUT_OF_RANGE = "skipCount exceeds pending occurrences on sourceDate.";
const SOURCE_DATE_REQUIRES_SCHEDULED_DATE = "scheduledDate is required when sourceDate is provided.";

export async function POST(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;
  const body = (await readJsonBody<Body>(request)) ?? {};

  const now = new Date();
  const todayStart = startOfJstDay(now);
  const tomorrowStart = addDays(todayStart, 1);

  const [chore, user] = await Promise.all([
    prisma.chore.findFirst({
      where: { id, householdId: session.householdId, archived: false },
      select: {
        id: true,
        title: true,
        icon: true,
        intervalDays: true,
        dailyTargetCount: true,
        createdAt: true,
        records: {
          where: { performedAt: { lt: tomorrowStart } },
          take: 1,
          orderBy: { performedAt: "desc" },
          select: { performedAt: true },
        },
      },
    }),
    prisma.user.findUnique({ where: { id: session.userId } }),
  ]);
  if (!chore) return badRequest("対象の家事が見つかりません。", 404);
  if (!user) return badRequest("ユーザーが見つかりません。", 404);

  const requestedPerformedAt = body?.performedAt ? new Date(body.performedAt) : now;
  if (Number.isNaN(requestedPerformedAt.getTime())) {
    return badRequest("実施日時の形式が不正です。");
  }

  const sourceDate = body?.sourceDate?.trim();
  if (sourceDate && !isDateKey(sourceDate)) {
    return badRequest("sourceDate must be in YYYY-MM-DD format.");
  }

  const scheduledDate = body?.scheduledDate?.trim();
  if (scheduledDate && !isDateKey(scheduledDate)) {
    return badRequest("scheduledDate must be in YYYY-MM-DD format.");
  }
  if (sourceDate && !scheduledDate) {
    return badRequest(SOURCE_DATE_REQUIRES_SCHEDULED_DATE);
  }

  const memo = body?.memo?.trim() || null;
  if (memo && memo.length > 500) {
    return badRequest("メモは500文字以内で入力してください。");
  }

  const skipped = body.skipped ?? false;
  const mergeIfDuplicate = body?.mergeIfDuplicate !== false;
  const requestedSkipCount = body?.skipCount === undefined ? 1 : Number(body.skipCount);
  if (body?.skipCount !== undefined && !skipped) {
    return badRequest(SKIP_COUNT_ONLY_FOR_SKIP);
  }
  if (body?.skipCount !== undefined) {
    if (!Number.isInteger(requestedSkipCount) || requestedSkipCount < 1) {
      return badRequest(SKIP_COUNT_INVALID);
    }
  }
  if (!sourceDate && skipped && requestedSkipCount !== 1) {
    return badRequest(SKIP_COUNT_REQUIRES_SOURCE_DATE);
  }

  const consumeCount = skipped ? requestedSkipCount : 1;
  const performedAt = requestedPerformedAt;
  const targetDateKey = scheduledDate ?? toJstDateKey(startOfJstDay(performedAt));

  let record: { id: string; performedAt: Date; memo: string | null };
  try {
    record = await prisma.$transaction(async (tx) => {
      if (sourceDate) {
        await ensureOccurrenceBackfill(tx, chore.id);
        const sourcePendingCount = await tx.choreOccurrence.count({
          where: { choreId: chore.id, dateKey: sourceDate, status: "pending" },
        });
        if (sourcePendingCount === 0) {
          throw new Error(SOURCE_DATE_NOT_SCHEDULED);
        }
        if (consumeCount > sourcePendingCount) {
          throw new Error(SKIP_COUNT_OUT_OF_RANGE);
        }
      }

      const createdRecords: Array<{ id: string; performedAt: Date; memo: string | null }> = [];
      for (let i = 0; i < consumeCount; i += 1) {
        const created = await tx.choreRecord.create({
          data: {
            householdId: session.householdId,
            choreId: chore.id,
            userId: user.id,
            memo,
            scheduledDate: targetDateKey,
            performedAt: new Date(performedAt.getTime() + i),
            isSkipped: skipped,
          },
        });
        createdRecords.push({
          id: created.id,
          performedAt: created.performedAt,
          memo: created.memo,
        });
      }
      const latestCreated = createdRecords[createdRecords.length - 1]!;

      if (sourceDate) {
        const consumed = await consumePendingOccurrences(tx, chore.id, sourceDate, consumeCount);
        if (consumed < consumeCount) {
          throw new Error(SKIP_COUNT_OUT_OF_RANGE);
        }

        if (sourceDate !== targetDateKey && !mergeIfDuplicate) {
          await tx.choreOccurrence.createMany({
            data: Array.from({ length: consumeCount }).map(() => ({
              choreId: chore.id,
              dateKey: targetDateKey,
              status: "pending",
              sourceType: OCCURRENCE_SOURCE_OVERRIDE,
            })),
          });
        }
        return latestCreated;
      }

      await ensureOccurrenceBackfill(tx, chore.id);
      await consumePendingOccurrences(tx, chore.id, targetDateKey, 1);
      return latestCreated;
    });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === SOURCE_DATE_NOT_SCHEDULED) {
        return badRequest(SOURCE_DATE_NOT_SCHEDULED, 409);
      }
      if (error.message === SKIP_COUNT_OUT_OF_RANGE) {
        return badRequest(SKIP_COUNT_OUT_OF_RANGE, 400);
      }
    }
    throw error;
  }

  await touchHousehold(session.householdId);

  if (!skipped && canSendPush()) {
    const [household, subs] = await Promise.all([
      prisma.household.findUnique({
        where: { id: session.householdId },
        select: { notifyCompletion: true },
      }),
      prisma.pushSubscription.findMany({
        where: { householdId: session.householdId, enabled: true, userId: { not: session.userId } },
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
