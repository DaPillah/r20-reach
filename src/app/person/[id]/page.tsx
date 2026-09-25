"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useReach } from "@/lib/store";
import { draftFor } from "@/lib/logic";
import { activeRsvpFor } from "@/lib/events";
import { relativeDays, relativeFuture, smsHref, todayET } from "@/lib/format";
import { Avatar, Card, StageChip } from "@/components/ui";
import { QuickReplies } from "@/components/QuickReplies";
import { OrgThread } from "@/components/org-thread";
import { GENDERS, PREFERRED_CONTACT_META, SCHOOL_YEARS, STAGE_META, STAGES, SUMMER_REASONS, TOUCH_META, instagramProfileUrl, isSummerPriority, type Campus, type Gender, type Leader, type Person, type PreferredContact, type SchoolYear, type Stage, type TouchType } from "@/lib/types";
import { addNoteAction, deleteNoteAction, enrollPersonInJourneyAction, getCounselAction, getNotesAction, getPersonJourneysAction, stopPersonJourneyAction, type CounselResult, type PersonJourneysResult, type PersonNote, type PersonPatch } from "@/app/actions";

const LOG_TYPES: TouchType[] = ["text", "call", "in_person", "prayer", "invite", "instagram_dm"];
const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];

// Hangouts haven't started yet — placement is greyed out until they do
// (Alex, 2026-08-15). Flip to true when Hangouts open.
const PLACEMENT_OPEN = false;

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getPerson, activitiesFor, logTouch, setReplied, deleteActivity, advanceStage, placeInHangout, hangouts, hangoutById, leaderName, leaders, updatePerson, archivePerson, setDormant, reconnect, setServingRole, setApprentice, setNycLocal, currentLeaderId, isAdmin, isPastoral, counselEnabled, ready, eventConfig } =
    useReach();
  const now = useMemo(() => new Date(), []);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [restOpen, setRestOpen] = useState(false);
  const [restReason, setRestReason] = useState("");
  const [servingOpen, setServingOpen] = useState(false);
  const [servingInput, setServingInput] = useState("");
  const [apprNote, setApprNote] = useState("");
  // Arriving from a Today "Replies" link (#quick-replies) → open + scroll to it.
  const [repliesOpen, setRepliesOpen] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#quick-replies") {
      setRepliesOpen(true);
      setTimeout(() => document.getElementById("quick-replies")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    }
  }, []);

  const p = getPerson(id);
  if (!ready) {
    return <div className="pt-10 text-center text-muted">Loading…</div>;
  }
  if (!p) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>Person not found.</p>
        <Link href="/people" className="mt-2 inline-block text-accent">
          Back to People
        </Link>
      </div>
    );
  }

  const activities = activitiesFor(id);
  // Who can delete a mislogged touch — owner, pastoral, or admin (server re-checks).
  const canManageTimeline = isAdmin || isPastoral || currentLeaderId === p.ownerId;
  const igUrl = instagramProfileUrl(p.instagramHandle);
  const hangout = hangoutById(p.hangoutId);
  const campusHangouts = hangouts.filter((h) => h.campus === p.campus);
  const stageIdx = STAGES.indexOf(p.stage);
  const eligibleToPlace =
    !p.hangoutId && ["Community", "Committed", "Core"].includes(p.stage);

  // Confirmation state for the Log-a-touch buttons — without it a tap gives no
  // visible feedback (the new entry lands in the timeline further down the page),
  // so people tap again and log duplicates. We flash "Logged ✓" for a moment.
  const [justLogged, setJustLogged] = useState<TouchType | null>(null);
  // Which timeline entry is pending a delete confirm (two-tap, so a stray tap
  // doesn't remove a real touch).
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  const loggedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (loggedTimer.current) clearTimeout(loggedTimer.current); }, []);
  const log = (t: TouchType) => {
    logTouch(id, t, note);
    setNote("");
    setJustLogged(t);
    if (loggedTimer.current) clearTimeout(loggedTimer.current);
    loggedTimer.current = setTimeout(() => setJustLogged(null), 2800);
  };

  return (
    <div>
      {/* Back to wherever the profile was opened from (People, Funnel, Overview…),
          NOT a hardcoded /people. Falls back to /people on a direct load. */}
      <button
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) router.back();
          else router.push("/people");
        }}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back
      </button>

      {/* header */}
      <div className="flex items-center gap-3">
        <Avatar first={p.firstName} last={p.lastName} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {p.firstName} {p.lastName}
          </h1>
          <p className="text-xs text-muted">
            {p.campus} · owned by {leaderName(p.ownerId)}
          </p>
          {(p.preferredContact === "instagram" || p.instagramHandle) && (
            <p className="mt-0.5 text-[11px] text-faint">
              {p.instagramHandle ? <span className="font-medium">@{p.instagramHandle}</span> : "Instagram"}
              {p.preferredContact === "instagram" && " · prefers Instagram DM"}
            </p>
          )}
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          aria-label="Edit person"
          className="rounded-xl border border-border px-3 py-2 text-sm font-medium text-muted"
        >
          {editing ? "Close" : "Edit"}
        </button>
        {igUrl && (
          <a
            href={igUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => logTouch(id, "instagram_dm")}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            DM
          </a>
        )}
        {p.phone && p.preferredContact !== "instagram" && (
          <a
            href={smsHref(p.phone, draftFor(p, leaderName(p.ownerId), leaders.find((l) => l.id === p.ownerId)?.draftTemplates, eventConfig))}
            onClick={() => logTouch(id, "text")}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Text
          </a>
        )}
      </div>


      {/* Edit panel sits right under the header — adjacent to the Edit button
          that opens it. Only renders while editing, so the normal flow keeps
          quick replies glued under the reach-out buttons. */}
      {editing && (
        <EditPanel
          key={p.id}
          p={p}
          leaders={leaders}
          isPastoral={isPastoral}
          onSave={(patch) => {
            updatePerson(id, patch);
            setEditing(false);
          }}
          onArchive={(reason) => {
            archivePerson(id, reason);
            router.push("/people");
          }}
        />
      )}

      {/* ── Reach out & record — the compose cluster, glued to the header's
          Text/DM buttons: quick replies to compose, then log what happened. ── */}

      {/* Quick replies — right by the reach-out buttons, the compose moment. */}
      <QuickReplies personName={p.firstName} id="quick-replies" defaultOpen={repliesOpen} />

      {/* The org-number conversation (R20 Twilio number) — replies stored by
          the inbound webhook + consent-gated sends from the app. Personal
          texting stays on the leader's own phone above. */}
      <Card className="mt-4 p-4" id="org-thread">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">R20 number conversation</p>
        <OrgThread personId={p.id} firstName={p.firstName} canText={!!p.optedIn} />
      </Card>

      {/* log a touch — the most-used action, kept beside the reach-out moment */}
      <Card className="mt-4 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Log a touch</p>
          {justLogged && (
            <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--good)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              Logged {TOUCH_META[justLogged].label.toLowerCase()}
            </span>
          )}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (what happened?)"
          className="mt-2 w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {LOG_TYPES.map((t) => {
            const on = justLogged === t;
            return (
              <button
                key={t}
                onClick={() => log(t)}
                disabled={on}
                className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-default"
                style={on
                  ? { borderColor: "var(--good)", color: "var(--good)", background: "var(--good-soft)" }
                  : { borderColor: "var(--border)", color: "var(--muted)" }}
              >
                {on ? "✓ " : ""}{TOUCH_META[t].label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-faint">Each tap adds one entry to the timeline below.</p>
      </Card>

      {/* ── Status — where they stand ── */}

      {/* stage */}
      <Card className="mt-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StageChip stage={p.stage} />
            <span className="text-xs text-faint">· {STAGE_META[p.stage].next}</span>
          </div>
          {stageIdx < STAGES.length - 1 && (
            <button
              onClick={() => advanceStage(id)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-accent-ink"
              style={{ background: "var(--accent-soft)" }}
            >
              Advance →
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-1">
          {STAGES.map((s, i) => (
            <div
              key={s}
              className="h-1.5 flex-1 rounded-full"
              style={{ background: i <= stageIdx ? STAGE_META[p.stage].color : "var(--surface-2)" }}
            />
          ))}
        </div>
      </Card>

      {/* placement */}
      <Card className="mt-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Bible Hangout</p>
        {hangout ? (
          <p className="mt-1 text-sm">
            In <span className="font-medium">{hangout.name}</span>
          </p>
        ) : eligibleToPlace ? (
          <div className="mt-2">
            {PLACEMENT_OPEN ? (
              <>
                <p className="mb-2 text-sm text-warn">Ready to place — pick a Hangout:</p>
                <div className="flex flex-wrap gap-2">
                  {campusHangouts.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => placeInHangout(id, h.id)}
                      className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium"
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted">Ready to place — Hangouts haven&apos;t started yet, so placing opens when they do.</p>
                <div className="flex flex-wrap gap-2 opacity-40">
                  {campusHangouts.map((h) => (
                    <button key={h.id} disabled className="cursor-not-allowed rounded-lg border border-border px-3 py-1.5 text-sm font-medium">
                      {h.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">Not yet — reaches this step at Community.</p>
        )}
      </Card>

      {/* ── History & follow-up — the reference zone: recent story first,
          then automated journeys, then private pastoral notes. ── */}

      {/* timeline — the story so far; leads the reference zone for quick context */}
      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-faint">
        Timeline
      </h2>
      {activities.length === 0 ? (
        <p className="text-sm text-muted">
          No logged touches yet
          {p.lastTouchAt ? ` · last contact ${relativeDays(p.lastTouchAt, now)}` : ""}.
        </p>
      ) : (
        <ul className="flex flex-col">
          {activities.map((a, i) => (
            <li key={a.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1.5 size-2 rounded-full" style={{ background: "var(--accent)" }} />
                {i < activities.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>
              <div className="flex flex-1 items-start justify-between gap-2 pb-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{TOUCH_META[a.type].label}</p>
                  {a.note && <p className="text-sm text-muted">{a.note}</p>}
                  <p className="text-[11px] text-faint" suppressHydrationWarning>
                    {relativeDays(a.at, now)}
                  </p>
                </div>
                {canManageTimeline && (
                  confirmDelId === a.id ? (
                    <span className="flex shrink-0 items-center gap-2 text-[11px]">
                      <button onClick={() => { deleteActivity(a.id); setConfirmDelId(null); }} className="font-semibold text-red-500">
                        Remove
                      </button>
                      <button onClick={() => setConfirmDelId(null)} className="text-muted">Cancel</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDelId(a.id)}
                      aria-label="Delete this touch"
                      className="shrink-0 rounded-md p-1 text-faint"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
                      </svg>
                    </button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* follow-up journeys — leader-initiated enrollment (owner or admin) */}
      {(isAdmin || currentLeaderId === p.ownerId) && (
        <JourneysPanel personId={id} firstName={p.firstName} now={now} decision={p.captureSurface === "linktree_decision"} igPreferred={p.preferredContact === "instagram"} />
      )}

      {/* private pastoral notes — owner or pastoral oversight only */}
      {(isPastoral || currentLeaderId === p.ownerId) && <NotesPanel personId={id} />}

      {/* ── Growth & care — the occasional lifecycle zone, grouped below the
          daily-use surfaces: serving & raising up, then seasons & stepping
          back, then pastoral help. Not the every-visit stuff. ── */}
      <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-faint">
        Growth &amp; care
      </h2>

      {/* serving (Ministry) — a serving role; feeds the aggregate serving ratio */}
      <Card className="mt-3 p-4">
        {p.servingRole ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Serving</p>
              <p className="mt-0.5 text-sm font-medium">{p.servingRole}</p>
            </div>
            <button onClick={() => setServingRole(id, null)} className="shrink-0 text-xs font-medium text-muted underline">
              Not serving
            </button>
          </div>
        ) : servingOpen ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Mark as serving</p>
            <input
              value={servingInput}
              onChange={(e) => setServingInput(e.target.value)}
              placeholder="Role — e.g. greeter, worship, setup, apprentice"
              className={inputCls}
            />
            <div className="flex gap-2">
              <button
                onClick={() => { if (servingInput.trim()) { setServingRole(id, servingInput); setServingOpen(false); setServingInput(""); } }}
                disabled={!servingInput.trim()}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                Save
              </button>
              <button onClick={() => { setServingOpen(false); setServingInput(""); }} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setServingOpen(true)} className="text-sm font-medium text-muted underline">
            Mark {p.firstName} as serving
          </button>
        )}
      </Card>

      {/* apprentice — "we plant, we don't split"; feeds the Raising & Sending lens */}
      <Card className="mt-3 p-4">
        {p.apprenticeOf ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">Apprentice</p>
                <p className="mt-0.5 text-sm">Being raised by {p.ownerId ? leaderName(p.ownerId) : "their leader"} 🌱</p>
              </div>
              <button onClick={() => setApprentice(id, false)} className="shrink-0 text-xs font-medium text-muted underline">
                Not raising
              </button>
            </div>
            {(isAdmin || currentLeaderId === p.ownerId) && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted">Start their growth — jot your next step with {p.firstName}.</p>
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={apprNote}
                    onChange={(e) => setApprNote(e.target.value)}
                    placeholder="e.g. have them co-lead the study Oct 3"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 p-2 text-sm outline-none focus:border-accent"
                  />
                  <button
                    onClick={() => { if (apprNote.trim()) { logTouch(id, "note", apprNote); setApprNote(""); } }}
                    disabled={!apprNote.trim()}
                    className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <button onClick={() => setApprentice(id, true)} className="text-sm font-medium text-muted underline">
            Raise {p.firstName} as an apprentice
          </button>
        )}
      </Card>

      {/* Summer-care pool — around over summer/breaks; international + no-family = priority */}
      <Card className="mt-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Around over summer &amp; breaks</p>
            <p className="mt-0.5 text-[11px] text-faint">The pool to keep meeting when campus empties — especially international students and anyone without family to go home to.</p>
          </div>
          <button
            onClick={() => setNycLocal(id, !p.nycLocal, p.nycLocal ? null : p.summerReason)}
            aria-pressed={Boolean(p.nycLocal)}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold"
            style={
              p.nycLocal
                ? { background: "var(--accent)", color: "#fff", borderColor: "var(--accent)" }
                : { borderColor: "var(--border)", color: "var(--muted)" }
            }
          >
            {p.nycLocal ? "Around ✓" : "Mark"}
          </button>
        </div>
        {p.nycLocal && (
          <div className="mt-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Why they&apos;re around</p>
            <div className="flex flex-wrap gap-2">
              {SUMMER_REASONS.map((r) => {
                const on = p.summerReason === r.key;
                return (
                  <button
                    key={r.key}
                    onClick={() => setNycLocal(id, true, r.key)}
                    className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                    style={on ? { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
            {isSummerPriority(p.summerReason) && (
              <p className="mt-2 text-[11px] font-medium text-accent-ink">★ Summer-care priority — make sure {p.firstName} isn&apos;t alone over the break.</p>
            )}
          </div>
        )}
      </Card>

      {/* resting / dormant tier — set someone down for a season without removing them */}
      <Card className="mt-3 p-4">
        {p.dormantAt ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium" style={{ color: "var(--faint)" }}>
                Resting since {relativeDays(p.dormantAt, now)}
              </p>
              {p.dormantReason && <p className="mt-0.5 text-xs text-muted">{p.dormantReason}</p>}
              <p className="mt-0.5 text-[11px] text-faint">Off the Today queue — no follow-up nudges.</p>
            </div>
            <button
              onClick={() => reconnect(id)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Reconnect
            </button>
          </div>
        ) : restOpen ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Rest {p.firstName} for now</p>
            <p className="mb-2 text-xs text-muted">
              They&apos;ll drop off your Today queue until you reconnect — no nudges, still in the roster. Not a removal.
            </p>
            <input
              value={restReason}
              onChange={(e) => setRestReason(e.target.value)}
              placeholder="Why? (optional — e.g. abroad this semester)"
              className="w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => { setDormant(id, restReason); setRestOpen(false); setRestReason(""); }}
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Rest for now
              </button>
              <button onClick={() => { setRestOpen(false); setRestReason(""); }} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setRestOpen(true)} className="text-sm font-medium text-muted underline">
            Rest {p.firstName} for now
          </button>
        )}
      </Card>

      {/* shepherding assist — gated (flag on + pastoral) until legal/data-flow sign-off */}
      {counselEnabled && <CounselPanel personId={id} firstName={p.firstName} />}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-faint">{label}</span>
      {children}
    </label>
  );
}

// Parse a 'YYYY-MM-DD' as a LOCAL date (avoid the UTC off-by-one that
// new Date('2026-07-02') causes in negative-offset timezones).
function fmtDate(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Leader-initiated disciple journeys (New Believer / Assimilation). The response
// capture never auto-labels, so a human enrolls here after they connect. Dry-run
// until texting goes live — we say so honestly rather than implying sends happen.
function JourneysPanel({ personId, firstName, now, decision, igPreferred }: { personId: string; firstName: string; now: Date; decision?: boolean; igPreferred?: boolean }) {
  const [data, setData] = useState<PersonJourneysResult | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stopId, setStopId] = useState<string | null>(null); // which enrolled journey is pending a stop-confirm

  const load = useCallback(() => {
    getPersonJourneysAction(personId)
      .then(setData)
      .catch(() => setData({ enrolled: [], available: [], live: false }));
  }, [personId]);

  useEffect(() => { load(); }, [load]);

  const enroll = async (journeyId: string) => {
    setBusy(journeyId);
    setErr(null);
    try {
      const res = await enrollPersonInJourneyAction(personId, journeyId);
      if (res.ok) {
        setOpen(false);
        load();
      } else if (res.error) {
        setErr(res.error);
      }
    } finally {
      setBusy(null);
    }
  };

  const stop = async (journeyId: string) => {
    setBusy(journeyId);
    try {
      await stopPersonJourneyAction(personId, journeyId);
      setStopId(null);
      load();
    } finally {
      setBusy(null);
    }
  };

  // IG guardrail: journeys are SMS. An Instagram-preferred person handed over a
  // handle, not SMS consent — don't offer SMS journey enrollment at all.
  if (igPreferred) {
    return (
      <Card className="mt-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Follow-up journeys</p>
        <p className="mt-1 text-sm text-muted">
          {firstName} chose Instagram — automated SMS journeys don&apos;t apply. Keep the follow-up personal: DM them and log it as a touch.
        </p>
      </Card>
    );
  }

  // Decision follow-up: this person tapped "I took a step toward Jesus" at Nights.
  // Never auto-enrolled — surface a strong nudge so a human confirms + starts the
  // New Believer journey once they've connected.
  const newBeliever = data?.available.find((j) => /new believer/i.test(j.name));
  const nbEnrolled = data?.enrolled.some((j) => /new believer/i.test(j.name));

  return (
    <Card className="mt-3 p-4">
      {decision && (
        <div className="mb-3 rounded-xl border p-3" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
          <p className="text-sm font-semibold">🙏 Took a step toward Jesus at Nights</p>
          <p className="mt-0.5 text-xs">Reach out personally today — a real conversation first. When it&apos;s a real decision, start the New Believer journey.</p>
          {newBeliever && !nbEnrolled && (
            <button
              onClick={() => enroll(newBeliever.id)}
              disabled={busy !== null}
              className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {busy === newBeliever.id ? "Starting…" : "Start New Believer journey"}
            </button>
          )}
          {nbEnrolled && <p className="mt-1 text-[11px] font-medium">New Believer journey started ✓</p>}
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-wide text-faint">Follow-up journeys</p>
      {err && <p className="mt-2 text-sm text-warn">{err}</p>}
      {data === null ? (
        <p className="mt-2 text-sm text-muted">Loading…</p>
      ) : (
        <>
          {data.enrolled.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {data.enrolled.map((j) => {
                const stoppable = j.status === "active" || j.status === "paused";
                return (
                  <li key={j.journeyId} className="rounded-xl border border-border bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{j.name}</span>
                      <span className="text-[11px] text-faint">
                        {j.status === "active" ? j.stepOf : j.status === "paused" ? "on hold" : j.status}
                      </span>
                    </div>
                    {j.status === "active" && j.nextAt && (
                      <p className="mt-0.5 text-[11px] text-faint">next message {relativeFuture(j.nextAt, now)}</p>
                    )}
                    {stoppable && (
                      <div className="mt-2">
                        {stopId === j.journeyId ? (
                          <span className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-muted">Stop this journey for {firstName}? No more messages.</span>
                            <button onClick={() => stop(j.journeyId)} disabled={busy !== null} className="font-semibold text-red-500 disabled:opacity-50">
                              {busy === j.journeyId ? "Stopping…" : "Stop"}
                            </button>
                            <button onClick={() => setStopId(null)} className="text-muted">Cancel</button>
                          </span>
                        ) : (
                          <button onClick={() => setStopId(j.journeyId)} className="text-[11px] font-medium text-muted underline">
                            Stop this journey
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!data.live && data.enrolled.length > 0 && (
            <p className="mt-2 text-[11px] text-faint">
              Rehearsing — automated messages are queued but not sent yet, until texting goes live.
            </p>
          )}

          {data.available.length === 0 ? (
            data.enrolled.length === 0 && <p className="mt-2 text-sm text-muted">No journeys available.</p>
          ) : open ? (
            <div className="mt-3 flex flex-col gap-2">
              {data.available.map((j) => (
                <div key={j.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm font-medium">{j.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted">{j.blurb}</p>
                  <button
                    onClick={() => enroll(j.id)}
                    disabled={busy !== null}
                    className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    {busy === j.id ? "Starting…" : `Start for ${firstName}`}
                  </button>
                </div>
              ))}
              <button onClick={() => setOpen(false)} className="self-start text-xs font-medium text-muted underline">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setOpen(true)} className="mt-2 text-sm font-medium text-muted underline">
              Start a journey
            </button>
          )}
        </>
      )}
    </Card>
  );
}

// Shepherding assist — coaches the LEADER (never diagnoses the member); member
// content is de-identified server-side before any model call. Gated + pastoral-only.
function CounselPanel({ personId, firstName }: { personId: string; firstName: string }) {
  const [situation, setSituation] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<CounselResult | null>(null);

  const ask = async () => {
    if (situation.trim().length < 10 || busy) return;
    setBusy(true);
    setRes(null);
    try {
      setRes(await getCounselAction(personId, situation));
    } catch {
      setRes({ enabled: true, guidance: null, error: "Not allowed." });
    } finally {
      setBusy(false);
    }
  };

  const g = res?.guidance;
  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-1.5">
        <span aria-hidden>🕊️</span>
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Shepherding help</p>
      </div>
      <p className="mt-1 text-[11px] text-faint">
        Coaches <span className="font-medium">you</span> on how to care for {firstName} — it never diagnoses them, and their name/details are stripped before anything is sent. Beta · pastoral-only.
      </p>
      <textarea
        value={situation}
        onChange={(e) => setSituation(e.target.value)}
        rows={3}
        placeholder="What's going on? Describe what you're seeing and where you feel stuck…"
        className="mt-3 w-full resize-none rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent"
      />
      <button
        onClick={ask}
        disabled={situation.trim().length < 10 || busy}
        className="mt-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {busy ? "Thinking…" : "Get guidance"}
      </button>

      {res?.error && <p className="mt-3 text-sm text-warn">{res.error}</p>}

      {g && (
        <div className="mt-4 flex flex-col gap-3">
          {g.crisis && g.referral && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-500">This may be a crisis — act now</p>
              <p className="mt-1 text-sm">{g.referral}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Sit with these</p>
            <ul className="mt-1 flex flex-col gap-1">
              {g.reflectiveQuestions.map((qn, i) => (
                <li key={i} className="text-sm">• {qn}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">A lens, held gently</p>
            <p className="mt-1 text-sm">{g.lens}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Scripture</p>
            <p className="mt-1 text-sm"><span className="font-medium">{g.scriptureRef}</span> — {g.scriptureWhy}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">Your next step</p>
            <p className="mt-1 text-sm">{g.posture}</p>
          </div>
          {g.escalate && !g.crisis && (
            <div className="rounded-xl border border-warn/40 bg-warn-soft p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-warn">Loop in a pastor</p>
              <p className="mt-1 text-sm">{g.escalationNote || "This may be beyond a hangout leader — bring in Alex or Priya."}</p>
            </div>
          )}
          <p className="text-[11px] text-faint">Guidance, not a verdict. You know {firstName}; trust the Spirit and your own judgment.</p>
        </div>
      )}
    </Card>
  );
}

function NotesPanel({ personId }: { personId: string }) {
  const [notes, setNotes] = useState<PersonNote[] | null>(null);
  const [canAdd, setCanAdd] = useState(false);
  const [body, setBody] = useState("");
  const [on, setOn] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getNotesAction(personId)
      .then((r) => { setNotes(r.notes); setCanAdd(r.canAdd); })
      .catch(() => setNotes([]));
  }, [personId]);

  useEffect(() => {
    load();
    setOn(todayET()); // default the note date to today in Eastern (the ministry's TZ)
  }, [load]);

  const add = async () => {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await addNoteAction(personId, body, on || undefined);
      setBody("");
      load();
    } finally {
      setBusy(false);
    }
  };
  const del = async (noteId: string) => {
    await deleteNoteAction(noteId);
    load();
  };

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-1.5">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">Private notes</p>
      </div>
      <p className="mt-1 text-[11px] text-faint">Only you and pastoral leads (Alex, Priya) can see these.</p>

      {canAdd && (
        <div className="mt-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="What happened in this conversation?"
            className="w-full resize-none rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent"
          />
          <div className="mt-2 flex items-center gap-2">
            <input
              type="date"
              value={on}
              onChange={(e) => setOn(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs text-muted outline-none"
            />
            <button
              onClick={add}
              disabled={!body.trim() || busy}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {busy ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {notes === null ? (
          <li className="text-sm text-muted">Loading…</li>
        ) : notes.length === 0 ? (
          <li className="text-sm text-muted">No notes yet.</li>
        ) : (
          notes.map((n) => (
            <li key={n.id} className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[11px] text-faint">
                  {fmtDate(n.occurredOn)} · {n.authorName}
                </span>
                <button onClick={() => del(n.id)} className="text-[11px] text-faint underline">
                  delete
                </button>
              </div>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function EditPanel({
  p,
  leaders,
  isPastoral,
  onSave,
  onArchive,
}: {
  p: Person;
  leaders: Leader[];
  isPastoral: boolean;
  onSave: (patch: PersonPatch) => void;
  onArchive: (reason: string) => void;
}) {
  const [firstName, setFirstName] = useState(p.firstName);
  const [lastName, setLastName] = useState(p.lastName);
  const [campus, setCampus] = useState<Campus>(p.campus);
  const [gender, setGender] = useState<Gender | "">(p.gender ?? "");
  const [phone, setPhone] = useState(p.phone);
  const [stage, setStage] = useState<Stage>(p.stage);
  const [ownerId, setOwnerId] = useState(p.ownerId ?? "");
  const [instagramHandle, setInstagramHandle] = useState(p.instagramHandle ?? "");
  const [preferredContact, setPreferredContact] = useState<PreferredContact>(p.preferredContact ?? "text");
  const [email, setEmail] = useState(p.email ?? "");
  const [hasCuid, setHasCuid] = useState<boolean | null>(p.hasCuid ?? null);
  const [schoolYear, setSchoolYear] = useState<SchoolYear | "">(p.schoolYear ?? "");
  const [confirmDel, setConfirmDel] = useState(false);
  const [removeReason, setRemoveReason] = useState("");

  return (
    <Card className="mt-4 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">Edit person</p>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Last name">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Campus">
            <select value={campus} onChange={(e) => setCampus(e.target.value as Campus)} className={inputCls}>
              {CAMPUSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Gender">
            <select value={gender} onChange={(e) => setGender(e.target.value as Gender | "")} className={inputCls}>
              <option value="">Unknown / prefer not to say</option>
              {GENDERS.map((g) => (
                <option key={g.key} value={g.key}>{g.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Stage">
            {/* Moving someone to an earlier stage is pastoral-only (also
                server-enforced in updatePersonAction). */}
            <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className={inputCls}>
              {(isPastoral ? STAGES : STAGES.slice(STAGES.indexOf(p.stage))).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Instagram handle">
            <input
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="@handle"
              className={inputCls}
            />
          </Field>
          <Field label="Preferred contact">
            <select value={preferredContact} onChange={(e) => setPreferredContact(e.target.value as PreferredContact)} className={inputCls}>
              {(Object.keys(PREFERRED_CONTACT_META) as PreferredContact[]).map((k) => (
                <option key={k} value={k}>{PREFERRED_CONTACT_META[k].label}</option>
              ))}
            </select>
          </Field>
        </div>
        {preferredContact === "instagram" && (
          <p className="-mt-1 text-[11px] text-faint">
            Instagram isn&apos;t covered by SMS consent or STOP. A handed-over handle = an invite to DM only — this person won&apos;t be texted or added to any SMS journey. Follow up on Instagram and log it as a touch.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" autoCapitalize="none" placeholder="for the campus gate QR" className={inputCls} />
          </Field>
          {/* Columbia is CUID + registered-guests only — no CUID = the Saturday gate list */}
          <Field label="Columbia ID?">
            <select
              value={hasCuid === null ? "" : hasCuid ? "yes" : "no"}
              onChange={(e) => setHasCuid(e.target.value === "" ? null : e.target.value === "yes")}
              className={inputCls}
            >
              <option value="">Unknown</option>
              <option value="yes">Yes — has a CUID</option>
              <option value="no">No — needs gate registration</option>
            </select>
          </Field>
        </div>
        <Field label="School year">
          <select value={schoolYear} onChange={(e) => setSchoolYear(e.target.value as SchoolYear | "")} className={inputCls}>
            <option value="">Unknown</option>
            {SCHOOL_YEARS.map((y) => (
              <option key={y.key} value={y.key}>{y.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Owner (reassign)">
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
            {leaders.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <button
        onClick={() => onSave({ firstName, lastName, campus, gender, phone, stage, ownerId, instagramHandle, preferredContact, email, hasCuid, schoolYear })}
        disabled={!firstName.trim()}
        className="mt-4 w-full rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        Save changes
      </button>

      <div className="mt-3 border-t border-border pt-3">
        {!confirmDel ? (
          <button onClick={() => setConfirmDel(true)} className="text-sm font-medium text-red-500">
            Remove this person
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted">
              Remove {p.firstName}? Reversible — an admin can restore them. Removal is for dupes, wrong entries, opt-outs or graduated. If they&apos;ve just gone quiet, <span className="font-medium">rest</span> them instead.
            </span>
            <input
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
              placeholder="Reason (required — e.g. duplicate of…)"
              className={inputCls}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={() => onArchive(removeReason)}
                disabled={!removeReason.trim()}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Yes, remove
              </button>
              <button onClick={() => { setConfirmDel(false); setRemoveReason(""); }} className="text-sm text-muted">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
