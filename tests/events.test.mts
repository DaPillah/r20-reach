// Unit tests for the pure event helpers: RSVP resolution (incl. the recurring
// R20 Nights slug rule), invite phrasing, labels, and check-in detail composition.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  eventRsvp,
  R20_NIGHTS_RSVP,
  pastEventPhrase,
  eventLabel,
  composeEventDetail,
  type EventRsvp,
} from "../src/lib/events.ts";

test("eventRsvp: unknown/blank slugs resolve to null", () => {
  assert.equal(eventRsvp(undefined), null);
  assert.equal(eventRsvp("not-a-configured-event", {}), null);
});

test("eventRsvp: an explicit map entry wins", () => {
  const custom: EventRsvp = { headline: "Game night.", when: "Fri 8pm", where: "Lerner", sms: "" };
  assert.equal(eventRsvp("game-night", { "game-night": custom }), custom);
});

test("eventRsvp: any r20-nights-YYYY-MM-DD slug maps to the recurring R20 Nights card", () => {
  assert.equal(eventRsvp("r20-nights-2026-09-12"), R20_NIGHTS_RSVP);
  assert.equal(eventRsvp("r20-nights-2027-01-03"), R20_NIGHTS_RSVP);
});

test("eventRsvp: a malformed r20-nights slug does NOT match the recurring rule", () => {
  assert.equal(eventRsvp("r20-nights-latest"), null);
  assert.equal(eventRsvp("r20-nights-2026-9-12"), null); // needs zero-padded MM-DD
});

test("eventRsvp: a real map entry for that exact slug still overrides the recurring rule", () => {
  const override: EventRsvp = { headline: "Special.", when: "x", where: "y", sms: "" };
  assert.equal(eventRsvp("r20-nights-2026-09-12", { "r20-nights-2026-09-12": override }), override);
});

test("eventLabel: slug -> Title Case display", () => {
  assert.equal(eventLabel("games-night-1"), "Games Night 1");
  assert.equal(eventLabel("field-game"), "Field Game");
});

test("pastEventPhrase: none, one, and multiple known events", () => {
  assert.equal(pastEventPhrase([], "upcoming"), "out");
  assert.equal(pastEventPhrase(["field-game-1"], "upcoming"), "to field games");
  assert.equal(
    pastEventPhrase(["field-game-1", "icecream-float"], "upcoming"),
    "to field games + the ice cream float",
  );
});

test("pastEventPhrase: excludes the upcoming slug itself and unknown slugs", () => {
  assert.equal(pastEventPhrase(["upcoming"], "upcoming"), "out");
  assert.equal(pastEventPhrase(["totally-unknown"], "upcoming"), "out");
});

test("composeEventDetail: composes short labels and honors a revealed follow-up", () => {
  const detail = composeEventDetail("scavenger-hunt", {
    signup_type: "Team",
    team_name: "Wolves",
    dietary: "none",
  });
  assert.equal(detail, "Signup: Team · Team: Wolves · Dietary/access: none");
});

test("composeEventDetail: drops a reveal answer when its parent option isn't chosen", () => {
  const detail = composeEventDetail("scavenger-hunt", {
    signup_type: "Solo",
    team_name: "ignored",
  });
  assert.equal(detail, "Signup: Solo");
});

test("composeEventDetail: null for unknown slug or empty answers", () => {
  assert.equal(composeEventDetail("no-fields-event", { a: "b" }), null);
  assert.equal(composeEventDetail("scavenger-hunt", {}), null);
});
