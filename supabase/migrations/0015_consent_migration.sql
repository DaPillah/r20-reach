-- 0015_consent_migration.sql — migrate SMS consent from VisitorReach.
--
-- Basis (Alex, 2026-07-04): the imported John 6:12 roster = members who were
-- already on R20's VisitorReach texting service, i.e. previously opted in to
-- R20 texts. TCPA consent attaches to the BRAND (R20), not the platform, so
-- switching providers (VR -> Oikos/Twilio) does not require re-consent.
--
-- Defensibility: we don't just flip the flag — every migrated person gets an
-- append-only consent_event (source='migrated_visitorreach') recording the
-- basis + date. Scope: imported members only (custom.source='members_sheet')
-- who still have consent 'unknown' AND a phone number. /join captures who
-- deliberately left the box unticked are NOT touched. People without phones
-- stay 'unknown' (nothing to consent for the sms channel).
--
-- Residual risk handled at go-live (see HANDOFF checklist): anyone who texted
-- STOP to the old VR number must be cross-checked against VR's unsubscribe
-- list before the first real send.
set search_path to r20reach, public;

with migrated as (
  update person
     set sms_consent = 'opted_in', updated_at = now()
   where archived_at is null
     and custom->>'source' = 'members_sheet'
     and sms_consent = 'unknown'
     and phone_e164 is not null
  returning id, org_id
)
insert into consent_event (org_id, person_id, channel, event, source, consent_text, occurred_at)
select org_id, id, 'sms', 'opt_in', 'migrated_visitorreach',
       'Consent migrated from R20''s prior texting service (VisitorReach): contact was an existing member previously opted in to R20 texts. Basis confirmed by Alex 2026-07-04; consent attaches to R20 as the brand and survives the provider switch.',
       now()
from migrated;
