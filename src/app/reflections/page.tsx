"use client";

// Reflect — one route, driven by the store's currentLeaderId:
// • a leader submits their weekly Bible Hangout reflection (structured attendance
//   against their real roster) + sees their history, and self-assesses their growth;
// • an admin "views as" a leader to review reflections and (if pastoral) write the
//   pastor side of each growth dimension. Self + pastor share one structure, so the
//   growth section reads self-beside-pastor per dimension.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { todayET } from "@/lib/format";
import {
  addReflectionResponseAction,
  deleteReflectionAction,
  getActiveTermAction,
  getGrowthAction,
  getReflectionsAction,
  getRetrievalPromptAction,
  saveGrowthEntryAction,
  submitReflectionAction,
  type GrowthDimension,
  type GrowthEntry,
  type GrowthLadder,
  type GrowthMarker,
  type ReflectionSummary,
} from "@/app/actions";
import { type Campus } from "@/lib/types";
import { Eyebrow } from "@/components/ui";

const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];

const DIMS: { key: GrowthDimension; label: string; prompt: string }[] = [
  { key: "warmth", label: "Warmth", prompt: "Your own walk with Jesus + relational ease — the root you lead from (§1, §7)." },
  { key: "availability", label: "Showing up", prompt: "Were you actually there — for your Hangout, for Nights, for your people? R20's entry bar, and the first thing that quietly slips mid-semester." },
  { key: "shepherding", label: "Shepherding", prompt: "Knowing & noticing your people — check-ins, who's drifting before they disappear (§6, §6A)." },
  { key: "facilitation", label: "Facilitation", prompt: "Conversations, not lectures — good questions, drawing out the quiet (§5B–C)." },
  { key: "safe_room", label: "A safe room", prompt: "Welcoming & confidential; people leave encouraged, not evaluated (§2A, §5G)." },
  { key: "outreach", label: "Outreach & belonging", prompt: "The room faces outward — welcoming new people, praying for names (§5C, §11)." },
  { key: "multiplication", label: "Raising the next leader", prompt: "Spotting & pouring into an apprentice (§9 — we plant, we don't split)." },
];

const MARKERS: { key: GrowthMarker; label: string }[] = [
  { key: "growing", label: "Growing" },
  { key: "steady", label: "Steady" },
  { key: "stretch", label: "Stretch area" },
];

const LADDER: { key: GrowthLadder; label: string }[] = [
  { key: "leading", label: "Leading it" },
  { key: "raising", label: "Raising an apprentice" },
  { key: "sending", label: "Ready to send / planting" },
];

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent";

export default function ReflectionsPage() {
  const { people, leaders, currentLeaderId, authedId, isAdmin, isPastoral, leaderName, setCurrentLeader, addPerson, ready } = useReach();

  const [reflections, setReflections] = useState<ReflectionSummary[]>([]);
  const [canSubmit, setCanSubmit] = useState(false);
  const [canRespond, setCanRespond] = useState(false);
  const [retrievalPrompt, setRetrievalPrompt] = useState("");
  const [growth, setGrowth] = useState<GrowthEntry[]>([]);
  const [canEditSelf, setCanEditSelf] = useState(false);
  const [canEditPastor, setCanEditPastor] = useState(false);
  const [tab, setTab] = useState<"week" | "growth">("week");
  const [term, setTerm] = useState("Fall 2026");

  useEffect(() => {
    getActiveTermAction().then(setTerm).catch(() => {});
    getRetrievalPromptAction().then(setRetrievalPrompt).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!currentLeaderId) return;
    getReflectionsAction(currentLeaderId)
      .then((r) => {
        setReflections(r.reflections);
        setCanSubmit(r.canSubmit);
        setCanRespond(r.canRespond);
      })
      .catch(() => {});
    getGrowthAction(currentLeaderId, term)
      .then((g) => {
        setGrowth(g.entries);
        setCanEditSelf(g.canEditSelf);
        setCanEditPastor(g.canEditPastor);
      })
      .catch(() => {});
  }, [currentLeaderId, term]);

  useEffect(() => {
    load();
  }, [load]);

  const roster = useMemo(
    () =>
      people
        .filter((p) => p.ownerId === currentLeaderId)
        .sort((a, b) => (a.firstName + a.lastName).localeCompare(b.firstName + b.lastName)),
    [people, currentLeaderId],
  );

  const entry = (dim: GrowthDimension, kind: "self" | "pastor") =>
    growth.find((g) => g.dimension === dim && g.authorKind === kind);

  const saveGrowth = async (
    dim: GrowthDimension,
    kind: "self" | "pastor",
    patch: { marker?: GrowthMarker | null; ladder?: GrowthLadder | null; nextRep?: string | null; body?: string },
  ) => {
    await saveGrowthEntryAction(currentLeaderId, term, dim, kind, patch);
    load();
  };

  // Reflections are pastoral/leadership content. Ops admins (Dana/Robin) neither
  // lead Hangouts nor review reflections — the server returns nothing for them, and
  // the page shouldn't be reachable via direct URL either.
  if (ready && isAdmin && !isPastoral) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>Reflections are for Hangout leaders and the pastoral team.</p>
        <Link href="/" className="mt-2 inline-block text-accent">Back to Today</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Eyebrow>Growth</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">Reflect</h1>
        <p className="mt-0.5 text-sm text-muted">Weekly Bible Hangout reflections & your growth this semester.</p>
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-border p-3">
          <span className="text-xs font-medium text-faint">Admin · open a leader to review</span>
          <select
            value={currentLeaderId}
            onChange={(e) => setCurrentLeader(e.target.value)}
            className={inputCls}
            disabled={!ready}
          >
            {leaders.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <span className="text-xs text-muted">
            {canSubmit
              ? "Showing your own reflections — you can submit here."
              : currentLeaderId === authedId
                ? "You don't lead a Bible Hangout — pick a leader above to review their reflections & growth."
                : `Reviewing ${leaderName(currentLeaderId)} — read-only; you can add pastor growth notes, but can't submit as them.`}
          </span>
        </div>
      )}

      <div className="flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">
        <TabBtn active={tab === "week"} onClick={() => setTab("week")}>Reflections</TabBtn>
        <TabBtn active={tab === "growth"} onClick={() => setTab("growth")}>Growth</TabBtn>
      </div>

      {tab === "week" ? (
        <>
          {canSubmit && (
            <NewReflection
              roster={roster}
              retrievalPrompt={retrievalPrompt}
              onAddGuest={async (firstName, lastName, campus) => {
                const p = await addPerson({
                  firstName,
                  lastName,
                  campus,
                  phone: "",
                  stage: "Crowd",
                  ownerId: currentLeaderId,
                  smsConsent: false,
                });
                return p.id;
              }}
              onSubmit={async (input) => {
                await submitReflectionAction(input);
                load();
              }}
            />
          )}

          {reflections.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">
              {canSubmit ? "No reflections yet. After your next Hangout, take five minutes here." : "No reflections from this leader yet."}
            </p>
          ) : (
            reflections.map((r) => <ReflectionCard key={r.id} r={r} canRespond={canRespond} onChanged={load} onDelete={() => deleteReflectionAction(r.id).then(load)} />)
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Narrative, not scores. {canEditSelf ? "Reflect honestly — this is for growth, not a grade." : ""}
          </p>
          <div className="rounded-xl border border-border p-3 text-xs text-muted" style={{ background: "var(--surface-2)" }}>
            <b className="text-ink">When to do this:</b> Growth isn&apos;t weekly (that&apos;s the Reflections tab). It&apos;s a <b>semester rhythm</b> — set a <b>baseline at the start of term</b>, a light <b>mid-term check</b> if it helps, and a <b>review at the end</b> with your pastor. A few honest passes a semester, not every week.
          </div>
          <OverallCard
            self={entry("overall", "self")}
            pastor={entry("overall", "pastor")}
            canEditSelf={canEditSelf}
            canEditPastor={canEditPastor}
            onSave={(kind, patch) => saveGrowth("overall", kind, patch)}
          />
          {DIMS.map((d) => (
            <GrowthCard
              key={d.key}
              dim={d}
              self={entry(d.key, "self")}
              pastor={entry(d.key, "pastor")}
              canEditSelf={canEditSelf}
              canEditPastor={canEditPastor}
              onSave={(kind, patch) => saveGrowth(d.key, kind, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-lg py-1.5 font-medium"
      style={active ? { background: "var(--surface)", color: "var(--accent)", boxShadow: "0 1px 2px rgba(0,0,0,.06)" } : { color: "var(--muted)" }}
    >
      {children}
    </button>
  );
}

// ── New reflection (submit) ─────────────────────────────────────────────────

type RosterMember = { id: string; firstName: string; lastName: string };

function NewReflection({
  roster,
  retrievalPrompt,
  onAddGuest,
  onSubmit,
}: {
  roster: RosterMember[];
  retrievalPrompt: string;
  onAddGuest: (firstName: string, lastName: string, campus: Campus) => Promise<string>;
  onSubmit: (input: {
    occurredOn: string;
    expectedCount: number | null;
    keyMoment: string;
    concernFollowup: string;
    leaderPersonal: string;
    attendance: { personId: string; status: "present" | "absent" }[];
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const today = todayET();
  const [date, setDate] = useState(today);
  const [att, setAtt] = useState<Record<string, "present" | "absent">>({});
  const [keyMoment, setKeyMoment] = useState("");
  const [concern, setConcern] = useState("");
  const [personal, setPersonal] = useState("");
  const [guestFirst, setGuestFirst] = useState("");
  const [guestLast, setGuestLast] = useState("");
  const [guestCampus, setGuestCampus] = useState<Campus>("Columbia");
  const [addingGuest, setAddingGuest] = useState(false);
  const [saving, setSaving] = useState(false);

  const present = Object.values(att).filter((s) => s === "present").length;
  const absent = Object.values(att).filter((s) => s === "absent").length;
  // Nothing marked and nothing written = an empty reflection; don't allow it
  // (server rejects it too).
  const isEmpty = Object.keys(att).length === 0 && !keyMoment.trim() && !concern.trim() && !personal.trim();

  const set = (id: string, status: "present" | "absent") =>
    setAtt((a) => {
      if (a[id] === status) {
        const rest = { ...a };
        delete rest[id];
        return rest;
      }
      return { ...a, [id]: status };
    });

  const addGuest = async () => {
    if (!guestFirst.trim() || addingGuest) return;
    setAddingGuest(true);
    try {
      const id = await onAddGuest(guestFirst.trim(), guestLast.trim(), guestCampus);
      setAtt((a) => ({ ...a, [id]: "present" }));
      setGuestFirst("");
      setGuestLast("");
    } finally {
      setAddingGuest(false);
    }
  };

  const submit = async () => {
    if (saving || isEmpty) return;
    setSaving(true);
    try {
      await onSubmit({
        occurredOn: date,
        expectedCount: null,
        keyMoment,
        concernFollowup: concern,
        leaderPersonal: personal,
        attendance: Object.entries(att).map(([personId, status]) => ({ personId, status })),
      });
      setOpen(false);
      setAtt({});
      setKeyMoment("");
      setConcern("");
      setPersonal("");
      setDate(today);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl px-3 py-3 text-center text-sm font-semibold text-white"
        style={{ background: "var(--accent)" }}
      >
        + New reflection
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4">
      {retrievalPrompt && (
        <div className="rounded-xl border p-3" style={{ background: "var(--accent-soft)", borderColor: "var(--accent)" }}>
          <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent-ink)" }}>This month&apos;s question</p>
          <p className="text-sm text-ink">{retrievalPrompt}</p>
        </div>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-faint">Date of the Hangout</span>
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </label>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-medium text-faint">Who came?</span>
          <span className="text-xs text-muted">
            <span className="text-good">{present} present</span> · {absent} absent
          </span>
        </div>
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
          {roster.length === 0 && (
            <p className="p-3 text-sm text-muted">No one assigned to you yet — add guests below as they come.</p>
          )}
          {roster.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="truncate text-sm">{p.firstName} {p.lastName}</span>
              <div className="flex shrink-0 gap-1">
                <AttBtn active={att[p.id] === "present"} kind="present" onClick={() => set(p.id, "present")} />
                <AttBtn active={att[p.id] === "absent"} kind="absent" onClick={() => set(p.id, "absent")} />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-surface-2 p-2.5">
          <input value={guestFirst} onChange={(e) => setGuestFirst(e.target.value)} placeholder="New guest — first name" className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-2 text-sm outline-none focus:border-accent" />
          <input value={guestLast} onChange={(e) => setGuestLast(e.target.value)} placeholder="Last (optional)" className="min-w-0 flex-1 rounded-lg border border-border bg-surface p-2 text-sm outline-none focus:border-accent" />
          <select value={guestCampus} onChange={(e) => setGuestCampus(e.target.value as Campus)} className="rounded-lg border border-border bg-surface p-2 text-sm outline-none focus:border-accent">
            {CAMPUSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={addGuest} disabled={!guestFirst.trim() || addingGuest} className="rounded-lg px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-40" style={{ background: "var(--accent-soft)" }}>
            {addingGuest ? "Adding…" : "Add guest"}
          </button>
        </div>
        <p className="mt-1 px-1 text-xs text-faint">New guests are added to your people and start following-up as “new”.</p>
      </div>

      <Textarea label="Key moment from the study" value={keyMoment} onChange={setKeyMoment} placeholder="A moment where something landed — someone opened up, a hard question, a breakthrough." />
      <Textarea label="Anyone you're concerned about / following up with" value={concern} onChange={setConcern} placeholder="Who's drifting or carrying something — and your plan to reach out." />
      <Textarea label="How I'm doing personally" value={personal} onChange={setPersonal} placeholder="Honest — how's your own walk and capacity right now?" hint="Private to the pastoral team (Alex & Priya)." />

      {isEmpty && (
        <p className="text-xs text-faint">Mark who came or write at least one line to submit.</p>
      )}
      <div className="flex gap-2">
        <button onClick={submit} disabled={saving || isEmpty} className="flex-1 rounded-xl px-3 py-3 text-center text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
          {saving ? "Saving…" : "Submit reflection"}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-3 text-sm text-muted">Cancel</button>
      </div>
    </div>
  );
}

function AttBtn({ active, kind, onClick }: { active: boolean; kind: "present" | "absent"; onClick: () => void }) {
  const on = kind === "present"
    ? { background: "var(--good-soft)", color: "var(--good)", borderColor: "var(--good)" }
    : { background: "var(--warn-soft)", color: "var(--warn)", borderColor: "var(--warn)" };
  return (
    <button
      onClick={onClick}
      className="rounded-lg border px-2.5 py-1 text-xs font-medium"
      style={active ? on : { borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {kind === "present" ? "Here" : "Out"}
    </button>
  );
}

function Textarea({ label, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-faint">{label}</span>
      {hint && <span className="-mt-1 text-xs text-muted">{hint}</span>}
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className={`${inputCls} resize-y`} />
    </label>
  );
}

// ── Reflection history card ─────────────────────────────────────────────────

function ReflectionCard({ r, canRespond, onChanged, onDelete }: { r: ReflectionSummary; canRespond: boolean; onChanged: () => void; onDelete: () => void }) {
  const date = new Date(r.occurredOn + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await addReflectionResponseAction(r.id, reply);
    setBusy(false);
    if (res.ok) {
      setReply("");
      onChanged();
    } else setErr(res.error ?? "Could not send.");
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{date}</h3>
        <span className="text-xs text-muted"><span className="text-good">{r.present.length} here</span> · {r.absent.length} out</span>
      </div>
      {r.present.length > 0 && <NameLine label="Here" names={r.present.map((p) => p.name)} />}
      {r.absent.length > 0 && <NameLine label="Missing" names={r.absent.map((p) => p.name)} />}
      {r.keyMoment && <Block label="Key moment" text={r.keyMoment} />}
      {r.concernFollowup && <Block label="Following up" text={r.concernFollowup} />}
      {r.leaderPersonal && <Block label="Personal (pastoral)" text={r.leaderPersonal} tone="accent" />}

      {/* Pastoral replies — the loop closing. The leader sees these under their own entry. */}
      {r.responses.length > 0 && (
        <div className="mt-1 flex flex-col gap-2 border-l-2 pl-3" style={{ borderColor: "var(--accent)" }}>
          {r.responses.map((resp) => (
            <div key={resp.id}>
              <p className="text-xs font-medium text-faint">
                {resp.authorName}
                {resp.createdAt ? ` · ${new Date(resp.createdAt + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-sm">{resp.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Reply box — pastoral team only (also server-enforced). */}
      {canRespond && (
        <div className="mt-1 flex flex-col gap-1.5">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Reply to this leader — encouragement, a question back, what you noticed…"
            className={`${inputCls} resize-y`}
          />
          {err && <p className="text-xs" style={{ color: "var(--accent)" }}>{err}</p>}
          <button
            onClick={send}
            disabled={busy || !reply.trim()}
            className="self-end rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Sending…" : "Send reply"}
          </button>
        </div>
      )}

      <button onClick={onDelete} className="mt-1 self-end text-xs text-faint hover:text-warn">Delete</button>
    </div>
  );
}

function NameLine({ label, names }: { label: string; names: string[] }) {
  return (
    <p className="text-sm">
      <span className="text-xs font-medium text-faint">{label}: </span>
      <span className="text-muted">{names.join(", ")}</span>
    </p>
  );
}

function Block({ label, text, tone }: { label: string; text: string; tone?: "accent" }) {
  return (
    <div className={`rounded-lg p-2.5 ${tone === "accent" ? "" : "bg-surface-2"}`} style={tone === "accent" ? { background: "var(--accent-soft)" } : undefined}>
      <span className="text-xs font-medium text-faint">{label}</span>
      <p className="whitespace-pre-wrap text-sm">{text}</p>
    </div>
  );
}

// ── Growth (self + pastor per dimension) ────────────────────────────────────

function GrowthCard({
  dim,
  self,
  pastor,
  canEditSelf,
  canEditPastor,
  onSave,
}: {
  dim: { key: GrowthDimension; label: string; prompt: string };
  self?: GrowthEntry;
  pastor?: GrowthEntry;
  canEditSelf: boolean;
  canEditPastor: boolean;
  onSave: (kind: "self" | "pastor", patch: { marker?: GrowthMarker | null; body?: string }) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h3 className="font-semibold">{dim.label}</h3>
        <p className="mt-0.5 text-xs text-muted">{dim.prompt}</p>
      </div>
      <GrowthSide who="You" entry={self} editable={canEditSelf} onSave={(p) => onSave("self", p)} />
      {(pastor || canEditPastor) && (
        <GrowthSide who="Pastor" entry={pastor} editable={canEditPastor} onSave={(p) => onSave("pastor", p)} tone="accent" />
      )}
    </div>
  );
}

function GrowthSide({
  who,
  entry,
  editable,
  onSave,
  tone,
}: {
  who: string;
  entry?: GrowthEntry;
  editable: boolean;
  onSave: (patch: { marker?: GrowthMarker | null; body?: string }) => Promise<void>;
  tone?: "accent";
}) {
  const [prev, setPrev] = useState(entry);
  const [marker, setMarker] = useState<GrowthMarker | null>(entry?.marker ?? null);
  const [body, setBody] = useState(entry?.body ?? "");
  const [saving, setSaving] = useState(false);
  // Re-sync the draft when the saved entry changes (React's render-time adjustment).
  if (prev !== entry) {
    setPrev(entry);
    setMarker(entry?.marker ?? null);
    setBody(entry?.body ?? "");
  }

  const dirty = (entry?.marker ?? null) !== marker || (entry?.body ?? "") !== body;

  if (!editable) {
    if (!entry || (!entry.body && !entry.marker)) return null;
    return (
      <div className="rounded-lg p-2.5" style={tone === "accent" ? { background: "var(--accent-soft)" } : { background: "var(--surface-2)" }}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-faint">{who}</span>
          {entry.marker && <MarkerTag marker={entry.marker} />}
        </div>
        {entry.body && <p className="whitespace-pre-wrap text-sm">{entry.body}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg p-2.5" style={tone === "accent" ? { background: "var(--accent-soft)" } : { background: "var(--surface-2)" }}>
      <span className="text-xs font-medium text-faint">{who}</span>
      <div className="my-1.5 flex gap-1">
        {MARKERS.map((m) => (
          <Chip key={m.key} active={marker === m.key} onClick={() => setMarker(marker === m.key ? null : m.key)}>{m.label}</Chip>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="A sentence or two — what you see." className="w-full rounded-lg border border-border bg-surface p-2 text-sm outline-none focus:border-accent" />
      {dirty && (
        <button
          onClick={async () => { setSaving(true); try { await onSave({ marker, body }); } finally { setSaving(false); } }}
          disabled={saving}
          className="mt-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}

function OverallCard({
  self,
  pastor,
  canEditSelf,
  canEditPastor,
  onSave,
}: {
  self?: GrowthEntry;
  pastor?: GrowthEntry;
  canEditSelf: boolean;
  canEditPastor: boolean;
  onSave: (kind: "self" | "pastor", patch: { ladder?: GrowthLadder | null; nextRep?: string | null; body?: string }) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
      <div>
        <h3 className="font-semibold">Where are you this semester?</h3>
        <p className="mt-0.5 text-xs text-muted">The apprenticeship ladder — leading it, raising someone, ready to plant (§9). The ladder says where you are; <span className="italic">next rep</span> says what&apos;s next.</p>
      </div>
      <LadderSide who="You" entry={self} editable={canEditSelf} onSave={(p) => onSave("self", p)} />
      {(pastor || canEditPastor) && (
        <LadderSide who="Pastor" entry={pastor} editable={canEditPastor} onSave={(p) => onSave("pastor", p)} tone="accent" />
      )}
    </div>
  );
}

function LadderSide({
  who,
  entry,
  editable,
  onSave,
  tone,
}: {
  who: string;
  entry?: GrowthEntry;
  editable: boolean;
  onSave: (patch: { ladder?: GrowthLadder | null; nextRep?: string | null; body?: string }) => Promise<void>;
  tone?: "accent";
}) {
  const [prev, setPrev] = useState(entry);
  const [ladder, setLadder] = useState<GrowthLadder | null>(entry?.ladder ?? null);
  const [nextRep, setNextRep] = useState(entry?.nextRep ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [saving, setSaving] = useState(false);
  // Re-sync the draft when the saved entry changes (React's render-time adjustment).
  if (prev !== entry) {
    setPrev(entry);
    setLadder(entry?.ladder ?? null);
    setNextRep(entry?.nextRep ?? "");
    setBody(entry?.body ?? "");
  }

  const dirty = (entry?.ladder ?? null) !== ladder || (entry?.nextRep ?? "") !== nextRep || (entry?.body ?? "") !== body;
  const ladderLabel = (k: GrowthLadder) => LADDER.find((l) => l.key === k)?.label ?? k;

  if (!editable) {
    if (!entry || (!entry.body && !entry.ladder && !entry.nextRep)) return null;
    return (
      <div className="rounded-lg p-2.5" style={tone === "accent" ? { background: "var(--accent-soft)" } : { background: "var(--surface-2)" }}>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-faint">{who}</span>
          {entry.ladder && <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: "var(--gold)" }}>{ladderLabel(entry.ladder)}</span>}
        </div>
        {entry.body && <p className="whitespace-pre-wrap text-sm">{entry.body}</p>}
        {entry.nextRep && <p className="mt-1 text-sm"><span className="text-xs font-medium text-faint">Next rep: </span>{entry.nextRep}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg p-2.5" style={tone === "accent" ? { background: "var(--accent-soft)" } : { background: "var(--surface-2)" }}>
      <span className="text-xs font-medium text-faint">{who}</span>
      <div className="my-1.5 flex flex-wrap gap-1">
        {LADDER.map((l) => (
          <Chip key={l.key} active={ladder === l.key} onClick={() => setLadder(ladder === l.key ? null : l.key)}>{l.label}</Chip>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Where are you, and what's the next step?" className="w-full rounded-lg border border-border bg-surface p-2 text-sm outline-none focus:border-accent" />
      <input
        value={nextRep}
        onChange={(e) => setNextRep(e.target.value)}
        placeholder="Next rep, with a date — e.g. co-lead the study on Oct 3"
        className="mt-1.5 w-full rounded-lg border border-border bg-surface p-2 text-sm outline-none focus:border-accent"
      />
      {dirty && (
        <button
          onClick={async () => { setSaving(true); try { await onSave({ ladder, nextRep, body }); } finally { setSaving(false); } }}
          disabled={saving}
          className="mt-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-xs font-medium"
      style={active ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}
    >
      {children}
    </button>
  );
}

function MarkerTag({ marker }: { marker: GrowthMarker }) {
  const label = MARKERS.find((m) => m.key === marker)?.label ?? marker;
  return <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: "var(--surface)", color: "var(--accent-ink)", border: "1px solid var(--border)" }}>{label}</span>;
}
