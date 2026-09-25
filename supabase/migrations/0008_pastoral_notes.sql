-- 0008_pastoral_notes.sql — Private, dated pastoral notes on a person.
-- Access rule (enforced in the action layer, see actions.ts): a note is
-- readable ONLY by its author + members with pastoral oversight (Alex, Priya,
-- and whoever succeeds them). NOT all admins — Dana/Robin (ops/technical)
-- are deliberately excluded from confidential pastoral content.
set search_path to r20reach, public;

-- Pastoral oversight flag — distinct from role=admin. Seeded to Alex + Priya.
alter table membership add column if not exists pastoral_oversight boolean not null default false;
update membership set pastoral_oversight = true
  where org_id = '11111111-0000-0000-0000-000000000001'
    and email in ('alex@example.com', 'priya@example.com');

-- The `note` table already exists (0001: org, entity_type, entity_id, author_id,
-- body, created_at). Add the interaction date so leaders can backdate a note to
-- when the conversation actually happened.
alter table note add column if not exists occurred_on date not null default current_date;
