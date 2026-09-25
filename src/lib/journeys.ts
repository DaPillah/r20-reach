import "server-only";
import { q } from "@/lib/db";
import { nextWindowStart, type SendWindow } from "@/lib/sendwindow";
import { sendSms } from "@/lib/sms";

// Track B journey engine (scaffold). An enrollment points at the step ABOUT to
// be sent (current_step_id) and when (scheduled_for). processDueEnrollments()
// sends due steps and advances/completes — it's a pure function of DB state, so
// it can be driven by /api/sweep (cron) today and by Inngest functions later
// (SPEC: Inngest = primary scheduler, the sweep stays as the reconciliation
// net that catches anything >1h overdue).

export const WELCOME_JOURNEY_ID = "88888888-0000-0000-0000-000000000001";
// Seeded in migration 0022. These are leader-enrollable (entry_trigger='manual');
// unlike Welcome, nothing auto-enrolls them — a human confirms the person first.
export const NEW_BELIEVER_JOURNEY_ID = "aaaaaaaa-0000-0000-0000-000000000001";
export const ASSIMILATION_JOURNEY_ID = "bbbbbbbb-0000-0000-0000-000000000001";
// Stay Warm (0023): the bounded long-tail. Leader opts a quiet person in; 3 gentle,
// human-voiced touches over ~10 weeks (NOT VR's monthly-for-a-year drip), skip_if_touched
// on every step. The opt-in, human-first inverse of VR's Follow Up. Auto-trigger from
// drift detection is deferred to the post-launch engagement-health build.
export const STAY_WARM_JOURNEY_ID = "cccccccc-0000-0000-0000-000000000001";
// Come to Nights (0045): the pre-attendance reminder loop — VisitorReach's idea,
// done our way. Auto-enrolled from the three cold-capture doors (visit intent,
// survey opt-in, event check-in) for CONSENTED-TEXT people still at Campus;
// 4 Saturday-windowed nudges, skip_if_touched, completes on arrival (see
// completeNightsReminderOnArrival). Supersedes "no auto-enroll from surveys."
export const NIGHTS_REMINDER_JOURNEY_ID = "dddddddd-0000-0000-0000-000000000001";

// TCPA-friendly send window (stricter than the legal 8am–9pm local).
const QUIET_START_HOUR = 9; // sends allowed from 09:00…
const QUIET_END_HOUR = 20; // …until 20:00 America/New_York

// [FIRST_NAME|friend]-style merge tags (journey_step.body convention from 0001).
// OWNER_FIRST_NAME = the person's owning leader — automated fallbacks are signed
// by the same real human who would have texted personally (research: named-human
// voice; the seam between personal and fallback texts should be invisible).
export function renderBody(
  body: string,
  person: { first_name?: string | null; owner_name?: string | null },
): string {
  return body.replace(/\[([A-Z_]+)\|([^\]]*)\]/g, (_, tag: string, fallback: string) => {
    if (tag === "FIRST_NAME") return person.first_name?.trim() || fallback;
    if (tag === "OWNER_FIRST_NAME") return person.owner_name?.trim().split(/\s+/)[0] || fallback;
    return fallback;
  });
}

function nyHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(d));
}

// Next 09:00 ET as a timestamptz expression offset — computed in SQL to avoid
// TZ math in JS: defer to today 09:00 ET if we're before it, else tomorrow's.
const NEXT_WINDOW_SQL = `
  (date_trunc('day', now() at time zone 'America/New_York')
    + interval '${QUIET_START_HOUR} hours'
    + case when extract(hour from now() at time zone 'America/New_York') >= ${QUIET_START_HOUR}
           then interval '1 day' else interval '0' end
  ) at time zone 'America/New_York'`;

// Enroll a person in any journey (idempotent — unique(person_id, journey_id)).
// Step 1's delay sets the first scheduled_for (Welcome step 1 = delay 0 → now).
// Returns true if a new enrollment was created, false if it already existed or the
// journey isn't active. Dry-run vs live is decided downstream at send time (sms.ts).
export async function enrollInJourney(org: string, personId: string, journeyId: string): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `insert into journey_enrollment (org_id, person_id, journey_id, status, current_step_id, scheduled_for)
     select $1, $2, j.id, 'active', s.id,
            now() + make_interval(
              mins  => case when s.delay_unit = 'minutes' then coalesce(s.delay_amount,0) else 0 end,
              hours => case when s.delay_unit = 'hours'   then coalesce(s.delay_amount,0) else 0 end,
              days  => case when s.delay_unit = 'days'    then coalesce(s.delay_amount,0) else 0 end)
     from journey j
     join journey_step s on s.journey_id = j.id and s.sort_order = 1
     where j.id = $3 and j.org_id = $1 and j.is_active
     on conflict (person_id, journey_id) do nothing
     returning id`,
    [org, personId, journeyId],
  );
  return rows.length > 0;
}

export async function enrollInWelcomeJourney(org: string, personId: string): Promise<void> {
  await enrollInJourney(org, personId, WELCOME_JOURNEY_ID);
}

// Come to Nights enrollment — guarded: only a CONSENTED-TEXT person still at
// Campus (hasn't attended). IG-only and unconsented people never enter (locked
// guardrail); Crowd+ people have already come. Idempotent like enrollInJourney.
export async function enrollInNightsReminder(org: string, personId: string): Promise<boolean> {
  const ok = await q<{ id: string }>(
    `select id from person
      where org_id=$1 and id=$2 and archived_at is null
        and stage='Campus' and phone_e164 is not null and sms_consent='opted_in'`,
    [org, personId],
  );
  if (!ok[0]) return false;
  return enrollInJourney(org, personId, NIGHTS_REMINDER_JOURNEY_ID);
}

// The exit: they came. Called from the at-a-Night captures (first-time guest,
// decision) — the reminder's job is done the moment they walk in. Leaders who
// move someone forward manually don't need this: their touch pauses the journey
// via skip_if_touched, and a stage past Campus never re-enrolls.
export async function completeNightsReminderOnArrival(org: string, personId: string): Promise<void> {
  await q(
    `update journey_enrollment
        set status='completed', scheduled_for=null
      where org_id=$1 and person_id=$2 and journey_id=$3 and status in ('active','paused')`,
    [org, personId, NIGHTS_REMINDER_JOURNEY_ID],
  );
}

export type SweepSummary = {
  due: number;
  sent: number;
  dryRun: number;
  deferredQuietHours: number;
  deferredWindow: number;
  handedToHuman: number;
  pausedNoConsent: number;
  skipped: number;
  completed: number;
};

// Process everything due. Batch-limited; safe to run concurrently-ish thanks to
// the insert-before-send unique index (worst case: one no-op duplicate pass).
export async function processDueEnrollments(): Promise<SweepSummary> {
  const sum: SweepSummary = { due: 0, sent: 0, dryRun: 0, deferredQuietHours: 0, deferredWindow: 0, handedToHuman: 0, pausedNoConsent: 0, skipped: 0, completed: 0 };

  const due = await q<{
    id: string;
    org_id: string;
    person_id: string;
    journey_id: string;
    step_id: string;
    sort_order: number;
    body: string;
    respect_quiet_hours: boolean;
    skip_if_touched: boolean;
    send_window: SendWindow | null;
    first_name: string | null;
    owner_name: string | null;
    phone_e164: string | null;
    sms_consent: string;
    touched_since_enroll: boolean;
  }>(
    `select e.id, e.org_id, e.person_id, e.journey_id,
            s.id as step_id, s.sort_order, s.body, s.respect_quiet_hours,
            s.skip_if_touched, s.send_window,
            p.first_name, o.full_name as owner_name, p.phone_e164, p.sms_consent,
            (p.last_touch_at is not null and p.last_touch_at >= e.enrolled_at) as touched_since_enroll
       from journey_enrollment e
       join journey_step s on s.id = e.current_step_id
       join person p on p.id = e.person_id and p.archived_at is null
       left join membership o on o.id = p.owner_id
      where e.status = 'active' and e.scheduled_for <= now()
      order by e.scheduled_for
      limit 50`,
  );
  sum.due = due.length;

  for (const d of due) {
    // hard gates first — no phone or consent revoked → pause, don't retry forever
    if (!d.phone_e164 || d.sms_consent !== "opted_in") {
      await q(`update journey_enrollment set status='paused', paused_reason='opted_out' where id=$1`, [d.id]);
      sum.pausedNoConsent++;
      continue;
    }
    // a real human already reached out → the human owns them; automation ends
    // ("a person being personally texted by a leader never receives an automated send")
    if (d.skip_if_touched && d.touched_since_enroll) {
      await q(`update journey_enrollment set status='paused', paused_reason='human_engaged' where id=$1`, [d.id]);
      sum.handedToHuman++;
      continue;
    }
    // step send window (e.g. Thu/Fri 4–7pm ET) → defer to the next opening
    if (d.send_window) {
      const next = nextWindowStart(d.send_window, new Date());
      if (next) {
        await q(
          `update journey_enrollment set scheduled_for = (($2::date + $3::time) at time zone 'America/New_York') where id=$1`,
          [d.id, next.date, next.time],
        );
        sum.deferredWindow++;
        continue;
      }
    }
    // quiet hours → push scheduled_for to the next 9am ET window, send then
    if (d.respect_quiet_hours) {
      const h = nyHour(new Date());
      if (h < QUIET_START_HOUR || h >= QUIET_END_HOUR) {
        await q(`update journey_enrollment set scheduled_for = ${NEXT_WINDOW_SQL} where id=$1`, [d.id]);
        sum.deferredQuietHours++;
        continue;
      }
    }

    const result = await sendSms({
      org: d.org_id,
      personId: d.person_id,
      to: d.phone_e164,
      body: renderBody(d.body, d),
      enrollmentId: d.id,
      stepId: d.step_id,
    });
    if (result === "sent") sum.sent++;
    else if (result === "dry_run") sum.dryRun++;
    else if (result === "skipped_no_consent") {
      await q(`update journey_enrollment set status='paused', paused_reason='opted_out' where id=$1`, [d.id]);
      sum.pausedNoConsent++;
      continue;
    } else sum.skipped++; // duplicate or failed — advance anyway on duplicate; failed will alarm via status

    // advance to the next step, or complete
    const advanced = await q<{ id: string }>(
      `update journey_enrollment e
          set current_step_id = n.id,
              scheduled_for = now() + make_interval(
                mins  => case when n.delay_unit = 'minutes' then coalesce(n.delay_amount,0) else 0 end,
                hours => case when n.delay_unit = 'hours'   then coalesce(n.delay_amount,0) else 0 end,
                days  => case when n.delay_unit = 'days'    then coalesce(n.delay_amount,0) else 0 end)
         from journey_step n
        where e.id = $1 and n.journey_id = $2 and n.sort_order = $3 + 1
        returning e.id`,
      [d.id, d.journey_id, d.sort_order],
    );
    if (!advanced[0]) {
      await q(`update journey_enrollment set status='completed', scheduled_for=null where id=$1`, [d.id]);
      sum.completed++;
    }
  }
  return sum;
}
