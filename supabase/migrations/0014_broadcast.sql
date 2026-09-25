-- 0014_broadcast.sql — guardrailed segment broadcast (admin-only).
--
-- Research-backed guardrails (2026-07-04): broadcasting is the fastest way to
-- spike opt-outs and wreck a 10DLC number's deliverability, so this is NOT a
-- "text everyone" button. It rides the SAME consent-gated choke point as
-- journeys (sms.ts) — only opted_in people with a phone are ever messaged — and
-- every send is recorded for accountability. Still dry-run until
-- SMS_PROVIDER=twilio. If R20 ever wants true promotional mass-marketing, that
-- belongs in a SEPARATE 10DLC campaign (see HANDOFF), not this conversational one.
set search_path to r20reach, public;

create table if not exists broadcast (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references org(id) on delete cascade,
  sender_id     uuid not null references membership(id),
  segment_label text not null,             -- human-readable "Committed, Core · Columbia"
  body          text not null,
  matched_count int not null default 0,    -- people in the segment
  sent_count    int not null default 0,    -- messageable (opted-in + phone) actually queued
  created_at    timestamptz not null default now()
);
create index if not exists broadcast_org_idx on broadcast (org_id, created_at desc);

alter table communication add column if not exists broadcast_id uuid references broadcast(id) on delete set null;
