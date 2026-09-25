// Invariant tests for the pure queue/draft logic (REVAMP.md stage 1).
// Zero-dependency: Node 26 strips TS types natively — run with `npm test`
// (node --test tests/). These pin the do-not-break behaviors BEFORE any
// refactor; every later stage must keep them green.
import { test } from "node:test";
import assert from "node:assert/strict";
import { activeRsvpFor, cleanEventSlug, type EventRsvp, type LiveEventConfig } from "../src/lib/events.ts";
import { computeNudges, draftFor, eventInviteDraft, eventThanksDraft, restingPeople } from "../src/lib/logic.ts";
import type { Person } from "../src/lib/types.ts";

const NOW = new Date("2026-09-10T12:00:00-04:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

const person = (over: Partial<Person> = {}): Person => ({
  id: over.id ?? "p1",
  firstName: "Maya",
  lastName: "Lin",
  campus: "Columbia",
  phone: "+19995550000",
  stage: "Campus",
  ownerId: "m1",
  hangoutId: null,
  lastTouchAt: null,
  createdAt: daysAgo(30),
  ...over,
});

const rsvp = (over: Partial<EventRsvp> = {}): EventRsvp => ({
  headline: "Game night.",
  when: "Tonight · 8pm",
  where: "Carman basement.",
  sms: "hey {name}, it's {leader}! game night {when} at {where} rsvp: {link}",
  feeders: ["float"],
  ...over,
});

// ── activeRsvpFor (invariant 6) ──────────────────────────────────────────────
test("no feeders ⇒ nobody is pre-filled", () => {
  assert.equal(activeRsvpFor(["float"], { gn: rsvp({ feeders: [] }) }), null);
  assert.equal(activeRsvpFor(["float"], { gn: rsvp({ feeders: undefined }) }), null);
});

test("feeder attendance matches; attending the event itself disqualifies", () => {
  assert.equal(activeRsvpFor(["float"], { gn: rsvp() })?.[0], "gn");
  assert.equal(activeRsvpFor(["float", "gn"], { gn: rsvp() }), null);
});

test("excludeFeeders disqualifies even on a feeder match", () => {
  assert.equal(activeRsvpFor(["float", "paint"], { gn: rsvp({ excludeFeeders: ["paint"] }) }), null);
  assert.equal(activeRsvpFor(["float"], { gn: rsvp({ excludeFeeders: ["paint"] }) })?.[0], "gn");
});

// ── eventInviteDraft (invariants 7, 11) ──────────────────────────────────────
const cfg = (rsvpMap: Record<string, EventRsvp>, thanks: LiveEventConfig["thanks"] = {}): LiveEventConfig => ({
  rsvp: rsvpMap,
  phrases: { float: "the float" },
  thanks,
});

test("never-touched attendee gets the invite with every tag substituted", () => {
  const d = eventInviteDraft(person({ events: ["float"] }), "Maria", cfg({ gn: rsvp() }));
  assert.ok(d && d.includes("Maya") && d.includes("Maria") && d.includes("Carman"));
  assert.ok(!/[{}]/.test(d!), `unsubstituted tag left in: ${d}`);
});

test("touched + smsFollowup ⇒ the second touch; no followup ⇒ invite again", () => {
  const m = rsvp({ smsFollowup: "hey {name}, all good!" });
  const p = person({ events: ["float"], lastTouchAt: daysAgo(1) });
  assert.match(eventInviteDraft(p, "Maria", cfg({ gn: m }))!, /all good/);
  assert.match(eventInviteDraft(p, "Maria", cfg({ gn: rsvp() }))!, /game night/);
});

test("personal event_invite template overrides wording but keeps the facts", () => {
  const d = eventInviteDraft(
    person({ events: ["float"] }), "Maria", cfg({ gn: rsvp() }),
    { event_invite: "yo [FIRST_NAME] — {when} {where} {link}" },
  );
  assert.ok(d!.startsWith("yo Maya") && d!.includes("Carman") && d!.includes("/event?e=gn"));
});

// ── draft priority: update → thanks → invite → stage (invariant 3) ───────────
test("update beats thanks beats invite", () => {
  const c: LiveEventConfig = {
    rsvp: { gn: rsvp({ remind: true, remindSince: daysAgo(1), smsUpdate: "UPDATE {name}" }) },
    phrases: {},
    thanks: { old: { sms: "THANKS {name}", since: daysAgo(1) } },
  };
  // RSVP'd to gn + attended old ⇒ update wins
  assert.match(draftFor(person({ events: ["gn", "old"], lastTouchAt: daysAgo(3) }), "D", undefined, c), /^UPDATE/);
  // only attended old ⇒ thanks
  assert.match(draftFor(person({ events: ["old"], lastTouchAt: daysAgo(3) }), "D", undefined, c), /^THANKS/);
  // only attended a feeder ⇒ invite
  assert.match(draftFor(person({ events: ["float"] }), "D", undefined, c), /game night/);
  // no events ⇒ stage draft
  assert.match(draftFor(person({}), "D", undefined, c), /really glad you connected/);
});

// ── wave rest: one send during a live wave satisfies it (invariant 4) ────────
test("thanks: touched after `since` ⇒ no thanks draft", () => {
  const c = cfg({}, { old: { sms: "THANKS {name}", since: daysAgo(2) } });
  assert.equal(eventThanksDraft(person({ events: ["old"], lastTouchAt: daysAgo(1) }), "D", c), null);
  assert.match(eventThanksDraft(person({ events: ["old"], lastTouchAt: daysAgo(3) }), "D", c)!, /^THANKS/);
});

test("reminder wave: touched since remindSince rests; touched before re-cards", () => {
  const c = cfg({ gn: rsvp({ remind: true, remindSince: daysAgo(1) }) });
  const texted_before_wave = person({ id: "a", events: ["float"], lastTouchAt: daysAgo(2) });
  const texted_during_wave = person({ id: "b", events: ["float"], lastTouchAt: daysAgo(0) });
  const ids = computeNudges([texted_before_wave, texted_during_wave], NOW, "D", undefined, c).map((n) => n.personId);
  assert.ok(ids.includes("a"), "pre-wave texted person must re-card");
  assert.ok(!ids.includes("b"), "texted-during-wave person must rest");
  // ...and the rested one shows in Recently texted instead
  const resting = restingPeople([texted_during_wave], NOW, new Set(ids));
  assert.equal(resting.length, 1);
});

// ── one card per person; follow-back check outranks waves (invariant 5) ──────
test("a person qualifying for two surfaces gets exactly one card; followCheck wins", () => {
  const c: LiveEventConfig = {
    rsvp: { gn: rsvp({ remind: true, remindSince: daysAgo(1) }) },
    phrases: {},
    thanks: {},
  };
  const p = person({
    events: ["float"], lastTouchAt: daysAgo(2),
    instagramHandle: "maya.lin", preferredContact: "instagram",
    followRequestedAt: daysAgo(3),
  });
  const nudges = computeNudges([p], NOW, "D", undefined, c);
  assert.equal(nudges.length, 1);
  assert.equal(nudges[0].followCheck, true);
});

// ── dormant people appear nowhere (invariant 10) ─────────────────────────────
test("dormant people are in no queue or wave", () => {
  const c = cfg({ gn: rsvp({ remind: true, remindSince: daysAgo(1) }) });
  const p = person({ events: ["float"], lastTouchAt: daysAgo(20), dormantAt: daysAgo(5) });
  assert.equal(computeNudges([p], NOW, "D", undefined, c).length, 0);
  assert.equal(restingPeople([p], NOW, new Set()).length, 0);
});

// ── slug hygiene ─────────────────────────────────────────────────────────────
test("cleanEventSlug normalizes junk", () => {
  assert.equal(cleanEventSlug("  Game Night!! "), "game-night");
  assert.equal(cleanEventSlug("<script>"), "script");
  assert.equal(cleanEventSlug("///"), null);
  assert.equal(cleanEventSlug(42), null);
});
