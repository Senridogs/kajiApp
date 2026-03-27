import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { computeChore } from "@/lib/dashboard";
import { prisma } from "@/lib/prisma";
import { touchHousehold } from "@/lib/sync";

type UpdateChoreBody = {
  title?: string;
  intervalDays?: number;
  icon?: string;
  iconColor?: string;
  bgColor?: string;
};

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { session, response } = await requireSession();
  if (!session) return response;
  const { id } = await params;

  const now = new Date();

  const [chore, users] = await Promise.all([
    prisma.chore.findFirst({
      where: { id, householdId: session.householdId, archived: false },
      include: {
        records: {
          take: 1,
          orderBy: { performedAt: "desc" },
          select: {
            id: true,
            performedAt: true,
            isInitial: true,
            isSkipped: true,
            userId: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { householdId: session.householdId },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!chore) return badRequest("Chore not found.", 404);

  const latestRecord = chore.records[0] ?? null;
  const computed = computeChore(chore, latestRecord, users, now);

  return NextResponse.json({ chore: computed });
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
  if (typeof body.icon === "string") data.icon = body.icon;
  if (typeof body.iconColor === "string") data.iconColor = body.iconColor;
  if (typeof body.bgColor === "string") data.bgColor = body.bgColor;
  if (!Object.keys(data).length) return badRequest("No fields to update.");

  const existing = await prisma.chore.findFirst({
    where: { id, householdId: session.householdId, archived: false },
    select: { id: true },
  });
  if (!existing) return badRequest("Chore not found.", 404);

  const now = new Date();

  const updated = await prisma.chore.update({
    where: { id },
    data,
    include: {
      records: {
        take: 1,
        orderBy: { performedAt: "desc" },
        select: {
          id: true,
          performedAt: true,
          isInitial: true,
          isSkipped: true,
          userId: true,
        },
      },
    },
  });

  await touchHousehold(session.householdId);

  const users = await prisma.user.findMany({
    where: { householdId: session.householdId },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  const latestRecord = updated.records[0] ?? null;
  return NextResponse.json({ chore: computeChore(updated, latestRecord, users, now) });
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
