"use client";

// Admin/coordinator/campus-lead event editor (/events, linked from Overview).
// Create + edit events — the RSVP page framing, the link-preview facts, and the
// invite text gatherers send — without a deploy. Backed by the `event` table;
// getLiveEventConfig() layers these rows over the code constants everywhere.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useReach } from "@/lib/store";
import { previewEventAudienceAction, getEventsAdminAction, saveEventAction, type EventAdminRow } from "@/app/actions";
import { eventLabel, eventLink } from "@/lib/events";
import { Card, Eyebrow } from "@/components/ui";

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent";

const BLANK: EventAdminRow = {
  slug: "", headline: "", whenText: "", whereText: "", phrase: "",
  isRsvp: true, active: true, remind: false, thanks: false, sms: "", smsFollowup: "", smsThanks: "", smsUpdate: "", feeders: [], fromCode: false,
};

function Toggle({ on, onClick, labelOn, labelOff }: { on: boolean; onClick: () => void; labelOn: string; labelOff: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-xs font-semibold"
      style={on
        ? { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "var(--accent)" }
        : { background: "var(--surface-2)", color: "var(--muted)", borderColor: "var(--border)" }}
    >
      {on ? labelOn : labelOff}
    </button>
  );
}

export default function EventsAdminPage() {
  const { isAdmin, campusLeadOf, coordinatorId, authedId, ready } = useReach();
  const canManage = isAdmin || !!campusLeadOf || (coordinatorId !== null && coordinatorId === authedId);

  const [data, setData] = useState<{ events: EventAdminRow[]; knownSlugs: string[] } | null>(null);
  const [editing, setEditing] = useState<EventAdminRow | null>(null); // working copy
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    getEventsAdminAction().then(setData).catch(() => setData({ events: [], knownSlugs: [] }));
  }, []);
  useEffect(() => { if (canManage) load(); }, [canManage, load]);

  const set = (patch: Partial<EventAdminRow>) => setEditing((e) => (e ? { ...e, ...patch } : e));

  const save = async () => {
    if (!editing) return;
    setBusy(true); setMsg(null);
    try {
      // Blast radius: a live RSVP save changes real queues instantly — show
      // how many people before committing.
      if (editing.isRsvp && editing.active) {
        try {
          const n = await previewEventAudienceAction(editing.slug, editing.feeders, []);
          if (!window.confirm(`This goes live immediately: ~${n} people's Today queues get this event's drafts. Save?`)) { setBusy(false); return; }
        } catch { /* count unavailable — save proceeds, server still validates */ }
      }
      const r = await saveEventAction(editing);
      if (r.ok) { setEditing(null); setIsNew(false); setMsg("Saved — live everywhere right away."); load(); }
      else setMsg(r.error);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save.");
    } finally { setBusy(false); }
  };

  // Example render of the invite so the writer sees what a student receives.
  const preview = useMemo(() => {
    if (!editing?.sms) return "";
    return editing.sms
      .replaceAll("[FIRST_NAME]", "Maya").replaceAll("{name}", "Maya")
      .replaceAll("{leader}", "Maria")
      .replaceAll("{event}", "to the ice cream float")
      .replaceAll("{when}", editing.whenText || "…")
      .replaceAll("{where}", editing.whereText || "…")
      .replaceAll("{link}", editing.slug ? eventLink(editing.slug) : "…")
      .replaceAll("{ig}", "readyat20manh");
  }, [editing?.sms, editing?.whenText, editing?.whereText, editing?.slug]);

  if (!ready) return null;
  if (!canManage) {
    return (
      <div className="py-10 text-center text-sm text-muted">
        Events are managed by admins, the coordinator, and campus leads.
      </div>
    );
  }

  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <Eyebrow>Events</Eyebrow>
          <h1 className="text-2xl font-semibold tracking-tight">Event invites &amp; RSVP pages</h1>
          <p className="text-sm text-muted">
            Each event here powers three things at once: its RSVP page, the link preview in a DM, and the invite pre-filled in the team&apos;s Today.
          </p>
        </div>
        <button
          onClick={() => { setEditing({ ...BLANK }); setIsNew(true); setMsg(null); }}
          className="rounded-xl px-3 py-2 text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          + New event
        </button>
      </header>

      {msg && !editing && <p className="mb-3 text-sm font-medium" style={{ color: "var(--accent-ink)" }}>{msg}</p>}

      {editing && (
        <Card className="mb-5 p-4">
          <p className="text-sm font-semibold">{isNew ? "New event" : `Edit — ${eventLabel(editing.slug)}`}</p>
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Link name (the ?e= slug — lowercase-with-dashes; this is the QR/RSVP URL)
              <input value={editing.slug} onChange={(e) => set({ slug: e.target.value })} disabled={!isNew}
                placeholder="e.g. park-pizza" className={inputCls} style={isNew ? undefined : { opacity: 0.6 }} />
              {editing.slug && <span>Public link: {eventLink(editing.slug)}</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              <Toggle on={editing.isRsvp} onClick={() => set({ isRsvp: !editing.isRsvp })}
                labelOn="RSVP push (upcoming event)" labelOff="Sign-in only (at the door)" />
              <Toggle on={editing.active} onClick={() => set({ active: !editing.active })}
                labelOn="On" labelOff="Off (EVERYTHING stops — invites, reminders, and thank-you)" />
              {editing.isRsvp && (
                <Toggle on={editing.remind} onClick={() => set({ remind: !editing.remind })}
                  labelOn="Day-of reminders ON (texted, no RSVP → back on Today)" labelOff="Day-of reminders off" />
              )}
              <Toggle on={editing.thanks} onClick={() => set({ thanks: !editing.thanks })}
                labelOn="Thank-you mode ON (attendees → back on Today with thanks)" labelOff="Thank-you mode off" />
            </div>
            {editing.isRsvp && (
              <>
                <div className="flex gap-3">
                  <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
                    Headline (RSVP page)
                    <input value={editing.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="Game night." className={inputCls} />
                  </label>
                  <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
                    When
                    <input value={editing.whenText} onChange={(e) => set({ whenText: e.target.value })} placeholder="Sat 9/5 · 8pm" className={inputCls} />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Where
                  <input value={editing.whereText} onChange={(e) => set({ whereText: e.target.value })} placeholder="Broadway Hall on 114th — start in the Sky Lounge." className={inputCls} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Invite who came to… (pick at least one — with none picked, nobody gets the pre-filled invite)
                  <div className="flex flex-wrap gap-1.5">
                    {(data?.knownSlugs ?? []).filter((s) => s !== editing.slug).map((s) => {
                      const on = editing.feeders.includes(s);
                      return (
                        <button key={s} type="button"
                          onClick={() => set({ feeders: on ? editing.feeders.filter((f) => f !== s) : [...editing.feeders, s] })}
                          className="rounded-full border px-2.5 py-1 text-xs font-medium"
                          style={on
                            ? { background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "var(--accent)" }
                            : { background: "var(--surface-2)", color: "var(--muted)", borderColor: "var(--border)" }}
                        >
                          {eventLabel(s)}
                        </button>
                      );
                    })}
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Invite text (tags: {"{name} {leader} {event} {when} {where} {link}"})
                  <textarea value={editing.sms} onChange={(e) => set({ sms: e.target.value })} rows={5} className={inputCls} />
                </label>
                {preview && (
                  <div className="rounded-xl border border-border bg-surface-2 p-3 text-xs">
                    <p className="mb-1 font-semibold text-muted">What a student receives (example):</p>
                    <p className="whitespace-pre-wrap">{preview}</p>
                  </div>
                )}
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Second touch (auto-swaps in after they&apos;ve been texted once and still haven&apos;t RSVP&apos;d — tag {"{ig}"} = our Instagram)
                  <textarea value={editing.smsFollowup} onChange={(e) => set({ smsFollowup: e.target.value })} rows={3} className={inputCls} />
                </label>
                {editing.remind && (
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    Change-of-plans text (goes to people who ALREADY RSVP&apos;d — e.g. a time change; blank = they stay off Today)
                    <textarea value={editing.smsUpdate} onChange={(e) => set({ smsUpdate: e.target.value })} rows={3} className={inputCls} />
                  </label>
                )}
              </>
            )}
            {editing.thanks && (
              <label className="flex flex-col gap-1 text-xs text-muted">
                Thank-you text (sent to everyone who checked in — tags: {"{name} {leader} {ig}"})
                <textarea value={editing.smsThanks} onChange={(e) => set({ smsThanks: e.target.value })} rows={3} className={inputCls} />
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs text-muted">
              How it reads in a text, after &ldquo;glad you came …&rdquo; (e.g. &ldquo;to the ice cream float&rdquo; → enter &ldquo;the ice cream float&rdquo;)
              <input value={editing.phrase} onChange={(e) => set({ phrase: e.target.value })} placeholder="the ice cream float" className={inputCls} />
            </label>
            {msg && <p className="text-sm font-medium" style={{ color: "var(--accent-ink)" }}>{msg}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || !editing.slug.trim()}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button onClick={() => { setEditing(null); setIsNew(false); setMsg(null); }}
                className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted">
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {(data?.events ?? []).map((e) => (
          <Card key={e.slug} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {eventLabel(e.slug)}{" "}
                  <span className="font-normal text-muted">· {e.isRsvp ? "RSVP push" : "sign-in"}</span>
                  {!e.active && <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">off</span>}
                  {e.fromCode && <span className="ml-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">built-in</span>}
                </p>
                {e.isRsvp && (e.whenText || e.whereText) && (
                  <p className="mt-0.5 truncate text-xs text-muted">{[e.whenText, e.whereText].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              <button
                onClick={() => { setEditing({ ...e }); setIsNew(false); setMsg(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
              >
                Edit
              </button>
            </div>
          </Card>
        ))}
        {data && data.events.length === 0 && <p className="text-sm text-muted">No events yet — create the first one.</p>}
      </div>
    </div>
  );
}
