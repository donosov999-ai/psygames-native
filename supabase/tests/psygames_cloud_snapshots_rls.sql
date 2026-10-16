-- Run through the developer SQL connection. Synthetic snapshots only; rollback
-- always removes them. Uses an existing auth owner without revealing their ID.
-- Identity sequence numbers may advance even though rows are rolled back.
begin;
do $$
declare owner uuid;
begin
  select id into owner from auth.users order by created_at desc limit 1;
  if owner is null then raise exception 'An auth test account is required'; end if;
  perform set_config('request.jwt.claim.sub', owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
end;
$$;
set local role authenticated;
do $$
declare
  owner uuid := auth.uid();
  other uuid := gen_random_uuid();
  n integer;
  blocked boolean;
begin
  for i in 1..12 loop
    insert into public.psygames_cloud_snapshots(owner_id, payload)
      values(owner, jsonb_build_object('schema', 1, 'data', jsonb_build_object('psygames_test', i::text)));
  end loop;
  select count(*) into n from public.psygames_cloud_snapshots;
  if n <> 10 then raise exception 'Retention/read failed: %', n; end if;

  blocked := false;
  begin
    update public.psygames_cloud_snapshots set payload = '{}'::jsonb;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Existing copies can be modified'; end if;

  blocked := false;
  begin
    insert into public.psygames_cloud_snapshots(owner_id, created_at, payload)
      values(owner, now(), '{"schema":1,"data":{}}');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Client can forge server timestamps'; end if;

  blocked := false;
  begin
    insert into public.psygames_cloud_snapshots(owner_id, payload)
      values(owner, '{"schema":null,"data":{}}');
  exception when check_violation then blocked := true; end;
  if not blocked then raise exception 'Null schema bypassed validation'; end if;

  perform set_config('request.jwt.claim.sub', other::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  select count(*) into n from public.psygames_cloud_snapshots;
  if n <> 0 then raise exception 'Another account can read private copies'; end if;
  delete from public.psygames_cloud_snapshots where owner_id = owner;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'Another account can delete private copies'; end if;
  blocked := false;
  begin
    insert into public.psygames_cloud_snapshots(owner_id, payload)
      values(owner, '{"schema":1,"data":{}}');
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Another account can write private copies'; end if;

  perform set_config('request.jwt.claim.sub', owner::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner, 'role', 'authenticated')::text, true);
  delete from public.psygames_cloud_snapshots;
  get diagnostics n = row_count;
  if n <> 10 then raise exception 'Owner cannot explicitly delete own copies'; end if;
end;
$$;
set local role anon;
do $$
declare blocked boolean := false;
begin
  begin
    perform count(*) from public.psygames_cloud_snapshots;
  exception when insufficient_privilege then blocked := true; end;
  if not blocked then raise exception 'Anonymous reader can access private table'; end if;
end;
$$;
rollback;
select 'owner/RLS/immutability/timestamps/retention/delete/anon PASS; rolled back' as result;
