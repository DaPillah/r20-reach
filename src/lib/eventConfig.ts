// Server-side event config: the `event` table (in-app event editor) layered
// over the code constants in events.ts. Code is the guaranteed fallback — an
// empty/unreachable table yields exactly the pre-editor behavior — and a DB row
// for a slug overrides its code entry, so edits made in the app win.
//
// Read by getSnapshot (→ the invite pre-fill), the /event page + its OG
// metadata, and the /events editor. Public pages call this without a session,
// so it deliberately doesn't org-filter (single-org deployment, same stance as
// the other public capture reads).
import { q } from "@/lib/db";
import { EVENT_PHRASE, EVENT_RSVP, type EventRsvp, type LiveEventConfig } from "@/lib/events";

type EventRow = {
  slug: string;
  headline: string | null;
  when_text: string | null;
  where_text: string | null;
  phrase: string | null;
  is_rsvp: boolean;
  active: boolean;
  remind: boolean;
  remind_since: string | Date | null;
  thanks: boolean;
  thanks_since: string | Date | null;
  sms_thanks: string | null;
  sms_update: string | null;
  sms: string | null;
  sms_followup: string | null;
  feeders: string[] | null;
  exclude_feeders: string[] | null;
};

export async function getLiveEventConfig(): Promise<LiveEventConfig> {
  const rsvp: Record<string, EventRsvp> = { ...EVENT_RSVP };
  const phrases: Record<string, string> = { ...EVENT_PHRASE };
  const thanks: Record<string, { sms: string; since?: string }> = {};
  try {
    const rows = await q<EventRow>(
      `select slug, headline, when_text, where_text, phrase, is_rsvp, active, remind, remind_since, thanks, thanks_since, sms_thanks, sms_update, sms, sms_followup, feeders, exclude_feeders
       from event order by sort_order, created_at`,
    );
    for (const r of rows) {
      // The Off toggle is the one true kill-switch: it stops EVERYTHING for the
      // slug — invites, reminders, and thank-you.
      if (!r.active) {
        delete rsvp[r.slug];
        continue;
      }
      if (r.phrase) phrases[r.slug] = r.phrase;
      // Thank-you phase: attendees get the thanks draft; the invite/reminder
      // machinery for this slug stops. Checked BEFORE the RSVP-mode gate so a
      // post-event flip to sign-in mode can't silently disable the thanks.
      if (r.thanks && r.sms_thanks) {
        delete rsvp[r.slug];
        thanks[r.slug] = { sms: r.sms_thanks, since: r.thanks_since ? new Date(r.thanks_since).toISOString() : undefined };
        continue;
      }
      if (!r.is_rsvp) {
        delete rsvp[r.slug];
        continue;
      }
      if (r.sms && r.when_text && r.where_text) {
        rsvp[r.slug] = {
          headline: r.headline ?? "",
          when: r.when_text,
          where: r.where_text,
          sms: r.sms,
          smsFollowup: r.sms_followup ?? undefined,
          feeders: r.feeders ?? [],
          excludeFeeders: r.exclude_feeders ?? [],
          remind: r.remind,
          remindSince: r.remind_since ? new Date(r.remind_since).toISOString() : undefined,
          smsUpdate: r.sms_update ?? undefined,
        };
      }
    }
  } catch (e) {
    // DB unavailable → NO event drafts (loud), never stale/past-dated ones.
    console.error("[eventConfig] event table unreadable — event drafts disabled this request:", e);
    return { rsvp: {}, phrases: { ...EVENT_PHRASE }, thanks: {} };
  }
  return { rsvp, phrases, thanks };
}
