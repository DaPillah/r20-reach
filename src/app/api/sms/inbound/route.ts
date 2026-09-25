import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { q } from "@/lib/db";

// Twilio inbound-SMS webhook. Twilio POSTs application/x-www-form-urlencoded
// with From (E.164), Body, MessageSid, … whenever a person replies. Its job is
// to keep the app's consent ledger honest:
//
//   - Twilio's Messaging Service Advanced Opt-Out already BLOCKS further sends
//     to a number that texted STOP, at the carrier level, with no webhook. This
//     route does NOT do the blocking — it records it: person.sms_consent flips
//     to 'opted_out', an append-only consent_event is written (twilio_stop),
//     and any active journey enrollment is paused so the sweep stops retrying.
//   - START/UNSTOP → resubscribe; HELP → audit only.
//
// Security: consent is legally load-bearing, so only Twilio may move it. Every
// request is verified against X-Twilio-Signature (HMAC-SHA1 over the exact URL +
// alphabetically-sorted POST params, keyed by the auth token). No valid
// signature → 403 and nothing is mutated. If the token isn't configured we
// refuse to mutate rather than trust an unauthenticated caller.
//
// Returns empty TwiML: Advanced Opt-Out owns the STOP/START/HELP auto-replies;
// we must not double-text.

export const dynamic = "force-dynamic";

const STOP_WORDS = new Set(["stop", "stopall", "stop all", "unsubscribe", "cancel", "end", "quit", "revoke", "optout", "opt out"]);
const START_WORDS = new Set(["start", "unstop", "unstopall", "yes", "resubscribe"]);
const HELP_WORDS = new Set(["help", "info"]);

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = (body = EMPTY_TWIML) =>
  new NextResponse(body, { status: 200, headers: { "content-type": "text/xml; charset=utf-8" } });

// Twilio request-signature check. The signature is HMAC-SHA1(base64) over the
// full request URL with every POST param appended (key then value) in sorted
// key order. https://www.twilio.com/docs/usage/security#validating-requests
function validSignature(url: string, params: Record<string, string>, signature: string, token: string): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// The URL Twilio signed = exactly the webhook URL configured in the console.
// Rebuild it from the forwarded host (Vercel), or take an explicit override.
function requestUrl(req: Request): string {
  if (process.env.TWILIO_WEBHOOK_URL) return process.env.TWILIO_WEBHOOK_URL;
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}/api/sms/inbound`;
}

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;

  // Parse the form body into a plain param map (also the signed payload).
  const form = await req.formData();
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = typeof v === "string" ? v : "";

  // Auth: only a genuinely Twilio-signed request may touch consent.
  if (!token) {
    console.error("[sms inbound] TWILIO_AUTH_TOKEN unset — refusing to mutate consent");
    return twiml();
  }
  const signature = req.headers.get("x-twilio-signature") ?? "";
  if (!signature || !validSignature(requestUrl(req), params, signature, token)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  const from = (params.From ?? "").trim();
  const bodyRaw = (params.Body ?? "").trim();
  const keyword = bodyRaw.toLowerCase().replace(/[^a-z ]/g, "").trim();
  if (!from) return twiml();

  const action: "opt_out" | "resubscribe" | "help" | null = STOP_WORDS.has(keyword)
    ? "opt_out"
    : START_WORDS.has(keyword)
      ? "resubscribe"
      : HELP_WORDS.has(keyword)
        ? "help"
        : null;

  // Every person row on this number (single-org app, but scope by the row's org).
  const people = await q<{ id: string; org_id: string }>(
    `select id, org_id from person where phone_e164 = $1 and archived_at is null`,
    [from],
  );
  const raw = JSON.stringify(params);

  // The org-number inbox: STORE every inbound message on the person's thread
  // (consent keywords included — the thread should show the whole exchange).
  // Unknown numbers aren't stored: no person, no thread (likely wrong number).
  // Insert is idempotent on the Twilio MessageSid so webhook retries can't
  // duplicate a message.
  const msgSid = (params.MessageSid ?? "").trim() || null;
  for (const p of people) {
    await q(
      `insert into communication (org_id, person_id, direction, channel, body, provider_sid, status)
       select $1, $2, 'inbound', 'sms', $3, $4, 'received'
       where not exists (
         select 1 from communication where provider_sid = $4 and direction='inbound' and $4 is not null
       )`,
      [p.org_id, p.id, bodyRaw.slice(0, 1600), msgSid],
    );
  }

  if (!action) return twiml(); // ordinary reply — stored above; consent untouched

  for (const p of people) {
    if (action === "opt_out") {
      await q(
        `update person set sms_consent='opted_out', updated_at=now()
           where id=$1 and sms_consent <> 'opted_out'`,
        [p.id],
      );
      await q(
        `update journey_enrollment set status='paused', paused_reason='opted_out'
           where person_id=$1 and status='active'`,
        [p.id],
      );
      await q(
        `insert into consent_event (org_id, person_id, channel, event, source, raw, occurred_at)
         values ($1,$2,'sms','opt_out','twilio_stop',$3::jsonb, now())`,
        [p.org_id, p.id, raw],
      );
    } else if (action === "resubscribe") {
      await q(
        `update person set sms_consent='opted_in', updated_at=now()
           where id=$1 and sms_consent <> 'opted_in'`,
        [p.id],
      );
      await q(
        `insert into consent_event (org_id, person_id, channel, event, source, raw, occurred_at)
         values ($1,$2,'sms','resubscribe','twilio_start',$3::jsonb, now())`,
        [p.org_id, p.id, raw],
      );
    } else {
      await q(
        `insert into consent_event (org_id, person_id, channel, event, source, raw, occurred_at)
         values ($1,$2,'sms','help','twilio_help',$3::jsonb, now())`,
        [p.org_id, p.id, raw],
      );
    }
  }

  return twiml();
}
