-- ecosystem.coach/3.2 — данные шага урока (поле data): свой текст преподавателя (TypeFree), позиция FEN / партия PGN
-- (Chess & Go), id задачи. Объект до 4 КБ; сервер его не толкует — хранит в уроке и снимке задания, отдаёт ученику.
-- ТОЛЬКО ДОБАВЛЕНИЕ: та же проверка шага, что в coach/3, плюс ключ data.
begin;

create or replace function coach_private.require_steps(p jsonb, p_app text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s jsonb;
begin
  if jsonb_typeof(p->'steps') is distinct from 'array' or jsonb_array_length(p->'steps') not between 1 and 50
     or octet_length((p->'steps')::text) > 60000 then
    raise exception using errcode = '22023', message = 'coach_invalid_steps';
  end if;
  for s in select * from jsonb_array_elements(p->'steps') loop
    if jsonb_typeof(s) <> 'object'
       or exists (select 1 from jsonb_object_keys(s) k where k not in ('app_id','ref','title','level','amount','unit','note','data'))
       or jsonb_typeof(s->'ref') <> 'string' or length(s->>'ref') not between 1 and 120
       or jsonb_typeof(s->'amount') <> 'number' or (s->>'amount')::numeric <> trunc((s->>'amount')::numeric)
       or (s->>'amount')::numeric not between 1 and 1000
       or (s ? 'level' and (jsonb_typeof(s->'level') <> 'number' or (s->>'level')::numeric <> trunc((s->>'level')::numeric)
                            or (s->>'level')::numeric not between 0 and 1000))
       or coalesce(s->>'unit', 'times') not in ('times','minutes')
       or (s ? 'app_id' and s->>'app_id' is distinct from p_app)
       or (s ? 'title' and (jsonb_typeof(s->'title') <> 'string' or length(s->>'title') > 160))
       or (s ? 'note' and (jsonb_typeof(s->'note') <> 'string' or length(s->>'note') > 500))
       or (s ? 'data' and (jsonb_typeof(s->'data') <> 'object' or octet_length((s->'data')::text) > 4096)) then
      raise exception using errcode = '22023', message = 'coach_invalid_steps';
    end if;
  end loop;
  return p->'steps';
end;
$$;

revoke all on function coach_private.require_steps(jsonb, text) from public, anon, authenticated;
commit;
