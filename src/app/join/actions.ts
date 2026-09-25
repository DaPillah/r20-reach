"use server";

// PUBLIC capture actions — the A→B seam. Unlike app/actions.ts these do NOT
// require a session: anyone can generate an invite link and any invited friend
// can submit the join form. Org is resolved by slug (single-org today).
import { headers } from "next/headers";
import { requireSession } from "@/lib/session";
import { q } from "@/lib/db";
import { ASSIMILATION_JOURNEY_ID, NEW_BELIEVER_JOURNEY_ID, completeNightsReminderOnArrival, enrollInJourney, enrollInNightsReminder, enrollInWelcomeJourney } from "@/lib/journeys";
import { toE164 } from "@/lib/phone";
import { sendStaffAlert } from "@/lib/sms";
import { Q_EXCITED_OPTIONS, cleanChoice } from "@/lib/survey";
import { cleanEventSlug, composeEventDetail, eventLabel } from "@/lib/events";
import { R20_IG_HANDLE, STAGES, normalizeInstagramHandle } from "@/lib/types";

const ORG_SLUG = "r20";

// ?src= acquisition tag (which ad / QR / poster / campus link brought them).
// Normalize hard so a scanned/pasted value can't smuggle junk into the DB or a
// later query: lowercase, keep [a-z0-9_-], cap length. Blank/invalid → null.
function cleanSrc(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return v || null;
}

// Must match verbatim the consent copy shown on the /join form (TCPA audit).
const CONSENT_TEXT =
  "I agree to receive text messages from R20 Campus Ministry about gatherings, events, and follow-up. Msg & data rates may apply. Msg frequency varies. Reply STOP to unsubscribe, HELP for help. See our Privacy Policy and SMS Terms. Consent is not a condition of attending any event.";

async function orgId(): Promise<string> {
  const rows = await q<{ id: string }>(`select id from org where slug=$1 limit 1`, [ORG_SLUG]);
  const id = rows[0]?.id;
  if (!id) throw new Error("org not found");
  return id;
}

function slugBase(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return s || "friend";
}

function suffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

// --- Self-serve link creation (anyone, no account) --------------------------
export type CreateReferrerResult = { slug: string; name: string };

export async function createReferrerAction(input: {
  name: string;
  phone?: string;
  honeypot?: string;
}): Promise<CreateReferrerResult> {
  if (input.honeypot) throw new Error("rejected"); // bot trap
  const name = input.name.trim();
  if (!name) throw new Error("Please enter your name.");
  const org = await orgId();
  const phone = toE164(input.phone);
  const base = slugBase(name);

  // Retry on the (org, slug) unique constraint until we land a free slug.
  for (let i = 0; i < 6; i++) {
    const slug = `${base}-${suffix()}`;
    const rows = await q<{ slug: string }>(
      `insert into referrer (org_id, slug, name, phone_e164)
       values ($1,$2,$3,$4)
       on conflict (org_id, slug) do nothing
       returning slug`,
      [org, slug, name, phone],
    );
    if (rows[0]) return { slug: rows[0].slug, name };
  }
  throw new Error("Could not create a link. Please try again.");
}

// A LEADER's own personal capture link. Same referrer machinery, but with
// member_id set → resolveOwner auto-assigns anyone who signs up through it to
// THIS leader (not the coordinator). Idempotent: one stable link per leader,
// reused across sessions, so a leader can drop the same link in every DM. The
// contact self-enters (no re-keying, no handle typos), lands in the leader's
// Today queue, and if they leave a number with consent they're textable — the
// tier-1 capture path. resolveOwner honors member_id first (see /join).
export async function getMyLinkAction(): Promise<{ slug: string; name: string }> {
  const s = await requireSession();
  const name = s.name?.trim() || "R20";
  const existing = await q<{ slug: string }>(
    `select slug from referrer where org_id=$1 and member_id=$2 order by created_at limit 1`,
    [s.org, s.sub],
  );
  if (existing[0]) return { slug: existing[0].slug, name };
  const base = slugBase(name);
  for (let i = 0; i < 6; i++) {
    const slug = `${base}-${suffix()}`;
    const rows = await q<{ slug: string }>(
      `insert into referrer (org_id, slug, name, member_id)
       values ($1,$2,$3,$4)
       on conflict (org_id, slug) do nothing
       returning slug`,
      [s.org, slug, name, s.sub],
    );
    if (rows[0]) return { slug: rows[0].slug, name };
  }
  throw new Error("Could not create your link. Please try again.");
}

export type ReferrerInfo = { slug: string; name: string } | null;

export async function getReferrerAction(slug: string): Promise<ReferrerInfo> {
  const org = await orgId();
  const rows = await q<{ slug: string; name: string }>(
    `select slug, name from referrer where org_id=$1 and slug=$2 limit 1`,
    [org, slug],
  );
  return rows[0] ?? null;
}

// --- Intake form submission (the invited friend) ----------------------------
export type JoinInput = {
  firstName: string;
  lastName?: string;
  phone?: string;
  campus?: string;
  smsConsent?: boolean;
  referrerSlug?: string;
  src?: string;
  honeypot?: string;
  turnstileToken?: string;
};

// Verify a Cloudflare Turnstile token server-side (a bot can skip the client
// widget, so the token MUST be checked here). If no secret is configured (local
// dev without keys), verification is skipped so the form still works.
async function verifyTurnstile(token: string | undefined, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

type RefRow = { id: string; member_id: string | null; phone_e164: string | null };

// Auto-assign an owner — NEVER null. Reliability doctrine (SPEC §1): guarantee
// the touch by assigning + escalating, don't leave a captured person ownerless
// waiting for someone to claim. Cascade: (1) inviter is a leader → them;
// (2) trace the inviter (by phone) to a known person → their owning leader, one
// relational degree away; (3) coordinator backstop. The owner then sees this
// person as a "New — never contacted" nudge in their normal Today queue.
async function resolveOwner(org: string, ref: RefRow | undefined, campus?: string | null): Promise<string | null> {
  if (ref?.member_id) return ref.member_id;
  if (ref?.phone_e164) {
    const inv = await q<{ owner_id: string }>(
      `select owner_id from person
       where org_id=$1 and phone_e164=$2 and owner_id is not null
       order by updated_at desc limit 1`,
      [org, ref.phone_e164],
    );
    if (inv[0]?.owner_id) return inv[0].owner_id;
  }
  return captureOwnerFor(org, campus);
}

export async function submitJoinAction(input: JoinInput): Promise<{ ok: true }> {
  if (input.honeypot) return { ok: true }; // silently swallow bots
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  if (!(await verifyTurnstile(input.turnstileToken, ip))) {
    throw new Error("Couldn't verify you're human. Please try again.");
  }
  const firstName = input.firstName.trim();
  if (!firstName) throw new Error("Please enter your name.");
  const org = await orgId();

  const phone = toE164(input.phone);
  const consented = Boolean(phone && input.smsConsent);
  const smsConsent = consented ? "opted_in" : "unknown";
  const campus = input.campus?.trim() || null;
  const lastName = input.lastName?.trim() || null;
  const src = cleanSrc(input.src);

  // Attribution + auto-assign owner (never null — see resolveOwner).
  let referrerId: string | null = null;
  let ref: RefRow | undefined;
  if (input.referrerSlug) {
    const r = await q<RefRow>(
      `select id, member_id, phone_e164 from referrer where org_id=$1 and slug=$2 limit 1`,
      [org, input.referrerSlug],
    );
    ref = r[0];
    referrerId = ref?.id ?? null;
  }
  const ownerId = await resolveOwner(org, ref, campus);

  let personId: string;
  if (phone) {
    // Dedupe on phone (partial unique index). Keep FIRST-touch attribution and
    // never demote an existing person's stage.
    const rows = await q<{ id: string }>(
      `insert into person
         (org_id, first_name, last_name, campus, phone_e164, timezone, sms_consent,
          source, capture_surface, referrer_id, acquisition_src, owner_id, track, stage, created_at)
       values ($1,$2,$3,$4,$5,'America/New_York',$6,
          'web_form','join_form',$7,$8,$9,'warm','Campus', now())
       on conflict (org_id, phone_e164) where phone_e164 is not null
       do update set
         first_name      = coalesce(nullif(excluded.first_name,''), person.first_name),
         last_name       = coalesce(person.last_name, excluded.last_name),
         campus          = coalesce(person.campus, excluded.campus),
         referrer_id     = coalesce(person.referrer_id, excluded.referrer_id),
         acquisition_src = coalesce(person.acquisition_src, excluded.acquisition_src),
         sms_consent = case when excluded.sms_consent='opted_in' then 'opted_in' else person.sms_consent end,
         updated_at  = now()
       returning id`,
      [org, firstName, lastName, campus, phone, smsConsent, referrerId, src, ownerId],
    );
    personId = rows[0].id;
  } else {
    // No phone → no dedupe key; follow-up routes through the inviter relationship.
    const rows = await q<{ id: string }>(
      `insert into person
         (org_id, first_name, last_name, campus, timezone, sms_consent,
          source, capture_surface, referrer_id, acquisition_src, owner_id, track, stage, created_at)
       values ($1,$2,$3,$4,'America/New_York','unknown',
          'web_form','join_form',$5,$6,$7,'warm','Campus', now())
       returning id`,
      [org, firstName, lastName, campus, referrerId, src, ownerId],
    );
    personId = rows[0].id;
  }

  // Append-only TCPA audit — only when they gave a number AND ticked consent.
  if (consented) {
    await q(
      `insert into consent_event
         (org_id, person_id, channel, event, source, consent_text, ip, user_agent, occurred_at)
       values ($1,$2,'sms','opt_in','web_form',$3,$4,$5, now())`,
      [org, personId, CONSENT_TEXT, ip, userAgent],
    );
    // Track B: consented capture → Welcome journey (idempotent). Sends are
    // dry-run (no real texts) until SMS_PROVIDER=twilio post-10DLC.
    await enrollInWelcomeJourney(org, personId).catch(() => {}); // never block the capture on this
  }

  return { ok: true };
}

// --- Link-tree captures (the R20 Nights card: /hi) ---------------------------
// A person who taps a response/prayer at the gathering. Creates (or dedupes) a
// person at Crowd, routes to the coordinator (never null), and drops a note in
// the timeline so the owning leader sees the intent. Enrollment into the New
// Believer / Assimilation journeys is left to the leader after they connect —
// the response button never auto-labels anyone (see the routing decision).

// Create-or-find a person by phone (or fresh if no phone) at a given stage, on
// a given capture surface, owned by the coordinator. Returns the person id.
async function coordinatorId(org: string): Promise<string | null> {
  const r = await q<{ id: string }>(
    `select id from membership where org_id=$1 and is_coordinator order by created_at limit 1`,
    [org],
  );
  return r[0]?.id ?? null;
}

// Campus-routed capture backstop (Alex, 2026-09-11): a capture with a known
// campus goes to that campus's designated receiver (app_setting
// capture_owner.<campus> — Columbia → Maria, NYU → Priya). Unknown campus,
// unset key, or a deactivated receiver falls back to the coordinator, so a
// captured person is never left ownerless.
async function captureOwnerFor(org: string, campus: string | null | undefined): Promise<string | null> {
  if (campus) {
    const set = await q<{ value: string | null }>(
      `select value from app_setting where org_id=$1 and key=$2`, [org, `capture_owner.${campus}`]);
    const id = set[0]?.value?.trim();
    if (id) {
      const ok = await q<{ id: string }>(
        `select id from membership where id=$1 and org_id=$2 and deactivated_at is null`, [id, org]);
      if (ok[0]) return ok[0].id;
    }
  }
  return coordinatorId(org);
}

// Owner for a decision ("took a step toward Jesus") — route to a PASTOR, not the
// coordinator. Oldest pastoral_oversight membership = the on-the-ground pastoral
// lead (Priya today; the teaching pastor is later). Falls back to the coordinator
// so a decision is never left ownerless.
async function pastoralOwnerId(org: string): Promise<string | null> {
  const r = await q<{ id: string }>(
    `select id from membership where org_id=$1 and pastoral_oversight order by created_at limit 1`,
    [org],
  );
  return r[0]?.id ?? (await coordinatorId(org));
}

async function captureAtNights(
  org: string,
  firstName: string,
  phone: string | null,
  captureSurface: string,
  src: string | null,
  ownerOverride?: string | null,
  stage: (typeof STAGES)[number] = "Crowd",
): Promise<string> {
  const owner = ownerOverride !== undefined ? ownerOverride : await coordinatorId(org);
  if (phone) {
    const rows = await q<{ id: string }>(
      `insert into person
         (org_id, first_name, phone_e164, timezone, sms_consent, source, capture_surface, acquisition_src, owner_id, track, stage, created_at)
       values ($1,$2,$3,'America/New_York','unknown','web_form',$4,$5,$6,'warm',$7, now())
       on conflict (org_id, phone_e164) where phone_e164 is not null
       do update set
         first_name = coalesce(nullif(excluded.first_name,''), person.first_name),
         acquisition_src = coalesce(person.acquisition_src, excluded.acquisition_src),
         updated_at = now()
       returning id`,
      [org, firstName, phone, captureSurface, src, owner, stage],
    );
    return rows[0].id;
  }
  const rows = await q<{ id: string }>(
    `insert into person
       (org_id, first_name, timezone, sms_consent, source, capture_surface, acquisition_src, owner_id, track, stage, created_at)
     values ($1,$2,'America/New_York','unknown','web_form',$3,$4,$5,'warm',$6, now())
     returning id`,
    [org, firstName, captureSurface, src, owner, stage],
  );
  return rows[0].id;
}

async function addTimelineNote(org: string, personId: string, note: string): Promise<void> {
  await q(
    `insert into pipeline_activity (org_id, person_id, actor_id, type, note, occurred_at)
     values ($1,$2,null,'note',$3, now())`,
    [org, personId, note],
  );
}

// Append-only TCPA opt-in audit for a public capture (shared by the class-close
// actions). Caller decides whether consent was actually given.
async function recordConsent(org: string, personId: string, ip: string | null, userAgent: string | null): Promise<void> {
  await q(
    `insert into consent_event
       (org_id, person_id, channel, event, source, consent_text, ip, user_agent, occurred_at)
     values ($1,$2,'sms','opt_in','web_form',$3,$4,$5, now())`,
    [org, personId, CONSENT_TEXT, ip, userAgent],
  );
}

// Advance-or-create for the class-close captures (/in, /sent). Dedupe on phone;
// if the person exists BELOW `target`, advance them + log person_stage_history
// (the real funnel signal Movement reads); if already at/above `target`, keep the
// stage (never demote a Core who takes 401) and just refresh; if fresh, create at
// `target`. Consent, if given, is set opted_in but the consent_event is the
// caller's job. Returns whether this was a real forward advance.
async function captureAdvance(
  org: string,
  firstName: string,
  phone: string | null,
  target: (typeof STAGES)[number],
  captureSurface: string,
  src: string | null,
  owner: string | null,
  consented: boolean,
): Promise<{ personId: string; advanced: boolean }> {
  const targetIdx = STAGES.indexOf(target);
  if (phone) {
    const existing = (
      await q<{ id: string; stage: string }>(
        `select id, stage from person where org_id=$1 and phone_e164=$2 limit 1`,
        [org, phone],
      )
    )[0];
    if (existing) {
      const consentSet = consented ? ", sms_consent='opted_in'" : "";
      if (STAGES.indexOf(existing.stage as (typeof STAGES)[number]) < targetIdx) {
        await q(
          `update person set stage=$3, updated_at=now()${consentSet},
             first_name = coalesce(nullif($4,''), first_name),
             acquisition_src = coalesce(acquisition_src, $5)
           where org_id=$1 and id=$2`,
          [org, existing.id, target, firstName, src],
        );
        await q(
          `insert into person_stage_history (org_id, person_id, from_stage, to_stage, changed_by)
           values ($1,$2,$3,$4,null)`,
          [org, existing.id, existing.stage, target],
        );
        return { personId: existing.id, advanced: true };
      }
      await q(
        `update person set updated_at=now()${consentSet},
           first_name = coalesce(nullif($3,''), first_name),
           acquisition_src = coalesce(acquisition_src, $4)
         where org_id=$1 and id=$2`,
        [org, existing.id, firstName, src],
      );
      return { personId: existing.id, advanced: false };
    }
    const rows = await q<{ id: string }>(
      `insert into person
         (org_id, first_name, phone_e164, timezone, sms_consent, source, capture_surface, acquisition_src, owner_id, track, stage, created_at)
       values ($1,$2,$3,'America/New_York',$7,'web_form',$4,$5,$6,'warm',$8, now())
       returning id`,
      [org, firstName, phone, captureSurface, src, owner, consented ? "opted_in" : "unknown", target],
    );
    return { personId: rows[0].id, advanced: true };
  }
  const rows = await q<{ id: string }>(
    `insert into person
       (org_id, first_name, timezone, sms_consent, source, capture_surface, acquisition_src, owner_id, track, stage, created_at)
     values ($1,$2,'America/New_York','unknown','web_form',$3,$4,$5,'warm',$6, now())
     returning id`,
    [org, firstName, captureSurface, src, owner, target],
  );
  return { personId: rows[0].id, advanced: true };
}

// ── Class-close captures — 101 "I'm In" (/in) + 401 "I'm Sent" (/sent) ───────
// These are DEDICATED class-only links/QRs a teacher shows at the END of a 101 or
// 401 session — NOT tiles on the public /hi menu (that's the Nights front door)
// and NOT an inbound-SMS keyword (inbound isn't built). They reuse the /hi tap-
// card pattern (name + optional phone + unchecked TCPA consent) but carry the
// right funnel semantics + routing, and follow-up is a warm human (no journey).

// 101 "I'm In" — belonging, not belief (opt-in + self-paced, never coerced). Taking
// 101 = joining the Community circle, so this records a Crowd→Community advance
// (or creates fresh at Community) and routes to the COORDINATOR for a warm reply +
// community-group-chat add. It ALSO surfaces on the pastoral-only "Recent
// commitments" section of /overview (getRecentCommitmentsAction) as an active prompt
// for a pastor to reach out — the coordinator owns the logistics, a pastor the
// relational welcome (both looped in; INBOX #6 routing = "both get a real action item").
export async function submitInAction(input: {
  firstName: string;
  phone?: string;
  smsConsent?: boolean;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: true }> {
  if (input.honeypot) return { ok: true };
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  const firstName = input.firstName.trim();
  if (!firstName) throw new Error("Please enter your name.");
  const org = await orgId();
  const phone = toE164(input.phone);
  const consented = Boolean(phone && input.smsConsent);
  const owner = await coordinatorId(org);
  const { personId, advanced } = await captureAdvance(
    org, firstName, phone, "Community", "class_101_in", cleanSrc(input.src), owner, consented,
  );
  if (consented) await recordConsent(org, personId, ip, userAgent);
  await addTimelineNote(
    org,
    personId,
    advanced
      ? "🚪 Took the “I’m In” step at 101 — moved into Community. Add to the community group chat + a warm welcome."
      : "🚪 Reaffirmed “I’m In” at 101 — already in Community. Warm welcome + make sure they’re in the group chat.",
  );
  return { ok: true };
}

// 401 "I'm Sent" — the commissioning step (spoken in-room, with this tap-in as the
// fallback / record). 401 grads are already deep, so we FLOOR them at Committed
// (never demote a Core) and drop a "sent" marker. Optionally captures the 2–3
// friends they'll pray for / invite (a timeline note — we do NOT create person rows
// for named-not-present friends; no consent, no auto-labeling). Routes to a PASTOR
// (Alex/Priya).
export async function submitSentAction(input: {
  firstName: string;
  phone?: string;
  smsConsent?: boolean;
  friends?: string;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: true }> {
  if (input.honeypot) return { ok: true };
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  const firstName = input.firstName.trim();
  if (!firstName) throw new Error("Please enter your name.");
  const org = await orgId();
  const phone = toE164(input.phone);
  const consented = Boolean(phone && input.smsConsent);
  const owner = await pastoralOwnerId(org);
  const { personId } = await captureAdvance(
    org, firstName, phone, "Committed", "class_401_sent", cleanSrc(input.src), owner, consented,
  );
  if (consented) await recordConsent(org, personId, ip, userAgent);
  await addTimelineNote(org, personId, "🕊 Commissioned at 401 — “I’m Sent.” Pastoral follow-up: send + resource them.");
  const friends = input.friends?.trim();
  if (friends) await addTimelineNote(org, personId, `Praying for / inviting: ${friends.slice(0, 500)}`);
  return { ok: true };
}

// ── The 30-Second Survey (/survey) — folded into Oikos ───────────────────────
// A leader opens /survey on their phone during a real conversation (or it's a
// shareable link / QR). Every submission stores the LISTENING answers in
// survey_response ("learn the field" data for sermon/bridge prep). If — and only
// if — the student opts in with contact, we ALSO create/match a person at Campus
// (same cold-capture rationale as submitVisitAction: they haven't attended), set
// their preferred channel, record consent, route to the coordinator for the
// same-day human touch, and link person_id back on the survey row. Never
// auto-label. IG-only contacts stay OUT of SMS journeys/STOP (see the IG-DM task).

// Create-or-match a survey opt-in contact at Campus. Dedupe on phone when given
// (never demote / never clobber existing attribution); IG-only or no-phone → fresh.
async function captureSurveyContact(
  org: string,
  firstName: string,
  phone: string | null,
  igHandle: string | null,
  channel: "text" | "instagram",
  src: string | null,
  owner: string | null,
  consented: boolean,
  campus: string | null,
  surface: "survey" | "event_checkin" = "survey",
): Promise<string> {
  if (phone) {
    const rows = await q<{ id: string }>(
      `insert into person
         (org_id, first_name, phone_e164, timezone, sms_consent, source, capture_surface,
          acquisition_src, owner_id, track, stage, preferred_contact, instagram_handle, campus, created_at)
       values ($1,$2,$3,'America/New_York',$4,'web_form',$10,$5,$6,'warm','Campus',$7,$8,$9, now())
       on conflict (org_id, phone_e164) where phone_e164 is not null
       do update set
         first_name        = coalesce(nullif(excluded.first_name,''), person.first_name),
         acquisition_src   = coalesce(person.acquisition_src, excluded.acquisition_src),
         preferred_contact = coalesce(person.preferred_contact, excluded.preferred_contact),
         instagram_handle  = coalesce(person.instagram_handle, excluded.instagram_handle),
         campus            = coalesce(person.campus, excluded.campus),
         sms_consent = case when excluded.sms_consent='opted_in' then 'opted_in' else person.sms_consent end,
         updated_at = now()
       returning id`,
      [org, firstName, phone, consented ? "opted_in" : "unknown", src, owner, channel, igHandle, campus, surface],
    );
    return rows[0].id;
  }
  // IG-only → dedupe on the handle (its own key, since there's no phone). A repeat
  // sign-in with the same @handle merges instead of duplicating; existing owner /
  // attribution are never clobbered.
  if (igHandle) {
    const existing = await q<{ id: string }>(
      `select id from person where org_id=$1 and lower(instagram_handle)=lower($2) and archived_at is null order by created_at limit 1`,
      [org, igHandle],
    );
    if (existing[0]) {
      await q(
        `update person set
           first_name        = coalesce(nullif($3,''), first_name),
           acquisition_src   = coalesce(acquisition_src, $4),
           preferred_contact = coalesce(preferred_contact, $5),
           campus            = coalesce(campus, $6),
           updated_at = now()
         where id=$1 and org_id=$2`,
        [existing[0].id, org, firstName, src, channel, campus],
      );
      return existing[0].id;
    }
  }
  // Genuinely no dedupe key (text channel, no number given) → create fresh.
  const rows = await q<{ id: string }>(
    `insert into person
       (org_id, first_name, timezone, sms_consent, source, capture_surface,
        acquisition_src, owner_id, track, stage, preferred_contact, instagram_handle, campus, created_at)
     values ($1,$2,'America/New_York','unknown','web_form',$8,$3,$4,'warm','Campus',$5,$6,$7, now())
     returning id`,
    [org, firstName, src, owner, channel, igHandle, campus, surface],
  );
  return rows[0].id;
}

export type SurveyInput = {
  // listening answer (optional — a blank is still a fine, submittable answer)
  qExcited?: string;                    // single key from Q_EXCITED_OPTIONS
  qExcitedOther?: string;               // free text when 'something_else'
  // opt-in contact (all optional; a blank is a fine answer)
  optIn?: boolean;
  preferredContact?: "text" | "instagram";
  firstName?: string;
  phone?: string;                       // when preferredContact = 'text'
  instagramHandle?: string;             // when preferredContact = 'instagram'
  smsConsent?: boolean;                 // TCPA — only meaningful for text + phone
  campus?: string;                      // their school (opt-in block) — enables campus-targeted follow-up
  src?: string;
  surveyor?: string;                    // who administered it (?by= link param)
  honeypot?: string;
};

export async function submitSurveyAction(input: SurveyInput): Promise<{ ok: true }> {
  if (input.honeypot) return { ok: true }; // silently swallow bots
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  const org = await orgId();
  const src = cleanSrc(input.src);

  // Sanitize the listening answer against the instrument whitelist — the wire can
  // carry anything, but only known keys land in the store.
  const qExcited = cleanChoice(input.qExcited, Q_EXCITED_OPTIONS);
  const clip = (s: unknown): string | null =>
    typeof s === "string" && s.trim() ? s.trim().slice(0, 300) : null;
  // The free-text only means anything alongside 'something_else'.
  const qExcitedOther = qExcited === "something_else" ? clip(input.qExcitedOther) : null;

  // Opt-in contact — only when they said yes, gave a name, AND gave a usable channel.
  let personId: string | null = null;
  const firstName = input.firstName?.trim() || null;
  const channel: "text" | "instagram" | null =
    input.preferredContact === "instagram" ? "instagram" : input.preferredContact === "text" ? "text" : null;
  const phone = channel === "text" ? toE164(input.phone) : null;
  const igHandle = channel === "instagram" ? normalizeInstagramHandle(input.instagramHandle) : null;
  const hasContact = Boolean(input.optIn && firstName && channel && (phone || igHandle));

  if (hasContact) {
    // Consent is SMS-only: an IG DM opt-in is not TCPA SMS consent.
    const consented = Boolean(channel === "text" && phone && input.smsConsent);
    const campus = ["Columbia", "NYU"].includes(input.campus ?? "") ? input.campus! : null;
    const owner = await captureOwnerFor(org, campus);
    personId = await captureSurveyContact(org, firstName!, phone, igHandle, channel!, src, owner, consented, campus);
    if (consented) await recordConsent(org, personId, ip, userAgent);
    await addTimelineNote(
      org,
      personId,
      channel === "instagram"
        ? `📋 Took the 30-Second Survey and opted in via Instagram (@${igHandle}) — pointed to R20's IG (@${R20_IG_HANDLE}) to start a DM. Watch for their message; reply within 24h. (IG-only — not in SMS journeys.)`
        : "📋 Took the 30-Second Survey and opted in by text. Same-day: a couple of us reach out to invite them to a hang.",
    );
    // Come to Nights reminder loop (Alex, 28 Aug — supersedes the earlier
    // no-auto-enroll call): consented-text opt-ins get the bounded Saturday
    // nudges until they come. IG-only still never enters an SMS sequence
    // (the helper guards on phone + opted_in + Campus stage).
    if (consented) await enrollInNightsReminder(org, personId).catch(() => {});
  }

  // Who administered it — free text from the ?by= link, clipped like the other
  // free-text fields. Lowercased so "Chris" and "Chris" aggregate together.
  const surveyor = clip(input.surveyor)?.toLowerCase().slice(0, 40) ?? null;

  // The listening store — always written, even for an anonymous (no-contact) survey.
  // v3 instrument: q_excited only; the retired columns (v2 identity + spiritual
  // scale, v1 q1/q3/q4) stay at their defaults, legacy data intact.
  await q(
    `insert into survey_response
       (org_id, q_excited, q_excited_other, src, person_id, surveyor)
     values ($1,$2,$3,$4,$5,$6)`,
    [org, qExcited, qExcitedOther, src, personId, surveyor],
  );
  return { ok: true };
}

export type EventCheckinInput = {
  event?: string;                       // ?e= slug from the QR (games-night-1, float-social…)
  firstName: string;
  lastName?: string;                    // universal optional — feeds person.last_name (gate reg + dedup)
  preferredContact?: "text" | "instagram";
  phone?: string;                       // when preferredContact = 'text'
  instagramHandle?: string;             // when preferredContact = 'instagram'
  smsConsent?: boolean;                 // TCPA — only meaningful for text + phone
  campus?: string;                      // optional school pills (Columbia | NYU)
  details?: Record<string, string>;     // per-event extra answers (EVENT_FIELDS) → composed into detail
  src?: string;
  honeypot?: string;
};

// Event sign-in (/event?e=<slug>) — the first-three-weeks capture layer: games
// nights, the float social, field games. Purpose-built to CATCH people ("we're
// getting people through the door; without the contact the effort is wasted" —
// 27 Aug meeting), so unlike the survey the contact is REQUIRED: a real number or
// an IG handle. Creates/matches a person at Campus (pre-Nights event guests, not
// Nights crowd) via the shared capture path (surface 'event_checkin'), routes to
// the coordinator for the same-day text, and logs the event on the timeline plus
// an event_checkin row (the per-event count). The gift-card draw is page copy —
// humans run the draw. Deliberately NO journey auto-enroll (an event sign-in is
// an invite request; IG-only must never enter an SMS sequence).
export async function submitEventCheckinAction(input: EventCheckinInput): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.honeypot) return { ok: true }; // silently swallow bots
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  const org = await orgId();
  const src = cleanSrc(input.src);
  const event = cleanEventSlug(input.event) ?? "event";

  // Validation errors are RETURNED, not thrown: a thrown error in a server
  // action gets masked in production to the generic "Server Components render"
  // digest, so the friendly message never reaches the student. Returning it as
  // data survives to the form.
  const firstName = input.firstName.trim();
  if (!firstName) return { ok: false, error: "Please enter your name." };
  const channel: "text" | "instagram" = input.preferredContact === "instagram" ? "instagram" : "text";
  const phone = channel === "text" ? toE164(input.phone) : null;
  const igHandle = channel === "instagram" ? normalizeInstagramHandle(input.instagramHandle) : null;
  if (channel === "text" && input.phone?.trim() && !phone) return { ok: false, error: "That number doesn't look right. Mind checking it?" };
  if (!phone && !igHandle) return { ok: false, error: "Leave a number or an Instagram handle so we can tell you what's next." };

  const consented = Boolean(channel === "text" && phone && input.smsConsent);
  const campus = ["Columbia", "NYU"].includes(input.campus ?? "") ? input.campus! : null;
  const owner = await captureOwnerFor(org, campus);
  const detail = composeEventDetail(event, input.details);
  const personId = await captureSurveyContact(org, firstName, phone, igHandle, channel, src, owner, consented, campus, "event_checkin");
  // Optional last name → person.last_name; coalesce so a later blank never wipes
  // an existing one (dedupe-on-phone can match someone we already know fully).
  const lastName = input.lastName?.trim().slice(0, 80) || null;
  if (lastName) {
    await q(
      `update person set last_name = coalesce(nullif($3,''), last_name), updated_at=now()
       where org_id=$1 and id=$2`,
      [org, personId, lastName],
    );
  }
  if (consented) {
    await recordConsent(org, personId, ip, userAgent);
    // Immediate warm welcome for someone we just met at an event: Welcome step 1
    // (the TCPA subscription confirmation) sends now, then a personal hello the
    // next day — same door as an invite-link join. Idempotent; goes quiet the
    // moment their leader personally texts them.
    await enrollInWelcomeJourney(org, personId).catch(() => {});
    // Bounded Saturday reminders until they come (guarded: text+consent+Campus).
    await enrollInNightsReminder(org, personId).catch(() => {});
  }
  await addTimelineNote(
    org,
    personId,
    (channel === "instagram"
      ? `🎟️ Signed in at ${eventLabel(event)} (@${igHandle}) — pointed to R20's IG (@${R20_IG_HANDLE}) to start a DM. Watch for their message; reply within 24h. (IG-only — not in SMS journeys.)`
      : `🎟️ Signed in at ${eventLabel(event)}. Same-day: text them what's next.`) +
      (detail ? ` — "${detail}"` : ""),
  );
  await q(
    `insert into event_checkin (org_id, event_slug, first_name, src, person_id, detail)
     values ($1,$2,$3,$4,$5,$6)`,
    [org, event, firstName, src, personId, detail],
  );
  return { ok: true };
}

// A question for the live Q&A (the tap card's question tile). Stored in
// qa_question — the moderator reads the stack on /overview during the food
// window and takes them live. Anonymous-friendly: name optional, no contact,
// NO person row (no contact = nothing to own; friction kills mid-sermon asks).
export async function submitQaQuestionAction(input: {
  body: string;
  firstName?: string;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: true }> {
  if (input.honeypot) return { ok: true };
  const body = input.body?.trim();
  if (!body) throw new Error("Type your question first.");
  const org = await orgId();
  const firstName = input.firstName?.trim() || null;
  await q(
    `insert into qa_question (org_id, body, first_name, src) values ($1,$2,$3,$4)`,
    [org, body.slice(0, 1000), firstName, cleanSrc(input.src)],
  );
  return { ok: true };
}

export type ResponseKind = "talk" | "connect" | "question";
const RESPONSE_LABEL: Record<ResponseKind, string> = {
  talk: "Responded at R20 Nights — something clicked, wants to talk to someone",
  connect: "Responded at R20 Nights — wants to get connected",
  question: "Responded at R20 Nights — has a question / doubt",
};

export async function submitResponseAction(input: {
  kind: ResponseKind;
  firstName: string;
  phone?: string;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: true }> {
  if (input.honeypot) return { ok: true };
  const firstName = input.firstName.trim();
  if (!firstName) throw new Error("Please enter your name.");
  if (!RESPONSE_LABEL[input.kind]) throw new Error("Pick how you'd like to respond.");
  const org = await orgId();
  const personId = await captureAtNights(org, firstName, toE164(input.phone), `linktree_${input.kind}`, cleanSrc(input.src));
  await addTimelineNote(org, personId, RESPONSE_LABEL[input.kind]);
  return { ok: true };
}

// "I took a step toward Jesus tonight" — the decision capture. Deliberately NOT
// auto-labeled and NOT auto-enrolled into New Believer (locked decision: a human
// confirms the tenderest moment). It routes to a PASTOR (not the coordinator),
// drops a clear timeline flag, and shows up in the pastor's Today queue as a new
// nudge. Because tapping THIS tile is an explicit self-declaration (the person
// labels themselves — the app isn't labeling a soul), the New Believer journey
// DOES auto-fire — but only when they gave a phone AND ticked consent (TCPA), so
// an instant, softened, honor-not-overclaim acknowledgment goes out without a
// human bottleneck (dry-run until 10DLC; steps 2–3 skip_if_touched, so the pastor
// always overtakes). No consent → capture only; the profile shows a "reach out
// today · Start New Believer" callout for the pastor to enroll manually.
export async function submitDecisionAction(input: {
  firstName: string;
  phone?: string;
  smsConsent?: boolean;
  preferredContact?: string;
  instagramHandle?: string;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.honeypot) return { ok: true };
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  const firstName = input.firstName.trim();
  // Return (don't throw) validation — a thrown error is masked in prod.
  if (!firstName) return { ok: false, error: "Please enter your name." };
  const org = await orgId();
  const phone = toE164(input.phone);
  // Contact is REQUIRED here (Alex, 2026-08-15): a real number OR an IG handle —
  // a decision must never be unreachable.
  const igHandle = normalizeInstagramHandle(input.instagramHandle);
  if (input.phone?.trim() && !phone) return { ok: false, error: "That number doesn't look right. Mind checking it?" };
  if (!phone && !igHandle) return { ok: false, error: "Leave a number or an Instagram handle so a pastor can reach you." };
  const consented = Boolean(phone && input.smsConsent);
  // Decisions route to the coordinator like other captures (Alex, 2026-08-15) —
  // she reaches out same-day AND tells the pastor right away (the note says so).
  const owner = await coordinatorId(org);
  const personId = await captureAtNights(org, firstName, phone, "linktree_decision", cleanSrc(input.src), owner);
  // IG-DM contact choice — channel preference, NOT SMS consent.
  if (igHandle && !phone) {
    await q(
      `update person set instagram_handle=$3, preferred_contact='instagram', updated_at=now()
       where org_id=$1 and id=$2`,
      [org, personId, igHandle],
    );
  }
  if (consented) {
    await q(
      `update person set sms_consent='opted_in', updated_at=now()
       where org_id=$1 and id=$2 and sms_consent <> 'opted_in'`,
      [org, personId],
    );
    await q(
      `insert into consent_event
         (org_id, person_id, channel, event, source, consent_text, ip, user_agent, occurred_at)
       values ($1,$2,'sms','opt_in','web_form',$3,$4,$5, now())`,
      [org, personId, CONSENT_TEXT, ip, userAgent],
    );
  }
  await addTimelineNote(
    org,
    personId,
    consented
      ? "🙏 Took a step toward Jesus at R20 Nights — reach out personally today AND tell the pastor right away (New Believer journey auto-started)"
      : "🙏 Took a step toward Jesus at R20 Nights — reach out personally today AND tell the pastor right away + start the New Believer journey",
  );
  // Explicit self-declaration → auto-fire New Believer (consent-gated, idempotent,
  // dry-run until 10DLC). Never blocks the capture on enrollment.
  if (consented) await enrollInJourney(org, personId, NEW_BELIEVER_JOURNEY_ID).catch(() => {});
  // They're at a Night — the Come to Nights reminders have done their job.
  await completeNightsReminderOnArrival(org, personId).catch(() => {});
  return { ok: true };
}

export async function submitPrayerAction(input: {
  firstName: string;
  phone?: string;
  request: string;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: true }> {
  if (input.honeypot) return { ok: true };
  const firstName = input.firstName.trim();
  const request = input.request.trim();
  if (!firstName) throw new Error("Please enter your name.");
  if (!request) throw new Error("Add a short prayer request.");
  const org = await orgId();
  const personId = await captureAtNights(org, firstName, toE164(input.phone), "linktree_prayer", cleanSrc(input.src));
  await addTimelineNote(org, personId, `Prayer request: ${request.slice(0, 500)}`);
  return { ok: true };
}

// First-time-guest-at-Nights capture (Reach Phase-2). The true Campus→Crowd
// conversion event: someone taps "I'm new here tonight" at R20 Nights. Fresh
// walk-up → new person at Crowd (new inflow). Already known at an earlier circle
// (e.g. a Campus-pool contact who finally showed up) → ADVANCE them to Crowd and
// log it in person_stage_history, so the Movement snapshot reads a real
// Campus→Crowd advance rather than being blind to who converted. Already Crowd+
// → just a "came back" note (feeds the returned/2nd-touch signal). Routes to the
// coordinator like the other Nights captures; never auto-labels.
//   If they gave a phone AND ticked consent, we (a) record a TCPA consent_event
// and (b) auto-enroll the ASSIMILATION journey (item #3 auto-fire) — but ONLY for
// someone genuinely new to Nights (a fresh capture or a Campus→Crowd advance), not
// a returning Crowd+ regular. Enrollment is idempotent + dry-run until 10DLC, and
// skip_if_touched means the moment a leader texts them the sequence yields. No
// consent → capture only; a leader follows up in person (+ can enroll manually).
export async function submitFirstTimeGuestAction(input: {
  firstName: string;
  phone?: string;
  campus?: string;
  smsConsent?: boolean;
  preferredContact?: string;
  instagramHandle?: string;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.honeypot) return { ok: true };
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  const firstName = input.firstName.trim();
  if (!firstName) return { ok: false, error: "Please enter your name." };
  const org = await orgId();
  const phone = toE164(input.phone);
  // Contact is REQUIRED here (Alex, 2026-08-15): a real number OR an IG handle.
  // Return (don't throw) validation — a thrown error is masked in prod.
  const igHandle = normalizeInstagramHandle(input.instagramHandle);
  if (input.phone?.trim() && !phone) return { ok: false, error: "That number doesn't look right. Mind checking it?" };
  if (!phone && !igHandle) return { ok: false, error: "Leave a number or an Instagram handle so we can say hi." };
  const campus = input.campus?.trim() || null;
  const src = cleanSrc(input.src);
  const consented = Boolean(phone && input.smsConsent);
  const owner = await coordinatorId(org);
  const crowdIdx = STAGES.indexOf("Crowd");

  let personId: string;
  let newToNights: boolean; // fresh capture or a Campus→Crowd advance (not a returning regular)

  if (phone) {
    const existing = (
      await q<{ id: string; stage: string }>(
        `select id, stage from person where org_id=$1 and phone_e164=$2 limit 1`,
        [org, phone],
      )
    )[0];
    if (existing) {
      const consentSet = consented ? ", sms_consent='opted_in'" : "";
      if (STAGES.indexOf(existing.stage as (typeof STAGES)[number]) < crowdIdx) {
        // Real conversion: a known earlier-circle contact showed up at Nights.
        await q(
          `update person set stage='Crowd', updated_at=now()${consentSet},
             first_name = coalesce(nullif($3,''), first_name),
             campus = coalesce(campus, $4),
             acquisition_src = coalesce(acquisition_src, $5)
           where org_id=$1 and id=$2`,
          [org, existing.id, firstName, campus, src],
        );
        await q(
          `insert into person_stage_history (org_id, person_id, from_stage, to_stage, changed_by)
           values ($1,$2,$3,'Crowd',null)`,
          [org, existing.id, existing.stage],
        );
        await addTimelineNote(org, existing.id, "Came to R20 Nights (first-time check-in) — moved Campus → Crowd");
        newToNights = true;
      } else {
        await q(
          `update person set updated_at=now()${consentSet},
             first_name = coalesce(nullif($3,''), first_name),
             campus = coalesce(campus, $4),
             acquisition_src = coalesce(acquisition_src, $5)
           where org_id=$1 and id=$2`,
          [org, existing.id, firstName, campus, src],
        );
        await addTimelineNote(org, existing.id, "Came to R20 Nights again (self check-in)");
        newToNights = false;
      }
      personId = existing.id;
    } else {
      const rows = await q<{ id: string }>(
        `insert into person
           (org_id, first_name, campus, phone_e164, timezone, sms_consent, source, capture_surface, acquisition_src, owner_id, track, stage, created_at)
         values ($1,$2,$3,$4,'America/New_York',$7,'web_form','nights_first_time',$5,$6,'warm','Crowd', now())
         returning id`,
        [org, firstName, campus, phone, src, owner, consented ? "opted_in" : "unknown"],
      );
      personId = rows[0].id;
      await addTimelineNote(org, personId, "First time at R20 Nights (self check-in)");
      newToNights = true;
    }
  } else {
    const rows = await q<{ id: string }>(
      `insert into person
         (org_id, first_name, campus, timezone, sms_consent, source, capture_surface, acquisition_src, owner_id, track, stage, created_at)
       values ($1,$2,$3,'America/New_York','unknown','web_form','nights_first_time',$4,$5,'warm','Crowd', now())
       returning id`,
      [org, firstName, campus, src, owner],
    );
    personId = rows[0].id;
    await addTimelineNote(org, personId, "First time at R20 Nights (self check-in)");
    newToNights = true;
  }

  // IG-DM contact choice — a channel preference, NOT SMS consent (keeps them
  // out of SMS journeys via the preferred_contact guardrail).
  if (igHandle && !phone) {
    await q(
      `update person set instagram_handle=$3, preferred_contact='instagram', updated_at=now()
       where org_id=$1 and id=$2`,
      [org, personId, igHandle],
    );
  }

  if (consented) {
    await q(
      `insert into consent_event
         (org_id, person_id, channel, event, source, consent_text, ip, user_agent, occurred_at)
       values ($1,$2,'sms','opt_in','web_form',$3,$4,$5, now())`,
      [org, personId, CONSENT_TEXT, ip, userAgent],
    );
    // Auto-fire Assimilation for someone new to Nights (idempotent; dry-run until
    // 10DLC). Not for a returning regular — they're already in the room.
    if (newToNights) await enrollInJourney(org, personId, ASSIMILATION_JOURNEY_ID).catch(() => {});
  }

  // They're at a Night — the Come to Nights reminders have done their job.
  await completeNightsReminderOnArrival(org, personId).catch(() => {});
  return { ok: true };
}

// "I want to come to a Saturday" — the COLD / ad-visitor intent (found us via a
// Meta/IG ad or a dorm-drop QR, NOT yet at a Night). Unlike the first-time-guest
// capture (someone physically present → Crowd), this person hasn't attended, so
// they're created at CAMPUS — a warm lead who intends to come. They advance to
// Crowd for real when they show up and tap "get connected" (submitFirstTimeGuest-
// Action logs the Campus→Crowd stage-history — the true conversion signal). Routes
// to the coordinator for the NON-NEGOTIABLE same-day human text with the where +
// a heads-up (for cold ad traffic: no human, no spend). Records ?src= + consent;
// never auto-labels. (R20_Hi_Page_Copy_Oikos_Spec.md §2.)
export async function submitVisitAction(input: {
  firstName: string;
  phone?: string;
  smsConsent?: boolean;
  hasCuid?: boolean;
  lastName?: string;
  email?: string;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: true }> {
  if (input.honeypot) return { ok: true };
  const h = await headers();
  const ip = h.get("x-forwarded-for") ?? null;
  const userAgent = h.get("user-agent") ?? null;
  const firstName = input.firstName.trim();
  if (!firstName) throw new Error("Please enter your name.");
  const org = await orgId();
  const phone = toE164(input.phone);
  const consented = Boolean(phone && input.smsConsent);
  const personId = await captureAtNights(org, firstName, phone, "linktree_visit", cleanSrc(input.src), undefined, "Campus");
  // Campus gate access (Columbia is CUID + registered-guests only): record
  // whether they hold a CUID; without one, full name + email feed the Saturday
  // gate list (Columbia's guest registration emails a per-day QR).
  if (typeof input.hasCuid === "boolean") {
    const lastName = input.lastName?.trim() || null;
    const email = input.email?.trim().toLowerCase() || null;
    if (input.hasCuid === false && (!lastName || !email || !/\S+@\S+\.\S+/.test(email))) {
      throw new Error("Add your last name and a working email so we can register you for campus access.");
    }
    await q(
      `update person set has_cuid=$3,
         last_name = coalesce(nullif($4,''), last_name),
         email = coalesce(nullif($5,''), email),
         updated_at=now()
       where org_id=$1 and id=$2`,
      [org, personId, input.hasCuid, lastName ?? "", email ?? ""],
    );
  }
  if (consented) {
    await q(
      `update person set sms_consent='opted_in', updated_at=now()
       where org_id=$1 and id=$2 and sms_consent <> 'opted_in'`,
      [org, personId],
    );
    await recordConsent(org, personId, ip, userAgent);
    // "I want to come" + consent = the clearest case for the Come to Nights
    // Saturday reminders (bounded, skip_if_touched; completes on arrival).
    await enrollInNightsReminder(org, personId).catch(() => {});
  }
  await addTimelineNote(
    org,
    personId,
    input.hasCuid === false
      ? "Wants to come to a Saturday (found us via an ad/QR) — send the where + a heads-up, same-day. ⚠ NO Columbia ID: add to the Saturday gate list (guest registration by Fri 5pm; QR goes to their email)."
      : "Wants to come to a Saturday (found us via an ad/QR) — send the where + a heads-up, same-day.",
  );
  // Last-minute signups (Friday after 5pm ET — past the portal deadline — or
  // any time Saturday): ping the coordinator's phone in real time; a same-day
  // guest registration (Columbia leader, 2/person) is the only way these get
  // through the gate. Never blocks the capture; alerts off when setting empty.
  try {
    const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", hourCycle: "h23", timeZone: "America/New_York" }).formatToParts(new Date());
    const dow = parts.find((p) => p.type === "weekday")?.value;
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    if (dow === "Sat" || (dow === "Fri" && hour >= 17)) {
      const alertTo = (
        await q<{ value: string | null }>(
          `select value from app_setting where org_id=$1 and key='coordinator_alert_phone'`,
          [org],
        )
      )[0]?.value?.trim();
      if (alertTo) {
        const gateBit = input.hasCuid === false
          ? " — NO Columbia ID, needs SAME-DAY guest registration"
          : input.hasCuid === true
            ? " (has a CUID)"
            : "";
        const when = dow === "Sat" ? "TONIGHT" : "this Saturday (past the Friday gate deadline)";
        await sendStaffAlert(alertTo, `R20: ${firstName} just signed up to come ${when}${gateBit}. Details in Oikos.`);
      }
    }
  } catch { /* alert must never break the capture */ }
  return { ok: true };
}

// Public read of the editable "what to expect at Nights" content (admin edits it
// in Settings via setNightsInfoAction). Empty/absent → link-tree renders the
// structured NIGHT_TIMELINE (src/lib/events.ts — kept in lockstep with the Service
// Guide's run-of-show). A non-empty setting OVERRIDES the timeline as plain text —
// the admin escape hatch. The default is a timeline, not a paragraph, because
// guests scan, they don't read (NN/g eyetracking).
export async function getNightsInfoAction(): Promise<string> {
  const org = await orgId();
  const r = await q<{ value: string | null }>(
    `select value from app_setting where org_id=$1 and key='nights_info'`,
    [org],
  );
  return r[0]?.value?.trim() || "";
}

// The weekly "What to Expect Tonight" card (public read, org-scoped). The sermon-prep
// app publishes it into public.tonight_card; here we render it UNDER the evergreen
// nights_info on /hi's "expect" view (SPEC_what_to_expect_tonight.md). Fields are split
// pre-talk-safe (title/question/passages) vs. after-the-talk (turn/open_questions/
// next_step/keep_line/go_deeper) so the page can wall off the spoiler block.
//   "Current card" = the row for this week's Saturday, else the latest effective_date
// <= today. Returns null if nothing is published (the page falls back to evergreen-only).
export type TonightPassage = { ref: string; why?: string; text?: string };
export type TonightCard = {
  effectiveDate: string; // YYYY-MM-DD (the Saturday)
  title: string;
  question: string;
  passages: TonightPassage[];
  turn: string | null;
  openQuestions: string[];
  nextStep: string | null;
  keepLine: string | null;
  goDeeper: string | null;
};

export async function getTonightCardAction(): Promise<TonightCard | null> {
  const org = await orgId();
  const rows = await q<{
    effective_date: string;
    title: string;
    question: string;
    passages: unknown;
    turn: string | null;
    open_questions: unknown;
    next_step: string | null;
    keep_line: string | null;
    go_deeper: string | null;
  }>(
    `select to_char(effective_date,'YYYY-MM-DD') as effective_date,
            title, question, passages, turn, open_questions, next_step, keep_line, go_deeper
       from public.tonight_card
      where org_id=$1 and effective_date <= current_date
      order by effective_date desc
      limit 1`,
    [org],
  );
  const r = rows[0];
  if (!r) return null;
  const passages: TonightPassage[] = Array.isArray(r.passages)
    ? (r.passages as unknown[])
        .map((p) => {
          const o = (p ?? {}) as { ref?: unknown; why?: unknown; text?: unknown };
          const ref = typeof o.ref === "string" ? o.ref.trim() : "";
          const why = typeof o.why === "string" ? o.why.trim() : "";
          // `text` = the passage printed in full on the card (optional). Guests
          // read the verses without leaving the page for a Bible app.
          const text = typeof o.text === "string" ? o.text.trim() : "";
          return ref ? { ref, ...(why ? { why } : {}), ...(text ? { text } : {}) } : null;
        })
        .filter((p): p is TonightPassage => p !== null)
    : [];
  const openQuestions: string[] = Array.isArray(r.open_questions)
    ? (r.open_questions as unknown[]).filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];
  return {
    effectiveDate: r.effective_date,
    title: r.title,
    question: r.question,
    passages,
    turn: r.turn?.trim() || null,
    openQuestions,
    nextStep: r.next_step?.trim() || null,
    keepLine: r.keep_line?.trim() || null,
    goDeeper: r.go_deeper?.trim() || null,
  };
}

// Post-Nights "how was tonight?" pulse (public, low-friction). One-tap rating
// (1 rough … 4 great) + an optional honest line + optional name. NOT a person row —
// this is anonymous sentiment about the gathering, read by admins on /overview.
// Returns a result object (Next redacts thrown Server-Action errors in prod).
export async function submitServiceFeedbackAction(input: {
  rating?: number;
  comment?: string;
  firstName?: string;
  phone?: string;
  src?: string;
  honeypot?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.honeypot) return { ok: true }; // bot trap: pretend success
  const rating =
    typeof input.rating === "number" && Number.isInteger(input.rating) && input.rating >= 1 && input.rating <= 4
      ? input.rating
      : null;
  const comment = input.comment?.trim() || null;
  if (rating === null && !comment) return { ok: false, error: "Tap a rating or leave a quick line." };
  const firstName = input.firstName?.trim() || null;
  // Optional number for a human reply — must parse as a real number (a junk
  // number defeats the "text back" purpose). Lives on the feedback row only —
  // NOT a person row, NOT SMS consent, never journey-enrolled.
  let phone: string | null = null;
  if (input.phone?.trim()) {
    phone = toE164(input.phone);
    if (!phone) return { ok: false, error: "That number doesn't look right. Mind checking it?" };
  }
  try {
    const org = await orgId();
    await q(
      `insert into service_feedback (org_id, rating, comment, first_name, phone, src)
       values ($1,$2,$3,$4,$5,$6)`,
      [org, rating, comment, firstName, phone, cleanSrc(input.src)],
    );
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't send that. Try again in a moment." };
  }
}
