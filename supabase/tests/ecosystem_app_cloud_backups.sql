-- New ecosystem objects only. Synthetic users/data; ALL rows rolled back.
-- Identity sequences may have gaps after rollback; this is not a saved backup.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
begin
  insert into auth.users(id,aud,role,email) values
    (a,'authenticated','authenticated',a::text||'@example.invalid'),
    (b,'authenticated','authenticated',b::text||'@example.invalid');
  perform set_config('ecosystem.test_a',a::text,true);
  perform set_config('ecosystem.test_b',b::text,true);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated',
    'iss','https://iuvvheeocobhiothfgei.supabase.co/auth/v1','is_anonymous',false)::text,true);
end;
$$;
set local role authenticated;
do $$
declare
  a uuid := current_setting('ecosystem.test_a')::uuid;
  b uuid := current_setting('ecosystem.test_b')::uuid;
  app text; base bigint; first_revision bigint; req uuid; n integer; blocked boolean;
  payload jsonb := '{"schema":1,"data":{"fixture":"only synthetic"}}';
begin
  -- 1: no consent means no first upload.
  blocked := false;
  begin
    insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
      values(a,'psygames',gen_random_uuid(),0,payload);
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL upload without consent'; end if;

  foreach app in array array['psygames','smart-alarm','abstract-hub','typerighting'] loop
    -- 2..5: own explicit consent for each product, not inherited from PsyGames.
    insert into public.ecosystem_app_consents(owner_id,app_id,issuer,policy_version,enabled)
      values(a,app,'https://iuvvheeocobhiothfgei.supabase.co/auth/v1',1,true)
      on conflict(owner_id,app_id) do update set owner_id=excluded.owner_id,app_id=excluded.app_id,
        issuer=excluded.issuer,policy_version=excluded.policy_version,enabled=excluded.enabled;
    -- Also exercise UPDATE branch, not merely permission checks on a new row.
    insert into public.ecosystem_app_consents(owner_id,app_id,issuer,policy_version,enabled)
      values(a,app,'https://iuvvheeocobhiothfgei.supabase.co/auth/v1',1,true)
      on conflict(owner_id,app_id) do update set owner_id=excluded.owner_id,app_id=excluded.app_id,
        issuer=excluded.issuer,policy_version=excluded.policy_version,enabled=excluded.enabled;
    base:=0;
    for i in 1..12 loop
      insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
        values(a,app,gen_random_uuid(),base,jsonb_build_object('schema',1,'data',jsonb_build_object('fixture',i)))
        returning revision into base;
    end loop;
    select count(*) into n from public.ecosystem_app_snapshots s where s.owner_id=a and s.app_id=app;
    if n<>10 then raise exception 'FAIL independent app retention'; end if;
  end loop;
  select count(*) into n from public.ecosystem_app_snapshots;
  if n<>40 then raise exception 'FAIL shared owner app partition'; end if;

  -- Other app writes consumed global identity values: per-app CAS is opaque,
  -- the next valid revision need NOT equal the old per-app revision plus one.
  select max(s.revision) into first_revision from public.ecosystem_app_snapshots s
    where s.owner_id=a and s.app_id='psygames';
  insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
    values(a,'psygames',gen_random_uuid(),first_revision,payload) returning revision into base;
  if base<=first_revision+1 then raise exception 'FAIL interleaved global revision fixture'; end if;

  -- 6: retained exact retry does not append or consume a retained slot.
  select s.request_id,s.revision,s.payload into req,first_revision,payload from public.ecosystem_app_snapshots s
    where s.owner_id=a and s.app_id='psygames' order by s.revision desc limit 1;
  insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
    values(a,'psygames',req,0,payload);
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL duplicate appended'; end if;
  -- 7: same key with changed content is rejected.
  blocked:=false;
  begin
    insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
      values(a,'psygames',req,first_revision,'{"schema":1,"data":{"different":true}}');
  exception when unique_violation then blocked:=true; end;
  if not blocked then raise exception 'FAIL request key reuse'; end if;
  -- 8: stale base cannot silently overwrite/new-version another device.
  blocked:=false;
  begin
    insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
      values(a,'psygames',gen_random_uuid(),0,payload);
  exception when serialization_failure then blocked:=true; end;
  if not blocked then raise exception 'FAIL optimistic revision'; end if;
  -- 9: mutable snapshots forbidden.
  blocked:=false;
  begin update public.ecosystem_app_snapshots set payload='{}';
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL update snapshot'; end if;
  -- 10: client timestamp forging forbidden.
  blocked:=false;
  begin
    insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload,created_at)
      values(a,'psygames',gen_random_uuid(),first_revision,payload,now());
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL client timestamp'; end if;
  -- 11: client revision forging forbidden.
  blocked:=false;
  begin
    insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload,revision)
      values(a,'psygames',gen_random_uuid(),first_revision,payload,999999);
  exception when insufficient_privilege or sqlstate '428C9' then blocked:=true; end;
  if not blocked then raise exception 'FAIL client revision'; end if;
  -- 12: null/invalid payload schema rejected, not SQL NULL check bypass.
  blocked:=false;
  begin
    insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
      values(a,'psygames',gen_random_uuid(),first_revision,'{"schema":null,"data":{}}');
  exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'FAIL null schema'; end if;
  -- 13: bogus app cannot obtain consent.
  blocked:=false;
  begin
    insert into public.ecosystem_app_consents(owner_id,app_id,issuer,policy_version,enabled)
      values(a,'unknown','https://iuvvheeocobhiothfgei.supabase.co/auth/v1',1,true);
  exception when check_violation then blocked:=true; end;
  if not blocked then raise exception 'FAIL app allowlist'; end if;
  -- 14: fake issuer cannot enable consent.
  blocked:=false;
  begin update public.ecosystem_app_consents set issuer='https://foreign.example/auth/v1' where app_id='psygames';
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL issuer binding'; end if;
  -- 15: owner field not updateable (not just a permissive UPDATE policy).
  blocked:=false;
  begin update public.ecosystem_app_consents set owner_id=b where app_id='psygames';
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL consent owner change'; end if;
  -- 16: timestamp of accepted consent is server-assigned.
  blocked:=false;
  begin update public.ecosystem_app_consents set accepted_at=now();
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL consent timestamp'; end if;
  -- 17: revocation blocks a new write, without deleting any copies.
  update public.ecosystem_app_consents set enabled=false where app_id='psygames';
  blocked:=false;
  begin
    insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
      values(a,'psygames',gen_random_uuid(),first_revision,payload);
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL revoked consent'; end if;
  select count(*) into n from public.ecosystem_app_snapshots where app_id='psygames';
  if n<>10 then raise exception 'FAIL opt-out erased copies'; end if;
  -- 18: own deletion is app-filtered; other apps remain intact.
  delete from public.ecosystem_app_snapshots where owner_id=a and app_id='psygames';
  get diagnostics n=row_count;
  if n<>10 then raise exception 'FAIL own explicit deletion'; end if;
  select count(*) into n from public.ecosystem_app_snapshots;
  if n<>30 then raise exception 'FAIL deletion crossed app filter'; end if;

  perform set_config('request.jwt.claim.sub',b::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated',
    'iss','https://iuvvheeocobhiothfgei.supabase.co/auth/v1','is_anonymous',false)::text,true);
  -- 19..22: another account cannot read/delete/write either owner table.
  select count(*) into n from public.ecosystem_app_snapshots;
  if n<>0 then raise exception 'FAIL other owner read'; end if;
  select count(*) into n from public.ecosystem_app_consents;
  if n<>0 then raise exception 'FAIL other consent read'; end if;
  delete from public.ecosystem_app_snapshots where owner_id=a;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'FAIL other owner delete'; end if;
  blocked:=false;
  begin
    insert into public.ecosystem_app_snapshots(owner_id,app_id,request_id,base_revision,payload)
      values(a,'psygames',gen_random_uuid(),0,payload);
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL other owner insert'; end if;
  blocked:=false;
  begin insert into public.ecosystem_app_consents(owner_id,app_id,issuer,policy_version,enabled)
    values(a,'psygames','https://iuvvheeocobhiothfgei.supabase.co/auth/v1',1,true);
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL other consent insert'; end if;

  -- Auth-anonymous is NOT the same as role anon.
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated',
    'iss','https://iuvvheeocobhiothfgei.supabase.co/auth/v1','is_anonymous',true)::text,true);
  select count(*) into n from public.ecosystem_app_snapshots;
  if n<>0 then raise exception 'FAIL auth-anonymous read'; end if;
end;
$$;
set local role anon;
do $$
declare blocked boolean:=false;
begin
  begin perform count(*) from public.ecosystem_app_snapshots;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL anon snapshots'; end if;
  blocked:=false;
  begin perform count(*) from public.ecosystem_app_consents;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL anon consent'; end if;
end;
$$;
rollback;
select 'ecosystem owner/app consent/CAS/idempotence/retention/immutability/anon PASS; synthetic users+rows rolled back' as result;
