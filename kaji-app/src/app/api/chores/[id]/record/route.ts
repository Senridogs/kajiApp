import { NextResponse } from "next/server";

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
};

type RouteParams = { params: Promise<{ id: string }> };
const SOURCE_DATE_NOT_SCHEDULED = "sourceDate is not currently scheduled.";

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
  if (!chore) return badRequest("Target chore was not found.", 404);
  if (!user) return badRequest("User was not found.", 404);

  const requestedPerformedAt = body?.performedAt ? new Date(body.performedAt) : now;
  if (Number.isNaN(requestedPerformedAt.getTime())) {
    return badRequest("performedAt is invalid.");
  }
  const sourceDate = body?.sourceDate?.trim();
  if (sourceDate && !isDateKey(sourceDate)) {
    return badRequest("sourceDate must be YYYY-MM-DD format.");
  }

  const memo = body?.memo?.trim() || null;
  if (memo && memo.length > 500) {
    return badRequest("memo must be 500 characters or less.");
  }

  const skipped = body.skipped ?? false;
  const recalculateFuture = body?.recalculateFuture === true;
  const isFuturePerformedAt = requestedPerformedAt >= tomorrowStart;
  const performedAt = isFuturePerformedAt ? now : requestedPerformedAt;
  const targetDateKey = toJstDateKey(startOfJstDay(performedAt));
  const shouldApplyFutureSchedulePolicy = isFuturePerformedAt && Boolean(sourceDate);

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

      if (shouldApplyFutureSchedulePolicy && sourceDate) {
        const currentOverrides = await tx.choreScheduleOverride.findMany({
          where: { choreId: chore.id },
          orderBy: [{ date: "asc" }, { createdAt: "asc" }],
          select: { date: true },
        });
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
          intervalDays: chore.intervalDays,
          window,
        });
        const remainingDateKeys = nextDateKeys.filter((dateKey) => dateKey !== targetDateKey);
        await tx.choreScheduleOverride.deleteMany({ where: { choreId: chore.id } });
        if (remainingDateKeys.length > 0) {
          await tx.choreScheduleOverride.createMany({
            data: remainingDateKeys.map((dateKey) => ({ choreId: chore.id, date: dateKey })),
          });
        }
        return created;
      }

      // A completion/skipped record finalizes the current schedule.
      // Any 1-shot date overrides can be discarded afterwards.
      await tx.choreScheduleOverride.deleteMany({
        where: { choreId: chore.id },
      });
      return created;
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === SOURCE_DATE_NOT_SCHEDULED) {
      return badRequest(SOURCE_DATE_NOT_SCHEDULED, 409);
    }
    throw error;
  }

  // Notify other devices about the change
  await touchHousehold(session.householdId);

  // Skip notification if skipped
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
