// The R20 30-Second Survey instrument, as plain data — imported by BOTH the client
// form (/survey) and the server (submitSurveyAction + the aggregate) so the option
// keys stay in lockstep and a survey_response can never carry a key the form didn't
// offer. Source of truth for the copy: ~/Downloads/R20 Docs/.../R20_30_Second_Survey.md.
//
// Stored values are the stable KEYS below, never the display labels, so the aggregate
// counts survive a wording change. No "server-only" import here — this module is safe
// on the client too.

export type Opt = { key: string; label: string };

// Q1 (v3 instrument) — the single question. "What are you most excited about this
// year?" One warm, agenda-free opener; a disarming street-intercept question that
// maximizes completion + opt-in. "Growing as a person" / "A fresh start" quietly
// read as a searching/open frame without telegraphing anything. "Something else"
// reveals an optional free-text line.
export const Q_EXCITED_OPTIONS: Opt[] = [
  { key: "new_people", label: "Meeting new people" },
  { key: "classes", label: "My classes / major" },
  { key: "career", label: "Internships & career" },
  { key: "city", label: "Exploring the city" },
  { key: "growth", label: "Growing as a person" },
  { key: "fresh_start", label: "A fresh start" },
  { key: "something_else", label: "Something else" },
];

// LEGACY (v2 instrument) — retired from the form; kept so the aggregate can still
// label the responses already collected. "What's the biggest source of identity
// for people your age?" (validated against Barna's Gen Z identity findings).
export const Q_IDENTITY_OPTIONS: Opt[] = [
  { key: "career", label: "Career" },
  { key: "relationships", label: "Relationships" },
  { key: "social_causes", label: "Social causes" },
  { key: "success", label: "Success" },
  { key: "personal_happiness", label: "Personal happiness" },
  { key: "family", label: "Family" },
  { key: "something_else", label: "Something else" },
];

// LEGACY (v1 instrument) — retired from the form; kept so the aggregate can still
// label the responses already collected. "What matters most to you to actually
// experience in college?"
export const Q1_OPTIONS: Opt[] = [
  { key: "success", label: "Success" },
  { key: "friendships", label: "Friendships" },
  { key: "fun", label: "Fun" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "love", label: "Love" },
];

// LEGACY (v1) — retired from the form, kept for the aggregate. "Why do you think
// a lot of people our age have basically written off religion or God?"
export const Q3_OPTIONS: Opt[] = [
  { key: "science", label: "Science / reason seems to settle it" },
  { key: "bad_experiences", label: "Bad experiences with religion or religious people" },
  { key: "irrelevant", label: "It feels irrelevant to real life" },
  { key: "suffering", label: "Suffering — how could a good God allow it" },
  { key: "never_thought", label: "Never really thought about it" },
  { key: "not_interested", label: "Just not that interested" },
];

// LEGACY (v1) — retired from the form (design research about R20; the pooled data
// keeps its value in the aggregate). "If you did get curious … what would make it
// worth your time?"
export const Q4A_OPTIONS: Opt[] = [
  { key: "honest_answers", label: "Honest answers to hard questions" },
  { key: "no_pressure", label: "No one trying to convert or recruit me" },
  { key: "good_people", label: "Genuinely good people" },
  { key: "intellectually_serious", label: "Intellectually serious, not dumbed down" },
  { key: "low_commitment", label: "Low commitment / free food" },
];

// LEGACY (v1) — retired from the form, kept for the aggregate. "What would
// instantly put you off?"
export const Q4B_OPTIONS: Opt[] = [
  { key: "preachy", label: "Feels preachy" },
  { key: "pushy", label: "Pushy or pressuring" },
  { key: "judgmental", label: "Judgy or condescending" },
  { key: "fake", label: "Fake or performative" },
  { key: "asking_for_money", label: "Always asking for money" },
  { key: "boring", label: "Boring or a drag" },
];

// The contact-channel type (PreferredContact / normalizeInstagramHandle) lives in
// @/lib/types — shared with the Instagram-DM channel work. Don't redefine it here.

// --- server-side sanitizers (never trust the wire; whitelist against the instrument) ---

// Keep only known keys from a multi-select answer; dedupe; drop everything else.
export function cleanKeys(raw: unknown, allowed: Opt[]): string[] {
  if (!Array.isArray(raw)) return [];
  const ok = new Set(allowed.map((o) => o.key));
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v === "string" && ok.has(v) && !out.includes(v)) out.push(v);
  }
  return out;
}

// Single-choice: return the key iff it's in the whitelist, else null.
export function cleanChoice(raw: unknown, allowed: Opt[]): string | null {
  if (typeof raw !== "string") return null;
  return allowed.some((o) => o.key === raw) ? raw : null;
}

export function labelFor(key: string, allowed: Opt[]): string {
  return allowed.find((o) => o.key === key)?.label ?? key;
}
