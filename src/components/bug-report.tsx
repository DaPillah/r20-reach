"use client";

// "Something's broken" from the footer. Deliberately two boxes: a leader mid-
// shift will not fill in a form. Everything an agent needs to reproduce (page,
// viewport, browser, deploy sha) is captured silently, so the report can be
// short and still be actionable.
import { useState } from "react";
import { usePathname } from "next/navigation";
import { reportBugAction } from "@/app/actions";

export function BugReport() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true); setError(null);
    try {
      const ctx: Record<string, unknown> = {};
      try {
        ctx.viewport = `${window.innerWidth}x${window.innerHeight}`;
        ctx.userAgent = navigator.userAgent;
        ctx.standalone = window.matchMedia("(display-mode: standalone)").matches;
      } catch { /* context is a bonus, never a blocker */ }
      const r = await reportBugAction({ body, expected, pagePath: pathname, context: ctx });
      if (r.ok) { setDone(true); setBody(""); setExpected(""); }
      else setError(r.error ?? "Couldn't send that.");
    } catch {
      setError("Couldn't send that. Mind trying again?");
    } finally { setBusy(false); }
  };

  const close = () => { setOpen(false); setDone(false); setError(null); };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="underline">
        Report a bug
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={close}>
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-4 text-left"
        onClick={(e) => e.stopPropagation()}
      >
        {done ? (
          <>
            <p className="text-sm font-semibold">Got it, thank you.</p>
            <p className="mt-1.5 text-xs text-muted">
              It is on the list with the page and device details attached. You can keep working.
            </p>
            <button onClick={close} className="mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
              Close
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold">Something broken?</p>
            <p className="mt-1 text-xs text-muted">
              No need to be technical. We capture the page and your device automatically.
            </p>
            <label className="mt-3 flex flex-col gap-1 text-xs text-muted">
              What happened?
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                autoFocus
                placeholder="I tapped Send text and nothing came up"
                className="w-full resize-none rounded-xl border border-border bg-surface-2 p-2.5 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            <label className="mt-2 flex flex-col gap-1 text-xs text-muted">
              What did you expect? (optional)
              <textarea
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                rows={2}
                placeholder="My texting app should open with the message"
                className="w-full resize-none rounded-xl border border-border bg-surface-2 p-2.5 text-sm text-ink outline-none focus:border-accent"
              />
            </label>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={submit}
                disabled={!body.trim() || busy}
                className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {busy ? "Sending…" : "Send it"}
              </button>
              <button onClick={close} className="rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted">
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
