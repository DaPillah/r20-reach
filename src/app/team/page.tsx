"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { getTeamAction, messageTeamAction, setTeamMemberPhoneAction, type TeamMember } from "@/app/actions";
import { Card, Eyebrow } from "@/components/ui";

const inputCls = "rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent";

export default function TeamMessagePage() {
  const { isAdmin, campusLeadOf, coordinatorId, authedId, ready } = useReach();
  const canUse = isAdmin || !!campusLeadOf || (coordinatorId !== null && coordinatorId === authedId);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<string | null>(null); // member id whose "add number" field is open
  const [addVal, setAddVal] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);

  const load = useCallback(() => {
    getTeamAction()
      .then((t) => {
        setTeam(t);
        setSelected((prev) => (prev.size ? prev : new Set(t.filter((m) => m.hasPhone).map((m) => m.id)))); // default: everyone reachable
      })
      .catch(() => setTeam([]));
  }, []);
  useEffect(() => { if (canUse) load(); }, [canUse, load]);

  const reachable = useMemo(() => (team ?? []).filter((m) => m.hasPhone), [team]);
  const noNumber = useMemo(() => (team ?? []).filter((m) => !m.hasPhone), [team]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedReachable = reachable.filter((m) => selected.has(m.id)).length;

  const segs = body.trim() ? Math.ceil(body.length / 153) : 0; // GSM concat ~153/seg with headers

  const send = async () => {
    if (!selectedReachable || body.trim().length < 2 || busy) return;
    setBusy(true); setResult(null);
    try {
      const r = await messageTeamAction([...selected], body);
      if (!r.ok) { setResult(r.error ?? "Couldn't send."); return; }
      setResult(
        `${r.live ? "Sent" : "Rehearsed (SMS is in dry-run)"} to ${r.sent} ${r.sent === 1 ? "person" : "people"}` +
          (r.skippedNoPhone ? ` · ${r.skippedNoPhone} skipped (no number)` : "") +
          (r.failed ? ` · ${r.failed} failed` : "") + ".",
      );
      if (r.sent) setBody("");
    } catch { setResult("Something went wrong — try again."); }
    finally { setBusy(false); }
  };

  const saveNumber = async (id: string) => {
    setAddErr(null);
    const res = await setTeamMemberPhoneAction(id, addVal);
    if (!res.ok) { setAddErr(res.error ?? "Couldn't save."); return; }
    setAddFor(null); setAddVal("");
    setSelected((s) => new Set(s).add(id)); // include them now that they're reachable
    load();
  };

  if (!ready) return <div className="pt-10 text-center text-muted">Loading…</div>;
  if (!canUse) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>Team messaging is for the leadership team.</p>
        <Link href="/" className="mt-2 inline-block text-accent">Back to Today</Link>
      </div>
    );
  }

  return (
    <div>
      <Eyebrow>Oversight</Eyebrow>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Message the team</h1>
      <p className="mb-4 text-sm text-muted">A direct text to the leaders you pick — internal, from the R20 number. Not a broadcast to contacts.</p>

      {team === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Who gets it</p>
              <div className="flex gap-2 text-[11px]">
                <button onClick={() => setSelected(new Set(reachable.map((m) => m.id)))} className="text-accent-ink underline">All</button>
                <button onClick={() => setSelected(new Set(reachable.filter((m) => m.role === "leader").map((m) => m.id)))} className="text-muted underline">Leaders</button>
                <button onClick={() => setSelected(new Set(reachable.filter((m) => m.role === "gatherer").map((m) => m.id)))} className="text-muted underline">Gatherers</button>
                <button onClick={() => setSelected(new Set())} className="text-muted underline">None</button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {reachable.map((m) => {
                const on = selected.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    aria-pressed={on}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                    style={on
                      ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                      : { background: "var(--surface-2)", color: "var(--muted)", borderColor: "var(--border)" }}
                    title={m.phoneLast4 ? `…${m.phoneLast4}` : undefined}
                  >
                    {on ? "✓ " : ""}{m.name} <span className="opacity-60">· {m.role}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-faint">{selectedReachable} selected</p>

            {noNumber.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-[11px] font-medium text-faint">No number on file — add one to include them:</p>
                <ul className="mt-2 flex flex-col gap-2">
                  {noNumber.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted">{m.name} <span className="text-faint">· {m.role}</span></span>
                      {addFor === m.id ? (
                        <>
                          <input value={addVal} onChange={(e) => setAddVal(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} autoFocus />
                          <button onClick={() => saveNumber(m.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>Save</button>
                          <button onClick={() => { setAddFor(null); setAddVal(""); setAddErr(null); }} className="text-xs text-muted">Cancel</button>
                          {addErr && <span className="text-xs text-warn">{addErr}</span>}
                        </>
                      ) : (
                        <button onClick={() => { setAddFor(m.id); setAddVal(""); setAddErr(null); }} className="text-xs font-medium text-accent-ink underline">add number</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>

          <Card className="mt-3 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Message</p>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="Hey team — quick one…"
              className="mt-2 w-full resize-none rounded-xl border border-border bg-surface-2 p-3 text-sm leading-snug outline-none focus:border-accent"
            />
            <p className="mt-1 text-[11px] text-faint">{body.length} chars · ~{segs} SMS segment{segs === 1 ? "" : "s"}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={send}
                disabled={busy || !selectedReachable || body.trim().length < 2}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {busy ? "Sending…" : `Send to ${selectedReachable}`}
              </button>
              {result && <span className="text-xs text-muted">{result}</span>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
