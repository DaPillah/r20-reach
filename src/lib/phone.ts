import { parsePhoneNumberFromString } from "libphonenumber-js";

// Normalize a raw phone string to E.164 (US default), the form stored in
// person.phone_e164 and used for dedupe (person_phone_uq). Returns null when the
// input is empty or not a valid number — callers treat null as "no phone".
export function toE164(raw?: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const parsed = parsePhoneNumberFromString(trimmed, "US");
  return parsed?.isValid() ? parsed.number : null;
}
