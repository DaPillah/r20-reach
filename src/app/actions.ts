"use server";

import { q } from "@/lib/db";
import { toE164 } from "@/lib/phone";
import { getSession, requireSession } from "@/lib/session";
import { sendSms, sendStaffAlert } from "@/lib/sms";
import { ASSIMILATION_JOURNEY_ID, NEW_BELIEVER_JOURNEY_ID, STAY_WARM_JOURNEY_ID, enrollInJourney } from "@/lib/journeys";
import { COUNSEL_ENABLED, counselLeader, type CounselGuidance } from "@/lib/counsel";
import { deriveEngagement, type AttendanceMark, type EngagementInputs } from "@/lib/engagementHealth";
import { isQuietSeason, quietSeasonKind } from "@/lib/academicCalendar";
import { Q_EXCITED_OPTIONS, Q_IDENTITY_OPTIONS, Q1_OPTIONS, Q3_OPTIONS, Q4A_OPTIONS, Q4B_OPTIONS, type Opt } from "@/lib/survey";
import { STAGES, normalizeInstagramHandle, type Activity, type Campus, type Coverage, type DraftTemplates, type Gender, type Hangout, type Leader, type Person, type PreferredContact, type SchoolYear, type Stage, type TouchType } from "@/lib/types";
import { EVENT_PHRASE, EVENT_RSVP, cleanEventSlug, type LiveEventConfig } from "@/lib/events";
import { getLiveEventConfig } from "@/lib/eventConfig";

function iso(v: unknown): string | null {
  return v instanceof Date ? v.toISOString() : (v as string | null);
}

function mapPerson(r: Record<string, unknown>): Person {
  return {
    id: r.id as string,
    firstName: (r.first_name as string) ?? "",
    lastName: (r.last_name as string) ?? "",
    campus: r.campus as Person["campus"],
    gender: (r.gender as Person["gender"]) ?? null,
    phone: (r.phone_e164 as string) ?? "",
    stage: ((r.stage as Stage) ?? "Campus") as Stage,
    ownerId: (r.owner_id as string) ?? null,
    hangoutId: (r.hangout_id as string) ?? null,
    lastTouchAt: iso(r.last_touch_at),
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    invitedByName: (r.invited_by_name as string) ?? null,
    events: (r.events as string[] | null) ?? [],
    replies: (r.replies as string[] | null) ?? [],
    dormantAt: iso(r.dormant_at),
    dormantReason: (r.dormant_reason as string) ?? null,
    servingRole: (r.serving_role as string) ?? null,
    nycLocal: Boolean(r.nyc_local),
    summerReason: (r.summer_reason as string) ?? null,
    captureSurface: (r.capture_surface as string) ?? null,
    followRequestedAt: r.follow_requested_at ? new Date(r.follow_requested_at as string).toISOString() : null,
    apprenticeOf: (r.apprentice_of as string) ?? null,
    instagramHandle: (r.instagram_handle as string) ?? null,
    preferredContact: ((r.preferred_contact as Person["preferredContact"]) ?? "text"),
    optedIn: r.sms_consent === "opted_in" && !!r.phone_e164,
    email: (r.email as string) ?? null,
    hasCuid: typeof r.has_cuid === "boolean" ? (r.has_cuid as boolean) : null,
    schoolYear: (r.school_year as Person["schoolYear"]) ?? null,
  };
}

function mapActivity(r: Record<string, unknown>): Activity {
  return {
    id: r.id as string,
    personId: r.person_id as string,
    type: r.type as TouchType,
    note: (r.note as string) ?? undefined,
    at: iso(r.occurred_at) ?? new Date(0).toISOString(),
  };
}

export type Snapshot = {
  people: Person[];
  leaders: Leader[];
  currentLeaderId: string;
  currentRole: string;
  currentIsPastoral: boolean;
  campusLeadOf: string | null; // the campus this member leads (sees all of), if any
  counselEnabled: boolean; // gated shepherding-assist visible (flag on + pastoral)
  hangouts: Hangout[];
  activities: Activity[];
  coverages: Coverage[]; // active coverage the current leader is doing (admins: all)
  eventConfig: LiveEventConfig; // DB-over-code event config (RSVP pushes + phrases) for the invite pre-fill
};

const EMPTY: Snapshot = {
  people: [],
  leaders: [],
  currentLeaderId: "",
  currentRole: "",
  currentIsPastoral: false,
  campusLeadOf: null,
  counselEnabled: false,
  hangouts: [],
  activities: [],
  coverages: [],
  eventConfig: { rsvp: EVENT_RSVP, phrases: EVENT_PHRASE }, // code fallback pre-login
};

export async function getSnapshot(): Promise<Snapshot> {
  const session = await getSession();
  if (!session) return EMPTY;
  const org = session.org;
  // Visibility scope: admins (ops + pastoral) see the whole roster; a Bible-Hangout
  // leader sees the people they own PLUS anyone they're actively covering for another
  // leader (see leader_coverage). This is the authoritative server-side gate — every
  // downstream surface (People, Funnel, Today, search, person profile, activity history)
  // reads from this snapshot, so scoping here scopes them all. Never trust the client.
  // ($2 = isAdmin short-circuit, $3 = the leader's id.) `coveredScope` is the reusable
  // "owned-or-covered" predicate on a `person` alias.
  const isAdmin = session.role === "admin";
  // A campus lead (membership.campus_lead) additionally SEES everyone on their
  // campus — a read scope for oversight/coordination — PLUS any untagged
  // (no-campus) event attendee, so they can see their events' RSVPs/sign-ins
  // (event captures land with no campus) without being seeded as an event lead
  // per event. Their Today queue is unchanged: the Today page still filters to
  // owned/covered before computing nudges, so a wider snapshot never floods
  // their follow-ups. null = not a lead.
  const campusLead =
    (await q<{ campus_lead: string | null }>(`select campus_lead from membership where id=$1`, [session.sub]))[0]
      ?.campus_lead ?? null;
  const coveredScope = (alias: string) => `(
    ${alias}.owner_id = $3 or ${alias}.owner_id in (
      select covered_id from leader_coverage
      where org_id=$1 and covering_id=$3
        and starts_on <= current_date and (ends_on is null or ends_on >= current_date)
    ))`;

  const people = (
    await q(
      `select p.id, p.first_name, p.last_name, p.campus, p.gender, p.phone_e164, p.stage,
              p.owner_id, p.hangout_id, p.last_touch_at, p.created_at,
              p.dormant_at, p.dormant_reason, p.serving_role, p.nyc_local, p.summer_reason, p.capture_surface, p.follow_requested_at, p.apprentice_of,
              p.instagram_handle, p.preferred_contact, p.sms_consent, p.email, p.has_cuid, p.school_year, r.name as invited_by_name,
              (select array_agg(distinct ec.event_slug) from event_checkin ec where ec.person_id = p.id) as events,
              (select array_agg(distinct er.event_slug) from event_reply er where er.person_id = p.id) as replies
       from person p
       left join referrer r on r.id = p.referrer_id
       where p.org_id=$1 and p.archived_at is null
         and ($2 or ${coveredScope("p")} or ($4::text is not null and p.campus = $4)
              or ($4::text is not null and p.campus is null
                  and exists (select 1 from event_checkin ec3 where ec3.person_id = p.id))
              or exists (
                select 1 from event_checkin ec
                join event_lead el on el.org_id = p.org_id and el.event_slug = ec.event_slug and el.member_id = $3
                where ec.person_id = p.id
              ))
       order by p.first_name`,
      [org, isAdmin, session.sub, campusLead],
    )
  ).map(mapPerson);

  // Active coverage the current leader is doing (for the Today "you're covering X"
  // banner + the client-side owned-or-covered filter). Admins see all coverages.
  const coverages: Coverage[] = (
    await q(
      `select c.covering_id, c.covered_id, coalesce(m.full_name,'—') covered_name,
              to_char(c.ends_on,'YYYY-MM-DD') ends_on
       from leader_coverage c left join membership m on m.id=c.covered_id
       where c.org_id=$1 and ($2 or c.covering_id=$3)
         and c.starts_on <= current_date and (c.ends_on is null or c.ends_on >= current_date)`,
      [org, isAdmin, session.sub],
    )
  ).map((r) => ({
    coveringId: r.covering_id as string,
    coveredId: r.covered_id as string,
    coveredName: (r.covered_name as string) ?? "—",
    endsOn: (r.ends_on as string) ?? null,
  }));

  const leaders: Leader[] = (
    await q(`select id, full_name, is_coordinator, role, draft_templates from membership where org_id=$1 and deactivated_at is null order by full_name`, [org])
  ).map((r) => ({
    id: r.id as string,
    name: (r.full_name as string) ?? "—",
    isCoordinator: Boolean(r.is_coordinator),
    role: (r.role as string) ?? "leader",
    draftTemplates: (r.draft_templates as Leader["draftTemplates"]) ?? {},
  }));

  const groups = await q(
    `select g.id, g.name, g.campus,
       coalesce((select json_agg(gm.person_id) from group_membership gm where gm.group_id=g.id), '[]') as member_ids
     from "group" g join group_type gt on gt.id=g.group_type_id
     where g.org_id=$1 and gt.name='Bible Hangout' order by g.name`,
    [org],
  );
  const hangouts: Hangout[] = groups.map((g) => ({
    id: g.id as string,
    name: g.name as string,
    campus: g.campus as Hangout["campus"],
    leaderId: null,
    memberIds: (g.member_ids as string[]) ?? [],
    health: null,
  }));

  // Scope activity history the same way — a leader only gets touches for people
  // they own or cover, so the client-side activitiesFor() can never surface an
  // out-of-scope person's history even if probed.
  const activities = (
    await q(
      `select pa.id, pa.person_id, pa.type, pa.note, pa.occurred_at
       from pipeline_activity pa
       where pa.org_id=$1 and ($2 or exists (
         select 1 from person p where p.id = pa.person_id and ${coveredScope("p")}))
       order by pa.occurred_at desc`,
      [org, isAdmin, session.sub],
    )
  ).map(mapActivity);

  return {
    people,
    leaders,
    currentLeaderId: session.sub,
    currentRole: session.role,
    currentIsPastoral: await isPastoral(session.sub),
    campusLeadOf: campusLead,
    counselEnabled: COUNSEL_ENABLED && (await isPastoral(session.sub)),
    hangouts,
    activities,
    coverages,
    eventConfig: await getLiveEventConfig(),
  };
}

// Can the acting session touch this person? True for admins, the owner, or a
// leader actively covering the owner. Shared gate for dormant/reconnect.
async function canManagePerson(sub: string, org: string, personId: string): Promise<boolean> {
  const row = (
    await q<{ ok: boolean }>(
      `select (
         m.role = 'admin'
         or p.owner_id = $1
         or exists (
           select 1 from leader_coverage c
           where c.org_id=$3 and c.covering_id=$1 and c.covered_id=p.owner_id
             and c.starts_on <= current_date and (c.ends_on is null or c.ends_on >= current_date)
         )
       ) ok
       from person p, membership m
       where p.id=$2 and p.org_id=$3 and m.id=$1`,
      [sub, personId, org],
    )
  )[0];
  return Boolean(row?.ok);
}

// ── Resting / dormant tier ──────────────────────────────────────────────────
// Set a person down for a season (off the active Today queue, still in the roster)
// or bring them back. Owner / coverer / admin only.
export async function setDormantAction(personId: string, reason?: string): Promise<void> {
  const s = await requireSession();
  if (!(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  await q(
    `update person set dormant_at=now(), dormant_reason=$2, updated_at=now() where id=$1 and org_id=$3`,
    [personId, reason?.trim() || null, s.org],
  );
}

export async function reconnectAction(personId: string): Promise<void> {
  const s = await requireSession();
  if (!(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  await q(
    `update person set dormant_at=null, dormant_reason=null, updated_at=now() where id=$1 and org_id=$2`,
    [personId, s.org],
  );
}

// Ministry: set/clear a person's serving role. Owner / coverer / admin only.
// Powers the aggregate serving ratio (sending capacity, not seating capacity).
export async function setServingRoleAction(personId: string, role: string | null): Promise<void> {
  const s = await requireSession();
  if (!(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  await q(`update person set serving_role=$2, updated_at=now() where id=$1 and org_id=$3`, [
    personId,
    role?.trim() || null,
    s.org,
  ]);
}

// Mark/unmark a person as an apprentice being raised by their owning leader
// ("we plant, we don't split"). apprentice_of = the person's owner (the leader
// raising them); clearing sets it null. Owner-or-admin. Feeds the Raising &
// Sending lens's named raising-tree (see SUCCESSION.md).
export async function setApprenticeAction(personId: string, on: boolean): Promise<void> {
  const s = await requireSession();
  if (!(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  await q(
    `update person set apprentice_of = case when $2 then owner_id else null end, updated_at=now()
     where id=$1 and org_id=$3`,
    [personId, on, s.org],
  );
}

// Flag/unflag a member as NYC-local (home base in the city → part of the summer pool
// when campus empties out). Owner-or-admin, same gate as serving/rest.
export async function setNycLocalAction(personId: string, value: boolean, reason?: string | null): Promise<void> {
  const s = await requireSession();
  if (!(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  // Turning it off clears the reason; turning on stores the reason (or null if unset).
  await q(`update person set nyc_local=$2, summer_reason=$4, updated_at=now() where id=$1 and org_id=$3`, [
    personId,
    value,
    s.org,
    value ? (reason ?? null) : null,
  ]);
}

// Mark/unmark that a person replied to an event's reach-out. The app can't see
// inbound texts, so a leader records it by hand; the next event's invite draft
// branches on it (replied → warm "come to the next one", else the softer re-ask).
// Owner / coverer / admin — same gate as the other per-person toggles.
export async function setRepliedAction(personId: string, slug: string, replied: boolean): Promise<void> {
  const s = await requireSession();
  if (!(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  const clean = cleanEventSlug(slug);
  if (!clean) throw new Error("bad slug");
  if (replied) {
    await q(
      `insert into event_reply (org_id, person_id, event_slug, replied_at, by_member_id)
       values ($1,$2,$3,now(),$4)
       on conflict (org_id, person_id, event_slug) do update set replied_at=now(), by_member_id=$4`,
      [s.org, personId, clean, s.sub],
    );
  } else {
    await q(`delete from event_reply where org_id=$1 and person_id=$2 and event_slug=$3`, [s.org, personId, clean]);
  }
}

// ── Leader coverage (admin) ─────────────────────────────────────────────────
// One leader tends another's people for a season without taking ownership.
export type CoverageRow = {
  id: string;
  coveringId: string;
  coveringName: string;
  coveredId: string;
  coveredName: string;
  endsOn: string | null;
  active: boolean;
};

export async function listCoveragesAction(): Promise<CoverageRow[]> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) return [];
  return (
    await q(
      `select c.id, c.covering_id, coalesce(mc.full_name,'—') covering_name,
              c.covered_id, coalesce(md.full_name,'—') covered_name,
              to_char(c.ends_on,'YYYY-MM-DD') ends_on,
              (c.starts_on <= current_date and (c.ends_on is null or c.ends_on >= current_date)) active
       from leader_coverage c
       left join membership mc on mc.id=c.covering_id
       left join membership md on md.id=c.covered_id
       where c.org_id=$1 order by active desc, covering_name`,
      [s.org],
    )
  ).map((r) => ({
    id: r.id as string,
    coveringId: r.covering_id as string,
    coveringName: (r.covering_name as string) ?? "—",
    coveredId: r.covered_id as string,
    coveredName: (r.covered_name as string) ?? "—",
    endsOn: (r.ends_on as string) ?? null,
    active: Boolean(r.active),
  }));
}

export async function addCoverageAction(coveringId: string, coveredId: string, endsOn?: string): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  if (coveringId === coveredId) throw new Error("A leader can't cover themselves.");
  await q(
    `insert into leader_coverage (org_id, covering_id, covered_id, ends_on, created_by)
     values ($1,$2,$3,$4,$5)
     on conflict (covering_id, covered_id)
       do update set ends_on = excluded.ends_on, starts_on = current_date`,
    [s.org, coveringId, coveredId, endsOn || null, s.sub],
  );
}

export async function removeCoverageAction(id: string): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  await q(`delete from leader_coverage where id=$1 and org_id=$2`, [id, s.org]);
}

export async function logTouchAction(
  personId: string,
  type: TouchType,
  note?: string,
): Promise<void> {
  const s = await requireSession();
  await q(
    `insert into pipeline_activity (org_id, person_id, actor_id, type, note, occurred_at)
     values ($1,$2,$3,$4,$5, now())`,
    [s.org, personId, s.sub, type, note?.trim() || null],
  );
  // The IG private-account loop: a follow_request stamps (or re-stamps) the
  // pending state so the queue re-checks in a couple of days; an actual DM
  // resolves it. Both also refresh last_touch_at like any touch.
  if (type === "follow_request") {
    await q(`update person set last_touch_at=now(), follow_requested_at=now(), updated_at=now() where id=$1`, [personId]);
  } else if (type === "instagram_dm") {
    await q(`update person set last_touch_at=now(), follow_requested_at=null, updated_at=now() where id=$1`, [personId]);
  } else {
    await q(`update person set last_touch_at=now(), updated_at=now() where id=$1`, [personId]);
  }
}

// Delete a logged touch (an accidental double-tap, a wrong type). Gated to the
// person's owner, whoever logged it, or a pastoral lead. Because last_touch_at
// is maintained by hand (no trigger), we recompute it from the remaining
// activities so recency/nudges stay correct — and return it for the client.
export async function deleteActivityAction(activityId: string): Promise<{ lastTouchAt: string | null }> {
  const s = await requireSession();
  const pastoral = await isPastoral(s.sub);
  const row = (
    await q<{ person_id: string; actor_id: string | null; owner_id: string | null }>(
      `select a.person_id, a.actor_id, p.owner_id
         from pipeline_activity a join person p on p.id = a.person_id
        where a.id=$1 and a.org_id=$2`,
      [activityId, s.org],
    )
  )[0];
  if (!row) return { lastTouchAt: null }; // already gone — treat as success
  const admin = await isAdminMember(s.sub);
  if (!pastoral && !admin && row.owner_id !== s.sub && row.actor_id !== s.sub) throw new Error("not allowed");
  await q(`delete from pipeline_activity where id=$1 and org_id=$2`, [activityId, s.org]);
  const mx = (
    await q<{ mx: string | null }>(
      `select max(occurred_at) mx from pipeline_activity where person_id=$1 and org_id=$2`,
      [row.person_id, s.org],
    )
  )[0];
  const lastTouchAt = mx?.mx ?? null;
  await q(`update person set last_touch_at=$2, updated_at=now() where id=$1`, [row.person_id, lastTouchAt]);
  return { lastTouchAt };
}

export type OutreachRow = {
  personId: string;
  firstName: string;
  lastName: string;
  campus: Person["campus"];
  stage: Stage;
  lastType: TouchType;
  lastAt: string;
  touches: number;
};

// "Who have I reached?" — the acting leader's own outreach, latest touch per
// person. Notes are excluded (a note isn't a touch on the person). Admins may
// pass a leaderId ("view as"); non-admins are pinned to self by resolveLeader.
export async function getMyOutreachAction(leaderId?: string, days = 7): Promise<OutreachRow[]> {
  const { org, leader } = await resolveLeader(leaderId);
  const rows = await q(
    `select p.id, p.first_name, p.last_name, p.campus, p.stage,
            max(a.occurred_at) last_at, count(*)::int touches,
            (array_agg(a.type order by a.occurred_at desc))[1] last_type
       from pipeline_activity a
       join person p on p.id = a.person_id
      where a.org_id=$1 and a.actor_id=$2 and a.type <> 'note'
        and a.occurred_at > now() - make_interval(days => $3)
        and p.archived_at is null
      group by p.id, p.first_name, p.last_name, p.campus, p.stage
      order by last_at desc
      limit 50`,
    [org, leader, days],
  );
  return rows.map((r) => ({
    personId: r.id as string,
    firstName: (r.first_name as string) ?? "",
    lastName: (r.last_name as string) ?? "",
    campus: r.campus as Person["campus"],
    stage: ((r.stage as Stage) ?? "Campus") as Stage,
    lastType: (r.last_type as TouchType) ?? "text",
    lastAt: iso(r.last_at) ?? "",
    touches: Number(r.touches) || 0,
  }));
}

export async function advanceStageAction(personId: string): Promise<Stage> {
  const s = await requireSession();
  const cur = ((await q(`select stage from person where id=$1`, [personId]))[0]?.stage as Stage) ?? "Campus";
  const next = STAGES[Math.min(STAGES.indexOf(cur) + 1, STAGES.length - 1)];
  if (next !== cur) {
    await q(`update person set stage=$2, updated_at=now() where id=$1`, [personId, next]);
    await recordStageChange(s.org, personId, cur, next, s.sub);
  }
  return next;
}

export type GateListRow = {
  personId: string;
  firstName: string;
  lastName: string;
  campus: Person["campus"];
  stage: Stage;
  email: string | null;
  phone: string | null;
  hasCuid: boolean | null;
  isNewIntent: boolean; // fresh cold "I want to come" capture (still at Campus)
  registeredThrough: string | null; // YYYY-MM-DD — guest registration covers Saturdays up to this date
};

// The Saturday gate list — everyone active who needs Columbia guest registration
// to get through the Morningside gates: said they have no CUID, or unknown on a
// non-Columbia campus. Columbia's rules: guests get a per-day QR by email, must
// show matching ID, and groups >2 must be registered by 5pm the evening before.
// Admin-only — this is the coordinator's Friday duty.
export async function getGateListAction(): Promise<GateListRow[]> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) return [];
  const rows = await q(
    `select id, first_name, last_name, campus, stage, email, phone_e164, has_cuid,
            to_char(gate_registered_through, 'YYYY-MM-DD') as registered_through,
            (stage = 'Campus' and created_at > now() - interval '14 days') as is_new_intent
       from person
      where org_id=$1 and archived_at is null and dormant_at is null
        and (has_cuid = false or (has_cuid is null and campus <> 'Columbia'))
      order by is_new_intent desc, campus, first_name`,
    [s.org],
  );
  return rows.map((r) => ({
    personId: r.id as string,
    firstName: (r.first_name as string) ?? "",
    lastName: (r.last_name as string) ?? "",
    campus: r.campus as Person["campus"],
    stage: ((r.stage as Stage) ?? "Campus") as Stage,
    email: (r.email as string) ?? null,
    phone: (r.phone_e164 as string) ?? null,
    hasCuid: typeof r.has_cuid === "boolean" ? (r.has_cuid as boolean) : null,
    isNewIntent: Boolean(r.is_new_intent),
    registeredThrough: (r.registered_through as string) ?? null,
  }));
}

// Mark people's Columbia guest registration as submitted through a date (the
// portal supports multi-day batches). null clears it (resurfaces them on the
// Friday list). Admin-only, like the gate list itself.
export async function setGateRegisteredThroughAction(personIds: string[], through: string | null): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  if (personIds.length === 0) return;
  if (through && !/^\d{4}-\d{2}-\d{2}$/.test(through)) throw new Error("Bad date.");
  await q(
    `update person set gate_registered_through=$3, updated_at=now()
     where org_id=$1 and id = any($2::uuid[])`,
    [s.org, personIds, through],
  );
}

export type IgDmRow = {
  personId: string;
  firstName: string;
  instagramHandle: string;
  campus: Person["campus"];
  captureSurface: string | null;
  createdAt: string; // ISO — when they were captured
  lastTouchAt: string | null; // ISO — most recent logged touch, if any
};

// The Saturday DM list — IG-only warm leads the Come to Nights SMS journey can
// never reach (an IG opt-in is consent to a DM, not a text, so they carry no
// phone/consent by design). Mirrors the journey's guard (Campus stage, active)
// and its 4-Saturday bound (captures age off after 28 days). Admin — the
// coordinator works this by hand on Saturday: one paced, personal DM each,
// never bulk (INSTAGRAM-SETUP.md).
export async function getIgDmListAction(): Promise<IgDmRow[]> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) return [];
  const rows = await q(
    `select p.id, p.first_name, p.instagram_handle, p.campus, p.capture_surface, p.created_at,
            (select max(a.occurred_at) from pipeline_activity a
              where a.org_id=p.org_id and a.person_id=p.id) as last_touch
       from person p
      where p.org_id=$1 and p.archived_at is null and p.dormant_at is null
        and p.stage='Campus'
        and p.instagram_handle is not null
        and not (p.phone_e164 is not null and p.sms_consent='opted_in')
        and p.created_at > now() - interval '28 days'
      order by p.created_at desc`,
    [s.org],
  );
  return rows.map((r) => ({
    personId: r.id as string,
    firstName: (r.first_name as string) ?? "",
    instagramHandle: (r.instagram_handle as string) ?? "",
    campus: r.campus as Person["campus"],
    captureSurface: (r.capture_surface as string) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
    lastTouchAt: r.last_touch ? new Date(r.last_touch as string).toISOString() : null,
  }));
}

// The coordinator's Saturday gate-alert number (staff SMS on last-minute
// "coming this Saturday" signups). Empty = alerts off. app_setting, admin-set.
export async function getCoordinatorAlertPhoneAction(): Promise<string> {
  const s = await requireSession();
  const r = await q<{ value: string | null }>(
    `select value from app_setting where org_id=$1 and key='coordinator_alert_phone'`,
    [s.org],
  );
  return r[0]?.value?.trim() || "";
}

export async function setCoordinatorAlertPhoneAction(phone: string): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  const trimmed = phone.trim();
  const e164 = trimmed ? toE164(trimmed) : null;
  if (trimmed && !e164) return { ok: false, error: "That number doesn't look right." };
  await q(
    `insert into app_setting (org_id, key, value, updated_at) values ($1,'coordinator_alert_phone',$2, now())
     on conflict (org_id, key) do update set value = excluded.value, updated_at = now()`,
    [s.org, e164 ?? ""],
  );
  return { ok: true };
}

// Append-only stage-transition log (powers funnel velocity/cohort analytics).
async function recordStageChange(org: string, personId: string, from: Stage, to: Stage, by: string): Promise<void> {
  await q(
    `insert into person_stage_history (org_id, person_id, from_stage, to_stage, changed_by)
     values ($1,$2,$3,$4,$5)`,
    [org, personId, from, to, by],
  );
}

export type NewPersonInput = {
  firstName: string;
  lastName: string;
  campus: Person["campus"];
  gender?: Gender | "";
  phone?: string;
  stage: Stage;
  ownerId: string;
  smsConsent: boolean;
  instagramHandle?: string;
  preferredContact?: PreferredContact;
  schoolYear?: SchoolYear;
};

export async function addPersonAction(input: NewPersonInput): Promise<Person> {
  const s = await requireSession();
  const consent = input.smsConsent ? "opted_in" : "unknown";
  const preferred: PreferredContact = input.preferredContact === "instagram" ? "instagram" : "text";
  const rows = await q(
    `insert into person
       (org_id, first_name, last_name, campus, phone_e164, timezone, sms_consent, source, owner_id, stage,
        instagram_handle, preferred_contact, school_year, gender, created_at)
     values ($1,$2,$3,$4,$5,'America/New_York',$6,'manual',$7,$8,$9,$10,$11,$12, now())
     returning id, first_name, last_name, campus, gender, phone_e164, stage, owner_id, hangout_id, last_touch_at, created_at,
               instagram_handle, preferred_contact, sms_consent, school_year`,
    [
      s.org,
      input.firstName.trim(),
      input.lastName.trim(),
      input.campus,
      input.phone?.trim() || null,
      consent,
      input.ownerId,
      input.stage,
      normalizeInstagramHandle(input.instagramHandle),
      preferred,
      input.schoolYear ?? null,
      input.gender || null,
    ],
  );
  const person = mapPerson(rows[0]);
  if (input.smsConsent) {
    await q(
      `insert into consent_event (org_id, person_id, channel, event, source, occurred_at)
       values ($1,$2,'sms','opt_in','manual', now())`,
      [s.org, person.id],
    );
  }
  return person;
}

// Quick-add many people at once — the outreach backfill path (a leader or the
// coordinator has a pile of DM contacts and needs them in without 12 separate
// forms). Each line is a name + a contact (an @handle or a phone). Guardrails
// that make bulk entry SAFE, not just fast:
//   • dedupe — phone on phone_e164, IG on instagram_handle (fixes the "fresh row
//     every time" duplicate risk for IG-only people); an existing match is
//     reported, never overwritten (never clobbers someone else's owner).
//   • the @handle is normalized (the contact key for IG-only people).
//   • a first outreach touch is logged on NEW people so they don't show as
//     "never contacted" (these have been reached) and the follow-up clock starts.
//   • owner: a leader can only file to themselves; an ADMIN (Dana) may assign
//     the batch to any leader — so she can be handed the names and load them.
// No consent is captured here (a hand-typed number carries none) — these are for
// personal human follow-up, never journeys/broadcasts, same as any IG-only lead.
export type BulkAddInput = {
  rows: { firstName: string; contact: string }[];
  campus: Campus;
  stage: Stage;
  ownerId?: string; // honored only for admins; leaders always own their own adds
};
export type BulkAddResult = {
  added: number;
  existed: number;
  skipped: { input: string; reason: string }[];
};

export async function bulkAddPeopleAction(input: BulkAddInput): Promise<BulkAddResult> {
  const s = await requireSession();
  const admin = await isAdminMember(s.sub);
  const owner = admin && input.ownerId ? input.ownerId : s.sub;
  const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];
  const campus: Campus = CAMPUSES.includes(input.campus) ? input.campus : "Columbia";
  const stage: Stage = (STAGES as readonly Stage[]).includes(input.stage) ? input.stage : "Campus";

  const result: BulkAddResult = { added: 0, existed: 0, skipped: [] };
  for (const raw of input.rows.slice(0, 200)) {
    const first = (raw.firstName || "").trim().slice(0, 80);
    const contact = (raw.contact || "").trim();
    const label = [first, contact].filter(Boolean).join(" · ") || "(blank)";
    if (!first && !contact) continue;
    const phone = toE164(contact);
    const handle = phone ? null : normalizeInstagramHandle(contact);
    if (!phone && !handle) {
      result.skipped.push({ input: label, reason: "no valid phone or @handle" });
      continue;
    }
    if (!first) {
      result.skipped.push({ input: label, reason: "missing first name" });
      continue;
    }

    let personId: string;
    let isNew = true;
    if (phone) {
      const ex = await q<{ id: string }>(`select id from person where org_id=$1 and phone_e164=$2 limit 1`, [s.org, phone]);
      if (ex[0]) { personId = ex[0].id; isNew = false; }
      else {
        const ins = await q<{ id: string }>(
          `insert into person (org_id, first_name, campus, phone_e164, timezone, sms_consent, source, owner_id, track, stage, preferred_contact, created_at)
           values ($1,$2,$3,$4,'America/New_York','unknown','manual',$5,'warm',$6,'text', now())
           returning id`,
          [s.org, first, campus, phone, owner, stage],
        );
        personId = ins[0].id;
      }
    } else {
      const ex = await q<{ id: string }>(`select id from person where org_id=$1 and lower(instagram_handle)=lower($2) limit 1`, [s.org, handle]);
      if (ex[0]) { personId = ex[0].id; isNew = false; }
      else {
        const ins = await q<{ id: string }>(
          `insert into person (org_id, first_name, campus, timezone, sms_consent, source, owner_id, track, stage, preferred_contact, instagram_handle, created_at)
           values ($1,$2,$3,'America/New_York','unknown','manual',$4,'warm',$5,'instagram',$6, now())
           returning id`,
          [s.org, first, campus, owner, stage, handle],
        );
        personId = ins[0].id;
      }
    }

    if (!isNew) { result.existed++; continue; }
    result.added++;
    // First outreach touch (NEW people only — don't disturb an existing cadence).
    const touchType: TouchType = handle ? "instagram_dm" : "text";
    await q(
      `insert into pipeline_activity (org_id, person_id, actor_id, type, note, occurred_at)
       values ($1,$2,$3,$4,'Outreach contact — added in a batch', now())`,
      [s.org, personId, s.sub, touchType],
    );
    await q(`update person set last_touch_at=now(), updated_at=now() where id=$1`, [personId]);
  }
  return result;
}

// Claim an unclaimed capture: assign an owner (a leader) so it enters that
// leader's Today queue. Defaults to the acting leader ("Claim"); an explicit
// ownerId supports "Assign to <suggested leader>".
export async function claimPersonAction(personId: string, ownerId?: string): Promise<void> {
  const s = await requireSession();
  const owner = ownerId ?? s.sub;
  await q(`update person set owner_id=$2, updated_at=now() where id=$1 and org_id=$3`, [
    personId,
    owner,
    s.org,
  ]);
}

// Distribute a batch of event/coordinator-owned contacts across the team — the
// "after an event, hand these out" move. Round-robins the given people across the
// chosen leaders/gatherers. Gated to an admin OR a campus lead (who can only touch
// their own campus). SAFE: only reassigns people currently owned by the coordinator
// or nobody — never steals someone a real leader already tends.
export async function distributeToTeamAction(
  personIds: string[],
  memberIds: string[],
): Promise<{ assigned: number }> {
  const s = await requireSession();
  if (personIds.length === 0 || memberIds.length === 0) return { assigned: 0 };
  const admin = await isAdminMember(s.sub);
  const campusLead = admin
    ? null
    : (await q<{ campus_lead: string | null }>(`select campus_lead from membership where id=$1`, [s.sub]))[0]?.campus_lead ?? null;
  if (!admin && !campusLead) throw new Error("Only an admin or campus lead can distribute contacts.");

  const coord =
    (await q<{ id: string }>(`select id from membership where org_id=$1 and is_coordinator order by created_at limit 1`, [s.org]))[0]?.id ?? null;
  const people = await q<{ id: string; owner_id: string | null; campus: string | null }>(
    `select id, owner_id, campus from person where org_id=$1 and id = any($2) and archived_at is null`,
    [s.org, personIds],
  );
  // Unowned, coordinator-held, or held by the ACTOR themself (campus-routed
  // captures land with the campus receiver — Maria/Priya — who then hands them
  // out); a campus lead only their own campus (untagged allowed — door
  // captures often arrive without one).
  const targets = people.filter(
    (p) => (p.owner_id === coord || p.owner_id === null || p.owner_id === s.sub)
      && (admin || p.campus === campusLead || p.campus === null),
  );
  let i = 0;
  for (const p of targets) {
    const owner = memberIds[i % memberIds.length];
    await q(`update person set owner_id=$2, updated_at=now() where id=$1 and org_id=$3`, [p.id, owner, s.org]);
    i++;
  }
  return { assigned: targets.length };
}

// ── In-app event editor ──────────────────────────────────────────────────────
// Events (RSVP pushes + past-event phrases) live in the `event` table so a
// coordinator/campus lead can create + edit them without a deploy; code
// constants in events.ts remain the seed/fallback (getLiveEventConfig merges
// DB over code). Editing is org-shaping, not per-person, so the gate matches
// distribute: admin OR campus lead — plus the coordinator.
async function canEditEvents(sub: string): Promise<boolean> {
  const r = await q<{ role: string; is_coordinator: boolean; campus_lead: string | null }>(
    `select role, is_coordinator, campus_lead from membership where id=$1`,
    [sub],
  );
  const m = r[0];
  return !!m && (m.role === "admin" || m.is_coordinator || m.campus_lead !== null);
}

export type EventAdminRow = {
  slug: string;
  headline: string;
  whenText: string;
  whereText: string;
  phrase: string;
  isRsvp: boolean;
  active: boolean;
  remind: boolean;
  thanks: boolean;
  sms: string;
  smsThanks: string;
  smsUpdate: string;
  smsFollowup: string;
  feeders: string[];
  fromCode: boolean; // true = code constant not yet saved to the DB (editing it creates the row)
};

export async function getEventsAdminAction(): Promise<{ events: EventAdminRow[]; knownSlugs: string[] }> {
  const s = await requireSession();
  if (!(await canEditEvents(s.sub))) throw new Error("Only an admin, coordinator, or campus lead can manage events.");
  const rows = await q<Record<string, unknown>>(
    `select slug, headline, when_text, where_text, phrase, is_rsvp, active, remind, thanks, sms_thanks, sms_update, sms, sms_followup, feeders
     from event where org_id=$1 order by sort_order, created_at`,
    [s.org],
  );
  const events: EventAdminRow[] = rows.map((r) => ({
    slug: r.slug as string,
    headline: (r.headline as string) ?? "",
    whenText: (r.when_text as string) ?? "",
    whereText: (r.where_text as string) ?? "",
    phrase: (r.phrase as string) ?? "",
    isRsvp: Boolean(r.is_rsvp),
    active: Boolean(r.active),
    remind: Boolean(r.remind),
    thanks: Boolean(r.thanks),
    sms: (r.sms as string) ?? "",
    smsThanks: (r.sms_thanks as string) ?? "",
    smsUpdate: (r.sms_update as string) ?? "",
    smsFollowup: (r.sms_followup as string) ?? "",
    feeders: (r.feeders as string[]) ?? [],
    fromCode: false,
  }));
  // Code constants without a DB row yet — shown so they can be adopted/edited.
  const have = new Set(events.map((e) => e.slug));
  for (const [slug, m] of Object.entries(EVENT_RSVP)) {
    if (have.has(slug)) continue;
    events.push({
      slug, headline: m.headline, whenText: m.when, whereText: m.where, phrase: EVENT_PHRASE[slug] ?? "",
      isRsvp: true, active: true, remind: false, thanks: false, sms: m.sms, smsFollowup: m.smsFollowup ?? "", smsThanks: "", smsUpdate: "", feeders: m.feeders ?? [], fromCode: true,
    });
  }
  const known = await q<{ event_slug: string }>(
    `select distinct event_slug from event_checkin where org_id=$1 order by event_slug`,
    [s.org],
  );
  return { events, knownSlugs: known.map((k) => k.event_slug) };
}

// How many people a live RSVP push would pre-fill for RIGHT NOW — shown in the
// editor's save confirmation so a save's blast radius is visible before it
// lands (REVAMP stage 3). Mirrors activeRsvpFor: attended a feeder, none of
// the excluded events, not the event itself; active, non-dormant people.
export async function previewEventAudienceAction(slug: string, feeders: string[], excludeFeeders: string[]): Promise<number> {
  const s = await requireSession();
  if (!(await canEditEvents(s.sub))) throw new Error("not allowed");
  const clean = (xs: string[]) => (xs ?? []).map((f) => cleanEventSlug(f)).filter((f): f is string => !!f);
  const fs = clean(feeders);
  if (fs.length === 0) return 0;
  const ex = clean(excludeFeeders);
  const r = await q<{ n: string }>(
    `select count(distinct p.id) n from person p
     where p.org_id=$1 and p.archived_at is null and p.dormant_at is null
       and exists (select 1 from event_checkin f where f.person_id=p.id and f.event_slug = any($2))
       and not exists (select 1 from event_checkin s2 where s2.person_id=p.id and s2.event_slug = $3)
       and ($4::text[] = '{}' or not exists (select 1 from event_checkin x where x.person_id=p.id and x.event_slug = any($4)))`,
    [s.org, fs, cleanEventSlug(slug) ?? "", ex],
  );
  return Number(r[0]?.n ?? 0);
}

export async function saveEventAction(input: Omit<EventAdminRow, "fromCode">): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = await requireSession();
  if (!(await canEditEvents(s.sub))) throw new Error("Only an admin, coordinator, or campus lead can manage events.");
  const slug = cleanEventSlug(input.slug);
  if (!slug) return { ok: false, error: "The link name (slug) can only use lowercase letters, numbers, and dashes." };
  const clip = (v: string, n: number) => (v ?? "").trim().slice(0, n);
  const feeders = (input.feeders ?? []).map((f) => cleanEventSlug(f)).filter((f): f is string => !!f && f !== slug);
  if (input.isRsvp && input.active) {
    if (!clip(input.whenText, 80) || !clip(input.whereText, 200)) return { ok: false, error: "An RSVP event needs its date/time and place." };
    if (!clip(input.sms, 640)) return { ok: false, error: "An RSVP event needs the invite text." };
  }
  // ── Live-fire guards (REVAMP stage 3; the "{name} test" incident). Saves are
  // instantly live on every matching queue, so obvious mistakes must not save.
  if (input.thanks && !clip(input.smsThanks, 640)) {
    return { ok: false, error: "Thank-you mode is ON but the thank-you text is empty — the wave would silently never run. Write the text or turn the toggle off." };
  }
  if (input.remind && input.isRsvp && input.active && feeders.length === 0) {
    return { ok: false, error: "Day-of reminders are ON but no 'invite who came to…' events are picked — the wave would reach nobody." };
  }
  const KNOWN_TAGS = new Set(["name", "leader", "event", "when", "where", "link", "ig"]);
  const texts: Array<[string, string]> = [["invite", input.sms], ["second touch", input.smsFollowup], ["thank-you", input.smsThanks], ["change-of-plans", input.smsUpdate]];
  for (const [label, raw] of texts) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const badTag = [...t.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]).find((tag) => !KNOWN_TAGS.has(tag));
    if (badTag !== undefined) return { ok: false, error: `The ${label} text has an unknown tag {${badTag}} — it would reach students literally. Known tags: {name} {leader} {event} {when} {where} {link} {ig}.` };
    if (input.active && t.length < 30 && /\btest\b/i.test(t)) {
      return { ok: false, error: `The ${label} text looks like a test ("${t.slice(0, 40)}") and the event is ON — it would pre-fill real drafts. Turn the event Off to experiment, or write the real text.` };
    }
  }
  await q(
    `insert into event (org_id, slug, headline, when_text, where_text, phrase, is_rsvp, active, remind, thanks, sms_thanks, sms_update, sms, sms_followup, feeders, updated_at, remind_since, thanks_since)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),
             case when $9 then now() end, case when $10 then now() end)
     on conflict (org_id, slug) do update set
       headline=excluded.headline, when_text=excluded.when_text, where_text=excluded.where_text,
       phrase=excluded.phrase, is_rsvp=excluded.is_rsvp, active=excluded.active, remind=excluded.remind,
       thanks=excluded.thanks, sms_thanks=excluded.sms_thanks, sms_update=excluded.sms_update,
       sms=excluded.sms, sms_followup=excluded.sms_followup, feeders=excluded.feeders, updated_at=now(),
       -- Wave-start stamps: set on the OFF→ON flip, cleared on OFF (so a
       -- re-enable starts a fresh wave); untouched while the toggle stays ON.
       remind_since = case when excluded.remind and not event.remind then now()
                           when not excluded.remind then null
                           else event.remind_since end,
       thanks_since = case when excluded.thanks and not event.thanks then now()
                           when not excluded.thanks then null
                           else event.thanks_since end`,
    [s.org, slug, clip(input.headline, 80), clip(input.whenText, 80), clip(input.whereText, 200), clip(input.phrase, 80),
     input.isRsvp, input.active, input.remind, input.thanks, clip(input.smsThanks, 640), clip(input.smsUpdate, 640), clip(input.sms, 640), clip(input.smsFollowup, 640), feeders],
  );
  return { ok: true };
}

// Edit a person's core fields (fix data, correct stage, reassign owner). Phone
// is normalized to E.164 (dedupe key). lastName/phone may be cleared.
export type PersonPatch = {
  firstName: string;
  lastName: string;
  campus: Person["campus"];
  phone: string;
  stage: Stage;
  ownerId: string;
  instagramHandle: string;
  preferredContact: PreferredContact;
  email: string;
  hasCuid: boolean | null; // null = unknown
  schoolYear: SchoolYear | ""; // "" = unknown
  gender: Gender | ""; // "" = unset
};

export async function updatePersonAction(personId: string, patch: PersonPatch): Promise<void> {
  const s = await requireSession();
  const prev = (await q<{ stage: Stage }>(`select stage from person where id=$1 and org_id=$2`, [personId, s.org]))[0]?.stage;
  // Moving someone to an EARLIER stage is pastoral-only (server-enforced, not
  // just hidden in the UI). Forward moves stay open to the owner/leaders.
  if (prev && STAGES.indexOf(patch.stage) < STAGES.indexOf(prev) && !(await isPastoral(s.sub))) {
    throw new Error("Only a pastoral user can move someone to an earlier stage.");
  }
  const preferred: PreferredContact = patch.preferredContact === "instagram" ? "instagram" : "text";
  await q(
    `update person set
       first_name=$2, last_name=$3, campus=$4, phone_e164=$5, stage=$6, owner_id=$7,
       instagram_handle=$9, preferred_contact=$10, email=$11, has_cuid=$12, school_year=$13, gender=$14, updated_at=now()
     where id=$1 and org_id=$8`,
    [
      personId,
      patch.firstName.trim(),
      patch.lastName.trim() || null,
      patch.campus,
      toE164(patch.phone) ?? (patch.phone.trim() || null),
      patch.stage,
      patch.ownerId || null,
      s.org,
      normalizeInstagramHandle(patch.instagramHandle),
      preferred,
      patch.email.trim().toLowerCase() || null,
      patch.hasCuid,
      patch.schoolYear || null,
      patch.gender || null,
    ],
  );
  if (prev && patch.stage !== prev) {
    await recordStageChange(s.org, personId, prev, patch.stage, s.sub);
  }
}

// Is the session the owner of this person, or an admin? Gate for removal/restore —
// removal shouldn't depend on the UI hiding the button.
async function ownsOrAdmin(sub: string, org: string, personId: string): Promise<boolean> {
  const r = await q<{ ok: boolean }>(
    `select (m.role='admin' or p.owner_id=$1) ok
     from person p, membership m where p.id=$2 and p.org_id=$3 and m.id=$1`,
    [sub, personId, org],
  );
  return Boolean(r[0]?.ok);
}

// Soft-delete: archive (reversible, preserves history/FKs). getSnapshot filters
// archived_at, so the person disappears from the app. Gated owner-or-admin, and a
// reason is required — every removal is attributed (archived_by) and explained,
// surfaced to admins in the "recently removed" queue for restore.
export async function archivePersonAction(personId: string, reason?: string): Promise<void> {
  const s = await requireSession();
  if (!(await ownsOrAdmin(s.sub, s.org, personId))) throw new Error("not allowed");
  const r = (reason ?? "").trim();
  if (!r) throw new Error("A reason is required to remove someone.");
  await q(
    `update person set archived_at=now(), archived_by=$2, archived_reason=$3, updated_at=now()
     where id=$1 and org_id=$4`,
    [personId, s.sub, r, s.org],
  );
}

// ── Disciple journeys (Track B): leader-initiated enrollment ──────────────────
// New Believer / Assimilation are seeded (0022) but never auto-enroll — a leader
// puts a person in after they connect (the response capture never auto-labels).
// Manually enrollable journeys, in display order. Welcome is excluded (auto-only).
const MANUAL_JOURNEYS: { id: string; name: string; blurb: string }[] = [
  { id: NEW_BELIEVER_JOURNEY_ID, name: "New Believer", blurb: "Took a step — walk them into a Hangout via a real person." },
  { id: ASSIMILATION_JOURNEY_ID, name: "Assimilation", blurb: "First-time guest — nurture Crowd → Community → a Hangout." },
  { id: STAY_WARM_JOURNEY_ID, name: "Stay Warm", blurb: "Gone quiet — 3 gentle, no-agenda check-ins over ~10 weeks, then rest." },
];

export type PersonJourney = {
  journeyId: string;
  name: string;
  status: string;
  stepOf: string; // e.g. "step 2 of 3"
  nextAt: string | null; // scheduled_for of the pending step
};
export type PersonJourneysResult = {
  enrolled: PersonJourney[];
  available: { id: string; name: string; blurb: string }[];
  live: boolean; // false = dry-run (rehearsing, not sending) until SMS_PROVIDER=twilio
};

// Read a person's journey enrollments + which manual journeys they can still join.
// Gated owner-or-admin (same as the enroll action) — journeys are follow-up ops.
export async function getPersonJourneysAction(personId: string): Promise<PersonJourneysResult> {
  const s = await requireSession();
  if (!(await ownsOrAdmin(s.sub, s.org, personId))) throw new Error("not allowed");
  const rows = await q<{ journey_id: string; name: string; status: string; sort_order: number; total: number; scheduled_for: string | null }>(
    `select e.journey_id, j.name, e.status,
            coalesce(cs.sort_order, 0) as sort_order,
            (select count(*) from journey_step s where s.journey_id = j.id) as total,
            e.scheduled_for
       from journey_enrollment e
       join journey j on j.id = e.journey_id
       left join journey_step cs on cs.id = e.current_step_id
      where e.org_id = $1 and e.person_id = $2
      order by e.enrolled_at`,
    [s.org, personId],
  );
  const enrolled: PersonJourney[] = rows.map((r) => ({
    journeyId: r.journey_id,
    name: r.name,
    status: r.status,
    stepOf: `step ${r.sort_order} of ${r.total}`,
    nextAt: r.scheduled_for,
  }));
  const taken = new Set(enrolled.map((e) => e.journeyId));
  const available = MANUAL_JOURNEYS.filter((j) => !taken.has(j.id));
  const live = process.env.SMS_PROVIDER === "twilio";
  return { enrolled, available, live };
}

// Leader-initiated enrollment into a manual journey. Gated owner-or-admin; only
// the whitelisted manual journeys (never Welcome). Idempotent; drops a timeline
// note so the enrollment is attributed and visible. Stays dry-run until go-live.
export async function enrollPersonInJourneyAction(personId: string, journeyId: string): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (!(await ownsOrAdmin(s.sub, s.org, personId))) throw new Error("not allowed");
  const journey = MANUAL_JOURNEYS.find((j) => j.id === journeyId);
  if (!journey) throw new Error("That journey can't be started manually.");
  // IG guardrail: journeys are SMS. An Instagram-preferred contact handed over a
  // handle, not SMS consent — never enroll them in an SMS journey. (The sweep
  // would pause them at send anyway for lack of phone/consent, but we refuse up
  // front so the ledger stays honest and the channels stay separate.)
  const pref = (await q<{ preferred_contact: string | null }>(
    `select preferred_contact from person where id=$1 and org_id=$2`,
    [personId, s.org],
  ))[0]?.preferred_contact;
  if (pref === "instagram") {
    return { ok: false, error: "This person prefers Instagram — SMS journeys don't apply. Keep IG follow-up manual." };
  }
  const created = await enrollInJourney(s.org, personId, journeyId);
  if (created) {
    const who = (await q<{ n: string }>(`select full_name n from membership where id=$1`, [s.sub]))[0]?.n ?? "a leader";
    await q(
      `insert into pipeline_activity (org_id, person_id, actor_id, type, note, occurred_at)
       values ($1,$2,$3,'note',$4, now())`,
      [s.org, personId, s.sub, `Started the ${journey.name} journey (by ${who})`],
    );
  }
  return { ok: created };
}

// Stop a person's journey (owner/admin). Cancels the enrollment so the sweep
// never touches it again — this is the per-person "Stop" the profile now offers.
// A leader can stop either an active or a paused (held) enrollment.
export async function stopPersonJourneyAction(personId: string, journeyId: string): Promise<{ ok: boolean }> {
  const s = await requireSession();
  if (!(await ownsOrAdmin(s.sub, s.org, personId))) throw new Error("not allowed");
  await q(
    `update journey_enrollment set status='cancelled', scheduled_for=null, paused_reason='stopped_by_leader'
      where org_id=$1 and person_id=$2 and journey_id=$3 and status in ('active','paused')`,
    [s.org, personId, journeyId],
  );
  return { ok: true };
}

// ── Journey admin (admin-only): see and control every journey ─────────────────
// "Live vs on-hold" is TWO things: is_active (blocks NEW auto-enrolls) and each
// enrollment's status (the sweep only sends 'active'). Hold sets both off so no
// one — current or future — is texted; Resume turns both back on. Only enrollments
// paused *by a hold* resume; ones a human stopped or that opted out stay put.
export type JourneyAdminRow = {
  id: string;
  name: string;
  isActive: boolean;
  trigger: string;
  active: number; // enrollments the sweep would send
  held: number; // paused by a hold, resumable
  sendable: number; // active AND phone+consent (would actually text)
};

export async function getJourneysAdminAction(): Promise<{ live: boolean; journeys: JourneyAdminRow[] }> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  const rows = await q<{ id: string; name: string; is_active: boolean; entry_trigger: string | null; active: number; held: number; sendable: number }>(
    `select j.id, j.name, j.is_active, j.entry_trigger,
            count(e.id) filter (where e.status='active')::int active,
            count(e.id) filter (where e.status='paused' and e.paused_reason in ('admin_hold','prelaunch_hold'))::int held,
            count(e.id) filter (where e.status='active' and p.phone_e164 is not null and p.sms_consent='opted_in')::int sendable
       from journey j
       left join journey_enrollment e on e.journey_id = j.id and e.org_id = j.org_id
       left join person p on p.id = e.person_id and p.archived_at is null
      where j.org_id = $1
      group by j.id, j.name, j.is_active, j.entry_trigger
      order by j.name`,
    [s.org],
  );
  return {
    live: process.env.SMS_PROVIDER === "twilio",
    journeys: rows.map((r) => ({
      id: r.id,
      name: r.name,
      isActive: r.is_active,
      trigger: r.entry_trigger ?? "manual",
      active: r.active,
      held: r.held,
      sendable: r.sendable,
    })),
  };
}

export async function holdJourneyAction(journeyId: string): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  await q(`update journey set is_active=false where id=$1 and org_id=$2`, [journeyId, s.org]);
  await q(
    `update journey_enrollment set status='paused', paused_reason='admin_hold'
      where journey_id=$1 and org_id=$2 and status='active'`,
    [journeyId, s.org],
  );
}

export async function resumeJourneyAction(journeyId: string): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  await q(`update journey set is_active=true where id=$1 and org_id=$2`, [journeyId, s.org]);
  // Only un-hold enrollments a hold paused — never revive human-engaged / opted-out ones.
  await q(
    `update journey_enrollment set status='active', paused_reason=null
      where journey_id=$1 and org_id=$2 and status='paused' and paused_reason in ('admin_hold','prelaunch_hold')`,
    [journeyId, s.org],
  );
}

// ── Team messaging: text leaders/gatherers directly ──────────────────────────
// Internal staff comms (not a consumer broadcast) — sends via the raw staff SMS
// path to each member's own phone (membership.phone_e164). Open to admins, the
// coordinator, and campus leads (a lead runs her campus's blitzes; memberships
// carry no campus tag, so the pick-list is the whole team — staff-only, low
// risk). Pick any subset; members without a number on file are skipped (and can
// be given one right here).
async function canMessageTeam(sub: string): Promise<boolean> {
  const r = await q<{ role: string; is_coordinator: boolean; campus_lead: string | null }>(
    `select role, is_coordinator, campus_lead from membership where id=$1`,
    [sub],
  );
  const m = r[0];
  return !!m && (m.role === "admin" || m.is_coordinator || m.campus_lead !== null);
}
export type TeamMember = { id: string; name: string; role: string; hasPhone: boolean; phoneLast4: string | null };

export async function getTeamAction(): Promise<TeamMember[]> {
  const s = await requireSession();
  if (!(await canMessageTeam(s.sub))) throw new Error("not allowed");
  const rows = await q<{ id: string; full_name: string; role: string; phone_e164: string | null }>(
    `select id, full_name, role, phone_e164 from membership where org_id=$1 and deactivated_at is null order by full_name`,
    [s.org],
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.full_name,
    role: r.role,
    hasPhone: !!r.phone_e164,
    phoneLast4: r.phone_e164 ? r.phone_e164.slice(-4) : null,
  }));
}

export async function setTeamMemberPhoneAction(memberId: string, phone: string): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (!(await canMessageTeam(s.sub))) throw new Error("not allowed");
  const e164 = toE164(phone);
  if (!e164) return { ok: false, error: "That number doesn't look right — mind checking it?" };
  await q(`update membership set phone_e164=$3 where id=$1 and org_id=$2`, [memberId, s.org, e164]);
  return { ok: true };
}

export type TeamMessageResult = { ok: boolean; sent: number; skippedNoPhone: number; failed: number; live: boolean; error?: string };

export async function messageTeamAction(memberIds: string[], body: string): Promise<TeamMessageResult> {
  const s = await requireSession();
  if (!(await canMessageTeam(s.sub))) throw new Error("not allowed");
  const text = body.trim();
  if (text.length < 2) return { ok: false, sent: 0, skippedNoPhone: 0, failed: 0, live: false, error: "Write a message first." };
  if (!memberIds.length) return { ok: false, sent: 0, skippedNoPhone: 0, failed: 0, live: false, error: "Pick who to message." };
  const rows = await q<{ phone_e164: string | null }>(
    `select phone_e164 from membership where org_id=$1 and deactivated_at is null and id = any($2::uuid[])`,
    [s.org, memberIds],
  );
  let sent = 0, skippedNoPhone = 0, failed = 0;
  for (const r of rows) {
    if (!r.phone_e164) { skippedNoPhone++; continue; }
    const res = await sendStaffAlert(r.phone_e164, text);
    if (res === "sent" || res === "dry_run") sent++;
    else failed++;
  }
  return { ok: true, sent, skippedNoPhone, failed, live: process.env.SMS_PROVIDER === "twilio" };
}

// ── Counseling assist (gated) ─────────────────────────────────────────────────
// Coach-the-leader shepherding help. Gated behind COUNSEL_ENABLED (default off) AND
// pastoral-only until NY legal counsel + data-flow sign-off (COUNSELING-ASSIST.md).
// Member content is de-identified in counselLeader() before any model call.
export type CounselResult = { enabled: boolean; guidance: CounselGuidance | null; error?: string };

export async function getCounselAction(personId: string, situation: string): Promise<CounselResult> {
  const s = await requireSession();
  if (!COUNSEL_ENABLED) return { enabled: false, guidance: null };
  // Pastoral-only gate for now (the tender content boundary). Broaden to owners once
  // legal + data-flow are cleared. Still verify the viewer can manage this person.
  if (!(await isPastoral(s.sub))) return { enabled: false, guidance: null };
  if (!(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  const trimmed = situation.trim();
  if (trimmed.length < 10) return { enabled: true, guidance: null, error: "Add a bit more about what's going on." };

  // Scrub every roster name (first + last) so no member is identifiable to the model.
  const rows = await q<{ first_name: string | null; last_name: string | null }>(
    `select first_name, last_name from person where org_id=$1`,
    [s.org],
  );
  const names = rows.flatMap((r) => [r.first_name, r.last_name]).filter((n): n is string => !!n);

  try {
    const guidance = await counselLeader(trimmed, names);
    return { enabled: true, guidance };
  } catch (e) {
    return { enabled: true, guidance: null, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}

// ── Engagement-health TUNING read (pastoral-only, sanity-check surface) ────────
// The SILENT layer's eyeball view (ENGAGEMENT-HEALTH.md build-order step 2). This
// is NOT the leader-facing product — it's a pastor-only surface to sanity-check
// what the signal WOULD flag against people Alex knows, before any of it becomes
// visible to leaders. Because it's a tuning view, it may show the internal sort
// key (which the eventual leader UI never will). Whole roster (pastoral oversight).
// `ignoreQuietSeason` = preview mode: during summer/breaks live flags are all
// paused, so this lets Alex see the logic firing on real data out of season.
export type EngagementTuningRow = {
  personId: string;
  name: string;
  campus: string | null;
  stage: string;
  ownerName: string | null;
  sortKey: number;
  cooling: boolean;
  campusLimbo: boolean;
  backwardMove: boolean;
  reasons: string[];
  cue: string | null;
  paused: boolean;
};
export type EngagementTuning = {
  quietByCampus: { campus: string; quiet: boolean; kind: string | null }[];
  liveFlagged: number; // flagging now (quiet season respected)
  wouldFlag: number; // flagging if quiet season ignored (preview)
  ignoredQuietSeason: boolean;
  rows: EngagementTuningRow[]; // ranked, highest cooling-velocity first
};

export async function getEngagementTuningAction(ignoreQuietSeason = false): Promise<EngagementTuning> {
  const s = await requireSession();
  if (!(await isPastoral(s.sub))) throw new Error("not allowed");
  const org = s.org;
  const now = new Date();

  // Whole non-archived roster (pastoral oversight sees all).
  const people = (
    await q(
      `select p.id, p.first_name, p.last_name, p.campus, p.gender, p.phone_e164, p.stage,
              p.owner_id, p.hangout_id, p.last_touch_at, p.created_at,
              p.dormant_at, p.dormant_reason, p.serving_role, p.nyc_local, p.summer_reason, p.capture_surface, p.apprentice_of
       from person p where p.org_id=$1 and p.archived_at is null`,
      [org],
    )
  ).map(mapPerson);

  // Owner display names.
  const owners = new Map(
    (await q<{ id: string; full_name: string }>(`select id, full_name from membership where org_id=$1`, [org])).map(
      (r) => [r.id, r.full_name] as const,
    ),
  );

  // Touch count + first touch per person (the adapter's first query).
  const touchAgg = new Map(
    (
      await q<{ person_id: string; n: number; first: string }>(
        `select person_id, count(*)::int n, min(occurred_at) first
         from pipeline_activity where org_id=$1 group by person_id`,
        [org],
      )
    ).map((r) => [r.person_id, { n: r.n, first: r.first }] as const),
  );

  // Recent Hangout attendance per person, most-recent first (the adapter's second
  // query). Grouped in JS; deriveEngagement only looks at the last 4.
  const attByPerson = new Map<string, AttendanceMark[]>();
  for (const r of await q<{ person_id: string; occurred_on: string; status: string }>(
    `select ra.person_id, to_char(r.occurred_on,'YYYY-MM-DD') occurred_on, ra.status
     from reflection_attendance ra join reflection r on r.id = ra.reflection_id
     where ra.org_id=$1 order by ra.person_id, r.occurred_on desc`,
    [org],
  )) {
    const list = attByPerson.get(r.person_id) ?? [];
    list.push({ occurredOn: r.occurred_on, present: r.status === "present" });
    attByPerson.set(r.person_id, list);
  }

  let liveFlagged = 0;
  let wouldFlag = 0;
  const rows: EngagementTuningRow[] = [];
  for (const p of people) {
    const agg = touchAgg.get(p.id);
    const inputs: EngagementInputs = {
      touchCount: agg?.n ?? 0,
      firstTouchAt: agg?.first ?? null,
      attendance: attByPerson.get(p.id) ?? [],
    };
    const quiet = isQuietSeason(p.campus, now);
    const live = deriveEngagement(p, inputs, now, quiet);
    const preview = deriveEngagement(p, inputs, now, false);
    if (live.cue) liveFlagged++;
    if (preview.cue) wouldFlag++;
    const shown = ignoreQuietSeason ? preview : live;
    if (shown.cue) {
      rows.push({
        personId: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        campus: p.campus ?? null,
        stage: p.stage,
        ownerName: p.ownerId ? owners.get(p.ownerId) ?? null : null,
        sortKey: shown.sortKey,
        cooling: shown.flags.cooling,
        campusLimbo: shown.flags.campusLimbo,
        backwardMove: shown.flags.backwardMove,
        reasons: shown.reasons,
        cue: shown.cue,
        paused: live.paused,
      });
    }
  }
  rows.sort((a, b) => b.sortKey - a.sortKey);

  const CAMPUSES = ["Columbia", "NYU", "CCNY", "Pace"] as const;
  return {
    quietByCampus: CAMPUSES.map((c) => ({ campus: c, quiet: isQuietSeason(c, now), kind: quietSeasonKind(c, now) })),
    liveFlagged,
    wouldFlag,
    ignoredQuietSeason: ignoreQuietSeason,
    rows,
  };
}

export type RemovedPerson = {
  id: string;
  name: string;
  campus: string;
  stage: string;
  ownerName: string;
  removedByName: string;
  archivedAt: string | null;
  reason: string;
};

// The "recently removed" queue. Admins see every removal; a leader sees only
// their own people's removals. Powers one-tap restore.
export async function listRemovedAction(): Promise<RemovedPerson[]> {
  const s = await requireSession();
  const admin = await isAdminMember(s.sub);
  return (
    await q(
      `select p.id, nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),'') name,
              coalesce(p.campus,'') campus, coalesce(p.stage,'') stage,
              coalesce(mo.full_name,'—') owner_name, coalesce(mb.full_name,'—') removed_by,
              p.archived_at, coalesce(p.archived_reason,'') reason
       from person p
       left join membership mo on mo.id=p.owner_id
       left join membership mb on mb.id=p.archived_by
       where p.org_id=$1 and p.archived_at is not null and ($2 or p.owner_id=$3)
       order by p.archived_at desc limit 50`,
      [s.org, admin, s.sub],
    )
  ).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? "—",
    campus: (r.campus as string) ?? "",
    stage: (r.stage as string) ?? "",
    ownerName: (r.owner_name as string) ?? "—",
    removedByName: (r.removed_by as string) ?? "—",
    archivedAt: iso(r.archived_at),
    reason: (r.reason as string) ?? "",
  }));
}

export async function restorePersonAction(personId: string): Promise<void> {
  const s = await requireSession();
  if (!(await ownsOrAdmin(s.sub, s.org, personId))) throw new Error("not allowed");
  await q(
    `update person set archived_at=null, archived_by=null, archived_reason=null, updated_at=now()
     where id=$1 and org_id=$2`,
    [personId, s.org],
  );
}

// ── Private pastoral notes ──────────────────────────────────────────────────
// Confidential, dated interaction notes. ACCESS (enforced HERE, server-side —
// never trust the client): a note is readable only by its author OR a member
// with pastoral_oversight (Alex/Priya + successors). These notes never enter the
// global getSnapshot; they're fetched per-person through getNotesAction only.
export type PersonNote = {
  id: string;
  body: string;
  occurredOn: string;
  authorId: string;
  authorName: string;
};

async function isPastoral(membershipId: string): Promise<boolean> {
  const r = await q<{ p: boolean }>(`select pastoral_oversight as p from membership where id=$1`, [membershipId]);
  return Boolean(r[0]?.p);
}

async function isAdminMember(membershipId: string): Promise<boolean> {
  const r = await q<{ role: string }>(`select role from membership where id=$1`, [membershipId]);
  return r[0]?.role === "admin";
}

export async function getNotesAction(
  personId: string,
): Promise<{ notes: PersonNote[]; canAdd: boolean }> {
  const s = await requireSession();
  const pastoral = await isPastoral(s.sub);
  const rows = await q(
    `select n.id, n.body, to_char(n.occurred_on,'YYYY-MM-DD') as occurred_on, n.author_id, m.full_name as author_name
     from note n left join membership m on m.id=n.author_id
     where n.org_id=$1 and n.entity_type='person' and n.entity_id=$2
       and ($3 or n.author_id=$4)
     order by n.occurred_on desc, n.created_at desc`,
    [s.org, personId, pastoral, s.sub],
  );
  const owner = await q<{ owner_id: string | null }>(
    `select owner_id from person where id=$1 and org_id=$2`,
    [personId, s.org],
  );
  return {
    notes: rows.map((r) => ({
      id: r.id as string,
      body: r.body as string,
      occurredOn: (r.occurred_on as string) ?? "",
      authorId: r.author_id as string,
      authorName: (r.author_name as string) ?? "—",
    })),
    canAdd: pastoral || owner[0]?.owner_id === s.sub,
  };
}

export async function addNoteAction(personId: string, body: string, occurredOn?: string): Promise<void> {
  const s = await requireSession();
  const text = body.trim();
  if (!text) throw new Error("empty note");
  const pastoral = await isPastoral(s.sub);
  const owner = (await q<{ owner_id: string | null }>(`select owner_id from person where id=$1 and org_id=$2`, [personId, s.org]))[0];
  if (!pastoral && owner?.owner_id !== s.sub) throw new Error("not allowed");
  await q(
    `insert into note (org_id, entity_type, entity_id, author_id, body, occurred_on)
     values ($1,'person',$2,$3,$4, coalesce($5::date, current_date))`,
    [s.org, personId, s.sub, text, occurredOn || null],
  );
}

export async function deleteNoteAction(noteId: string): Promise<void> {
  const s = await requireSession();
  const pastoral = await isPastoral(s.sub);
  await q(`delete from note where id=$1 and org_id=$2 and ($3 or author_id=$4)`, [noteId, s.org, pastoral, s.sub]);
}

export async function placeInHangoutAction(
  personId: string,
  hangoutId: string | null,
): Promise<void> {
  const s = await requireSession();
  await q(`update person set hangout_id=$2, updated_at=now() where id=$1`, [personId, hangoutId]);
  if (hangoutId) {
    await q(
      `insert into group_membership (org_id, group_id, person_id, status)
       values ($1,$2,$3,'active') on conflict (group_id, person_id) do nothing`,
      [s.org, hangoutId, personId],
    );
  }
}

// ── Leader reflections + structured Hangout attendance ──────────────────────
// A reflection is one Bible Hangout meeting. Attendance is STRUCTURED against
// real person rows (present/absent), so headcounts are DERIVED, never typed.
// `leaderPersonal` ("How I'm doing personally") is PASTORAL-GATED on read —
// returned only to its author or a member with pastoral_oversight, matching the
// pastoral-notes tier. Everything else on a reflection is leadership/eval
// material visible to admins.

export type AttendanceStatus = "present" | "absent";

export type ReflectionInput = {
  occurredOn?: string;
  expectedCount?: number | null;
  keyMoment?: string;
  concernFollowup?: string;
  leaderPersonal?: string;
  attendance: { personId: string; status: AttendanceStatus }[];
};

export type ReflectionResponse = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export type ReflectionSummary = {
  id: string;
  occurredOn: string;
  expectedCount: number | null;
  keyMoment: string;
  concernFollowup: string;
  leaderPersonal: string | null; // null = hidden from this viewer (not pastoral / not author)
  authorId: string;
  authorName: string;
  present: { id: string; name: string }[];
  absent: { id: string; name: string }[];
  responses: ReflectionResponse[]; // pastoral replies — the leader sees these under their own entry
};

// Resolve whose data we're acting on. Leaders are pinned to themselves; an admin
// may pass an explicit leaderId ("view as"). Admins may view anyone; a campus
// lead may view a teammate who owns at least one person on HER campus (the
// same visibility her snapshot already grants). Anyone else passing someone
// else's id is silently pinned back to self — never trust the client.
async function resolveLeader(
  leaderId?: string,
): Promise<{ org: string; sub: string; leader: string; isAdmin: boolean; pastoral: boolean }> {
  const s = await requireSession();
  const role = await q<{ role: string; campus_lead: string | null }>(`select role, campus_lead from membership where id=$1`, [s.sub]);
  const isAdmin = role[0]?.role === "admin";
  const pastoral = await isPastoral(s.sub);
  let leader = s.sub;
  if (leaderId && leaderId !== s.sub) {
    if (isAdmin) leader = leaderId;
    else if (role[0]?.campus_lead) {
      const onCampus = await q<{ ok: boolean }>(
        `select exists(select 1 from person where org_id=$1 and owner_id=$2 and campus=$3 and archived_at is null) ok`,
        [s.org, leaderId, role[0].campus_lead],
      );
      if (onCampus[0]?.ok) leader = leaderId;
    }
  }
  return { org: s.org, sub: s.sub, leader, isAdmin, pastoral };
}

export async function submitReflectionAction(input: ReflectionInput): Promise<string> {
  const s = await requireSession();
  // An empty reflection (no attendance marked, nothing written) is a no-op —
  // reject it. The form disables Submit too; this is the server backstop.
  const hasContent =
    input.attendance.length > 0 ||
    input.expectedCount != null ||
    Boolean(input.keyMoment?.trim() || input.concernFollowup?.trim() || input.leaderPersonal?.trim());
  if (!hasContent) throw new Error("Empty reflection — mark who came or write at least one line.");
  const rid = (
    await q<{ id: string }>(
      `insert into reflection
         (org_id, author_id, occurred_on, expected_count, key_moment, concern_followup, leader_personal)
       values ($1,$2, coalesce($3::date, current_date), $4,$5,$6,$7)
       returning id`,
      [
        s.org,
        s.sub,
        input.occurredOn || null,
        input.expectedCount ?? null,
        input.keyMoment?.trim() || null,
        input.concernFollowup?.trim() || null,
        input.leaderPersonal?.trim() || null,
      ],
    )
  )[0].id;
  for (const a of input.attendance) {
    await q(
      `insert into reflection_attendance (org_id, reflection_id, person_id, status)
       values ($1,$2,$3,$4)
       on conflict (reflection_id, person_id) do update set status = excluded.status`,
      [s.org, rid, a.personId, a.status],
    );
  }
  return rid;
}

export async function getReflectionsAction(
  leaderId?: string,
): Promise<{ reflections: ReflectionSummary[]; canSubmit: boolean; canRespond: boolean }> {
  const { org, sub, leader, isAdmin, pastoral } = await resolveLeader(leaderId);
  // Reflections are pastoral/leadership content: a leader sees only their OWN;
  // pastoral oversight (Alex/Priya) may review anyone; ops admins (Dana/Robin)
  // see none of it.
  if (leader !== sub && !pastoral) {
    return { reflections: [], canSubmit: false, canRespond: false };
  }
  const rows = await q(
    `select r.id, to_char(r.occurred_on,'YYYY-MM-DD') occurred_on, r.expected_count,
            coalesce(r.key_moment,'') key_moment, coalesce(r.concern_followup,'') concern_followup,
            r.leader_personal, r.author_id, coalesce(m.full_name,'—') author_name
       from reflection r left join membership m on m.id = r.author_id
      where r.org_id=$1 and r.author_id=$2
      order by r.occurred_on desc, r.created_at desc`,
    [org, leader],
  );
  const ids = rows.map((r) => r.id as string);
  const att = ids.length
    ? await q(
        `select a.reflection_id, a.status, p.id person_id,
                nullif(trim(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')),'') name
           from reflection_attendance a join person p on p.id = a.person_id
          where a.org_id=$1 and a.reflection_id = any($2::uuid[])`,
        [org, ids],
      )
    : [];
  // Pastoral replies. Visible to the reflection's author-leader AND pastoral
  // reviewers — the whole point is the leader sees them under their own entry.
  // (This action already returns nothing to ops admins, so no extra gate needed.)
  const resp = ids.length
    ? await q(
        `select rr.id, rr.reflection_id, coalesce(m.full_name,'—') author_name,
                coalesce(rr.body,'') body, to_char(rr.created_at,'YYYY-MM-DD') created_at
           from reflection_response rr left join membership m on m.id = rr.author_id
          where rr.org_id=$1 and rr.reflection_id = any($2::uuid[])
          order by rr.created_at asc`,
        [org, ids],
      )
    : [];
  const reflections: ReflectionSummary[] = rows.map((r) => {
    const mine = att.filter((a) => a.reflection_id === r.id);
    const pick = (st: string) =>
      mine
        .filter((a) => a.status === st)
        .map((a) => ({ id: a.person_id as string, name: (a.name as string) ?? "—" }));
    const canSeePersonal = pastoral || r.author_id === sub;
    return {
      id: r.id as string,
      occurredOn: (r.occurred_on as string) ?? "",
      expectedCount: (r.expected_count as number) ?? null,
      keyMoment: r.key_moment as string,
      concernFollowup: r.concern_followup as string,
      leaderPersonal: canSeePersonal ? ((r.leader_personal as string) ?? "") : null,
      authorId: r.author_id as string,
      authorName: (r.author_name as string) ?? "—",
      present: pick("present"),
      absent: pick("absent"),
      responses: resp
        .filter((x) => x.reflection_id === r.id)
        .map((x) => ({
          id: x.id as string,
          authorName: (x.author_name as string) ?? "—",
          body: (x.body as string) ?? "",
          createdAt: (x.created_at as string) ?? "",
        })),
    };
  });
  // Admins (Alex/Priya/Dana/Robin) don't lead Bible Hangouts — reflections
  // are submitted by role='leader' members only; admins review. canRespond =
  // pastoral (Alex/Priya) may reply to any reflection they can see.
  return { reflections, canSubmit: leader === sub && !isAdmin, canRespond: pastoral };
}

export async function deleteReflectionAction(id: string): Promise<void> {
  const s = await requireSession();
  const pastoral = await isPastoral(s.sub);
  await q(`delete from reflection where id=$1 and org_id=$2 and ($3 or author_id=$4)`, [
    id,
    s.org,
    pastoral,
    s.sub,
  ]);
}

// A pastoral reply on a leader's reflection — closes the one-way loop. Write is
// pastoral-only (Alex/Priya), SERVER-enforced here (never trust the UI). The
// leader sees it back under their own entry; ops admins never see reflections.
export async function addReflectionResponseAction(
  reflectionId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (!(await isPastoral(s.sub))) return { ok: false, error: "Pastoral team only." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Write a reply first." };
  // The reflection must exist in this org (guards against a stray/cross-org id).
  const owns = await q<{ id: string }>(
    `select id from reflection where id=$1 and org_id=$2`,
    [reflectionId, s.org],
  );
  if (!owns[0]) return { ok: false, error: "Reflection not found." };
  await q(
    `insert into reflection_response (org_id, reflection_id, author_id, body)
     values ($1,$2,$3,$4)`,
    [s.org, reflectionId, s.sub, text],
  );
  return { ok: true };
}

// Remove a pastoral reply — only its own author may delete it.
export async function deleteReflectionResponseAction(id: string): Promise<void> {
  const s = await requireSession();
  if (!(await isPastoral(s.sub))) return;
  await q(`delete from reflection_response where id=$1 and org_id=$2 and author_id=$3`, [id, s.org, s.sub]);
}

export type UnansweredReflection = {
  reflectionId: string;
  leaderId: string;
  leaderName: string;
  occurredOn: string;
  ageDays: number;
};

// The pastoral nudge on /overview: reflections nobody has replied to yet, oldest
// first (longest-waiting = worst). Pastoral-only; retired leaders' reflections
// don't nag. Without this, the loop quietly dies in week three.
export async function getUnansweredReflectionsAction(): Promise<UnansweredReflection[]> {
  const s = await requireSession();
  if (!(await isPastoral(s.sub))) return [];
  const rows = await q(
    `select r.id, r.author_id, coalesce(m.full_name,'—') name,
            to_char(r.occurred_on,'YYYY-MM-DD') occurred_on,
            (current_date - r.occurred_on) age_days
       from reflection r
       join membership m on m.id = r.author_id
      where r.org_id=$1 and m.deactivated_at is null
        and not exists (select 1 from reflection_response rr where rr.reflection_id = r.id)
      order by r.occurred_on asc, r.created_at asc`,
    [s.org],
  );
  return rows.map((r) => ({
    reflectionId: r.id as string,
    leaderId: r.author_id as string,
    leaderName: (r.name as string) ?? "—",
    occurredOn: (r.occurred_on as string) ?? "",
    ageDays: Number(r.age_days ?? 0),
  }));
}

// ── Leader growth (formative evaluation) ────────────────────────────────────
// Narrative-first, NO numeric scores. Optional non-numeric self-marker only. One
// SHARED structure carries both the leader's SELF entry and the pastor's entry
// across the same six dimensions (+ an 'overall' row for the Leading→Raising→
// Sending ladder), so the eval view renders self-beside-pastor per dimension.

export type GrowthDimension =
  | "warmth"
  | "availability"
  | "shepherding"
  | "facilitation"
  | "safe_room"
  | "outreach"
  | "multiplication"
  | "overall";
export type GrowthMarker = "growing" | "steady" | "stretch";
export type GrowthLadder = "leading" | "raising" | "sending";

export type GrowthEntry = {
  dimension: GrowthDimension;
  authorKind: "self" | "pastor";
  marker: GrowthMarker | null;
  ladder: GrowthLadder | null;
  nextRep: string | null; // overall row only — "next rep, with a date"
  body: string;
  authorName: string;
  updatedAt: string | null;
};

export async function getGrowthAction(
  subjectId: string,
  term: string,
): Promise<{ entries: GrowthEntry[]; canEditSelf: boolean; canEditPastor: boolean }> {
  const { org, sub, leader, isAdmin, pastoral } = await resolveLeader(subjectId);
  // Growth/eval is pastoral/leadership content — same gate as reflections:
  // own, or pastoral oversight. Ops admins (Dana/Robin) see none.
  if (leader !== sub && !pastoral) {
    return { entries: [], canEditSelf: false, canEditPastor: false };
  }
  const rows = await q(
    `select g.dimension, g.author_kind, g.marker, g.ladder, g.next_rep, coalesce(g.body,'') body,
            coalesce(m.full_name,'—') author_name, g.updated_at
       from growth_entry g left join membership m on m.id = g.author_id
      where g.org_id=$1 and g.subject_id=$2 and g.term=$3`,
    [org, leader, term],
  );
  return {
    entries: rows.map((r) => ({
      dimension: r.dimension as GrowthDimension,
      authorKind: r.author_kind as "self" | "pastor",
      marker: (r.marker as GrowthMarker) ?? null,
      ladder: (r.ladder as GrowthLadder) ?? null,
      nextRep: (r.next_rep as string) ?? null,
      body: r.body as string,
      authorName: (r.author_name as string) ?? "—",
      updatedAt: iso(r.updated_at),
    })),
    canEditSelf: leader === sub && !isAdmin, // Hangout leaders self-assess; admins don't lead Hangouts
    canEditPastor: pastoral, // pastoral oversight writes the pastor column
  };
}

export async function saveGrowthEntryAction(
  subjectId: string,
  term: string,
  dimension: GrowthDimension,
  authorKind: "self" | "pastor",
  patch: { marker?: GrowthMarker | null; ladder?: GrowthLadder | null; nextRep?: string | null; body?: string },
): Promise<void> {
  const s = await requireSession();
  const pastoral = await isPastoral(s.sub);
  if (authorKind === "self" && subjectId !== s.sub) throw new Error("not allowed");
  if (authorKind === "pastor" && !pastoral) throw new Error("not allowed");
  await q(
    `insert into growth_entry
       (org_id, subject_id, term, dimension, author_kind, author_id, marker, ladder, next_rep, body, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     on conflict (subject_id, term, dimension, author_kind)
     do update set marker=excluded.marker, ladder=excluded.ladder, next_rep=excluded.next_rep,
                   body=excluded.body, author_id=excluded.author_id, updated_at=now()`,
    [
      s.org,
      subjectId,
      term,
      dimension,
      authorKind,
      s.sub,
      patch.marker ?? null,
      patch.ladder ?? null,
      patch.nextRep?.trim() || null,
      patch.body?.trim() || null,
    ],
  );
}

// Reflection recency, for the Today prompt (viewed leader) + the Overview digest
// (admins only). "This week" = since Monday (Postgres date_trunc('week', ...)).
export type ReflectionDigest = {
  myLastOn: string | null;
  myThisWeek: boolean;
  perLeader: { id: string; name: string; lastOn: string | null; thisWeek: boolean }[];
};

export async function getReflectionDigestAction(leaderId?: string): Promise<ReflectionDigest> {
  const { org, leader, pastoral } = await resolveLeader(leaderId);
  const mine = await q<{ last: string | null; this_week: boolean }>(
    `select to_char(max(occurred_on),'YYYY-MM-DD') last,
            coalesce(bool_or(occurred_on >= date_trunc('week', current_date)), false) this_week
       from reflection where org_id=$1 and author_id=$2`,
    [org, leader],
  );
  // Per-leader reflection digest = pastoral-only (Alex/Priya). Ops admins
  // (Dana/Robin) get their own status only, never others' reflection cadence.
  let perLeader: ReflectionDigest["perLeader"] = [];
  if (pastoral) {
    perLeader = (
      await q(
        `select m.id, coalesce(m.full_name,'—') name,
                to_char(max(r.occurred_on),'YYYY-MM-DD') last,
                coalesce(bool_or(r.occurred_on >= date_trunc('week', current_date)), false) this_week
           from membership m
           left join reflection r on r.author_id = m.id and r.org_id = $1
          where m.org_id = $1 and m.role = 'leader' and m.deactivated_at is null
          group by m.id, m.full_name
          order by m.full_name`,
        [org],
      )
    ).map((r) => ({
      id: r.id as string,
      name: (r.name as string) ?? "—",
      lastOn: (r.last as string) ?? null,
      thisWeek: Boolean(r.this_week),
    }));
  }
  return {
    myLastOn: mine[0]?.last ?? null,
    myThisWeek: Boolean(mine[0]?.this_week),
    perLeader,
  };
}

// ── Org settings (admin) ────────────────────────────────────────────────────

// Coordinator = the accountable backstop for unclaimed captures. Exactly one per
// org; setting a new one clears the rest in a single statement. Admin-only.
export async function setCoordinatorAction(membershipId: string): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  await q(`update membership set is_coordinator = (id = $2) where org_id = $1`, [s.org, membershipId]);
}

// Active term for reflections/growth. Admin override (app_setting) wins; otherwise
// derived from today's date so it auto-rolls each semester.
function computeTerm(d: Date): string {
  const m = d.getMonth();
  const season = m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Fall";
  return `${season} ${d.getFullYear()}`;
}

export async function getActiveTermAction(): Promise<string> {
  const s = await requireSession();
  const r = await q<{ value: string | null }>(`select value from app_setting where org_id=$1 and key='term'`, [s.org]);
  return r[0]?.value?.trim() || computeTerm(new Date());
}

export async function setTermAction(term: string): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  const v = term.trim();
  if (!v) throw new Error("empty term");
  await q(
    `insert into app_setting (org_id, key, value, updated_at) values ($1,'term',$2, now())
     on conflict (org_id, key) do update set value = excluded.value, updated_at = now()`,
    [s.org, v],
  );
}

// The monthly "retrieval prompt" shown on the reflection form — one question that
// asks a leader to say, in their own words, the one thing from the last Core Night
// and where it showed up. Free text in app_setting (key 'retrieval_prompt'); admin
// swaps it ~monthly. Empty = no prompt shown.
export async function getRetrievalPromptAction(): Promise<string> {
  const s = await requireSession();
  const r = await q<{ value: string | null }>(`select value from app_setting where org_id=$1 and key='retrieval_prompt'`, [s.org]);
  return r[0]?.value?.trim() || "";
}

export async function setRetrievalPromptAction(text: string): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  await q(
    `insert into app_setting (org_id, key, value, updated_at) values ($1,'retrieval_prompt',$2, now())
     on conflict (org_id, key) do update set value = excluded.value, updated_at = now()`,
    [s.org, text.trim()],
  );
}

// The editable "what to expect at R20 Nights" blurb shown on the /hi link tree.
// Admin edits it weekly (scripture/songs/vibe); read publicly via getNightsInfoAction.
export async function getNightsInfoSettingAction(): Promise<string> {
  const s = await requireSession();
  const r = await q<{ value: string | null }>(`select value from app_setting where org_id=$1 and key='nights_info'`, [s.org]);
  return r[0]?.value ?? "";
}

export async function setNightsInfoAction(text: string): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  await q(
    `insert into app_setting (org_id, key, value, updated_at) values ($1,'nights_info',$2, now())
     on conflict (org_id, key) do update set value = excluded.value, updated_at = now()`,
    [s.org, text.trim() || null],
  );
}

// ── "What to Expect Tonight" card — hand-edit editor (admin) ──────────────────
// The weekly card that r20-reach renders on /hi's "expect" view. The sermon-prep app
// auto-publishes it into public.tonight_card, but an admin can also hand-write/fix one
// here. Same shared table; ALWAYS org-scoped to the SESSION org (like nights_info), so
// it can never touch another org's row and needs no env. Fields are split pre-talk-safe
// (title/question/passages) vs after-the-talk (turn/open_questions/next_step/keep_line/
// go_deeper) exactly like the published card (see 0029_tonight_card.sql).
export type TonightPassageInput = { ref: string; why?: string; text?: string };
export type TonightCardInput = {
  effectiveDate: string; // YYYY-MM-DD (the Saturday)
  title: string;
  question: string;
  passages: TonightPassageInput[];
  turn: string;
  openQuestions: string[];
  nextStep: string;
  keepLine: string;
  goDeeper: string;
};

// Load a card for editing — a given date, else the latest effective_date <= today.
// Org-scoped via the session org (same resolution nights_info uses). null = nothing yet.
export async function getTonightCardSettingAction(
  effectiveDate?: string,
): Promise<TonightCardInput | null> {
  const s = await requireSession();
  const wantDate = effectiveDate?.trim() || null;
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
      where org_id=$1 and ($2::date is null or effective_date = $2::date)
      order by effective_date desc
      limit 1`,
    [s.org, wantDate],
  );
  const r = rows[0];
  if (!r) return null;
  const passages: TonightPassageInput[] = Array.isArray(r.passages)
    ? (r.passages as unknown[])
        .map((p) => {
          const o = (p ?? {}) as { ref?: unknown; why?: unknown; text?: unknown };
          const ref = typeof o.ref === "string" ? o.ref.trim() : "";
          const why = typeof o.why === "string" ? o.why.trim() : "";
          const text = typeof o.text === "string" ? o.text.trim() : "";
          return ref ? { ref, ...(why ? { why } : {}), ...(text ? { text } : {}) } : null;
        })
        .filter((p): p is TonightPassageInput => p !== null)
    : [];
  const openQuestions: string[] = Array.isArray(r.open_questions)
    ? (r.open_questions as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];
  return {
    effectiveDate: r.effective_date,
    title: r.title,
    question: r.question,
    passages,
    turn: r.turn ?? "",
    openQuestions,
    nextStep: r.next_step ?? "",
    keepLine: r.keep_line ?? "",
    goDeeper: r.go_deeper ?? "",
  };
}

// Upsert a hand-edited card into public.tonight_card for the SESSION org (so it's
// automatically the right org, no env). Admin-only, keyed on (org_id, effective_date).
// Returns a result object rather than throwing — Next redacts thrown Server-Action
// error messages in production (they surface as the scary generic "Server Components
// render" error), so validation feedback must come back as data to be useful.
export async function setTonightCardAction(card: TonightCardInput): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) return { ok: false, error: "Admins only." };
  const date = card.effectiveDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Pick the Saturday this card is for." };
  const title = card.title.trim();
  const question = card.question.trim();
  if (!title || !question) return { ok: false, error: "A title and a question are required." };
  const passages = (card.passages ?? [])
    .map((p) => ({
      ref: (p.ref ?? "").trim(),
      ...((p.why ?? "").trim() ? { why: (p.why ?? "").trim() } : {}),
      // Preserve the printed verse text through a Settings save (it has no
      // form field yet, so dropping it here would silently wipe the card).
      ...((p.text ?? "").trim() ? { text: (p.text ?? "").trim().slice(0, 2000) } : {}),
    }))
    .filter((p) => p.ref);
  const openQuestions = (card.openQuestions ?? []).map((x) => x.trim()).filter(Boolean);
  try {
    await q(
      `insert into public.tonight_card
         (org_id, effective_date, title, question, passages, turn, open_questions, next_step, keep_line, go_deeper, published_at)
       values ($1,$2::date,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10, now())
       on conflict (org_id, effective_date) do update set
         title          = excluded.title,
         question       = excluded.question,
         passages       = excluded.passages,
         turn           = excluded.turn,
         open_questions = excluded.open_questions,
         next_step      = excluded.next_step,
         keep_line      = excluded.keep_line,
         go_deeper      = excluded.go_deeper,
         published_at   = now()`,
      [
        s.org,
        date,
        title,
        question,
        JSON.stringify(passages),
        card.turn.trim() || null,
        JSON.stringify(openQuestions),
        card.nextStep.trim() || null,
        card.keepLine.trim() || null,
        card.goDeeper.trim() || null,
      ],
    );
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save to the database. Try again in a moment." };
  }
}

// ── Service-feedback pulse (admin read) ───────────────────────────────────────
// The post-Nights "how was tonight?" sentiment (public capture in join/actions).
// Admin-only aggregate: a distribution + average over the window + the recent
// comments. Reads the gathering's health, never a person. Degrades to empty if the
// table isn't there yet (migration 0030) so /overview never breaks.
export type ServiceFeedbackItem = {
  id: string;
  rating: number | null;
  comment: string | null;
  firstName: string | null;
  phone: string | null; // optional "text me back" number — manual reply only, never journey-enrolled
  src: string | null;
  at: string; // YYYY-MM-DD
};
export type ServiceFeedbackSummary = {
  total: number;
  avg: number | null; // 1..4, or null if no ratings
  dist: { rating: number; n: number }[]; // rating 1..4 → count
  recent: ServiceFeedbackItem[];
  windowDays: number;
};

export async function getServiceFeedbackAction(windowDays = 30): Promise<ServiceFeedbackSummary> {
  const empty: ServiceFeedbackSummary = { total: 0, avg: null, dist: [1, 2, 3, 4].map((r) => ({ rating: r, n: 0 })), recent: [], windowDays };
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) return empty;
  try {
    const rows = await q<{
      id: string;
      rating: number | null;
      comment: string | null;
      first_name: string | null;
      phone: string | null;
      src: string | null;
      at: string;
    }>(
      `select id, rating, comment, first_name, phone, src, to_char(created_at,'YYYY-MM-DD') as at
         from service_feedback
        where org_id=$1 and created_at >= now() - ($2 || ' days')::interval
        order by created_at desc
        limit 100`,
      [s.org, windowDays],
    );
    const ratings = rows.map((r) => r.rating).filter((n): n is number => typeof n === "number");
    const avg = ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;
    const dist = [1, 2, 3, 4].map((r) => ({ rating: r, n: ratings.filter((x) => x === r).length }));
    return {
      total: rows.length,
      avg,
      dist,
      recent: rows.map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, firstName: r.first_name, phone: r.phone, src: r.src, at: r.at })),
      windowDays,
    };
  } catch {
    return empty;
  }
}

// ── 30-Second Survey aggregate — the "learn the field" read ──────────────────
// Pooled counts of survey_response for the campus lead to hand to sermon/bridge
// prep. Pastoral OR admin (the campus lead is one of them). Counts are over stable
// KEYS (survives a copy reword); labels are resolved from the instrument. Anonymous
// by default — this surface shows themes, never who said what. windowDays omitted =
// all-time (the intent is a monthly pool).
export type SurveyOptionCount = { key: string; label: string; n: number };
export type SurveyAggregate = {
  total: number;
  withContact: number; // opted in with a phone/handle (became a person)
  excited: SurveyOptionCount[]; // v3 — the one question: most excited about this year
  // Retired from the form; the UI shows each only while it holds data, so the
  // responses already collected keep their value. v2 = identity + spiritual scale.
  identity: SurveyOptionCount[];
  q2: { avg: number | null; n: number; dist: { score: number; n: number }[] };
  q1: SurveyOptionCount[];
  q3: SurveyOptionCount[];
  q4a: SurveyOptionCount[];
  q4b: SurveyOptionCount[];
  others: { excited: string[]; identity: string[]; q3: string[]; q4a: string[]; q4b: string[] }; // free-text answers
  surveyors: { name: string; n: number }[]; // per-administrator counts (?by= links)
  windowDays: number | null;
};

// The live Q&A stack — questions texted in via the tap card (qa_question). The
// moderator reads this on their phone during the food window and takes them live.
// Recent window only (last 36h) so old Saturdays don't pile into tonight's stack.
export type QaQuestionRow = { id: string; body: string; firstName: string | null; at: string };

export async function getQaQuestionsAction(): Promise<QaQuestionRow[]> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub)) && !(await isPastoral(s.sub))) return [];
  try {
    const rows = await q<{ id: string; body: string; first_name: string | null; created_at: string }>(
      `select id, body, first_name, created_at
         from qa_question
        where org_id=$1 and created_at >= now() - interval '36 hours'
        order by created_at asc
        limit 200`,
      [s.org],
    );
    return rows.map((r) => ({ id: r.id, body: r.body, firstName: r.first_name, at: r.created_at }));
  } catch {
    return [];
  }
}

// Event sign-ins (/event?e=<slug>) — per-event capture counts for the admin read:
// "did we actually catch the people the event pulled?" Complements the physical
// wristband count. Same access gate as the survey aggregate.
export type EventCheckinAggregate = {
  total: number;
  events: { slug: string; n: number; withContact: number; last: string; details: { name: string; detail: string }[] }[];
};

export async function getEventCheckinAggregateAction(): Promise<EventCheckinAggregate> {
  const empty: EventCheckinAggregate = { total: 0, events: [] };
  const s = await requireSession();
  if (!(await isAdminMember(s.sub)) && !(await isPastoral(s.sub))) return empty;
  try {
    const rows = await q<{ slug: string; n: string; with_contact: string; last: string }>(
      `select event_slug as slug, count(*) as n, count(person_id) as with_contact, max(created_at) as last
         from event_checkin
        where org_id=$1
        group by event_slug
        order by max(created_at) desc`,
      [s.org],
    );
    // Per-event extra-ask answers (e.g. find-your-classes buildings — the crews
    // pre-sort the walking groups from this list the night before). Capped.
    const detailRows = await q<{ slug: string; name: string | null; detail: string }>(
      `select event_slug as slug, first_name as name, detail
         from event_checkin
        where org_id=$1 and detail is not null
        order by created_at desc
        limit 300`,
      [s.org],
    );
    return {
      total: rows.reduce((a, r) => a + Number(r.n), 0),
      events: rows.map((r) => ({
        slug: r.slug,
        n: Number(r.n),
        withContact: Number(r.with_contact),
        last: r.last,
        details: detailRows.filter((d) => d.slug === r.slug).map((d) => ({ name: d.name ?? "—", detail: d.detail })),
      })),
    };
  } catch {
    return empty;
  }
}

export async function getSurveyAggregateAction(windowDays?: number): Promise<SurveyAggregate> {
  const empty: SurveyAggregate = {
    total: 0, withContact: 0,
    excited: [], identity: [], q1: [], q2: { avg: null, n: 0, dist: [] }, q3: [], q4a: [], q4b: [],
    others: { excited: [], identity: [], q3: [], q4a: [], q4b: [] }, surveyors: [], windowDays: windowDays ?? null,
  };
  const s = await requireSession();
  if (!(await isAdminMember(s.sub)) && !(await isPastoral(s.sub))) return empty;
  try {
    const where = windowDays ? `and created_at >= now() - ($2 || ' days')::interval` : "";
    const params = windowDays ? [s.org, windowDays] : [s.org];
    const rows = await q<{
      q_excited: string | null;
      q_excited_other: string | null;
      q_identity: string | null;
      q_identity_other: string | null;
      q1_experience: string | null;
      q2_spiritual: number | null;
      q3_writeoff: string[] | null;
      q3_other: string | null;
      q4a_worthwhile: string[] | null;
      q4a_other: string | null;
      q4b_turnoff: string[] | null;
      q4b_other: string | null;
      person_id: string | null;
      surveyor: string | null;
    }>(
      `select q_excited, q_excited_other, q_identity, q_identity_other, q1_experience, q2_spiritual, q3_writeoff, q3_other,
              q4a_worthwhile, q4a_other, q4b_turnoff, q4b_other, person_id, surveyor
         from survey_response
        where org_id=$1 ${where}
        order by created_at desc
        limit 5000`,
      params,
    );

    // Count how many rows carry each key (single or multi), preserving option order.
    const countKeys = (values: (string[] | string | null)[], opts: Opt[]): SurveyOptionCount[] => {
      const tally = new Map<string, number>();
      for (const v of values) {
        const keys = Array.isArray(v) ? v : v ? [v] : [];
        for (const k of keys) tally.set(k, (tally.get(k) ?? 0) + 1);
      }
      return opts.map((o) => ({ key: o.key, label: o.label, n: tally.get(o.key) ?? 0 }));
    };
    const collectOther = (values: (string | null)[]): string[] =>
      values.map((v) => v?.trim()).filter((v): v is string => Boolean(v));

    const q2Vals = rows.map((r) => r.q2_spiritual).filter((n): n is number => typeof n === "number");
    const q2Avg = q2Vals.length ? Math.round((q2Vals.reduce((a, b) => a + b, 0) / q2Vals.length) * 10) / 10 : null;
    const q2Dist = Array.from({ length: 10 }, (_, i) => i + 1).map((score) => ({ score, n: q2Vals.filter((x) => x === score).length }));

    return {
      total: rows.length,
      withContact: rows.filter((r) => r.person_id).length,
      excited: countKeys(rows.map((r) => r.q_excited), Q_EXCITED_OPTIONS),
      identity: countKeys(rows.map((r) => r.q_identity), Q_IDENTITY_OPTIONS),
      q1: countKeys(rows.map((r) => r.q1_experience), Q1_OPTIONS),
      q2: { avg: q2Avg, n: q2Vals.length, dist: q2Dist },
      q3: countKeys(rows.map((r) => r.q3_writeoff), Q3_OPTIONS),
      q4a: countKeys(rows.map((r) => r.q4a_worthwhile), Q4A_OPTIONS),
      q4b: countKeys(rows.map((r) => r.q4b_turnoff), Q4B_OPTIONS),
      others: {
        excited: collectOther(rows.map((r) => r.q_excited_other)),
        identity: collectOther(rows.map((r) => r.q_identity_other)),
        q3: collectOther(rows.map((r) => r.q3_other)),
        q4a: collectOther(rows.map((r) => r.q4a_other)),
        q4b: collectOther(rows.map((r) => r.q4b_other)),
      },
      surveyors: (() => {
        const tally = new Map<string, number>();
        for (const r of rows) if (r.surveyor) tally.set(r.surveyor, (tally.get(r.surveyor) ?? 0) + 1);
        return [...tally.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
      })(),
      windowDays: windowDays ?? null,
    };
  } catch {
    return empty;
  }
}

// Bible Hangout resources — the standing guide/handbook links plus "this week's
// 527" (the weekly Bible-study lesson, Leader + Handout versions). We LINK OUT to
// wherever the docs live (Google Drive share links) rather than host files: the
// 527s are authored weekly as .docx in Drive, so that stays the source of truth.
// Stored as one JSON value in app_setting (key 'hangout_resources'); shown on the
// Hangouts page. Read by any leader; edited by admins only.
export type HangoutResources = {
  guideUrl: string;
  handbookUrl: string;
  week527: { title: string; leaderUrl: string; handoutUrl: string };
  // "This week's word" — Alex's weekly 6–10 min voice note unpacking the month's
  // Core Night teaching. Goes to the leaders' group chat AND here, because the
  // chat is where it gets heard and the app is where it stays findable later.
  word: { title: string; url: string; summary: string };
};

const EMPTY_RESOURCES: HangoutResources = {
  guideUrl: "",
  handbookUrl: "",
  week527: { title: "", leaderUrl: "", handoutUrl: "" },
  word: { title: "", url: "", summary: "" },
};

// Accept blank (= unset) or an http(s) URL. Guards against javascript:/data: links
// ever reaching an href, and trims incidental whitespace from a paste.
function cleanUrl(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return "";
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? v : "";
  } catch {
    return "";
  }
}

export async function getHangoutResourcesAction(): Promise<HangoutResources> {
  const s = await requireSession();
  const r = await q<{ value: string | null }>(
    `select value from app_setting where org_id=$1 and key='hangout_resources'`,
    [s.org],
  );
  const raw = r[0]?.value;
  if (!raw) return EMPTY_RESOURCES;
  try {
    const p = JSON.parse(raw) as Partial<HangoutResources>;
    const w: Partial<HangoutResources["week527"]> = p.week527 ?? {};
    const wd: Partial<HangoutResources["word"]> = p.word ?? {};
    return {
      guideUrl: cleanUrl(p.guideUrl),
      handbookUrl: cleanUrl(p.handbookUrl),
      week527: {
        title: typeof w.title === "string" ? w.title.trim() : "",
        leaderUrl: cleanUrl(w.leaderUrl),
        handoutUrl: cleanUrl(w.handoutUrl),
      },
      word: {
        title: typeof wd.title === "string" ? wd.title.trim() : "",
        url: cleanUrl(wd.url),
        summary: typeof wd.summary === "string" ? wd.summary.trim() : "",
      },
    };
  } catch {
    return EMPTY_RESOURCES;
  }
}

export async function setHangoutResourcesAction(input: HangoutResources): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  const clean: HangoutResources = {
    guideUrl: cleanUrl(input.guideUrl),
    handbookUrl: cleanUrl(input.handbookUrl),
    week527: {
      title: (input.week527?.title ?? "").trim().slice(0, 160),
      leaderUrl: cleanUrl(input.week527?.leaderUrl),
      handoutUrl: cleanUrl(input.week527?.handoutUrl),
    },
    word: {
      title: (input.word?.title ?? "").trim().slice(0, 160),
      url: cleanUrl(input.word?.url),
      summary: (input.word?.summary ?? "").trim().slice(0, 600),
    },
  };
  await q(
    `insert into app_setting (org_id, key, value, updated_at) values ($1,'hangout_resources',$2, now())
     on conflict (org_id, key) do update set value = excluded.value, updated_at = now()`,
    [s.org, JSON.stringify(clean)],
  );
}

// Personal Today-draft templates ("Your texts" in Settings). Self-only — you
// customize your own voice; keys are whitelisted, blanks dropped (= default).
const DRAFT_KEYS = ["new", "crowd", "community", "committed", "checkin", "event_invite"] as const;

export async function saveDraftTemplatesAction(templates: DraftTemplates): Promise<void> {
  const s = await requireSession();
  const clean: Record<string, string> = {};
  for (const k of DRAFT_KEYS) {
    const v = templates[k]?.trim();
    if (v) clean[k] = v.slice(0, 400); // SMS-scale; no essays
  }
  await q(`update membership set draft_templates=$2 where id=$1`, [s.sub, JSON.stringify(clean)]);
}

// ── Guardrailed segment broadcast (admin-only) ──────────────────────────────
// Deliberately NOT a "text everyone" button. Only opted-in people with a phone
// are ever messaged (sms.ts re-checks consent). Preview shows the consent math
// before anything sends; every send is logged to `broadcast`. Dry-run until
// SMS_PROVIDER=twilio.

export type BroadcastFilter = { stage?: Stage | null; campus?: Person["campus"] | null; schoolYear?: SchoolYear | null };
const BROADCAST_MAX = 500; // safety cap; R20 is ~150 — a bigger match means a mistake

// Build the shared WHERE fragment + params for a segment (parameterized).
function segmentWhere(org: string, f: BroadcastFilter): { where: string; params: unknown[] } {
  const params: unknown[] = [org];
  let where = `org_id = $1 and archived_at is null`;
  if (f.stage) {
    params.push(f.stage);
    where += ` and stage = $${params.length}`;
  }
  if (f.campus) {
    params.push(f.campus);
    where += ` and campus = $${params.length}`;
  }
  if (f.schoolYear) {
    params.push(f.schoolYear);
    where += ` and school_year = $${params.length}`;
  }
  return { where, params };
}

function segmentLabel(f: BroadcastFilter): string {
  const parts = [f.stage ?? "All stages", f.campus ?? "all campuses"];
  if (f.schoolYear) parts.push(f.schoolYear.replace("_", " "));
  return parts.join(" · ");
}

// Every broadcast text must carry an opt-out (CTIA) — append if the sender didn't.
function withStop(body: string): string {
  return /\bstop\b/i.test(body) ? body : `${body.trimEnd()} Reply STOP to opt out.`;
}

export type BroadcastPreview = { matched: number; messageable: number; skipped: number; sample: string[] };

export async function previewBroadcastAction(f: BroadcastFilter): Promise<BroadcastPreview> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  const { where, params } = segmentWhere(s.org, f);
  const matched = Number(
    (await q<{ n: number }>(`select count(*)::int n from person where ${where}`, params))[0]?.n ?? 0,
  );
  const msg = await q<{ n: number }>(
    `select count(*)::int n from person where ${where} and sms_consent='opted_in' and phone_e164 is not null`,
    params,
  );
  const messageable = Number(msg[0]?.n ?? 0);
  const sample = (
    await q<{ name: string }>(
      `select nullif(trim(coalesce(first_name,'')||' '||coalesce(last_name,'')),'') name
       from person where ${where} and sms_consent='opted_in' and phone_e164 is not null
       order by first_name limit 5`,
      params,
    )
  ).map((r) => r.name ?? "—");
  return { matched, messageable, skipped: matched - messageable, sample };
}

export type BroadcastResult = { ok: boolean; sent: number; dryRun: number; skipped: number; total: number; error?: string };

export async function sendBroadcastAction(f: BroadcastFilter, body: string): Promise<BroadcastResult> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  const text = withStop(body.trim());
  if (!text || text.length < 6) return { ok: false, sent: 0, dryRun: 0, skipped: 0, total: 0, error: "Message is empty." };

  const { where, params } = segmentWhere(s.org, f);
  const recipients = await q<{ id: string; first_name: string | null; phone_e164: string }>(
    `select id, first_name, phone_e164 from person
     where ${where} and sms_consent='opted_in' and phone_e164 is not null
     order by first_name limit ${BROADCAST_MAX + 1}`,
    params,
  );
  if (recipients.length === 0) return { ok: false, sent: 0, dryRun: 0, skipped: 0, total: 0, error: "No one in this segment has opted in with a phone number." };
  if (recipients.length > BROADCAST_MAX) return { ok: false, sent: 0, dryRun: 0, skipped: 0, total: recipients.length, error: `Segment too large (${recipients.length}). Narrow it — this tool is for targeted sends, not blasts.` };

  const matched = Number((await q<{ n: number }>(`select count(*)::int n from person where ${where}`, params))[0]?.n ?? 0);
  const broadcastId = (
    await q<{ id: string }>(
      `insert into broadcast (org_id, sender_id, segment_label, body, matched_count) values ($1,$2,$3,$4,$5) returning id`,
      [s.org, s.sub, segmentLabel(f), text, matched],
    )
  )[0].id;

  let sent = 0, dryRun = 0, skipped = 0;
  for (const r of recipients) {
    const rendered = text.replaceAll("[FIRST_NAME]", r.first_name?.trim() || "friend");
    const res = await sendSms({ org: s.org, personId: r.id, to: r.phone_e164, body: rendered, broadcastId });
    if (res === "sent") sent++;
    else if (res === "dry_run") dryRun++;
    else skipped++;
  }
  await q(`update broadcast set sent_count=$2 where id=$1`, [broadcastId, sent + dryRun]);
  return { ok: true, sent, dryRun, skipped, total: recipients.length };
}

export type BroadcastRow = { id: string; segmentLabel: string; body: string; matched: number; sent: number; senderName: string; createdAt: string | null };

export async function listBroadcastsAction(): Promise<BroadcastRow[]> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) return [];
  return (
    await q(
      `select b.id, b.segment_label, b.body, b.matched_count, b.sent_count,
              coalesce(m.full_name,'—') sender_name, b.created_at
       from broadcast b left join membership m on m.id=b.sender_id
       where b.org_id=$1 order by b.created_at desc limit 20`,
      [s.org],
    )
  ).map((r) => ({
    id: r.id as string,
    segmentLabel: r.segment_label as string,
    body: r.body as string,
    matched: (r.matched_count as number) ?? 0,
    sent: (r.sent_count as number) ?? 0,
    senderName: (r.sender_name as string) ?? "—",
    createdAt: iso(r.created_at),
  }));
}

// ── Movement Snapshot (admin) ───────────────────────────────────────────────
// Warren's "evaluate on purpose" for R20: measure the MOVEMENT through the five
// circles — inflow (new people reached), advances (forward stage changes), and
// where people are piling up (the bottleneck) — so we can see whether the outer
// engine (reaching + placing) is working, not just whether the inner people are
// cared for. AGGREGATE ONLY — this scores the system and the purposes, never an
// individual soul (the anti-scorecard line). Movement data accrues over time as
// check-ins and stage changes happen; pre-launch it will be sparse, which is honest.
export type MovementStep = { from: Stage; to: Stage; waiting: number; moved: number };
// Reach = the OUTER movement (the evangelism purpose the app used to be blind to).
// All aggregate — new people this window, how they arrived (personal invite vs
// direct), and whether they're sticking (got a second touch). Never per-soul.
export type Reach = {
  viaInvite: number; // new people attributed to a personal invite (referrer)
  direct: number; // new people with no invite attribution (walk-up / QR / ad)
  returned: number; // of this window's new people, how many have ≥2 logged touches
  firstTimeGuests: number; // new people whose first touch was a first-time Nights self check-in
  bySource: { src: string; n: number }[]; // window's new people grouped by ?src= tag (ad/QR/channel), top few
};
export type MovementSnapshot = {
  windowDays: number;
  newPeople: number; // reached (created) in the window
  advanced: number; // total forward stage changes in the window
  steps: MovementStep[]; // per adjacent circle: how many wait in `from` now, how many advanced out of it
  bottleneck: Stage | null; // the `from` circle where people pile up but few advance
  reach: Reach;
  ministry: { serving: number; eligible: number }; // serving among Committed+Core (sending capacity)
};

export async function getMovementSnapshotAction(windowDays = 30): Promise<MovementSnapshot | null> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) return null;
  const days = Math.max(1, Math.min(365, Math.floor(windowDays)));
  const interval = `${days} days`;

  const newPeople = Number(
    (await q<{ n: number }>(
      `select count(*)::int n from person
       where org_id=$1 and archived_at is null and created_at > now() - $2::interval`,
      [s.org, interval],
    ))[0]?.n ?? 0,
  );

  // Reach breakdown of this window's new people (aggregate only).
  const reachRow = (await q<{ via_invite: number; returned: number; first_time: number }>(
    `select
       count(*) filter (where p.referrer_id is not null)::int via_invite,
       count(*) filter (where (select count(*) from pipeline_activity a where a.person_id = p.id) >= 2)::int returned,
       count(*) filter (where p.capture_surface = 'nights_first_time')::int first_time
     from person p
     where p.org_id=$1 and p.archived_at is null and p.created_at > now() - $2::interval`,
    [s.org, interval],
  ))[0];
  const viaInvite = Number(reachRow?.via_invite ?? 0);
  // Which channels the window's new people came through (ad ROI). Aggregate only.
  const srcRows = await q<{ src: string; n: number }>(
    `select acquisition_src src, count(*)::int n from person
     where org_id=$1 and archived_at is null and created_at > now() - $2::interval
       and acquisition_src is not null
     group by acquisition_src order by n desc, src limit 6`,
    [s.org, interval],
  );
  const reach: Reach = {
    viaInvite,
    direct: newPeople - viaInvite,
    returned: Number(reachRow?.returned ?? 0),
    firstTimeGuests: Number(reachRow?.first_time ?? 0),
    bySource: srcRows.map((r) => ({ src: r.src, n: Number(r.n) })),
  };

  const dist = await q<{ stage: string; n: number }>(
    `select stage, count(*)::int n from person where org_id=$1 and archived_at is null group by stage`,
    [s.org],
  );
  const countIn = (st: Stage) => Number(dist.find((d) => d.stage === st)?.n ?? 0);

  const hist = await q<{ from_stage: string | null; to_stage: string; n: number }>(
    `select from_stage, to_stage, count(*)::int n from person_stage_history
     where org_id=$1 and changed_at > now() - $2::interval
     group by from_stage, to_stage`,
    [s.org, interval],
  );
  const idx = (st: string | null) => STAGES.indexOf(st as Stage);
  const isForward = (h: { from_stage: string | null; to_stage: string }) =>
    h.from_stage !== null && idx(h.to_stage) > idx(h.from_stage);
  const movedFrom = (st: Stage) =>
    hist.filter((h) => h.from_stage === st && isForward(h)).reduce((a, h) => a + Number(h.n), 0);

  const steps: MovementStep[] = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    steps.push({ from: STAGES[i], to: STAGES[i + 1], waiting: countIn(STAGES[i]), moved: movedFrom(STAGES[i]) });
  }
  const advanced = hist.filter(isForward).reduce((a, h) => a + Number(h.n), 0);

  // Bottleneck = the circle with people waiting but the fewest advancing out of it.
  let bottleneck: Stage | null = null;
  let worst = -1;
  for (const st of steps) {
    if (st.waiting === 0) continue;
    const score = st.moved === 0 ? st.waiting * 2 : st.waiting / st.moved;
    if (score > worst) {
      worst = score;
      bottleneck = st.from;
    }
  }
  // Ministry: serving ratio among the Committed+Core (aggregate — not per person).
  const mRow = (await q<{ serving: number; eligible: number }>(
    `select
       count(*) filter (where serving_role is not null)::int serving,
       count(*)::int eligible
     from person
     where org_id=$1 and archived_at is null and stage in ('Committed','Core')`,
    [s.org],
  ))[0];
  const ministry = { serving: Number(mRow?.serving ?? 0), eligible: Number(mRow?.eligible ?? 0) };

  return { windowDays: days, newPeople, advanced, steps, bottleneck, reach, ministry };
}

// ── Raising & Sending — the leadership pipeline lens (pastoral only) ─────────
// "Who could carry more / succeed us." NOT a scoreboard: it arranges the Hangout
// leaders by where the PASTOR already put them on the Leading→Raising→Sending
// ladder, and shows the pastor's own prose + soft signals (raising-an-apprentice,
// reflection faithfulness, dimension markers) — never a computed score, never a
// rank, never a named "successor", never shown to the leader. See SUCCESSION.md.
// Grounded in R20's "we evaluate the movement, never the soul" + "we plant, we
// don't split." Sparse pre-launch (honest) — fills in as pastors write growth
// entries and leaders reflect.
const PIPELINE_DIMS: GrowthDimension[] = ["warmth", "shepherding", "facilitation", "safe_room", "outreach", "multiplication"];
export type PipelineMarker = { dimension: GrowthDimension; marker: GrowthMarker };
export type PipelineLeader = {
  id: string;
  name: string;
  ladder: GrowthLadder | null; // pastor's overall ladder, falling back to the leader's self-entry
  ladderSource: "pastor" | "self" | null;
  overallNote: string; // the pastor's overall narrative (self fallback) — prose, never a score
  raising: string; // the multiplication ("raising the next leader") note
  raisingMarker: GrowthMarker | null;
  markers: PipelineMarker[]; // pastor's growing/steady/stretch across the six dimensions
  lastReflectionOn: string | null;
  reflectedThisWeek: boolean;
  rosterSize: number; // quiet context, not a target
  apprentices: string[]; // named people this leader is raising (the raising-tree)
};
export type LeadershipPipeline = { term: string; leaders: PipelineLeader[] };

export async function getLeadershipPipelineAction(): Promise<LeadershipPipeline | null> {
  const s = await requireSession();
  if (!(await isPastoral(s.sub))) return null; // pastoral-only; never leaders or ops admins
  const termRow = await q<{ value: string | null }>(`select value from app_setting where org_id=$1 and key='term'`, [s.org]);
  const term = termRow[0]?.value?.trim() || computeTerm(new Date());

  const leaders = await q<{ id: string; name: string }>(
    // Include gatherers: they're not Hangout leaders yet, but they're raise-up
    // candidates evaluated on follow-up — they land in "not yet on the ladder".
    `select id, coalesce(full_name,'—') name from membership where org_id=$1 and role in ('leader','gatherer') and deactivated_at is null order by full_name`,
    [s.org],
  );
  const growth = await q<{ subject_id: string; dimension: string; author_kind: string; marker: string | null; ladder: string | null; body: string }>(
    `select subject_id, dimension, author_kind, marker, ladder, coalesce(body,'') body
       from growth_entry where org_id=$1 and term=$2`,
    [s.org, term],
  );
  const refl = await q<{ id: string; last: string | null; this_week: boolean }>(
    `select m.id, to_char(max(r.occurred_on),'YYYY-MM-DD') last,
            coalesce(bool_or(r.occurred_on >= date_trunc('week', current_date)), false) this_week
       from membership m left join reflection r on r.author_id = m.id and r.org_id = $1
      where m.org_id = $1 and m.role in ('leader','gatherer') and m.deactivated_at is null group by m.id`,
    [s.org],
  );
  const roster = await q<{ owner_id: string; n: number }>(
    `select owner_id, count(*)::int n from person
      where org_id=$1 and archived_at is null and owner_id is not null group by owner_id`,
    [s.org],
  );
  const apprentices = await q<{ apprentice_of: string; first_name: string; last_name: string }>(
    `select apprentice_of, first_name, coalesce(last_name,'') last_name from person
      where org_id=$1 and archived_at is null and apprentice_of is not null order by first_name`,
    [s.org],
  );

  const pick = (sid: string, dim: string, kind: string) =>
    growth.find((x) => x.subject_id === sid && x.dimension === dim && x.author_kind === kind);

  const out: PipelineLeader[] = leaders.map((l) => {
    const oP = pick(l.id, "overall", "pastor");
    const oS = pick(l.id, "overall", "self");
    const mult = pick(l.id, "multiplication", "pastor") ?? pick(l.id, "multiplication", "self");
    const markers: PipelineMarker[] = PIPELINE_DIMS.flatMap((d) => {
      const e = pick(l.id, d, "pastor");
      return e?.marker ? [{ dimension: d, marker: e.marker as GrowthMarker }] : [];
    });
    const rf = refl.find((r) => r.id === l.id);
    return {
      id: l.id,
      name: l.name,
      ladder: (oP?.ladder as GrowthLadder) ?? (oS?.ladder as GrowthLadder) ?? null,
      ladderSource: oP?.ladder ? "pastor" : oS?.ladder ? "self" : null,
      overallNote: (oP?.body || oS?.body || "").trim(),
      raising: (mult?.body || "").trim(),
      raisingMarker: (mult?.marker as GrowthMarker) ?? null,
      markers,
      lastReflectionOn: rf?.last ?? null,
      reflectedThisWeek: Boolean(rf?.this_week),
      rosterSize: Number(roster.find((r) => r.owner_id === l.id)?.n ?? 0),
      apprentices: apprentices.filter((a) => a.apprentice_of === l.id).map((a) => `${a.first_name} ${a.last_name}`.trim()),
    };
  });
  return { term, leaders: out };
}

// ── Recent commitments (101 "I'm In" / 401 "I'm Sent") — pastoral-only ────────
// The pastoral half of the class-close routing (INBOX #6): /in is OWNED by the
// coordinator (who does the group-chat add), but a 101/401 commitment is also a
// pastoral moment — so it lands here as an active prompt for Alex/Priya to give a
// personal welcome / send-off, not just something they could stumble on in the
// roster. Read from the event log (pipeline_activity) rather than person.capture_surface
// so a person who took 101 AND later 401 shows BOTH events (capture_surface only
// keeps the latest). `touched` = a leader has logged a touch at/after the commitment,
// so a pastor can see who still needs a reach-out.
export type Commitment = {
  personId: string;
  name: string;
  campus: string | null;
  kind: "in" | "sent";
  at: string; // ISO — when they committed
  ownerName: string | null;
  touched: boolean;
};
export type RecentCommitments = { windowDays: number; items: Commitment[] };

export async function getRecentCommitmentsAction(days = 30): Promise<RecentCommitments> {
  const s = await requireSession();
  if (!(await isPastoral(s.sub))) throw new Error("not allowed");
  const windowDays = Math.max(1, Math.min(365, Math.floor(days)));

  // The class-close actions write an auto (actor_id null) marker note per commitment:
  // "…at 101…" for /in, "Commissioned at 401…" for /sent. Match those precisely.
  const rows = await q<{
    person_id: string;
    at: string;
    note: string;
    first_name: string;
    last_name: string | null;
    campus: string | null;
    owner_id: string | null;
    last_touch_at: string | null;
  }>(
    `select pa.person_id, pa.occurred_at as at, pa.note,
            p.first_name, p.last_name, p.campus, p.owner_id, p.last_touch_at
       from pipeline_activity pa
       join person p on p.id = pa.person_id and p.archived_at is null
      where pa.org_id=$1
        and pa.actor_id is null
        and (pa.note like '%at 101%' or pa.note like '%Commissioned at 401%')
        and pa.occurred_at >= now() - make_interval(days => $2)
      order by pa.occurred_at desc
      limit 100`,
    [s.org, windowDays],
  );

  const owners = new Map(
    (await q<{ id: string; full_name: string }>(`select id, full_name from membership where org_id=$1`, [s.org])).map(
      (r) => [r.id, r.full_name] as const,
    ),
  );

  const items: Commitment[] = rows.map((r) => ({
    personId: r.person_id,
    name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
    campus: r.campus,
    kind: r.note.includes("Commissioned at 401") ? "sent" : "in",
    at: r.at,
    ownerName: r.owner_id ? owners.get(r.owner_id) ?? null : null,
    touched: Boolean(r.last_touch_at && r.last_touch_at >= r.at),
  }));

  return { windowDays, items };
}

// ── The org-number inbox ──────────────────────────────────────────────────────
// Replies to the R20 Twilio number are stored by the inbound webhook
// (communication direction='inbound'). These actions read them as per-person
// threads and send consent-gated replies FROM the org number. Personal-phone
// texting (the Send-text flow) is untouched — this is only the org lane.
export type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  status: string | null;
  at: string; // ISO
};
export type InboxRow = {
  personId: string;
  firstName: string;
  lastName: string;
  campus: Person["campus"] | null;
  ownerName: string | null;
  lastBody: string;
  lastDirection: "inbound" | "outbound";
  lastAt: string;
  unread: number;
};

// Inbox visibility mirrors team-texting: admins + the coordinator see all; a
// campus lead sees her campus (untagged people included, same stopgap as the
// snapshot until event.campus lands).
async function inboxScope(sub: string): Promise<{ all: boolean; campus: string | null } | null> {
  const r = await q<{ role: string; is_coordinator: boolean; campus_lead: string | null }>(
    `select role, is_coordinator, campus_lead from membership where id=$1`, [sub]);
  const m = r[0];
  if (!m) return null;
  if (m.role === "admin" || m.is_coordinator) return { all: true, campus: null };
  if (m.campus_lead) return { all: false, campus: m.campus_lead };
  return null;
}

export async function getInboxAction(): Promise<InboxRow[]> {
  const s = await requireSession();
  const scope = await inboxScope(s.sub);
  if (!scope) throw new Error("not allowed");
  const rows = await q(
    `select p.id, p.first_name, p.last_name, p.campus,
            (select full_name from membership m where m.id = p.owner_id) owner_name,
            c.body last_body, c.direction last_direction, c.created_at last_at,
            (select count(*)::int from communication u
              where u.person_id = p.id and u.direction='inbound' and u.read_at is null) unread
     from person p
     join lateral (
       select body, direction, created_at from communication c2
       where c2.person_id = p.id order by c2.created_at desc limit 1
     ) c on true
     where p.org_id = $1 and p.archived_at is null
       and exists (select 1 from communication e where e.person_id = p.id)
       and ($2 or p.campus = $3 or p.campus is null)
     order by c.created_at desc
     limit 100`,
    [s.org, scope.all, scope.campus],
  );
  return rows.map((r) => ({
    personId: r.id as string,
    firstName: (r.first_name as string) ?? "",
    lastName: (r.last_name as string) ?? "",
    campus: (r.campus as Person["campus"]) ?? null,
    ownerName: (r.owner_name as string) ?? null,
    lastBody: (r.last_body as string) ?? "",
    lastDirection: r.last_direction as "inbound" | "outbound",
    lastAt: iso(r.last_at) ?? "",
    unread: Number(r.unread) || 0,
  }));
}

// The full org-number exchange with one person; opening it marks inbound read.
export async function getThreadAction(personId: string): Promise<ThreadMessage[]> {
  const s = await requireSession();
  const scope = await inboxScope(s.sub);
  if (!scope && !(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  await q(`update communication set read_at=now() where person_id=$1 and direction='inbound' and read_at is null`, [personId]);
  const rows = await q(
    `select id, direction, body, status, created_at from communication
     where person_id=$1 and org_id=$2 order by created_at asc limit 200`,
    [personId, s.org],
  );
  return rows.map((r) => ({
    id: r.id as string,
    direction: r.direction as "inbound" | "outbound",
    body: (r.body as string) ?? "",
    status: (r.status as string) ?? null,
    at: iso(r.created_at) ?? "",
  }));
}

// Send FROM the R20 number. sendSms re-checks consent at the moment of send
// (opted_in only) and logs the outbound row the thread reads back.
export async function sendOrgSmsAction(personId: string, body: string): Promise<{ ok: boolean; result: string }> {
  const s = await requireSession();
  const scope = await inboxScope(s.sub);
  if (!scope && !(await canManagePerson(s.sub, s.org, personId))) throw new Error("not allowed");
  const text = (body ?? "").trim().slice(0, 640);
  if (!text) return { ok: false, result: "empty" };
  const p = (await q<{ phone_e164: string | null }>(
    `select phone_e164 from person where id=$1 and org_id=$2 and archived_at is null`, [personId, s.org]))[0];
  if (!p?.phone_e164) return { ok: false, result: "no_phone" };
  const result = await sendSms({ org: s.org, personId, to: p.phone_e164, body: text });
  return { ok: result === "sent" || result === "dry_run", result };
}

// ── Bug reports ───────────────────────────────────────────────────────────────
// A leader hits a problem mid-shift; the cost of telling us has to be near zero,
// or it never gets told. Two boxes from the footer, and the context an agent
// needs to reproduce (page, viewport, browser, deploy sha) is attached without
// anyone typing it. The triage agent reads `new` rows, writes agent_notes, and
// a human still merges any fix.
export type BugRow = {
  id: string;
  reporterName: string | null;
  pagePath: string | null;
  body: string;
  expected: string | null;
  context: Record<string, unknown>;
  status: string;
  agentNotes: string | null;
  fixRef: string | null;
  createdAt: string;
};

export async function reportBugAction(input: {
  body: string;
  expected?: string;
  pagePath?: string;
  context?: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  const body = (input.body ?? "").trim().slice(0, 4000);
  if (!body) return { ok: false, error: "Tell us what happened." };
  const context = {
    ...(input.context ?? {}),
    deploySha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    reportedAt: new Date().toISOString(),
  };
  await q(
    `insert into bug_report (org_id, reporter_id, page_path, body, expected, context)
     values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [s.org, s.sub, (input.pagePath ?? "").slice(0, 200) || null, body,
     (input.expected ?? "").trim().slice(0, 2000) || null, JSON.stringify(context)],
  );
  return { ok: true };
}

export async function listBugsAction(): Promise<BugRow[]> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  const rows = await q(
    `select b.id, m.full_name reporter_name, b.page_path, b.body, b.expected, b.context,
            b.status, b.agent_notes, b.fix_ref, b.created_at
       from bug_report b left join membership m on m.id = b.reporter_id
      where b.org_id=$1
      order by case b.status when 'new' then 0 when 'triaged' then 1 else 2 end, b.created_at desc
      limit 100`,
    [s.org],
  );
  return rows.map((r) => ({
    id: r.id as string,
    reporterName: (r.reporter_name as string) ?? null,
    pagePath: (r.page_path as string) ?? null,
    body: (r.body as string) ?? "",
    expected: (r.expected as string) ?? null,
    context: (r.context as Record<string, unknown>) ?? {},
    status: (r.status as string) ?? "new",
    agentNotes: (r.agent_notes as string) ?? null,
    fixRef: (r.fix_ref as string) ?? null,
    createdAt: iso(r.created_at) ?? "",
  }));
}

export async function setBugStatusAction(id: string, status: "new" | "triaged" | "fixed" | "wontfix"): Promise<void> {
  const s = await requireSession();
  if (!(await isAdminMember(s.sub))) throw new Error("not allowed");
  await q(
    `update bug_report set status=$3, resolved_at = case when $3 in ('fixed','wontfix') then now() else null end
      where id=$1 and org_id=$2`,
    [id, s.org, status],
  );
}
