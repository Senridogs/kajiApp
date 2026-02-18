import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const overrides = await prisma.choreScheduleOverride.findMany({
    where: { chore: { householdId: session.householdId, archived: false } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: { id: true, choreId: true, date: true, createdAt: true },
  });

  return Response.json({
    overrides: overrides.map((override) => ({
      id: override.id,
      choreId: override.choreId,
      date: override.date,
      createdAt: override.createdAt.toISOString(),
    })),
  });
}
