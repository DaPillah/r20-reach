import { NextResponse } from "next/server";
import crypto from "node:crypto";

// Instagram inbound-DM webhook — PHASE 2 SCAFFOLD, INERT UNTIL CONFIGURED.
//
// This mirrors the Twilio inbound webhook (src/app/api/sms/inbound/route.ts) but
// for Meta's Instagram messaging. It is deliberately inert: with no
// INSTAGRAM_APP_SECRET / INSTAGRAM_VERIFY_TOKEN set (and no completed Meta App
// Review), it verifies nothing can touch our data and does NOT mutate the DB.
//
// WHY INBOUND-ONLY (the whole shape of "automated" for IG): Instagram's
// Messaging API is REPLY-ONLY. Our app can only message an IG user AFTER that
// user has messaged R20's professional account first, and only within a 24-hour
// window (extendable to ~7 days ONLY with the approved human_agent tag). You
// CANNOT programmatically cold-DM a handle collected on the survey. So the only
// place automation is possible is here, on the INBOUND side — after the student
// DMs R20 first (the click-to-Messenger pattern; see INSTAGRAM-SETUP.md).
// Phase 1's cold "first invite DM" therefore stays a manual, human-sent DM.
//
// Meta prerequisites before this can go live (verify names/flows at
// developers.facebook.com — Meta renames these often): IG Professional account,
// a Meta app, Business Verification, and App Review for the messaging permission
// (instagram_business_basic + instagram_business_manage_messages), plus the
// Human Agent feature if we want the 7-day window. Full runbook: INSTAGRAM-SETUP.md.
//
// Security mirrors the SMS route: Meta signs every POST with X-Hub-Signature-256
// (HMAC-SHA256 of the RAW body, keyed by the app secret). No valid signature →
// 403 and nothing is read. If the secret isn't configured we refuse to act.

export const dynamic = "force-dynamic";

// GET: Meta's subscription verification handshake. When you (re)subscribe the
// webhook in the App Dashboard, Meta calls this with hub.mode=subscribe,
// hub.verify_token=<the token you set>, hub.challenge=<nonce>. Echo the challenge
// back verbatim (200, text/plain) IFF the verify token matches ours.
export async function GET(req: Request) {
  const verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN;
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";

  if (!verifyToken) {
    // Inert: not configured yet. Don't complete a handshake we can't authenticate.
    return NextResponse.json({ error: "instagram webhook not configured" }, { status: 403 });
  }
  if (mode === "subscribe" && token && token === verifyToken) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return NextResponse.json({ error: "verification failed" }, { status: 403 });
}

// Meta webhook signature: header is "sha256=" + hex HMAC-SHA256 of the raw body,
// keyed by the app secret. Compare in constant time. (Same scheme as WhatsApp /
// Messenger webhooks; Instagram reuses it.)
function validSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf-8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  // Read the RAW body first — HMAC must be computed over the exact bytes Meta sent
  // (re-serializing parsed JSON would change them and break the signature).
  const rawBody = await req.text();

  if (!appSecret) {
    // Inert: no secret configured → we can't authenticate the caller, so we do
    // nothing. Return 200 so Meta doesn't disable the (not-yet-live) webhook.
    console.warn("[instagram inbound] INSTAGRAM_APP_SECRET unset — webhook inert, ignoring payload");
    return NextResponse.json({ ok: true, inert: true });
  }

  const signature = req.headers.get("x-hub-signature-256");
  if (!validSignature(rawBody, signature, appSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  let payload: InstagramWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as InstagramWebhookPayload;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // We subscribe to the `messages` field. Meta batches events under entry[].
  // Shape (verify against current docs): { object:'instagram',
  //   entry:[{ id, time, messaging:[{ sender:{id}, recipient:{id}, timestamp,
  //   message:{ mid, text } }] }] }. sender.id is the IG-scoped user id (IGSID),
  // NOT a public @handle.
  const events = extractMessageEvents(payload);

  for (const ev of events) {
    // ── Phase 2 TODO (NOT wired yet — kept inert on purpose) ────────────────
    // A faithful mirror of the SMS route stops here until Phase 2 is actually
    // built + Meta-approved. When it is, this loop must:
    //   1. Match/create the person from ev.senderIgsid. Inbound gives an IGSID,
    //      not a handle — Phase 2 needs a follow-up migration adding an IGSID
    //      column (+ last_inbound_at) and a lookup/backfill so a survey-collected
    //      instagram_handle can be reconciled to the IGSID on first contact.
    //   2. Log an INBOUND 'instagram_dm' touch (pipeline_activity) + refresh
    //      last_touch_at, exactly like a text touch (owner loop / "not reached"
    //      flags already treat instagram_dm like text).
    //   3. Route to the owner/coordinator for the same-day human touch.
    //   4. Set last_inbound_at = now() to OPEN the 24h reply window.
    //   5. Optionally auto-reply within the window (icebreaker + short bounded
    //      sequence). EVERY send MUST be gated by the 24h-window check; the
    //      human_agent tag extends it to ~7 days ONLY if that feature is approved.
    // GUARDRAIL (unchanged from Phase 1): IG initiation = consent to an IG reply
    // only. Never cold-DM a collected handle; keep IG threads out of SMS
    // STOP/consent and out of SMS journeys — the channels stay separate.
    console.info("[instagram inbound] message event (inert, not persisted):", {
      senderIgsid: ev.senderIgsid,
      hasText: Boolean(ev.text),
      mid: ev.mid,
    });
  }

  // Always 200 quickly — Meta retries on non-2xx and disables flaky webhooks.
  return NextResponse.json({ ok: true });
}

// ── Payload typing + extraction (tolerant; verify shape against live docs) ────
type InstagramMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean };
};
type InstagramWebhookPayload = {
  object?: string;
  entry?: Array<{ id?: string; time?: number; messaging?: InstagramMessaging[] }>;
};
type MessageEvent = { senderIgsid: string; text: string | null; mid: string | null };

function extractMessageEvents(payload: InstagramWebhookPayload): MessageEvent[] {
  if (payload?.object !== "instagram" || !Array.isArray(payload.entry)) return [];
  const out: MessageEvent[] = [];
  for (const entry of payload.entry) {
    for (const m of entry.messaging ?? []) {
      // Ignore echoes of our own outbound messages.
      if (m.message?.is_echo) continue;
      const senderIgsid = m.sender?.id;
      if (!senderIgsid) continue;
      out.push({ senderIgsid, text: m.message?.text ?? null, mid: m.message?.mid ?? null });
    }
  }
  return out;
}
