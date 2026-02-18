import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type Body = {
  choreId?: string;
  date?: string;
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
  if (!choreId || !date) return badRequest("choreId と date が必要です。");
  if (!isDateKey(date)) return badRequest("date は YYYY-MM-DD 形式で指定してください。");

  const chore = await prisma.chore.findFirst({
    where: { id: choreId, householdId: session.householdId, archived: false },
    select: { id: true },
  });
  if (!chore) return badRequest("対象の家事が見つかりません。", 404);

  const override = await prisma.$transaction(async (tx) => {
    await tx.choreScheduleOverride.deleteMany({
      where: { choreId },
    });

    return tx.choreScheduleOverride.create({
      data: { choreId, date },
    });
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
