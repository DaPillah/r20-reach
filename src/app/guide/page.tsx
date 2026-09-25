"use client";

// In-app user guide. Plain-language, mobile-first, matches the app. Reachable
// from Settings; admin-only sections gated by isAdmin. Content is data so it
// stays easy to edit as features change.
import Link from "next/link";
import { useReach } from "@/lib/store";
import { Card } from "@/components/ui";
import { STAGES, STAGE_META } from "@/lib/types";

export default function GuidePage() {
  const { isAdmin, leaderName, authedId, coordinatorId } = useReach();
  const me = leaderName(authedId).split(/\s+/)[0];
  const iAmCoordinator = coordinatorId != null && coordinatorId === authedId;

  return (
    <div className="pb-8">
      <Link href="/settings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        Settings
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">How Oikos works</h1>
      <p className="mt-1 mb-5 text-sm text-muted">
        Hey {me} — this is your quick guide. Oikos exists so that{" "}
        <span className="italic">no&nbsp;one</span> who connects with R20 slips through the cracks.
        It&apos;s built to take ~5 minutes a day.
      </p>

      <div className="flex flex-col gap-3">
        <Section emoji="🚀" title="New here? The 60-second version">
          <ol className="ml-4 list-decimal space-y-1">
            <li>Set your password — <b>Settings → Your password</b>.</li>
            <li>Open <b>Today</b>. It lists exactly who to check in with — the list is the plan.</li>
            <li>Tap <b>Send text</b> (it goes from your own phone) or <b>Log</b> if you reached out another way.</li>
          </ol>
          <p className="mt-2">That&apos;s the whole daily rhythm. Everything below is just detail.</p>
        </Section>

        <Section emoji="☀️" title="Today — your daily 5 minutes">
          <p>Open the app and start here. <b>Today</b> shows exactly who you owe a check-in — people you own who are new or haven&apos;t heard from you in a while. Nothing to figure out; the list is the plan.</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li><b>Send text</b> opens your Messages app with a message already written — you send it from <i>your own number</i>, so it lands as a normal text from you. Edit it first if you want.</li>
            <li><b>Log</b> records that you reached out another way — tap it and pick how (called, met up, DM&apos;d, prayed) so they drop off the list.</li>
            <li><b>Snooze</b> hides someone until later if now isn&apos;t the moment.</li>
          </ul>
          <p className="mt-2">Get to what you can. Anything you miss, R20 will eventually send a gentle nudge from the team number — so no one goes cold.</p>
        </Section>

        <Section emoji="✍️" title="Make the texts sound like you">
          <p>The pre-written drafts are just a starting point. In <b>Settings → Your texts</b> you can rewrite each one in your own voice — type <code className="rounded bg-surface-2 px-1">[FIRST_NAME]</code> where their name should go (or leave it out, like &ldquo;how&apos;s it going g&rdquo;). Blank means keep the default.</p>
        </Section>

        <Section emoji="👥" title="People & profiles">
          <p><b>People</b> is your whole roster — search and filter to find anyone. Tap a person to open their profile, where you can:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li>Log a touch, or advance them to the next stage as they grow. Logged one by mistake? Tap the trash icon on that timeline entry to remove it.</li>
            <li>Place them in a Bible Hangout.</li>
            <li><b>Rest</b> someone for a season — they drop off your Today list but stay in the roster (one tap to reconnect). Far better than removing someone who&apos;s just gone quiet.</li>
            <li>Mark someone as <b>serving</b> once they take on a role.</li>
            <li>Marking someone you&apos;re pouring into as an <b>apprentice</b> prompts you to jot your next step with them.</li>
            <li>Edit, reassign, or <b>remove</b> them — removing is reversible and asks for a reason (it&apos;s for duplicates or wrong entries, not for someone who&apos;s drifting — rest them instead).</li>
            <li>Add <b>private notes</b> (pastoral notes are visible only to the pastoral team).</li>
          </ul>
          <p className="mt-2">Meet someone new? <b>Add a person</b> and they enter your follow-up right away.</p>
        </Section>

        <Section emoji="🫂" title="Hangouts & the weekly reflection">
          {isAdmin ? (
            <p>Under <b>Reflect</b> you can open any Bible Hangout leader to read their weekly reflections across the semester and add growth notes — this is the mid- and end-semester review view. (You don&apos;t lead a Hangout yourself, so there&apos;s nothing to submit — just pick a leader to review.)</p>
          ) : (
            <>
              <p>If you lead a Bible Hangout, <b>Reflect</b> is where you log it each week — takes five minutes after your Hangout:</p>
              <ul className="ml-4 mt-2 list-disc space-y-1">
                <li>Mark who came and who was missing (tap <b>Here / Out</b> against your roster), and add any new faces — they become real people in your follow-up.</li>
                <li>Jot a key moment, anyone you&apos;re concerned about, and honestly how <i>you&apos;re</i> doing (that last part is private to the pastoral team).</li>
                <li>The <b>Growth</b> tab is your own reflection on how you&apos;re growing as a leader — narrative, never a score.</li>
              </ul>
              <p className="mt-2">Today will remind you if this week&apos;s reflection isn&apos;t in yet. And your pastor may write back — <b>look for their reply right under your entry</b>, so it&apos;s worth checking in after you submit.</p>
              <p className="mt-2">The <b>Hangouts</b> page is also where the week&apos;s resources live — <b>this week&apos;s word</b> (a short voice note), this week&apos;s <b>527</b>, and the standing guide + handbook.</p>
            </>
          )}
        </Section>

        <Section emoji="🌱" title="The 5 commitment levels: Campus → Crowd → Community → Committed → Core">
          <p>Everyone&apos;s on a journey inward — from just on our radar to serving and being sent. A person&apos;s stage is a shorthand for where they are right now. (It&apos;s internal — never shown to them.)</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {STAGES.map((s) => (
              <li key={s} className="flex gap-2.5">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: STAGE_META[s].color }} />
                <span>
                  <b>{s}</b> <span className="text-faint">· {STAGE_META[s].headline}</span> — {STAGE_META[s].def}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-faint">
            Adapted from Rick Warren&apos;s five circles of commitment (<i>The Purpose Driven Church</i>), localized to campus and sharpened by the R20 leadership guide. The <b>Funnel</b> tab shows the whole picture; move someone forward from their profile as they grow — or back if they drift, which just keeps their follow-up right-sized.
          </p>
        </Section>

        <Section emoji="💬" title="Automatic follow-up texts (journeys)">
          <p>Alongside your own texts, Oikos can run gentle automatic text sequences — we call them <b>journeys</b>. Each is <b>signed with a leader&apos;s name</b>, in a human voice, so it reads like a real person:</p>
          <ul className="ml-4 mt-2 list-disc space-y-1">
            <li><b>Welcome</b> — a warm &ldquo;you&apos;re connected&rdquo; note when someone new gives their number.</li>
            <li><b>Come to Nights</b> — a few Saturday reminders to someone who signed up cold (an event, the survey, an &ldquo;I want to come&rdquo; tap) until they make it to R20 Nights.</li>
            <li><b>New Believer</b> — for someone who took a step toward Jesus: gentle notes while a real person walks them toward a Hangout.</li>
            <li><b>Assimilation</b> — nudges a first-time guest toward a Bible Hangout.</li>
            <li><b>Stay Warm</b> — a few no-agenda check-ins over ~10 weeks for someone who&apos;s gone quiet, then rest.</li>
          </ul>
          <p className="mt-2"><b>The rule that makes this safe:</b> the moment you personally text or log a touch, that person&apos;s journey goes quiet — automation never messages someone a leader is already talking to. People who connected on <b>Instagram only</b> are never in an SMS journey (a handle isn&apos;t texting consent), and only consented numbers ever get a text.</p>
          <p className="mt-2"><b>Starting &amp; stopping:</b> on a person&apos;s profile, under <b>Follow-up journeys</b>, a leader can start one (New Believer / Assimilation / Stay Warm) or <b>Stop</b> any journey that person is in. <span className="text-faint">The team switches each journey on deliberately as we&apos;re ready — they don&apos;t all start sending at launch.</span></p>
        </Section>

        <Section emoji="🔗" title="Inviting people">
          <p><b>/invite</b> creates a personal link and QR code you can share anywhere — anyone who joins through it is tied back to you, so they land in <i>your</i> follow-up. Great for events, DMs, or a poster.</p>
        </Section>

        <Section emoji="🤝" title="Covering for each other">
          <p>Sometimes one leader tends another&apos;s people for a season — say, while someone&apos;s away for the summer. If you&apos;re covering for someone, their people show up in <b>your</b> Today with a note that you&apos;re covering them, so no one goes untended. Admins set this up in <b>Settings → Coverage</b>.</p>
        </Section>

        {isAdmin && (
          <Section emoji="⚙️" title="For admins: Overview & settings">
            <p><b>Overview</b> is the whole pipeline at a glance. The <b>Movement</b> section is our &ldquo;how&apos;s business&rdquo; view — new people reached, who&apos;s advancing, where people are piling up (the <i>bottleneck</i>), plus reach and serving. It measures the <i>movement</i> in aggregate — never a score on any person. You also see each leader&apos;s check-in coverage, and (pastoral team) reflection status.</p>
            <p className="mt-2"><b>Overview → Follow-up journeys</b> is where you control the automatic texts: each journey shows how many people are in it and whether it&apos;s <b>on</b> or <b>on hold</b>. Put one on hold to pause everyone in it and stop new people being added; turn it on when you&apos;re ready to launch. Use this to decide <i>when</i> Come to Nights starts texting.</p>
            <p className="mt-2">Extra <b>Settings</b>:</p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li><b>Coordinator</b> — who catches any new signup that can&apos;t be auto-assigned to a leader.</li>
              <li><b>Coverage</b> — have one leader tend another&apos;s people for a season.</li>
              <li><b>Current term</b> — the semester label for reflections.</li>
              <li><b>Leaders</b> — add a leader and set their temporary password, or <b>retire / reactivate</b> a login when someone joins or steps back (retiring is reversible; reassign their people first).</li>
              <li><b>This month&apos;s reflection question</b> — the one retrieval question leaders see atop their reflection form; swap it monthly.</li>
              <li><b>Recently removed</b> — everyone removed, why, and who did it, with one-tap restore.</li>
            </ul>
          </Section>
        )}

        {isAdmin && (
          <Section emoji="📥" title={iAmCoordinator ? "Your lane as coordinator" : "The coordinator's lane"}>
            <p>{iAmCoordinator ? "You're the coordinator — the" : "The coordinator is the"} human backstop: every new signup that can&apos;t be tied to a leader lands in {iAmCoordinator ? "your" : "their"} <b>Today</b>. That includes first-time guests, questions, prayer requests, survey opt-ins, cold &ldquo;I want to come&rdquo; taps, 101 <b>&ldquo;I&apos;m in&rdquo;</b> commitments, and <b>&ldquo;I took a step toward Jesus&rdquo;</b>.</p>
            <ul className="ml-4 mt-2 list-disc space-y-1">
              <li><b>The one non-negotiable: a same-day human text</b> to every new person in the queue. The automation only backstops — the warm first touch is a person.</li>
              <li><b>🙏 A step toward Jesus is the exception to weekly rhythm:</b> reach out same-day <i>and</i> tell the pastor right away — a decision never sits in a queue.</li>
              <li><b>Then hand them off</b> — once they&apos;re connected, assign them to the right leader from their profile so they leave the coordinator&apos;s queue and enter real follow-up. <span className="text-faint">(Hangout placement is greyed out until Hangouts start.)</span></li>
              <li><b>Loading an outreach batch — People → Add → &ldquo;Add many at once&rdquo;:</b> when a leader hands you a list from a DM push or a tabling day, paste it in — <b>one per line</b>, either <i>Name, @handle</i> or <i>Name, phone number</i>. Choose the <b>campus</b>, and because you&apos;re an admin you&apos;ll see <b>&ldquo;Assign all to&rdquo;</b> — set it to the leader who collected them so the people land in <i>their</i> queue (run it once per leader if a list is split between two). A live preview shows how each row reads before you submit; <b>duplicates are skipped automatically</b>, and every new person is logged with a first outreach touch so they show up ready to follow up. Instagram handles carry <b>no text consent</b> — these are for personal DMs and human follow-up, never broadcasts.</li>
              <li><b>101 &ldquo;I&apos;m in&rdquo;</b> also means adding them to the members&apos; group chat.</li>
              <li><b>The Friday gate list:</b> Columbia&apos;s campus is CUID + registered guests only. Overview&apos;s <b>Saturday gate list</b> shows only the people <i>still needing</i> registration for the upcoming Saturday (copy button included) — get it to a Columbia student leader to submit in the guest portal <b>before 5 PM Friday</b> (groups over 2 can&apos;t be added after). The portal takes <b>multi-day batches</b>, so register regulars for weeks of Saturdays at once, then tap <b>&ldquo;Mark covered&rdquo;</b> with the last date — they leave the list and come back automatically when it passes. Each guest gets a one-day QR by email and shows a matching ID at 116th &amp; Broadway, 116th &amp; Amsterdam, or Wien Gate. Chase missing emails first.</li>
              <li><b>Last-minute signups text you:</b> if your number is set in Settings → Saturday gate alerts, every &ldquo;I want to come&rdquo; tap <b>after Friday 5 PM</b> (Friday evening or Saturday) pings your phone — those missed the batch, so grab a Columbia leader for a same-day registration (2 per leader).</li>
              <li><b>The Saturday DM list:</b> people who opted in on <b>Instagram only</b> never get the text reminders (an IG opt-in isn&apos;t SMS consent) — Overview&apos;s <b>Saturday DM list</b> gathers them. On Saturday, DM each one personally about tonight: paced, one at a time, in your own words — never a paste-blast. Log it as a &ldquo;DMed on IG&rdquo; touch on their profile so the list knows they&apos;re covered.</li>
              <li><b>The weekly report:</b> once a week — Sunday evening, after Nights — send the pastor a short rundown: new people this week, anyone not reached same-day, anyone whose message needs more than a warm welcome, and the <b>&ldquo;not reached yet&rdquo;</b> flags in Overview&apos;s Recent commitments.</li>
            </ul>
          </Section>
        )}

        <Section emoji="🔑" title="Your account">
          <p>Change your password anytime in <b>Settings → Your password</b> — please do that on your first login. Signed-in on your phone, you can add Oikos to your home screen so it opens like an app.</p>
        </Section>
      </div>

      <p className="mt-6 text-center text-xs text-faint">Stuck on something? Ask in the leaders&apos; chat — someone&apos;s got you.</p>
    </div>
  );
}

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <span aria-hidden className="text-lg">{emoji}</span>
        {title}
      </h2>
      <div className="text-sm leading-relaxed text-muted [&_b]:text-ink [&_code]:text-ink">{children}</div>
    </Card>
  );
}
