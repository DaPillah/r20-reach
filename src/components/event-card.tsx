"use client";

// PUBLIC — the event sign-in (/event?e=<slug>). The QR at a games night, the float
// social, field games. Same warm crowd chrome as /survey and /hi, single purpose:
// capture the contact of someone who just enjoyed an R20 event ("we're getting
// people through the door; without the contact the effort is wasted"). Contact is
// REQUIRED (Text | Instagram DM, mirroring /hi's get-connected), name + school are
// the only other asks — a sign-in should take ~15 seconds at a party.
//
// ?e=<slug> names the event (persisted in localStorage so a greeter's passed-around
// phone keeps it all night, same pattern as the survey's ?by=). ?src= rides along.
import { useEffect, useState } from "react";
import { submitEventCheckinAction } from "@/app/join/actions";
import { eventFields, eventLabel, eventRsvp, type EventRsvp } from "@/lib/events";
import { PREFERRED_CONTACT_META, type PreferredContact } from "@/lib/types";
import { ConsentBox, CrowdGhost, CrowdGoldButton, CrowdWordmark, Field, InstagramDmButton, InstagramFollowButton, inputCls } from "@/components/crowd";

function Pill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="rounded-full border px-3 py-2 text-left text-sm leading-snug transition-colors"
      style={
        selected
          ? { background: "var(--gold-bright)", color: "#1c1610", borderColor: "var(--gold-bright)" }
          : { background: "var(--surface-2)", color: "var(--ink)", borderColor: "var(--border)" }
      }
    >
      {children}
    </button>
  );
}

// `rsvpMap` = the live DB-over-code RSVP config from the server page; when the
// card renders without it, the code constants still apply (identical fallback).
export function EventCard({ rsvpMap }: { rsvpMap?: Record<string, EventRsvp> } = {}) {
  const [event, setEvent] = useState<string | undefined>(undefined);
  const [src, setSrc] = useState<string | undefined>(undefined);

  const [name, setName] = useState("");
  const [lastName, setLastName] = useState("");
  const [channel, setChannel] = useState<PreferredContact>("text");
  const [phone, setPhone] = useState("");
  const [handle, setHandle] = useState("");
  const [smsConsent, setSmsConsent] = useState(false); // TCPA: never pre-checked
  const [school, setSchool] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({}); // per-event extra fields
  const setAnswer = (k: string, v: string) => setAnswers((a) => ({ ...a, [k]: v }));

  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setSrc(params.get("src") || undefined);
      const e = params.get("e")?.trim();
      if (e) {
        localStorage.setItem("r20.event", e);
        setEvent(e);
      } else {
        setEvent(localStorage.getItem("r20.event") || undefined);
      }
    } catch { /* ignore */ }
  }, []);

  const rsvp = eventRsvp(event, rsvpMap); // non-null → this is an upcoming-event RSVP, not a "you came" sign-in
  const canSubmit = !busy && name.trim() !== "" && (channel === "text" ? phone.trim() !== "" : handle.trim() !== "");

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      const res = await submitEventCheckinAction({
        event,
        firstName: name,
        lastName: lastName.trim() || undefined,
        preferredContact: channel,
        phone: channel === "text" ? phone : undefined,
        instagramHandle: channel === "instagram" ? handle : undefined,
        smsConsent: channel === "text" && phone.trim() ? smsConsent : false,
        campus: school || undefined,
        details: answers,
        src,
        honeypot,
      });
      if (res.ok) setDone(true);
      else setError(res.error);
    } catch {
      // Unexpected server error — never surface the raw/masked digest to a student.
      setError("Something went wrong on our end. Mind trying again in a moment?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="crowd-dark relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden px-6 pb-12 pt-9">
      <CrowdGhost />
      <CrowdWordmark />

      {/* honeypot */}
      <input type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} className="absolute -left-[9999px] h-0 w-0" aria-hidden />

      {done ? (
        <div className="relative mt-12 flex flex-1 flex-col items-start text-left">
          <div className="flex size-12 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--gold)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            {rsvp ? "You're on the list." : "You're in."}
          </h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            {rsvp
              ? channel === "instagram"
                ? `See you there (${rsvp.when}) at ${rsvp.where} We'll message you if anything changes. Since you're on Instagram, send us a quick DM so we can reach you there.`
                : `See you there (${rsvp.when}) at ${rsvp.where} We'll text you if anything changes. No spam, a real person.`
              : channel === "instagram"
                ? "You're in the gift-card draw, and glad you're coming. Since you're on Instagram, send us a quick DM so we can reply and tell you what's next."
                : "We'll send you what's coming next. A real person, no spam. And you're in the gift-card draw. Glad you're coming."}
          </p>
          {channel === "instagram" ? <InstagramDmButton /> : rsvp ? <InstagramFollowButton /> : null}
        </div>
      ) : (
        <div className="relative mt-9 flex flex-1 flex-col">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>
            R20 · {event ? eventLabel(event) : "tonight"}
          </p>
          {rsvp ? (
            <>
              <h1 className="mt-3 text-[2.6rem] font-bold leading-[0.95] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                <span className="block">Glad you&apos;re</span>
                <span className="block italic" style={{ color: "var(--gold)" }}>coming.</span>
              </h1>
              <div className="mt-4 rounded-xl border px-3.5 py-3" style={{ borderColor: "var(--gold)", background: "var(--accent-soft)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--gold)" }}>{rsvp.headline} {rsvp.when}</p>
                <p className="mt-1 text-[13px] leading-snug text-muted">{rsvp.where}</p>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
                RSVP so we&apos;ve got an accurate count and can text you the details. No pressure, come as you are.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-3 text-[2.6rem] font-bold leading-[0.95] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
                <span className="block">Glad you&apos;re</span>
                <span className="block italic" style={{ color: "var(--gold)" }}>coming.</span>
              </h1>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
                Sign in and we&apos;ll tell you about the next ones: more games, more nights, more food. Plus you&apos;re in the draw for the gift card.
              </p>
            </>
          )}

          <div className="mt-7 flex flex-col gap-5">
            <div className="flex gap-3">
              <Field label="First name">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" className={inputCls} />
              </Field>
              <Field label="Last name (optional)">
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={inputCls} />
              </Field>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-faint">Your school (optional)</span>
              <div className="flex flex-wrap gap-2">
                {["Columbia", "NYU"].map((c) => (
                  <Pill key={c} selected={school === c} onClick={() => setSchool(school === c ? "" : c)}>{c}</Pill>
                ))}
              </div>
            </div>

            {eventFields(event).map((f) =>
              f.type === "choice" ? (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-faint">{f.label}</span>
                  <div className="flex flex-wrap gap-2">
                    {f.options?.map((opt) => (
                      <Pill key={opt} selected={answers[f.key] === opt} onClick={() => setAnswer(f.key, answers[f.key] === opt ? "" : opt)}>{opt}</Pill>
                    ))}
                  </div>
                  {f.reveal && answers[f.key] === f.reveal.whenValue && (
                    <div className="mt-2">
                      <Field label={f.reveal.label}>
                        <input value={answers[f.reveal.key] ?? ""} onChange={(e) => setAnswer(f.reveal!.key, e.target.value)} placeholder={f.reveal.placeholder} className={inputCls} />
                      </Field>
                    </div>
                  )}
                </div>
              ) : (
                <Field key={f.key} label={f.label}>
                  {f.type === "textarea" ? (
                    <textarea value={answers[f.key] ?? ""} onChange={(e) => setAnswer(f.key, e.target.value)} placeholder={f.placeholder} rows={2} className={inputCls} />
                  ) : (
                    <input value={answers[f.key] ?? ""} onChange={(e) => setAnswer(f.key, e.target.value)} placeholder={f.placeholder} className={inputCls} />
                  )}
                  {f.help && <span className="text-[11px] text-faint">{f.help}</span>}
                </Field>
              ),
            )}

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-faint">Best way to reach you</span>
              <div className="flex gap-2">
                <Pill selected={channel === "text"} onClick={() => setChannel("text")}>{PREFERRED_CONTACT_META.text.label}</Pill>
                <Pill selected={channel === "instagram"} onClick={() => setChannel("instagram")}>{PREFERRED_CONTACT_META.instagram.label}</Pill>
              </div>
            </div>

            {channel === "text" ? (
              <>
                <Field label="Your number">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} />
                </Field>
                <ConsentBox phone={phone} checked={smsConsent} onChange={setSmsConsent} verb="tell you what's next" />
              </>
            ) : (
              <Field label="Your Instagram handle">
                <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourhandle" className={inputCls} autoCapitalize="none" autoCorrect="off" />
              </Field>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={onSubmit} disabled={!canSubmit} label={busy ? (rsvp ? "Saving your spot…" : "Signing in…") : rsvp ? "I'm coming 🎉" : "Sign me in 🎉"} />
            <p className="-mt-1 text-center text-[11px] text-faint">~15 seconds. No mailing-list machine, a real person texts you.</p>
          </div>

          <div className="mt-auto pt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>R20 · glad you&apos;re here</p>
          </div>
        </div>
      )}
    </div>
  );
}
