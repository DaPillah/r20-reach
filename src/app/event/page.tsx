// PUBLIC — /event = the event sign-in (no login). The QR at a games night, float
// social, or field games points here with ?e=<event-slug> (+ optional ?src=).
// Contact required — this page exists to capture; a person lands at Campus and the
// coordinator gets the same-day follow-up. Also reachable as events.r20.nyc.
//
// Event config (RSVP framing, when/where, invite copy) comes from the in-app
// event editor (`event` table) layered over the code constants — loaded here
// server-side and passed to the card, which still falls back to code if absent.
import type { Metadata } from "next";
import { cleanEventSlug, eventRsvp } from "@/lib/events";
import { getLiveEventConfig } from "@/lib/eventConfig";
import { EventCard } from "@/components/event-card";

// The link preview a leader's DM/text renders (Instagram, iMessage) must read as
// an INVITE, not the app behind it. For an RSVP event we surface its when/where;
// otherwise a plain, non-churchy "R20" card. No em dashes in the outward copy.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const raw = Array.isArray(sp.e) ? sp.e[0] : sp.e;
  const cfg = await getLiveEventConfig();
  const rsvp = eventRsvp(cleanEventSlug(raw) ?? undefined, cfg.rsvp);

  if (rsvp) {
    const title = "You're invited";
    const description = `${rsvp.when} · ${rsvp.where}`.replace(/\s*—\s*/g, ", ");
    return {
      title,
      description,
      openGraph: { type: "website", siteName: "R20", title: `${title} · R20`, description },
      twitter: { card: "summary", title: `${title} · R20`, description },
    };
  }

  // Non-RSVP slugs (at-the-door sign-ins) + no slug: inherit the site default.
  return {};
}

export default async function EventPage() {
  const cfg = await getLiveEventConfig();
  return <EventCard rsvpMap={cfg.rsvp} />;
}
