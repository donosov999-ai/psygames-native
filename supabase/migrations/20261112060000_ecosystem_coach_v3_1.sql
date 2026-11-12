-- ecosystem.coach/3.1 — правка будущих назначений и часовой пояс расписания (задача TeamOps 0ff0b928).
-- ТОЛЬКО ДОБАВЛЕНИЯ к coach/3: dispatch3 не меняется; новое идёт через coach_private.route.
--   · assignment_update — «изменить с этого момента»: старое назначение уходит в архив вместе со своим
--     отчётом (прошлое не переписывается); новое — с новым сроком/повтором/поясом (сделанное засчитано)
--     или с новым уроком (тогда отсчёт с этого момента);
--   · tz_offset_min — смещение часового пояса преподавателя в минутах: «каждый день» и «раз в неделю»
--     считаются от его полуночи, а не от полуночи UTC. Без поля — как раньше (UTC).
begin;

alter table coach_private.assignments add column tz_offset_min integer not null default 0
  check (tz_offset_min between -840 and 840);
alter table coach_private.assignments add column replaced_by uuid references coach_private.assignments(id) on delete set null;

-- Начало периода с учётом смещения: полночь/понедельник по времени преподавателя. Считается в явном UTC,
-- чтобы не зависеть от настройки TimeZone сервера (на маке — Екатеринбург, в Supabase — UTC).
create function coach_private.period_start_tz(p_rec text, p_from timestamptz, p_now timestamptz, p_off integer)
returns timestamptz language sql immutable set search_path = '' as $$
  select case p_rec
    when 'daily' then greatest(p_from, (date_trunc('day', (p_now at time zone 'UTC') + make_interval(mins => p_off)) - make_interval(mins => p_off)) at time zone 'UTC')
    when 'weekdays' then greatest(p_from, (date_trunc('day', (p_now at time zone 'UTC') + make_interval(mins => p_off)) - make_interval(mins => p_off)) at time zone 'UTC')
    when 'weekly' then greatest(p_from, (date_trunc('week', (p_now at time zone 'UTC') + make_interval(mins => p_off)) - make_interval(mins => p_off)) at time zone 'UTC')
    else p_from end;
$$;

-- Та же строка отчёта, что в coach/3, но период — по часовому поясу назначения.
create or replace function coach_private.assignment_row(a coach_private.assignments, c coach_private.connections, p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  since timestamptz := coach_private.period_start_tz(a.recurrence, coalesce(a.starts_at, a.created_at), p_now, a.tz_offset_min);
  ok boolean := exists (select 1 from coach_private.consents k where k.connection_id = c.id and k.app_id = a.app_id and k.revoked_at is null);
  done jsonb;
  all_done boolean;
  any_done boolean;
  last_at timestamptz;
begin
  select coalesce(jsonb_agg(x.n order by x.ord), '[]'::jsonb), coalesce(bool_and(x.n >= x.need), false), coalesce(bool_or(x.n > 0), false)
    into done, all_done, any_done
    from (select s.ord, case when ok then coach_private.step_done(c.student_id, a.app_id, since, s.step) else 0 end as n,
                 greatest(1, coalesce((s.step->>'amount')::integer, 1)) as need
            from jsonb_array_elements(a.steps) with ordinality s(step, ord)) x;
  if ok then
    select max(coalesce(e.occurred_at, e.received_at)) into last_at from coach_private.events e
      where e.student_id = c.student_id and e.app_id = a.app_id and coalesce(e.occurred_at, e.received_at) >= since;
  end if;
  return jsonb_build_object('connection_id', c.id, 'student', c.student_name, 'consent', ok, 'done', done, 'last_at', last_at,
    'status', case when all_done then 'done'
                   when a.due_at is not null and a.due_at < p_now then 'overdue'
                   when any_done then 'inProgress' else 'notStarted' end);
end;
$$;

create function coach_private.require_offset(p jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  if not (p ? 'tz_offset_min') then return null; end if;
  if jsonb_typeof(p->'tz_offset_min') <> 'number' or (p->>'tz_offset_min')::numeric <> trunc((p->>'tz_offset_min')::numeric)
     or (p->>'tz_offset_min')::numeric not between -840 and 840 then
    raise exception using errcode = '22023', message = 'coach_invalid_arguments';
  end if;
  return (p->>'tz_offset_min')::integer;
end;
$$;

-- Правка назначения «с этого момента». Только преподаватель-владелец, только действующее назначение.
create function coach_private.dispatch31(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  now_ timestamptz := clock_timestamp();
  a coach_private.assignments%rowtype;
  p coach_private.programs%rowtype;
  rec text;
  due timestamptz;
  off integer;
  new_id uuid;
begin
  if caller is null or claims->>'role' is distinct from 'authenticated'
     or claims->'is_anonymous' is distinct from 'false'::jsonb
     or claims->>'sub' is distinct from caller::text
     or not exists (select 1 from auth.users u where u.id = caller and u.is_anonymous is false) then
    raise exception using errcode = '42501', message = 'coach_registered_account_required';
  end if;
  if p_action <> 'assignment_update' then
    raise exception using errcode = '22023', message = 'coach_unknown_action';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 4096
     or exists (select 1 from jsonb_object_keys(p_payload) k
                where k not in ('assignment_id','program_id','due_at','recurrence','tz_offset_min')) then
    raise exception using errcode = '22023', message = 'coach_invalid_arguments';
  end if;
  select * into a from coach_private.assignments x
    where x.id = coach_private.require_uuid(p_payload, 'assignment_id') and x.coach_id = caller and x.archived_at is null for update;
  if not found then raise exception using errcode = '42501', message = 'coach_assignment_unavailable'; end if;
  if p_payload ? 'program_id' then
    select * into p from coach_private.programs x where x.id = coach_private.require_uuid(p_payload, 'program_id')
      and x.coach_id = caller and x.archived_at is null and x.app_id = a.app_id;
    if not found then raise exception using errcode = '42501', message = 'coach_program_unavailable'; end if;
  else
    select * into p from coach_private.programs x where x.id = a.program_id;
  end if;
  rec := coalesce(coach_private.opt_text(p_payload, 'recurrence', 10), a.recurrence);
  if rec not in ('none','daily','weekdays','weekly') then raise exception using errcode = '22023', message = 'coach_invalid_arguments'; end if;
  begin
    due := case when p_payload ? 'due_at' then
             case when jsonb_typeof(p_payload->'due_at') = 'null' then null
                  else coach_private.require_text(p_payload, 'due_at', 10, 40)::timestamptz end
           else a.due_at end;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'coach_invalid_arguments';
  end;
  off := coalesce(coach_private.require_offset(p_payload), a.tz_offset_min);
  if not coach_private.hit(caller, 'assign', interval '1 day', 200) then
    raise exception using errcode = '54000', message = 'coach_rate_limited';
  end if;
  -- Новое назначение: та же цель. Урок прежний — начало прежнее (сделанное засчитано, меняются срок/повтор/пояс);
  -- урок другой — снимок новых шагов и начало сейчас. Старое — в архив, его отчёт остаётся как был.
  insert into coach_private.assignments(connection_id, group_id, coach_id, generation, program_id, app_id, title, steps,
                                        due_at, recurrence, starts_at, tz_offset_min)
    values (a.connection_id, a.group_id, caller, a.generation, p.id, a.app_id,
            case when p_payload ? 'program_id' then p.title else a.title end,
            case when p_payload ? 'program_id' then p.steps else a.steps end,
            due, rec, case when p_payload ? 'program_id' then now_ else coalesce(a.starts_at, a.created_at) end, off)
    returning id into new_id;
  update coach_private.assignments set archived_at = now_, replaced_by = new_id where id = a.id;
  return jsonb_build_object('id', new_id, 'replaced', a.id);
end;
$$;

-- Вход: правка — dispatch31; tz_offset_min у assign_lesson снимается до dispatch3 и ставится новой строке.
create or replace function coach_private.route(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  off integer;
  reply jsonb;
begin
  if p_action = 'assignment_update' then
    return coach_private.dispatch31(p_action, p_payload);
  end if;
  if p_action = 'assign_lesson' and jsonb_typeof(p_payload) = 'object' and p_payload ? 'tz_offset_min' then
    off := coach_private.require_offset(p_payload);
    reply := coach_private.dispatch3(p_action, p_payload - 'tz_offset_min');
    update coach_private.assignments set tz_offset_min = off
      where id = (reply->>'id')::uuid and coach_id = auth.uid();
    return reply;
  end if;
  if p_action in ('groups_list','group_save','group_archive','group_members','group_members_set','group_invite_create',
                  'lesson_save','lesson_archive','lessons_list','templates_list','lesson_copy','assign_lesson','assignment_archive',
                  'assignments_list','assignment_report','student_assignments','student_report','group_report','comment_list') then
    return coach_private.dispatch3(p_action, p_payload);
  end if;
  if p_action in ('invite_preview','invite_accept') and jsonb_typeof(p_payload) = 'object' and jsonb_typeof(p_payload->'code') = 'string'
     and exists (select 1 from coach_private.group_invites g where g.code_hash = sha256(convert_to(p_payload->>'code', 'UTF8'))) then
    return coach_private.dispatch3(p_action, p_payload);
  end if;
  if p_action = 'result_submit' and jsonb_typeof(p_payload) = 'object' then
    return coach_private.dispatch(p_action, coach_private.tag_assignment(p_payload));
  end if;
  return coach_private.dispatch(p_action, p_payload);
end;
$$;

alter function coach_private.dispatch31(text, jsonb) owner to postgres;
alter function coach_private.route(text, jsonb) owner to postgres;
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
