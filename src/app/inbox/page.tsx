"use client";

// The org-number inbox: every person the R20 Twilio number has ever exchanged
// messages with, newest activity first, unread replies badged. Admins + the
// coordinator see all; a campus lead sees her campus (untagged included).
// Tapping a row opens the person — their profile carries the full thread.
import { useEffect, useState } from "react";
import Link from "next/link";
import { getInboxAction, type InboxRow } from "@/app/actions";
import { useReach } from "@/lib/store";
import { relativeDays } from "@/lib/format";
import { Avatar, CampusBadge, Card, Eyebrow } from "@/components/ui";

export default function InboxPage() {
  const { isAdmin, campusLeadOf, coordinatorId, authedId, ready } = useReach();
  const canSee = isAdmin || !!campusLeadOf || (coordinatorId !== null && coordinatorId === authedId);
  const [rows, setRows] = useState<InboxRow[] | null>(null);

  useEffect(() => {
    if (canSee) getInboxAction().then(setRows).catch(() => setRows([]));
  }, [canSee]);

  if (!ready) return <div className="pt-10 text-center text-muted">Loading…</div>;
  if (!canSee) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>The inbox is for admins, the coordinator, and campus leads.</p>
        <Link href="/" className="mt-2 inline-block text-accent">Back to Today</Link>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4">
        <Eyebrow>The R20 number</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted">
          Replies to texts sent from the R20 number (journeys, broadcasts, app sends). Personal-phone texting isn&apos;t here.
        </p>
      </header>

      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <Card className="p-5 text-sm text-muted">
          Nothing yet. When someone replies to the R20 number, their thread shows up here.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.personId}>
              <Link href={`/person/${r.personId}#org-thread`}>
                <Card className="flex items-center gap-3 p-3">
                  <Avatar first={r.firstName} last={r.lastName} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{r.firstName} {r.lastName}</span>
                      <CampusBadge campus={r.campus ?? undefined} />
                      {r.ownerName && <span className="text-[11px] text-faint">· {r.ownerName}</span>}
                    </div>
                    <p className="truncate text-xs text-muted">
                      {r.lastDirection === "inbound" ? "" : "You: "}{r.lastBody}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] text-faint">{relativeDays(r.lastAt, new Date())}</span>
                    {r.unread > 0 && (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>
                        {r.unread}
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
