"use client";

// "Logins to hand out" — the coordinator's onboarding nudge on /overview. Lists
// accounts nobody has logged into yet; tapping mints a fresh temp password to text
// them (shown once, with a ready-to-send message). A row clears the moment that
// person logs in. Admin-only (the actions re-check server-side).
import { useEffect, useState } from "react";
import { getPendingLoginsAction, issueTempPasswordAction, type PendingLogin } from "@/app/auth-actions";
import { Card, SectionTitle } from "@/components/ui";

const LOGIN_URL = "https://join.r20.nyc/login";

export function PendingLogins() {
  const [pending, setPending] = useState<PendingLogin[] | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { email: string; pw: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { getPendingLoginsAction().then(setPending).catch(() => setPending([])); }, []);

  if (!pending || pending.length === 0) return null;

  const reveal = async (id: string) => {
    setBusy(id);
    try {
      const r = await issueTempPasswordAction(id);
      if (r.ok && r.tempPassword) setRevealed((s) => ({ ...s, [id]: { email: r.email!, pw: r.tempPassword! } }));
    } finally { setBusy(null); }
  };
  const message = (name: string, email: string, pw: string) =>
    `Hi ${name.split(" ")[0]} — here's your R20 app login:\n${LOGIN_URL}\nEmail: ${email}\nTemp password: ${pw}\n(Change it after you log in — Settings → Your password.)`;
  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 2000); } catch { /* ignore */ }
  };

  return (
    <>
      <SectionTitle>Logins to hand out · {pending.length}</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        These teammates haven&apos;t logged in yet. Tap to get a fresh temp login to text them — the row clears once they log in.
      </p>
      <Card className="divide-y divide-border">
        {pending.map((p) => {
          const rv = revealed[p.id];
          return (
            <div key={p.id} className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="ml-2 text-[11px] uppercase tracking-wide text-faint">{p.role}</span>
                </div>
                {!rv && (
                  <button
                    onClick={() => reveal(p.id)}
                    disabled={busy === p.id}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {busy === p.id ? "…" : "Show login"}
                  </button>
                )}
              </div>
              {rv && (
                <div className="rounded-xl border border-border p-3 text-xs" style={{ background: "var(--surface-2)" }}>
                  <div><span className="text-faint">Email:</span> {rv.email}</div>
                  <div><span className="text-faint">Temp password:</span> <span className="font-semibold">{rv.pw}</span></div>
                  <button
                    onClick={() => copy(p.id, message(p.name, rv.email, rv.pw))}
                    className="mt-2 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium"
                  >
                    {copied === p.id ? "Copied ✓" : "Copy text message"}
                  </button>
                  <p className="mt-2 text-[10px] leading-snug text-faint">A fresh password was just set — hand this out now; it replaces any earlier one.</p>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </>
  );
}
