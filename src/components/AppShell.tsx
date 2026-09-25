"use client";

import Link from "next/link";
import { BugReport } from "@/components/bug-report";
import { usePathname } from "next/navigation";
import { useReach } from "@/lib/store";
import { logoutAction } from "@/app/auth-actions";

const NAV = [
  { href: "/", label: "Today", icon: IconSun },
  { href: "/people", label: "People", icon: IconPeople },
  { href: "/pray", label: "Pray", icon: IconPray },
  { href: "/hangouts", label: "Hangouts", icon: IconHome },
  { href: "/reflections", label: "Reflect", icon: IconBook },
  { href: "/funnel", label: "Funnel", icon: IconFunnel },
] as const;

const ADMIN_NAV = { href: "/overview", label: "Overview", icon: IconChart } as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdmin, isPastoral, isGatherer, campusLeadOf, authedName } = useReach();
  const signOut = async () => {
    await logoutAction();
    window.location.href = "/login";
  };
  // Reflect is for Hangout leaders (submit their own) + pastoral oversight
  // (review). Ops admins (Dana/Robin) neither lead nor review, and gatherers
  // do outreach but don't shepherd a Hangout → hide it for both.
  const base = (isAdmin && !isPastoral) || isGatherer ? NAV.filter((n) => n.href !== "/reflections") : NAV;
  // Campus leads also get Overview (scoped to their campus — read-only coverage).
  const nav = isAdmin || campusLeadOf ? [...base, ADMIN_NAV] : base;

  // login + public capture / policy surfaces stand alone — no nav chrome
  if (
    pathname === "/login" ||
    pathname === "/invite" ||
    pathname === "/hi" ||
    pathname === "/welcome" ||
    pathname === "/in" ||
    pathname === "/sent" ||
    pathname === "/survey" ||
    pathname === "/event" ||
    pathname.startsWith("/join") ||
    pathname === "/privacy" ||
    pathname === "/sms-terms"
  ) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col">
      <main className="flex-1 overflow-x-hidden px-4 pb-28 pt-4 sm:px-6">
        {children}
        <footer className="mt-8 border-t border-border pt-4 text-center text-xs text-muted">
          Signed in as {authedName}{isAdmin ? " (admin)" : ""} ·{" "}
          <Link href="/mylink" className="underline">My link</Link> ·{" "}
          <Link href="/settings" className="underline">Settings</Link> ·{" "}
          <button onClick={signOut} className="underline">Sign out</button> ·{" "}
          <BugReport />
        </footer>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur-md"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-2xl items-stretch justify-around">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium"
                style={{ color: active ? "var(--accent)" : "var(--muted)" }}
              >
                <Icon active={active} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

type IconProps = { active?: boolean };
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function IconPray({ active }: IconProps) {
  // A simple flame — a candle lit in prayer. Fills softly when active.
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M12 3c2.5 3 4.5 5 4.5 8a4.5 4.5 0 0 1-9 0c0-1.4.6-2.6 1.5-3.8.4.9 1 1.4 1.7 1.6C10.4 7 11 5 12 3Z" fill={active ? "currentColor" : "none"} />
    </svg>
  );
}

function IconSun({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <circle cx="12" cy="12" r={active ? 4.4 : 4} />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function IconPeople() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 5.2a3 3 0 0 1 0 5.6M17.5 14.4c2.3.5 4 2.4 4 5.6" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10.5V20h12v-9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}
function IconBook({ active }: IconProps) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
      <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
      {active && <path d="M7 8h1.5M15.5 8H17" />}
    </svg>
  );
}
function IconFunnel() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M3.5 5h17l-6.5 8v6l-4 1.5V13z" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" {...stroke}>
      <path d="M4 20V4M4 20h16" />
      <path d="M8 20v-6M13 20V9M18 20v-9" />
    </svg>
  );
}
