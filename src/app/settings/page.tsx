"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useReach } from "@/lib/store";
import { inviteLeaderAction, listLeadersAction, logoutAction, setLeaderDeactivatedAction, setMyPasswordAction } from "@/app/auth-actions";
import { addCoverageAction, getActiveTermAction, getCoordinatorAlertPhoneAction, getHangoutResourcesAction, getNightsInfoSettingAction, getRetrievalPromptAction, getTonightCardSettingAction, listCoveragesAction, listRemovedAction, removeCoverageAction, restorePersonAction, saveDraftTemplatesAction, setCoordinatorAction, setCoordinatorAlertPhoneAction, setHangoutResourcesAction, setNightsInfoAction, setRetrievalPromptAction, setTermAction, setTonightCardAction, type CoverageRow, type HangoutResources, type RemovedPerson, type TonightCardInput } from "@/app/actions";
import { DRAFT_META } from "@/lib/logic";
import { Card, Eyebrow } from "@/components/ui";
import { QuickReplies } from "@/components/QuickReplies";
import type { DraftKind, DraftTemplates, LeaderRow } from "@/lib/types";

const inputCls =
  "w-full rounded-xl border border-border bg-surface-2 p-2.5 text-sm outline-none focus:border-accent";

export default function SettingsPage() {
  const { isAdmin, authedName, viewingOther, leaderName, currentLeaderId } = useReach();

  const signOut = async () => {
    await logoutAction();
    window.location.href = "/login";
  };

  return (
    <div>
      <Link href="/people" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        People
      </Link>
      <Eyebrow>Your account</Eyebrow>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Settings</h1>
      <p className="mb-4 text-sm text-muted">
        Signed in as <span className="font-medium text-ink">{authedName}</span>
        {isAdmin && " (admin)"}
        {viewingOther && <span className="text-faint"> · viewing {leaderName(currentLeaderId)}&apos;s data</span>}
      </p>

      <Link href="/guide" className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
        <span aria-hidden className="text-lg">📖</span>
        <span className="flex-1 text-sm font-semibold">How Oikos works — a quick guide</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </Link>

      <ChangePassword />
      <YourTexts />
      <div className="mb-4">
        <QuickReplies />
      </div>
      {isAdmin && <Coordinator />}
      {isAdmin && <CoverageSetting />}
      {isAdmin && <HangoutResourcesSetting />}
      {isAdmin && <NightsInfoSetting />}
      {isAdmin && <TonightCardSetting />}
      {isAdmin && <RetrievalPromptSetting />}
      {isAdmin && <CoordinatorAlertSetting />}
      {isAdmin && <TermSetting />}
      {isAdmin && <Leaders />}
      {isAdmin && <RecentlyRemoved />}

      <button
        onClick={signOut}
        className="mt-2 w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted"
      >
        Sign out{isAdmin ? ` (${authedName})` : ""}
      </button>
    </div>
  );
}

// Personal voice for the pre-written Today drafts. Edits the LOGGED-IN member
// (authedId — never the admin "view as" target). Blank = app default.
function YourTexts() {
  const { leaders, authedId } = useReach();
  const me = leaders.find((l) => l.id === authedId);
  const myName = me?.name?.split(/\s+/)[0] ?? "me";
  const [drafts, setDrafts] = useState<DraftTemplates>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // adopt saved templates once the snapshot delivers them (render-time sync)
  if (me && loadedFor !== me.id) {
    setLoadedFor(me.id);
    setDrafts(me.draftTemplates ?? {});
  }

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await saveDraftTemplatesAction(drafts);
      setMsg("Saved — your Today drafts now use your voice.");
    } catch {
      setMsg("Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Your texts</h2>
      <p className="mb-3 text-xs text-muted">
        Make the pre-written drafts sound like you. <code className="rounded bg-surface-2 px-1">[FIRST_NAME]</code> becomes
        their name — e.g. <span className="italic">&ldquo;how&apos;s it going g&rdquo;</span> works too. Blank = the default.
      </p>
      <div className="flex flex-col gap-3">
        {(Object.keys(DRAFT_META) as DraftKind[]).map((k) => (
          <label key={k} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-faint">
              {DRAFT_META[k].label} <span className="font-normal">· {DRAFT_META[k].hint}</span>
            </span>
            <textarea
              value={drafts[k] ?? ""}
              onChange={(e) => setDrafts((d) => ({ ...d, [k]: e.target.value }))}
              rows={2}
              placeholder={DRAFT_META[k].default("[FIRST_NAME]", myName)}
              className={`${inputCls} resize-y`}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-faint">
            Event invites <span className="font-normal">· when an event push is on (game night, pizza in the park…)</span>
          </span>
          <textarea
            value={drafts.event_invite ?? ""}
            onChange={(e) => setDrafts((d) => ({ ...d, event_invite: e.target.value }))}
            rows={3}
            placeholder={"Blank = the event's own text. Tags: [FIRST_NAME] {event} {when} {where} {link} — e.g. \"hey [FIRST_NAME]! so glad you came {event} — we've got another one {when}, {where} rsvp: {link}\""}
            className={`${inputCls} resize-y`}
          />
          <span className="text-[11px] text-faint">
            The event&apos;s date, place, and link always come from the event itself — your words wrap around them.
          </span>
        </label>
      </div>
      {msg && <p className="mt-2 text-sm" style={{ color: msg.startsWith("Saved") ? "var(--good)" : "var(--accent)" }}>{msg}</p>}
      <button
        onClick={save}
        disabled={busy || !me}
        className="mt-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {busy ? "Saving…" : "Save your texts"}
      </button>
    </Card>
  );
}

function Coordinator() {
  const { leaders, coordinatorId } = useReach();
  const [sel, setSel] = useState("");
  const [prev, setPrev] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // adopt the store's coordinator once the snapshot loads (render-time sync)
  if (prev !== coordinatorId) {
    setPrev(coordinatorId);
    if (coordinatorId) setSel(coordinatorId);
  }

  const save = async (id: string) => {
    setSel(id);
    setBusy(true);
    setMsg(null);
    try {
      await setCoordinatorAction(id);
      setMsg("Saved. Captures that can't be auto-assigned now route here.");
    } catch {
      setMsg("Could not update.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Coordinator</h2>
      <p className="mb-3 text-xs text-muted">
        The backstop who owns any new capture that can&apos;t be auto-assigned to a leader.
      </p>
      <select value={sel} onChange={(e) => save(e.target.value)} disabled={busy || !leaders.length} className={inputCls}>
        {leaders.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
      {msg && <p className="mt-2 text-sm" style={{ color: "var(--good)" }}>{msg}</p>}
    </Card>
  );
}

// Temporary coverage: one leader tends another's people for a season without
// taking ownership (e.g. Chris covers Bella over the summer).
function CoverageSetting() {
  const { leaders } = useReach();
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [covering, setCovering] = useState("");
  const [covered, setCovered] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => listCoveragesAction().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!covering || !covered) return;
    if (covering === covered) return setMsg("A leader can't cover themselves.");
    setBusy(true); setMsg(null);
    try {
      await addCoverageAction(covering, covered, endsOn || undefined);
      setCovering(""); setCovered(""); setEndsOn("");
      setMsg("Saved. They'll see the covered leader's people in their queue.");
      load();
    } catch {
      setMsg("Could not save.");
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    await removeCoverageAction(id).catch(() => {});
    load();
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Coverage</h2>
      <p className="mb-3 text-xs text-muted">
        Have one leader tend another&apos;s people for a season (e.g. while someone&apos;s away) — without changing who owns them. Ends on its own, or remove it anytime.
      </p>

      {rows.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
              <span className="min-w-0 text-sm">
                <span className="font-medium">{r.coveringName}</span>
                <span className="text-muted"> covers </span>
                <span className="font-medium">{r.coveredName}</span>
                {r.endsOn && <span className="text-xs text-faint"> · until {r.endsOn}</span>}
                {!r.active && <span className="ml-1 rounded bg-surface px-1.5 py-0.5 text-[10px] text-faint">ended</span>}
              </span>
              <button onClick={() => remove(r.id)} className="shrink-0 text-xs font-medium text-muted underline">Remove</button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <select value={covering} onChange={(e) => setCovering(e.target.value)} className={inputCls}>
            <option value="">Covering leader…</option>
            {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span className="shrink-0 text-xs text-faint">covers</span>
          <select value={covered} onChange={(e) => setCovered(e.target.value)} className={inputCls}>
            <option value="">Covered leader…</option>
            {leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-faint">Until (optional)</label>
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={inputCls} />
          <button
            onClick={add}
            disabled={busy || !covering || !covered}
            className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "…" : "Add"}
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-sm" style={{ color: msg.startsWith("Saved") ? "var(--good)" : "var(--accent)" }}>{msg}</p>}
    </Card>
  );
}

// Bible Hangout resources shown on the Hangouts page: the standing guide +
// handbook links, and "this week's 527" (Leader + Handout). Paste Google Drive
// (or any) share links — leave a field blank to hide that link. Admin-only.
function HangoutResourcesSetting() {
  const [r, setR] = useState<HangoutResources>({ guideUrl: "", handbookUrl: "", week527: { title: "", leaderUrl: "", handoutUrl: "" }, word: { title: "", url: "", summary: "" } });
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getHangoutResourcesAction().then(setR).catch(() => {}); }, []);

  const setWeek = (patch: Partial<HangoutResources["week527"]>) => setR((prev) => ({ ...prev, week527: { ...prev.week527, ...patch } }));
  const setWord = (patch: Partial<HangoutResources["word"]>) => setR((prev) => ({ ...prev, word: { ...prev.word, ...patch } }));

  const save = async () => {
    setBusy(true); setSaved(null);
    try { await setHangoutResourcesAction(r); setSaved("Saved — live on the Hangouts page."); }
    catch { setSaved("Could not save."); }
    finally { setBusy(false); }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Bible Hangout resources</h2>
      <p className="mb-3 text-xs text-muted">
        Shown to every leader on the <b>Hangouts</b> page. Paste share links (Google Drive works — set the file to &ldquo;anyone with the link&rdquo;). Leave a field blank to hide it.
      </p>

      <p className="mb-1.5 text-xs font-medium text-faint">Standing resources</p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Bible Hangout guide link</span>
          <input value={r.guideUrl} onChange={(e) => setR((p) => ({ ...p, guideUrl: e.target.value }))} placeholder="https://…" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Leader Handbook link</span>
          <input value={r.handbookUrl} onChange={(e) => setR((p) => ({ ...p, handbookUrl: e.target.value }))} placeholder="https://…" className={inputCls} />
        </label>
      </div>

      <p className="mb-1.5 mt-4 text-xs font-medium text-faint">This week&apos;s 527</p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Lesson title</span>
          <input value={r.week527.title} onChange={(e) => setWeek({ title: e.target.value })} placeholder="e.g. You Are Already a Servant" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Leader version link</span>
          <input value={r.week527.leaderUrl} onChange={(e) => setWeek({ leaderUrl: e.target.value })} placeholder="https://…" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Handout version link</span>
          <input value={r.week527.handoutUrl} onChange={(e) => setWeek({ handoutUrl: e.target.value })} placeholder="https://…" className={inputCls} />
        </label>
      </div>

      <p className="mb-1.5 mt-4 text-xs font-medium text-faint">This week&apos;s word <span className="font-normal">· your voice note</span></p>
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Title / one idea</span>
          <input value={r.word.title} onChange={(e) => setWord({ title: e.target.value })} placeholder="e.g. Why we don't lead alone" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">Voice note link</span>
          <input value={r.word.url} onChange={(e) => setWord({ url: e.target.value })} placeholder="https://… (Drive, Dropbox, wherever it lives)" className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted">A few lines (so it stays findable after the chat scrolls past)</span>
          <textarea value={r.word.summary} onChange={(e) => setWord({ summary: e.target.value })} rows={3} placeholder="The one idea, in 2–3 lines." className={`${inputCls} resize-y`} />
        </label>
      </div>

      <button onClick={save} disabled={busy} className="mt-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
        {busy ? "Saving…" : "Save"}
      </button>
      {saved && <p className="mt-2 text-sm" style={{ color: saved.startsWith("Saved") ? "var(--good)" : "var(--accent)" }}>{saved}</p>}
    </Card>
  );
}

// The "what to expect at R20 Nights" blurb shown on the /hi link tree. Edit it
// each week (this week's scripture/songs, the vibe). Public-facing.
function NightsInfoSetting() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getNightsInfoSettingAction().then(setText).catch(() => {}); }, []);

  const save = async () => {
    setBusy(true); setSaved(null);
    try { await setNightsInfoAction(text); setSaved("Saved — live on the /hi card."); }
    catch { setSaved("Could not save."); }
    finally { setBusy(false); }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">What to expect · the evergreen blurb</h2>
      <p className="mb-3 text-xs text-muted">
        The always-on blurb at the <i>top</i> of the <b>/hi</b> &ldquo;what to expect&rdquo; view (the tap-card / QR at Nights): the vibe, come-as-you-are, the basics. Leave blank for the default. (This week&apos;s talk goes in the card below.)
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="New here? Here's the whole vibe — no surprises…"
        className={`${inputCls} resize-y`}
      />
      <button onClick={save} disabled={busy} className="mt-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
        {busy ? "Saving…" : "Save"}
      </button>
      {saved && <p className="mt-2 text-sm" style={{ color: saved.startsWith("Saved") ? "var(--good)" : "var(--accent)" }}>{saved}</p>}
    </Card>
  );
}

// The weekly "What to Expect Tonight" card shown on /hi's "expect" view. The
// sermon-prep app auto-publishes it, but an admin can hand-write or fix one here.
// Split pre-talk-safe (title/question/passages) vs after-the-talk (turn/open
// questions/next step + optional keep line / go deeper). Org-scoped server-side.
const EMPTY_TONIGHT: TonightCardInput = {
  effectiveDate: "",
  title: "",
  question: "",
  passages: [{ ref: "", why: "" }],
  turn: "",
  openQuestions: [""],
  nextStep: "",
  keepLine: "",
  goDeeper: "",
};

function TonightCardSetting() {
  const [card, setCard] = useState<TonightCardInput>(EMPTY_TONIGHT);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Load the latest published/edited card into the form; keep the repeatable
  // rows non-empty so there's always a blank row to type into.
  useEffect(() => {
    getTonightCardSettingAction()
      .then((c) => {
        if (!c) return;
        setCard({
          ...c,
          passages: c.passages.length ? c.passages.map((p) => ({ ref: p.ref, why: p.why ?? "", text: p.text ?? "" })) : [{ ref: "", why: "" }],
          openQuestions: c.openQuestions.length ? c.openQuestions : [""],
        });
      })
      .catch(() => {});
  }, []);

  const setField = <K extends keyof TonightCardInput>(k: K, v: TonightCardInput[K]) => setCard((p) => ({ ...p, [k]: v }));

  const setQuestion = (i: number, v: string) =>
    setCard((p) => ({ ...p, openQuestions: p.openQuestions.map((row, j) => (j === i ? v : row)) }));
  const addQuestion = () => setCard((p) => ({ ...p, openQuestions: [...p.openQuestions, ""] }));
  const removeQuestion = (i: number) =>
    setCard((p) => ({ ...p, openQuestions: p.openQuestions.length > 1 ? p.openQuestions.filter((_, j) => j !== i) : p.openQuestions }));

  const canSave = /^\d{4}-\d{2}-\d{2}$/.test(card.effectiveDate) && card.title.trim() !== "" && card.question.trim() !== "";
  const save = async () => {
    setBusy(true); setSaved(null);
    try {
      const res = await setTonightCardAction(card);
      setSaved(res.ok ? "Saved. Live on the /hi card." : (res.error ?? "Could not save."));
    } catch { setSaved("Could not save."); }
    finally { setBusy(false); }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">What to expect · this week&apos;s card</h2>
      <p className="mb-3 text-xs text-muted">
        The short weekly card below the evergreen blurb on <b>/hi</b>&apos;s &ldquo;what to expect.&rdquo; Keep it tight: an intro line, your <b>3 sermon points phrased as questions</b> (it&apos;s read <i>before</i> the talk, so don&apos;t give away the answer), and one low-pressure next step. Saturday, title &amp; intro are required.
      </p>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-faint">Saturday this card is for</span>
          <input type="date" value={card.effectiveDate} onChange={(e) => setField("effectiveDate", e.target.value)} className={inputCls} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-faint">Title <span className="font-normal">· the talk title</span></span>
          <input value={card.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Is anyone actually listening?" className={inputCls} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-faint">Intro <span className="font-normal">· one line that sets up the honest question</span></span>
          <textarea value={card.question} onChange={(e) => setField("question", e.target.value)} rows={2} placeholder="the hook — the real question tonight is chasing" className={`${inputCls} resize-y`} />
        </label>
      </div>

      <p className="mb-1.5 mt-4 text-xs font-medium text-faint">The 3 points <span className="font-normal">· your sermon points, phrased as questions (no spoiler)</span></p>
      <div className="flex flex-col gap-2">
        {card.openQuestions.map((qtext, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-xs font-semibold text-faint">{i + 1}</span>
            <input value={qtext} onChange={(e) => setQuestion(i, e.target.value)} placeholder="the point, as a question" className={inputCls} />
            <button onClick={() => removeQuestion(i)} className="shrink-0 text-xs font-medium text-muted underline" aria-label="Remove point">Remove</button>
          </div>
        ))}
        <button onClick={addQuestion} className="self-start text-xs font-semibold text-accent-ink underline">+ Add point</button>
      </div>

      <label className="mt-4 flex flex-col gap-1">
        <span className="text-xs font-medium text-faint">Next step <span className="font-normal">· one warm, zero-pressure nudge</span></span>
        <textarea value={card.nextStep} onChange={(e) => setField("nextStep", e.target.value)} rows={2} placeholder="bring it to a Hangout · ask us anything · no pressure" className={`${inputCls} resize-y`} />
      </label>

      <button onClick={save} disabled={busy || !canSave} className="mt-4 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--accent)" }}>
        {busy ? "Saving…" : "Save"}
      </button>
      {saved && <p className="mt-2 text-sm" style={{ color: saved.startsWith("Saved") ? "var(--good)" : "var(--accent)" }}>{saved}</p>}
    </Card>
  );
}

function TermSetting() {
  const [term, setTerm] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getActiveTermAction().then((t) => setTerm(t)).catch(() => {});
  }, []);

  const save = async () => {
    if (!term.trim()) return;
    setBusy(true);
    setSaved(null);
    try {
      await setTermAction(term);
      setSaved("Saved.");
    } catch {
      setSaved("Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Current term</h2>
      <p className="mb-3 text-xs text-muted">
        Labels reflections &amp; growth. Leave it and it auto-rolls each semester; set it to pin a specific term.
      </p>
      <div className="flex gap-2">
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="e.g. Fall 2026" className={inputCls} />
        <button
          onClick={save}
          disabled={busy || !term.trim()}
          className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "…" : "Save"}
        </button>
      </div>
      {saved && <p className="mt-2 text-sm" style={{ color: "var(--good)" }}>{saved}</p>}
    </Card>
  );
}

// The monthly reflection "retrieval prompt" — one question shown on the leader's
// reflection form. Swap it ~monthly; empty hides it.
function RetrievalPromptSetting() {
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getRetrievalPromptAction().then(setPrompt).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    setSaved(null);
    try {
      await setRetrievalPromptAction(prompt);
      setSaved(prompt.trim() ? "Saved — leaders see it on the reflection form." : "Cleared — no prompt shown.");
    } catch {
      setSaved("Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">This month&apos;s reflection question</h2>
      <p className="mb-3 text-xs text-muted">
        One retrieval question shown atop the reflection form — ask leaders to say, in their own words, the one thing from the last Core Night and where it showed up. Swap it monthly; leave blank to hide it.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="e.g. In your own words, what was the one thing from the last Core Night — and where did it actually show up this week?"
        className={`${inputCls} resize-y`}
      />
      <button
        onClick={save}
        disabled={busy}
        className="mt-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {busy ? "Saving…" : "Save question"}
      </button>
      {saved && <p className="mt-2 text-sm" style={{ color: "var(--good)" }}>{saved}</p>}
    </Card>
  );
}

// The coordinator's Saturday gate-alert number: a staff SMS fires on every
// last-minute "coming this Saturday" signup (they missed the Friday gate batch).
function CoordinatorAlertSetting() {
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCoordinatorAlertPhoneAction().then(setPhone).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    setSaved(null);
    try {
      const r = await setCoordinatorAlertPhoneAction(phone);
      setSaved(r.ok ? (phone.trim() ? "Saved — Saturday signups will text this number." : "Cleared — alerts off.") : (r.error ?? "Could not save."));
    } catch {
      setSaved("Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Saturday gate alerts</h2>
      <p className="mb-3 text-xs text-muted">
        When someone taps &ldquo;I want to come to R20 Nights&rdquo; <b className="text-ink">after the Friday 5 PM gate deadline</b> (Friday evening or any time Saturday) — too late for the batch — Oikos texts this number right away so a same-day guest registration can happen. Usually the coordinator&apos;s number; leave blank to turn alerts off.
      </p>
      <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="(212) 555-0100" className={inputCls} />
      <button
        onClick={save}
        disabled={busy}
        className="mt-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--accent)" }}
      >
        {busy ? "Saving…" : "Save number"}
      </button>
      {saved && <p className="mt-2 text-sm" style={{ color: "var(--good)" }}>{saved}</p>}
    </Card>
  );
}

// Accountability for removals: who removed whom, why, and one-tap restore.
function RecentlyRemoved() {
  const [rows, setRows] = useState<RemovedPerson[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => listRemovedAction().then(setRows).catch(() => {});
  useEffect(() => { load(); }, []);

  const restore = async (id: string) => {
    setBusy(id);
    try { await restorePersonAction(id); await load(); } finally { setBusy(null); }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">Recently removed</h2>
      <p className="mb-3 text-xs text-muted">
        Everyone removed, who removed them and why. Restore anyone in one tap — nothing is truly deleted.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No one&apos;s been removed.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.name}{r.campus ? <span className="font-normal text-muted"> · {r.campus}</span> : null}</p>
                <p className="text-xs text-muted">
                  {r.reason || "no reason given"}
                </p>
                <p className="mt-0.5 text-[11px] text-faint">
                  by {r.removedByName}{r.ownerName !== "—" ? ` · was ${r.ownerName}'s` : ""}
                </p>
              </div>
              <button
                onClick={() => restore(r.id)}
                disabled={busy === r.id}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-50"
                style={{ background: "var(--accent-soft)" }}
              >
                {busy === r.id ? "…" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ChangePassword() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== confirm) return setMsg({ ok: false, text: "Passwords don't match." });
    setBusy(true);
    const r = await setMyPasswordAction(pw);
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: "Password updated." });
      setPw("");
      setConfirm("");
    } else {
      setMsg({ ok: false, text: r.error ?? "Could not update." });
    }
  };

  return (
    <Card className="mb-4 p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">Your password</h2>
      <form onSubmit={save} className="flex flex-col gap-2">
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="new-password" className={inputCls} />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" className={inputCls} />
        {msg && (
          <p className="text-sm" style={{ color: msg.ok ? "var(--good)" : "var(--accent)" }}>
            {msg.text}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !pw || !confirm}
          className="mt-1 rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </Card>
  );
}

function Leaders() {
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("leader");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => listLeadersAction().then(setLeaders).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const toggleActive = async (l: LeaderRow) => {
    const retiring = !l.deactivatedAt;
    if (retiring && !confirm(`Retire ${l.name}? They won't be able to sign in and will drop off the leader lists. Reassign anyone they own first. You can bring them back anytime.`)) return;
    setBusy(true);
    const r = await setLeaderDeactivatedAction(l.id, retiring, retiring ? "Retired from Settings" : undefined);
    setBusy(false);
    if (!r.ok) setMsg({ ok: false, text: r.error ?? "Could not update." });
    load();
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await inviteLeaderAction({ name, email, role, password });
    setBusy(false);
    if (r.ok) {
      setMsg({ ok: true, text: `Added ${name}. Share their temporary password so they can sign in and change it.` });
      setName("");
      setEmail("");
      setPassword("");
      setRole("leader");
      load();
    } else {
      setMsg({ ok: false, text: r.error ?? "Could not add leader." });
    }
  };

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">Leaders</h2>

      <ul className="mb-4 flex flex-col gap-2">
        {leaders.map((l) => (
          <li key={l.id} className={`flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 ${l.deactivatedAt ? "opacity-60" : ""}`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {l.name}
                {l.deactivatedAt && <span className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold" style={{ background: "var(--surface)", color: "var(--muted)" }}>retired</span>}
              </p>
              <p className="truncate text-xs text-muted">{l.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                style={
                  l.role === "admin"
                    ? { background: "var(--accent-soft)", color: "var(--accent-ink)" }
                    : { background: "var(--surface)", color: "var(--muted)" }
                }
              >
                {l.role}
              </span>
              <button
                onClick={() => toggleActive(l)}
                disabled={busy}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted hover:text-ink disabled:opacity-40"
              >
                {l.deactivatedAt ? "Reactivate" : "Retire"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <p className="mb-2 text-xs font-medium text-faint">Add a leader</p>
      <form onSubmit={add} className="flex flex-col gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inputCls} />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@r20.nyc" className={inputCls} />
        <div className="flex gap-2">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
            <option value="leader">Leader</option>
            <option value="admin">Admin</option>
          </select>
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Temp password" className={inputCls} />
        </div>
        {msg && (
          <p className="text-sm" style={{ color: msg.ok ? "var(--good)" : "var(--accent)" }}>
            {msg.text}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !name || !email || !password}
          className="mt-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
          style={{ background: "var(--accent-soft)" }}
        >
          {busy ? "Adding…" : "Add leader"}
        </button>
      </form>
    </Card>
  );
}
