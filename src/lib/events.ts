// Event sign-in helpers — shared by the /event capture card, submitEventCheckinAction,
// and the /overview aggregate. Client-safe (no server-only imports).

// QR links carry ?e=<slug> (games-night-1, float-social, field-games…). We whitelist
// the SHAPE, not a list — a new event is created by printing a QR with a new slug,
// never by a code change.
export function cleanEventSlug(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return s ? s.slice(0, 40) : null;
}

// Per-event extra questions beyond the universal name + last name + contact.
// Keyed by slug. A slug NOT listed here just gets the base form (games night,
// bodega run) — no code change to add such an event, only a printed QR. An event
// that needs more (the scavenger hunt's teams + dietary, find-your-classes'
// buildings) defines its fields here. Answers are composed into
// event_checkin.detail — the human-readable summary the coordinator reads for
// same-day follow-up and the /overview per-event list. Nothing here is queried
// per-field, so a readable string is the right storage (last name is the one
// structured answer — it goes to person.last_name, handled in the action).
export type EventField = {
  key: string;                 // stored key, e.g. "signup_type" | "dietary"
  label: string;               // the question shown on the form
  type: "text" | "textarea" | "choice";
  options?: string[];          // choice only — rendered as pills
  placeholder?: string;
  help?: string;
  short?: string;              // compact label for the composed summary (falls back to label)
  // choice only: when this option is chosen, reveal a follow-up text field
  // (e.g. pick "Team" → ask the team name).
  reveal?: { whenValue: string; key: string; label: string; placeholder?: string; short?: string };
};

export const EVENT_FIELDS: Record<string, EventField[]> = {
  "scavenger-hunt": [
    {
      key: "signup_type",
      label: "Signing up solo or with a team?",
      type: "choice",
      options: ["Solo", "Team"],
      short: "Signup",
      reveal: { whenValue: "Team", key: "team_name", label: "Team name", placeholder: "Your team's name", short: "Team" },
    },
    {
      key: "dietary",
      label: "Any dietary restrictions or accessibility needs?",
      type: "textarea",
      placeholder: "Optional — anything we should know",
      help: "So we can plan snacks and access.",
      short: "Dietary/access",
    },
  ],
  "find-your-classes": [
    {
      key: "buildings",
      label: "Which buildings are your classes in?",
      type: "textarea",
      placeholder: "e.g. Hamilton, Pupin, Milbank…",
      help: "List any you know — we'll group the walk so yours are covered.",
      short: "Buildings",
    },
  ],
};

// The extra fields for a slug (empty when the event uses the base form only).
export function eventFields(slug: string | undefined): EventField[] {
  return (slug && EVENT_FIELDS[slug]) || [];
}

// Compose the raw per-field answers into the readable `detail` summary stored on
// the check-in. Uses each field's short label; includes a reveal answer only when
// its parent option matches. Each value is clipped; returns null when nothing
// meaningful was answered. Pure + client-safe, so the server composes from raw
// answers (never trusting a client-formatted string).
export function composeEventDetail(slug: string | undefined, answers: Record<string, string> | undefined): string | null {
  const fields = eventFields(slug);
  if (!fields.length || !answers) return null;
  const clip = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");
  const parts: string[] = [];
  for (const f of fields) {
    const v = clip(answers[f.key]);
    if (v) parts.push(`${f.short ?? f.label}: ${v}`);
    if (f.reveal && v === f.reveal.whenValue) {
      const rv = clip(answers[f.reveal.key]);
      if (rv) parts.push(`${f.reveal.short ?? f.reveal.label}: ${rv}`);
    }
  }
  return parts.length ? parts.join(" · ").slice(0, 500) : null;
}

// Upcoming events that use /event as an RSVP (future-tense) rather than an
// at-the-door sign-in. Presence of a slug here flips the capture card to RSVP
// framing and shows when/where. Remove the entry (or just let the date pass)
// after the event — an unlisted slug falls back to the "glad you came" sign-in.
// `where` is the polished RSVP-PAGE copy; `sms` is the casual invite text a
// leader sends (tags: {name} {leader} {ig}). Keeping them separate lets the page
// read clean while the text stays lowercase/texting-casual.
// `feeders` = the past event slugs whose attendees this RSVP invites. The invite
// pre-fill (eventInviteDraft) routes each person to the first RSVP event whose
// feeders they attended — so several RSVP pushes can run at once (game-night for
// field-games/float, park-pizza for the ice-cream social) without crossing wires.
// `smsUpdate` = a change-of-plans text for people who already RSVP'd.
export type EventRsvp = { headline: string; when: string; where: string; sms: string; smsFollowup?: string; smsUpdate?: string; feeders?: string[]; excludeFeeders?: string[]; remind?: boolean; remindSince?: string };
// EMPTY BY DESIGN (REVAMP stage 2): events live in the DB `event` table via
// the /events editor. This constant once held hardcoded pushes; after the
// events went past-dated it became a hazard — any DB hiccup silently
// resurrected "game night today, 9/5" invites onto every leader's Today.
// Config failure now yields NO event drafts (loud in logs) instead of wrong
// ones. Keep the constant (and its type) so pure helpers have a base map.
export const EVENT_RSVP: Record<string, EventRsvp> = {};
// Merged event config: DB rows (the in-app event editor) layered over the code
// constants above. Built server-side by getLiveEventConfig() and passed down to
// client surfaces; every consumer falls back to the code constants when it's
// absent, so the app behaves exactly as before if the DB path is ever unavailable.
export type LiveEventConfig = {
  rsvp: Record<string, EventRsvp>;
  phrases: Record<string, string>;
  // Post-event thank-you phase: slug → the thanks text. A slug here is OUT of
  // the rsvp map (thank-you supersedes invite/reminder for that event).
  thanks?: Record<string, { sms: string; since?: string }>;
};

// The public RSVP link for a slug — the {link} merge tag in invite templates.
export function eventLink(slug: string): string {
  return `https://join.r20.nyc/event?e=${slug}`;
}

// Recurring R20 Nights: any slug shaped r20-nights-YYYY-MM-DD gets one fixed
// sign-in page (name + venue + time, NO date shown) without a per-week setup —
// the date lives only in the slug, so each night still tracks + filters by
// prefix. A real DB/code entry for that exact slug still wins. This only affects
// the /event page + its link preview (both call eventRsvp); the invite pre-fill
// reads the raw map via activeRsvpFor, so R20 Nights never enters that.
const R20_NIGHTS_RE = /^r20-nights-\d{4}-\d{2}-\d{2}$/;
export const R20_NIGHTS_RSVP: EventRsvp = {
  headline: "R20 Nights.",
  when: "Saturdays · 7pm",
  where: "Avery 114",
  sms: "",
  feeders: [],
};

export function eventRsvp(slug: string | undefined, rsvpMap?: Record<string, EventRsvp>): EventRsvp | null {
  const map = rsvpMap ?? EVENT_RSVP;
  if (slug && map[slug]) return map[slug];
  if (slug && R20_NIGHTS_RE.test(slug)) return R20_NIGHTS_RSVP;
  return null;
}

// The live RSVP push this person qualifies for: they attended one of its feeder
// events (or, if it lists none, any event) and haven't RSVP'd to it yet. Shared
// by the invite pre-fill and the day-of reminder queue.
export function activeRsvpFor(events: string[], rsvpMap: Record<string, EventRsvp>): [string, EventRsvp] | null {
  if (events.length === 0) return null;
  const match = Object.entries(rsvpMap).find(([slug, m]) => {
    if (events.includes(slug)) return false; // already RSVP'd to this one
    // Negative targeting: attending any excluded event disqualifies outright.
    if (m.excludeFeeders?.some((f) => events.includes(f))) return false;
    // No feeders listed = no pre-filled invites (the RSVP page/QR still work).
    // An empty list must never mean "invite everyone who ever attended anything".
    return !!m.feeders?.length && m.feeders.some((f) => events.includes(f));
  });
  return match ?? null;
}

// Friendly phrase for the event(s) a person actually came to — used in the invite
// so it reads "glad you came to the ice cream float this week" instead of generic.
// Excludes the upcoming RSVP event itself; unknown slugs fall back to a neutral
// "out". Returns the fragment that follows "came " (so "out" / "to field games").
export const EVENT_PHRASE: Record<string, string> = {
  "field-game-1": "field games",
  "icecream-float": "the ice cream float",
  "icecream-sandwiches": "the ice cream social",
};
export function pastEventPhrase(events: string[] | undefined, excludeSlug: string, overrides?: Record<string, string>): string {
  const map = overrides ? { ...EVENT_PHRASE, ...overrides } : EVENT_PHRASE;
  const phrases = [...new Set((events ?? []).filter((e) => e !== excludeSlug).map((e) => map[e]).filter(Boolean))];
  if (phrases.length === 0) return "out";
  if (phrases.length === 1) return `to ${phrases[0]}`;
  return `to ${phrases.slice(0, -1).join(", ")} + ${phrases[phrases.length - 1]}`;
}

// "games-night-1" → "Games Night 1" — display only; the slug is the stored key.
export function eventLabel(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
