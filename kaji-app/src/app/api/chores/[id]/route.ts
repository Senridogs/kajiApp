import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { computeChore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type UpdateChoreBody = {
  title?: string;
  intervalDays?: number;
  dailyTargetCount?: number;
  icon?: string;
  iconColor?: string;
  bgColor?: string;
  defaultAssigneeId?: string | null;
};

type RouteParams = { params: Promise<{ id: string }> };

const DB_SCHEMA_MISSING_CODE = "DB_SCHEMA_MISSING";
const DB_SCHEMA_MISSING_MESSAGE =
  "Database schema is outdated for dailyTargetCount. Run npm run db:init:current-env and restart the app.";

function isChoreSchemaError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
}

function choreSchemaErrorResponse() {
  return NextResponse.json(
    {
      error: DB_SCHEMA_MISSING_MESSAGE,
      code: DB_SCHEMA_MISSING_CODE,
    },
    { status: 500 },
  );
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;
  const body = await readJsonBody<UpdateChoreBody>(request);
  if (!body) return badRequest("Request body is invalid.");

  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return badRequest("Title is required.");
    data.title = title;
  }
  if (typeof body.intervalDays === "number") {
    if (!Number.isInteger(body.intervalDays) || body.intervalDays <= 0 || body.intervalDays > 365) {
      return badRequest("intervalDays must be an integer between 1 and 365.");
    }
    data.intervalDays = body.intervalDays;
  }
  if (typeof body.dailyTargetCount === "number") {
    if (!Number.isInteger(body.dailyTargetCount) || body.dailyTargetCount < 1 || body.dailyTargetCount > 5) {
      return badRequest("dailyTargetCount must be an integer between 1 and 5.");
    }
    data.dailyTargetCount = body.dailyTargetCount;
  }
  if (typeof body.icon === "string") data.icon = body.icon;
  if (typeof body.iconColor === "string") data.iconColor = body.iconColor;
  if (typeof body.bgColor === "string") data.bgColor = body.bgColor;
  if (body.defaultAssigneeId !== undefined) data.defaultAssigneeId = body.defaultAssigneeId || null;
  if (!Object.keys(data).length) return badRequest("No fields to update.");

  let updated;
  try {
    const chore = await prisma.chore.findFirst({
      where: { id, householdId: session.householdId, archived: false },
    });
    if (!chore) return badRequest("Chore not found.", 404);

    updated = await prisma.chore.update({
      where: { id },
      data,
      include: {
        defaultAssignee: { select: { id: true, name: true } },
        records: {
          take: 1,
          orderBy: { performedAt: "desc" },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
  } catch (error: unknown) {
    if (isChoreSchemaError(error) || error instanceof Prisma.PrismaClientInitializationError) {
      return choreSchemaErrorResponse();
    }
    throw error;
  }

  await touchHousehold(session.householdId);

  return NextResponse.json({ chore: computeChore(updated) });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const chore = await prisma.chore.findFirst({
    where: { id, householdId: session.householdId, archived: false },
    select: { id: true },
  });
  if (!chore) return badRequest("Chore not found.", 404);

  await prisma.chore.update({
    where: { id },
    data: { archived: true },
  });

  await touchHousehold(session.householdId);

  return NextResponse.json({ ok: true });
}
