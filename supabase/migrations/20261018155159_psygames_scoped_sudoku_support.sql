-- Scoped remote Sudoku support. No snapshot access/reward/win/wallet/pet writes.
set local lock_timeout='3s';
-- Ledger 20261018155159 (Supabase MCP apply_migration, 18 October 2026).
-- Prerequisites: ecosystem_app_consents and the EXACT existing
-- public.ecosystem_account_session_active(). Never recreate a deployed guard.
do $$ begin
  if to_regprocedure('public.ecosystem_account_session_active()') is null
     or to_regclass('public.ecosystem_app_consents') is null then
    raise exception using errcode='55000', message='support_prerequisite_missing';
  end if;
end $$;

create schema psygames_support_private authorization postgres;
revoke all on schema psygames_support_private from public, anon, authenticated, service_role;
-- Only invoker wrappers below and policy helpers need this namespace. No API
-- exposure is configured here; each private entry point also checks its caller.
grant usage on schema psygames_support_private to authenticated, service_role;

create table public.psygames_support_grants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null default 'psygames' check (app_id = 'psygames'),
  profile text not null check (profile ~ '^[a-z][a-z0-9-]{0,63}$'),
  road text not null check (road in ('easy','normal','hard')),
  enabled boolean not null default false,
  expires_at timestamptz not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_id, profile, road),
  check (isfinite(expires_at) and expires_at <= updated_at + interval '72 hours'),
  check (not enabled or expires_at > updated_at)
);
alter table public.psygames_support_grants enable row level security;
alter table public.psygames_support_grants force row level security;
alter table public.psygames_support_grants owner to postgres;
revoke all on public.psygames_support_grants from public, anon, authenticated, service_role;
grant select on public.psygames_support_grants to authenticated;
grant insert(owner_id,profile,road,enabled,expires_at) on public.psygames_support_grants to authenticated;
grant update(enabled,expires_at) on public.psygames_support_grants to authenticated;
create policy psygames_support_grant_read on public.psygames_support_grants
  for select to authenticated using (
    owner_id = (select auth.uid()) and (select public.ecosystem_account_session_active()));
create policy psygames_support_grant_create on public.psygames_support_grants
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and (select public.ecosystem_account_session_active()));
create policy psygames_support_grant_change on public.psygames_support_grants
  for update to authenticated using (
    owner_id = (select auth.uid()) and (select public.ecosystem_account_session_active()))
  with check (owner_id = (select auth.uid()) and (select public.ecosystem_account_session_active()));

create table public.psygames_support_corrections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null default 'psygames' check (app_id = 'psygames'),
  grant_id uuid not null references public.psygames_support_grants(id),
  grant_revision bigint not null check (grant_revision > 0),
  request_id uuid not null,
  profile text not null check (profile ~ '^[a-z][a-z0-9-]{0,63}$'),
  road text not null check (road in ('easy','normal','hard')),
  game_id text not null default 'sudoku' check (game_id = 'sudoku'),
  operation text not null default 'unlock_at_least' check (operation = 'unlock_at_least'),
  target_level integer not null check (target_level between 1 and 180),
  key_scope text generated always as (
    'psygames_sudoku_level_' || profile || case when road = 'normal' then '' else '_' || road end
  ) stored,
  operator_label text not null check (operator_label ~ '^[a-zA-Z0-9][a-zA-Z0-9 .:@/-]{0,79}$'),
  reason text not null check (length(btrim(reason)) between 1 and 500 and reason !~ '[[:cntrl:]]'),
  status text not null default 'pending' check (status in ('pending','applied','dismissed')),
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  unique (owner_id,request_id),
  check ((status = 'pending') = (resolved_at is null))
);
create index psygames_support_corrections_lane
  on public.psygames_support_corrections(owner_id,profile,road,target_level desc);
create index psygames_support_corrections_grant on public.psygames_support_corrections(grant_id);
alter table public.psygames_support_corrections enable row level security;
alter table public.psygames_support_corrections force row level security;
alter table public.psygames_support_corrections owner to postgres;
revoke all on public.psygames_support_corrections from public, anon, authenticated, service_role;
grant select on public.psygames_support_corrections to authenticated;

-- An append-only owner-visible audit has no target, profile, road, key_scope or
-- snapshot payload. In particular it is NOT an alternative pending-payload API.
create table public.psygames_support_audit (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid not null references public.psygames_support_grants(id),
  grant_revision bigint not null check (grant_revision > 0),
  correction_id uuid references public.psygames_support_corrections(id),
  event text not null check (event in ('grant_created','grant_changed','queued','applied','dismissed')),
  actor text not null check (actor in ('owner','operator')),
  operator_label text,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  check ((event = 'queued' and actor = 'operator' and operator_label is not null and reason is not null)
    or (event <> 'queued' and actor = 'owner' and operator_label is null and reason is null))
);
create index psygames_support_audit_owner_time on public.psygames_support_audit(owner_id,created_at,id);
create index psygames_support_audit_grant on public.psygames_support_audit(grant_id);
create index psygames_support_audit_correction on public.psygames_support_audit(correction_id);
alter table public.psygames_support_audit enable row level security;
alter table public.psygames_support_audit force row level security;
alter table public.psygames_support_audit owner to postgres;
revoke all on public.psygames_support_audit from public, anon, authenticated, service_role;
grant select on public.psygames_support_audit to authenticated;
create policy psygames_support_audit_read on public.psygames_support_audit
  for select to authenticated using (
    owner_id = (select auth.uid()) and (select public.ecosystem_account_session_active()));

-- Invoker helper: RLS on grants/consents remains effective. No arbitrary owner
-- lookup or definer read path; caller must be the owner with a registered session.
create function psygames_support_private.grant_live(
  p_owner uuid, p_grant uuid, p_revision bigint, p_profile text, p_road text
) returns boolean language sql volatile security invoker set search_path = '' as $$
  select p_owner = auth.uid() and public.ecosystem_account_session_active()
    and exists (
      select 1 from public.psygames_support_grants g
      join public.ecosystem_app_consents c on c.owner_id = g.owner_id and c.app_id = 'psygames'
      where g.id = p_grant and g.owner_id = p_owner and g.revision = p_revision
        and g.app_id = 'psygames' and g.profile = p_profile and g.road = p_road
        and g.enabled and g.expires_at > clock_timestamp()
        and c.enabled and c.policy_version = 1
        and c.issuer = 'https://iuvvheeocobhiothfgei.supabase.co/auth/v1'
    );
$$;
alter function psygames_support_private.grant_live(uuid,uuid,bigint,text,text) owner to postgres;
revoke all on function psygames_support_private.grant_live(uuid,uuid,bigint,text,text)
  from public,anon,authenticated,service_role;
grant execute on function psygames_support_private.grant_live(uuid,uuid,bigint,text,text) to authenticated;
create policy psygames_support_correction_read on public.psygames_support_corrections
  for select to authenticated using (
    owner_id = (select auth.uid()) and (select public.ecosystem_account_session_active())
    and (status <> 'pending' or psygames_support_private.grant_live(
      owner_id,grant_id,grant_revision,profile,road)));

-- Definer is necessary ONLY for append-only audit insertion/stamps. No generic
-- table mutation privilege is delegated. Both RLS and this trigger check owner.
create function psygames_support_private.stamp_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('role',true) is distinct from 'authenticated'
     or new.owner_id is distinct from auth.uid()
     or not public.ecosystem_account_session_active() then
    raise exception using errcode='42501', message='support_owner_required';
  end if;
  if tg_when = 'BEFORE' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text || ':psygames',0));
    if tg_op = 'UPDATE' then
      if (new.id,new.owner_id,new.app_id,new.profile,new.road,new.created_at,new.revision,new.updated_at)
         is distinct from
         (old.id,old.owner_id,old.app_id,old.profile,old.road,old.created_at,old.revision,old.updated_at) then
        raise exception using errcode='42501', message='support_scope_immutable';
      end if;
      new.revision := old.revision + 1;
    else
      new.revision := 1;
      new.created_at := clock_timestamp();
    end if;
    new.updated_at := clock_timestamp();
    if new.app_id is distinct from 'psygames' or new.profile is null
       or new.profile !~ '^[a-z][a-z0-9-]{0,63}$'
       or new.road is null or new.road not in ('easy','normal','hard')
       or new.enabled is null or new.expires_at is null or not isfinite(new.expires_at)
       or new.expires_at > new.updated_at + interval '72 hours'
       or (new.enabled and new.expires_at <= new.updated_at) then
      raise exception using errcode='22023', message='support_invalid_grant';
    end if;
  else
    insert into public.psygames_support_audit(owner_id,grant_id,grant_revision,event,actor)
    values (new.owner_id,new.id,new.revision,
      case when tg_op = 'INSERT' then 'grant_created' else 'grant_changed' end,'owner');
  end if;
  return new;
end $$;
alter function psygames_support_private.stamp_grant() owner to postgres;
revoke all on function psygames_support_private.stamp_grant() from public,anon,authenticated,service_role;
create trigger psygames_support_grant_stamp before insert or update on public.psygames_support_grants
  for each row execute function psygames_support_private.stamp_grant();
create trigger psygames_support_grant_audit after insert or update on public.psygames_support_grants
  for each row execute function psygames_support_private.stamp_grant();

-- Server-only write path. The SQL role AND JWT role must both be service_role.
-- No service_role table privileges are retained. Nonsecret label/reason are
-- server-supplied audit context, not authenticated operator identity or secrets.
create function psygames_support_private.queue_unlock(
  p_owner uuid, p_grant uuid, p_revision bigint, p_profile text, p_road text,
  p_target integer, p_request uuid, p_operator_label text, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  g public.psygames_support_grants%rowtype;
  prior public.psygames_support_corrections%rowtype;
  result_id uuid;
  floor_level integer;
begin
  if current_setting('role',true) is distinct from 'service_role'
     or auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception using errcode='42501', message='support_operator_required';
  end if;
  if p_owner is null or p_grant is null or p_revision is null or p_revision < 1
     or p_profile is null or p_profile !~ '^[a-z][a-z0-9-]{0,63}$'
     or p_road is null or p_road not in ('easy','normal','hard')
     or p_target is null or p_target not between 1 and 180 or p_request is null
     or p_operator_label is null or p_operator_label !~ '^[a-zA-Z0-9][a-zA-Z0-9 .:@/-]{0,79}$'
     or p_reason is null or length(btrim(p_reason)) not between 1 and 500 or p_reason ~ '[[:cntrl:]]' then
    raise exception using errcode='22023', message='support_invalid_request';
  end if;
  -- Lock consent BEFORE the lane: consent UPDATE locks the row before its
  -- BEFORE trigger takes the lane. Reversing that order would deadlock.
  -- FOR SHARE also serializes consent DELETE (which has no lane trigger),
  -- and blocks non-key enabled/issuer UPDATE, unlike FOR KEY SHARE.
  perform 1 from public.ecosystem_app_consents c
    where c.owner_id = p_owner and c.app_id = 'psygames' and c.enabled and c.policy_version = 1
      and c.issuer = 'https://iuvvheeocobhiothfgei.supabase.co/auth/v1' for share;
  if not found then
    raise exception using errcode='42501', message='support_grant_unavailable';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text || ':psygames',0));
  -- Re-read grant AFTER lane acquisition. Do not lock the grant row: owner
  -- grant UPDATE has already locked it before its trigger takes the lane.
  select * into g from public.psygames_support_grants where id = p_grant and owner_id = p_owner;
  if not found or g.app_id <> 'psygames' or g.revision <> p_revision or not g.enabled
     or g.expires_at <= clock_timestamp() or g.profile <> p_profile or g.road <> p_road
     or not exists (select 1 from public.ecosystem_app_consents c
       where c.owner_id = p_owner and c.app_id = 'psygames' and c.enabled and c.policy_version = 1
         and c.issuer = 'https://iuvvheeocobhiothfgei.supabase.co/auth/v1') then
    raise exception using errcode='42501', message='support_grant_unavailable';
  end if;
  select * into prior from public.psygames_support_corrections
    where owner_id = p_owner and request_id = p_request;
  if found then
    if (prior.grant_id,prior.grant_revision,prior.profile,prior.road,prior.target_level,prior.operator_label,prior.reason)
       is distinct from (p_grant,p_revision,p_profile,p_road,p_target,p_operator_label,p_reason) then
      raise exception using errcode='23505', message='support_request_mismatch';
    end if;
    return prior.id; -- Exact retry, no additional audit entry or status change.
  end if;
  select coalesce(max(target_level),0) into floor_level from public.psygames_support_corrections
    where owner_id = p_owner and profile = p_profile and road = p_road;
  -- Conservative nondecreasing queue floor, including dismissed/history rows.
  -- This is NOT the device level. Client MUST apply max(local,target), once,
  -- without wins/stars/rewards and recheck grant immediately before local apply.
  if p_target < floor_level then
    raise exception using errcode='22023', message='support_target_decrease';
  end if;
  insert into public.psygames_support_corrections
    (owner_id,grant_id,grant_revision,request_id,profile,road,target_level,operator_label,reason)
  values (p_owner,p_grant,p_revision,p_request,p_profile,p_road,p_target,p_operator_label,p_reason)
  returning id into result_id;
  insert into public.psygames_support_audit
    (owner_id,grant_id,grant_revision,correction_id,event,actor,operator_label,reason)
  values (p_owner,p_grant,p_revision,result_id,'queued','operator',p_operator_label,p_reason);
  return result_id;
end $$;
alter function psygames_support_private.queue_unlock(uuid,uuid,bigint,text,text,integer,uuid,text,text) owner to postgres;
revoke all on function psygames_support_private.queue_unlock(uuid,uuid,bigint,text,text,integer,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function psygames_support_private.queue_unlock(uuid,uuid,bigint,text,text,integer,uuid,text,text) to service_role;
create function public.psygames_queue_sudoku_unlock(
  p_owner uuid, p_grant uuid, p_revision bigint, p_profile text, p_road text,
  p_target integer, p_request uuid, p_operator_label text, p_reason text
) returns uuid language sql volatile security invoker set search_path = '' as $$
  select psygames_support_private.queue_unlock($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;
alter function public.psygames_queue_sudoku_unlock(uuid,uuid,bigint,text,text,integer,uuid,text,text) owner to postgres;
revoke all on function public.psygames_queue_sudoku_unlock(uuid,uuid,bigint,text,text,integer,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.psygames_queue_sudoku_unlock(uuid,uuid,bigint,text,text,integer,uuid,text,text) to service_role;

-- Immutable queued fields even if an overly broad UPDATE privilege is added
-- later. No bypass GUC, arbitrary JSON parameter or operator status mutation.
create function psygames_support_private.check_resolution() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_setting('role',true) is distinct from 'authenticated'
     or auth.uid() is distinct from old.owner_id
     or not public.ecosystem_account_session_active() then
    raise exception using errcode='42501', message='support_owner_required';
  end if;
  -- Stored generated columns are not populated in NEW during BEFORE UPDATE.
  -- Compare their immutable source columns, not NEW.key_scope (still null).
  if (to_jsonb(new) - array['status','resolved_at','key_scope']) is distinct from
     (to_jsonb(old) - array['status','resolved_at','key_scope']) then
    raise exception using errcode='42501', message='support_correction_immutable';
  end if;
  if old.status <> 'pending' or new.status is null or new.status not in ('applied','dismissed')
     or new.resolved_at is null then
    raise exception using errcode='22023', message='support_invalid_status';
  end if;
  -- UPDATE already owns the correction row. Consistent order for both REST
  -- and RPC: correction -> consent -> owner lane. Never lock a grant row.
  if new.status = 'applied' then
    perform 1 from public.ecosystem_app_consents consent
      where consent.owner_id=old.owner_id and consent.app_id='psygames'
        and consent.enabled and consent.policy_version=1
        and consent.issuer='https://iuvvheeocobhiothfgei.supabase.co/auth/v1' for share;
    if not found then raise exception using errcode='42501',message='support_grant_unavailable'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(old.owner_id::text||':psygames',0));
  if new.status = 'applied' and not psygames_support_private.grant_live(
    old.owner_id,old.grant_id,old.grant_revision,old.profile,old.road) then
    raise exception using errcode='42501', message='support_grant_unavailable';
  end if;
  new.resolved_at := clock_timestamp();
  return new;
end $$;
alter function psygames_support_private.check_resolution() owner to postgres;
revoke all on function psygames_support_private.check_resolution() from public,anon,authenticated,service_role;
create trigger psygames_support_correction_immutable before update on public.psygames_support_corrections
  for each row execute function psygames_support_private.check_resolution();

-- Definer is needed to update ONLY the fixed status fields without delegating
-- direct UPDATE. Owner can dismiss a known pending ID after grant revocation;
-- applying requires the exact still-live grant/consent. Audit remains readable.
create function psygames_support_private.resolve_correction(p_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.psygames_support_corrections%rowtype; caller uuid := auth.uid();
begin
  if current_setting('role',true) is distinct from 'authenticated'
     or caller is null or not public.ecosystem_account_session_active() then
    raise exception using errcode='42501', message='support_owner_required';
  end if;
  if p_id is null or p_status is null or p_status not in ('applied','dismissed') then
    raise exception using errcode='22023', message='support_invalid_status';
  end if;
  if p_status = 'applied' then
    perform 1 from public.ecosystem_app_consents consent
      where consent.owner_id = caller and consent.app_id = 'psygames' and consent.enabled and consent.policy_version = 1
        and consent.issuer = 'https://iuvvheeocobhiothfgei.supabase.co/auth/v1' for share;
    if not found then
      raise exception using errcode='42501', message='support_grant_unavailable';
    end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text || ':psygames',0));
  select * into c from public.psygames_support_corrections where id = p_id and owner_id = caller;
  if not found then
    raise exception using errcode='42501', message='support_correction_unavailable';
  end if;
  if c.status = p_status then return c.id; end if;
  if c.status <> 'pending' then
    raise exception using errcode='22023', message='support_invalid_status';
  end if;
  update public.psygames_support_corrections set status = p_status,resolved_at = clock_timestamp() where id = c.id;
  insert into public.psygames_support_audit(owner_id,grant_id,grant_revision,correction_id,event,actor)
  values (caller,c.grant_id,c.grant_revision,c.id,p_status,'owner');
  return c.id;
end $$;
alter function psygames_support_private.resolve_correction(uuid,text) owner to postgres;
revoke all on function psygames_support_private.resolve_correction(uuid,text) from public,anon,authenticated,service_role;
grant execute on function psygames_support_private.resolve_correction(uuid,text) to authenticated;
create function public.psygames_resolve_support_correction(p_id uuid,p_status text)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select psygames_support_private.resolve_correction($1,$2);
$$;
alter function public.psygames_resolve_support_correction(uuid,text) owner to postgres;
revoke all on function public.psygames_resolve_support_correction(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.psygames_resolve_support_correction(uuid,text) to authenticated;

comment on table public.psygames_support_grants is
  'Explicit owner opt-in to scoped PsyGames Sudoku support, <=72h per owner revision; no snapshot access.';
comment on table public.psygames_support_corrections is
  'Queue only. unlock_at_least is max(local,target), never a win or reward. applied is owner-reported ACK, NOT independent device verification.';
comment on table public.psygames_support_audit is
  'Owner-private append-only event history, readable after revoke with a live registered session. Reason/label MUST be nonsecret; never put tokens, user snapshots or personal information here.';
-- Consent row-lock -> advisory lane is the consistent order for queue/apply
-- and existing consent UPDATE. Grant revoke -> advisory lane never locks
-- consent; neither queue nor apply locks a grant row. Real two-connection race
-- QA remains required. This does not change existing tables or their privileges.

-- Owner-reported minimal state, NOT a copy of the player's board/history.
create table public.psygames_support_reports (
  grant_id uuid primary key references public.psygames_support_grants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  grant_revision bigint not null check(grant_revision > 0),
  level integer not null check(level between 1 and 180),
  best integer not null check(best between 1 and 180),
  resume_present boolean not null,
  updated_at timestamptz not null default clock_timestamp()
);
create index psygames_support_reports_owner on public.psygames_support_reports(owner_id);
alter table public.psygames_support_reports enable row level security;
alter table public.psygames_support_reports force row level security;
revoke all on public.psygames_support_reports from public,anon,authenticated,service_role;
grant select on public.psygames_support_reports to authenticated;
grant insert(grant_id,owner_id,grant_revision,level,best,resume_present)
  on public.psygames_support_reports to authenticated;
grant update(grant_revision,level,best,resume_present)
  on public.psygames_support_reports to authenticated;
create policy support_report_read on public.psygames_support_reports for select to authenticated
  using(owner_id=(select auth.uid()) and (select public.ecosystem_account_session_active()));
create policy support_report_insert on public.psygames_support_reports for insert to authenticated
  with check(owner_id=(select auth.uid()) and (select public.ecosystem_account_session_active()));
create policy support_report_update on public.psygames_support_reports for update to authenticated
  using(owner_id=(select auth.uid()) and (select public.ecosystem_account_session_active()))
  with check(owner_id=(select auth.uid()) and (select public.ecosystem_account_session_active()));
create function psygames_support_private.stamp_report() returns trigger
language plpgsql security invoker set search_path='' as $$
declare g public.psygames_support_grants%rowtype;
begin
  if current_setting('role',true) is distinct from 'authenticated'
     or new.owner_id is distinct from auth.uid() or not public.ecosystem_account_session_active() then
    raise exception using errcode='42501',message='support_owner_required';
  end if;
  if tg_op='UPDATE' and (new.grant_id,new.owner_id,new.updated_at)
     is distinct from (old.grant_id,old.owner_id,old.updated_at) then
    raise exception using errcode='42501',message='support_scope_immutable';
  end if;
  select * into g from public.psygames_support_grants where id=new.grant_id and owner_id=new.owner_id;
  if not found or not psygames_support_private.grant_live(
      new.owner_id,new.grant_id,new.grant_revision,g.profile,g.road) then
    raise exception using errcode='42501',message='support_grant_unavailable';
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end $$;
revoke all on function psygames_support_private.stamp_report() from public,anon,authenticated,service_role;
create trigger support_report_stamp before insert or update on public.psygames_support_reports
  for each row execute function psygames_support_private.stamp_report();

-- The fixed SDK exposes REST table builders, not arbitrary RPC/Auth access.
-- Delegate only these two ACK fields, never queued target/scope/operator fields.
grant update(status,resolved_at) on public.psygames_support_corrections to authenticated;
create policy support_owner_ack on public.psygames_support_corrections for update to authenticated
  using(owner_id=(select auth.uid()) and (select public.ecosystem_account_session_active()))
  with check(owner_id=(select auth.uid()) and (select public.ecosystem_account_session_active()));
create function psygames_support_private.audit_resolution() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'authenticated'
     or new.owner_id is distinct from auth.uid() or not public.ecosystem_account_session_active() then
    raise exception using errcode='42501',message='support_owner_required';
  end if;
  insert into public.psygames_support_audit(owner_id,grant_id,grant_revision,correction_id,event,actor)
    values(new.owner_id,new.grant_id,new.grant_revision,new.id,new.status,'owner');
  return new;
end $$;
revoke all on function psygames_support_private.audit_resolution() from public,anon,authenticated,service_role;
create trigger support_resolution_audit after update on public.psygames_support_corrections
  for each row when(old.status is distinct from new.status)
  execute function psygames_support_private.audit_resolution();
-- Audit is centralized in the same trigger for REST and the pre-existing RPC.
create or replace function psygames_support_private.resolve_correction(p_id uuid,p_status text)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.psygames_support_corrections%rowtype;caller uuid:=auth.uid();
begin
  if current_setting('role',true) is distinct from 'authenticated' or caller is null
     or not public.ecosystem_account_session_active() then
    raise exception using errcode='42501',message='support_owner_required';
  end if;
  if p_id is null or p_status is null or p_status not in('applied','dismissed') then
    raise exception using errcode='22023',message='support_invalid_status';
  end if;
  select * into c from public.psygames_support_corrections where id=p_id and owner_id=caller for update;
  if not found then raise exception using errcode='42501',message='support_correction_unavailable'; end if;
  if c.status=p_status then return c.id;end if;
  if c.status<>'pending' then raise exception using errcode='22023',message='support_invalid_status';end if;
  update public.psygames_support_corrections set status=p_status,resolved_at=clock_timestamp() where id=c.id;
  return c.id;
end $$;

-- Exact email lookup for the privileged support operator. No access to snapshots,
-- wallet, pet, board contents or other apps. An email without a live owner grant
-- returns no rows, indistinguishably from an unknown account.
create function psygames_support_private.lookup_player(p_email text)
returns table(owner_id uuid,grant_id uuid,grant_revision bigint,profile text,road text,
  expires_at timestamptz,level integer,best integer,resume_present boolean,
  reported_at timestamptz,pending_count bigint)
language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role',true) is distinct from 'service_role'
     or auth.jwt()->>'role' is distinct from 'service_role' then
    raise exception using errcode='42501',message='support_operator_required';
  end if;
  if p_email is null or length(p_email) not between 3 and 320 or p_email~'[[:cntrl:]]'
     or position('@' in p_email)<2 then
    raise exception using errcode='22023',message='support_invalid_lookup';
  end if;
  return query select g.owner_id,g.id,g.revision,g.profile,g.road,g.expires_at,
    r.level,r.best,r.resume_present,r.updated_at,
    (select count(*) from public.psygames_support_corrections q
      where q.grant_id=g.id and q.grant_revision=g.revision and q.status='pending')
  from auth.users u join public.psygames_support_grants g on g.owner_id=u.id
    join public.ecosystem_app_consents c on c.owner_id=u.id and c.app_id='psygames'
    left join public.psygames_support_reports r on r.grant_id=g.id and r.grant_revision=g.revision
  where lower(u.email)=lower(btrim(p_email)) and u.deleted_at is null
    and g.enabled and g.expires_at>clock_timestamp() and c.enabled and c.policy_version=1
    and c.issuer='https://iuvvheeocobhiothfgei.supabase.co/auth/v1'
  order by g.profile,g.road limit 30;
end $$;
revoke all on function psygames_support_private.lookup_player(text) from public,anon,authenticated,service_role;
grant execute on function psygames_support_private.lookup_player(text) to service_role;
create function public.psygames_support_lookup(p_email text)
returns table(owner_id uuid,grant_id uuid,grant_revision bigint,profile text,road text,
  expires_at timestamptz,level integer,best integer,resume_present boolean,
  reported_at timestamptz,pending_count bigint)
language sql volatile security invoker set search_path='' as $$
  select * from psygames_support_private.lookup_player(p_email);
$$;
revoke all on function public.psygames_support_lookup(text) from public,anon,authenticated,service_role;
grant execute on function public.psygames_support_lookup(text) to service_role;
notify pgrst,'reload schema';
