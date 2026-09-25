// Shared chrome for the public crowd pages (/hi, /join) so they match r20.nyc
// consistently — warm near-black, antique gold, Playfair roman-white / italic-gold.
import type React from "react";
import { R20_IG_DM_URL, R20_IG_HANDLE, instagramProfileUrl } from "@/lib/types";

// "Message us on Instagram" — the inbound-first entry point, shown on the DONE
// screen of an IG capture (never beside a Submit button, so it can't compete
// with capture or cost us a contact). Opens the viewer's DM composer to R20.
// Renders nothing if no handle is configured.
export function InstagramDmButton({ sub = "We'll reply right there. That's how we connect on Instagram." }: { sub?: string }) {
  if (!R20_IG_DM_URL) return null;
  return (
    <a
      href={R20_IG_DM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 flex w-full max-w-xs flex-col gap-0.5 rounded-xl border px-4 py-3.5 text-left transition-colors"
      style={{ borderColor: "var(--gold)", background: "var(--accent-soft)" }}
    >
      <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--gold)" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        Message us on Instagram
      </span>
      <span className="text-[11px] leading-snug text-muted">{sub}</span>
    </a>
  );
}

// "Follow us on Instagram" — the profile link (not a DM). Shown AFTER an RSVP
// (the warm moment), so IG never competes with the RSVP ask itself.
export function InstagramFollowButton({ sub = "See what we're about. Follow the page." }: { sub?: string }) {
  const url = instagramProfileUrl(R20_IG_HANDLE);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-6 flex w-full max-w-xs flex-col gap-0.5 rounded-xl border px-4 py-3.5 text-left transition-colors"
      style={{ borderColor: "var(--gold)", background: "var(--accent-soft)" }}
    >
      <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--gold)" }}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="2" width="20" height="20" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
        </svg>
        Follow us on Instagram
      </span>
      <span className="text-[11px] leading-snug text-muted">{sub}</span>
    </a>
  );
}

// The faint giant "R20" watermark r20.nyc floats behind its sections.
export function CrowdGhost() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -right-10 top-24 select-none text-[13rem] font-bold leading-none"
      style={{ fontFamily: "var(--font-display)", color: "var(--ink)", opacity: 0.03 }}
    >
      R20
    </span>
  );
}

// R20 wordmark — links home to r20.nyc (the public marketing site), like a logo.
export function CrowdWordmark() {
  return (
    <div className="relative">
      <a
        href="https://r20.nyc"
        className="inline-block text-2xl font-bold tracking-tight transition-opacity hover:opacity-70"
        style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}
      >
        R20
      </a>
    </div>
  );
}

// Gold-filled primary button with dark text — r20.nyc's CTA.
export function CrowdGoldButton({ onClick, type = "button", disabled, label }: { onClick?: () => void; type?: "button" | "submit"; disabled?: boolean; label: string }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl px-3 py-3.5 text-center text-sm font-semibold uppercase tracking-wide disabled:opacity-50"
      style={{ background: "var(--gold-bright)", color: "#1c1610" }}
    >
      {label}
    </button>
  );
}

// ── shared form building blocks (used by /hi, /in, /sent) ───────────────────
export const inputCls = "w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<label className="flex flex-col gap-1.5"><span className="text-xs font-medium text-faint">{label}</span>{children}</label>);
}

// TCPA opt-in — MUST start unchecked and is disabled until a phone is entered
// (consent is meaningless without a number to text). `verb` fills "so a leader
// can ___" to match the surface (say hi / walk with you / welcome you).
export function ConsentBox({ phone, checked, onChange, verb }: { phone: string; checked: boolean; onChange: (v: boolean) => void; verb: string }) {
  const has = phone.trim().length > 0;
  return (
    <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted">
      <input type="checkbox" checked={has ? checked : false} disabled={!has} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--gold)] disabled:opacity-40" />
      <span className={has ? undefined : "opacity-70"}>
        Okay to text me so a leader can {verb}. Msg &amp; data rates may apply, frequency varies. Reply STOP to stop, HELP for help. See our{" "}
        <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-2">Privacy Policy</a> and{" "}
        <a href="/sms-terms" target="_blank" rel="noopener" className="underline underline-offset-2">SMS Terms</a>. Not a condition of attending.
        {!has && <span className="text-faint"> (Add a phone above to opt in.)</span>}
      </span>
    </label>
  );
}
