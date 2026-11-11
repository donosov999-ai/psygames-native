-- ecosystem.coach: Fudao — пятое приложение общего кабинета (решение Дениса 11.11.2026).
-- Тот же аккаунт, приглашение, связь и согласие; свои области согласия Fudao:
--   birth_data — подтверждённые данные рождения; charts — карты и расчёты; readings — переписка по разборам;
--   diary_shared — только записи дневника, которые клиент сам передал. Обязательная область — completion, как у всех.
-- Разборы, материалы, заметки специалиста — предметные объекты Fudao, в этой схеме их нет.
-- ТОЛЬКО ДОБАВЛЕНИЯ: списки приложений расширены, области чужого приложения по-прежнему отклоняются.
begin;

alter table coach_private.invites drop constraint invites_app_id_check,
  add constraint invites_app_id_check check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting','fudao'));
alter table coach_private.consents drop constraint consents_app_id_check,
  add constraint consents_app_id_check check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting','fudao'));
alter table coach_private.events drop constraint events_app_id_check,
  add constraint events_app_id_check check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting','fudao'));
alter table coach_private.programs drop constraint programs_app_id_check,
  add constraint programs_app_id_check check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting','fudao'));
alter table coach_private.group_invites drop constraint group_invites_app_id_check,
  add constraint group_invites_app_id_check check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting','fudao'));

alter table coach_private.consents drop constraint consents_scopes_check,
  add constraint consents_scopes_check check (
    'completion' = any(scopes) and cardinality(scopes) between 1 and 5
    and case when app_id = 'fudao'
             then scopes <@ array['completion','birth_data','charts','readings','diary_shared']::text[]
             else scopes <@ array['completion','metrics','errors','history']::text[] end);

create or replace function coach_private.require_app(p jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare v text := coach_private.require_text(p, 'app_id', 1, 40);
begin
  if v not in ('psygames','abstract-hub','smart-alarm','typerighting','fudao') then
    raise exception using errcode = '22023', message = 'coach_app_not_enabled';
  end if;
  return v;
end;
$$;

-- Области из запроса: массив строк, обязательно completion, только области ЭТОГО приложения (app_id из запроса).
create or replace function coach_private.require_scopes(p jsonb)
returns text[] language plpgsql security invoker set search_path = '' as $$
declare
  s text[];
  known text[] := case when p->>'app_id' = 'fudao'
                       then array['completion','birth_data','charts','readings','diary_shared']::text[]
                       else array['completion','metrics','errors','history']::text[] end;
begin
  if jsonb_typeof(p->'scopes') is distinct from 'array' or jsonb_array_length(p->'scopes') not between 1 and 5
     or exists (select 1 from jsonb_array_elements(p->'scopes') e where jsonb_typeof(e) <> 'string') then
    raise exception using errcode = '22023', message = 'coach_invalid_scopes';
  end if;
  select array_agg(distinct e) into s from jsonb_array_elements_text(p->'scopes') e;
  if not ('completion' = any(s)) or not (s <@ known) then
    raise exception using errcode = '22023', message = 'coach_invalid_scopes';
  end if;
  return s;
end;
$$;

revoke all on all functions in schema coach_private from public, anon, authenticated;
grant execute on function coach_private.dispatch(text, jsonb) to authenticated;
grant execute on function coach_private.route(text, jsonb) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on all functions in schema coach_private from service_role';
  end if;
end;
$$;
commit;
