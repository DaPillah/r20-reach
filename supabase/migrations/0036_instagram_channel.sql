-- Instagram-DM as a follow-up channel (Phase 1 — manual MVP).
--
-- The R20 30-Second Survey ends with an optional opt-in where a person picks how
-- to be reached — "text" OR "Instagram DM" — and hands over a first name + a
-- number or a handle. Oikos is phone/SMS-centric (Twilio); this lets a leader
-- record & follow up on IG-handed contacts as a first-class channel.
--
-- TWO columns on person:
--   • instagram_handle  — the @handle they gave (stored without the leading '@').
--   • preferred_contact — which channel they chose: 'text' | 'instagram'.
--     Defaults to 'text' so every existing row keeps SMS-first behavior. This is
--     a CHANNEL PREFERENCE, NOT consent — SMS consent still lives in sms_consent
--     + consent_event, and is unaffected by this column.
--
-- GUARDRAIL (enforced in app code, restated here so the schema documents intent):
-- Instagram is NOT covered by SMS consent / STOP. A handed-over handle = consent
-- to an IG invite ONLY. IG-preferred contacts must NOT be texted and must NOT be
-- enrolled in SMS journeys — the channels stay separate. (Phase 2 adds the
-- inbound-first automation Meta actually allows; see INSTAGRAM-SETUP.md.)
--
-- NB: pipeline_activity.type has no CHECK constraint, so the new 'instagram_dm'
-- touch type needs no schema change here — it logs like any other touch.
set search_path to r20reach, public;

alter table person add column if not exists instagram_handle text;

alter table person add column if not exists preferred_contact text not null default 'text';
alter table person drop constraint if exists person_preferred_contact_check;
alter table person add constraint person_preferred_contact_check
  check (preferred_contact in ('text','instagram'));
