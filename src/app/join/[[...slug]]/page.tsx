"use client";

// PUBLIC — the intake form an invited friend fills out (r20.nyc-matched chrome).
// Reached via a personal link /join/<slug> (attribution) or bare /join (generic).
// DECISION (2026-07-01): Name required; phone OPTIONAL + consent checkbox only
// when a number is given. A required phone would turn a hesitant newcomer into a
// zero-data bounce; when there's no phone, follow-up routes through the inviter.
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getReferrerAction, submitJoinAction } from "@/app/join/actions";
import { Turnstile } from "@/components/Turnstile";
import { CrowdGhost, CrowdGoldButton, CrowdWordmark } from "@/components/crowd";

const CAMPUSES = ["Columbia", "NYU", "CCNY", "Pace", "Other"] as const;
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function JoinPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : undefined;
  const router = useRouter();
  // Return to wherever they came from (/welcome, /hi, or a personal invite link) —
  // NOT a hardcoded /hi. Falls back to /welcome (the cold door) on a direct load.
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/welcome");
  };

  const [inviter, setInviter] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [campus, setCampus] = useState<string>("");
  const [smsConsent, setSmsConsent] = useState(false); // TCPA: opt-in must NOT be pre-checked
  const [honeypot, setHoneypot] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [captchaNonce, setCaptchaNonce] = useState(0); // bump to re-mount the widget for a fresh token
  const [src, setSrc] = useState<string | undefined>(undefined);
  const needsCaptcha = Boolean(TURNSTILE_SITE_KEY);

  useEffect(() => {
    if (!slug) return;
    getReferrerAction(slug)
      .then((r) => setInviter(r?.name ?? null))
      .catch(() => {});
  }, [slug]);

  // ?src= = the QR / ad / poster / campus link this join came through (ad ROI).
  useEffect(() => {
    try { setSrc(new URLSearchParams(window.location.search).get("src") || undefined); } catch { /* ignore */ }
  }, []);

  // Consent disclosure is ALWAYS visible (so a carrier reviewer sees it on load);
  // the checkbox is only actionable — and consent only stored — once a phone is given.
  const hasPhone = useMemo(() => phone.trim().length > 0, [phone]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitJoinAction({
        firstName,
        phone,
        campus: campus || undefined,
        smsConsent: hasPhone ? smsConsent : false,
        referrerSlug: slug,
        src,
        honeypot,
        turnstileToken: token ?? undefined,
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
      // Turnstile tokens are single-use — re-mount the widget to get a fresh one.
      setToken(null);
      setCaptchaNonce((n) => n + 1);
    }
  };

  return (
    <div className="crowd-dark relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden px-6 pb-12 pt-9">
      <CrowdGhost />
      <CrowdWordmark />

      {done ? (
        <div className="relative mt-12 flex flex-1 flex-col items-start text-left">
          <div className="flex size-12 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--gold)" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>You&apos;re in 🎉</h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            {inviter ? `${inviter} and someone from R20 will` : "Someone from R20 will"} say hi soon. Come as you are —
            no pressure, bring your questions.
          </p>
        </div>
      ) : (
        <div className="relative mt-9">
          {inviter && <p className="text-sm text-muted">{inviter} invited you</p>}
          <h1 className="mt-2 text-[2.75rem] font-bold leading-[0.98] tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            <span className="block">Come as</span>
            <span className="block italic" style={{ color: "var(--gold)" }}>you are.</span>
          </h1>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            A small, midweek Bible Hangout — doubts welcome, no pressure, leave whenever. Drop your name so we can say hi.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <Field label="Your name">
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoFocus
                placeholder="First name"
                className={inputCls}
              />
            </Field>

            <Field label="Phone (optional)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="(212) 555-0100"
                className={inputCls}
              />
              <span className="text-[11px] text-faint">So we can send you the details for this week.</span>
            </Field>

            <Field label="Campus (optional)">
              <select value={campus} onChange={(e) => setCampus(e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {CAMPUSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
              <input
                type="checkbox"
                checked={hasPhone && smsConsent}
                disabled={!hasPhone}
                onChange={(e) => setSmsConsent(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-[var(--gold)] disabled:opacity-40"
              />
              <span className={hasPhone ? undefined : "opacity-70"}>
                I agree to receive text messages from R20 Campus Ministry about
                gatherings, events, and follow-up. Msg &amp; data rates may apply. Msg frequency varies.
                Reply STOP to unsubscribe, HELP for help. See our{" "}
                <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2">
                  Privacy Policy
                </a>{" "}
                and{" "}
                <a href="/sms-terms" target="_blank" rel="noopener" className="underline underline-offset-2">
                  SMS Terms
                </a>
                . Consent is not a condition of attending any event.
                {!hasPhone && <span className="text-faint"> (Add a phone number above to opt in.)</span>}
              </span>
            </label>

            {/* honeypot — hidden from humans, catches bots */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              className="absolute -left-[9999px] h-0 w-0"
              aria-hidden
            />

            {needsCaptcha && TURNSTILE_SITE_KEY && (
              <Turnstile key={captchaNonce} siteKey={TURNSTILE_SITE_KEY} onToken={setToken} theme="dark" />
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <CrowdGoldButton
              type="submit"
              disabled={!firstName.trim() || busy || (needsCaptcha && !token)}
              label={busy ? "Sending…" : "Count me in"}
            />
          </form>

          <button type="button" onClick={goBack} className="mt-7 inline-block text-sm text-muted underline underline-offset-4">Back</button>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-faint">{label}</span>
      {children}
    </label>
  );
}
