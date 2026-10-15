-- PsyGames only. Immutable, owner-private snapshots; never a shared wallet writer.
create table public.psygames_cloud_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint generated always as identity unique,
  created_at timestamptz not null default now(),
  payload jsonb not null,
  constraint psygames_snapshot_payload check (
    jsonb_typeof(payload) = 'object'
    and payload ? 'schema' and payload ? 'data'
    and payload->'schema' = '1'::jsonb
    and jsonb_typeof(payload->'data') = 'object'
    and octet_length(payload::text) <= 5242880
  )
);
create index psygames_cloud_snapshots_owner_revision
  on public.psygames_cloud_snapshots(owner_id, revision desc);
alter table public.psygames_cloud_snapshots enable row level security;
-- Supabase default privileges may already grant ALL to authenticated. Revoke
-- first; a narrower GRANT alone would not remove an inherited UPDATE grant.
revoke all on public.psygames_cloud_snapshots from anon, public, authenticated;
grant select, delete on public.psygames_cloud_snapshots to authenticated;
grant insert (owner_id, payload) on public.psygames_cloud_snapshots to authenticated;
grant usage, select on sequence public.psygames_cloud_snapshots_revision_seq to authenticated;
create policy psygames_snapshot_read on public.psygames_cloud_snapshots
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy psygames_snapshot_write on public.psygames_cloud_snapshots
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy psygames_snapshot_delete on public.psygames_cloud_snapshots
  for delete to authenticated using ((select auth.uid()) = owner_id);

-- Keep ten versions per account, serializing concurrent inserts for that account.
-- SECURITY INVOKER: the retention step has no access to another owner's rows.
create function public.psygames_retain_snapshots() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text, 0));
  delete from public.psygames_cloud_snapshots
  where owner_id = new.owner_id and id in (
    select id from public.psygames_cloud_snapshots
    where owner_id = new.owner_id order by revision desc offset 10
  );
  return new;
end;
$$;
revoke all on function public.psygames_retain_snapshots() from public;
create trigger psygames_retain_snapshots after insert on public.psygames_cloud_snapshots
  for each row execute function public.psygames_retain_snapshots();
