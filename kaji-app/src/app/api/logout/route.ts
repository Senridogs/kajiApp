import { clearSession } from "@/lib/session";
import { NextResponse } from "next/server";

export async function POST() {
  await clearSession();
  return NextResponse.json({ success: true });
}
