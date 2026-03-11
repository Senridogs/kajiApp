/**
 * Cleanup script: removes duplicate ChoreOccurrence rows.
 *
 * For each (choreId, dateKey) group with status="consumed", keeps only
 * max(recordCount, dailyTargetCount) rows and deletes the rest.
 * Also removes excess "pending" rows where pending + consumed > dailyTargetCount.
 *
 * Usage: node scripts/cleanup-duplicate-occurrences.mjs
 * (Set DATABASE_URL env var or edit the default below)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Duplicate ChoreOccurrence Cleanup ===\n");

  // Find all choreId+dateKey combinations with more than expected occurrences
  const groups = await prisma.choreOccurrence.groupBy({
    by: ["choreId", "dateKey"],
    _count: { id: true },
    having: { id: { _count: { gt: 1 } } },
  });

  if (groups.length === 0) {
    console.log("No duplicate occurrence groups found. Nothing to clean up.");
    return;
  }

  console.log(`Found ${groups.length} choreId+dateKey groups with multiple occurrences.\n`);

  // Load chore dailyTargetCount for reference
  const choreIds = [...new Set(groups.map((g) => g.choreId))];
  const chores = await prisma.chore.findMany({
    where: { id: { in: choreIds } },
    select: { id: true, title: true, dailyTargetCount: true },
  });
  const choreMap = new Map(chores.map((c) => [c.id, c]));

  let totalDeleted = 0;

  for (const group of groups) {
    const { choreId, dateKey } = group;
    const chore = choreMap.get(choreId);
    const dailyTarget = chore?.dailyTargetCount ?? 1;

    // Count records for this chore on this date
    const recordCount = await prisma.choreRecord.count({
      where: { choreId, scheduledDate: dateKey },
    });

    // The expected number of consumed occurrences
    const expectedConsumed = Math.max(recordCount, dailyTarget);

    // Get all occurrences for this group, ordered by status (consumed first) then creation time
    const occurrences = await prisma.choreOccurrence.findMany({
      where: { choreId, dateKey },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: { id: true, status: true, sourceType: true },
    });

    const consumed = occurrences.filter((o) => o.status === "consumed");
    const pending = occurrences.filter((o) => o.status === "pending");

    const idsToDelete = [];

    // Remove excess consumed (keep only expectedConsumed)
    if (consumed.length > expectedConsumed) {
      const excessConsumed = consumed.slice(expectedConsumed);
      idsToDelete.push(...excessConsumed.map((o) => o.id));
    }

    // Remove excess pending: total slots should be max(dailyTarget, recordCount)
    // pending slots = expectedTotal - consumed kept
    const consumedKept = Math.min(consumed.length, expectedConsumed);
    const expectedPending = Math.max(0, expectedConsumed - consumedKept);
    if (pending.length > expectedPending) {
      const excessPending = pending.slice(expectedPending);
      idsToDelete.push(...excessPending.map((o) => o.id));
    }

    if (idsToDelete.length > 0) {
      await prisma.choreOccurrence.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      totalDeleted += idsToDelete.length;
      console.log(
        `  [${chore?.title ?? choreId}] ${dateKey}: deleted ${idsToDelete.length} excess occurrences ` +
        `(was ${occurrences.length}, kept ${occurrences.length - idsToDelete.length}, ` +
        `records=${recordCount}, target=${dailyTarget})`
      );
    }
  }

  console.log(`\nDone. Deleted ${totalDeleted} duplicate occurrence(s) total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
