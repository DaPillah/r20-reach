// Engagement-health derivation — the "who's quietly drifting?" signal.
//
// SILENT LAYER (ENGAGEMENT-HEALTH.md build-order step 2): this computes the three
// flags + reason strings + a HIDDEN internal sort key from data we already store
// (touch recency, Hangout attendance, stage/tenure). It is pure — no I/O, no React,
// no UI. Nothing here is shown to a leader yet; it exists so the signal can accrue
// and be sanity-checked against reality before any focus-list UI ships near launch.
//
// GOVERNING RULE (the one-line test): "if a member saw this screen of themselves,
// would they feel loved and noticed, or measured and ranked?" So the sort key is
// INTERNAL ONLY (ranks a focus list) and everything human-facing is prose + relative
// time + one soft cue — never a number, red dot, or gauge on a person. Each flag
// carries a plain-English reason.
//
// Calendar-aware: pass `quietSeason` (from academicCalendar.isQuietSeason) — during
// breaks/finals the drift flags (cooling, backward-move) are paused, because for
// secular Gen Z students silence during exams ≈ nothing.

import type { Person, Stage } from "./types";
import { daysBetween } from "./format";

// A recent Hangout meeting for one person, most-recent FIRST. Derived from
// reflection_attendance ⋈ reflection.occurred_on (the DB adapter builds this).
export type AttendanceMark = { occurredOn: string; present: boolean };

// Extra per-person facts the derivation needs beyond the Person snapshot.
export type EngagementInputs = {
  touchCount: number; // total logged touches ever (pipeline_activity count)
  firstTouchAt?: string | null; // ISO; falls back to createdAt for tenure
  attendance?: AttendanceMark[]; // recent Hangout meetings, most-recent first; empty if not in a Hangout
};

export type EngagementFlags = {
  cooling: boolean; // was engaged, going quiet (recency/attendance) — drift
  campusLimbo: boolean; // stuck at Campus, not progressing (tenure + no Hangout)
  backwardMove: boolean; // Community+ sustained-cooling → SUGGEST a move back (never auto)
};

export type EngagementSignal = {
  personId: string;
  // INTERNAL ONLY. Ranks the focus list. NEVER render this on a person.
  sortKey: number; // 0–100, higher = more worth a check-in
  flags: EngagementFlags;
  reasons: string[]; // plain-English, human-readable; drive the eventual prose cue
  // The single soft cue the person card would show (null = healthy, show nothing).
  cue: string | null;
  paused: boolean; // true = quiet season suppressed drift flags
};

const STAGE_RANK: Record<Stage, number> = { Campus: 0, Crowd: 1, Community: 2, Committed: 3, Core: 4 };

// ── Contact recency → reason (anchored to the app's 5-/10-day cadence) ──────────
function recencyReason(days: number | null): string | null {
  if (days === null) return null; // never contacted is handled by the Today "new" queue, not here
  if (days <= 10) return null; // healthy
  if (days <= 21) return "Approaching 3 weeks quiet";
  if (days <= 35) return "Over 3 weeks since contact";
  return "No contact in a month+";
}

// ── Hangout attendance (last up to 4) → reason. Recency-weighted: missing the
// most recent meeting costs most. Only meaningful for people in a Hangout. ───────
function attendanceReason(marks: AttendanceMark[]): { reason: string | null; consecutiveAbsent: number; missedRatio: number } {
  const last4 = marks.slice(0, 4);
  if (last4.length === 0) return { reason: null, consecutiveAbsent: 0, missedRatio: 0 };

  let consecutiveAbsent = 0;
  for (const m of last4) {
    if (!m.present) consecutiveAbsent++;
    else break;
  }
  const presentCount = last4.filter((m) => m.present).length;
  const missedRatio = (last4.length - presentCount) / last4.length;
  const mostRecentPresent = last4[0].present;

  let reason: string | null = null;
  if (consecutiveAbsent >= last4.length && last4.length >= 4) reason = "Away from Hangout a month";
  else if (consecutiveAbsent >= 2) reason = "Two Hangouts missed";
  else if (!mostRecentPresent) reason = "Missed last Hangout";
  else if (presentCount <= Math.floor(last4.length / 2)) reason = "Back after gaps";
  // present most recent + healthy majority → no cue

  return { reason, consecutiveAbsent, missedRatio };
}

/**
 * Derive one person's engagement signal. Pure. Dormant/never-contacted people
 * return a no-cue signal (they're handled elsewhere). Drift flags are paused in
 * quiet season; the Campus-limbo (tenure/ownerless) flag is not — it's not a drift
 * signal. Rank a focus list by descending `sortKey`, then take the top ~5.
 */
export function deriveEngagement(p: Person, inputs: EngagementInputs, now: Date, quietSeason: boolean): EngagementSignal {
  const base: EngagementSignal = {
    personId: p.id,
    sortKey: 0,
    flags: { cooling: false, campusLimbo: false, backwardMove: false },
    reasons: [],
    cue: null,
    paused: quietSeason,
  };

  // Resting people are intentionally set down for a season — never flag them.
  if (p.dormantAt) return base;

  const days = p.lastTouchAt === null ? null : daysBetween(p.lastTouchAt, now);
  const att = attendanceReason(inputs.attendance ?? []);
  const reasons: string[] = [];

  // ── Campus limbo (NOT a drift flag → runs even in quiet season) ──────────────
  // stage==Campus AND (≥3 touches OR ≥6 weeks since first touch) AND
  // (never in a Hangout OR a 3+ week attendance lapse). Surface ownerlessness first.
  const firstTouch = inputs.firstTouchAt ?? p.createdAt;
  const weeksSinceFirst = daysBetween(firstTouch, now) / 7;
  const inaHangout = p.hangoutId !== null;
  const attendanceLapsed = att.consecutiveAbsent >= 3;
  if (
    p.stage === "Campus" &&
    (inputs.touchCount >= 3 || weeksSinceFirst >= 6) &&
    (!inaHangout || attendanceLapsed)
  ) {
    base.flags.campusLimbo = true;
    if (p.ownerId === null) reasons.push("No one owns this person yet"); // ownerlessness first
    reasons.push("Stuck at Campus — not yet in a Hangout");
  }

  // ── Cooling off (drift → paused in quiet season) ─────────────────────────────
  const recency = recencyReason(days);
  const coolingByRecency = days !== null && days > 21;
  const coolingByAttendance = att.consecutiveAbsent >= 2 || att.missedRatio >= 0.5;
  if (!quietSeason && (coolingByRecency || coolingByAttendance)) {
    base.flags.cooling = true;
    if (recency) reasons.push(recency);
    if (att.reason) reasons.push(att.reason);
  }

  // ── Backward-move SUGGESTION (drift, highest-stakes → paused in quiet season) ─
  // Community+ AND sustained cooling. We approximate "sustained ~3+ weeks" with a
  // month+ of silence or a full month of Hangout absence — a single bad week never
  // triggers it. Always a question to a human, never an auto-demote.
  const sustained = (days !== null && days > 35) || att.consecutiveAbsent >= 4;
  if (!quietSeason && STAGE_RANK[p.stage] >= STAGE_RANK.Community && sustained) {
    base.flags.backwardMove = true;
    reasons.push("Drifting for a while — worth asking if this is a season");
  }

  // ── Internal sort key (HIDDEN) — rank by cooling velocity, trend over level ───
  // Weight recency, attendance, and a "was engaged" boost (deeper stage or a real
  // touch history makes a NEW silence rank higher — a warm→quiet fall matters more
  // than a peripheral newcomer who was always light-touch).
  let key = 0;
  if (days !== null) key += Math.min(45, Math.max(0, days - 10) * 1.5); // recency ramp past the 10-day cadence
  key += att.consecutiveAbsent * 10; // each consecutive Hangout miss
  key += att.missedRatio * 10;
  if (base.flags.campusLimbo) key += 15;
  if (base.flags.backwardMove) key += 15;
  const wasEngaged = inputs.touchCount >= 3 || STAGE_RANK[p.stage] >= STAGE_RANK.Community;
  if (wasEngaged && (base.flags.cooling || base.flags.backwardMove)) key += 12; // trend boost
  base.sortKey = Math.round(Math.min(100, key));

  base.reasons = reasons;
  // The soft cue: only if there's an active flag. Campus limbo can surface even in
  // quiet season (it's not drift). Prose lead = the first (highest-priority) reason.
  const hasFlag = base.flags.cooling || base.flags.campusLimbo || base.flags.backwardMove;
  base.cue = hasFlag && reasons.length ? reasons[0] : null;
  // If quiet season paused everything and limbo didn't fire, zero the key so paused
  // people never rank into a focus list.
  if (!hasFlag) base.sortKey = 0;
  return base;
}

/**
 * Rank a set of derived signals into the capped focus list (default 5). Only
 * people with an active flag + non-zero key are eligible; healthy people are
 * excluded. Highest cooling velocity first. (UI deferred — this is the ordering
 * the eventual "a few people to check on" section will use.)
 */
export function focusList(signals: EngagementSignal[], cap = 5): EngagementSignal[] {
  return signals
    .filter((s) => s.sortKey > 0 && s.cue !== null)
    .sort((a, b) => b.sortKey - a.sortKey)
    .slice(0, cap);
}
