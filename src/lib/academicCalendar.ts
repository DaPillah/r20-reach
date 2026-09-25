// Per-campus academic-calendar layer for the engagement-health system.
//
// WHY THIS EXISTS (ENGAGEMENT-HEALTH.md, decision #6): for secular Gen Z students,
// text silence can be a WEAK signal during the ACUTE academic crunches (a student
// buried in finals isn't drifting away). So drift flags are CALENDAR-AWARE: we pause
// the cooling/backward-move flags only during narrow, genuinely-ambiguous windows —
// midterms, finals, and the major holidays everyone's away for.
//
// ★ SUMMER IS NOT QUIET FOR R20 (Alex, 2026-07-08). R20 does continuous, year-round
// care — everyone gets checked on over the summer, and the ministry actively tends
// the students who stay in NYC when campus empties (the summer-care pool). So summer
// silence IS a signal and engagement is tracked straight through it. Only the brief
// exam/holiday windows below pause a flag; there is no "whole season off" anymore.
//
// Pure data + one predicate. No I/O, no React. `isQuietSeason(campus, date)` is the
// gate the derivation calls.
//
// ⚠ DATES ARE APPROXIMATE — set from typical NYC-university calendars and MUST be
// verified against each school's official academic calendar before the flags go
// live (they only feed the SILENT derivation for now, so an off-by-a-few-days date
// changes nothing user-facing yet). Easiest to keep current: one row per window.

import type { Campus } from "./types";
import { todayET } from "./format";

export type QuietKind = "winter" | "thanksgiving" | "spring_break" | "midterms" | "finals";

export type QuietWindow = {
  kind: QuietKind;
  start: string; // inclusive, YYYY-MM-DD
  end: string; // inclusive, YYYY-MM-DD
};

// A campus is in "quiet season" ONLY when the date falls in one of these windows:
// the exam crunches (midterms/finals) and the major holidays (Thanksgiving/winter/
// spring break). Everything else — including all summer — is ACTIVE, so drift flags
// run. Windows are deliberately narrow: we pause a flag only when silence is
// genuinely ambiguous, never for a whole season.
//
// Fall 2026 → Spring 2027. `fallTermStart` is reference only (informational) —
// summer before it is ACTIVE, not quiet.
type CampusCalendar = {
  fallTermStart: string; // fall classes begin — reference only; summer before this is ACTIVE
  quiet: QuietWindow[];
};

const CALENDARS: Record<Campus, CampusCalendar> = {
  // Columbia: fall classes ~Sept 8; Thanksgiving late Nov; finals mid-Dec.
  Columbia: {
    fallTermStart: "2026-09-08",
    quiet: [
      { kind: "midterms", start: "2026-10-19", end: "2026-10-30" },
      { kind: "thanksgiving", start: "2026-11-25", end: "2026-11-29" },
      { kind: "finals", start: "2026-12-11", end: "2026-12-22" },
      { kind: "winter", start: "2026-12-23", end: "2027-01-19" },
      { kind: "spring_break", start: "2027-03-15", end: "2027-03-19" },
      { kind: "finals", start: "2027-05-03", end: "2027-05-14" },
    ],
  },
  // NYU: fall classes ~Sept 2; similar rhythm.
  NYU: {
    fallTermStart: "2026-09-02",
    quiet: [
      { kind: "midterms", start: "2026-10-12", end: "2026-10-23" },
      { kind: "thanksgiving", start: "2026-11-25", end: "2026-11-29" },
      { kind: "finals", start: "2026-12-14", end: "2026-12-22" },
      { kind: "winter", start: "2026-12-23", end: "2027-01-26" },
      { kind: "spring_break", start: "2027-03-15", end: "2027-03-21" },
      { kind: "finals", start: "2027-05-10", end: "2027-05-18" },
    ],
  },
  // CCNY (CUNY): fall classes ~late Aug.
  CCNY: {
    fallTermStart: "2026-08-26",
    quiet: [
      { kind: "midterms", start: "2026-10-19", end: "2026-10-30" },
      { kind: "thanksgiving", start: "2026-11-26", end: "2026-11-29" },
      { kind: "finals", start: "2026-12-15", end: "2026-12-22" },
      { kind: "winter", start: "2026-12-23", end: "2027-01-24" },
      { kind: "spring_break", start: "2027-03-29", end: "2027-04-05" },
      { kind: "finals", start: "2027-05-20", end: "2027-05-27" },
    ],
  },
  // Pace (NYC): fall classes ~early Sept.
  Pace: {
    fallTermStart: "2026-09-02",
    quiet: [
      { kind: "midterms", start: "2026-10-19", end: "2026-10-30" },
      { kind: "thanksgiving", start: "2026-11-25", end: "2026-11-29" },
      { kind: "finals", start: "2026-12-14", end: "2026-12-21" },
      { kind: "winter", start: "2026-12-22", end: "2027-01-20" },
      { kind: "spring_break", start: "2027-03-08", end: "2027-03-14" },
      { kind: "finals", start: "2027-05-06", end: "2027-05-13" },
    ],
  },
};

function ymd(d: Date): string {
  // Compare on calendar date only, in Eastern (US campus calendars) — avoids the
  // UTC-midnight drift that would flip a day at 8pm ET in range checks.
  return todayET(d);
}

/**
 * Is this campus in a "quiet season" on this date? True ONLY inside a listed
 * exam/holiday window (midterms, finals, Thanksgiving, winter/spring break).
 * Summer and ordinary term weeks are ACTIVE (false) — R20 cares year-round. When
 * true, the engagement derivation pauses its drift flags.
 *
 * Unknown/missing campus → defaults to TRUE (fail safe: never raise a drift flag
 * for someone whose calendar we can't place).
 */
export function isQuietSeason(campus: Campus | null | undefined, date: Date): boolean {
  if (!campus || !(campus in CALENDARS)) return true;
  const today = ymd(date);
  return CALENDARS[campus].quiet.some((w) => today >= w.start && today <= w.end);
}

/** The quiet window covering this date, if any (for logging/explanation). */
export function quietSeasonKind(campus: Campus | null | undefined, date: Date): QuietKind | null {
  if (!campus || !(campus in CALENDARS)) return null;
  const today = ymd(date);
  return CALENDARS[campus].quiet.find((w) => today >= w.start && today <= w.end)?.kind ?? null;
}
