// Pure derivations shared by the store and pages. No React, no I/O — so the same
// functions work over mock data now and Supabase rows later.

import type { DraftKind, DraftTemplates, Nudge, Person, Stage } from "./types";
import { R20_IG_HANDLE } from "./types";
import { EVENT_RSVP, activeRsvpFor, eventLabel, eventLink, pastEventPhrase, type LiveEventConfig } from "./events";
import { daysBetween } from "./format";

// While an upcoming event is live (EVENT_RSVP in code, or the in-app event
// editor's rows via `cfg`), anyone who already came to a PAST event but hasn't
// RSVP'd yet gets an invite as their Send-text draft — so a leader/gatherer just
// taps Send text and it's there. Person-keyed (not per-leader), so it follows
// whoever owns them and reverts automatically once the event is turned off.
// No send, no data change — only the pre-filled draft text.
//
// `cfg` (from the snapshot) is the live DB-over-code config; absent → code
// constants, i.e. exactly the pre-editor behavior. `templates` is the OWNER's
// personal drafts: an `event_invite` template replaces the event's default
// invite wording while keeping its facts via {event} {when} {where} {link}.
export function eventInviteDraft(
  p: Person,
  leaderName: string,
  cfg?: LiveEventConfig,
  templates?: DraftTemplates,
): string | null {
  const events = p.events ?? [];
  if (events.length === 0) return null; // never came to anything → normal draft
  const rsvpMap = cfg?.rsvp ?? EVENT_RSVP;
  // Route to the first live RSVP push this person qualifies for (shared matcher
  // — several pushes can run at once without crossing wires).
  const match = activeRsvpFor(events, rsvpMap);
  if (!match) return null;
  const [slug, m] = match;
  // First contact = the invite (leader's own event voice when they've set one);
  // once texted and still no RSVP, swap to the softer follow-up.
  // First contact = the invite (leader's own event voice when they've set one).
  // Once they've been texted (a touch is logged) and STILL haven't RSVP'd, swap
  // to the IG-forward follow-up so the curious-but-not-coming crowd gets a soft
  // second touch instead of the same ask again.
  const invite = templates?.event_invite?.trim() || m.sms;
  const body = p.lastTouchAt !== null && m.smsFollowup ? m.smsFollowup : invite;
  return body
    .replaceAll("[FIRST_NAME]", p.firstName)
    .replaceAll("{name}", p.firstName)
    .replaceAll("{leader}", leaderName)
    .replaceAll("{event}", pastEventPhrase(events, slug, cfg?.phrases))
    .replaceAll("{when}", m.when)
    .replaceAll("{where}", m.where)
    .replaceAll("{link}", eventLink(slug))
    .replaceAll("{ig}", R20_IG_HANDLE);
}

// One-line provenance for a person — "how they came" — shown on Today cards so
// two people with the same first name stop looking like duplicates.
export function cameVia(p: Person): string | null {
  const evs = (p.events ?? []).filter((e) => e !== "ig-follow");
  if (evs.length) return `came to ${evs.slice(0, 2).map(eventLabel).join(" + ")}${evs.length > 2 ? " +" : ""}`;
  if ((p.events ?? []).includes("ig-follow")) return "IG follower";
  if (p.captureSurface === "event_checkin") return "event sign-in";
  if (p.captureSurface && p.captureSurface.startsWith("linktree")) return "via the link page";
  // No event, no capture surface → a hand-added contact (manual add, bulk add,
  // or an import) — the snapshot doesn't carry `source`, and "added directly"
  // is the honest umbrella.
  return "added directly";
}

// Has this person been contacted since a wave began? A send during a live wave
// (reminder / thank-you / update) satisfies it — the person must then drop to
// "Recently texted", never re-card at the bottom of Today.
function touchedSince(p: Person, sinceIso: string | undefined): boolean {
  return !!sinceIso && p.lastTouchAt !== null && new Date(p.lastTouchAt) >= new Date(sinceIso);
}

// Fresh touch (< DUE_AFTER_DAYS) — the one condition all three waves share to
// pick people the main queue is hiding. Takes `now` (never its own clock) so
// queue renders are stable within a render pass.
function recentlyTouched(p: Person, now: Date): boolean {
  return !p.dormantAt && p.lastTouchAt !== null && daysBetween(p.lastTouchAt, now) < DUE_AFTER_DAYS;
}

export const DUE_AFTER_DAYS = 5;
export const OVERDUE_AFTER_DAYS = 10;

// The stock drafts, keyed by kind. Any member can override a kind with their
// own template ([FIRST_NAME] merge tag) in Settings → "Your texts"; blank
// falls back to these.
export const DRAFT_META: Record<DraftKind, { label: string; hint: string; default: (firstName: string, leaderName: string) => string }> = {
  new: {
    label: "First hello",
    hint: "Someone new you've never contacted",
    default: (n, l) => `hey ${n}, it's ${l} from R20 — really glad you connected with us. no agenda, just wanted to say hi. how's your week going?`,
  },
  crowd: {
    label: "After R20 Nights",
    hint: "They came on a Saturday (Crowd)",
    default: (n) => `hey ${n}! good to see you at R20. what stood out to you — the music, the talk, or just the people?`,
  },
  community: {
    label: "Settling into a Hangout",
    hint: "Placed in a Bible Hangout (Community)",
    default: (n) => `hey ${n}, how are you settling into the Hangout? anything i can be praying about this week?`,
  },
  committed: {
    label: "Growing to serve",
    hint: "Committed stage check-in",
    default: (n) => `hey ${n}! grateful for you. how are you doing with everything on your plate right now?`,
  },
  checkin: {
    label: "Regular check-in",
    hint: "Everyone else (your go-to opener)",
    default: (n) => `hey ${n}, thinking of you this week — how are things going?`,
  },
};

export function draftKindFor(p: Person): DraftKind {
  if (p.lastTouchAt === null) return "new";
  const byStage: Partial<Record<Stage, DraftKind>> = { Crowd: "crowd", Community: "community", Committed: "committed" };
  return byStage[p.stage] ?? "checkin";
}

export function draftFor(p: Person, leaderName: string, templates?: DraftTemplates, cfg?: LiveEventConfig): string {
  // A live "details changed" update to someone who RSVP'd wins (time-critical),
  // then post-event thank-you, then an active event invite.
  const update = eventUpdateDraft(p, leaderName, cfg);
  if (update) return update.draft;
  const thanksDraft = eventThanksDraft(p, leaderName, cfg);
  if (thanksDraft) return thanksDraft;
  const invite = eventInviteDraft(p, leaderName, cfg, templates);
  if (invite) return invite;
  const kind = draftKindFor(p);
  const custom = templates?.[kind]?.trim();
  if (custom) return custom.replaceAll("[FIRST_NAME]", p.firstName);
  return DRAFT_META[kind].default(p.firstName, leaderName);
}

// Who does this set of (already-owner-filtered) people owe a follow-up right now?
// Resting/dormant people are set down for a season — they drop off the queue.
export function computeNudges(people: Person[], now: Date, leaderName: string, templates?: DraftTemplates, cfg?: LiveEventConfig): Nudge[] {
  const rsvpMap = cfg?.rsvp ?? EVENT_RSVP;
  // The active RSVP push this person qualifies for (if any) — tags the card so
  // the page can float event pushes to the top of Today.
  const evSlug = (p: Person): string | undefined => activeRsvpFor(p.events ?? [], rsvpMap)?.[0];
  const list = people
    .filter((p) => !p.dormantAt)
    .map((p) => ({ p, d: p.lastTouchAt === null ? Infinity : daysBetween(p.lastTouchAt, now) }))
    .filter(({ p, d }) => p.lastTouchAt === null || d >= DUE_AFTER_DAYS)
    .sort((a, b) => b.d - a.d)
    .map(({ p, d }): Nudge => {
      if (p.lastTouchAt === null) {
        return { personId: p.id, reason: "New — never contacted", draft: draftFor(p, leaderName, templates, cfg), priority: "new", eventSlug: evSlug(p) };
      }
      const priority = d >= OVERDUE_AFTER_DAYS ? "overdue" : "due";
      return { personId: p.id, reason: `${d} days since last touch`, draft: draftFor(p, leaderName, templates, cfg), priority, eventSlug: evSlug(p) };
    })
    .concat(eventReminderNudges(people, now, leaderName, templates, cfg))
    .concat(eventThanksNudges(people, now, leaderName, cfg))
    .concat(eventUpdateNudges(people, now, leaderName, cfg))
    // Last on purpose: in the personId dedupe below, later wins — a pending
    // follow-back check outranks any wave (no DM can land until they accept).
    .concat(followBackNudges(people, now, leaderName, templates, cfg));
  // One card per person: the waves are not mutually exclusive (someone can
  // qualify for a thanks AND a reminder at once), so collapse by personId.
  // Map.set keeps the first insertion position but the LAST value, so the
  // later (more time-critical) wave's draft wins without reordering the queue.
  const merged = new Map<string, Nudge>();
  for (const n of list) merged.set(n.personId, n);
  return Array.from(merged.values());
}

export type Resting = { personId: string; lastTouchAt: string; days: number };

// People hidden from the active Today queue ONLY because they were texted within
// the last DUE_AFTER_DAYS — a read-only "already reached" list so a leader can see
// their recent work (and reach someone deliberately) without the active queue
// re-prompting a send. Excludes anyone already surfaced by computeNudges (the
// event waves can show a freshly-texted attendee), plus dormant/never-texted.
export function restingPeople(people: Person[], now: Date, excludeIds: Set<string>): Resting[] {
  return people
    .filter((p) => !p.dormantAt && p.lastTouchAt !== null && !excludeIds.has(p.id) && daysBetween(p.lastTouchAt, now) < DUE_AFTER_DAYS)
    .map((p) => ({ personId: p.id, lastTouchAt: p.lastTouchAt as string, days: daysBetween(p.lastTouchAt as string, now) }))
    .sort((a, b) => a.days - b.days); // most recently texted first (fewest days since)
}

// "We changed the details" update: when a remind-mode event carries an
// sms_update, people who ALREADY RSVP'd (the reminder wave excludes them) get
// it as their draft — e.g. a time correction to folks told the old time.
export function eventUpdateDraft(p: Person, leaderName: string, cfg?: LiveEventConfig): { slug: string; draft: string } | null {
  const rsvpMap = cfg?.rsvp ?? EVENT_RSVP;
  const slug = (p.events ?? []).find((e) => rsvpMap[e]?.remind && rsvpMap[e]?.smsUpdate && !touchedSince(p, rsvpMap[e]?.remindSince));
  if (!slug) return null;
  const m = rsvpMap[slug];
  const draft = (m.smsUpdate as string)
    .replaceAll("[FIRST_NAME]", p.firstName)
    .replaceAll("{name}", p.firstName)
    .replaceAll("{leader}", leaderName)
    .replaceAll("{when}", m.when)
    .replaceAll("{where}", m.where)
    .replaceAll("{link}", eventLink(slug))
    .replaceAll("{ig}", R20_IG_HANDLE);
  return { slug, draft };
}

// Post-event thank-you: when an event is in thank-you mode, anyone who CHECKED
// IN at it gets the thanks text as their draft (wins over invites — the most
// recent relational moment). Returns null when no thanks-mode event applies.
export function eventThanksDraft(p: Person, leaderName: string, cfg?: LiveEventConfig): string | null {
  const t = cfg?.thanks;
  if (!t) return null;
  // Skip a thanks wave this person was already contacted during — one send
  // satisfies the wave (otherwise a fresh touch re-cards them immediately).
  const slug = (p.events ?? []).find((e) => t[e] && !touchedSince(p, t[e].since));
  if (!slug) return null;
  return t[slug].sms
    .replaceAll("[FIRST_NAME]", p.firstName)
    .replaceAll("{name}", p.firstName)
    .replaceAll("{leader}", leaderName)
    .replaceAll("{event}", cfg?.phrases?.[slug] ?? eventLabel(slug).toLowerCase())
    .replaceAll("{link}", eventLink(slug))
    .replaceAll("{ig}", R20_IG_HANDLE);
}

// Update wave: RSVP'd people of a remind-mode event with an sms_update whose
// fresh touch hides them from the main queue (others get it via draftFor).
function eventUpdateNudges(people: Person[], now: Date, leaderName: string, cfg?: LiveEventConfig): Nudge[] {
  const rsvpMap = cfg?.rsvp ?? EVENT_RSVP;
  if (!Object.values(rsvpMap).some((m) => m.remind && m.smsUpdate)) return [];
  return people
    .filter((p) => recentlyTouched(p, now))
    .flatMap((p) => {
      const u = eventUpdateDraft(p, leaderName, cfg);
      if (!u) return [];
      return [{ personId: p.id, reason: `${eventLabel(u.slug)} — they RSVP'd · send the change of plans`, draft: u.draft, priority: "due" as const }];
    });
}

// Thank-you wave: attendees of a thanks-mode event whose fresh touch would
// otherwise hide them from Today (people the main queue already shows get the
// thanks draft through draftFor's priority instead).
function eventThanksNudges(people: Person[], now: Date, leaderName: string, cfg?: LiveEventConfig): Nudge[] {
  const t = cfg?.thanks;
  if (!t || Object.keys(t).length === 0) return [];
  return people
    .filter((p) => recentlyTouched(p, now))
    .flatMap((p) => {
      const slug = (p.events ?? []).find((e) => t[e]);
      if (!slug) return [];
      const draft = eventThanksDraft(p, leaderName, cfg);
      if (!draft) return [];
      return [{ personId: p.id, reason: `${eventLabel(slug)} — they came 🎉 say thank you`, draft, priority: "due" as const }];
    });
}

// IG private-account loop: the leader hit a private profile, sent a follow
// request (logged as a follow_request touch), and can't DM until it's
// accepted. Resurface a "did they follow back?" check every couple of days —
// with the draft ready so the DM goes out the moment the answer is yes. A real
// instagram_dm touch clears follow_requested_at and ends the loop.
const FOLLOW_CHECK_AFTER_DAYS = 2;
function followBackNudges(people: Person[], now: Date, leaderName: string, templates?: DraftTemplates, cfg?: LiveEventConfig): Nudge[] {
  return people
    .filter((p) => !p.dormantAt && p.followRequestedAt && daysBetween(p.followRequestedAt, now) >= FOLLOW_CHECK_AFTER_DAYS)
    .map((p): Nudge => ({
      personId: p.id,
      reason: `follow request pending ${daysBetween(p.followRequestedAt!, now)}d — did @${p.instagramHandle ?? "?"} follow back?`,
      draft: draftFor(p, leaderName, templates, cfg),
      priority: "due",
      followCheck: true,
    }));
}

// Day-of reminder wave: when an RSVP event has "remind" on (toggled in /events),
// everyone who attended a feeder, was ALREADY texted (fresh touch — so the
// normal due-gate hides them), and still hasn't RSVP'd comes back onto Today
// with the event's second-touch reminder pre-filled. People the main queue
// already surfaces (never-contacted / due / overdue) are left to it.
function eventReminderNudges(people: Person[], now: Date, leaderName: string, templates?: DraftTemplates, cfg?: LiveEventConfig): Nudge[] {
  const rsvpMap = cfg?.rsvp ?? EVENT_RSVP;
  if (!Object.values(rsvpMap).some((m) => m.remind)) return [];
  return people
    .filter((p) => recentlyTouched(p, now))
    .flatMap((p) => {
      const match = activeRsvpFor(p.events ?? [], rsvpMap);
      if (!match || !match[1].remind) return [];
      // Already texted during THIS reminder wave → rest, don't re-card (a send
      // must drop the person to "Recently texted", not the bottom of Today).
      if (touchedSince(p, match[1].remindSince)) return [];
      const [slug] = match;
      const draft = eventInviteDraft(p, leaderName, cfg, templates);
      if (!draft) return [];
      return [{ personId: p.id, reason: `${eventLabel(slug)} — texted, no RSVP yet · send the reminder`, draft, priority: "due" as const, eventSlug: slug }];
    });
}

// The leading metric: Community+ people actually placed in a Hangout.
export function computePlacement(people: Person[]): {
  placed: number;
  total: number;
  unplaced: Person[];
} {
  const eligible = people.filter((p) =>
    (["Community", "Committed", "Core"] as Stage[]).includes(p.stage),
  );
  const unplaced = eligible.filter((p) => p.hangoutId === null);
  return { placed: eligible.length - unplaced.length, total: eligible.length, unplaced };
}
