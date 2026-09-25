"use client";

// PUBLIC — the R20 30-Second Survey (/survey). A leader opens this on their phone
// during a real conversation, or it's a shareable link / QR. Same warm r20.nyc
// crowd chrome as /hi · /in · /sent, single-purpose (no menu). Fast, single-screen-
// ish, tap-to-answer. The opt-in contact block only appears if they say yes.
//
// Answers post to submitSurveyAction: the listening data always lands in
// survey_response; a person is created (at Campus) ONLY when they opt in with
// contact. Source instrument + copy: R20_30_Second_Survey.md.
import { useEffect, useState } from "react";
import { Q_EXCITED_OPTIONS } from "@/lib/survey";
import { submitSurveyAction } from "@/app/join/actions";
import { PREFERRED_CONTACT_META, type PreferredContact } from "@/lib/types";
import { ConsentBox, CrowdGhost, CrowdGoldButton, CrowdWordmark, Field, InstagramDmButton, inputCls } from "@/components/crowd";

// A tappable pill (single- or multi-select). Selected = gold fill.
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

function QuestionLabel({ n, children }: { n?: string; children: React.ReactNode }) {
  return (
    <p className="text-sm font-medium leading-snug">
      {n && <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--gold)" }}>{n}</span>}
      {children}
    </p>
  );
}

export function SurveyCard() {
  const [qExcited, setQExcited] = useState<string | null>(null);
  const [qExcitedOther, setQExcitedOther] = useState("");

  // opt-in contact
  const [optIn, setOptIn] = useState(false);
  const [channel, setChannel] = useState<PreferredContact>("text");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [handle, setHandle] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [school, setSchool] = useState<string>(""); // optional — enables campus-targeted follow-up

  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [src, setSrc] = useState<string | undefined>(undefined);
  // Who's administering this survey — from a ?by=<name> link, remembered on this
  // phone (localStorage) so it sticks across respondents all day. Works for
  // helpers who aren't app users: just hand them a link like /survey?by=Chris.
  const [surveyor, setSurveyor] = useState<string | undefined>(undefined);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setSrc(params.get("src") || undefined);
      const by = params.get("by")?.trim();
      if (by) {
        localStorage.setItem("r20.surveyor", by);
        setSurveyor(by);
      } else {
        setSurveyor(localStorage.getItem("r20.surveyor") || undefined);
      }
    } catch { /* ignore */ }
  }, []);

  // Something to submit? The listening answer OR a completed opt-in.
  const answered = qExcited !== null || qExcitedOther.trim() !== "";
  const optInReady = optIn && name.trim() !== "" && (channel === "text" ? phone.trim() !== "" : handle.trim() !== "");
  const canSubmit = (answered || optInReady) && !busy;

  const consent = channel === "text" && phone.trim() ? smsConsent : false;

  const onSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError(null);
    try {
      await submitSurveyAction({
        qExcited: qExcited ?? undefined,
        qExcitedOther,
        optIn: optInReady,
        preferredContact: optInReady ? channel : undefined,
        firstName: optInReady ? name : undefined,
        phone: optInReady && channel === "text" ? phone : undefined,
        instagramHandle: optInReady && channel === "instagram" ? handle : undefined,
        campus: optInReady && school ? school : undefined,
        smsConsent: consent,
        src,
        surveyor,
        honeypot,
      });
      setDone(true);
    } catch {
      setError("Something went wrong on our end — mind trying again in a moment?");
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
          <h1 className="mt-5 text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Thank you.</h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            {optInReady
              ? channel === "instagram"
                ? "That's genuinely helpful. Since you're on Instagram, send us a quick DM so we can reply and invite you sometime."
                : "That's genuinely helpful — and someone from R20 will reach out to invite you sometime. A real person, no spam."
              : "That's genuinely helpful. Seriously, thanks for taking a minute."}
          </p>
          {optInReady && channel === "instagram" && <InstagramDmButton sub="We'll reply right there and invite you to a hang." />}
        </div>
      ) : (
        <div className="relative mt-9 flex flex-1 flex-col">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>R20 · quick question</p>
          <h1 className="mt-3 text-[2.6rem] font-bold leading-[0.95] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            <span className="block">One quick</span>
            <span className="block italic" style={{ color: "var(--gold)" }}>question.</span>
          </h1>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            No right answers, no catch — we just want to hear what you&apos;re into. Takes about ten seconds.
          </p>

          <div className="mt-7 flex flex-col gap-7">
            {/* The one question — single choice ("Something else" reveals an optional line) */}
            <div className="flex flex-col gap-2.5">
              <QuestionLabel>What are you most excited about this year?</QuestionLabel>
              <div className="flex flex-wrap gap-2">
                {Q_EXCITED_OPTIONS.map((o) => (
                  <Pill key={o.key} selected={qExcited === o.key} onClick={() => setQExcited(qExcited === o.key ? null : o.key)}>{o.label}</Pill>
                ))}
              </div>
              {qExcited === "something_else" && (
                <input value={qExcitedOther} onChange={(e) => setQExcitedOther(e.target.value)} placeholder="Like what? (optional)" className={inputCls} />
              )}
            </div>

            {/* Opt-in contact — the only optional part; hidden until they say yes */}
            <div className="rounded-2xl border border-border p-4" style={{ background: "var(--surface-2)" }}>
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--gold)]" />
                <span>Totally optional — want a couple of us to invite you to a chill hang sometime?</span>
              </label>

              {optIn && (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-faint">Best way to reach you</span>
                    <div className="flex gap-2">
                      <Pill selected={channel === "text"} onClick={() => setChannel("text")}>{PREFERRED_CONTACT_META.text.label}</Pill>
                      <Pill selected={channel === "instagram"} onClick={() => setChannel("instagram")}>{PREFERRED_CONTACT_META.instagram.label}</Pill>
                    </div>
                  </div>
                  <Field label="First name">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="First name" className={inputCls} />
                  </Field>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-faint">Your school (optional)</span>
                    <div className="flex flex-wrap gap-2">
                      {["Columbia", "NYU"].map((c) => (
                        <Pill key={c} selected={school === c} onClick={() => setSchool(school === c ? "" : c)}>{c}</Pill>
                      ))}
                    </div>
                  </div>
                  {channel === "text" ? (
                    <>
                      <Field label="Your number">
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} />
                      </Field>
                      <ConsentBox phone={phone} checked={smsConsent} onChange={setSmsConsent} verb="invite you" />
                    </>
                  ) : (
                    <Field label="Your Instagram handle">
                      <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@yourhandle" className={inputCls} autoCapitalize="none" autoCorrect="off" />
                    </Field>
                  )}
                </div>
              )}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={onSubmit} disabled={!canSubmit} label={busy ? "Sending…" : "Done — thanks 🙏"} />
            <p className="-mt-1 text-center text-[11px] text-faint">A blank is a completely fine answer. Tap what fits.</p>
          </div>

          <div className="mt-auto pt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>R20 · thanks for the minute</p>
            {surveyor && <p className="mt-1 text-[10px] text-faint">survey team: {surveyor}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
