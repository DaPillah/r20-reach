-- 0048_membership_last_login.sql — track first/last login for onboarding.
--
-- Set on every successful login. null = the account has never been used, which
-- drives the /overview "Logins to hand out" nudge: the coordinator sees who still
-- needs their login given to them, taps to mint a fresh temp password to text,
-- and the row auto-clears the moment that person logs in.
set search_path to r20reach, public;

alter table membership add column if not exists last_login_at timestamptz;
