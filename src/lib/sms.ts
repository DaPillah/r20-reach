import "server-only";
import { q } from "@/lib/db";

// Track B outbound SMS — the single choke point every automated text goes
// through. Guardrails live HERE, not in callers:
//   1. Consent gate: person.sms_consent must be 'opted_in' at send time
//      (a STOP between enqueue and send must win).
//   2. Idempotency: the communication row is inserted BEFORE any provider call
//      (SPEC §idempotency); the partial unique index communication_send_uq on
//      (enrollment_id, step_id) makes a retry a no-op, never a double text.
//   3. Provider switch: SMS_PROVIDER env — 'twilio' sends for real (only after
//      the 10DLC campaign is VERIFIED); anything else = DRY RUN: the row is
//      written with status 'dry_run' and nothing leaves the building.
// Purge dry_run rows before go-live: delete from communication where status='dry_run'.

export type SendResult = "sent" | "dry_run" | "skipped_duplicate" | "skipped_no_consent" | "failed";

// Internal STAFF alert (e.g. the coordinator's Saturday gate ping). NOT member
// messaging: no person row, no consent ledger, no communication row — the
// recipient is our own team member who asked for these. Same provider switch
// as sendSms (dry-run unless SMS_PROVIDER=twilio). Never throws.
export async function sendStaffAlert(to: string, body: string): Promise<"sent" | "dry_run" | "failed"> {
  if (process.env.SMS_PROVIDER !== "twilio") {
    console.log(`[staff-alert dry-run] to=${to} body="${body.slice(0, 80)}"`);
    return "dry_run";
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || !service) return "failed";
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, MessagingServiceSid: service, Body: body }),
    });
    const data = (await res.json()) as { sid?: string };
    return res.ok && data.sid ? "sent" : "failed";
  } catch {
    return "failed";
  }
}

export async function sendSms(input: {
  org: string;
  personId: string;
  to: string; // E.164
  body: string;
  enrollmentId?: string;
  stepId?: string;
  broadcastId?: string;
}): Promise<SendResult> {
  // 1. consent gate — re-checked at the moment of send
  const consent = await q<{ sms_consent: string }>(
    `select sms_consent from person where id=$1 and org_id=$2 and archived_at is null`,
    [input.personId, input.org],
  );
  if (consent[0]?.sms_consent !== "opted_in") return "skipped_no_consent";

  // 2. insert-before-send; the unique index absorbs retries
  const rows = await q<{ id: string }>(
    `insert into communication
       (org_id, person_id, direction, channel, body, enrollment_id, step_id, broadcast_id, status)
     values ($1,$2,'outbound','sms',$3,$4,$5,$6,'queued')
     on conflict (enrollment_id, step_id) where direction='outbound' and enrollment_id is not null and step_id is not null
     do nothing
     returning id`,
    [input.org, input.personId, input.body, input.enrollmentId ?? null, input.stepId ?? null, input.broadcastId ?? null],
  );
  if (!rows[0]) return "skipped_duplicate"; // already sent for this (enrollment, step)
  const commId = rows[0].id;

  // 3. provider
  if (process.env.SMS_PROVIDER !== "twilio") {
    await q(`update communication set status='dry_run', provider_sid=$2 where id=$1`, [
      commId,
      `dry:${Date.now()}`,
    ]);
    console.log(`[sms dry-run] to=${input.to} body="${input.body.slice(0, 60)}…"`);
    return "dry_run";
  }

  // Real Twilio send (plain REST — no SDK dependency). Requires the 10DLC
  // campaign VERIFIED + these env vars (Vercel + .env.local, never git):
  // TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID.
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || !service) {
    await q(`update communication set status='failed', error_code='missing_twilio_env' where id=$1`, [commId]);
    return "failed";
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: input.to, MessagingServiceSid: service, Body: input.body }),
    });
    const data = (await res.json()) as { sid?: string; code?: number; message?: string };
    if (!res.ok || !data.sid) {
      await q(`update communication set status='failed', error_code=$2 where id=$1`, [
        commId,
        String(data.code ?? res.status),
      ]);
      return "failed";
    }
    await q(`update communication set status='sent', provider_sid=$2 where id=$1`, [commId, data.sid]);
    return "sent";
  } catch {
    await q(`update communication set status='failed', error_code='network' where id=$1`, [commId]);
    return "failed";
  }
}
