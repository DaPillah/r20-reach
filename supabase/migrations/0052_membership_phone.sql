set search_path to r20reach, public;

-- Team phone numbers live on the login (membership), so "Message the team"
-- can text leaders/gatherers directly — instead of scraping numbers from their
-- contact (person) records. Nullable; set by an admin in the team screen.
alter table membership add column if not exists phone_e164 text;
