import { STAGE_META, type Stage } from "@/lib/types";
import { initials } from "@/lib/format";

export function StageChip({ stage, small }: { stage: Stage; small?: boolean }) {
  const c = STAGE_META[stage].color;
  return (
    <span
      title={`${stage} · ${STAGE_META[stage].headline} — ${STAGE_META[stage].def}`}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: c }} />
      {stage}
    </span>
  );
}

export function CampusBadge({ campus }: { campus?: string | null }) {
  if (!campus) return null;
  return (
    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
      {campus}
    </span>
  );
}

export function Avatar({ first, last }: { first: string; last: string }) {
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-accent-ink"
      style={{ background: "var(--accent-soft)" }}
    >
      {initials(first, last)}
    </div>
  );
}

export function Card({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`rounded-2xl border border-border bg-surface ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-faint">
      {children}
    </h2>
  );
}

// Gold rule + uppercase label — r20.nyc's section eyebrow, brought into the
// leader app (light theme) so the private surfaces read as the same family.
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      <span className="h-px w-7" style={{ background: "var(--gold)" }} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--gold)" }}>{children}</span>
    </div>
  );
}
