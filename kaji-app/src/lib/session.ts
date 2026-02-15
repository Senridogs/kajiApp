import { cookies } from "next/headers";

export const SESSION_USER_COOKIE = "kaji_user_id";
export const SESSION_HOUSEHOLD_COOKIE = "kaji_household_id";

export type Session = {
  userId: string;
  householdId: string;
};

type SetSessionOptions = {
  secure?: boolean;
};

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const userId = store.get(SESSION_USER_COOKIE)?.value;
  const householdId = store.get(SESSION_HOUSEHOLD_COOKIE)?.value;
  if (!userId || !householdId) {
    return null;
  }
  return { userId, householdId };
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_USER_COOKIE);
  store.delete(SESSION_HOUSEHOLD_COOKIE);
}

export async function setSession(session: Session, options?: SetSessionOptions) {
  const store = await cookies();
  const baseCookie = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options?.secure ?? process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  };
  store.set(SESSION_USER_COOKIE, session.userId, baseCookie);
  store.set(SESSION_HOUSEHOLD_COOKIE, session.householdId, baseCookie);
}
