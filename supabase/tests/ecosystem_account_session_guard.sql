-- Synthetic identities only. Function, grants, users and sessions ALL roll back.
begin;
\ir ../migrations/20261016120124_ecosystem_account_session_guard.sql
do $$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); guest uuid:=gen_random_uuid();
  sa uuid:=gen_random_uuid(); expired uuid:=gen_random_uuid(); sg uuid:=gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email,is_anonymous) values
    (a,'authenticated','authenticated',a::text||'@example.invalid',false),
    (b,'authenticated','authenticated',b::text||'@example.invalid',false),
    (guest,'authenticated','authenticated',guest::text||'@example.invalid',true);
  insert into auth.sessions(id,user_id,not_after) values
    (sa,a,now()+interval '1 hour'),(expired,a,now()-interval '1 hour'),(sg,guest,null);
  perform set_config('ecosystem.guard_a',a::text,true);
  perform set_config('ecosystem.guard_b',b::text,true);
  perform set_config('ecosystem.guard_guest',guest::text,true);
  perform set_config('ecosystem.guard_sa',sa::text,true);
  perform set_config('ecosystem.guard_expired',expired::text,true);
  perform set_config('ecosystem.guard_sg',sg::text,true);
end $$;
set local role authenticated;
do $$
declare
  a text:=current_setting('ecosystem.guard_a'); b text:=current_setting('ecosystem.guard_b');
  guest text:=current_setting('ecosystem.guard_guest'); sa text:=current_setting('ecosystem.guard_sa');
  claims jsonb;
begin
  claims:=jsonb_build_object('sub',a,'role','authenticated','is_anonymous',false,
    'iss','https://iuvvheeocobhiothfgei.supabase.co/auth/v1','session_id',sa);
  perform set_config('request.jwt.claim.sub',a,true);
  perform set_config('request.jwt.claims',claims::text,true);
  if not public.ecosystem_account_session_active() then raise exception 'FAIL own valid session'; end if;
  perform set_config('request.jwt.claim.sub',b,true);
  perform set_config('request.jwt.claims',(claims||jsonb_build_object('sub',b))::text,true);
  if public.ecosystem_account_session_active() then raise exception 'FAIL foreign session'; end if;
  perform set_config('request.jwt.claim.sub',a,true);
  perform set_config('request.jwt.claims',(claims||jsonb_build_object('session_id',current_setting('ecosystem.guard_expired')))::text,true);
  if public.ecosystem_account_session_active() then raise exception 'FAIL expired session'; end if;
  perform set_config('request.jwt.claims',(claims||jsonb_build_object('session_id',gen_random_uuid()))::text,true);
  if public.ecosystem_account_session_active() then raise exception 'FAIL revoked/missing session'; end if;
  perform set_config('request.jwt.claims',(claims||'{"session_id":"invalid"}'::jsonb)::text,true);
  if public.ecosystem_account_session_active() then raise exception 'FAIL malformed session'; end if;
  perform set_config('request.jwt.claims',(claims-'session_id')::text,true);
  if public.ecosystem_account_session_active() then raise exception 'FAIL absent session'; end if;
  perform set_config('request.jwt.claims',(claims||'{"iss":"https://foreign.invalid"}'::jsonb)::text,true);
  if public.ecosystem_account_session_active() then raise exception 'FAIL foreign issuer'; end if;
  perform set_config('request.jwt.claims',(claims||'{"is_anonymous":true}'::jsonb)::text,true);
  if public.ecosystem_account_session_active() then raise exception 'FAIL anonymous claim'; end if;
  perform set_config('request.jwt.claim.sub',guest,true);
  perform set_config('request.jwt.claims',(claims||jsonb_build_object('sub',guest,'session_id',current_setting('ecosystem.guard_sg')))::text,true);
  if public.ecosystem_account_session_active() then raise exception 'FAIL anonymous actual user'; end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon','public.ecosystem_account_session_active()','execute')
     or has_function_privilege('service_role','public.ecosystem_account_session_active()','execute')
     or not has_function_privilege('authenticated','public.ecosystem_account_session_active()','execute')
  then raise exception 'FAIL minimal function grants'; end if;
end $$;
rollback;
select to_regprocedure('public.ecosystem_account_session_active()') is null as test_function_rolled_back;
