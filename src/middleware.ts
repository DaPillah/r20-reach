import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifyToken } from "@/lib/auth";

// Public routes reachable without a session: login + the capture layer
// (self-serve invite links + the intake form invited friends fill out) +
// /api/sweep (Vercel Cron has no session; the route enforces its own
// CRON_SECRET bearer auth).
function isPublic(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/invite" ||
    pathname === "/hi" ||
    pathname === "/welcome" ||
    pathname === "/in" ||
    pathname === "/sent" ||
    pathname === "/survey" ||
    pathname === "/event" ||
    pathname === "/join" ||
    pathname.startsWith("/join/") ||
    pathname === "/privacy" ||
    pathname === "/sms-terms" ||
    pathname === "/api/sweep" ||
    pathname === "/api/sms/inbound" ||
    pathname === "/api/instagram/inbound" // Phase 2 scaffold — Meta webhook (GET handshake + signed POST), inert until secrets set
  );
}

// Host canonicalization (prod hostnames only — localhost/previews untouched):
// join.r20.nyc = the public capture doors (what's printed on cards + ads);
// app.r20.nyc = the leader app. Both point at the same deployment, so each
// route redirects to its home host. /api is exempt — Twilio/Meta webhooks sign
// the exact URL and the cron hits /api/sweep directly; a redirect breaks both.
// /login is app-side even though it needs no session.
const HOST_APP = "app.r20.nyc";
const HOST_JOIN = "join.r20.nyc";
function canonicalHost(pathname: string): string | null {
  if (pathname.startsWith("/api/")) return null;
  if (pathname === "/login") return HOST_APP;
  return isPublic(pathname) ? HOST_JOIN : HOST_APP;
}

// Shortcut subdomains — memorable spoken/printed URLs. Any path on these hosts
// lands on the mapped join.r20.nyc page, query string preserved (?src=, ?by=).
// DNS + the Vercel domain entries must exist for these to resolve.
const SHORT_HOSTS: Record<string, string> = {
  "hi.r20.nyc": "/hi",
  "welcome.r20.nyc": "/welcome",
  "survey.r20.nyc": "/survey",
  "events.r20.nyc": "/event", // spoken at events — "events dot r20 dot nyc" (?e= survives the redirect)
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const host = req.headers.get("host");
  const shortPath = host ? SHORT_HOSTS[host] : undefined;
  if (shortPath) {
    const url = req.nextUrl.clone();
    url.protocol = "https";
    url.host = HOST_JOIN;
    url.port = "";
    url.pathname = shortPath;
    return NextResponse.redirect(url);
  }
  if (host === HOST_APP || host === HOST_JOIN) {
    const want = canonicalHost(pathname);
    if (want && want !== host) {
      const url = req.nextUrl.clone();
      url.protocol = "https";
      url.host = want;
      url.port = "";
      return NextResponse.redirect(url);
    }
  }

  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = pathname === "/login";

  if (!session && !isPublic(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (session && isLogin) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // run on everything except static assets and files with an extension
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};
