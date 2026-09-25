-- 0049_event_checkin_person_idx.sql — index for the per-person event lookup.
--
-- getSnapshot attaches each person's events via a correlated subquery
-- (where ec.person_id = p.id). Without this index that's a scan of event_checkin
-- per person row; with it, an index lookup. Keeps the People "came to event"
-- filter fast as sign-ins accumulate over the semester.
set search_path to r20reach, public;

create index if not exists event_checkin_person on event_checkin (person_id);
