// Domain types — mirror supabase/migrations/0001_core_schema.sql so moving from
// mock data to live Supabase is a wiring change, not a rewrite.

export type Campus = "Columbia" | "NYU" | "CCNY" | "Pace";

// Optional, self-selected (or set by someone who knows them) — never inferred.
export type Gender = "male" | "female" | "nonbinary";
export const GENDERS: { key: Gender; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "nonbinary", label: "Nonbinary" },
];

// The 5C funnel (pipeline stages), ordered.
export type Stage = "Campus" | "Crowd" | "Community" | "Committed" | "Core";

export const STAGES: Stage[] = [
  "Campus",
  "Crowd",
  "Community",
  "Committed",
  "Core",
];

// The 5 "commitment levels" — R20's adaptation of Rick Warren's five circles of
// commitment (Community → Crowd → Congregation → Committed → Core, The Purpose
// Driven Church), localized to campus + sharpened by the R20 BH Leadership Guide.
// `headline` = 2–3 word gist; `def` = one plain sentence; `next` = the step that
// moves them inward. Single source of truth — surfaced in the guide, the funnel,
// and stage-chip tooltips.
export const STAGE_META: Record<
  Stage,
  { label: string; color: string; next?: string; headline: string; def: string }
> = {
  Campus: {
    label: "Campus",
    color: "var(--s-campus)",
    next: "Invite to R20 Nights",
    headline: "On our radar",
    def: "Not yet connected — we've met, they came to something once, or a friend brought them in. This is who we're reaching.",
  },
  Crowd: {
    label: "Crowd",
    color: "var(--s-crowd)",
    next: "Invite to 101 / a Hangout",
    headline: "Shows up",
    def: "Comes to R20 Nights on a Saturday — curious and showing up, believer or skeptic — but not yet in deeper community.",
  },
  Community: {
    label: "Community",
    color: "var(--s-community)",
    next: "Place in a Bible Hangout",
    headline: "Belongs",
    def: "Has stepped in — done R20 101 and building real friendships. A member of the family, not just a face in the crowd.",
  },
  Committed: {
    label: "Committed",
    color: "var(--s-committed)",
    next: "201 + growing to serve",
    headline: "Growing",
    def: "In a Bible Hangout, practicing the habits of following Jesus — Word, prayer, community — and growing toward serving.",
  },
  Core: {
    label: "Core",
    color: "var(--s-core)",
    next: "Serving & being sent",
    headline: "Serving & sent",
    def: "Serving, leading a Hangout, and being sent — the ones who carry the ministry and raise up the next leaders.",
  },
};

// Which channel a person asked to be reached on (R20 30-Second Survey opt-in:
// "text" OR "Instagram DM"). This is a CHANNEL PREFERENCE, not consent — SMS
// consent lives in sms_consent. Default 'text' keeps every existing person SMS-
// first. GUARDRAIL: an 'instagram' preference = consent to an IG invite only;
// never text them and never enroll them in an SMS journey (channels stay
// separate — see the Instagram guardrail throughout the app + INSTAGRAM-SETUP.md).
export type PreferredContact = "text" | "instagram";

export const PREFERRED_CONTACT_META: Record<PreferredContact, { label: string }> = {
  text: { label: "Text" },
  instagram: { label: "Instagram DM" },
};

// Normalize a handed-over IG handle for storage/links: strip a leading '@', any
// wrapping whitespace, and a pasted profile URL (instagram.com/<handle>); keep
// only handle-legal chars (letters, digits, '.', '_'); cap length. Blank → null.
export function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let h = raw.trim();
  const m = h.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) h = m[1];
  h = h.replace(/^@+/, "").replace(/[^A-Za-z0-9._]/g, "").slice(0, 30);
  return h || null;
}

// Where a leader opens a DM to a handle (manual send — Phase 1 has no API send).
export function instagramProfileUrl(handle: string | null | undefined): string | null {
  const h = normalizeInstagramHandle(handle);
  return h ? `https://instagram.com/${h}` : null;
}

// R20's own Instagram — the "message us first" entry point (INSTAGRAM-SETUP.md
// Phase 1). ig.me/m/<handle> opens the viewer's DM composer to R20; when they
// send, the 24h reply window opens (auto-reply itself needs the inbound webhook
// + Meta App Review). Single source of truth — change the handle here only.
// Empty string disables the entry-point button everywhere.
export const R20_IG_HANDLE = "readyat20manh";
export const R20_IG_DM_URL = R20_IG_HANDLE ? `https://ig.me/m/${R20_IG_HANDLE}` : "";

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  campus: Campus;
  gender?: Gender | null; // optional, self-selected — for gender-specific events/filter
  phone: string;
  stage: Stage;
  ownerId: string | null; // leader who owns this relationship; null = unclaimed
  hangoutId: string | null; // placement — null = not yet placed
  lastTouchAt: string | null; // ISO
  createdAt: string; // ISO
  invitedByName?: string | null; // referrer display name (attribution), if captured via a link
  events?: string[]; // event-sign-in slugs this person checked in at (event_checkin) — for the People "came to event" filter
  replies?: string[]; // event slugs whose reach-out this person replied to (event_reply, leader-marked) — drives the responded/no-response invite split
  dormantAt?: string | null; // ISO — "resting": off the active Today queue, still in the roster
  dormantReason?: string | null;
  servingRole?: string | null; // Ministry: a serving role (null = not serving)
  nycLocal?: boolean; // around over summer/breaks → part of the summer-care pool
  summerReason?: string | null; // why: local | international | no_family | other
  captureSurface?: string | null; // how they first entered (e.g. 'linktree_decision' = took a step at Nights)
  followRequestedAt?: string | null; // IG private profile: follow request sent, DM still blocked (cleared by a real instagram_dm touch)
  apprenticeOf?: string | null; // membership id of the leader raising them as an apprentice (null = not an apprentice)
  instagramHandle?: string | null; // @handle (stored without '@') if they gave one (survey opt-in / manual)
  preferredContact?: PreferredContact; // channel they chose to be reached on; default 'text'
  optedIn?: boolean; // has a phone AND SMS consent = actually textable (powers the People "opted in" filter)
  email?: string | null; // needed for Columbia guest registration (QR is emailed)
  hasCuid?: boolean | null; // holds a Columbia CUID? null = unknown; false = needs the Saturday gate list
  schoolYear?: SchoolYear | null; // null = unknown; first-years are R20's strategic center
}

export type SchoolYear = "first_year" | "sophomore" | "junior" | "senior" | "grad";
export const SCHOOL_YEARS: { key: SchoolYear; label: string }[] = [
  { key: "first_year", label: "First year" },
  { key: "sophomore", label: "Sophomore" },
  { key: "junior", label: "Junior" },
  { key: "senior", label: "Senior" },
  { key: "grad", label: "Grad" },
];

// Why a member is around over summer/breaks. international + no_family are the
// care PRIORITY (most at risk of being alone when campus empties).
export const SUMMER_REASONS: { key: string; label: string; priority?: boolean }[] = [
  { key: "local", label: "Local (NYC home)" },
  { key: "international", label: "International", priority: true },
  { key: "no_family", label: "No family to go to", priority: true },
  { key: "other", label: "Other" },
];
export function isSummerPriority(reason?: string | null): boolean {
  return reason === "international" || reason === "no_family";
}
export function summerReasonLabel(reason?: string | null): string {
  return SUMMER_REASONS.find((r) => r.key === reason)?.label ?? "";
}

// A temporary coverage relationship: `coveringId` tends `coveredId`'s people for
// a season without taking ownership (e.g. Chris covers Bella over the summer).
export interface Coverage {
  coveringId: string;
  coveredId: string;
  coveredName: string;
  endsOn: string | null; // YYYY-MM-DD, null = open-ended
}

// Which pre-written Today-queue draft a person gets (see logic.ts draftFor).
export type DraftKind = "new" | "crowd" | "community" | "committed" | "checkin";
// Stage-keyed drafts + an optional personal voice for live event invites
// ("event_invite" — merge tags [FIRST_NAME] {event} {when} {where} {link}; the
// event's facts stay authoritative, only the wording is the leader's).
export type DraftTemplates = Partial<Record<DraftKind | "event_invite", string>>;

export interface Leader {
  id: string;
  name: string;
  isCoordinator?: boolean; // the accountable backstop for unclaimed captures
  role?: string; // 'leader' = runs a Bible Hangout (reflections apply); 'admin' = oversight
  draftTemplates?: DraftTemplates; // personal voice for Today drafts; [FIRST_NAME] merge tag
}

// Admin view of a leader (settings). Lives here (not in the "use server" file,
// which should only export async functions).
export type LeaderRow = { id: string; name: string; email: string | null; role: string; deactivatedAt: string | null };

export interface Hangout {
  id: string;
  name: string;
  campus: Campus;
  leaderId: string | null;
  memberIds: string[];
  // simple rolling attendance ratio 0..1 (health); null until attendance is tracked
  health: number | null;
}

// A due follow-up surfaced on the Today screen (Track A).
export interface Nudge {
  personId: string;
  reason: string; // "5 days since last touch", "New — never contacted", ...
  draft: string; // pre-written, editable message the leader sends from their own phone
  priority: "due" | "overdue" | "new";
  eventSlug?: string; // set when this card is an active event RSVP push (used to float it to the top of Today)
  followCheck?: boolean; // IG private-account loop: follow request pending — card asks "did they follow back?" instead of prompting a DM
}

// A logged touch — becomes a pipeline_activity row in Supabase. `instagram_dm`
// is a leader-recorded "I DMed them on Instagram" touch: it behaves exactly like
// a `text` touch for the owner loop / "not reached yet" flags (both refresh
// last_touch_at), but is a SEPARATE channel from SMS — see the IG guardrail.
export type TouchType = "text" | "call" | "in_person" | "prayer" | "invite" | "note" | "instagram_dm" | "follow_request";

export const TOUCH_META: Record<TouchType, { label: string }> = {
  text: { label: "Texted" },
  call: { label: "Called" },
  in_person: { label: "Met up" },
  prayer: { label: "Prayed with" },
  invite: { label: "Invited" },
  note: { label: "Note" },
  instagram_dm: { label: "DMed on IG" },
  // IG private-account dead-end: only a follow request went out, no message.
  follow_request: { label: "Requested to follow" },
};

export interface Activity {
  id: string;
  personId: string;
  type: TouchType;
  note?: string;
  at: string; // ISO
}
