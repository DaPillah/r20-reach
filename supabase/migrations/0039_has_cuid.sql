-- 0039_has_cuid.sql — does this person hold a Columbia CUID? Drives the
-- Saturday gate list: Columbia's Morningside campus is at access level "I"
-- (CUID holders + registered guests only), so every non-CUID attendee needs a
-- weekly guest registration (QR emailed per person per day; groups >2 due by
-- 5pm Friday). null = unknown / never asked; the visit capture asks going forward.
set search_path to r20reach, public;

alter table person add column if not exists has_cuid boolean;
