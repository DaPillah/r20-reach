// Edge-safe session helpers (jose only — usable in middleware and server).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "r20_session";

export type Session = { sub: string; org: string; name: string; role: string };

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ org: s.org, name: s.name, role: s.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function verifyToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      sub: String(payload.sub ?? ""),
      org: String(payload.org ?? ""),
      name: String(payload.name ?? ""),
      role: String(payload.role ?? "leader"),
    };
  } catch {
    return null;
  }
}
