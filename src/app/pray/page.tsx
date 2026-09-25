"use client";

// PRAYER WALK (/pray) — a quiet, unhurried surface for praying over your people,
// one face at a time. Deliberately NOT a work tool: no Send/Log/Snooze, no red
// flags or scores — just a name, where they are, and one soft line. Every leader
// can pray over their own flock; pastoral + admins can pick any scope (a leader's
// people, a campus, or everyone). Reads the store snapshot — no new server call.
import { useEffect, useMemo, useState } from "react";
import { useReach } from "@/lib/store";
import { Card, Eyebrow } from "@/components/ui";
import { STAGE_META, type Campus, type Person } from "@/lib/types";
import { relativeDays } from "@/lib/format";

// Short, prayer-fitting lines — rotated per person so the walk stays fresh.
const VERSES: { text: string; ref: string }[] = [
  { text: "The Lord watch over your going out and your coming in.", ref: "Psalm 121:8" },
  { text: "I have called you by name; you are mine.", ref: "Isaiah 43:1" },
  { text: "He knows the way that I take.", ref: "Job 23:10" },
  { text: "The Lord is near to all who call on him.", ref: "Psalm 145:18" },
  { text: "I have prayed for you, that your faith may not fail.", ref: "Luke 22:32" },
  { text: "Faithful is he who calls you.", ref: "1 Thessalonians 5:24" },
];

const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];

function orderByName(list: Person[]): Person[] {
  return [...list].sort((a, b) => a.firstName.localeCompare(b.firstName));
}
function shuffled(list: Person[]): Person[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PrayPage() {
  const { people, leaders, authedId, isAdmin, isPastoral, ready } = useReach();
  const canPickScope = isAdmin || isPastoral;

  // Scope: 'mine' | 'all' | 'campus:<c>' | 'leader:<id>'. Leaders always see their
  // own (their snapshot is already scoped); the picker is a pastoral/admin extra.
  const ownsAny = useMemo(() => people.some((p) => p.ownerId === authedId), [people, authedId]);
  const [scope, setScope] = useState<string>("mine");
  useEffect(() => { setScope(canPickScope && !ownsAny ? "all" : "mine"); }, [canPickScope, ownsAny]);

  const [shuffle, setShuffle] = useState(false);
  const [idx, setIdx] = useState(0);
  const [prayed, setPrayed] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    let list = people;
    if (scope === "mine") list = people.filter((p) => p.ownerId === authedId);
    else if (scope.startsWith("campus:")) { const c = scope.slice(7); list = people.filter((p) => p.campus === c); }
    else if (scope.startsWith("leader:")) { const id = scope.slice(7); list = people.filter((p) => p.ownerId === id); }
    return list;
  }, [people, scope, authedId]);

  const ordered = useMemo(() => (shuffle ? shuffled(filtered) : orderByName(filtered)), [filtered, shuffle]);

  // Reset the walk whenever the set or order changes.
  useEffect(() => { setIdx(0); setPrayed(new Set()); }, [scope, shuffle, ordered.length]);

  if (!ready) return null;

  const total = ordered.length;
  const done = total > 0 && idx >= total;
  const current = !done ? ordered[idx] : null;
  const verse = VERSES[(current ? idx : prayed.size) % VERSES.length];

  const advance = () => setIdx((i) => Math.min(i + 1, total));
  const back = () => setIdx((i) => Math.max(i - 1, 0));
  const markPrayed = () => { if (current) { setPrayed((s) => new Set(s).add(current.id)); } advance(); };
  const restart = () => { setIdx(0); setPrayed(new Set()); };

  const scopeLabel =
    scope === "mine" ? "your people"
    : scope === "all" ? "everyone"
    : scope.startsWith("campus:") ? scope.slice(7)
    : leaders.find((l) => l.id === scope.slice(7))?.name ?? "them";

  return (
    <div>
      <Eyebrow>Prayer</Eyebrow>
      <h1 className="text-2xl font-semibold tracking-tight">Pray over {scopeLabel}</h1>
      <p className="mt-1 text-sm text-muted">One at a time, unhurried. Nothing to do here but pray.</p>

      {/* Scope + shuffle controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canPickScope && (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            {ownsAny && <option value="mine">My people</option>}
            <option value="all">Everyone</option>
            <optgroup label="By campus">
              {CAMPUSES.filter((c) => people.some((p) => p.campus === c)).map((c) => (
                <option key={c} value={`campus:${c}`}>{c}</option>
              ))}
            </optgroup>
            <optgroup label="By leader">
              {leaders.map((l) => (
                <option key={l.id} value={`leader:${l.id}`}>{l.name}</option>
              ))}
            </optgroup>
          </select>
        )}
        <button
          type="button"
          onClick={() => setShuffle((s) => !s)}
          aria-pressed={shuffle}
          className="rounded-xl border px-3 py-2 text-sm transition-colors"
          style={shuffle
            ? { background: "var(--gold-bright)", color: "#1c1610", borderColor: "var(--gold-bright)" }
            : { background: "var(--surface)", color: "var(--muted)", borderColor: "var(--border)" }}
        >
          🔀 Shuffle
        </button>
      </div>

      {total === 0 ? (
        <Card className="mt-6 p-8 text-center">
          <p className="text-sm text-muted">No one to pray over here yet. As people come in, they&apos;ll gather here for you.</p>
        </Card>
      ) : done ? (
        <Card className="mt-6 flex flex-col items-center gap-4 p-10 text-center">
          <div className="text-4xl">🙏</div>
          <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            You prayed over {prayed.size} {prayed.size === 1 ? "person" : "people"}.
          </h2>
          <p className="max-w-xs text-sm leading-relaxed text-muted">&ldquo;{verse.text}&rdquo; <span className="text-faint">— {verse.ref}</span></p>
          <button onClick={restart} className="mt-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
            Again
          </button>
        </Card>
      ) : current ? (
        <>
          <p className="mt-6 mb-2 text-center text-[11px] uppercase tracking-[0.18em] text-faint">{idx + 1} of {total}</p>
          <Card className="flex min-h-[19rem] flex-col items-center justify-center gap-4 p-8 text-center">
            <p className="max-w-xs text-sm italic leading-relaxed text-muted">
              &ldquo;{verse.text}&rdquo;<br /><span className="text-[11px] not-italic text-faint">{verse.ref}</span>
            </p>
            <h2 className="text-4xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{current.firstName}</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted">{current.campus}</span>
              <span className="text-faint">·</span>
              <span className="font-medium" style={{ color: STAGE_META[current.stage].color }}>{current.stage}</span>
            </div>
            <p className="text-xs text-faint">{softLine(current)}</p>
          </Card>

          <div className="mt-4 flex items-center gap-2">
            <button onClick={back} disabled={idx === 0} className="rounded-xl border border-border px-4 py-3 text-sm text-muted disabled:opacity-40">‹ Back</button>
            <button onClick={markPrayed} className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
              Prayed 🙏
            </button>
            <button onClick={advance} className="rounded-xl border border-border px-4 py-3 text-sm text-muted">Skip ›</button>
          </div>
        </>
      ) : null}
    </div>
  );
}

// One soft, non-clinical line about where they are — never a red flag or count.
function softLine(p: Person): string {
  if (p.dormantAt) return "Resting this season";
  if (p.invitedByName) return `Invited by ${p.invitedByName}`;
  if (p.hangoutId) return "In a Bible Hangout";
  if (p.lastTouchAt === null) return "Not yet connected — new to us";
  return `Last connected ${relativeDays(p.lastTouchAt, new Date())}`;
}
