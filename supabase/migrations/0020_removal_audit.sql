-- 0020_removal_audit.sql — accountability for removals. archived_at already
-- soft-deletes a person; this records WHO removed them and WHY, so admins get a
-- "recently removed" queue with one-tap restore (see actions.ts listRemovedAction /
-- restorePersonAction). Cleared on restore. Removal itself is gated owner-or-admin
-- in the action layer (was previously ungated).
set search_path to r20reach, public;

alter table person add column if not exists archived_by     uuid references membership(id);
alter table person add column if not exists archived_reason text;
