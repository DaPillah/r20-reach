// Unit tests for the deterministic presentation helpers. Every function here
// takes `now` explicitly (or is pure), so no wall-clock/timezone flake.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initials,
  daysBetween,
  relativeDays,
  relativeFuture,
  todayET,
  smsHref,
} from "../src/lib/format.ts";

const NOW = new Date("2026-09-10T12:00:00-04:00");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

test("initials", () => {
  assert.equal(initials("Maya", "Lin"), "ML");
  assert.equal(initials("alex", "brooks"), "AB");
  assert.equal(initials("", ""), "");
});

test("daysBetween counts whole days elapsed", () => {
  assert.equal(daysBetween(daysAgo(5), NOW), 5);
  assert.equal(daysBetween(daysAgo(0), NOW), 0);
});

test("relativeDays: past-facing buckets", () => {
  assert.equal(relativeDays(null, NOW), "never");
  assert.equal(relativeDays(daysAgo(0), NOW), "today");
  assert.equal(relativeDays(daysAgo(1), NOW), "yesterday");
  assert.equal(relativeDays(daysAgo(3), NOW), "3 days ago");
  assert.equal(relativeDays(daysAgo(10), NOW), "last week");
  assert.equal(relativeDays(daysAgo(45), NOW), "6 weeks ago");
  assert.equal(relativeDays(daysAgo(70), NOW), "2 months ago");
});

test("relativeFuture: forward-facing buckets", () => {
  assert.equal(relativeFuture(null, NOW), "");
  assert.equal(relativeFuture(daysAhead(1), NOW), "tomorrow");
  assert.equal(relativeFuture(daysAhead(3), NOW), "in 3 days");
  assert.equal(relativeFuture(daysAgo(2), NOW), "today"); // past instants clamp to today
});

test("todayET uses US Eastern, not UTC (no day-early flip in the evening)", () => {
  // 9:00pm ET on Sep 10 is already Sep 11 in UTC — must still read Sep 10.
  assert.equal(todayET(new Date("2026-09-11T01:00:00Z")), "2026-09-10");
  assert.equal(todayET(new Date("2026-09-10T12:00:00-04:00")), "2026-09-10");
});

test("smsHref builds an iOS-safe sms: deep link with an encoded body", () => {
  assert.equal(smsHref("+14155552671", "hi there"), "sms:+14155552671&body=hi%20there");
});
