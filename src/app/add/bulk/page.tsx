"use client";

// LEADER / ADMIN — quick-add many people at once. The outreach backfill: a leader
// (or Dana) has a pile of DM contacts and pastes them in, one per line, instead
// of tapping through a form each time. Name + contact (an @handle or a phone) per
// line. Dedupe + validation live server-side (bulkAddPeopleAction); this screen
// parses a preview and lets an admin assign the whole batch to a leader.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReach } from "@/lib/store";
import { bulkAddPeopleAction, type BulkAddResult } from "@/app/actions";
import { STAGES, type Campus, type Stage } from "@/lib/types";
import { Card, Eyebrow } from "@/components/ui";

const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];

type ParsedRow = { firstName: string; contact: string; kind: "ig" | "phone" | "bad" };

// "Jane, @jane_doe" | "Jane @jane_doe" | "Jane, +19995550000" → {name, contact}.
function parseLine(line: string): ParsedRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let firstName = "";
  let contact = "";
  const comma = trimmed.indexOf(",");
  if (comma >= 0) {
    firstName = trimmed.slice(0, comma).trim();
    contact = trimmed.slice(comma + 1).trim();
  } else {
    // no comma — assume the last token is the contact if it looks like one
    const m = trimmed.match(/^(.*?)\s+(@?\S+)$/);
    if (m && (/^@/.test(m[2]) || /\d{4,}/.test(m[2]))) {
      firstName = m[1].trim();
      contact = m[2].trim();
    } else {
      firstName = trimmed;
      contact = "";
    }
  }
  const digits = contact.replace(/\D/g, "");
  const kind: ParsedRow["kind"] = /^@?[a-zA-Z0-9._]+$/.test(contact) && /^@/.test(contact)
    ? "ig"
    : digits.length >= 10
      ? "phone"
      : /^[a-zA-Z0-9._]+$/.test(contact) && contact !== ""
        ? "ig"
        : "bad";
  return { firstName, contact, kind };
}

export default function BulkAddPage() {
  const router = useRouter();
  const { leaders, isAdmin, authedId, authedName, ready } = useReach();

  const [text, setText] = useState("");
  const [campus, setCampus] = useState<Campus>("Columbia");
  const [stage, setStage] = useState<Stage>("Campus");
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BulkAddResult | null>(null);

  // Sticky campus — a leader entering a batch sets it once.
  useEffect(() => {
    try {
      const c = localStorage.getItem("r20.bulkCampus");
      if (c && CAMPUSES.includes(c as Campus)) setCampus(c as Campus);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("r20.bulkCampus", campus); } catch { /* ignore */ }
  }, [campus]);

  useEffect(() => {
    if (!ownerId && authedId) setOwnerId(authedId);
  }, [authedId, ownerId]);

  const parsed = useMemo(() => text.split("\n").map(parseLine).filter(Boolean) as ParsedRow[], [text]);
  const valid = parsed.filter((r) => r.firstName && r.kind !== "bad");
  const bad = parsed.filter((r) => !r.firstName || r.kind === "bad");

  const ownerName = isAdmin ? (leaders.find((l) => l.id === ownerId)?.name ?? authedName) : authedName;

  const submit = async () => {
    if (!valid.length || saving) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await bulkAddPeopleAction({
        rows: parsed.map((r) => ({ firstName: r.firstName, contact: r.contact })),
        campus,
        stage,
        ownerId: isAdmin ? ownerId : undefined,
      });
      setResult(res);
      if (res.added > 0) setText("");
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <p className="text-sm text-muted">Loading…</p>;

  return (
    <div>
      <Link href="/people" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        People
      </Link>

      <header className="mb-3">
        <Eyebrow>Quick add</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">Add many at once</h1>
        <p className="text-sm text-muted">
          One per line: <span className="text-ink">name, @handle</span> or <span className="text-ink">name, phone</span>. Paste a
          whole outreach list — duplicates are skipped automatically.
        </p>
      </header>

      <Card className="p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder={"Jane, @jane_doe\nMarcus, @marcus.nyu\nPriya, +1 212 555 0143"}
          className="w-full rounded-xl border border-border bg-surface-2 p-3 text-sm outline-none focus:border-accent"
        />

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-faint">Campus</span>
            <select value={campus} onChange={(e) => setCampus(e.target.value as Campus)} className="rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent">
              {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-faint">Stage</span>
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className="rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent">
              {STAGES.map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
          </label>
        </div>

        {isAdmin && (
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-faint">Assign all to</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent">
              {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <span className="text-[11px] text-faint">Whole batch goes to this leader&apos;s queue. Run it again per leader for a split.</span>
          </label>
        )}

        {parsed.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-faint">
              {valid.length} ready{bad.length ? ` · ${bad.length} need a fix` : ""} → {ownerName}
            </p>
            <div className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-surface-2 p-2">
              {parsed.map((r, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className={r.firstName ? "" : "text-red-500"}>{r.firstName || "⚠ no name"}</span>
                    {r.contact && <span className="text-muted"> · {r.contact}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] uppercase tracking-wide text-faint">
                    {r.kind === "ig" ? "IG" : r.kind === "phone" ? "text" : "⚠"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!valid.length || saving}
          className="mt-4 w-full rounded-xl px-3 py-3 text-center text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Adding…" : `Add ${valid.length || ""} ${valid.length === 1 ? "person" : "people"}`.trim()}
        </button>
      </Card>

      {result && (
        <Card className="mt-4 p-4 text-sm">
          <p className="font-medium text-ink">
            Added {result.added} · {result.existed} already in the system{result.skipped.length ? ` · ${result.skipped.length} skipped` : ""}
          </p>
          {result.skipped.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1 text-muted">
              {result.skipped.map((sk, i) => (
                <li key={i}>⚠ {sk.input} — {sk.reason}</li>
              ))}
            </ul>
          )}
          <button onClick={() => router.push("/people")} className="mt-3 text-sm text-accent underline underline-offset-4">
            See them in People
          </button>
        </Card>
      )}
    </div>
  );
}
