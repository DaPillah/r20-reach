"use client";

// Admin-only guardrailed segment broadcast. Shows the consent math BEFORE
// sending, requires an explicit confirm, and leans on copy to keep it on-ethos
// ("text like a person, not a billboard"). Sends ride the consent-gated choke
// point; dry-run until 10DLC verifies.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import {
  listBroadcastsAction,
  previewBroadcastAction,
  sendBroadcastAction,
  type BroadcastFilter,
  type BroadcastPreview,
  type BroadcastResult,
  type BroadcastRow,
} from "@/app/actions";
import { Card } from "@/components/ui";
import { SCHOOL_YEARS, STAGES, type Campus, type SchoolYear, type Stage } from "@/lib/types";

const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];
const inputCls = "w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent";

export default function BroadcastPage() {
  const { isAdmin, ready } = useReach();

  const [stage, setStage] = useState<Stage | "">("");
  const [campus, setCampus] = useState<Campus | "">("");
  const [schoolYear, setSchoolYear] = useState<SchoolYear | "">("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [history, setHistory] = useState<BroadcastRow[]>([]);

  const filter: BroadcastFilter = { stage: stage || null, campus: campus || null, schoolYear: schoolYear || null };

  const refreshPreview = useCallback(() => {
    if (!isAdmin) return;
    previewBroadcastAction({ stage: stage || null, campus: campus || null, schoolYear: schoolYear || null }).then(setPreview).catch(() => {});
  }, [isAdmin, stage, campus, schoolYear]);

  useEffect(() => {
    refreshPreview();
  }, [refreshPreview]);
  useEffect(() => {
    if (isAdmin) listBroadcastsAction().then(setHistory).catch(() => {});
  }, [isAdmin]);

  if (ready && !isAdmin) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>Broadcasts are limited to the admin team.</p>
        <Link href="/" className="mt-2 inline-block text-accent">Back to Today</Link>
      </div>
    );
  }

  const segments = Math.max(1, Math.ceil((body.length + 24) / 153)); // rough incl. appended STOP
  const messageable = preview?.messageable ?? 0;

  const doSend = async () => {
    setSending(true);
    setResult(null);
    try {
      const r = await sendBroadcastAction(filter, body);
      setResult(r);
      if (r.ok) {
        setBody("");
        setConfirming(false);
        listBroadcastsAction().then(setHistory).catch(() => {});
        refreshPreview();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pb-8">
      <Link href="/overview" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Overview
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Send a broadcast</h1>

      <div className="mt-3 rounded-xl p-3 text-xs leading-relaxed" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
        <b>Text like a person, not a billboard.</b> Use this for logistics people would genuinely miss (a room change, a time) — sent to insiders who expect to hear from us. For inviting newcomers, a leader&apos;s personal text lands better; for general hype, use the group chat. Over-blasting gets our number filtered.
      </div>

      {/* segment */}
      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-faint">Who</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-faint">Stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage | "")} className={inputCls}>
            <option value="">Any stage</option>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-faint">Campus</span>
          <select value={campus} onChange={(e) => setCampus(e.target.value as Campus | "")} className={inputCls}>
            <option value="">Any campus</option>
            {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-faint">School year</span>
          <select value={schoolYear} onChange={(e) => setSchoolYear(e.target.value as SchoolYear | "")} className={inputCls}>
            <option value="">Any year</option>
            {SCHOOL_YEARS.map((y) => <option key={y.key} value={y.key}>{y.label}</option>)}
          </select>
        </label>
      </div>

      {/* the consent math */}
      {preview && (
        <div className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm">
          <p>
            <b className="text-good">{preview.messageable}</b> can be texted
            <span className="text-muted"> — of {preview.matched} in this segment; {preview.skipped} skipped (no consent or no number).</span>
          </p>
          {preview.sample.length > 0 && (
            <p className="mt-1 text-xs text-faint">e.g. {preview.sample.join(", ")}{preview.messageable > preview.sample.length ? "…" : ""}</p>
          )}
        </div>
      )}

      {/* message */}
      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-faint">Message</h2>
      <textarea
        value={body}
        onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
        rows={4}
        placeholder="hey [FIRST_NAME], heads up — Hangout is in Room 202 tonight, not the usual spot. see you there!"
        className={`${inputCls} resize-y`}
      />
      <div className="mt-1 flex justify-between px-1 text-xs text-faint">
        <span><code className="rounded bg-surface-2 px-1">[FIRST_NAME]</code> → their name · &ldquo;Reply STOP&rdquo; auto-added</span>
        <span>{body.length} chars · ~{segments} SMS</span>
      </div>

      {result && (
        <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: result.ok ? "var(--good-soft)" : "var(--warn-soft)", color: result.ok ? "var(--good)" : "var(--warn)" }}>
          {result.ok
            ? result.dryRun > 0
              ? `Test mode — ${result.dryRun} message${result.dryRun === 1 ? "" : "s"} logged as would-send (nothing actually sent until 10DLC clears).`
              : `Sent to ${result.sent}.`
            : result.error}
        </p>
      )}

      {/* two-step send */}
      {!confirming ? (
        <button
          onClick={() => { setResult(null); setConfirming(true); }}
          disabled={!body.trim() || messageable === 0}
          className="mt-4 w-full rounded-xl px-3 py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          Review send{messageable > 0 ? ` → ${messageable} people` : ""}
        </button>
      ) : (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm">
            Text <b>{messageable} people</b> ({stage || "any stage"} · {campus || "any campus"})? This can&apos;t be unsent.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={doSend} disabled={sending} className="flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {sending ? "Sending…" : `Yes, send to ${messageable}`}
            </button>
            <button onClick={() => setConfirming(false)} className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted">Cancel</button>
          </div>
        </div>
      )}

      {/* accountability log */}
      {history.length > 0 && (
        <>
          <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wide text-faint">Recent broadcasts</h2>
          <div className="flex flex-col gap-2">
            {history.map((h) => (
              <Card key={h.id} className="p-3">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium">{h.segmentLabel}</span>
                  <span className="text-faint">{h.sent} sent · {h.senderName}{h.createdAt ? ` · ${new Date(h.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{h.body}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
