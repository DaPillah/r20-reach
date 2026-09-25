"use server";

import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { q } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { SESSION_COOKIE, signSession } from "@/lib/auth";
import type { LeaderRow } from "@/lib/types";

export async function loginAction(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const rows = await q<{
    id: string;
    org_id: string;
    full_name: string | null;
    role: string;
    password_hash: string | null;
  }>(
    `select id, org_id, full_name, role, password_hash
     from membership where lower(email)=lower($1) and deactivated_at is null limit 1`,
    [email.trim()],
  );
  const m = rows[0];
  if (!m || !m.password_hash) return { ok: false, error: "Invalid email or password." };

  const ok = await bcrypt.compare(password, m.password_hash);
  if (!ok) return { ok: false, error: "Invalid email or password." };

  // First/most-recent login — clears this account from the "Logins to hand out" nudge.
  await q(`update membership set last_login_at=now() where id=$1`, [m.id]);

  const token = await signSession({
    sub: m.id,
    org: m.org_id,
    name: m.full_name ?? "",
    role: m.role,
  });
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

export async function setMyPasswordAction(
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (!newPassword || newPassword.length < 8)
    return { ok: false, error: "Password must be at least 8 characters." };
  const hash = await bcrypt.hash(newPassword, 10);
  await q(`update membership set password_hash=$2 where id=$1`, [s.sub, hash]);
  return { ok: true };
}

export async function listLeadersAction(): Promise<LeaderRow[]> {
  const s = await requireSession();
  if (s.role !== "admin") return [];
  const rows = await q(
    `select id, full_name, email, role, deactivated_at from membership where org_id=$1
      order by (deactivated_at is not null), role, full_name`,
    [s.org],
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: (r.full_name as string) ?? "—",
    email: (r.email as string) ?? null,
    role: r.role as string,
    deactivatedAt: r.deactivated_at ? String(r.deactivated_at) : null,
  }));
}

// Retire a leader login (or bring one back). Deactivating gates their login and
// drops them off every leader list / reflection nag; the row + history stay, so
// it's fully reversible. Admin-only; you can't deactivate your own account.
// Reassign any owned people BEFORE deactivating — this doesn't move them.
export async function setLeaderDeactivatedAction(
  membershipId: string,
  deactivated: boolean,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (s.role !== "admin") return { ok: false, error: "Admins only." };
  if (deactivated && membershipId === s.sub) return { ok: false, error: "You can't deactivate your own account." };
  await q(
    `update membership
        set deactivated_at = case when $2 then now() else null end,
            deactivated_reason = case when $2 then $3 else null end
      where id = $1 and org_id = $4`,
    [membershipId, deactivated, reason?.trim() || null, s.org],
  );
  return { ok: true };
}

export async function inviteLeaderAction(input: {
  name: string;
  email: string;
  role: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (s.role !== "admin") return { ok: false, error: "Admins only." };
  if (!input.name.trim() || !input.email.trim())
    return { ok: false, error: "Name and email are required." };
  if (!input.password || input.password.length < 8)
    return { ok: false, error: "Set a temporary password of at least 8 characters." };
  const hash = await bcrypt.hash(input.password, 10);
  try {
    await q(
      `insert into membership (org_id, user_id, role, full_name, email, password_hash)
       values ($1, gen_random_uuid(), $2, $3, lower($4), $5)`,
      [s.org, input.role === "admin" ? "admin" : "leader", input.name.trim(), input.email.trim(), hash],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate") || msg.includes("unique"))
      return { ok: false, error: "That email already has an account." };
    return { ok: false, error: "Could not add leader." };
  }
  return { ok: true };
}

// ── Onboarding: "Logins to hand out" (the coordinator's nudge) ────────────────
// Accounts nobody has logged into yet. The coordinator mints a fresh temp
// password to text them; the row clears the moment they log in (loginAction
// stamps last_login_at). We can't show an EXISTING password — they're hashed —
// so handing one out always issues a new temp, which is the secure pattern.
const PW_ADJ = ["Amber", "Aspen", "Cedar", "Cobalt", "Cove", "Harbor", "Hazel", "Ivory", "Willow", "Bright", "Slate", "Maple"];
const PW_NOUN = ["Beacon", "Anchor", "Compass", "Harbor", "Haven", "Hearth", "Lantern", "Meadow", "Trellis", "Ridge", "Harvest", "Grove"];
function makeTempPassword(): string {
  const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
  return `${pick(PW_ADJ)}-${pick(PW_NOUN)}-${10 + Math.floor(Math.random() * 90)}`;
}

export type PendingLogin = { id: string; name: string; email: string; role: string };

export async function getPendingLoginsAction(): Promise<PendingLogin[]> {
  const s = await requireSession();
  if (s.role !== "admin") return [];
  const rows = await q<{ id: string; full_name: string | null; email: string | null; role: string }>(
    `select id, full_name, email, role from membership
      where org_id=$1 and deactivated_at is null and last_login_at is null and id <> $2
      order by (role='gatherer') desc, role, full_name`,
    [s.org, s.sub],
  );
  return rows.map((r) => ({ id: r.id, name: r.full_name ?? "—", email: r.email ?? "", role: r.role }));
}

// Mint a fresh temp password for one account and return it ONCE for the admin to
// hand out. Admin-only; stores only the hash. Invalidates any prior password.
export async function issueTempPasswordAction(
  membershipId: string,
): Promise<{ ok: boolean; name?: string; email?: string; tempPassword?: string; error?: string }> {
  const s = await requireSession();
  if (s.role !== "admin") return { ok: false, error: "Admins only." };
  const rows = await q<{ full_name: string | null; email: string | null }>(
    `select full_name, email from membership where id=$1 and org_id=$2 and deactivated_at is null`,
    [membershipId, s.org],
  );
  const m = rows[0];
  if (!m || !m.email) return { ok: false, error: "Account not found." };
  const pw = makeTempPassword();
  const hash = await bcrypt.hash(pw, 10);
  await q(`update membership set password_hash=$1 where id=$2 and org_id=$3`, [hash, membershipId, s.org]);
  return { ok: true, name: m.full_name ?? "—", email: m.email, tempPassword: pw };
}
