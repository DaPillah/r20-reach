// Send-window math for journey steps (pure — no imports, unit-testable).
// A step's send_window jsonb: { days?: ["mon".."sun"], earliest?: "HH:MM", latest?: "HH:MM" }
// All times are America/New_York wall-clock; the caller converts the returned
// ET wall time to a timestamptz in SQL (`(date + time) at time zone '...'`).

export type SendWindow = { days?: string[]; earliest?: string; latest?: string };

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function etParts(now: Date): { date: string; dow: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dow: DOW.indexOf(p.weekday.toLowerCase().slice(0, 3)),
    minutes: Number(p.hour === "24" ? "0" : p.hour) * 60 + Number(p.minute),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Returns null when `now` is inside the window (send immediately), otherwise
// the next window opening as ET wall time {date:'YYYY-MM-DD', time:'HH:MM'}.
export function nextWindowStart(win: SendWindow, now: Date): { date: string; time: string } | null {
  const days = win.days?.map((d) => DOW.indexOf(d.toLowerCase().slice(0, 3))).filter((i) => i >= 0);
  const earliest = win.earliest ? toMinutes(win.earliest) : 0;
  const latest = win.latest ? toMinutes(win.latest) : 24 * 60 - 1;
  const openTime = win.earliest ?? "00:00";

  for (let d = 0; d < 8; d++) {
    const candidate = new Date(now.getTime() + d * 86_400_000);
    const p = etParts(candidate);
    if (days && days.length > 0 && !days.includes(p.dow)) continue;
    if (d === 0) {
      if (p.minutes >= earliest && p.minutes <= latest) return null; // inside — send now
      if (p.minutes < earliest) return { date: p.date, time: openTime }; // later today
      continue; // past today's window → keep looking
    }
    return { date: p.date, time: openTime };
  }
  return null; // unreachable with a sane window; fail open (send) rather than stall
}
