"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { SCHOOL_YEARS, STAGES, STAGE_META, type Campus, type SchoolYear, type Stage } from "@/lib/types";
import { CampusBadge, Eyebrow } from "@/components/ui";

const CAMPUSES: Campus[] = ["Columbia", "NYU", "CCNY", "Pace"];
const filterCls =
  "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-muted outline-none";

export default function FunnelPage() {
  const { people } = useReach();
  // Filters narrow every column (and the Resting column) the same way.
  const [campus, setCampus] = useState<Campus | "">("");
  const [year, setYear] = useState<SchoolYear | "">("");
  const [nycOnly, setNycOnly] = useState(false);

  const filtered = useMemo(
    () =>
      people.filter(
        (p) =>
          (!campus || p.campus === campus) &&
          (!year || p.schoolYear === year) &&
          (!nycOnly || p.nycLocal),
      ),
    [people, campus, year, nycOnly],
  );
  const filtering = Boolean(campus || year || nycOnly);

  // Resting people are set down for a season — out of the live pipeline, so
  // they don't inflate the stage counts. They keep a muted column at the end
  // (the People-list convention: off the action surfaces, never invisible).
  const byStage = (s: Stage) => filtered.filter((p) => p.stage === s && !p.dormantAt);
  const resting = filtered.filter((p) => p.dormantAt);

  return (
    <div>
      <header className="mb-1">
        <Eyebrow>The 5 C’s</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">Funnel</h1>
        <p className="text-sm text-muted">
          Campus → Crowd → Community → Committed → Core
        </p>
      </header>

      <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
        <select aria-label="Filter by campus" value={campus} onChange={(e) => setCampus(e.target.value as Campus | "")} className={filterCls}>
          <option value="">Any campus</option>
          {CAMPUSES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Filter by school year" value={year} onChange={(e) => setYear(e.target.value as SchoolYear | "")} className={filterCls}>
          <option value="">Any year</option>
          {SCHOOL_YEARS.map((y) => (
            <option key={y.key} value={y.key}>{y.label}</option>
          ))}
        </select>
        <button
          onClick={() => setNycOnly((v) => !v)}
          aria-pressed={nycOnly}
          className="rounded-lg border px-2.5 py-1.5 text-sm"
          style={nycOnly ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent-ink)" } : { borderColor: "var(--border)", color: "var(--muted)" }}
        >
          In NYC over breaks
        </button>
        {filtering && (
          <button
            onClick={() => { setCampus(""); setYear(""); setNycOnly(false); }}
            className="text-sm text-muted underline underline-offset-4"
          >
            Clear · {filtered.length} match{filtered.length === 1 ? "" : "es"}
          </button>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <div className="flex gap-3" style={{ minWidth: "max-content" }}>
          {STAGES.map((stage) => {
            const list = byStage(stage);
            const c = STAGE_META[stage].color;
            return (
              <div key={stage} className="w-56 shrink-0">
                <div className="mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="size-2 rounded-full" style={{ background: c }} />
                    {stage}
                  </span>
                  <span className="text-xs text-faint">{list.length}</span>
                </div>
                <p className="mb-2 text-[11px] leading-snug text-faint">
                  <span className="font-medium text-muted">{STAGE_META[stage].headline}.</span> {STAGE_META[stage].def}
                </p>
                <div className="flex flex-col gap-2">
                  {list.map((p) => (
                    <Link
                      key={p.id}
                      href={`/person/${p.id}`}
                      className="block rounded-xl border border-border bg-surface p-2.5"
                      style={{ borderLeft: `3px solid ${c}` }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {p.firstName} {p.lastName}
                        </span>
                        <CampusBadge campus={p.campus} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-faint">
                        {p.hangoutId ? "in a Hangout" : STAGE_META[stage].next}
                      </p>
                    </Link>
                  ))}
                  {list.length === 0 && (
                    <div className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-faint">
                      none yet
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {resting.length > 0 && (
            <div className="w-56 shrink-0 opacity-70">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-muted">
                  <span className="size-2 rounded-full border border-border bg-surface" />
                  Resting
                </span>
                <span className="text-xs text-faint">{resting.length}</span>
              </div>
              <p className="mb-2 text-[11px] leading-snug text-faint">
                <span className="font-medium text-muted">Set down for a season.</span> Not counted in the funnel; they re-enter at their stage.
              </p>
              <div className="flex flex-col gap-2">
                {resting.map((p) => (
                  <Link
                    key={p.id}
                    href={`/person/${p.id}`}
                    className="block rounded-xl border border-dashed border-border bg-surface p-2.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {p.firstName} {p.lastName}
                      </span>
                      <CampusBadge campus={p.campus} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {p.stage} · resting
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
