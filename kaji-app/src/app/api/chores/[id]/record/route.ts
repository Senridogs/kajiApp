import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { buildCompletionPayload, canSendPush, sendWebPush } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  isDateKey,
  rebuildScheduleDateKeys,
  resolveCurrentScheduleDateKeys,
  resolveScheduleWindow,
} from "@/lib/schedule-policy";
import { touchHousehold } from "@/lib/sync";
import { addDays, startOfJstDay, toJstDateKey } from "@/lib/time";

type Body = {
  memo?: string;
  performedAt?: string;
  skipped?: boolean;
  sourceDate?: string;
  recalculateFuture?: boolean;
  mergeIfDuplicate?: boolean;
};

type RouteParams = { params: Promise<{ id: string }> };
const SOURCE_DATE_NOT_SCHEDULED = "元の日付は現在の予定に含まれていません。";

function removeOneOccurrence(dateKeys: string[], targetDateKey: string) {
  const next = [...dateKeys];
  const index = next.findIndex((dateKey) => dateKey === targetDateKey);
  if (index >= 0) {
    next.splice(index, 1);
  }
  return next;
}

async function consumeOneOverrideOnDate(
  tx: Prisma.TransactionClient,
  choreId: string,
  dateKey: string,
) {
  const target = await tx.choreScheduleOverride.findFirst({
    where: { choreId, date: dateKey },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!target) return false;
  await tx.choreScheduleOverride.delete({ where: { id: target.id } });
  return true;
}

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
    return badRequest("実施日の形式が不正です。");
  }
  const sourceDate = body?.sourceDate?.trim();
  if (sourceDate && !isDateKey(sourceDate)) {
    return badRequest("元の日付は YYYY-MM-DD 形式で指定してください。");
  }

  const memo = body?.memo?.trim() || null;
  if (memo && memo.length > 500) {
    return badRequest("メモは500文字以内で入力してください。");
  }

  const skipped = body.skipped ?? false;
  const recalculateFuture = body?.recalculateFuture === true;
  const mergeIfDuplicate = body?.mergeIfDuplicate !== false;
  const isFuturePerformedAt = requestedPerformedAt >= tomorrowStart;
  const performedAt = requestedPerformedAt;
  const targetDateKey = toJstDateKey(startOfJstDay(performedAt));

  let record: { id: string; performedAt: Date; memo: string | null };
  try {
    record = await prisma.$transaction(async (tx) => {
      const created = await tx.choreRecord.create({
        data: {
          householdId: session.householdId,
          choreId: chore.id,
          userId: user.id,
          memo,
          performedAt,
          isSkipped: skipped,
        },
      });

      if (sourceDate) {
        const currentOverrides = await tx.choreScheduleOverride.findMany({
          where: { choreId: chore.id },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          select: { date: true },
        });

        if (!recalculateFuture && sourceDate === targetDateKey) {
          await consumeOneOverrideOnDate(tx, chore.id, targetDateKey);
          return created;
        }

        const shouldApplySchedulePolicy = isFuturePerformedAt || currentOverrides.length > 0;
        if (!shouldApplySchedulePolicy) {
          await consumeOneOverrideOnDate(tx, chore.id, targetDateKey);
          return created;
        }

        const dueBase = chore.records[0]?.performedAt ?? chore.createdAt;
        const dueDateKey = toJstDateKey(addDays(dueBase, chore.intervalDays));
        const window = resolveScheduleWindow(sourceDate, targetDateKey);
        const currentDateKeys = resolveCurrentScheduleDateKeys({
          overrideDateKeys: currentOverrides.map((entry) => entry.date),
          dueDateKey,
          intervalDays: chore.intervalDays,
          window,
        });
        if (!currentDateKeys.includes(sourceDate)) {
          throw new Error(SOURCE_DATE_NOT_SCHEDULED);
        }

        const nextDateKeys = rebuildScheduleDateKeys({
          currentDateKeys,
          sourceDateKey: sourceDate,
          targetDateKey,
          recalculateFuture,
          mergeIfDuplicate,
          intervalDays: chore.intervalDays,
          window,
        });
        const remainingDateKeys = removeOneOccurrence(nextDateKeys, targetDateKey);

        await tx.choreScheduleOverride.deleteMany({ where: { choreId: chore.id } });
        if (remainingDateKeys.length > 0) {
          await tx.choreScheduleOverride.createMany({
            data: remainingDateKeys.map((dateKey) => ({ choreId: chore.id, date: dateKey })),
          });
        }
        return created;
      }

      // Backward-compatible fallback: consume only one occurrence on the performed day.
      await consumeOneOverrideOnDate(tx, chore.id, targetDateKey);
      return created;
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === SOURCE_DATE_NOT_SCHEDULED) {
      return badRequest(SOURCE_DATE_NOT_SCHEDULED, 409);
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
