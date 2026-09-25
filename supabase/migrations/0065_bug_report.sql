set search_path to r20reach, public;

-- In-app bug reports. Any signed-in leader can file one from the footer; the
-- point is a LOW-friction capture (two boxes) with the context an agent needs
-- to reproduce attached automatically (page, viewport, browser, deploy sha).
-- status: new -> triaged -> fixed | wontfix. `agent_notes` is where the
-- triage agent writes its diagnosis; `fix_ref` holds the commit/PR that fixed it.
create table if not exists bug_report (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references org(id) on delete cascade,
  reporter_id uuid references membership(id) on delete set null,
  page_path   text,
  body        text not null,
  expected    text,
  context     jsonb not null default '{}'::jsonb,
  status      text not null default 'new',
  agent_notes text,
  fix_ref     text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists bug_report_triage_idx on bug_report(org_id, status, created_at desc);
