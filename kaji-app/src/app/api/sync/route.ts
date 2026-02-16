import { NextResponse } from "next/server";

import { requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/sync
 *
 * Returns a lightweight sync token (the household's `updatedAt` timestamp)
 * so that clients can poll cheaply and detect when another device has
 * made changes (task completion, undo, assignment edits, chore CRUD, etc.).
 */
export async function GET() {
    const { session, response } = await requireSession();
    if (!session) return response;

    const household = await prisma.household.findUnique({
        where: { id: session.householdId },
        select: { updatedAt: true },
    });

    if (!household) {
        return NextResponse.json({ token: null });
    }

    return NextResponse.json({
        token: household.updatedAt.toISOString(),
    });
}
