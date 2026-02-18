import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type Body = {
  choreId?: string;
  date?: string;
  sourceRecordId?: string;
};

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  const { session, response } = await requireSession();
  if (!session) return response;

  const body = await readJsonBody<Body>(request);
  const choreId = body?.choreId?.trim();
  const date = body?.date?.trim();
  const sourceRecordId = body?.sourceRecordId?.trim();
  if (!choreId || !date) return badRequest("choreId と date が必要です。");
  if (!isDateKey(date)) return badRequest("date は YYYY-MM-DD 形式で指定してください。");

  const chore = await prisma.chore.findFirst({
    where: { id: choreId, householdId: session.householdId, archived: false },
    select: { id: true },
  });
  if (!chore) return badRequest("対象の家事が見つかりません。", 404);

  if (sourceRecordId) {
    // Move mode: update the completion record's date and clear any schedule overrides.
    const record = await prisma.choreRecord.findFirst({
      where: { id: sourceRecordId, householdId: session.householdId },
      select: { id: true, performedAt: true },
    });
    if (!record) return badRequest("対象の記録が見つかりません。", 404);

    // Preserve the original time-of-day; only change the date portion.
    const original = record.performedAt;
    const targetMidnightJst = new Date(`${date}T00:00:00+09:00`);
    const jstOffsetMs = 9 * 60 * 60 * 1000;
    const originalJst = new Date(original.getTime() + jstOffsetMs);
    const newPerformedAt = new Date(
      targetMidnightJst.getTime() +
      (originalJst.getUTCHours() * 60 + originalJst.getUTCMinutes()) * 60 * 1000 +
      originalJst.getUTCSeconds() * 1000,
    );

    await prisma.$transaction(async (tx) => {
      await tx.choreRecord.update({
        where: { id: sourceRecordId },
        data: { performedAt: newPerformedAt },
      });
      await tx.choreScheduleOverride.deleteMany({ where: { choreId } });
    });

    await touchHousehold(session.householdId);
    return Response.json({ moved: true, choreId, date });
  }

  // Schedule mode: create a schedule override (replaces any existing one).
  const override = await prisma.$transaction(async (tx) => {
    await tx.choreScheduleOverride.deleteMany({ where: { choreId } });
    return tx.choreScheduleOverride.create({ data: { choreId, date } });
  });

  await touchHousehold(session.householdId);

  return Response.json({
    override: {
      id: override.id,
      choreId: override.choreId,
      date: override.date,
      createdAt: override.createdAt.toISOString(),
    },
  });
}
