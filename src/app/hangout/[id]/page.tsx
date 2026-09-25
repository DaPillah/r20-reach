"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useReach } from "@/lib/store";
import { Avatar, Card, StageChip } from "@/components/ui";

export default function HangoutPage() {
  const { id } = useParams<{ id: string }>();
  const { hangouts, people, ready } = useReach();

  if (!ready) {
    return <div className="pt-10 text-center text-muted">Loading…</div>;
  }
  const h = hangouts.find((x) => x.id === id);
  if (!h) {
    return (
      <div className="pt-10 text-center text-muted">
        <p>Hangout not found.</p>
        <Link href="/hangouts" className="mt-2 inline-block text-accent">
          Back to Hangouts
        </Link>
      </div>
    );
  }

  const members = people.filter((p) => p.hangoutId === h.id);

  return (
    <div>
      <Link href="/hangouts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        Hangouts
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{h.name}</h1>
        <p className="text-sm text-muted">
          {h.campus} · {members.length} {members.length === 1 ? "member" : "members"}
        </p>
      </header>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Members</h2>
      {members.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted">
          No one placed here yet. Place people from their profile or the Hangouts list.
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((p) => (
            <Link key={p.id} href={`/person/${p.id}`}>
              <Card className="flex items-center gap-3 p-3">
                <Avatar first={p.firstName} last={p.lastName} />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.firstName} {p.lastName}
                </span>
                <StageChip stage={p.stage} small />
              </Card>
            </Link>
          ))}
        </ul>
      )}
    </div>
  );
}
