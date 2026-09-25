// Small presentation helpers. "now" is passed in (or defaults) so components
// stay deterministic and testable.

export function initials(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

// R20 operates in US Eastern. Any "today" default must be Eastern — NOT the
// viewer's device timezone and NOT UTC (which flips a day early at 8pm ET).
export const APP_TZ = "America/New_York";
export function todayET(d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD, which is what date inputs and ::date want.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function daysBetween(fromISO: string, now: Date): number {
  const then = new Date(fromISO).getTime();
  return Math.floor((now.getTime() - then) / 86_400_000);
}

export function relativeDays(iso: string | null, now: Date): string {
  if (!iso) return "never";
  const d = daysBetween(iso, now);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "last week";
  if (d < 60) return `${Math.floor(d / 7)} weeks ago`;
  return `${Math.floor(d / 30)} months ago`;
}

// Forward-looking counterpart to relativeDays, for scheduled/future instants
// (e.g. a journey's next send). relativeDays is past-only ("today" for anything
// not in the past), so future timestamps need their own labels.
export function relativeFuture(iso: string | null, now: Date): string {
  if (!iso) return "";
  const d = -daysBetween(iso, now); // days from now until iso (positive = future)
  if (d <= 0) return "today";
  if (d === 1) return "tomorrow";
  if (d < 14) return `in ${d} days`;
  if (d < 60) return `in ${Math.round(d / 7)} weeks`;
  return `in ${Math.round(d / 30)} months`;
}

// Deep-link that opens the leader's own Messages app, prefilled (Track A: the
// leader sends from their own number — authentic + sidesteps A2P/10DLC).
// Format: `sms:<number>&body=<text>` — iOS reliably populates BOTH the recipient
// and the body with the `&` separator; a `?` in the sms: URL makes iPhones drop
// the recipient (the bug this fixes). R20 is iPhone-heavy. Kept deterministic
// (no userAgent branch) so server and client render identically.
export function smsHref(phone: string, body: string): string {
  return `sms:${phone}&body=${encodeURIComponent(body)}`;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function longDate(now: Date): string {
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
