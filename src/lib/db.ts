import "server-only";
import { Pool } from "pg";

// Direct Postgres pool (BJosh pattern) over Supabase's session pooler, scoped to
// the r20reach schema. Server-only — never import into a client component.
const globalForPool = globalThis as unknown as { _r20pool?: Pool };

export const pool =
  globalForPool._r20pool ??
  new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });

if (process.env.NODE_ENV !== "production") globalForPool._r20pool = pool;

pool.on("connect", (client) => {
  // R20 operates in US Eastern. Pin the session TZ so every date-only computation
  // (current_date, ::date casts, date_trunc('week', …)) is Eastern, not UTC —
  // otherwise "today"/"this week" flip at 8pm ET (the UTC-midnight boundary),
  // which mislabels same-day sign-ups and note/reflection dates. Absolute
  // timestamptz comparisons (now(), scheduled_for) are unaffected, and explicit
  // `at time zone 'America/New_York'` expressions stay correct either way.
  void client.query("set search_path to r20reach, public; set timezone to 'America/New_York'");
});

export async function q<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
