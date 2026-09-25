// Scheduled maintenance run by the /api/sweep cron (2×/day). Idempotent — safe to
// run repeatedly. Keeps the Campus stage (where every event walk-up lands) from
// bloating with never-engaged contacts: after a month of silence they're set to
// "resting", which drops them off the Today queue and active funnel but keeps them
// in the roster (reversible via Reconnect). This is ministry hygiene — follow up
// or set down, don't let contacts rot — and it keeps the load-everything snapshot
// light.
import { q } from "@/lib/db";
import { isQuietSeason } from "@/lib/academicCalendar";
import type { Campus } from "@/lib/types";

const STALE_DAYS = 30;

export type MaintenanceSummary = { restedStaleCampus: number };

export async function restStaleCampus(now = new Date()): Promise<MaintenanceSummary> {
  // Candidates: at Campus, not placed, not already resting, not archived, and cold
  // for 30+ days (fresh event sign-ins have no touch yet → key off created_at too,
  // so a brand-new walk-up is never rested).
  const rows = await q<{ id: string; campus: Campus | null }>(
    `select id, campus from person
      where stage='Campus' and dormant_at is null and hangout_id is null and archived_at is null
        and coalesce(last_touch_at, created_at) < now() - ($1 || ' days')::interval`,
    [STALE_DAYS],
  );
  // Respect quiet season per campus (finals/breaks — silence is normal, not drift).
  // A null-campus person reads as quiet (isQuietSeason returns true) → left alone.
  const toRest = rows.filter((r) => !isQuietSeason(r.campus, now)).map((r) => r.id);
  if (toRest.length === 0) return { restedStaleCampus: 0 };

  await q(
    `update person set dormant_at=now(),
        dormant_reason=$2, updated_at=now()
      where id = any($1)`,
    [toRest, `Auto-rested — no contact in ${STALE_DAYS}+ days at Campus`],
  );
  return { restedStaleCampus: toRest.length };
}
