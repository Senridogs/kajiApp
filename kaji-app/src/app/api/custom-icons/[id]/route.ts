import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { touchHousehold } from "@/lib/sync";

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const icon = await prisma.customIcon.findFirst({
        where: { id, householdId: session.householdId },
    });

    if (!icon) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.customIcon.delete({ where: { id } });
    await touchHousehold(session.householdId);

    return NextResponse.json({ ok: true });
}
