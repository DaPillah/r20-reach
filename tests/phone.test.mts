// Unit tests for phone normalization to E.164 (US default).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toE164 } from "../src/lib/phone.ts";

test("normalizes common US formats to the same E.164 value", () => {
  const canonical = "+14155552671";
  assert.equal(toE164("+14155552671"), canonical);
  assert.equal(toE164("4155552671"), canonical);
  assert.equal(toE164("(415) 555-2671"), canonical);
  assert.equal(toE164("415-555-2671"), canonical);
  assert.equal(toE164("  415.555.2671  "), canonical);
});

test("returns null for empty / missing input", () => {
  assert.equal(toE164(""), null);
  assert.equal(toE164("   "), null);
  assert.equal(toE164(null), null);
  assert.equal(toE164(undefined), null);
});

test("returns null for non-numbers and clearly invalid input", () => {
  assert.equal(toE164("not a phone"), null);
  assert.equal(toE164("12"), null);
});
