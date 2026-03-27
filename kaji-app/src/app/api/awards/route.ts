import { NextRequest, NextResponse } from "next/server";

import { badRequest, requireSession } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import type { AwardItem } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { session, response } = await requireSession();
  if (response) return response;

  const { householdId } = session!;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const yearParam = url.searchParams.get("year");
  const monthParam = url.searchParams.get("month");

  // Validate params
  if (type && type !== "monthly" && type !== "yearly") {
    return badRequest("typeは 'monthly' または 'yearly' を指定してください。");
  }
  if (yearParam && !/^\d{4}$/.test(yearParam)) {
    return badRequest("yearは4桁の数値を指定してください。");
  }
  if (monthParam && (!/^\d{1,2}$/.test(monthParam) || Number(monthParam) < 1 || Number(monthParam) > 12)) {
    return badRequest("monthは1-12の数値を指定してください。");
  }

  try {
    const where: {
      householdId: string;
      type?: string;
      year?: number;
      month?: number;
    } = { householdId };

    if (type) {
      where.type = type;
    }
    if (yearParam) {
      where.year = Number(yearParam);
    }
    if (monthParam) {
      where.month = Number(monthParam);
    }

    const awards = await prisma.award.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, color: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items: ReadonlyArray<AwardItem & { user: { id: string; name: string; color: string | null } }> =
      awards.map((a) => ({
        id: a.id,
        userId: a.userId,
        type: a.type,
        awardKey: a.awardKey,
        title: a.title,
        emoji: a.emoji,
        description: a.description,
        month: a.month,
        year: a.year,
        metadata: a.metadata as Record<string, unknown> | null,
        createdAt: a.createdAt.toISOString(),
        user: {
          id: a.user.id,
          name: a.user.name,
          color: a.user.color,
        },
      }));

    return NextResponse.json({ awards: items });
  } catch (error: unknown) {
    console.error("[api/awards] failed", error instanceof Error ? error.message : String(error));
    return badRequest("アワードの取得に失敗しました。", 500);
  }
}
