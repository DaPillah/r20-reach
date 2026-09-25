"use client";

// Bug triage. Admin-only. New reports first, with the captured context
// (page, device, deploy) one tap away, plus whatever the triage agent wrote.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { listBugsAction, setBugStatusAction, type BugRow } from "@/app/actions";
import { relativeDays } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = {
  new: "New", triaged: "Looked at", fixed: "Fixed", wontfix: "Won't fix",
};

export default function BugsPage() {
  const { isAdmin, ready } = useReach();
  const [rows, setRows] = useState<BugRow[] | null>(null);
  const [openCtx, setOpenCtx] = useState<string | null>(null);

  const load = useCallback(() => {
    listBugsAction().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const setStatus = async (id: string, status: "new" | "triaged" | "fixed" | "wontfix") => {
    await setBugStatusAction(id, status).catch(() => {});
    load();
  };

  if (!ready) return <div className="pt-10 text-center text-muted">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>Bug triage is for admins.</p>
        <Link href="/" className="mt-2 inline-block text-accent">Back to Today</Link>
      </div>
    );
  }

  const open = (rows ?? []).filter((b) => b.status === "new" || b.status === "triaged");
  const closed = (rows ?? []).filter((b) => b.status === "fixed" || b.status === "wontfix");

  return (
    <div>
      <header className="mb-4">
        <Eyebrow>What&apos;s broken</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">Bugs</h1>
        <p className="text-sm text-muted">
          Reported by the team from the footer. {open.length} open.
        </p>
      </header>

      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="p-5 text-sm text-muted">Nothing reported yet.</Card>
      ) : (
        <>
          {[["Open", open], ["Closed", closed]].map(([label, list]) => {
            const items = list as BugRow[];
            if (!items.length) return null;
            return (
              <div key={label as string} className="mb-5">
                <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.18em] text-faint">{label as string}</p>
                <div className="flex flex-col gap-2">
                  {items.map((b) => (
                    <Card key={b.id} className="p-3.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: b.status === "new" ? "var(--accent)" : "var(--muted)" }}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                        <span className="text-[10px] text-faint">
                          {b.reporterName ?? "someone"} · {relativeDays(b.createdAt, new Date())}
                          {b.pagePath ? ` · ${b.pagePath}` : ""}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-line text-sm leading-snug">{b.body}</p>
                      {b.expected && (
                        <p className="mt-1 text-[12.5px] leading-snug text-muted">Expected: {b.expected}</p>
                      )}
                      {b.agentNotes && (
                        <p className="mt-2 rounded-lg border border-border bg-surface-2 p-2 text-[12px] leading-snug text-muted">
                          <span className="font-semibold">Triage: </span>{b.agentNotes}
                          {b.fixRef && <span className="text-faint"> ({b.fixRef})</span>}
                        </p>
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {(["triaged", "fixed", "wontfix"] as const).map((st) => (
                          <button
                            key={st}
                            onClick={() => setStatus(b.id, st)}
                            disabled={b.status === st}
                            className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted disabled:opacity-40"
                          >
                            {STATUS_LABEL[st]}
                          </button>
                        ))}
                        <button
                          onClick={() => setOpenCtx(openCtx === b.id ? null : b.id)}
                          className="text-[11px] text-faint underline"
                        >
                          {openCtx === b.id ? "hide details" : "details"}
                        </button>
                      </div>
                      {openCtx === b.id && (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-2 text-[10.5px] leading-snug text-faint">
                          {JSON.stringify(b.context, null, 2)}
                        </pre>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
