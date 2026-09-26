-- 0029_tonight_card.sql — the weekly "What to Expect Tonight" card (the skeptic-fit
-- listener page). This CONSOLIDATES the evergreen "what to expect" (still in the
-- nights_info app_setting) with a weekly, auto-published "tonight" block below it —
-- one page, not two (see SPEC_what_to_expect_tonight.md).
--
-- Two apps, one shared Supabase: the sermon-prep app is the PUBLISHER (a "Make Tonight"
-- move on a finished Prep upserts a row here, service-role, org-scoped) and Oikos is
-- the READER (getTonightCardAction renders it under the evergreen copy on /hi's "expect").
--
-- Deliberately in the `public` schema (not r20reach): it's the cross-app seam sermon-prep
-- writes to, mirroring the app_setting/nights_info weekly-edit pattern but structured.
-- "Current card" = the row for this week's Saturday, else the latest effective_date <= today.
--
-- Columns front-load the pre-talk-safe fields (title/question/passages) and mark the
-- after-the-talk fields (turn/open_questions/next_step) that the reader renders in a
-- clearly-separated block so a pre-talk reader isn't spoiled.
set search_path to r20reach, public;

create table if not exists public.tonight_card (
  org_id         uuid not null,
  effective_date date not null,                  -- the Saturday this card is for
  title          text not null,                  -- public night title
  question       text not null,                  -- the honest question tonight chases (PRE-talk safe)
  passages       jsonb not null default '[]',    -- [{ref, why?}] core + fresh passage
  turn           text,                           -- one line: where the gospel lands (AFTER-talk)
  open_questions jsonb not null default '[]',    -- [string] 2–3 Berea-style (AFTER-talk)
  next_step      text,                           -- "bring it to a Hangout / ask us anything" (echo /hi tone)
  keep_line      text,                           -- optional one quotable line
  go_deeper      text,                           -- optional resource (Marcus reads)
  published_at   timestamptz not null default now(),
  primary key (org_id, effective_date)
);

-- Reader lookup: "latest effective_date <= today" for an org.
create index if not exists tonight_card_org_date_ix
  on public.tonight_card (org_id, effective_date desc);
