\set ON_ERROR_STOP on
-- TEST ONLY: fixture for Supabase's server-authenticated request context.
-- No bearer tokens, emails, real accounts, sessions or network services.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users(id uuid primary key, is_anonymous boolean not null default false);
insert into auth.users(id,is_anonymous) values
 ('00000000-0000-0000-0000-000000000001',false), -- coach
 ('00000000-0000-0000-0000-000000000002',false), -- student
 ('00000000-0000-0000-0000-000000000003',false), -- outsider
 ('00000000-0000-0000-0000-000000000004',false), -- other coach
 ('00000000-0000-0000-0000-000000000005',false), -- other student
 ('00000000-0000-0000-0000-000000000006',true);  -- anonymous sign-in
create function auth.uid() returns uuid language sql stable set search_path = '' as $$
 select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
revoke all on auth.users from public,authenticated,anon;

create table public.legacy_progress(id integer primary key, payload jsonb not null);
create table public.legacy_wallet(like public.legacy_progress including all);
create table public.legacy_maskot(like public.legacy_progress including all);
create table public.legacy_backups(like public.legacy_progress including all);
insert into public.legacy_progress values(1,'{"level":79,"local_only":true}');
insert into public.legacy_wallet values(1,'{"balance":19}');
insert into public.legacy_maskot values(1,'{"state":"untouched"}');
insert into public.legacy_backups values(1,'{"state":"untouched"}');
revoke all on public.legacy_progress,public.legacy_wallet,public.legacy_maskot,public.legacy_backups from public,authenticated,anon;

create schema test;
create table test.checks(label text primary key);
grant usage on schema test to authenticated,anon;
grant insert,select on test.checks to authenticated,anon;
create function test.ok(condition boolean, label text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
 if condition is distinct from true then raise exception 'FAIL: %',label; end if;
 insert into test.checks values(label);
 raise notice 'ok - %',label;
end;
$$;
create function test.login(n integer) returns void
language sql security invoker set search_path = '' as $$
 select set_config('request.jwt.claims',jsonb_build_object(
   'sub','00000000-0000-0000-0000-'||lpad(n::text,12,'0'),
   'role','authenticated','is_anonymous',n=6)::text,true)::text::void;
$$;
create function test.reject(action text,payload jsonb,code text,label text) returns void
language plpgsql security invoker set search_path = '' as $$
declare caught text;
begin
 begin
  perform public.ecosystem_coach_v2(action,payload);
 exception when others then caught := sqlstate;
 end;
 perform test.ok(caught=code,label);
end;
$$;
grant execute on all functions in schema test to authenticated,anon;
