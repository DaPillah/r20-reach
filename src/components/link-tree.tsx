"use client";

// PUBLIC — the R20 tap-card / link tree. Two front doors share this ONE component:
//   • /hi       — the in-service door (the NFC/QR card at a Night). Post-Nights page.
//   • /welcome  — the cold / discovery door (ads, dorm-drop QRs, the r20.nyc
//                 "Come to R20 Nights" button). Forces the "you found us" variant.
// The variant is chosen by `forceCold` (from the /welcome route) OR a cold `?src=`
// tag (so a cold link that still lands on /hi does the right thing — belt & braces).
// Styled to mirror r20.nyc (warm near-black, antique gold, Playfair roman-white +
// italic-gold hero). No account. (R20_Hi_Page_Copy_Oikos_Spec.md.)
import { useEffect, useState } from "react";
import { getNightsInfoAction, getTonightCardAction, submitDecisionAction, submitFirstTimeGuestAction, submitPrayerAction, submitQaQuestionAction, submitServiceFeedbackAction, submitVisitAction, type TonightCard } from "@/app/join/actions";
import { ConsentBox, CrowdGhost, CrowdGoldButton, CrowdWordmark, Field, InstagramDmButton, inputCls } from "@/components/crowd";
import { PREFERRED_CONTACT_META, type PreferredContact } from "@/lib/types";

type Mode = null | "expect" | "firsttime" | "decision" | "question" | "prayer" | "feedback" | "visit";

// A ?src= that indicates COLD traffic — someone who found us via an ad or a
// dorm-drop QR and has NOT been to a Night (vs. the default post-Nights page).
// Matches ig-/tt-/fb-/meta-/ad(s)-/dorm-/qr-/welcome-/visit- tokens anywhere in
// the tag (e.g. ig-fall-1, columbia-qr, dorm-drop, r20nyc-visit). The dedicated
// /welcome route is the primary cold signal; this is a fallback for cold links
// that still point at /hi. (R20_Hi_Page_Copy_Oikos_Spec.md §2.)
function isColdSrc(src?: string): boolean {
  if (!src) return false;
  return /(^|-)(ig|tt|fb|meta|ad|ads|dorm|qr|welcome|visit)(-|$)/.test(src.toLowerCase());
}

const FEEDBACK_OPTIONS = [
  { rating: 1, label: "Rough", glyph: "😕" },
  { rating: 2, label: "Okay", glyph: "😐" },
  { rating: 3, label: "Good", glyph: "🙂" },
  { rating: 4, label: "Great", glyph: "🔥" },
] as const;

export function LinkTree({ forceCold = false }: { forceCold?: boolean }) {
  const [mode, setMode] = useState<Mode>(null);
  const [info, setInfo] = useState("");
  const [tonight, setTonight] = useState<TonightCard | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [channel, setChannel] = useState<PreferredContact>("text"); // firsttime/decision: Text vs Instagram DM
  const [handle, setHandle] = useState(""); // Instagram handle when channel = instagram
  const [hasCuid, setHasCuid] = useState<boolean | null>(null); // visit: Columbia ID? (gate access)
  const [lastName, setLastName] = useState(""); // visit, no CUID: must match government ID
  const [email, setEmail] = useState(""); // visit, no CUID: Columbia emails the gate QR here
  const [request, setRequest] = useState("");
  const [smsConsent, setSmsConsent] = useState(false); // TCPA: opt-in must NOT be pre-checked
  const [honeypot, setHoneypot] = useState("");
  const [rating, setRating] = useState<number | null>(null); // service-feedback pulse
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | "question" | "prayer" | "firsttime" | "decision" | "feedback" | "visit">(null);
  const [src, setSrc] = useState<string | undefined>(undefined);
  const cold = forceCold || isColdSrc(src); // /welcome route OR a cold ?src= → "you found us" variant

  useEffect(() => {
    getNightsInfoAction().then(setInfo).catch(() => {});
    // The weekly card (auto-published from sermon-prep); null → evergreen-only.
    getTonightCardAction().then(setTonight).catch(() => {});
    // ?src= = which QR / ad / poster / campus link this tap came from (attribution).
    // ?ask=1 = deep-link straight to the question form (the r20.nyc "Ask us anything"
    // secondary CTA lands here directly instead of on the tile menu).
    try {
      const params = new URLSearchParams(window.location.search);
      setSrc(params.get("src") || undefined);
      if (params.get("ask")) setMode("question");
    } catch { /* ignore */ }
  }, []);

  const reset = () => {
    setMode(null); setName(""); setPhone(""); setChannel("text"); setHandle(""); setHasCuid(null); setLastName(""); setEmail(""); setRequest(""); setSmsConsent(false); setRating(null); setError(null); setDone(null);
  };

  const run = (fn: () => Promise<unknown>, d: NonNullable<typeof done>) => async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      // Validation now comes back as {ok:false,error} (a thrown error would be
      // masked to a scary digest in prod); show that. Anything truly unexpected
      // falls to the friendly catch — never the raw digest.
      const res = (await fn()) as { ok?: boolean; error?: string } | undefined;
      if (res && res.ok === false) { setError(res.error ?? "Please check your info and try again."); return; }
      setDone(d);
    } catch { setError("Something went wrong on our end. Mind trying again in a moment?"); }
    finally { setBusy(false); }
  };

  const consent = phone.trim() ? smsConsent : false;
  // firsttime/decision: contact is REQUIRED — a number (Text) or an IG handle.
  const contactReady = channel === "text" ? phone.trim() !== "" : handle.trim() !== "";
  const contactInput = {
    preferredContact: channel,
    phone: channel === "text" ? phone : "",
    instagramHandle: channel === "instagram" ? handle : undefined,
    smsConsent: channel === "text" ? consent : false, // an IG handle is NOT SMS consent
  };
  const submitFirstTime = run(() => submitFirstTimeGuestAction({ firstName: name, src, honeypot, ...contactInput }), "firsttime");
  const submitDecision = run(() => submitDecisionAction({ firstName: name, src, honeypot, ...contactInput }), "decision");
  // Visit: no CUID → full name + email required (Columbia guest registration
  // emails a per-day gate QR; the name must match a government ID).
  const visitGateReady = hasCuid !== false || (lastName.trim() !== "" && /\S+@\S+\.\S+/.test(email.trim()));
  const submitVisit = run(
    () => submitVisitAction({ firstName: name, phone, smsConsent: consent, src, honeypot, hasCuid: hasCuid ?? undefined, lastName: hasCuid === false ? lastName : undefined, email: hasCuid === false ? email : undefined }),
    "visit",
  );
  // Q&A questions go to the live stack (qa_question), not the person pipeline —
  // anonymous-friendly (name optional, so not via `run`, which requires a name);
  // the question text is the payload.
  const submitQuestion = async () => {
    if (!request.trim() || busy) return;
    setBusy(true); setError(null);
    try { await submitQaQuestionAction({ body: request, firstName: name, src, honeypot }); setDone("question"); }
    catch { setError("Couldn't send that. Mind trying again?"); }
    finally { setBusy(false); }
  };
  const submitPrayer = async () => {
    if (!name.trim() || !request.trim() || busy) return;
    setBusy(true); setError(null);
    try { await submitPrayerAction({ firstName: name, phone, request, src, honeypot }); setDone("prayer"); }
    catch { setError("Couldn't send that. Mind trying again?"); }
    finally { setBusy(false); }
  };
  const submitFeedback = async () => {
    if ((rating === null && !request.trim()) || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await submitServiceFeedbackAction({ rating: rating ?? undefined, comment: request, firstName: name, phone, src, honeypot });
      if (res.ok) setDone("feedback");
      else setError(res.error ?? "Something went wrong.");
    } catch { setError("Something went wrong."); }
    finally { setBusy(false); }
  };

  return (
    <div className="crowd-dark relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden px-6 pb-12 pt-9">
      <CrowdGhost />
      <CrowdWordmark />

      {/* honeypot */}
      <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="absolute -left-[9999px] h-0 w-0" aria-hidden />

      {done ? (
        <Done kind={done} igDm={channel === "instagram" && (done === "firsttime" || done === "decision")} onBack={reset} />
      ) : mode === null && cold ? (
        // COLD / ad-visitor variant — someone who found us via an ad or QR and
        // hasn't been to a Night. Reframed around "you just found us": no "tonight,"
        // and ONE featured next step (come to R20 Nights), the rest secondary.
        <div className="relative mt-9 flex flex-1 flex-col">
          <h1 className="text-[3.25rem] font-bold leading-[0.95] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            <span className="block">Hey,</span>
            <span className="block italic" style={{ color: "var(--gold)" }}>you found us.</span>
          </h1>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
            Curious, skeptical, somewhere in between. You&apos;re welcome here. Here&apos;s the one easy step.
          </p>

          <div className="mt-7 flex flex-col gap-2.5">
            <Tile onClick={() => setMode("visit")} title="I want to come to R20 Nights" glyph="✨" sub="Every Saturday, 7:00, near Columbia. We'll send you the where + a heads-up." />
            <Tile onClick={() => setMode("expect")} title="What should I expect this week?" sub="What we're talking about this Saturday + the whole vibe." />
            <Tile onClick={() => setMode("prayer")} title="I need prayer" sub="We'd love to pray for you." />
            {/* Hangouts haven't started yet — greyed until they do (Alex, 2026-08-15) */}
            <div className="opacity-40"><TileInner title="I want to get into a community" sub="Coming soon" /></div>
          </div>

          <div className="mt-auto pt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>
              Every Saturday · 7:00 PM · Columbia
            </p>
          </div>
        </div>
      ) : mode === null ? (
        // Default post-Nights page — someone at/after a Night. First-person intents.
        <div className="relative mt-9 flex flex-1 flex-col">
          <h1 className="text-[3.25rem] font-bold leading-[0.95] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            <span className="block">You&apos;re</span>
            <span className="block italic" style={{ color: "var(--gold)" }}>welcome here.</span>
          </h1>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">
            Curious, skeptical, somewhere in between. You&apos;re welcome. Tell us how to say hi tonight.
          </p>

          <div className="mt-7 flex flex-col gap-2.5">
            {/* The tonight view: everything about the night behind ONE tile (Alex,
                2026-08-28 — not inline on the landing): the talk's big idea, the
                scriptures, and the full order of service. */}
            <Tile onClick={() => setMode("expect")} title="What's tonight going to look like?" sub="The talk, the scriptures, the whole order. No surprises." />
            {/* Question tile RESTORED (2026-08-27): the redesigned night runs a texted-in
                Q&A — this is the door the moderator + preacher point the room at.
                (Supersedes the 2026-08-15 removal, which predates the Q&A format.) */}
            <Tile onClick={() => setMode("question")} title="I have a question for the Q&A" glyph="💬" sub="Ask anything. We take them live at the end. No mic, no spotlight." />
            <Tile onClick={() => setMode("firsttime")} title="I want to get connected" glyph="👋" sub="First time here? Say hi, we'd love to know you came" />
            <Tile onClick={() => setMode("decision")} title="I took a step toward Jesus" glyph="🙏" sub="Tell us, and a pastor will walk with you" />
            <Tile onClick={() => setMode("prayer")} title="I need prayer" sub="We'd love to pray for you" />
            <Tile onClick={() => setMode("feedback")} title="How was tonight?" sub="A quick, honest read. 10 seconds." />
            <a href="https://www.kindridgiving.com/app/giving/Ligh9999170/FLCNEWYORK" target="_blank" rel="noopener noreferrer" className="block"><TileInner title="I want to give to R20" sub="Goes to supporting churches and missions across the world." /></a>
            {/* Hangouts haven't started yet — greyed until they do (Alex, 2026-08-15) */}
            <div className="opacity-40"><TileInner title="I want to get into a Bible Hangout" sub="Coming soon" /></div>
          </div>

          <div className="mt-auto pt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>
              Every Saturday · 7:00 PM · Columbia
            </p>
          </div>
        </div>
      ) : mode === "expect" ? (
        <Screen title="Tonight" onBack={reset}>
          {/* The whole night behind one tile: the talk (big idea + scriptures), then
              the order of service. Timeline by default (guests scan, they don't
              read); a non-empty nights_info setting overrides the timeline as
              plain text (admin escape hatch). */}
          {tonight && <TonightBlock card={tonight} />}
          <div className="mt-8">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>The order of the night</p>
            {info ? (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted">{info}</p>
            ) : (
              <ExpectTimeline intro={false} />
            )}
          </div>
        </Screen>
      ) : mode === "visit" ? (
        <Screen title="Come this" accent="Saturday" onBack={reset}>
          <p className="mt-2 text-sm text-muted">Every Saturday at 7:00 PM near Columbia. Leave your name and we&apos;ll text you exactly where to go and a little of what to expect. A real person, same day.</p>
          <div className="mt-6 flex flex-col gap-4">
            <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="First name" className={inputCls} /></Field>
            <Field label="Your phone (optional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} /><span className="text-[11px] text-faint">So we can send you the where + a heads-up. No spam, ever.</span></Field>
            <ConsentBox phone={phone} checked={smsConsent} onChange={setSmsConsent} verb="send you the details" />
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-faint">Do you have a Columbia ID?</span>
              <div className="flex gap-2">
                {([["Yes", true], ["No", false]] as const).map(([label, v]) => (
                  <button
                    key={label}
                    onClick={() => setHasCuid(hasCuid === v ? null : v)}
                    className="rounded-full border px-3.5 py-1.5 text-sm"
                    style={hasCuid === v ? { borderColor: "var(--gold)", background: "var(--accent-soft)", color: "var(--gold)" } : { borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {hasCuid === false && (
              <>
                <p className="-mb-1 text-[11px] leading-relaxed text-faint">
                  No problem. Columbia asks guests to be registered. We&apos;ll register you, Columbia emails you a gate QR code, and you bring an ID that matches your name. Easy.
                </p>
                <Field label="Your last name"><input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="As it appears on your ID" className={inputCls} /></Field>
                <Field label="Your email"><input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoCapitalize="none" placeholder="you@school.edu" className={inputCls} /><span className="text-[11px] text-faint">Columbia sends your gate QR code here.</span></Field>
              </>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={submitVisit} disabled={!name.trim() || !visitGateReady || busy} label={busy ? "Sending…" : "Count me in"} />
          </div>
        </Screen>
      ) : mode === "firsttime" ? (
        <Screen title="Welcome," accent="you're here" onBack={reset}>
          <p className="mt-2 text-sm text-muted">First time at R20 Nights? Let us know you came and someone will say hi. No pressure, no agenda.</p>
          <div className="mt-6 flex flex-col gap-4">
            <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="First name" className={inputCls} /></Field>
            <ChannelPicker channel={channel} onChange={setChannel} />
            {channel === "text" ? (
              <>
                <Field label="Your phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} /><span className="text-[11px] text-faint">So a leader can say hi. No spam, ever.</span></Field>
                <ConsentBox phone={phone} checked={smsConsent} onChange={setSmsConsent} verb="say hi" />
              </>
            ) : (
              <Field label="Your Instagram handle"><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourhandle" autoCapitalize="none" autoCorrect="off" className={inputCls} /><span className="text-[11px] text-faint">So a leader can DM you. No spam, ever.</span></Field>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={submitFirstTime} disabled={!name.trim() || !contactReady || busy} label={busy ? "Saying hi…" : "Say hi 👋"} />
          </div>
        </Screen>
      ) : mode === "decision" ? (
        <Screen title="You took a step" accent="🙏" onBack={reset}>
          <p className="mt-2 text-sm text-muted">This is a big deal, and you&apos;re not walking it alone. Leave your name and a pastor will reach out personally to walk with you.</p>
          <div className="mt-6 flex flex-col gap-4">
            <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="First name" className={inputCls} /></Field>
            <ChannelPicker channel={channel} onChange={setChannel} />
            {channel === "text" ? (
              <>
                <Field label="Your phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} /><span className="text-[11px] text-faint">So a pastor can reach out. No spam, ever.</span></Field>
                <ConsentBox phone={phone} checked={smsConsent} onChange={setSmsConsent} verb="walk with me" />
              </>
            ) : (
              <Field label="Your Instagram handle"><input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourhandle" autoCapitalize="none" autoCorrect="off" className={inputCls} /><span className="text-[11px] text-faint">So a pastor can DM you. No spam, ever.</span></Field>
            )}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={submitDecision} disabled={!name.trim() || !contactReady || busy} label={busy ? "Sending…" : "Tell a pastor"} />
          </div>
        </Screen>
      ) : mode === "question" ? (
        <Screen title="Ask" accent="anything" onBack={reset}>
          <p className="mt-2 text-sm text-muted">A question, a doubt, pushback. Send it any time tonight. We take them live in the Q&A after the food. No mic, no spotlight, and you can stay anonymous.</p>
          <div className="mt-6 flex flex-col gap-4">
            <Field label="Your question">
              <textarea value={request} onChange={(e) => setRequest(e.target.value)} autoFocus rows={3} placeholder="Ask the thing you'd actually want answered…" className={inputCls} />
            </Field>
            <Field label="Your first name (optional)">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Leave blank to stay anonymous" className={inputCls} />
            </Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={submitQuestion} disabled={!request.trim() || busy} label={busy ? "Sending…" : "Send it in"} />
          </div>
        </Screen>
      ) : mode === "prayer" ? (
        <Screen title="Prayer" accent="request" onBack={reset}>
          <p className="mt-2 text-sm text-muted">Tell us what&apos;s going on and we&apos;ll actually pray for you.</p>
          <div className="mt-6 flex flex-col gap-4">
            <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="First name" className={inputCls} /></Field>
            <Field label="What can we pray for?"><textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={3} placeholder="Anything on your mind…" className={`${inputCls} resize-y`} /></Field>
            <Field label="Your phone (optional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} /></Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={submitPrayer} disabled={!name.trim() || !request.trim() || busy} label={busy ? "Sending…" : "Send"} />
          </div>
        </Screen>
      ) : (
        <Screen title="How was" accent="tonight?" onBack={reset}>
          <p className="mt-2 text-sm text-muted">Totally anonymous. The honest read helps us more than the polite one.</p>
          <div className="mt-6 flex flex-col gap-4">
            <div className="grid grid-cols-4 gap-2">
              {FEEDBACK_OPTIONS.map((o) => {
                const on = rating === o.rating;
                return (
                  <button
                    key={o.rating}
                    onClick={() => setRating(on ? null : o.rating)}
                    className="flex flex-col items-center gap-1 rounded-xl border py-3 transition-colors"
                    style={{ borderColor: on ? "var(--gold)" : "var(--border)", background: on ? "var(--accent-soft)" : "var(--surface)" }}
                  >
                    <span className="text-xl">{o.glyph}</span>
                    <span className="text-[11px]" style={{ color: on ? "var(--gold)" : "var(--muted)" }}>{o.label}</span>
                  </button>
                );
              })}
            </div>
            <Field label="Anything you'd tell us? (optional)"><textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={3} placeholder="what landed, what didn't, a question it raised…" className={`${inputCls} resize-y`} /></Field>
            <Field label="Your name (optional)"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="only if you want us to know" className={inputCls} /></Field>
            <Field label="Your number (optional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="if you'd like a text back" className={inputCls} /></Field>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={submitFeedback} disabled={(rating === null && !request.trim()) || busy} label={busy ? "Sending…" : "Send"} />
          </div>
        </Screen>
      )}
    </div>
  );
}

// ── shared building blocks (r20.nyc visual language) ────────────────────────

// Text vs Instagram DM — mirrors the survey's opt-in choice (an IG handle is
// NOT SMS consent; the ConsentBox only shows on the text side).
function ChannelPicker({ channel, onChange }: { channel: PreferredContact; onChange: (c: PreferredContact) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-faint">Best way to reach you</span>
      <div className="flex gap-2">
        {(["text", "instagram"] as const).map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className="rounded-full border px-3.5 py-1.5 text-sm"
            style={channel === c ? { borderColor: "var(--gold)", background: "var(--accent-soft)", color: "var(--gold)" } : { borderColor: "var(--border)", color: "var(--muted)" }}
          >
            {PREFERRED_CONTACT_META[c].label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Tile({ onClick, title, sub, glyph }: { onClick: () => void; title: string; sub: string; glyph?: string }) {
  return (
    <button onClick={onClick} className="block w-full text-left"><TileInner title={title} sub={sub} glyph={glyph} /></button>
  );
}
function TileInner({ title, sub, glyph }: { title: string; sub: string; glyph?: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl border p-4 transition-colors"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-snug" style={{ fontFamily: "var(--font-display)" }}>
          {title}{glyph ? ` ${glyph}` : ""}
        </span>
        <span className="mt-0.5 block text-xs text-muted">{sub}</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    </div>
  );
}

function Screen({ title, accent, onBack, children }: { title: string; accent?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="relative mt-9">
      <h1 className="text-[2.25rem] font-bold leading-[1.02] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
        {title}{accent ? " " : ""}
        {accent && <span className="italic" style={{ color: "var(--gold)" }}>{accent}</span>}
      </h1>
      {children}
      <button onClick={onBack} className="mt-7 text-sm text-muted underline underline-offset-4">Back</button>
    </div>
  );
}

// The weekly "tonight" card, rendered UNDER the short evergreen blurb. Deliberately
// SHORT (research 2026-07-10: a phone reader reads ~20-28% of a page; front-load the
// question, back-load the claim). Structure = title + one-line intro/hook + the talk's
// 3 points RENDERED AS QUESTIONS (pre-talk safe, no spoiler) + one low-stakes step.
// Field mapping (no schema change): `question` = the intro/hook, `openQuestions` = the
// 3 points-as-questions, `next_step` = the single CTA. The old passages/turn/keep_line/
// go_deeper columns still exist but are intentionally NOT rendered (kept it short + the
// "turn" stays off the page so nothing spoils the talk).
// The night, one beat per row — kept in lockstep with the Service Guide's
// run-of-show (welcome → songs → giving minute → story → talk → food → Q&A).
// A timeline, not a paragraph: a nervous first-timer scans for "will I be put on
// the spot?" — each row answers it in the sub-line before he can finish asking.
const NIGHT_TIMELINE: { time: string | null; title: string; sub: string }[] = [
  { time: "6:30", title: "Doors open", sub: "Music's on. Come as you are." },
  { time: "7:00", title: "A warm welcome", sub: "What tonight is and isn't. Nothing gets sprung on you." },
  { time: null, title: "A couple of songs", sub: "Sing along, or just listen. Genuinely fine either way." },
  { time: null, title: "One minute on giving", sub: "That's for our members. As a guest, nothing is wanted from you." },
  { time: null, title: "Someone's real story", sub: "A few honest minutes. Nothing for you to do but hear them out." },
  { time: null, title: "The talk", sub: "About 30 minutes. Takes hard questions seriously, including yours." },
  { time: "~8:05", title: "Food, next door", sub: "For everyone. Honestly the best part." },
  { time: "~8:35", title: "Open Q&A", sub: "Text your question from your card. No mic, no spotlight." },
  { time: "~9:00", title: "Done", sub: "On time. Stay and hang, or head out." },
];

function ExpectTimeline({ intro = true }: { intro?: boolean }) {
  return (
    <div className="mt-4">
      {intro && <p className="text-sm leading-relaxed text-muted">The whole night, so nothing surprises you:</p>}
      <div className="mt-4 flex flex-col">
        {NIGHT_TIMELINE.map((b, i) => (
          <div key={i} className="flex gap-3">
            {/* time rail */}
            <div className="flex w-11 shrink-0 flex-col items-end">
              <span className="text-[11px] font-semibold tabular-nums leading-5" style={{ color: b.time ? "var(--gold)" : "var(--border)" }}>
                {b.time ?? "·"}
              </span>
              {i < NIGHT_TIMELINE.length - 1 && (
                <div className="mr-[3px] w-px flex-1 self-end" style={{ background: "var(--border)", minHeight: 14 }} />
              )}
            </div>
            <div className={i < NIGHT_TIMELINE.length - 1 ? "pb-3.5" : ""}>
              <p className="text-sm font-medium leading-5">{b.title}</p>
              <p className="text-[12.5px] leading-snug text-faint">{b.sub}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-5 rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
        You won&apos;t be singled out · you can leave whenever · you don&apos;t have to agree with anything to belong here.
      </p>
    </div>
  );
}

// Tonight = the title + ONE paragraph (the talk's big idea), nothing else on this
// surface. The paragraph's recipe (Robinson's big idea × Loewenstein's information
// gap): name the tension the reader already carries, then state the talk's one
// claim plainly — a specific claim to weigh, never a tease, never jargon. The
// numbered open-questions / next-step fields stay in the card data for other
// surfaces; a preview page shouldn't read like homework.
// Passage text may mark a phrase for emphasis with **double asterisks** (e.g.
// the line the talk is named after). Everything else renders verbatim.
function emphasize(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold" style={{ color: "var(--ink)" }}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function TonightBlock({ card }: { card: TonightCard }) {
  return (
    <div className="mt-4 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
      <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>The talk</p>
      <h2 className="mt-2 text-lg font-semibold leading-snug" style={{ fontFamily: "var(--font-display)" }}>{card.title}</h2>
      {card.question && <p className="mt-2 text-sm leading-relaxed text-muted">{card.question}</p>}
      {/* A passage carrying `text` is PRINTED IN FULL (Alex, 2026-09-11): a guest
          reads the verses on the card instead of leaving for a Bible app. The
          rest stay as a refs line, so a card can do both. */}
      {card.passages.filter((p) => p.text).map((p) => (
        <blockquote
          key={p.ref}
          className="mt-3.5 border-l-2 pl-3.5"
          style={{ borderColor: "var(--gold)" }}
        >
          <p className="whitespace-pre-line text-[13px] leading-relaxed text-muted">{emphasize(p.text!)}</p>
          <cite className="mt-1.5 block text-[11px] not-italic text-faint">{p.ref}</cite>
        </blockquote>
      ))}
      {card.passages.some((p) => !p.text) && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-faint">
          <span className="font-medium" style={{ color: "var(--gold)" }}>Scriptures: </span>
          {card.passages.filter((p) => !p.text).map((p) => p.ref).join(" · ")}
        </p>
      )}
    </div>
  );
}

function Done({ kind, igDm, onBack }: { kind: "question" | "prayer" | "firsttime" | "decision" | "feedback" | "visit"; igDm?: boolean; onBack: () => void }) {
  const head =
    kind === "prayer" ? "We've got it." : kind === "firsttime" ? "Welcome, for real." : kind === "decision" ? "That's the best news." : kind === "feedback" ? "Thanks for the honest read." : kind === "visit" ? "See you Saturday." : "It's in the stack.";
  const body =
    kind === "prayer"
      ? "One of our leaders will be praying for you, and may reach out. A real person, not a bot."
      : kind === "firsttime"
      ? "So glad you came tonight. Someone from R20 will say hi soon. No pressure, no agenda, just glad you're here."
      : kind === "decision"
      ? "Heaven's celebrating, and so are we. A pastor will reach out personally to walk this with you. You're not doing it alone."
      : kind === "feedback"
      ? "That helps us more than the polite version would. No follow-up unless you left your name and asked for one."
      : kind === "visit"
      ? "We'll text you the where + a heads-up before Saturday. A real person, same day. Come as you are, no pressure."
      : "We take questions live in the Q&A after the food. Listen for yours. No name gets read out unless you left one. Send in as many as you like.";
  return (
    <div className="relative mt-12 flex flex-1 flex-col items-start text-left">
      <div className="flex size-12 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--gold)" }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </div>
      <h1 className="mt-5 text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{head}</h1>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{body}</p>
      {igDm && <InstagramDmButton sub="Or message us now. Tap here and we'll reply right there." />}
      <button onClick={onBack} className="mt-7 text-sm text-muted underline underline-offset-4">Back</button>
    </div>
  );
}
