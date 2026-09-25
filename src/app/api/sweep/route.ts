import { NextResponse } from "next/server";
import { processDueEnrollments } from "@/lib/journeys";
import { restStaleCampus } from "@/lib/maintenance";

// Track B sweep — drains due journey sends. Today (scaffold) it's the ONLY
// scheduler, driven by Vercel Cron or a manual curl; once Inngest is wired at
// go-live it demotes to the SPEC's reconciliation sweeper. Protected by
// CRON_SECRET: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
// automatically when that env var exists.
//
// ⚠ The cron times MUST land INSIDE the step send windows: a windowed step
// only sends when the sweep itself runs within its window (nextWindowStart
// defers otherwise — a sweep that always runs outside re-defers forever).
// Windows in use: 12:00–15:00 / 12:00–18:00 ET, Thu+Fri 16:00–19:00 ET,
// Sat 11:00–17:00 ET. Hence vercel.json runs this at 17:00 UTC (12–1pm ET
// year-round → covers the noon + Saturday windows) and 21:00 UTC (4–5pm ET
// → covers Thu/Fri 16:00–19:00). Keep both inside the windows across DST
// if you change them.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const summary = await processDueEnrollments();
  const maintenance = await restStaleCampus();
  return NextResponse.json({ ok: true, provider: process.env.SMS_PROVIDER ?? "log", ...summary, ...maintenance });
}
