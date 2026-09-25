-- 0039_survey_identity.sql — the v2 (easier) 30-Second Survey instrument.
--
-- The form is cut to a true 30 seconds: NEW Q1 "biggest source of identity for
-- people your age" (single tap; Priya's question, options validated against Barna's
-- Gen Z identity data) replaces the old college-experience Q1, and Q4a/Q4b are
-- retired from the form entirely (they were design research about R20 — the pooled
-- data already collected keeps its value). The old columns stay; the aggregate
-- shows legacy sections only while they hold data. "What gives people your age
-- hope?" is deliberately NOT a column — it's the spoken closer in the field doc.
set search_path to r20reach, public;

alter table survey_response add column if not exists q_identity text;        -- single: keys from Q_IDENTITY_OPTIONS
alter table survey_response add column if not exists q_identity_other text;  -- free text when 'something_else'
