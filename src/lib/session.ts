import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifyToken, type Session } from "./auth";

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  return verifyToken(c.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new Error("unauthorized");
  return s;
}
