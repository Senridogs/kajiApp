import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

export function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    return {
      session: null,
      response: badRequest("セッションがありません。先にユーザー登録をしてください。", 401),
    };
  }
  return { session, response: null as NextResponse | null };
}

export function parseJsonBody<T = unknown>(input: unknown): T | null {
  if (!input || typeof input !== "object") return null;
  return input as T;
}
