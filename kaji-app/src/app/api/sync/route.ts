import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

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

  try {
    const tableCheck = (await prisma.$queryRawUnsafe(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'Household') AS exists",
    )) as Array<{ exists: boolean }>;
    const householdTableExists = Boolean(tableCheck[0]?.exists);
    if (!householdTableExists) {
      return NextResponse.json({ token: null, code: "DB_SCHEMA_MISSING" });
    }

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
  } catch (error: unknown) {
    // /api/sync is polled frequently. When DB is not initialized yet, keep it quiet.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return NextResponse.json({ token: null, code: "DB_SCHEMA_MISSING" });
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ token: null, code: "DB_CONNECTION_FAILED" });
    }

    console.error("[api/sync] failed", error);
    return NextResponse.json({ token: null }, { status: 500 });
  }
}
