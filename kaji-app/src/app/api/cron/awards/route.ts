import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { generateMonthlyAwards, generateYearlyAwards } from "@/lib/awards";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isAuthorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = request.headers.get("authorization");
  const bearer = auth?.replace(/^Bearer\s+/i, "").trim();
  const url = new URL(request.url);
  const secretQuery = url.searchParams.get("secret")?.trim();

  if (bearer && safeCompare(bearer, expected)) return true;
  if (process.env.NODE_ENV !== "production" && secretQuery && safeCompare(secretQuery, expected)) {
    return true;
  }
  return false;
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Get the previous month in JST. Returns { year, month } where month is 1-based. */
function getPreviousJstMonth(now: Date): { year: number; month: number } {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const year = jst.getUTCFullYear();
  const month = jst.getUTCMonth() + 1; // 1-based
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

/** Check if it's January in JST (yearly awards should be generated for the previous year). */
function isJanuaryJst(now: Date): boolean {
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  return jst.getUTCMonth() === 0; // January = 0
}

async function handleAwardGeneration(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "認証エラーです。" }, { status: 401 });
  }

  try {
    const now = new Date();
    const { year: prevYear, month: prevMonth } = getPreviousJstMonth(now);
    const isJanuary = isJanuaryJst(now);

    // Fetch all households that have at least one record
    const households = await prisma.household.findMany({
      select: { id: true },
    });

    let monthlyCreated = 0;
    let yearlyCreated = 0;
    const errors: Array<{ householdId: string; error: string }> = [];

    for (const household of households) {
      try {
        // Generate monthly awards for previous month
        const monthlyAwards = await generateMonthlyAwards(household.id, prevYear, prevMonth);
        monthlyCreated += monthlyAwards.length;

        // Generate yearly awards on January (for the previous year)
        if (isJanuary) {
          const yearlyAwards = await generateYearlyAwards(household.id, prevYear);
          yearlyCreated += yearlyAwards.length;
        }
      } catch (error: unknown) {
        errors.push({
          householdId: household.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return NextResponse.json({
      ok: true,
      households: households.length,
      monthlyCreated,
      yearlyCreated,
      period: { year: prevYear, month: prevMonth },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    console.error("[api/cron/awards] failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "アワード生成に失敗しました。" }, { status: 500 });
  }
}

/** Vercel Cron sends GET requests */
export async function GET(request: Request) {
  return handleAwardGeneration(request);
}

/** Manual triggering via POST */
export async function POST(request: Request) {
  return handleAwardGeneration(request);
}
