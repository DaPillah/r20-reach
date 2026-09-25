"use client";

// The org-number conversation with one person: everything the R20 Twilio
// number has sent them (journeys, broadcasts, app-sends) and every reply they
// texted back (stored by the inbound webhook). This is the ORG lane only —
// leaders' personal-phone texting lives on their phones, not here.
import { useCallback, useEffect, useState } from "react";
import { getThreadAction, sendOrgSmsAction, type ThreadMessage } from "@/app/actions";
import { relativeDays } from "@/lib/format";

export function OrgThread({ personId, firstName, canText }: { personId: string; firstName: string; canText: boolean }) {
  const [msgs, setMsgs] = useState<ThreadMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(() => {
    getThreadAction(personId).then(setMsgs).catch(() => setMsgs([]));
  }, [personId]);
  useEffect(load, [load]);

  const send = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true); setNote(null);
    try {
      const r = await sendOrgSmsAction(personId, draft);
      if (r.ok) { setDraft(""); load(); if (r.result === "dry_run") setNote("Dry run — SMS provider is off in this environment."); }
      else setNote(r.result === "skipped_no_consent" ? "They haven't opted in to texts from the R20 number." : `Couldn't send (${r.result}).`);
    } finally { setBusy(false); }
  };

  if (msgs === null) return <p className="text-xs text-faint">Loading conversation…</p>;
  return (
    <div>
      {msgs.length === 0 ? (
        <p className="text-xs text-muted">No messages between {firstName} and the R20 number yet.</p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto pr-1">
          {msgs.map((m) => (
            <li key={m.id} className={m.direction === "inbound" ? "self-start" : "self-end"}>
              <div
                className="max-w-[16rem] rounded-2xl px-3 py-2 text-sm leading-snug"
                style={m.direction === "inbound"
                  ? { background: "var(--surface-2)", color: "var(--ink)" }
                  : { background: "var(--accent)", color: "#fff", opacity: m.status === "failed" ? 0.5 : 1 }}
              >
                {m.body}
              </div>
              <p className={`mt-0.5 text-[10px] text-faint ${m.direction === "inbound" ? "" : "text-right"}`}>
                {relativeDays(m.at, new Date())}{m.status === "failed" ? " · failed" : m.status === "dry_run" ? " · dry run" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canText ? (
        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder={`Text ${firstName} from the R20 number…`}
            className="flex-1 resize-none rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={busy || !draft.trim()}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            Send
          </button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-faint">
          Replies from the R20 number need SMS opt-in (and a phone on file) — use your own phone for personal texts.
        </p>
      )}
      {note && <p className="mt-1.5 text-[11px] text-muted">{note}</p>}
    </div>
  );
}
