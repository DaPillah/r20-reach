-- 0047_campus_lead.sql — campus-lead visibility.
--
-- A campus lead is a Bible-Hangout leader who additionally SEES everyone on their
-- campus (read scope for oversight/coordination) without being a full org admin.
-- getSnapshot widens the people scope to `p.campus = campus_lead`; the Today queue
-- is unaffected (it filters to owned/covered before computing nudges). null = a
-- normal leader (own people only). Matches the per-campus setup: Maria=Columbia,
-- Kevin=CCNY, etc.
set search_path to r20reach, public;

alter table membership add column if not exists campus_lead text
  check (campus_lead in ('Columbia', 'NYU', 'CCNY', 'Pace'));
