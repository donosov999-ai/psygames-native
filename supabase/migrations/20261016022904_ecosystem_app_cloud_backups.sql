-- New objects only in existing personal-nzt. No personal/legacy table changes.
-- Filename aligned with actual Supabase apply_migration ledger version.
-- Auth identity is shared; app_id partitions data/consent, NOT app attestation.
create table public.ecosystem_app_consents (
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null check (app_id in ('psygames','smart-alarm','abstract-hub','typerighting')),
  issuer text not null check (length(issuer) between 10 and 512),
  policy_version integer not null check (policy_version = 1),
  enabled boolean not null default false,
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (owner_id, app_id)
);
alter table public.ecosystem_app_consents enable row level security;
revoke all on public.ecosystem_app_consents from public, anon, authenticated;
grant select, delete on public.ecosystem_app_consents to authenticated;
grant insert(owner_id,app_id,issuer,policy_version,enabled) on public.ecosystem_app_consents to authenticated;
-- PostgREST merge-duplicates updates every supplied field, including equal PKs.
-- A BEFORE UPDATE fence below permits equal keys but forbids changing scope.
grant update(owner_id,app_id,issuer,policy_version,enabled) on public.ecosystem_app_consents to authenticated;
create policy ecosystem_consent_read on public.ecosystem_app_consents for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');
create policy ecosystem_consent_insert on public.ecosystem_app_consents for insert to authenticated
  with check ((select auth.uid()) = owner_id and issuer = (select auth.jwt()->>'iss')
    and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');
create policy ecosystem_consent_update on public.ecosystem_app_consents for update to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true')
  with check ((select auth.uid()) = owner_id and issuer = (select auth.jwt()->>'iss')
    and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');
create policy ecosystem_consent_delete on public.ecosystem_app_consents for delete to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');

create function public.ecosystem_stamp_consent() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and (old.owner_id is distinct from new.owner_id or old.app_id is distinct from new.app_id) then
    raise exception using errcode='42501', message='cloud_scope_immutable';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text || ':' || new.app_id,0));
  new.updated_at := pg_catalog.clock_timestamp();
  if new.enabled then new.accepted_at := new.updated_at;
  elsif tg_op = 'UPDATE' then new.accepted_at := old.accepted_at;
  else new.accepted_at := null; end if;
  return new;
end;
$$;
revoke all on function public.ecosystem_stamp_consent() from public,anon,authenticated;
create trigger ecosystem_stamp_consent before insert or update on public.ecosystem_app_consents
  for each row execute function public.ecosystem_stamp_consent();

create table public.ecosystem_app_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null check (app_id in ('psygames','smart-alarm','abstract-hub','typerighting')),
  request_id uuid not null,
  base_revision bigint not null check (base_revision >= 0),
  revision bigint generated always as identity unique not null,
  created_at timestamptz not null default now(),
  payload jsonb not null,
  unique(owner_id,app_id,request_id),
  constraint ecosystem_snapshot_payload check (
    jsonb_typeof(payload) = 'object'
    and payload ? 'schema' and payload->'schema' = '1'::jsonb
    and payload ? 'data' and jsonb_typeof(payload->'data') = 'object'
    and octet_length(payload::text) <= 5242880
  )
);
create index ecosystem_snapshots_owner_app_revision on public.ecosystem_app_snapshots(owner_id,app_id,revision desc);
alter table public.ecosystem_app_snapshots enable row level security;
revoke all on public.ecosystem_app_snapshots from public,anon,authenticated;
grant select,delete on public.ecosystem_app_snapshots to authenticated;
grant insert(owner_id,app_id,request_id,base_revision,payload) on public.ecosystem_app_snapshots to authenticated;
grant usage,select on sequence public.ecosystem_app_snapshots_revision_seq to authenticated;
create policy ecosystem_snapshot_read on public.ecosystem_app_snapshots for select to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');
create policy ecosystem_snapshot_insert on public.ecosystem_app_snapshots for insert to authenticated
  with check ((select auth.uid()) = owner_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true'
    and exists(select 1 from public.ecosystem_app_consents c where c.owner_id=ecosystem_app_snapshots.owner_id
      and c.app_id=ecosystem_app_snapshots.app_id and c.enabled and c.policy_version=1
      and c.issuer=(select auth.jwt()->>'iss')));
create policy ecosystem_snapshot_delete on public.ecosystem_app_snapshots for delete to authenticated
  using ((select auth.uid()) = owner_id and coalesce((select auth.jwt()->>'is_anonymous'),'false') <> 'true');

-- BEFORE lock, not AFTER: optimistic check and insertion share one serialized lane.
-- Invoker/RLS: no cross-owner reads or privileged helper callable through RPC.
create function public.ecosystem_check_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare prior_payload jsonb; latest bigint;
begin
  if auth.uid() is distinct from new.owner_id or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception using errcode='42501', message='cloud_owner_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text || ':' || new.app_id,0));
  if not exists(select 1 from public.ecosystem_app_consents c where c.owner_id=new.owner_id
    and c.app_id=new.app_id and c.enabled and c.policy_version=1 and c.issuer=auth.jwt()->>'iss') then
    raise exception using errcode='42501', message='cloud_consent_required';
  end if;
  select s.payload into prior_payload from public.ecosystem_app_snapshots s
    where s.owner_id=new.owner_id and s.app_id=new.app_id and s.request_id=new.request_id;
  if found then
    if prior_payload is distinct from new.payload then
      raise exception using errcode='23505', message='cloud_request_reused';
    end if;
    return null; -- Retained exact retry: caller reads metadata by request_id.
  end if;
  select coalesce(max(s.revision),0) into latest from public.ecosystem_app_snapshots s
    where s.owner_id=new.owner_id and s.app_id=new.app_id;
  if new.base_revision is distinct from latest then
    raise exception using errcode='40001', message='cloud_revision_conflict';
  end if;
  return new;
end;
$$;
revoke all on function public.ecosystem_check_snapshot() from public,anon,authenticated;
create trigger ecosystem_check_snapshot before insert on public.ecosystem_app_snapshots
  for each row execute function public.ecosystem_check_snapshot();

create function public.ecosystem_retain_snapshots() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.ecosystem_app_snapshots where owner_id=new.owner_id and app_id=new.app_id and id in (
    select id from public.ecosystem_app_snapshots where owner_id=new.owner_id and app_id=new.app_id
      order by revision desc offset 10
  );
  return new;
end;
$$;
revoke all on function public.ecosystem_retain_snapshots() from public,anon,authenticated;
create trigger ecosystem_retain_snapshots after insert on public.ecosystem_app_snapshots
  for each row execute function public.ecosystem_retain_snapshots();
