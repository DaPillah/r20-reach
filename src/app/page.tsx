"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { getMyOutreachAction, getReflectionDigestAction, type OutreachRow } from "@/app/actions";
import { cameVia, computeNudges, computePlacement, restingPeople } from "@/lib/logic";
import { greeting, longDate, relativeDays, smsHref } from "@/lib/format";
import { Avatar, CampusBadge, Card, StageChip } from "@/components/ui";
import { instagramProfileUrl, STAGE_META, TOUCH_META, type TouchType } from "@/lib/types";

// What "Log" offers when you didn't just text them — so a check-in isn't
// silently recorded as "Met up" when it was a call, a DM, or a prayer.
const LOG_TYPES: TouchType[] = ["in_person", "call", "instagram_dm", "prayer", "invite", "text"];

export default function TodayPage() {
  const { people, coverages, logTouch, currentLeaderId, leaderName, leaders, setCurrentLeader, isAdmin, campusLeadOf, viewingOther, authedName, authedId, eventConfig } = useReach();
  const now = useMemo(() => new Date(), []);
  const leader = leaderName(currentLeaderId);
  const viewedMember = leaders.find((l) => l.id === currentLeaderId);
  // Reflections apply to Bible Hangout leaders only — admins (Alex/Priya/
  // Dana/Robin) don't lead one, so they get no "reflect this week" nag.
  const leadsHangout = viewedMember?.role === "leader";

  // People this leader is covering for someone else this season — they don't own
  // them, but their Today queue includes owned + covered.
  const covering = useMemo(
    () => coverages.filter((c) => c.coveringId === currentLeaderId),
    [coverages, currentLeaderId],
  );
  const owned = useMemo(() => {
    const coveredIds = new Set(covering.map((c) => c.coveredId));
    return people.filter((p) => p.ownerId === currentLeaderId || (!!p.ownerId && coveredIds.has(p.ownerId)));
  }, [people, currentLeaderId, covering]);
  const place = useMemo(() => computePlacement(owned), [owned]);

  const [snoozed, setSnoozed] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Which card's "Log" type-picker is open (so a check-in records the real
  // touch type instead of always defaulting to "Met up").
  const [logFor, setLogFor] = useState<string | null>(null);

  // One-time "start here" welcome for first-time users → points to the guide.
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem("r20.welcomed")) setShowWelcome(true); } catch { /* ignore */ }
  }, []);
  const dismissWelcome = () => {
    setShowWelcome(false);
    try { localStorage.setItem("r20.welcomed", "1"); } catch { /* ignore */ }
  };

  const nudges = useMemo(() => {
    const all = computeNudges(owned, now, leader, viewedMember?.draftTemplates, eventConfig).filter((n) => !snoozed.has(n.personId));
    // Float the active event push (game night, etc.) to the top as the first
    // group leaders see, keeping each group's own order stable.
    return [...all.filter((n) => n.eventSlug), ...all.filter((n) => !n.eventSlug)];
  }, [owned, now, leader, viewedMember?.draftTemplates, eventConfig, snoozed]);

  // Owned people hidden from the active queue only because they were texted in
  // the last few days — so a leader can still see everyone they own (incl. those
  // another leader texted), read-only, without the queue re-prompting a send.
  const restingList = useMemo(
    () => restingPeople(owned, now, new Set(nudges.map((n) => n.personId))),
    [owned, now, nudges],
  );

  const snooze = (id: string) => setSnoozed((s) => new Set(s).add(id));

  const [reflectedThisWeek, setReflectedThisWeek] = useState<boolean | null>(null);
  useEffect(() => {
    if (!currentLeaderId || !leadsHangout) return;
    getReflectionDigestAction(currentLeaderId)
      .then((d) => setReflectedThisWeek(d.myThisWeek))
      .catch(() => {});
  }, [currentLeaderId, leadsHangout]);

  // The flip side of the follow-up queue: who this leader HAS reached lately.
  // Follows the "view as" picker like the reflection digest does.
  const [outreach, setOutreach] = useState<OutreachRow[] | null>(null);
  useEffect(() => {
    if (!currentLeaderId) return;
    getMyOutreachAction(currentLeaderId, 7).then(setOutreach).catch(() => {});
  }, [currentLeaderId]);

  return (
    <div>
      {showWelcome && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-border p-3.5" style={{ background: "var(--accent-soft)" }}>
          <span aria-hidden className="text-lg">👋</span>
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold text-accent-ink">New here?</span>{" "}
            <span className="text-muted">Oikos takes ~5 minutes a day — this list is your plan. Here&apos;s the 60-second guide.</span>
            <div className="mt-2 flex gap-3">
              <Link href="/guide" onClick={dismissWelcome} className="font-semibold underline" style={{ color: "var(--accent)" }}>Open the guide</Link>
              <button onClick={dismissWelcome} className="text-muted underline">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <header className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted" suppressHydrationWarning>
            {greeting(now)}, {leader}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight" suppressHydrationWarning>
            {longDate(now)}
          </h1>
        </div>
        {(isAdmin || !!campusLeadOf) && leaders.length > 1 && (
          <select
            aria-label="Viewing as"
            value={currentLeaderId}
            onChange={(e) => setCurrentLeader(e.target.value)}
            className="mt-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-muted outline-none"
          >
            {/* A campus lead's snapshot only holds her campus, so the picker
                self-scopes to her team: leaders whose people she can't see
                would show an empty queue — drop them from her list. */}
            {leaders
              .filter((l) => isAdmin || l.id === authedId || people.some((pp) => pp.ownerId === l.id))
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        )}
      </header>

      {viewingOther && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-xs" style={{ background: "var(--surface-2)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="3"/><path d="M12 5c-5 0-9 4.5-9 7s4 7 9 7 9-4.5 9-7-4-7-9-7"/></svg>
          <span className="text-muted">
            Viewing <span className="font-semibold">{leader}</span>&apos;s queue — <span className="font-medium">read-only</span>. Only {leader} can log their own check-ins. Switch back to{" "}
            <button onClick={() => setCurrentLeader(authedId)} className="font-semibold underline" style={{ color: "var(--accent)" }}>{authedName}</button> to act.
          </span>
        </div>
      )}

      {covering.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-border px-3 py-2.5 text-xs" style={{ background: "var(--surface-2)" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><path d="M20 6 9 17l-5-5"/></svg>
          <span className="text-muted">
            You&apos;re covering{" "}
            <span className="font-semibold">{covering.map((c) => c.coveredName).join(", ")}</span>
            &apos;s people this season — they&apos;re in your queue below.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Stat
          value={nudges.length}
          label={nudges.length === 1 ? "follow-up due" : "follow-ups due"}
          tone="accent"
        />
        <Stat
          value={`${place.placed}/${place.total}`}
          label={place.unplaced.length ? `${place.unplaced.length} not in a Hangout` : "all placed"}
          tone={place.unplaced.length ? "warn" : "good"}
        />
      </div>

      {leadsHangout && reflectedThisWeek === false && (
        <Link href="/reflections" className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
              <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Reflect on this week&apos;s Hangout</span>
            <span className="block text-xs text-muted">Who came, a key moment, who to follow up with — takes five minutes.</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </Link>
      )}
      {leadsHangout && reflectedThisWeek === true && (
        <p className="mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--good-soft)", color: "var(--good)" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          This week&apos;s reflection is in — well shepherded.
        </p>
      )}

      <div className="mb-2 mt-6 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
          Your follow-ups
        </h2>
        <span className="text-[11px] text-faint">sends from your phone</span>
      </div>

      {nudges.length === 0 ? (
        <CaughtUp />
      ) : (
        <ul className="flex flex-col gap-3">
          {nudges.map((n) => {
            const p = people.find((x) => x.id === n.personId)!;
            const body = drafts[n.personId] ?? n.draft;
            // Reach out on the channel they chose: Instagram-preferred (or IG-only,
            // no phone) → DM; everyone else → text.
            const igUrl = instagramProfileUrl(p.instagramHandle);
            const dmFirst = !!igUrl && (p.preferredContact === "instagram" || !p.phone);
            return (
              <Card key={n.personId} className="p-4">
                <Link href={`/person/${p.id}`} className="flex items-start gap-3">
                  <Avatar first={p.firstName} last={p.lastName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">
                        {p.firstName} {p.lastName}
                      </span>
                      <CampusBadge campus={p.campus} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <StageChip stage={p.stage} small />
                      <span
                        className="text-[11px] font-medium"
                        style={{ color: n.priority === "overdue" ? "var(--accent)" : "var(--muted)" }}
                      >
                        {n.reason}
                      </span>
                      {p.invitedByName && (
                        <span className="text-[11px] text-faint">· invited by {p.invitedByName}</span>
                      )}
                      {/* Provenance + a disambiguator (phone last-4 / handle) so two
                          people sharing a first name stop reading as duplicates. */}
                      {(() => {
                        const via = cameVia(p);
                        const idTag = p.phone ? `…${p.phone.slice(-4)}` : p.instagramHandle ? `@${p.instagramHandle}` : null;
                        const bits = [via, idTag].filter(Boolean);
                        return bits.length ? <span className="text-[11px] text-faint">· {bits.join(" · ")}</span> : null;
                      })()}
                    </div>
                  </div>
                </Link>

                <p className="mt-3 mb-1 text-[11px] text-faint">
                  Next step · {STAGE_META[p.stage].next}
                </p>
                <textarea
                  value={body}
                  onChange={(e) => setDrafts((d) => ({ ...d, [n.personId]: e.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border bg-surface-2 p-3 text-sm leading-snug outline-none focus:border-accent"
                />

                {!viewingOther && (n.followCheck ? (
                  <>
                    <p className="mt-3 text-[11px] leading-relaxed text-faint">
                      Their account is private — you sent a follow request. Check Instagram: if they accepted, the DM can finally go out (draft above is ready).
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <a
                        href={igUrl ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => { try { navigator.clipboard?.writeText(body); } catch { /* draft stays on screen */ } logTouch(p.id, "instagram_dm"); snooze(p.id); }}
                        className="flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white"
                        style={{ background: "var(--accent)" }}
                        title="Opens their Instagram — the message is copied so you can paste it"
                      >
                        They accepted — DM now
                      </a>
                      <button
                        onClick={() => { logTouch(p.id, "follow_request"); snooze(p.id); }}
                        className="rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted"
                        title="Not yet — check again in a couple of days"
                      >
                        Still waiting
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-3 flex items-center gap-2">
                      {dmFirst ? (
                        <a
                          href={igUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => { try { navigator.clipboard?.writeText(body); } catch { /* clipboard blocked — draft is still on screen to copy */ } logTouch(p.id, "instagram_dm"); snooze(p.id); }}
                          className="flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white"
                          style={{ background: "var(--accent)" }}
                          title="Opens their Instagram — the message is copied so you can paste it"
                        >
                          DM on Instagram
                        </a>
                      ) : (
                        <a
                          href={smsHref(p.phone, body)}
                          onClick={() => { logTouch(p.id, "text"); snooze(p.id); }}
                          className="flex-1 rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-white"
                          style={{ background: "var(--accent)" }}
                        >
                          Send text
                        </a>
                      )}
                      <Link
                        href={`/person/${p.id}#quick-replies`}
                        className="rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted"
                        title="Quick replies"
                        aria-label="Quick replies"
                      >
                        💬
                      </Link>
                      <button
                        onClick={() => setLogFor((v) => (v === p.id ? null : p.id))}
                        aria-expanded={logFor === p.id}
                        className="rounded-xl border px-3 py-2.5 text-sm font-medium"
                        style={logFor === p.id
                          ? { borderColor: "var(--accent)", color: "var(--accent-ink)", background: "var(--accent-soft)" }
                          : { borderColor: "var(--border)", color: "var(--muted)" }}
                      >
                        Log
                      </button>
                      <button
                        onClick={() => snooze(p.id)}
                        className="rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-muted"
                      >
                        Snooze
                      </button>
                    </div>
                    {/* IG private-account dead-end: the DM tap only let them send a
                        follow request. Logging it starts the follow-back check loop
                        (resurfaces in 2 days) instead of counting as a real DM. */}
                    {dmFirst && (
                      <button
                        onClick={() => { logTouch(p.id, "follow_request"); snooze(p.id); }}
                        className="mt-2 text-[11px] font-medium underline decoration-dotted text-faint"
                        title="Couldn't DM — their account is private and you sent a follow request instead"
                      >
                        🔒 Account private? I sent a follow request instead
                      </button>
                    )}
                    {/* Pick the real touch type — don't assume "Met up". Logging
                        updates their last-touch, so the card clears from today. */}
                    {logFor === p.id && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-2 p-2.5">
                        <span className="text-[11px] font-medium text-faint">What happened?</span>
                        {LOG_TYPES.map((t) => (
                          <button
                            key={t}
                            onClick={() => { logTouch(p.id, t); setLogFor(null); }}
                            className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted"
                          >
                            {TOUCH_META[t].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ))}
              </Card>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-faint">
        Anything you don&apos;t get to, R20 sends a gentle version from the
        team number tomorrow — so no one slips through.
      </p>

      {restingList.length > 0 && (
        <details className="mt-6 rounded-xl border border-border bg-surface-2 p-3">
          <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-wide text-faint">
            Recently texted · {restingList.length}
            <span className="ml-1 font-normal normal-case text-faint">— resting, back on the queue if they don&apos;t reply</span>
          </summary>
          <ul className="mt-3 flex flex-col gap-1.5">
            {restingList.map((r) => {
              const p = owned.find((x) => x.id === r.personId);
              if (!p) return null;
              return (
                <li key={r.personId}>
                  <Link href={`/person/${p.id}`} className="flex items-center gap-3 rounded-lg px-1 py-1">
                    <Avatar first={p.firstName} last={p.lastName} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {p.firstName} {p.lastName}
                      </div>
                      <div className="text-[11px] text-faint">
                        texted {r.days === 0 ? "today" : `${r.days}d ago`}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      <div className="mb-2 mt-8 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">
          {viewingOther ? `Who ${leader} has reached` : "Who you’ve reached"}
        </h2>
        <span className="text-[11px] text-faint">last 7 days</span>
      </div>
      {!outreach || outreach.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing logged this week yet — texts, calls and check-ins you log show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {outreach.map((o) => (
            <li key={o.personId}>
              <Link
                href={`/person/${o.personId}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <Avatar first={o.firstName} last={o.lastName} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {o.firstName} {o.lastName}
                    </span>
                    <CampusBadge campus={o.campus} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {TOUCH_META[o.lastType].label} · {relativeDays(o.lastAt, now)}
                    {o.touches > 1 && ` · ${o.touches} touches`}
                  </p>
                </div>
                <StageChip stage={o.stage} small />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: string | number;
  label: string;
  tone: "accent" | "warn" | "good";
}) {
  const color =
    tone === "accent" ? "var(--accent)" : tone === "warn" ? "var(--warn)" : "var(--good)";
  return (
    <Card className="p-4">
      <div className="text-3xl font-semibold tracking-tight" style={{ color }}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </Card>
  );
}

function CaughtUp() {
  return (
    <Card className="flex flex-col items-center gap-2 p-8 text-center">
      <div
        className="flex size-12 items-center justify-center rounded-full"
        style={{ background: "var(--good-soft)", color: "var(--good)" }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <p className="font-semibold">You&apos;re all caught up</p>
      <p className="max-w-xs text-sm text-muted">
        Every person you owe a check-in has been reached this week. Well shepherded.
      </p>
    </Card>
  );
}
