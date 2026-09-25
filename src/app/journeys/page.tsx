"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { getJourneysAdminAction, holdJourneyAction, resumeJourneyAction, type JourneyAdminRow } from "@/app/actions";
import { Card, Eyebrow } from "@/components/ui";

// Plain-English blurb per journey so an admin knows what they're turning on/off.
const BLURBS: Record<string, string> = {
  "Come to Nights": "Up to 4 Saturday reminders to a consented cold contact until they come to R20 Nights. Auto-enrolls from event / survey / “I want to come” sign-ins. The big one.",
  "New Believer": "For someone who took a step toward Jesus — walk them toward a Hangout. Leader-started.",
  Assimilation: "First-time guest → nurture toward a Bible Hangout. Leader-started.",
  "Stay Warm": "3 gentle, no-agenda check-ins over ~10 weeks for someone who's gone quiet. Leader-started.",
  "Welcome (consented capture)": "One warm hello when someone hands over consented contact.",
};

export default function JourneysAdminPage() {
  const { isAdmin, ready } = useReach();
  const [data, setData] = useState<{ live: boolean; journeys: JourneyAdminRow[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null); // journeyId pending a resume-confirm

  const load = useCallback(() => {
    getJourneysAdminAction()
      .then(setData)
      .catch(() => setData({ live: false, journeys: [] }));
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const hold = async (id: string) => {
    setBusy(id);
    try { await holdJourneyAction(id); load(); } finally { setBusy(null); }
  };
  const resume = async (id: string) => {
    setBusy(id);
    try { await resumeJourneyAction(id); setConfirm(null); load(); } finally { setBusy(null); }
  };

  if (!ready) return <div className="pt-10 text-center text-muted">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>Journey controls are for the leadership team.</p>
        <Link href="/" className="mt-2 inline-block text-accent">Back to Today</Link>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Oversight</Eyebrow>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Follow-up journeys</h1>
      <p className="mb-4 text-sm text-muted">
        Automated text sequences. <span className="font-medium">On</span> means people can be enrolled and messaged;{" "}
        <span className="font-medium">On hold</span> stops all sends — current and future — until you resume.
      </p>

      {!data ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          {!data.live && (
            <div className="mb-4 rounded-xl border border-border px-3 py-2.5 text-xs text-muted" style={{ background: "var(--surface-2)" }}>
              Texting is in rehearsal mode (nothing actually sends) until SMS is switched on.
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {data.journeys.map((j) => {
              const onHold = !j.isActive && j.active === 0;
              return (
                <Card key={j.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{j.name}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={onHold
                            ? { background: "var(--warn-soft)", color: "var(--warn)" }
                            : { background: "var(--good-soft)", color: "var(--good)" }}
                        >
                          {onHold ? "On hold" : "On"}
                        </span>
                        <span className="text-[10px] text-faint">{j.trigger === "auto" ? "auto-enrolls" : "leader-started"}</span>
                      </div>
                      {BLURBS[j.name] && <p className="mt-1 text-xs text-muted">{BLURBS[j.name]}</p>}
                      <p className="mt-1.5 text-[11px] text-faint">
                        {j.active} active{j.sendable > 0 ? ` · ${j.sendable} will actually text (phone + consent)` : ""}
                        {j.held > 0 ? ` · ${j.held} held` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    {onHold ? (
                      confirm === j.id ? (
                        <span className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="text-muted">
                            Turn on{j.held > 0 ? ` and resume ${j.held} held ${j.held === 1 ? "person" : "people"}` : ""}? They can be texted again.
                          </span>
                          <button onClick={() => resume(j.id)} disabled={busy !== null} className="rounded-lg px-3 py-1.5 font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
                            {busy === j.id ? "Resuming…" : "Turn on"}
                          </button>
                          <button onClick={() => setConfirm(null)} className="text-muted">Cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirm(j.id)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-accent-ink" style={{ background: "var(--accent-soft)" }}>
                          Turn on
                        </button>
                      )
                    ) : (
                      <button onClick={() => hold(j.id)} disabled={busy !== null} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted disabled:opacity-50">
                        {busy === j.id ? "Holding…" : "Put on hold"}
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            Putting a journey on hold pauses everyone currently in it and stops new people from being added. Turning it back
            on resumes only the people a hold paused — anyone a leader personally stopped, or who opted out, stays out.
          </p>
        </>
      )}
    </div>
  );
}
