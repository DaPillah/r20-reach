// Unit tests for the send-window / quiet-hours math (pure, ET wall-clock).
// 2026-09-10 is a Thursday; September is EDT (-04:00).
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextWindowStart } from "../src/lib/sendwindow.ts";

const at = (iso: string) => new Date(iso);

test("null (send now) when the moment is inside the window", () => {
  const now = at("2026-09-10T12:00:00-04:00"); // noon ET
  assert.equal(nextWindowStart({ earliest: "08:00", latest: "21:00" }, now), null);
});

test("earlier than the window today -> opens later the same day", () => {
  const now = at("2026-09-10T06:00:00-04:00"); // 6am ET
  assert.deepEqual(nextWindowStart({ earliest: "08:00", latest: "21:00" }, now), {
    date: "2026-09-10",
    time: "08:00",
  });
});

test("past the window -> next calendar day at open time", () => {
  const now = at("2026-09-10T22:00:00-04:00"); // 10pm ET Thursday
  assert.deepEqual(nextWindowStart({ earliest: "08:00", latest: "21:00" }, now), {
    date: "2026-09-11",
    time: "08:00",
  });
});

test("day-of-week filter -> jumps to the next allowed day", () => {
  const now = at("2026-09-10T12:00:00-04:00"); // Thursday
  assert.deepEqual(nextWindowStart({ days: ["mon"], earliest: "09:00" }, now), {
    date: "2026-09-14", // the following Monday
    time: "09:00",
  });
});

test("no constraints -> always inside the window (send now)", () => {
  const now = at("2026-09-10T03:00:00-04:00");
  assert.equal(nextWindowStart({}, now), null);
});
