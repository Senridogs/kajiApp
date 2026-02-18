import { badRequest, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const override = await prisma.choreScheduleOverride.findFirst({
    where: { id, chore: { householdId: session.householdId } },
    select: { id: true },
  });
  if (!override) return badRequest("対象のオーバーライドが見つかりません。", 404);

  await prisma.choreScheduleOverride.delete({ where: { id: override.id } });
  await touchHousehold(session.householdId);

  return Response.json({ ok: true });
}
