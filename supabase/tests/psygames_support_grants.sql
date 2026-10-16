-- MAIN runs this with psql -X -v ON_ERROR_STOP=1 -f <this absolute path>.
-- LOCAL support DDL + synthetic fixtures only; NOT a deployment or device test.
-- Do not run after installing the support migration: it is included below and
-- deliberately fails rather than dropping/replacing any existing support data.
-- No connection URL/credentials belong in this file. ALL changes roll back.
\set ON_ERROR_STOP on
select to_regprocedure('public.ecosystem_account_session_active()') is not null as guard_preexisted
\gset support_
\if :support_guard_preexisted
select 'public.ecosystem_account_session_active()'::regprocedure::oid as guard_oid,
  md5(pg_get_functiondef('public.ecosystem_account_session_active()'::regprocedure)) as guard_hash
\gset support_
\endif
begin;
-- Optional standalone prerequisites are DISTINCT from support DDL. Never
-- CREATE/DROP an already deployed session guard (G2 ledger 20261016120124).
select to_regclass('public.ecosystem_app_consents') is null as need_cloud
\gset support_
\if :support_need_cloud
\ir ../migrations/20261016022904_ecosystem_app_cloud_backups.sql
\endif
\if :support_guard_preexisted
\else
\ir ../migrations/20261016120124_ecosystem_account_session_guard.sql
\endif
\ir ../migrations/20261016120739_psygames_support_grants_candidate.sql

-- Initialize this connection's real temp schema before defining helpers.
create temporary table support_test_context(value boolean) on commit drop;
create function pg_temp.ok(p_ok boolean,p_label text) returns void
language plpgsql security invoker as $$ begin
  if p_ok is distinct from true then raise exception 'FAIL: %',p_label; end if;
end $$;
create function pg_temp.fails(p_sql text,p_code text,p_message text default null) returns void
language plpgsql security invoker as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_code or (p_message is not null and sqlerrm <> p_message) then
      raise exception 'FAIL: unexpected denial (expected %, got %)',p_code,sqlstate;
    end if;
    return;
  end;
  raise exception 'FAIL: expected denial %',p_code;
end $$;
create function pg_temp.id(p_name text) returns uuid
language sql stable security invoker as $$ select current_setting('support.' || p_name)::uuid $$;
create function pg_temp.login(p_user text,p_session text,p_extra jsonb default '{}'::jsonb) returns void
language plpgsql security invoker as $$
declare claims jsonb;
begin
  claims := jsonb_build_object('sub',pg_temp.id(p_user),'session_id',pg_temp.id(p_session),
    'role','authenticated','is_anonymous',false,'iss','https://iuvvheeocobhiothfgei.supabase.co/auth/v1') || p_extra;
  perform set_config('request.jwt.claim.sub',claims->>'sub',true);
  perform set_config('request.jwt.claims',claims::text,true);
end $$;
create function pg_temp.queue(
  p_target integer, p_request uuid default gen_random_uuid(),
  p_owner uuid default null,p_grant uuid default null,p_revision bigint default 1,
  p_profile text default 'valya',p_road text default 'normal',
  p_label text default 'support-test',p_reason text default 'Synthetic level recovery'
) returns uuid language sql volatile security invoker as $$
  select public.psygames_queue_sudoku_unlock(coalesce(p_owner,pg_temp.id('a')),
    coalesce(p_grant,pg_temp.id('ga')),p_revision,p_profile,p_road,p_target,p_request,p_label,p_reason);
$$;
-- SET ROLE keeps this backend's temporary namespace; allow only test helpers
-- to be resolved by the synthetic client roles. This grant rolls back too.
do $$ declare temporary_schema text; begin
  select nspname into temporary_schema from pg_namespace where oid=pg_my_temp_schema();
  execute format('grant usage on schema %I to anon,authenticated,service_role',temporary_schema);
end $$;
do $$ declare k text; begin
  foreach k in array array['a','b','guest','sa','sb','sg','expired_session','r1','r2','r3','r4'] loop
    perform set_config('support.' || k,gen_random_uuid()::text,true);
  end loop;
  insert into auth.users(id,aud,role,email,is_anonymous) values
    (pg_temp.id('a'),'authenticated','authenticated',pg_temp.id('a')::text||'@example.invalid',false),
    (pg_temp.id('b'),'authenticated','authenticated',pg_temp.id('b')::text||'@example.invalid',false),
    (pg_temp.id('guest'),'authenticated','authenticated',pg_temp.id('guest')::text||'@example.invalid',true);
  insert into auth.sessions(id,user_id,not_after) values
    (pg_temp.id('sa'),pg_temp.id('a'),now()+interval '1 hour'),
    (pg_temp.id('sb'),pg_temp.id('b'),now()+interval '1 hour'),
    (pg_temp.id('sg'),pg_temp.id('guest'),null),
    (pg_temp.id('expired_session'),pg_temp.id('a'),now()-interval '1 hour');
end $$;

-- Catalog-only checks, no real user/table contents. Public wrappers are invoker;
-- definer implementations are private, postgres-owned, search_path fixed empty.
do $$ declare r record; begin
  for r in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in
      ('psygames_support_grants','psygames_support_corrections','psygames_support_audit') loop
    perform pg_temp.ok((select relrowsecurity and relforcerowsecurity from pg_class where oid=r.oid),'RLS forced');
    perform pg_temp.ok(not has_table_privilege('anon',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'anon zero table access');
    perform pg_temp.ok(not has_table_privilege('service_role',r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'service no direct tables');
    perform pg_temp.ok(not has_table_privilege('authenticated',r.oid,'DELETE,TRUNCATE,REFERENCES,TRIGGER'),'owner no delete/DDL');
  end loop;
  for r in select p.oid,p.prosecdef,p.proowner,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='psygames_support_private' or
      (n.nspname='public' and p.proname in ('psygames_queue_sudoku_unlock','psygames_resolve_support_correction')) loop
    perform pg_temp.ok(r.proowner='postgres'::regrole,'fixed function owner');
    perform pg_temp.ok(array_to_string(r.proconfig,',') like 'search_path=%','fixed search path');
    perform pg_temp.ok(not has_function_privilege('anon',r.oid,'execute'),'anon no functions');
    perform pg_temp.ok(not exists(select 1 from aclexplode(coalesce((select proacl from pg_proc where oid=r.oid),acldefault('f',r.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE'),'PUBLIC no function execute');
  end loop;
  perform pg_temp.ok(not has_function_privilege('authenticated',
    'public.psygames_queue_sudoku_unlock(uuid,uuid,bigint,text,text,integer,uuid,text,text)','execute'),'admin RPC server-only');
  perform pg_temp.ok(not has_function_privilege('service_role',
    'public.psygames_resolve_support_correction(uuid,text)','execute'),'operator cannot resolve');
  perform pg_temp.ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'psygames_%support%' and p.prosecdef),'no public support definer');
end $$;

set local role anon;
select pg_temp.fails('select * from public.psygames_support_grants','42501');
select pg_temp.fails('select * from public.psygames_support_corrections','42501');
select pg_temp.fails('select * from public.psygames_support_audit','42501');
select pg_temp.fails('select pg_temp.queue(79)','42501');
select pg_temp.fails('select public.psygames_resolve_support_correction(gen_random_uuid(),''applied'')','42501');
reset role;

set local role authenticated;
select pg_temp.login('a','sa');
select pg_temp.ok(public.ecosystem_account_session_active(),'live registered fixture');
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
  values(pg_temp.id(''b''),''valya'',''normal'',true,clock_timestamp()+interval ''1 hour'')','42501','support_owner_required');
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
  values(pg_temp.id(''a''),''Valya'',''normal'',true,clock_timestamp()+interval ''1 hour'')','22023','support_invalid_grant');
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
  values(pg_temp.id(''a''),''valya_easy'',''normal'',true,clock_timestamp()+interval ''1 hour'')','22023','support_invalid_grant');
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
  values(pg_temp.id(''a''),''valya'',''wallet'',true,clock_timestamp()+interval ''1 hour'')','22023','support_invalid_grant');
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
  values(pg_temp.id(''a''),''valya'',''normal'',true,clock_timestamp()+interval ''73 hours'')','22023','support_invalid_grant');
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
  values(pg_temp.id(''a''),''valya'',''normal'',true,''infinity'')','22023','support_invalid_grant');
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
  values(pg_temp.id(''a''),''valya'',''normal'',true,clock_timestamp()-interval ''1 second'')','22023','support_invalid_grant');
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,app_id,profile,road,enabled,expires_at)
  values(pg_temp.id(''a''),''smart-alarm'',''valya'',''normal'',true,clock_timestamp()+interval ''1 hour'')','42501');
do $$ declare g record; begin
  for g in insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
    values (pg_temp.id('a'),'valya','normal',true,clock_timestamp()+interval '72 hours'),
      (pg_temp.id('a'),'valya','easy',true,clock_timestamp()+interval '1 hour'),
      (pg_temp.id('a'),'valya','hard',true,clock_timestamp()+interval '1 hour') returning id,road loop
    perform set_config('support.'||case g.road when 'normal' then 'ga' when 'easy' then 'ge' else 'gh' end,g.id::text,true);
  end loop;
end $$;
select pg_temp.fails('update public.psygames_support_grants set profile=''other'' where id=pg_temp.id(''ga'')','42501');
select pg_temp.fails('update public.psygames_support_grants set owner_id=pg_temp.id(''b'') where id=pg_temp.id(''ga'')','42501');
select pg_temp.fails('update public.psygames_support_grants set revision=99 where id=pg_temp.id(''ga'')','42501');
select pg_temp.fails('delete from public.psygames_support_grants where id=pg_temp.id(''ga'')','42501');
select pg_temp.fails('select pg_temp.queue(79)','42501');
-- Even a forged service-role CLAIM does not grant authenticated SQL role access.
select pg_temp.login('a','sa','{"role":"service_role"}');
select pg_temp.fails('select pg_temp.queue(79)','42501');
select pg_temp.login('a','sa');
reset role;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.fails('select pg_temp.queue(79)','42501','support_grant_unavailable'); -- no consent
select pg_temp.fails('select * from public.psygames_support_grants','42501');
select pg_temp.fails('insert into public.psygames_support_corrections(owner_id) values(pg_temp.id(''a''))','42501');
select pg_temp.fails('select public.psygames_resolve_support_correction(gen_random_uuid(),''dismissed'')','42501');
reset role;

set local role authenticated;
select pg_temp.login('a','sa');
insert into public.ecosystem_app_consents(owner_id,app_id,issuer,policy_version,enabled)
  values (pg_temp.id('a'),'psygames','https://iuvvheeocobhiothfgei.supabase.co/auth/v1',1,true);
select pg_temp.login('b','sb');
select pg_temp.ok((select count(*)=0 from public.psygames_support_grants),'cross-owner grants hidden');
select pg_temp.ok((select count(*)=0 from public.psygames_support_audit),'cross-owner audit hidden');
do $$ declare g uuid; begin
  insert into public.psygames_support_grants(owner_id,profile,road,enabled,expires_at)
    values(pg_temp.id('b'),'valya','normal',true,clock_timestamp()+interval '1 hour') returning id into g;
  perform set_config('support.gb',g::text,true);
end $$;
with changed as (update public.psygames_support_grants set enabled=false
  where id=pg_temp.id('ga') returning id)
select pg_temp.ok(count(*)=0,'cross-owner cannot revoke') from changed;
reset role;

set local role service_role;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select pg_temp.fails('select pg_temp.queue(79)','42501','support_operator_required');
select set_config('request.jwt.claims','{}',true);
select pg_temp.fails('select pg_temp.queue(79)','42501','support_operator_required');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.fails('select pg_temp.queue(79,p_grant=>pg_temp.id(''gb''))','42501','support_grant_unavailable');
select pg_temp.fails('select pg_temp.queue(79,p_grant=>gen_random_uuid())','42501','support_grant_unavailable');
select pg_temp.fails('select pg_temp.queue(79,p_owner=>pg_temp.id(''b''))','42501','support_grant_unavailable');
select pg_temp.fails('select pg_temp.queue(79,p_revision=>2)','42501','support_grant_unavailable');
select pg_temp.fails('select pg_temp.queue(79,p_profile=>''other'')','42501','support_grant_unavailable');
select pg_temp.fails('select pg_temp.queue(79,p_road=>''easy'')','42501','support_grant_unavailable');
select pg_temp.fails('select pg_temp.queue(0)','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(181)','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(null)','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(79,p_request=>null)','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(79,p_profile=>''valya_easy'')','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(79,p_road=>''pet'')','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(79,p_label=>'''')','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(79,p_reason=>'' '')','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(79,p_reason=>repeat(''x'',501))','22023','support_invalid_request');
select pg_temp.fails('select pg_temp.queue(79,p_reason=>chr(10))','22023','support_invalid_request');
select set_config('support.q1',pg_temp.queue(79,pg_temp.id('r1'))::text,true);
select pg_temp.ok(pg_temp.queue(79,pg_temp.id('r1'))=pg_temp.id('q1'),'exact retry same ID');
select pg_temp.fails('select pg_temp.queue(80,pg_temp.id(''r1''))','23505','support_request_mismatch');
select pg_temp.fails('select pg_temp.queue(79,pg_temp.id(''r1''),p_reason=>''Different reason'')','23505','support_request_mismatch');
select pg_temp.fails('select pg_temp.queue(79,pg_temp.id(''r1''),p_label=>''other-operator'')','23505','support_request_mismatch');
select pg_temp.fails('select pg_temp.queue(79,pg_temp.id(''r1''),p_grant=>pg_temp.id(''ge''),p_road=>''easy'')','23505','support_request_mismatch');
select pg_temp.fails('select pg_temp.queue(78)','22023','support_target_decrease');
select set_config('support.q2',pg_temp.queue(180,pg_temp.id('r2'))::text,true);
select set_config('support.qe',pg_temp.queue(1,pg_temp.id('r3'),p_grant=>pg_temp.id('ge'),p_road=>'easy')::text,true);
select set_config('support.qh',pg_temp.queue(1,pg_temp.id('r4'),p_grant=>pg_temp.id('gh'),p_road=>'hard')::text,true);
select pg_temp.fails('update public.psygames_support_corrections set target_level=180 where id=pg_temp.id(''q1'')','42501');
select pg_temp.fails('delete from public.psygames_support_corrections where id=pg_temp.id(''q1'')','42501');
reset role;

set local role authenticated;
select pg_temp.login('b','sb');
select pg_temp.ok((select count(*)=0 from public.psygames_support_corrections),'cross-owner pending hidden');
select pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''q1''),''applied'')','42501','support_grant_unavailable'); -- B has no cloud consent either
select pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''q1''),''dismissed'')','42501','support_correction_unavailable');
select pg_temp.login('a','sa');
select pg_temp.ok((select count(*)=4 from public.psygames_support_corrections),'valid pending reads');
select pg_temp.ok((select key_scope='psygames_sudoku_level_valya' from public.psygames_support_corrections where id=pg_temp.id('q1')),'normal exact key');
select pg_temp.ok((select key_scope='psygames_sudoku_level_valya_easy' from public.psygames_support_corrections where id=pg_temp.id('qe')),'easy exact key');
select pg_temp.ok((select key_scope='psygames_sudoku_level_valya_hard' from public.psygames_support_corrections where id=pg_temp.id('qh')),'hard exact key');
select pg_temp.ok((select count(*)=1 from public.psygames_support_audit where correction_id=pg_temp.id('q1') and event='queued'),'retry audit not duplicated');
select pg_temp.fails('update public.psygames_support_corrections set status=''applied'',resolved_at=clock_timestamp() where id=pg_temp.id(''q1'')','42501');
select pg_temp.fails('update public.psygames_support_corrections set target_level=180 where id=pg_temp.id(''q1'')','42501');
select pg_temp.fails('insert into public.psygames_support_audit(owner_id) values(pg_temp.id(''a''))','42501');
select pg_temp.fails('update public.psygames_support_audit set reason=''edited''','42501');
select pg_temp.fails('delete from public.psygames_support_audit','42501');
select pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''q1''),''pending'')','22023','support_invalid_status');
select public.psygames_resolve_support_correction(pg_temp.id('q1'),'applied');
select public.psygames_resolve_support_correction(pg_temp.id('q1'),'applied');
select pg_temp.ok((select count(*)=1 from public.psygames_support_audit where correction_id=pg_temp.id('q1') and event='applied'),'status retry audit not duplicated');
select pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''q1''),''dismissed'')','22023','support_invalid_status');
-- Revision change invalidates old requests, even when the grant remains enabled.
update public.psygames_support_grants set enabled=true where id=pg_temp.id('ga');
select pg_temp.ok((select revision=2 from public.psygames_support_grants where id=pg_temp.id('ga')),'server revision increment');
select pg_temp.ok((select count(*)=0 from public.psygames_support_corrections where id=pg_temp.id('q2')),'old revision pending hidden');
select pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''q2''),''applied'')','42501','support_grant_unavailable');
update public.psygames_support_grants set enabled=false where id=pg_temp.id('ga');
select pg_temp.ok((select count(*)=1 from public.psygames_support_corrections where id=pg_temp.id('q1')),'applied history after revoke');
select pg_temp.ok((select count(*)>0 from public.psygames_support_audit where grant_id=pg_temp.id('ga')),'audit after revoke');
select public.psygames_resolve_support_correction(pg_temp.id('q2'),'dismissed');
select pg_temp.ok((select status='dismissed' from public.psygames_support_corrections where id=pg_temp.id('q2')),'owner can dismiss known revoked request');
reset role;

set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.fails('select pg_temp.queue(180,p_revision=>3)','42501','support_grant_unavailable');
select pg_temp.fails('select pg_temp.queue(79,pg_temp.id(''r1''))','42501','support_grant_unavailable'); -- retry after revoke denied
reset role;

-- No-cloud and fixed-issuer checks independent of grant state.
set local role authenticated;
select pg_temp.login('a','sa');
update public.ecosystem_app_consents set enabled=false where owner_id=pg_temp.id('a') and app_id='psygames';
select pg_temp.ok((select count(*)=0 from public.psygames_support_corrections where status='pending'),'cloud revoke hides pending');
select pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''qe''),''applied'')','42501','support_grant_unavailable');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.fails('select pg_temp.queue(2,p_grant=>pg_temp.id(''ge''),p_road=>''easy'')','42501','support_grant_unavailable');
reset role;
-- Mutate ONLY the synthetic owner's consent under the test transaction.
update public.ecosystem_app_consents set enabled=true,issuer='https://wrong.example.invalid/auth/v1'
  where owner_id=pg_temp.id('a') and app_id='psygames';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.fails('select pg_temp.queue(2,p_grant=>pg_temp.id(''ge''),p_road=>''easy'')','42501','support_grant_unavailable');
reset role;
update public.ecosystem_app_consents set issuer='https://iuvvheeocobhiothfgei.supabase.co/auth/v1'
  where owner_id=pg_temp.id('a') and app_id='psygames';

-- Seed time passage without sleeping or changing an existing object. Only this
-- transaction's NEW grant-table triggers are paused for synthetic fixture aging.
alter table public.psygames_support_grants disable trigger psygames_support_grant_stamp;
alter table public.psygames_support_grants disable trigger psygames_support_grant_audit;
update public.psygames_support_grants set updated_at=clock_timestamp()-interval '2 hours',
  expires_at=clock_timestamp()-interval '1 hour' where id=pg_temp.id('ge');
alter table public.psygames_support_grants enable trigger psygames_support_grant_stamp;
alter table public.psygames_support_grants enable trigger psygames_support_grant_audit;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.fails('select pg_temp.queue(2,p_grant=>pg_temp.id(''ge''),p_road=>''easy'')','42501','support_grant_unavailable');
reset role;
set local role authenticated;
select pg_temp.login('a','sa');
select pg_temp.ok((select count(*)=0 from public.psygames_support_corrections where id=pg_temp.id('qe')),'expired pending hidden');
select pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''qe''),''applied'')','42501','support_grant_unavailable');
select public.psygames_resolve_support_correction(pg_temp.id('qe'),'dismissed');

-- Missing, wrong-owner, expired, malformed, anonymous and foreign-issuer sessions.
do $$ declare extra jsonb; begin
  for extra in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('session_id',pg_temp.id('sb')),
    jsonb_build_object('session_id',pg_temp.id('expired_session')),
    jsonb_build_object('session_id',gen_random_uuid()),
    '{"session_id":null}'::jsonb,'{"session_id":"invalid"}'::jsonb,
    '{"is_anonymous":true}'::jsonb,'{"iss":"https://foreign.invalid"}'::jsonb)) loop
    perform pg_temp.login('a','sa',extra);
    perform pg_temp.ok((select count(*)=0 from public.psygames_support_grants),'invalid session grants hidden');
    perform pg_temp.ok((select count(*)=0 from public.psygames_support_corrections),'invalid session corrections hidden');
    perform pg_temp.ok((select count(*)=0 from public.psygames_support_audit),'invalid session audit hidden');
    perform pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''qh''),''dismissed'')','42501','support_owner_required');
    perform pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,expires_at)
      values(pg_temp.id(''a''),''test'',''normal'',clock_timestamp()+interval ''1 hour'')','42501','support_owner_required');
  end loop;
end $$;
select pg_temp.login('guest','sg'); -- claim says registered, actual auth user is anonymous
select pg_temp.fails('insert into public.psygames_support_grants(owner_id,profile,road,expires_at)
  values(pg_temp.id(''guest''),''test'',''normal'',clock_timestamp()+interval ''1 hour'')','42501','support_owner_required');
reset role;
delete from auth.sessions where id=pg_temp.id('sa') and user_id=pg_temp.id('a');
set local role authenticated;
select pg_temp.login('a','sa');
select pg_temp.ok((select count(*)=0 from public.psygames_support_audit),'deleted session denies history');
select pg_temp.fails('select public.psygames_resolve_support_correction(pg_temp.id(''qh''),''dismissed'')','42501','support_owner_required');
reset role;
insert into auth.sessions(id,user_id,not_after) values(pg_temp.id('sa'),pg_temp.id('a'),now()+interval '1 hour');

-- Fixed test-only definer simulates accidental future broad DML grants, proving
-- the immutable-fields trigger independently of today's deny-by-default ACL.
create function pg_temp.try_mutation(p_field text) returns void language plpgsql
security definer set search_path='' as $$ begin
  if p_field='target' then update public.psygames_support_corrections set target_level=180 where id=pg_temp.id('qh');
  elsif p_field='owner' then update public.psygames_support_corrections set owner_id=pg_temp.id('b') where id=pg_temp.id('qh');
  elsif p_field='grant' then update public.psygames_support_corrections set grant_revision=99 where id=pg_temp.id('qh');
  elsif p_field='request' then update public.psygames_support_corrections set request_id=gen_random_uuid() where id=pg_temp.id('qh');
  elsif p_field='scope' then update public.psygames_support_corrections set profile='other' where id=pg_temp.id('qh');
  elsif p_field='audit' then update public.psygames_support_corrections set reason='edited' where id=pg_temp.id('qh');
  end if;
end $$;
set local role authenticated;
select pg_temp.login('a','sa');
select pg_temp.fails('select pg_temp.try_mutation(''target'')','42501','support_correction_immutable');
select pg_temp.fails('select pg_temp.try_mutation(''owner'')','42501','support_correction_immutable');
select pg_temp.fails('select pg_temp.try_mutation(''grant'')','42501','support_correction_immutable');
select pg_temp.fails('select pg_temp.try_mutation(''request'')','42501','support_correction_immutable');
select pg_temp.fails('select pg_temp.try_mutation(''scope'')','42501','support_correction_immutable');
select pg_temp.fails('select pg_temp.try_mutation(''audit'')','42501','support_correction_immutable');
select public.psygames_resolve_support_correction(pg_temp.id('qh'),'dismissed');
select pg_temp.login('b','sb');
select pg_temp.ok((select count(*)=0 from public.psygames_support_corrections),'cross-owner completed history hidden');
select pg_temp.ok((select count(*)=0 from public.psygames_support_audit where owner_id=pg_temp.id('a')),'cross-owner audit always hidden');
reset role;

-- Snapshot tables are NEVER written even for fixtures. Check only fresh
-- synthetic owners, not existing users. Queue/status DDL has no snapshot,
-- reward, pet, wallet, stars, win or session-history writer.
do $$ declare n bigint; begin
  select count(*) into n from public.ecosystem_app_snapshots where owner_id in (pg_temp.id('a'),pg_temp.id('b'));
  perform pg_temp.ok(n=0,'queue did not create ecosystem snapshots');
  if to_regclass('public.psygames_cloud_snapshots') is not null then
    execute 'select count(*) from public.psygames_cloud_snapshots where owner_id in ($1,$2)'
      into n using pg_temp.id('a'),pg_temp.id('b');
    perform pg_temp.ok(n=0,'queue did not create legacy snapshots');
  end if;
  perform pg_temp.ok((select count(*)=4 from public.psygames_support_corrections),'only expected synthetic queue rows');
  perform pg_temp.ok((select count(*)=4 from public.psygames_support_audit where event='queued'),'exactly one event per queued row');
end $$;
-- Serial role tests do NOT prove two-connection scheduling. Main should also
-- test queue vs grant revoke/consent UPDATE/DELETE in two transactions. Lane:
-- hashtextextended(owner_id::text || ':psygames',0). Consent row-lock FIRST,
-- lane SECOND; DELETE is covered by FOR SHARE even without its own lane trigger.
rollback;
select to_regclass('public.psygames_support_grants') is null
  and to_regclass('public.psygames_support_corrections') is null
  and to_regclass('public.psygames_support_audit') is null
  and to_regnamespace('psygames_support_private') is null as support_objects_rolled_back;
\if :support_guard_preexisted
select 'public.ecosystem_account_session_active()'::regprocedure::oid = :support_guard_oid
  and md5(pg_get_functiondef('public.ecosystem_account_session_active()'::regprocedure)) = :'support_guard_hash'
  as existing_guard_unchanged;
\else
select to_regprocedure('public.ecosystem_account_session_active()') is null as optional_guard_rolled_back;
\endif
