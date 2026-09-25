-- 0016_consent_basis_correction.sql — correct the migrated-consent basis text.
--
-- Alex (2026-07-04): the texting history predates VisitorReach — R20 texted
-- this roster via Gloo first, then VR. And the roster is SELF-CLEANING: anyone
-- who opted out was removed from the list, so everyone on the imported sheet
-- is an active, never-opted-out texting contact. That's a stronger and more
-- accurate basis than "migrated from VR", so we correct the note on the 76
-- consent_event rows written minutes earlier by 0015 (same event, same date —
-- only the provenance wording changes; nothing about the consent itself).
set search_path to r20reach, public;

update consent_event
   set consent_text = 'Consent migrated from R20''s prior texting services (Gloo, then VisitorReach): R20 has texted this roster throughout, and the roster is maintained by removing anyone who opts out — so every imported contact is an active, never-opted-out texting contact. Basis confirmed by Alex 2026-07-04; TCPA consent attaches to R20 as the brand and survives provider switches.'
 where source = 'migrated_visitorreach';
