set search_path to r20reach, public;

-- Org-number inbox: ordinary replies to the R20 Twilio number are now STORED
-- (communication direction='inbound', status='received') instead of dropped.
-- read_at marks when staff saw an inbound message (inbox unread badges).
alter table communication add column if not exists read_at timestamptz;
create index if not exists communication_inbound_idx
  on communication (org_id, direction, created_at desc);
create index if not exists communication_person_idx
  on communication (person_id, created_at);
