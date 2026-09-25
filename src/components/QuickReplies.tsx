"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import {
  QUICK_REPLIES,
  QUICK_REPLY_RULE,
  QUICK_REPLY_DOS,
  QUICK_REPLY_DONTS,
  mergeQuickReply,
  type QuickReply,
} from "@/lib/quickReplies";

// Render a scaffold, highlighting the [brackets] the leader still has to fill so
// the "never send as-is" rule is visible at a glance.
function Scaffold({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]*\])/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\[[^\]]*\]$/.test(part) ? (
          <span key={i} className="rounded px-1 font-medium text-accent-ink" style={{ background: "var(--accent-soft)" }}>
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function ReplyRow({ reply, personName }: { reply: QuickReply; personName?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  const copy = async (raw: string, idx: number) => {
    const text = mergeQuickReply(raw, personName);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      setTimeout(() => setCopied((c) => (c === idx ? null : c)), 1600);
    } catch {
      /* clipboard blocked (rare on mobile Safari without a gesture) — no-op */
    }
  };

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
      >
        <span className="text-sm font-medium">{reply.label}</span>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--faint)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      {open && (
        <div className="pb-3">
          <p className="mb-2 text-[11px] text-faint">{reply.when}</p>
          <div className="flex flex-col gap-2">
            {reply.variants.map((v, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface-2 p-3">
                <p className="text-sm leading-relaxed">
                  <Scaffold text={mergeQuickReply(v, personName)} />
                </p>
                <button
                  onClick={() => copy(v, i)}
                  className="mt-2 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted"
                >
                  {copied === i ? "Copied ✓" : "Copy"}
                </button>
              </div>
            ))}
          </div>
          {reply.note && <p className="mt-2 text-[11px] italic text-faint">{reply.note}</p>}
        </div>
      )}
    </div>
  );
}

/**
 * Org-wide quick-reply library. On the person profile pass `personName` to merge
 * [name] and default it open-ish; in Settings it's a browse reference.
 */
export function QuickReplies({ personName, collapsible = true, defaultOpen = false, id }: { personName?: string; collapsible?: boolean; defaultOpen?: boolean; id?: string }) {
  const [open, setOpen] = useState(defaultOpen || !collapsible);

  return (
    <Card id={id} className="mt-3 p-4">
      <button
        onClick={() => collapsible && setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Quick replies</p>
          <p className="mt-0.5 text-[11px] text-faint">Scaffolds, not scripts — always make it yours.</p>
        </div>
        {collapsible && (
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        )}
      </button>

      {open && (
        <div className="mt-3">
          <p className="rounded-xl border border-border bg-surface-2 p-2.5 text-[11px] leading-relaxed text-muted">
            {QUICK_REPLY_RULE}
          </p>
          <div className="mt-2">
            {QUICK_REPLIES.map((r) => (
              <ReplyRow key={r.id} reply={r} personName={personName} />
            ))}
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-muted">Do's & don'ts</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Do</p>
                <ul className="flex flex-col gap-1">
                  {QUICK_REPLY_DOS.map((d, i) => (
                    <li key={i} className="text-[11px] leading-relaxed text-muted">• {d}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Don't</p>
                <ul className="flex flex-col gap-1">
                  {QUICK_REPLY_DONTS.map((d, i) => (
                    <li key={i} className="text-[11px] leading-relaxed text-muted">• {d}</li>
                  ))}
                </ul>
              </div>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}
