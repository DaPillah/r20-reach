"use client";

// Admin overview — leadership snapshot of the whole pipeline. Visible to the
// oversight tier (admins: Alex, Priya, Dana); Hangout leaders see their own
// Today queue instead. Read-only aggregate of the live roster.
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReach } from "@/lib/store";
import { getEngagementTuningAction, getEventCheckinAggregateAction, getGateListAction, getIgDmListAction, setGateRegisteredThroughAction, getLeadershipPipelineAction, getMovementSnapshotAction, getQaQuestionsAction, getReflectionDigestAction, getRecentCommitmentsAction, getServiceFeedbackAction, getSurveyAggregateAction, getUnansweredReflectionsAction, type EngagementTuning as EngagementTuningData, type EventCheckinAggregate, type GateListRow, type IgDmRow, type LeadershipPipeline, type MovementSnapshot, type PipelineLeader, type QaQuestionRow, type RecentCommitments, type ReflectionDigest, type ServiceFeedbackSummary, type SurveyAggregate, type UnansweredReflection } from "@/app/actions";
import { PendingLogins } from "@/components/pending-logins";
import { eventLabel } from "@/lib/events";
import { daysBetween, relativeDays } from "@/lib/format";
import { computeNudges, computePlacement, DUE_AFTER_DAYS, OVERDUE_AFTER_DAYS } from "@/lib/logic";
import { Card, Eyebrow } from "@/components/ui";
import { instagramProfileUrl, STAGES, STAGE_META, type Campus, type Stage } from "@/lib/types";

const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];

export default function OverviewPage() {
  const { people, leaders, isAdmin, isPastoral, campusLeadOf, ready, setCurrentLeader, eventConfig } = useReach();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);

  // Reflection digest is pastoral-only (Alex/Priya). Ops admins (Dana/Robin)
  // see the ops surfaces of Overview but not leaders' reflection cadence.
  const [reflectByLeader, setReflectByLeader] = useState<ReflectionDigest["perLeader"]>([]);
  useEffect(() => {
    if (!isPastoral) return;
    getReflectionDigestAction()
      .then((d) => setReflectByLeader(d.perLeader))
      .catch(() => {});
  }, [isPastoral]);

  // Unanswered reflections (pastoral only) — the nudge that keeps the loop alive.
  const [unanswered, setUnanswered] = useState<UnansweredReflection[]>([]);
  useEffect(() => {
    if (!isPastoral) return;
    getUnansweredReflectionsAction().then(setUnanswered).catch(() => {});
  }, [isPastoral]);

  // Movement Snapshot (Warren's "evaluate on purpose") — admin-only, aggregate.
  const [movement, setMovement] = useState<MovementSnapshot | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    getMovementSnapshotAction(30).then(setMovement).catch(() => {});
  }, [isAdmin]);

  // Raising & Sending — the leadership pipeline lens (pastoral only).
  const [pipeline, setPipeline] = useState<LeadershipPipeline | null>(null);
  useEffect(() => {
    if (!isPastoral) return;
    getLeadershipPipelineAction().then(setPipeline).catch(() => {});
  }, [isPastoral]);

  // Recent 101/401 commitments (pastoral only) — the coordinator owns /in, but a
  // commitment is a pastoral moment, so it surfaces here as an active prompt.
  const [commitments, setCommitments] = useState<RecentCommitments | null>(null);
  useEffect(() => {
    if (!isPastoral) return;
    getRecentCommitmentsAction(30).then(setCommitments).catch(() => {});
  }, [isPastoral]);

  // Engagement-health TUNING (pastoral only, sanity-check surface — NOT yet shown
  // to leaders). `previewOOS` = show what would flag ignoring quiet season (needed
  // pre-launch/summer when everything is legitimately paused).
  const [engagement, setEngagement] = useState<EngagementTuningData | null>(null);
  const [previewOOS, setPreviewOOS] = useState(false);
  useEffect(() => {
    if (!isPastoral) return;
    getEngagementTuningAction(previewOOS).then(setEngagement).catch(() => {});
  }, [isPastoral, previewOOS]);

  // Service-feedback pulse (admin) — the post-Nights "how was tonight?" read.
  const [feedback, setFeedback] = useState<ServiceFeedbackSummary | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    getServiceFeedbackAction(30).then(setFeedback).catch(() => {});
  }, [isAdmin]);

  // Saturday gate list (admin) — who needs Columbia guest registration this week.
  const [gateList, setGateList] = useState<GateListRow[] | null>(null);
  const loadGateList = useCallback(() => {
    getGateListAction().then(setGateList).catch(() => {});
  }, []);
  useEffect(() => {
    if (!isAdmin) return;
    loadGateList();
  }, [isAdmin, loadGateList]);

  // Saturday DM list (admin) — IG-only warm leads the SMS reminders can't reach.
  const [igDmList, setIgDmList] = useState<IgDmRow[] | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    getIgDmListAction().then(setIgDmList).catch(() => {});
  }, [isAdmin]);

  // 30-Second Survey — the "learn the field" read (pastoral OR admin). All-time
  // pool; the action gates access server-side, so fetch whenever either flag is set.
  const [survey, setSurvey] = useState<SurveyAggregate | null>(null);
  useEffect(() => {
    if (!isPastoral && !isAdmin) return;
    getSurveyAggregateAction().then(setSurvey).catch(() => {});
  }, [isPastoral, isAdmin]);

  // Event sign-ins (/event?e=) — per-event capture counts (pastoral OR admin).
  const [eventCheckins, setEventCheckins] = useState<EventCheckinAggregate | null>(null);
  useEffect(() => {
    if (!isPastoral && !isAdmin) return;
    getEventCheckinAggregateAction().then(setEventCheckins).catch(() => {});
  }, [isPastoral, isAdmin]);

  // Tonight's Q&A stack — read during the food window, taken live after.
  const [qaQuestions, setQaQuestions] = useState<QaQuestionRow[]>([]);
  useEffect(() => {
    if (!isPastoral && !isAdmin) return;
    getQaQuestionsAction().then(setQaQuestions).catch(() => {});
  }, [isPastoral, isAdmin]);

  const openLeaderReview = (id: string) => {
    setCurrentLeader(id);
    router.push("/reflections");
  };

  const openLeaderToday = (id: string) => {
    setCurrentLeader(id);
    router.push("/");
  };

  const stats = useMemo(() => {
    const overdueDays = (lt: string | null) => (lt === null ? Infinity : daysBetween(lt, now));
    const isDue = (lt: string | null) => lt === null || overdueDays(lt) >= DUE_AFTER_DAYS;
    const isOverdue = (lt: string | null) => lt === null || overdueDays(lt) >= OVERDUE_AFTER_DAYS;
    const place = computePlacement(people);
    // Resting (dormant) people are deliberately parked — off the Today queue,
    // no nudges. So they must NOT count toward "need follow-up" / "overdue",
    // or Overview disagrees with every leader's Today ("2 overdue" vs "all
    // caught up"). Follow-up counts run over active (non-resting) people; the
    // roster total and funnel distribution still cover everyone.
    const active = people.filter((p) => !p.dormantAt);
    return {
      total: people.length,
      due: active.filter((p) => isDue(p.lastTouchAt)).length,
      neverContacted: active.filter((p) => p.lastTouchAt === null).length,
      place,
      byStage: STAGES.map((s) => ({ stage: s, n: people.filter((p) => p.stage === s).length })),
      byCampus: CAMPUSES.map((c) => ({ campus: c, n: people.filter((p) => p.campus === c).length })).filter((x) => x.n),
      perLeader: leaders
        .map((l) => {
          const mine = active.filter((p) => p.ownerId === l.id);
          const due = mine.filter((p) => isDue(p.lastTouchAt)).length;
          const overdue = mine.filter((p) => isOverdue(p.lastTouchAt)).length;
          return {
            id: l.id,
            name: l.name,
            assigned: mine.length,
            // The leader's REAL Today-queue size — the same computation their
            // Today page runs (event waves, follow-back checks, due people),
            // so Overview and the leader's own screen always agree.
            queue: computeNudges(mine, now, l.name, l.draftTemplates, eventConfig).length,
            sentToday: mine.filter((p) => p.lastTouchAt !== null && new Date(p.lastTouchAt).toDateString() === now.toDateString()).length,
            onTop: mine.length - due, // touched within DUE_AFTER_DAYS
            dueSoon: due - overdue, // DUE..OVERDUE window
            overdue, // OVERDUE+ days since a touch, or never contacted
          };
        })
        .filter((l) => l.assigned > 0)
        // biggest remaining queue first — who still has the most to do today
        .sort((a, b) => b.queue - a.queue || b.overdue - a.overdue),
    };
  }, [people, leaders, now, eventConfig]);

  if (!ready) return <div className="pt-10 text-center text-muted">Loading…</div>;
  // Admins see the whole pipeline; a campus lead sees a version SCOPED to their
  // campus (the store already limits their `people` to it, so every client-side
  // stat below is campus-scoped for them). Admin-only tools + sections stay hidden.
  if (!isAdmin && !campusLeadOf) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>This overview is for the leadership team.</p>
        <Link href="/" className="mt-2 inline-block text-accent">
          Back to Today
        </Link>
      </div>
    );
  }

  const maxStage = Math.max(1, ...stats.byStage.map((s) => s.n));

  return (
    <div>
      <Eyebrow>Oversight</Eyebrow>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mb-4 text-sm text-muted">{isAdmin ? "The whole R20 pipeline at a glance." : `${campusLeadOf} at a glance — your campus.`}</p>

      {/* Bug triage — admin only (server re-gates). */}
      {isAdmin && (
        <Link href="/bugs" className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
          <span aria-hidden className="text-lg">🐛</span>
          <span className="flex-1 text-sm font-semibold">Bugs</span>
          <span className="text-xs text-faint">what the team reported</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </Link>
      )}

      {/* Org-number inbox — same circle as team texting (server re-gates). */}
      <Link href="/inbox" className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <span aria-hidden className="text-lg">📥</span>
        <span className="flex-1 text-sm font-semibold">Inbox</span>
        <span className="text-xs text-faint">replies to the R20 number</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </Link>

      {/* Team texting — admins, the coordinator, and campus leads (server re-gates). */}
      <Link href="/team" className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <span aria-hidden className="text-lg">📣</span>
        <span className="flex-1 text-sm font-semibold">Message the team</span>
        <span className="text-xs text-faint">text the leaders you pick</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </Link>

      {/* Events — admins, the coordinator, and campus leads (server re-gates). */}
      <Link href="/events" className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <span aria-hidden className="text-lg">🎟️</span>
        <span className="flex-1 text-sm font-semibold">Events</span>
        <span className="text-xs text-faint">RSVP pages + invite texts</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </Link>

      {/* Admin-only tools — a campus lead gets the read-only coverage view below. */}
      {isAdmin && (
        <>
          <Link href="/broadcast" className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            <span aria-hidden className="text-lg">📣</span>
            <span className="flex-1 text-sm font-semibold">Send a broadcast</span>
            <span className="text-xs text-faint">a segment, carefully</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </Link>

          <Link href="/journeys" className="mb-3 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
            <span aria-hidden className="text-lg">🧭</span>
            <span className="flex-1 text-sm font-semibold">Follow-up journeys</span>
            <span className="text-xs text-faint">turn on / hold automated texts</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </Link>


          <PendingLogins />
        </>
      )}

      {/* top-line */}
      <div className="grid grid-cols-3 gap-3">
        <Stat value={stats.total} label="people" tone="ink" />
        <Stat value={stats.due} label="need follow-up" tone="accent" />
        <Stat
          value={`${stats.place.placed}/${stats.place.total}`}
          label="placed in a Hangout"
          tone={stats.place.unplaced.length ? "warn" : "good"}
        />
      </div>

      {/* funnel distribution */}
      <SectionTitle>Funnel</SectionTitle>
      <Card className="p-4">
        <div className="flex flex-col gap-2.5">
          {stats.byStage.map(({ stage, n }) => (
            <div key={stage} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs font-medium" style={{ color: STAGE_META[stage as Stage].color }}>
                {stage}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(n / maxStage) * 100}%`, background: STAGE_META[stage as Stage].color }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* movement snapshot — is the outer engine (reach + placement) working? */}
      {movement && (
        <>
          <SectionTitle>Movement · last {movement.windowDays} days</SectionTitle>
          <Card className="p-4">
            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: "var(--good)" }}>{movement.newPeople}</div>
                <div className="mt-0.5 text-xs text-muted">new people reached</div>
              </div>
              <div>
                <div className="text-2xl font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{movement.advanced}</div>
                <div className="mt-0.5 text-xs text-muted">moved a stage forward</div>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-border pt-3">
              {movement.steps.map((st) => (
                <div key={st.from} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 truncate">
                    <span style={{ color: STAGE_META[st.from].color }}>{st.from}</span>
                    <span className="text-faint"> → {st.to}</span>
                  </span>
                  {movement.bottleneck === st.from && (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
                      bottleneck
                    </span>
                  )}
                  <span className="tabular-nums text-muted">
                    <span className="font-medium text-ink">{st.moved}</span> moved
                  </span>
                  <span className="w-16 text-right tabular-nums text-faint">{st.waiting} waiting</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Reach</p>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <span><span className="font-medium text-ink tabular-nums">{movement.reach.viaInvite}</span> <span className="text-muted">via a personal invite</span></span>
                <span><span className="font-medium text-ink tabular-nums">{movement.reach.direct}</span> <span className="text-muted">direct (QR / ad / walk-up)</span></span>
                <span><span className="font-medium text-ink tabular-nums">{movement.reach.firstTimeGuests}</span> <span className="text-muted">first-timers at Nights</span></span>
                <span><span className="font-medium text-ink tabular-nums">{movement.reach.returned}</span> <span className="text-muted">came back (2nd touch)</span></span>
              </div>
              {movement.reach.bySource.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-[11px] text-faint">By source (?src= on the QR / ad / poster)</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {movement.reach.bySource.map((b) => (
                      <span key={b.src}>
                        <span className="font-medium text-ink tabular-nums">{b.n}</span>{" "}
                        <span className="text-muted">{b.src}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Ministry</p>
              <p className="text-xs text-muted">
                <span className="font-medium text-ink tabular-nums">{movement.ministry.serving}</span> of{" "}
                <span className="tabular-nums">{movement.ministry.eligible}</span> Committed/Core are serving
                <span className="text-faint"> — sending capacity</span>
              </p>
            </div>
            <p className="mt-3 text-[11px] text-faint">
              Aggregate movement only — never a score on any person. Fills in as check-ins and stage changes accrue.
            </p>
          </Card>
        </>
      )}

      {/* per-leader follow-up load — the number that matters day to day is how
          many people are ON each leader's Today queue right now (matches their
          own screen exactly); the touched/due/overdue bar stays as the
          longer-horizon health detail. */}
      <SectionTitle>Left to follow up</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        How many people are on each leader&apos;s Today queue right now, and how many they&apos;ve reached today. Tap a row to open their queue.
      </p>
      <Card className="divide-y divide-border">
        {stats.perLeader.map((l) => {
          const pct = (n: number) => `${(n / l.assigned) * 100}%`;
          return (
            <button
              key={l.id}
              onClick={() => openLeaderToday(l.id)}
              className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-surface-2"
            >
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{l.name}</span>
                <span className="text-xs text-muted">
                  <span className="text-base font-bold" style={{ color: l.queue > 0 ? "var(--accent-ink)" : "var(--good)" }}>{l.queue}</span>
                  {" "}to go
                  {l.sentToday > 0 && <span style={{ color: "var(--good)" }}> · {l.sentToday} sent today</span>}
                </span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2" title={`touched ≤${DUE_AFTER_DAYS}d / due / overdue ${OVERDUE_AFTER_DAYS}d+`}>
                <div style={{ width: pct(l.onTop), background: "var(--good)" }} />
                <div style={{ width: pct(l.dueSoon), background: "var(--warn)" }} />
                <div style={{ width: pct(l.overdue), background: "var(--accent)" }} />
              </div>
            </button>
          );
        })}
      </Card>

      {/* recent 101/401 commitments — pastoral oversight only (Alex/Priya) */}
      {isPastoral && commitments && commitments.items.length > 0 && (
        <RecentCommitmentsSection data={commitments} now={now} onOpen={(id) => router.push(`/person/${id}`)} />
      )}

      {/* unanswered reflections — the pastoral nudge (only when there's a backlog) */}
      {isPastoral && unanswered.length > 0 && (
        <>
          <SectionTitle>Unanswered reflections</SectionTitle>
          <Card className="divide-y divide-border">
            <div className="px-4 py-2 text-[11px] text-faint">
              {unanswered.length} waiting for a reply — oldest first. A reply closes the loop.
            </div>
            {unanswered.map((u) => (
              <button
                key={u.reflectionId}
                onClick={() => openLeaderReview(u.leaderId)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2"
              >
                <span className="flex-1 truncate font-medium">{u.leaderName}</span>
                <span className="text-xs text-muted">{shortDate(u.occurredOn)}</span>
                <span className="w-24 text-right text-xs font-medium" style={{ color: u.ageDays >= 14 ? "var(--warn)" : "var(--muted)" }}>
                  {u.ageDays === 0 ? "today" : `${u.ageDays}d waiting`}
                </span>
              </button>
            ))}
          </Card>
        </>
      )}

      {/* reflections / evaluation — pastoral oversight only (Alex/Priya) */}
      {isPastoral && (
        <>
          <SectionTitle>Reflections</SectionTitle>
          <Card className="divide-y divide-border">
            <div className="flex items-center gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
              <span className="flex-1">Leader</span>
              <span className="w-24 text-right">Last</span>
              <span className="w-20 text-right">This week</span>
            </div>
            {reflectByLeader.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted">No Hangout leaders yet.</p>
            ) : (
              reflectByLeader.map((l) => (
                <button
                  key={l.id}
                  onClick={() => openLeaderReview(l.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-2"
                >
                  <span className="flex-1 truncate font-medium">{l.name}</span>
                  <span className="w-24 text-right text-xs text-muted">{l.lastOn ? shortDate(l.lastOn) : "never"}</span>
                  <span className="w-20 text-right text-xs font-medium" style={{ color: l.thisWeek ? "var(--good)" : "var(--warn)" }}>
                    {l.thisWeek ? "✓ in" : "—"}
                  </span>
                </button>
              ))
            )}
          </Card>
          <p className="mt-1.5 px-1 text-[11px] text-faint">Tap a leader to read their reflections &amp; add growth notes.</p>
        </>
      )}

      {/* raising & sending — leadership pipeline lens, pastoral only */}
      {isPastoral && pipeline && <RaisingSending pipeline={pipeline} onOpen={openLeaderReview} />}

      {/* engagement-health tuning — pastoral only, sanity-check surface */}
      {isPastoral && engagement && (
        <EngagementTuning data={engagement} preview={previewOOS} onTogglePreview={() => setPreviewOOS((v) => !v)} onOpen={(id) => router.push(`/person/${id}`)} />
      )}

      {/* service-feedback pulse — admin, post-Nights sentiment */}
      {isAdmin && feedback && <ServicePulse data={feedback} />}

      {/* Saturday gate list — Columbia guest registration (admin) */}
      {isAdmin && gateList && gateList.length > 0 && <GateList rows={gateList} onChanged={loadGateList} />}

      {/* Saturday DM list — IG-only warm leads, DMed by hand (admin) */}
      {isAdmin && igDmList && igDmList.length > 0 && <IgDmList rows={igDmList} />}

      {/* 30-second survey — the "learn the field" read (pastoral OR admin) */}
      {(isPastoral || isAdmin) && survey && survey.total > 0 && <SurveyListening data={survey} />}

      {/* Tonight's Q&A stack — the moderator reads this during the food window */}
      {(isPastoral || isAdmin) && qaQuestions.length > 0 && (
        <>
          <SectionTitle>Tonight&apos;s Q&amp;A stack</SectionTitle>
          <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
            {qaQuestions.length} question{qaQuestions.length === 1 ? "" : "s"} texted in (last 36h), oldest first. Read during food; take them live. No name = read it anonymously.
          </p>
          <Card className="p-4">
            <ol className="flex flex-col gap-3">
              {qaQuestions.map((qq, i) => (
                <li key={qq.id} className="flex gap-2.5 text-sm leading-relaxed">
                  <span className="shrink-0 font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{i + 1}</span>
                  <span>
                    {qq.body}
                    <span className="ml-2 text-[11px] text-faint">{qq.firstName ? `— ${qq.firstName}` : "— anonymous"}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}

      {/* Event sign-ins — did the events actually capture? (pastoral OR admin) */}
      {(isPastoral || isAdmin) && eventCheckins && eventCheckins.total > 0 && <EventCheckins data={eventCheckins} />}

      {/* by campus */}
      <SectionTitle>By campus</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {stats.byCampus.map(({ campus, n }) => (
          <Card key={campus} className="flex items-center justify-between p-4">
            <span className="text-sm font-medium">{campus}</span>
            <span className="text-lg font-semibold tabular-nums">{n}</span>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone: "ink" | "accent" | "warn" | "good" }) {
  const color =
    tone === "accent" ? "var(--accent)" : tone === "warn" ? "var(--warn)" : tone === "good" ? "var(--good)" : "var(--ink)";
  return (
    <Card className="p-4">
      <div className="text-2xl font-semibold tracking-tight tabular-nums" style={{ color }}>{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-faint">{children}</h2>;
}

// ── 30-Second Survey — pooled "learn the field" themes (pastoral / admin) ─────
// Counts per option for Q1 (identity) + the Q2 spiritual-openness average, plus the
// free-text "Other" answers. Anonymous by design — themes for sermon/bridge prep,
// never who-said-what. Bars are shares of the top option in each question.
function SurveyBars({ label, options }: { label: string; options: SurveyAggregate["q1"] }) {
  const max = Math.max(1, ...options.map((o) => o.n));
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-faint">{label}</p>
      <Card className="flex flex-col gap-2 p-4">
        {options.map((o) => (
          <div key={o.key} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate text-xs" title={o.label}>{o.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
              <div className="h-full rounded-full" style={{ width: `${(o.n / max) * 100}%`, background: "var(--accent)" }} />
            </div>
            <span className="w-6 text-right text-xs tabular-nums text-muted">{o.n}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// Per-event sign-in counts — the capture read beside the physical wristband count.
function EventCheckins({ data }: { data: EventCheckinAggregate }) {
  return (
    <>
      <SectionTitle>Event sign-ins</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        {data.total} sign-in{data.total === 1 ? "" : "s"} across {data.events.length} event{data.events.length === 1 ? "" : "s"} — every one landed as a contact. Compare against the wristband count to see the capture rate.
      </p>
      <Card className="p-4">
        <div className="flex flex-col gap-2">
          {data.events.map((e) => (
            <div key={e.slug} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{eventLabel(e.slug)}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  <span className="font-semibold" style={{ color: "var(--accent)" }}>{e.n}</span>
                  {" · "}{new Date(e.last).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              </div>
              {e.details.length > 0 && (
                <div className="ml-3 flex flex-col gap-0.5 border-l pl-2" style={{ borderColor: "var(--border)" }}>
                  {e.details.map((d, i) => (
                    <p key={i} className="text-[11px] leading-snug text-faint">
                      <span className="font-medium text-muted">{d.name}</span> — {d.detail}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function SurveyListening({ data }: { data: SurveyAggregate }) {
  const others = [
    ...data.others.excited.map((t) => ({ q: "Excited", t })),
    ...data.others.identity.map((t) => ({ q: "Identity", t })),
    ...data.others.q3.map((t) => ({ q: "Q3", t })),
    ...data.others.q4a.map((t) => ({ q: "Q4a", t })),
    ...data.others.q4b.map((t) => ({ q: "Q4b", t })),
  ];
  // Legacy v1 questions (retired from the form) — show only while they hold data.
  const hasAny = (opts: SurveyAggregate["q1"]) => opts.some((o) => o.n > 0);
  return (
    <>
      <SectionTitle>What the field is telling us</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        Pooled 30-second survey ({data.total} response{data.total === 1 ? "" : "s"}
        {data.windowDays ? `, last ${data.windowDays} days` : ", all time"}
        {data.withContact > 0 && <> · {data.withContact} opted in with contact</>}). Anonymous — themes for sermon/bridge prep.
        {data.surveyors.length > 0 && (
          <> {" · by "}{data.surveyors.map((s) => `${s.name} (${s.n})`).join(" · ")}</>
        )}
      </p>
      <div className="flex flex-col gap-4">
        <SurveyBars label="What people are most excited about this year" options={data.excited} />
        {hasAny(data.identity) && <SurveyBars label="v2 · Biggest source of identity for people their age (retired)" options={data.identity} />}
        {data.q2.n > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-faint">v2 · How much the spiritual side matters, 1–10 (retired)</p>
            <Card className="p-4">
              <div className="mb-2 text-sm">
                {data.q2.avg !== null ? <><span className="text-lg font-semibold tabular-nums" style={{ color: "var(--accent)" }}>{data.q2.avg.toFixed(1)}</span> <span className="text-xs text-muted">avg · {data.q2.n} answered</span></> : <span className="text-xs text-muted">no answers yet</span>}
              </div>
              <div className="flex items-end gap-1" style={{ height: 40 }}>
                {data.q2.dist.map((d) => {
                  const maxN = Math.max(1, ...data.q2.dist.map((x) => x.n));
                  return (
                    <div key={d.score} className="flex flex-1 flex-col items-center gap-1">
                      <div className="w-full rounded-t" style={{ height: `${(d.n / maxN) * 30}px`, minHeight: d.n ? 2 : 0, background: "var(--accent)" }} />
                      <span className="text-[9px] tabular-nums text-faint">{d.score}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}
        {hasAny(data.q1) && <SurveyBars label="v1 · What matters most to experience in college (retired)" options={data.q1} />}
        {hasAny(data.q3) && <SurveyBars label="v1 · Why people our age have written off religion (retired)" options={data.q3} />}
        {hasAny(data.q4a) && <SurveyBars label="v1 · What would make it worth their time (retired)" options={data.q4a} />}
        {hasAny(data.q4b) && <SurveyBars label="v1 · Instant turn-offs (retired)" options={data.q4b} />}
        {others.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-faint">Free-text &ldquo;Other&rdquo; answers ({others.length})</p>
            <Card className="divide-y divide-border">
              {others.slice(0, 40).map((o, i) => (
                <div key={i} className="px-4 py-2.5 text-sm">
                  <span className="mr-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--accent)" }}>{o.q}</span>
                  {o.t}
                </div>
              ))}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}

function shortDate(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Recent commitments (101 "I'm In" / 401 "I'm Sent", pastoral only) ────────
// A pastor's active prompt to personally welcome / send off someone who committed
// at a class close. The coordinator owns the logistics (group-chat add); this is
// the relational half. "not reached yet" = no leader has logged a touch since it.
function RecentCommitmentsSection({ data, now, onOpen }: { data: RecentCommitments; now: Date; onOpen: (id: string) => void }) {
  return (
    <>
      <SectionTitle>Recent commitments · last {data.windowDays} days</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        Someone stepped in at 101 (“I’m In”) or was sent at 401 (“I’m Sent”). The coordinator handles the group chat — this is your prompt to reach out personally.
      </p>
      <Card className="divide-y divide-border">
        {data.items.map((c) => (
          <button key={`${c.personId}-${c.at}`} onClick={() => onOpen(c.personId)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2">
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={c.kind === "sent"
                ? { background: "var(--accent-soft)", color: "var(--gold)" }
                : { background: "var(--surface-2)", color: "var(--accent-ink)" }}
            >
              {c.kind === "sent" ? "🕊 Sent · 401" : "🚪 In · 101"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{c.name}</span>
              <span className="block text-[11px] text-faint">
                {[c.campus, relativeDays(c.at, now), c.ownerName ? `owner: ${c.ownerName}` : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            {!c.touched && <span className="shrink-0 text-[11px] font-medium" style={{ color: "var(--warn)" }}>not reached yet</span>}
          </button>
        ))}
      </Card>
    </>
  );
}

// ── Raising & Sending (leadership pipeline lens, pastoral only) ──────────────
// Arranges leaders by the ladder rung the PASTOR already set — never scores or
// ranks. Prose + soft signals only. See SUCCESSION.md for the full rationale.
const LADDER_LABEL: Record<string, string> = { sending: "Ready to send / plant", raising: "Raising an apprentice", leading: "Leading it" };
const DIM_LABEL: Record<string, string> = {
  warmth: "Warmth", shepherding: "Shepherding", facilitation: "Facilitation",
  safe_room: "Safe room", outreach: "Outreach", multiplication: "Raising",
};
const MARKER_COLOR: Record<string, string> = { growing: "var(--good)", steady: "var(--muted)", stretch: "var(--warn)" };

function cadence(l: PipelineLeader): string {
  if (l.reflectedThisWeek) return "reflecting this week";
  if (l.lastReflectionOn) return `last reflected ${shortDate(l.lastReflectionOn)}`;
  return "hasn't reflected yet";
}

function RaisingSending({ pipeline, onOpen }: { pipeline: LeadershipPipeline; onOpen: (id: string) => void }) {
  const groups: { key: string; label: string; leaders: PipelineLeader[] }[] = [
    { key: "sending", label: LADDER_LABEL.sending, leaders: pipeline.leaders.filter((l) => l.ladder === "sending") },
    { key: "raising", label: LADDER_LABEL.raising, leaders: pipeline.leaders.filter((l) => l.ladder === "raising") },
    { key: "leading", label: LADDER_LABEL.leading, leaders: pipeline.leaders.filter((l) => l.ladder === "leading") },
    { key: "unplaced", label: "Not yet placed on the ladder", leaders: pipeline.leaders.filter((l) => !l.ladder) },
  ].filter((g) => g.leaders.length > 0);

  return (
    <>
      <SectionTitle>Raising &amp; Sending</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        Who could you pour into this term? Look for the faithful and the overlooked, not just the obvious — and develop many, not one.
        This arranges the leaders by where you&apos;ve placed them on the ladder ({pipeline.term}). It&apos;s discernment, never a score.
      </p>
      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.key}>
            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: g.key === "unplaced" ? "var(--faint)" : "var(--gold)" }}>
              {g.label} · {g.leaders.length}
            </p>
            <Card className="divide-y divide-border">
              {g.leaders.map((l) => (
                <button key={l.id} onClick={() => onOpen(l.id)} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-surface-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-[11px] text-faint">{l.rosterSize > 0 ? `~${l.rosterSize} in their Hangout` : "no roster yet"}</span>
                  </div>
                  {l.overallNote && <p className="text-xs leading-relaxed text-muted">{l.overallNote}</p>}
                  {l.apprentices.length > 0 && (
                    <p className="text-xs leading-relaxed" style={{ color: "var(--accent-ink)" }}>
                      <span className="font-medium">Raising:</span> {l.apprentices.join(", ")}
                    </p>
                  )}
                  {l.raising && <p className="text-xs leading-relaxed text-muted">{l.raising}</p>}
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-0.5">
                    <span className="text-[11px] text-faint">{cadence(l)}</span>
                    {l.markers.map((m) => (
                      <span key={m.dimension} className="text-[11px]" style={{ color: MARKER_COLOR[m.marker] }}>
                        {DIM_LABEL[m.dimension]} {m.marker}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </Card>
          </div>
        ))}
      </div>
      <p className="mt-1.5 px-1 text-[11px] text-faint">Tap a leader to open their growth review. Set the ladder there — pastoral only; leaders never see this.</p>
    </>
  );
}

// ── Engagement signal (TUNING, pastoral only) ────────────────────────────────
// The silent layer's eyeball surface — NOT the leader-facing product. Lets Alex
// sanity-check what the drift signal WOULD flag against people he knows before any
// of it becomes visible to leaders. Shows the internal sort key on purpose (this
// is a tuning view; the eventual leader UI never shows a number on a person).
function FlagTag({ label, tone }: { label: string; tone: string }) {
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: tone, border: `1px solid ${tone}33` }}>
      {label}
    </span>
  );
}

// ── Service-feedback pulse (admin) — post-Nights sentiment ───────────────────
const PULSE_META: Record<number, { label: string; glyph: string; color: string }> = {
  1: { label: "Rough", glyph: "😕", color: "var(--warn)" },
  2: { label: "Okay", glyph: "😐", color: "var(--muted)" },
  3: { label: "Good", glyph: "🙂", color: "var(--good)" },
  4: { label: "Great", glyph: "🔥", color: "var(--gold)" },
};

// The Saturday gate list — Columbia's Morningside campus is CUID + registered
// guests only, so everyone here needs a guest registration for Saturday: a
// Columbia affiliate submits the list via the guest portal (groups >2 due by
// 5 PM FRIDAY; each guest gets a one-day QR by email; ID must match the name).
function GateList({ rows, onChanged }: { rows: GateListRow[]; onChanged: () => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  // The Saturday this list is FOR: today if it's Saturday, else the next one.
  const upcomingSat = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);
  const [coverThrough, setCoverThrough] = useState(upcomingSat);
  // Covered = a multi-day portal batch already reaches the upcoming Saturday.
  const needsAction = rows.filter((r) => !r.registeredThrough || r.registeredThrough < upcomingSat);
  const covered = rows.filter((r) => r.registeredThrough && r.registeredThrough >= upcomingSat);
  const newIntents = needsAction.filter((r) => r.isNewIntent);
  const regulars = needsAction.filter((r) => !r.isNewIntent);
  const missingEmail = needsAction.filter((r) => !r.email).length;
  const copy = () => {
    const line = (r: GateListRow) => `${`${r.firstName} ${r.lastName}`.trim()}\t${r.email ?? "NO EMAIL"}`;
    navigator.clipboard
      .writeText(needsAction.map(line).join("\n"))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };
  const markCovered = async () => {
    if (busy || needsAction.length === 0 || !coverThrough) return;
    setBusy(true);
    try {
      await setGateRegisteredThroughAction(needsAction.map((r) => r.personId), coverThrough);
      onChanged();
    } finally { setBusy(false); }
  };
  const clearOne = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await setGateRegisteredThroughAction([id], null);
      onChanged();
    } finally { setBusy(false); }
  };
  const Row = ({ r }: { r: GateListRow }) => (
    <Link href={`/person/${r.personId}`} className="flex items-center justify-between gap-2 px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {r.firstName} {r.lastName}
          {!r.lastName && <span className="text-warn"> · last name?</span>}
        </span>
        <span className="block truncate text-xs text-muted">
          {r.campus}
          {r.email ? ` · ${r.email}` : ""}
          {!r.email && <span className="text-warn"> · ⚠ no email — QR can&apos;t be sent</span>}
        </span>
      </span>
      <span className="shrink-0 text-[11px] text-faint">{r.hasCuid === false ? "no CUID" : "unknown"}</span>
    </Link>
  );
  return (
    <>
      <SectionTitle>Saturday gate list · {needsAction.length} to register</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        Everyone who needs Columbia guest registration for <b className="text-ink">Saturday {upcomingSat}</b>. A Columbia student/staff affiliate submits these in the guest portal — <b className="text-ink">groups over 2 are due by 5 PM Friday</b>; each guest gets a one-day QR by email and shows a matching ID. Gates for guests: 116th &amp; Broadway · 116th &amp; Amsterdam · Wien. The portal takes multi-day batches — register regulars weeks ahead, then mark them covered below.
        {missingEmail > 0 && <span className="text-warn"> {missingEmail} missing an email — chase those first.</span>}
      </p>
      {needsAction.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button onClick={copy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
            {copied ? "Copied ✓" : "Copy list (name + email)"}
          </button>
          <span className="text-[11px] text-faint">after submitting, mark covered through</span>
          <input
            type="date"
            value={coverThrough}
            min={upcomingSat}
            onChange={(e) => setCoverThrough(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-muted outline-none"
          />
          <button
            onClick={markCovered}
            disabled={busy || !coverThrough}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Saving…" : `Mark ${needsAction.length} covered`}
          </button>
        </div>
      )}
      <Card className="divide-y divide-border">
        {needsAction.length === 0 && (
          <p className="px-4 py-3 text-sm text-muted">Everyone&apos;s covered for Saturday {upcomingSat} — nothing to submit. 🎉</p>
        )}
        {newIntents.length > 0 && (
          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">Said they&apos;re coming</p>
        )}
        {newIntents.map((r) => <Row key={r.personId} r={r} />)}
        {regulars.length > 0 && (
          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">Non-Columbia regulars</p>
        )}
        {regulars.map((r) => <Row key={r.personId} r={r} />)}
        {covered.length > 0 && (
          <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">Covered ({covered.length}) — resurface when their date passes</p>
        )}
        {covered.map((r) => (
          <div key={r.personId} className="flex items-center justify-between gap-2 px-4 py-2 opacity-70">
            <Link href={`/person/${r.personId}`} className="min-w-0 flex-1 truncate text-sm">
              {r.firstName} {r.lastName} <span className="text-xs text-faint">· through {r.registeredThrough}</span>
            </Link>
            <button onClick={() => clearOne(r.personId)} disabled={busy} className="shrink-0 text-[11px] text-muted underline">
              clear
            </button>
          </div>
        ))}
      </Card>
    </>
  );
}

// IG-only "wants to come" leads get no SMS by design (an IG opt-in is consent
// to a DM, not a text) — so the Come to Nights reminders never reach them. This
// is their manual counterpart: the coordinator DMs each by hand on Saturday.
const IG_SURFACE_LABEL: Record<string, string> = {
  survey: "survey opt-in",
  event_checkin: "event sign-in",
  linktree_visit: "wants to come",
};

function IgDmList({ rows }: { rows: IgDmRow[] }) {
  const [copied, setCopied] = useState(false);
  // A touch in the last 7 days = a human is already on them (the same signal
  // that pauses the SMS journey via skip_if_touched) — shown, not hidden.
  const touchedRecently = (r: IgDmRow) =>
    Boolean(r.lastTouchAt && daysBetween(r.lastTouchAt, new Date()) < 7);
  const toDm = rows.filter((r) => !touchedRecently(r));
  const copy = () => {
    navigator.clipboard
      .writeText(toDm.map((r) => `${r.firstName} — @${r.instagramHandle}`).join("\n"))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  };
  return (
    <>
      <SectionTitle>Saturday DM list · {toDm.length} to invite</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        IG-only warm leads — they asked to hear from us on Instagram, so the text reminders never touch them. <b className="text-ink">DM each one personally about tonight</b>: paced, one at a time, in your own words — never a paste-blast. Captures age off after four Saturdays.
      </p>
      {toDm.length > 0 && (
        <div className="mb-2">
          <button onClick={copy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted">
            {copied ? "Copied ✓" : "Copy list (name + handle)"}
          </button>
        </div>
      )}
      <Card className="divide-y divide-border p-0">
        {rows.map((r) => {
          const touched = touchedRecently(r);
          const igUrl = instagramProfileUrl(r.instagramHandle);
          return (
            <div key={r.personId} className={`flex items-center justify-between gap-2 px-4 py-2.5${touched ? " opacity-60" : ""}`}>
              <Link href={`/person/${r.personId}`} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{r.firstName}</span>
                <span className="block truncate text-xs text-muted">
                  {r.campus ?? "campus unknown"}
                  {" · "}{IG_SURFACE_LABEL[r.captureSurface ?? ""] ?? "cold capture"}
                  {" · "}{relativeDays(r.createdAt, new Date())}
                  {touched && r.lastTouchAt && <span className="text-faint"> · touched {relativeDays(r.lastTouchAt, new Date())} — likely covered</span>}
                </span>
              </Link>
              {igUrl && (
                <a href={igUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-medium underline" style={{ color: "var(--accent)" }}>
                  @{r.instagramHandle}
                </a>
              )}
            </div>
          );
        })}
      </Card>
    </>
  );
}

function ServicePulse({ data }: { data: ServiceFeedbackSummary }) {
  const maxN = Math.max(1, ...data.dist.map((d) => d.n));
  // A left-behind number deserves surfacing even without a comment (rating-only
  // submits) — someone asking for a text back should never be invisible.
  const withComments = data.recent.filter((r) => r.comment || r.phone);
  return (
    <>
      <SectionTitle>How Nights are landing</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        The anonymous &ldquo;how was tonight?&rdquo; pulse from the /hi card, last {data.windowDays} days. {data.total} response{data.total === 1 ? "" : "s"}
        {data.avg !== null && <> · avg {data.avg.toFixed(1)}/4</>}.
      </p>
      {data.total === 0 ? (
        <Card className="p-4 text-xs text-muted">No pulses yet. They&apos;ll show here as people tap &ldquo;How was tonight?&rdquo; on the /hi card.</Card>
      ) : (
        <>
          <Card className="flex flex-col gap-2 p-4">
            {data.dist.slice().reverse().map((d) => {
              const m = PULSE_META[d.rating];
              return (
                <div key={d.rating} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs" style={{ color: m.color }}>{m.glyph} {m.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(d.n / maxN) * 100}%`, background: m.color }} />
                  </div>
                  <span className="w-6 text-right text-xs tabular-nums text-muted">{d.n}</span>
                </div>
              );
            })}
          </Card>
          {withComments.length > 0 && (
            <Card className="mt-3 divide-y divide-border">
              {withComments.slice(0, 12).map((r) => (
                <div key={r.id} className="px-4 py-3">
                  {r.comment && <p className="text-sm leading-relaxed">{r.comment}</p>}
                  <p className="mt-1 text-[11px] text-faint">
                    {r.rating ? `${PULSE_META[r.rating].glyph} ${PULSE_META[r.rating].label} · ` : ""}{r.firstName ? `${r.firstName} · ` : ""}{shortDate(r.at)}{r.src ? ` · ${r.src}` : ""}
                    {r.phone && (
                      <>
                        {" · "}
                        <a href={`sms:${r.phone}`} className="font-medium underline" style={{ color: "var(--accent)" }}>
                          text back {r.phone}
                        </a>
                      </>
                    )}
                  </p>
                </div>
              ))}
            </Card>
          )}
        </>
      )}
    </>
  );
}

function EngagementTuning({
  data,
  preview,
  onTogglePreview,
  onOpen,
}: {
  data: EngagementTuningData;
  preview: boolean;
  onTogglePreview: () => void;
  onOpen: (id: string) => void;
}) {
  const allQuiet = data.quietByCampus.every((c) => c.quiet);
  return (
    <>
      <SectionTitle>Engagement signal · tuning</SectionTitle>
      <p className="mb-2 -mt-1 px-1 text-[11px] text-faint">
        A private sanity-check of who might be quietly cooling off — <b>not yet shown to leaders</b>. It reads your logged
        touches + Hangout attendance. We&apos;re watching whether it matches the people you already know before it goes live.
        Never a score on a soul — the number here is just an internal sort for this tuning view.
      </p>

      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm">
            {preview ? (
              <><span className="font-semibold tabular-nums">{data.wouldFlag}</span> would flag <span className="text-faint">(ignoring quiet season)</span></>
            ) : (
              <><span className="font-semibold tabular-nums">{data.liveFlagged}</span> flagged right now</>
            )}
          </span>
          <button onClick={onTogglePreview} className="rounded-md border border-border px-2 py-1 text-[11px] hover:bg-surface-2">
            {preview ? "Show live" : "Preview ignoring quiet season"}
          </button>
        </div>
        {allQuiet && !preview && (
          <p className="text-[11px] leading-relaxed text-muted">
            All campuses are in a <b>quiet season</b> right now ({data.quietByCampus.map((c) => `${c.campus}: ${c.kind ?? "term"}`).join(" · ")}),
            so drift flags are paused — exactly as designed (silence over summer/breaks/finals isn&apos;t drift). Tap
            <b> Preview</b> to see the logic firing on real data out of season.
          </p>
        )}
      </Card>

      {data.rows.length > 0 && (
        <Card className="mt-3 divide-y divide-border">
          {data.rows.map((r) => (
            <button key={r.personId} onClick={() => onOpen(r.personId)} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-surface-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{r.name}</span>
                <span className="text-[11px] text-faint tabular-nums">key {r.sortKey}{r.paused && preview ? " · paused live" : ""}</span>
              </div>
              <p className="text-xs leading-relaxed text-muted">{r.cue}</p>
              {r.reasons.length > 1 && <p className="text-[11px] leading-relaxed text-faint">{r.reasons.slice(1).join(" · ")}</p>}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-faint">{[r.campus, r.stage, r.ownerName ? `owner: ${r.ownerName}` : "no owner"].filter(Boolean).join(" · ")}</span>
                {r.cooling && <FlagTag label="cooling" tone="var(--warn)" />}
                {r.campusLimbo && <FlagTag label="campus limbo" tone="var(--accent)" />}
                {r.backwardMove && <FlagTag label="suggest move-back" tone="var(--warn)" />}
              </div>
            </button>
          ))}
        </Card>
      )}
    </>
  );
}
