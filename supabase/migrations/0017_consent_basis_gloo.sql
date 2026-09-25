-- 0017_consent_basis_gloo.sql — correct the migrated-consent provenance.
--
-- Alex (2026-07-04): these imported contacts were NOT in the VisitorReach
-- account — R20 is still mid-onboarding with VR and barely used it. The actual
-- texting history (and thus the consent basis) is **Gloo**: R20 texted its whole
-- member roster through Gloo, and anyone who opted out was removed from the
-- roster, so every imported contact is an active, never-opted-out texting
-- contact. The consent (opted_in) stands unchanged; only the PROVENANCE recorded
-- on the audit rows was wrong (0015 said VisitorReach). This corrects the source
-- tag + basis note on those consent_event rows.
set search_path to r20reach, public;

update consent_event
   set source = 'migrated_prior_texting',
       consent_text = 'Consent migrated from R20''s prior texting service (Gloo): R20 texted its whole member roster through Gloo, and the roster is maintained by removing anyone who opts out — so every imported contact is an active, never-opted-out texting contact. Basis confirmed by Alex 2026-07-04; TCPA consent attaches to R20 as the brand and survives provider switches. (These contacts were NOT in R20''s VisitorReach account.)'
 where source = 'migrated_visitorreach';
