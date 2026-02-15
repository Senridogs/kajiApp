import { NextResponse } from "next/server";

import { badRequest, readJsonBody, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type AssignmentBody = {
    choreId: string;
    userId: string | null;
    date: string;
};

export async function POST(request: Request) {
    const { session, response } = await requireSession();
    if (!session) return response;

    const body = await readJsonBody<AssignmentBody>(request);
    if (!body) return badRequest("リクエスト形式が不正です。");
    if (!body.choreId || !body.date) return badRequest("choreId and date are required.");

    const chore = await prisma.chore.findFirst({
        where: { id: body.choreId, householdId: session.householdId, archived: false },
        select: { id: true },
    });
    if (!chore) return badRequest("家事が見つかりません。", 404);

    if (!body.userId) {
        await prisma.choreAssignment.deleteMany({
            where: { choreId: body.choreId, date: body.date },
        });
        return NextResponse.json({ ok: true, deleted: true });
    }

    const user = await prisma.user.findFirst({
        where: { id: body.userId, householdId: session.householdId },
        select: { id: true, name: true },
    });
    if (!user) return badRequest("ユーザーが見つかりません。", 404);

    const assignment = await prisma.choreAssignment.upsert({
        where: { choreId_date: { choreId: body.choreId, date: body.date } },
        create: {
            choreId: body.choreId,
            userId: body.userId,
            date: body.date,
        },
        update: {
            userId: body.userId,
        },
        include: { user: { select: { id: true, name: true } } },
    });

    return NextResponse.json({
        ok: true,
        assignment: {
            choreId: assignment.choreId,
            userId: assignment.userId,
            userName: assignment.user.name,
            date: assignment.date,
        },
    });
}
