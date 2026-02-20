import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { touchHousehold } from "@/lib/sync";

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "認証情報がありません。" }, { status: 401 });
    }

    const icons = await prisma.customIcon.findMany({
        where: { householdId: session.householdId },
        orderBy: { createdAt: "asc" },
        select: { id: true, label: true, icon: true, iconColor: true, bgColor: true },
    });

    return NextResponse.json({ icons });
}

export async function POST(request: Request) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "認証情報がありません。" }, { status: 401 });
    }

    const body = (await request.json()) as {
        label?: string;
        icon?: string;
        iconColor?: string;
        bgColor?: string;
    };

    if (!body.label || !body.icon || !body.iconColor || !body.bgColor) {
        return NextResponse.json({ error: "必須項目が不足しています。" }, { status: 400 });
    }

    const created = await prisma.customIcon.create({
        data: {
            householdId: session.householdId,
            label: body.label,
            icon: body.icon,
            iconColor: body.iconColor,
            bgColor: body.bgColor,
        },
        select: { id: true, label: true, icon: true, iconColor: true, bgColor: true },
    });

    await touchHousehold(session.householdId);

    return NextResponse.json({ icon: created }, { status: 201 });
}
