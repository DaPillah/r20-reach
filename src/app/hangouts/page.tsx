"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { getHangoutResourcesAction, type HangoutResources } from "@/app/actions";
import { Card, Eyebrow } from "@/components/ui";
import type { Stage } from "@/lib/types";

export default function HangoutsPage() {
  const { people, hangouts, isAdmin } = useReach();
  const [res, setRes] = useState<HangoutResources | null>(null);
  const unplaced = useMemo(
    () =>
      people.filter(
        (p) =>
          p.hangoutId === null &&
          (["Community", "Committed", "Core"] as Stage[]).includes(p.stage),
      ),
    [people],
  );

  useEffect(() => { getHangoutResourcesAction().then(setRes).catch(() => {}); }, []);

  return (
    <div>
      <header className="mb-4">
        <Eyebrow>The engine</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">Bible Hangouts</h1>
        <p className="text-sm text-muted">The conversion engine — placement is the metric.</p>
      </header>

      {res && <HangoutResourcesCards res={res} isAdmin={isAdmin} />}

      {unplaced.length > 0 && (
        <Card className="mb-4 p-4">
          <p className="text-sm font-semibold text-warn">{unplaced.length} ready to place</p>
          <p className="mb-3 text-xs text-muted">Community+ people not yet in a Hangout</p>
          <ul className="flex flex-col gap-1">
            {unplaced.map((p) => (
              <Link
                key={p.id}
                href={`/person/${p.id}`}
                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
              >
                <span>
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-xs text-accent">Place →</span>
              </Link>
            ))}
          </ul>
        </Card>
      )}

      <ul className="flex flex-col gap-3">
        {hangouts.map((h) => (
          <Link key={h.id} href={`/hangout/${h.id}`}>
            <Card className="flex items-center justify-between p-4">
              <div>
                <p className="font-semibold">{h.name}</p>
                <p className="text-xs text-muted">{h.memberIds.length} members · {h.campus}</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Card>
          </Link>
        ))}
      </ul>
    </div>
  );
}

function ExternalLinkRow({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-surface-2"
    >
      <span className="font-medium">{label}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </a>
  );
}

// This week's 527 + the standing guide/handbook links. Each card renders only
// when it has content; admins get a nudge toward Settings when nothing's set yet.
function HangoutResourcesCards({ res, isAdmin }: { res: HangoutResources; isAdmin: boolean }) {
  const w = res.week527;
  const wd = res.word;
  const hasWord = Boolean(wd.title || wd.url || wd.summary);
  const hasWeek = Boolean(w.title || w.leaderUrl || w.handoutUrl);
  const hasStanding = Boolean(res.guideUrl || res.handbookUrl);

  if (!hasWord && !hasWeek && !hasStanding) {
    if (!isAdmin) return null;
    return (
      <Card className="mb-4 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-faint">Resources</h2>
        <p className="mt-1 text-sm text-muted">
          Add the Hangout guide, Leader Handbook, and this week&apos;s 527 in{" "}
          <Link href="/settings" className="text-accent underline">Settings</Link> — they&apos;ll show up here for every leader.
        </p>
      </Card>
    );
  }

  return (
    <>
      {hasWord && (
        <Card className="mb-4 p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">This week&apos;s word</h2>
          {wd.title && <p className="mb-1 font-semibold">{wd.title}</p>}
          {wd.summary && <p className="mb-2 whitespace-pre-wrap text-sm text-muted">{wd.summary}</p>}
          {wd.url && <ExternalLinkRow label="▶ Listen (6–10 min)" url={wd.url} />}
        </Card>
      )}

      {hasWeek && (
        <Card className="mb-4 p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">This week&apos;s 527</h2>
          {w.title && <p className="mb-2 font-semibold">{w.title}</p>}
          <div className="flex flex-col gap-1">
            {w.leaderUrl && <ExternalLinkRow label="Leader version" url={w.leaderUrl} />}
            {w.handoutUrl && <ExternalLinkRow label="Handout version" url={w.handoutUrl} />}
          </div>
        </Card>
      )}

      {hasStanding && (
        <Card className="mb-4 p-4">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Resources</h2>
          <div className="flex flex-col gap-1">
            {res.guideUrl && <ExternalLinkRow label="Bible Hangout guide" url={res.guideUrl} />}
            {res.handbookUrl && <ExternalLinkRow label="Leader Handbook" url={res.handbookUrl} />}
          </div>
        </Card>
      )}
    </>
  );
}
