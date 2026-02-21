import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, response } = await requireSession();
  if (!session) return response;

  const occurrences = await prisma.choreOccurrence.findMany({
    where: {
      status: "pending",
      chore: { householdId: session.householdId, archived: false },
    },
    orderBy: [{ dateKey: "asc" }, { createdAt: "asc" }],
    select: { id: true, choreId: true, dateKey: true, createdAt: true },
  });

  return Response.json({
    overrides: occurrences.map((occurrence) => ({
      id: occurrence.id,
      choreId: occurrence.choreId,
      date: occurrence.dateKey,
      createdAt: occurrence.createdAt.toISOString(),
    })),
  });
}
