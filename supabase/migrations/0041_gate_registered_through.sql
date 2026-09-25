-- 0041_gate_registered_through.sql — how far ahead a person's Columbia guest
-- registration runs (the portal supports multi-day batches, so regulars get
-- registered for many Saturdays at once). The Friday gate list shows only
-- people whose coverage doesn't reach the upcoming Saturday; when this date
-- passes they resurface automatically. null = never registered.
set search_path to r20reach, public;

alter table person add column if not exists gate_registered_through date;
