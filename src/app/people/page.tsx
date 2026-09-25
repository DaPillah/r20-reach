"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { relativeDays, daysBetween } from "@/lib/format";
import { DUE_AFTER_DAYS } from "@/lib/logic";
import { Avatar, CampusBadge, Card, Eyebrow, StageChip } from "@/components/ui";
import { GENDERS, STAGES, isSummerPriority, summerReasonLabel, type Campus, type Gender, type Stage } from "@/lib/types";
import { eventLabel } from "@/lib/events";
import { distributeToTeamAction } from "@/app/actions";

const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];
type StatusFilter = "" | "overdue" | "new" | "unplaced" | "resting" | "nyc";
type ReachFilter = "" | "opted_in" | "no_sms" | "ig";

export default function PeoplePage() {
  const { people, leaders, leaderName, isAdmin, campusLeadOf, coordinatorId, refresh, authedId } = useReach();
  const now = useMemo(() => new Date(), []);
  const [selMembers, setSelMembers] = useState<Set<string>>(new Set());
  const [distributing, setDistributing] = useState(false);
  const [distMsg, setDistMsg] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  // Multi-select: campus/stage match ANY selected (a person has one, so it's OR);
  // events can match ALL selected ("came to both") or ANY, via eventMode.
  const [campuses, setCampuses] = useState<Set<Campus>>(new Set());
  const [stages, setStages] = useState<Set<Stage>>(new Set());
  const [owner, setOwner] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [reach, setReach] = useState<ReachFilter>(""); // texting reachability: opted-in / no consent / IG-only
  const [events, setEvents] = useState<Set<string>>(new Set());
  const [eventMode, setEventMode] = useState<"all" | "any">("all"); // "all" = came to every selected event
  const [gender, setGender] = useState<"" | Gender>("");

  // Events anyone visible has signed in at — powers the "came to event" filter.
  const eventOptions = useMemo(
    () => [...new Set(people.flatMap((p) => p.events ?? []))].sort(),
    [people],
  );

  const isOverdue = (lastTouchAt: string | null) =>
    lastTouchAt === null || daysBetween(lastTouchAt, now) >= DUE_AFTER_DAYS;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => {
        if (q && !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) return false;
        if (campuses.size && !(p.campus && campuses.has(p.campus))) return false;
        if (gender && p.gender !== gender) return false;
        if (stages.size && !stages.has(p.stage)) return false;
        if (owner && p.ownerId !== owner) return false;
        // Three DISJOINT buckets: opted-in (phone+consent) · gave a number but
        // didn't opt in · Instagram-only (no number). "No consent" is the strict
        // inverse of opted-in among people who left a phone — it never overlaps IG.
        if (reach === "opted_in" && !p.optedIn) return false;
        if (reach === "no_sms" && !(p.phone && !p.optedIn)) return false;
        if (reach === "ig" && !(p.instagramHandle && !p.phone)) return false;
        if (events.size) {
          const pe = p.events ?? [];
          const sel = [...events];
          const match = eventMode === "all" ? sel.every((e) => pe.includes(e)) : sel.some((e) => pe.includes(e));
          if (!match) return false;
        }
        // Resting people show in the default view (with a chip) and under the
        // "resting" filter — but never in the action filters (overdue/new/unplaced).
        if (status === "resting") return !!p.dormantAt;
        // NYC-local (summer pool) — include whether they're resting or not.
        if (status === "nyc") return !!p.nycLocal;
        if (status && p.dormantAt) return false;
        if (status === "overdue" && !isOverdue(p.lastTouchAt)) return false;
        if (status === "new" && p.lastTouchAt !== null) return false;
        if (
          status === "unplaced" &&
          !(p.hangoutId === null && (["Community", "Committed", "Core"] as Stage[]).includes(p.stage))
        )
          return false;
        return true;
      })
      .sort((a, b) => a.firstName.localeCompare(b.firstName));
  }, [people, query, campuses, gender, stages, owner, status, reach, events, eventMode, now]);

  // Distribute: hand an event's still-with-the-coordinator sign-ins to the team.
  // Available to admins + campus leads when filtered to one event.
  const canDistribute = events.size > 0 && (isAdmin || !!campusLeadOf);
  const assignable = useMemo(
    () => (canDistribute ? results.filter((p) => p.ownerId === coordinatorId || p.ownerId === null || p.ownerId === authedId) : []),
    [canDistribute, results, coordinatorId, authedId],
  );
  const team = useMemo(() => leaders.filter((l) => l.role === "leader" || l.role === "gatherer"), [leaders]);
  const toggleMember = (id: string) =>
    setSelMembers((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const distribute = async () => {
    if (selMembers.size === 0 || assignable.length === 0) return;
    setDistributing(true); setDistMsg(null);
    try {
      const r = await distributeToTeamAction(assignable.map((p) => p.id), [...selMembers]);
      setDistMsg(`Assigned ${r.assigned} ${r.assigned === 1 ? "person" : "people"} across ${selMembers.size} of the team.`);
      setSelMembers(new Set());
      refresh();
    } catch (e) {
      setDistMsg(e instanceof Error ? e.message : "Couldn't distribute.");
    } finally { setDistributing(false); }
  };

  const eventFilterLabel = events.size === 1 ? eventLabel([...events][0]) : "event";
  const anyFilter = query || campuses.size || gender || stages.size || owner || status || reach || events.size;

  return (
    <div>
      <header className="mb-3 flex items-center justify-between">
        <div>
          <Eyebrow>The roster</Eyebrow>
          <h1 className="text-2xl font-semibold tracking-tight">People</h1>
          <p className="text-sm text-muted">
            {anyFilter ? `${results.length} of ${people.length}` : `${people.length} in the R20 family`}
          </p>
        </div>
        <Link
          href="/add"
          className="rounded-xl px-3 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          + Add
        </Link>
      </header>

      {/* search + filters */}
      <div className="mb-4 flex flex-col gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent"
        />
        {/* Multi-select chip groups — tap to add/remove; combine freely. */}
        <ChipGroup label="Campus">
          {CAMPUSES.map((c) => (
            <Chip key={c} on={campuses.has(c)} onClick={() => toggleInSet(setCampuses, c)}>{c}</Chip>
          ))}
        </ChipGroup>
        <ChipGroup label="Stage">
          {STAGES.map((s) => (
            <Chip key={s} on={stages.has(s)} onClick={() => toggleInSet(setStages, s)}>{s}</Chip>
          ))}
        </ChipGroup>
        {eventOptions.length > 0 && (
          <ChipGroup label="Came to">
            {eventOptions.map((slug) => (
              <Chip key={slug} on={events.has(slug)} onClick={() => toggleInSet(setEvents, slug)}>{eventLabel(slug)}</Chip>
            ))}
            {events.size > 1 && (
              <button
                type="button"
                onClick={() => setEventMode((m) => (m === "all" ? "any" : "all"))}
                className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-accent-ink"
                style={{ background: "var(--accent-soft)" }}
                title="Match people who came to every selected event, or any of them"
              >
                {eventMode === "all" ? "came to all ▾" : "came to any ▾"}
              </button>
            )}
          </ChipGroup>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select value={gender} onChange={(e) => setGender(e.target.value as Gender | "")} className={selCls}>
            <option value="">Any gender</option>
            {GENDERS.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
          {/* Owner filter is only meaningful to admins, who see the whole roster.
              Leaders see only their own people, so the picker would be a no-op. */}
          {isAdmin && (
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className={selCls}>
              <option value="">All leaders</option>
              {leaders.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} className={selCls}>
            <option value="">Any status</option>
            <option value="overdue">Overdue</option>
            <option value="new">Never contacted</option>
            <option value="unplaced">Unplaced</option>
            <option value="resting">Resting</option>
            <option value="nyc">In NYC (summer pool)</option>
          </select>
          <select value={reach} onChange={(e) => setReach(e.target.value as ReachFilter)} className={selCls} title="Filter by texting reachability">
            <option value="">Any reachability</option>
            <option value="opted_in">Opted in to texts</option>
            <option value="no_sms">Has number, not opted in</option>
            <option value="ig">Instagram only</option>
          </select>
          {anyFilter && (
            <button
              onClick={() => { setQuery(""); setCampuses(new Set()); setGender(""); setStages(new Set()); setOwner(""); setStatus(""); setReach(""); setEvents(new Set()); }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent-ink"
              style={{ background: "var(--accent-soft)" }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {canDistribute && assignable.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold">Hand these out to the team</p>
          <p className="mt-0.5 text-xs text-muted">
            {assignable.length} of these {eventFilterLabel} sign-ins are still with the coordinator. Pick who follows up — they&apos;ll be split evenly.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleMember(l.id)}
                aria-pressed={selMembers.has(l.id)}
                className="rounded-full border px-3 py-1.5 text-xs transition-colors"
                style={selMembers.has(l.id)
                  ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                  : { background: "var(--surface-2)", color: "var(--ink)", borderColor: "var(--border)" }}
              >
                {l.name}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              onClick={distribute}
              disabled={distributing || selMembers.size === 0}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {distributing ? "Assigning…" : `Distribute ${assignable.length} →`}
            </button>
            {distMsg && <span className="text-xs text-muted">{distMsg}</span>}
          </div>
        </Card>
      )}

      {results.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">No one matches those filters.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {results.map((p) => (
            <Link key={p.id} href={`/person/${p.id}`}>
              <Card className="flex items-center gap-3 p-3">
                <Avatar first={p.firstName} last={p.lastName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {p.firstName} {p.lastName}
                    </span>
                    <CampusBadge campus={p.campus} />
                    {p.nycLocal && (
                      isSummerPriority(p.summerReason) ? (
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                          ★ {summerReasonLabel(p.summerReason)}
                        </span>
                      ) : (
                        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
                          {summerReasonLabel(p.summerReason) || "Summer"}
                        </span>
                      )
                    )}
                    {p.dormantAt ? (
                      <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--faint)" }}>
                        resting
                      </span>
                    ) : (
                      p.hangoutId === null &&
                      (["Community", "Committed", "Core"] as Stage[]).includes(p.stage) && (
                        <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                          unplaced
                        </span>
                      )
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted" suppressHydrationWarning>
                    {leaderName(p.ownerId)} · last touch {relativeDays(p.lastTouchAt, now)}
                  </p>
                </div>
                <StageChip stage={p.stage} small />
              </Card>
            </Link>
          ))}
        </ul>
      )}
    </div>
  );
}

const selCls =
  "rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-muted outline-none focus:border-accent";

function toggleInSet<T>(setter: Dispatch<SetStateAction<Set<T>>>, v: T) {
  setter((prev) => {
    const next = new Set(prev);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  });
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] font-medium text-faint">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
      style={on
        ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
        : { background: "var(--surface-2)", color: "var(--muted)", borderColor: "var(--border)" }}
    >
      {children}
    </button>
  );
}
