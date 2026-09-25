"use client";

// PUBLIC, class-only tap-card — the shared UI behind /in (101 "I'm In") and /sent
// (401 "I'm Sent"). A teacher shows the link/QR at the END of a session; a student
// taps → name + optional phone + unchecked TCPA consent → a class-close server
// action → warm human follow-up. Same r20.nyc crowd chrome as /hi, but single-
// purpose (no menu). Not linked from anywhere public.
import { useEffect, useState } from "react";
import { ConsentBox, CrowdGhost, CrowdGoldButton, CrowdWordmark, Field, inputCls } from "@/components/crowd";

export type ClassCloseConfig = {
  eyebrow: string;
  title: string;
  accent: string;
  intro: string;
  consentVerb: string;
  buttonLabel: string;
  busyLabel: string;
  doneHead: string;
  doneBody: string;
  footer: string;
  // /sent only — capture the 2–3 friends they'll pray for / invite.
  friends?: { label: string; placeholder: string };
  submit: (input: {
    firstName: string;
    phone?: string;
    smsConsent?: boolean;
    friends?: string;
    src?: string;
    honeypot?: string;
  }) => Promise<{ ok: true }>;
};

export function ClassCloseCard({ config }: { config: ClassCloseConfig }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [friends, setFriends] = useState("");
  const [smsConsent, setSmsConsent] = useState(false); // TCPA: opt-in must NOT be pre-checked
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    // ?src= = which class / QR this tap came from (attribution).
    try { setSrc(new URLSearchParams(window.location.search).get("src") || undefined); } catch { /* ignore */ }
  }, []);

  const consent = phone.trim() ? smsConsent : false;
  const onSubmit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      await config.submit({ firstName: name, phone, smsConsent: consent, friends: config.friends ? friends : undefined, src, honeypot });
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
          <h1 className="mt-5 text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{config.doneHead}</h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">{config.doneBody}</p>
        </div>
      ) : (
        <div className="relative mt-9 flex flex-1 flex-col">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>{config.eyebrow}</p>
          <h1 className="mt-3 text-[3rem] font-bold leading-[0.95] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            <span className="block">{config.title}</span>
            <span className="block italic" style={{ color: "var(--gold)" }}>{config.accent}</span>
          </h1>
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-muted">{config.intro}</p>

          <div className="mt-7 flex flex-col gap-4">
            <Field label="Your name"><input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="First name" className={inputCls} /></Field>
            <Field label="Your phone (optional)"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} /><span className="text-[11px] text-faint">So a leader can follow up. No spam, ever.</span></Field>
            {config.friends && (
              <Field label={config.friends.label}><textarea value={friends} onChange={(e) => setFriends(e.target.value)} rows={3} placeholder={config.friends.placeholder} className={`${inputCls} resize-y`} /></Field>
            )}
            <ConsentBox phone={phone} checked={smsConsent} onChange={setSmsConsent} verb={config.consentVerb} />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <CrowdGoldButton onClick={onSubmit} disabled={!name.trim() || busy} label={busy ? config.busyLabel : config.buttonLabel} />
          </div>

          <div className="mt-auto pt-10">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--gold)" }}>{config.footer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
