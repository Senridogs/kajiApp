import { prisma } from "@/lib/prisma";

/**
 * Bump the household's `updatedAt` timestamp so that other clients
 * polling `/api/sync` will detect the change and refresh their data.
 */
export async function touchHousehold(householdId: string) {
    await prisma.household.update({
        where: { id: householdId },
        data: { updatedAt: new Date() },
    });
}
