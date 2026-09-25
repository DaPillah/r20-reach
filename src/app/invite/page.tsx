"use client";

// PUBLIC — self-serve invite link generator. Anyone (not just leaders) enters
// their name (+ optional phone) and gets a personal link to text a friend.
// No account, no login. PUBLIC → branded R20 (Oikos is the internal name, kept
// only behind the staff login).
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createReferrerAction } from "@/app/join/actions";

export default function InvitePage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { slug } = await createReferrerAction({ name, phone, honeypot });
      setLink(`${window.location.origin}/join/${slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  const share = async () => {
    if (!link || !navigator.share) return;
    try {
      await navigator.share({ title: "Come to R20", text: "Come hang with me at R20", url: link });
    } catch {
      /* user dismissed */
    }
  };

  return (
    <div className="crowd-dark mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <Brand />

      {!link ? (
        <>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">Invite a friend</h1>
          <p className="mt-1.5 text-sm text-muted">
            Make your own link to text anyone you&apos;d love to bring. We&apos;ll help you follow up so no one slips through.
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            <Field label="Your name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="Alex"
                className={inputCls}
              />
            </Field>
            <Field label="Your phone (optional)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="(212) 555-0100"
                className={inputCls}
              />
              <span className="text-[11px] text-faint">So we can let you know when your friend shows up.</span>
            </Field>

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

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={!name.trim() || busy}
              className="mt-1 rounded-xl px-3 py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {busy ? "Making your link…" : "Get my invite link"}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight">Your link is ready</h1>
          <p className="mt-1.5 text-sm text-muted">Send it to the one friend who&apos;d secretly love this, or let them scan the code.</p>

          <div className="mt-6 flex justify-center">
            <div className="rounded-2xl bg-white p-4">
              <QRCodeSVG value={link} size={180} level="M" marginSize={0} />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface-2 p-3">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={copy}
              className="flex-1 rounded-xl px-3 py-3 text-center text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button
                onClick={share}
                className="flex-1 rounded-xl border border-border px-3 py-3 text-center text-sm font-semibold text-muted"
              >
                Share
              </button>
            )}
          </div>

          <button
            onClick={() => {
              setLink(null);
              setName("");
              setPhone("");
              setBusy(false);
            }}
            className="mt-4 text-center text-sm text-muted underline underline-offset-4"
          >
            Make another link
          </button>
        </>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="text-2xl tracking-tight" style={{ fontFamily: "var(--font-display)", color: "var(--accent)" }}>
        R20
      </span>
      <span className="mt-1 text-xs italic" style={{ fontFamily: "var(--font-display)", color: "var(--gold)" }}>
        that no one be lost
      </span>
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
