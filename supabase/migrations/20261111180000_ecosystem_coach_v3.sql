-- ecosystem.coach/3 — группы, уроки, шаблоны, задания с повтором, засчитывание по тренировкам, отчёты.
-- План: ~/.claude/plans/magical-wandering-teapot.md (Ф1), макеты приняты Денисом 11.11.2026.
-- ТОЛЬКО ДОБАВЛЕНИЯ к coach/2: таблицы v2 и диспетчер coach_private.dispatch не меняются. Новые действия
-- идут через coach_private.dispatch3; входной вызов public.ecosystem_coach_v2 теперь смотрит в
-- coach_private.route, который отдаёт новое — dispatch3, остальное — прежнему dispatch.
-- Групповая ссылка той же формы (48 hex), поэтому её принимают и уже выпущенные приложения.
begin;

-- Группа (класс): ученики преподавателя, общая ссылка, назначения на всю группу.
create table coach_private.groups (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_private.coaches(user_id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index groups_coach on coach_private.groups(coach_id);

create table coach_private.group_members (
  group_id uuid not null references coach_private.groups(id) on delete cascade,
  connection_id uuid not null references coach_private.connections(id) on delete cascade,
  added_at timestamptz not null default clock_timestamp(),
  primary key (group_id, connection_id)
);
create index group_members_connection on coach_private.group_members(connection_id);

-- Многоразовая ссылка группы: код 192 бита, хранится только SHA-256, 30 дней, до max_uses входов.
create table coach_private.group_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea unique not null,
  group_id uuid not null references coach_private.groups(id) on delete cascade,
  app_id text not null check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting')),
  max_uses integer not null check (max_uses between 1 and 500),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);
create index group_invites_group on coach_private.group_invites(group_id);

-- Шаблоны библиотеки — программы без преподавателя; подписи на языках в i18n.
alter table coach_private.programs alter column coach_id drop not null;
alter table coach_private.programs add column is_template boolean not null default false;
alter table coach_private.programs add column i18n jsonb;
alter table coach_private.programs add column archived_at timestamptz;
alter table coach_private.programs add constraint programs_owner check (is_template or coach_id is not null);

-- Назначение группе (connection_id пуст) или ученику (group_id пуст); повтор и начало.
alter table coach_private.assignments alter column connection_id drop not null;
alter table coach_private.assignments add column group_id uuid references coach_private.groups(id) on delete cascade;
alter table coach_private.assignments add column coach_id uuid references coach_private.coaches(user_id) on delete cascade;
alter table coach_private.assignments add column recurrence text not null default 'none'
  check (recurrence in ('none','daily','weekdays','weekly'));
alter table coach_private.assignments add column starts_at timestamptz;
alter table coach_private.assignments add column archived_at timestamptz;
alter table coach_private.assignments add constraint assignments_target check ((connection_id is null) = (group_id is not null));
create index assignments_group on coach_private.assignments(group_id);
update coach_private.assignments a set coach_id = c.coach_id from coach_private.connections c where c.id = a.connection_id and a.coach_id is null;

-- Задание через прежнее действие coach/2 `assign` получает преподавателя от связи.
create function coach_private.assignment_owner()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.coach_id is null and new.connection_id is not null then
    select c.coach_id into new.coach_id from coach_private.connections c where c.id = new.connection_id;
  end if;
  return new;
end;
$$;
create trigger assignments_owner before insert on coach_private.assignments
  for each row execute function coach_private.assignment_owner();

alter table coach_private.groups enable row level security;
alter table coach_private.group_members enable row level security;
alter table coach_private.group_invites enable row level security;
revoke all on all tables in schema coach_private from public, anon, authenticated;

-- Начало текущего периода задания: весь срок (none), сегодня (daily/weekdays), эта неделя (weekly).
create function coach_private.period_start(p_rec text, p_from timestamptz, p_now timestamptz)
returns timestamptz language sql stable set search_path = '' as $$
  select case p_rec
    when 'daily' then greatest(p_from, date_trunc('day', p_now))
    when 'weekdays' then greatest(p_from, date_trunc('day', p_now))
    when 'weekly' then greatest(p_from, date_trunc('week', p_now))
    else p_from end;
$$;

-- Совпадение тренировки с шагом урока: mode = ref, exercise_ref = ref или начинается с «ref:».
create function coach_private.step_match(p_step jsonb, p_mode text, p_ref text)
returns boolean language sql immutable set search_path = '' as $$
  select p_step->>'ref' is not null and (p_mode = p_step->>'ref' or p_ref = p_step->>'ref'
         or left(p_ref, length(p_step->>'ref') + 1) = (p_step->>'ref') || ':');
$$;

-- Сколько сделано по шагу с начала периода: раз или полных минут (metrics.time_seconds).
-- Уровень: если шаг требует уровень, а тренировка его прислала — не ниже требуемого; без уровня — засчитывается.
create function coach_private.step_done(p_student uuid, p_app text, p_since timestamptz, p_step jsonb)
returns integer language sql stable security invoker set search_path = '' as $$
  select case when p_step->>'unit' = 'minutes'
      then floor(coalesce(sum(case when jsonb_typeof(e.metrics->'time_seconds') = 'number'
                                   then (e.metrics->>'time_seconds')::numeric else 0 end), 0) / 60)::integer
      else count(*)::integer end
  from coach_private.events e
  where e.student_id = p_student and e.app_id = p_app
    and coalesce(e.occurred_at, e.received_at) >= p_since
    and coach_private.step_match(p_step, e.mode, e.exercise_ref)
    and (coalesce((p_step->>'level')::integer, 0) = 0 or jsonb_typeof(e.metrics->'level') is distinct from 'number'
         or (e.metrics->>'level')::numeric >= (p_step->>'level')::numeric);
$$;

-- Ученики задания: ученик — одна связь; группа — активные участники.
create function coach_private.assignment_targets(a coach_private.assignments)
returns setof coach_private.connections language sql stable security invoker set search_path = '' as $$
  select c.* from coach_private.connections c
  where c.status = 'active' and (c.id = a.connection_id
     or c.id in (select gm.connection_id from coach_private.group_members gm where gm.group_id = a.group_id));
$$;

-- Строка отчёта: сделано по шагам, статус, последняя тренировка. Без согласия на приложение — нули.
create function coach_private.assignment_row(a coach_private.assignments, c coach_private.connections, p_now timestamptz)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  since timestamptz := coach_private.period_start(a.recurrence, coalesce(a.starts_at, a.created_at), p_now);
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

-- Тренировки, которые преподаватель связи вправе видеть (то же правило, что у сводки coach/2).
create function coach_private.visible_events(c coach_private.connections)
returns setof coach_private.events language sql stable security invoker set search_path = '' as $$
  select e.* from coach_private.events e join coach_private.consents k
    on k.connection_id = c.id and k.revoked_at is null and k.app_id = e.app_id
  where c.status = 'active' and e.student_id = c.student_id and e.received_at >= k.granted_at
    and ('history' = any(k.scopes) or e.assignment_id is not null);
$$;

-- Шаги урока: объекты с ref, amount 1..1000, unit times|minutes, level 0..1000, title/note — проверяются.
create function coach_private.require_steps(p jsonb, p_app text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare s jsonb;
begin
  if jsonb_typeof(p->'steps') is distinct from 'array' or jsonb_array_length(p->'steps') not between 1 and 50
     or octet_length((p->'steps')::text) > 12000 then
    raise exception using errcode = '22023', message = 'coach_invalid_steps';
  end if;
  for s in select * from jsonb_array_elements(p->'steps') loop
    if jsonb_typeof(s) <> 'object'
       or exists (select 1 from jsonb_object_keys(s) k where k not in ('app_id','ref','title','level','amount','unit','note'))
       or jsonb_typeof(s->'ref') <> 'string' or length(s->>'ref') not between 1 and 120
       or jsonb_typeof(s->'amount') <> 'number' or (s->>'amount')::numeric <> trunc((s->>'amount')::numeric)
       or (s->>'amount')::numeric not between 1 and 1000
       or (s ? 'level' and (jsonb_typeof(s->'level') <> 'number' or (s->>'level')::numeric <> trunc((s->>'level')::numeric)
                            or (s->>'level')::numeric not between 0 and 1000))
       or coalesce(s->>'unit', 'times') not in ('times','minutes')
       or (s ? 'app_id' and s->>'app_id' is distinct from p_app)
       or (s ? 'title' and (jsonb_typeof(s->'title') <> 'string' or length(s->>'title') > 160))
       or (s ? 'note' and (jsonb_typeof(s->'note') <> 'string' or length(s->>'note') > 500)) then
      raise exception using errcode = '22023', message = 'coach_invalid_steps';
    end if;
  end loop;
  return p->'steps';
end;
$$;

create function coach_private.lesson_view(p coach_private.programs, p_lang text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id', p.id, 'app_id', p.app_id, 'template', p.is_template,
    'title', coalesce(p.i18n->p_lang->>'title', p.title), 'goal', coalesce(p.i18n->p_lang->>'goal', p.goal),
    'steps', coalesce(p.i18n->p_lang->'steps', p.steps), 'created_at', p.created_at);
$$;

create function coach_private.dispatch3(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  now_ timestamptz := clock_timestamp();
  allowed text[];
  app text;
  nm text;
  lang text;
  code_v text;
  sc text[];
  ids uuid[];
  rec text;
  due timestamptz;
  starts timestamptz;
  g coach_private.groups%rowtype;
  gi coach_private.group_invites%rowtype;
  c coach_private.connections%rowtype;
  p coach_private.programs%rowtype;
  a coach_private.assignments%rowtype;
  new_id uuid;
  reply jsonb;
begin
  if caller is null or claims->>'role' is distinct from 'authenticated'
     or claims->'is_anonymous' is distinct from 'false'::jsonb
     or claims->>'sub' is distinct from caller::text
     or not exists (select 1 from auth.users u where u.id = caller and u.is_anonymous is false) then
    raise exception using errcode = '42501', message = 'coach_registered_account_required';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text) > 16384 then
    raise exception using errcode = '22023', message = 'coach_invalid_arguments';
  end if;

  allowed := case p_action
    when 'groups_list' then array[]::text[]
    when 'group_save' then array['group_id','name']
    when 'group_archive' then array['group_id']
    when 'group_members' then array['group_id']
    when 'group_members_set' then array['group_id','connection_ids']
    when 'group_invite_create' then array['group_id','app_id','max_uses']
    when 'invite_preview' then array['app_id','code']
    when 'invite_accept' then array['app_id','code','student_name','consent','scopes','policy_version']
    when 'lesson_save' then array['app_id','title','goal','steps']
    when 'lesson_archive' then array['program_id']
    when 'lessons_list' then array['app_id','lang']
    when 'templates_list' then array['app_id','lang']
    when 'lesson_copy' then array['program_id','lang']
    when 'assign_lesson' then array['program_id','group_id','connection_id','due_at','recurrence','starts_at']
    when 'assignment_archive' then array['assignment_id']
    when 'assignments_list' then array['group_id']
    when 'assignment_report' then array['assignment_id']
    when 'student_assignments' then array['app_id']
    when 'student_report' then array['connection_id']
    when 'group_report' then array['group_id']
    when 'comment_list' then array['connection_id']
    else null end;
  if allowed is null then
    raise exception using errcode = '22023', message = 'coach_unknown_action';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload) k where not (k = any(allowed))) then
    raise exception using errcode = '22023', message = 'coach_invalid_arguments';
  end if;
  lang := coalesce(coach_private.opt_text(p_payload, 'lang', 8), 'en');

  -- ── Ученик: мои задания (по связям и группам), прогресс текущего периода, последний комментарий ──
  if p_action = 'student_assignments' then
    app := case when p_payload ? 'app_id' then coach_private.require_app(p_payload) else null end;
    select coalesce(jsonb_agg(t order by t->>'due_at' nulls last, t->>'id'), '[]'::jsonb) into reply from (
      select coach_private.assignment_row(a0, c0, now_) || jsonb_build_object(
          'id', a0.id, 'app_id', a0.app_id, 'title', a0.title, 'steps', a0.steps, 'due_at', a0.due_at,
          'recurrence', a0.recurrence, 'coach_name', t0.name,
          'comment', (select cm.text from coach_private.comments cm where cm.connection_id = c0.id and cm.author_id = c0.coach_id
                      order by cm.created_at desc limit 1)) as t
      from coach_private.connections c0
      join coach_private.coaches t0 on t0.user_id = c0.coach_id
      join coach_private.assignments a0 on a0.archived_at is null and (a0.connection_id = c0.id
           or a0.group_id in (select gm.group_id from coach_private.group_members gm where gm.connection_id = c0.id))
      where c0.student_id = caller and c0.status = 'active' and (app is null or a0.app_id = app)
        and (a0.starts_at is null or a0.starts_at <= now_)
        and (a0.recurrence <> 'none' or a0.due_at is null or a0.due_at > now_ - interval '7 days')
      order by a0.created_at desc limit 50) q;
    return jsonb_build_object('assignments', reply);
  end if;

  -- ── Групповая ссылка: предпросмотр и вход (тот же ответ, что у coach/2, плюс название группы) ──
  if p_action in ('invite_preview', 'invite_accept') then
    app := coach_private.require_app(p_payload);
    code_v := coach_private.require_text(p_payload, 'code', 48, 48);
    if code_v !~ '^[0-9a-f]{48}$' then raise exception using errcode = '22023', message = 'coach_invalid_arguments'; end if;
    if p_action = 'invite_accept' then
      if p_payload->'consent' is distinct from 'true'::jsonb then
        raise exception using errcode = '42501', message = 'coach_explicit_consent_required';
      end if;
      nm := coach_private.require_text(p_payload, 'student_name', 1, 120);
      sc := coach_private.require_scopes(p_payload);
      select * into gi from coach_private.group_invites x where x.code_hash = sha256(convert_to(code_v, 'UTF8')) for update;
    else
      select * into gi from coach_private.group_invites x where x.code_hash = sha256(convert_to(code_v, 'UTF8'));
    end if;
    select * into g from coach_private.groups x where x.id = gi.group_id;
    if gi.id is null or gi.uses >= gi.max_uses or gi.expires_at <= now_ or gi.app_id <> app or g.archived_at is not null then
      if not coach_private.hit(caller, 'invite_miss', interval '1 hour', 10) then
        return jsonb_build_object('error', 'coach_rate_limited');
      end if;
      return jsonb_build_object('error', 'coach_invite_unavailable');
    end if;
    if p_action = 'invite_preview' then
      return jsonb_build_object('coach_name', (select t.name from coach_private.coaches t where t.user_id = g.coach_id),
        'group_name', g.name, 'app_id', gi.app_id, 'expires_at', gi.expires_at,
        'scopes_available', jsonb_build_array('completion','metrics','errors','history'), 'policy_version', 'coach/2');
    end if;
    if caller = g.coach_id then raise exception using errcode = '42501', message = 'coach_self_connection_forbidden'; end if;
    select * into c from coach_private.connections c0 where c0.coach_id = g.coach_id and c0.student_id = caller and c0.status = 'active' for update;
    if not found then
      insert into coach_private.connections(coach_id, student_id, student_name) values (g.coach_id, caller, nm)
        on conflict (coach_id, student_id) where status = 'active' do nothing returning * into c;
      if not found then raise exception using errcode = '40001', message = 'coach_retry'; end if;
    end if;
    update coach_private.consents set revoked_at = now_ where connection_id = c.id and app_id = gi.app_id and revoked_at is null;
    insert into coach_private.consents(connection_id, app_id, scopes, policy_version)
      values (c.id, gi.app_id, sc, coach_private.require_text(p_payload, 'policy_version', 1, 40));
    insert into coach_private.group_members(group_id, connection_id) values (g.id, c.id) on conflict do nothing;
    update coach_private.group_invites set uses = uses + 1 where id = gi.id;
    return jsonb_build_object('connection_id', c.id, 'app_id', gi.app_id, 'scopes', to_jsonb(sc), 'status', 'active',
      'generation', c.generation, 'group_id', g.id, 'group_name', g.name);
  end if;

  -- ── Дальше — только преподаватель с профилем ──
  if not exists (select 1 from coach_private.coaches t where t.user_id = caller) then
    raise exception using errcode = '42501', message = 'coach_profile_required';
  end if;

  if p_action = 'templates_list' or p_action = 'lessons_list' then
    app := case when p_payload ? 'app_id' then coach_private.require_app(p_payload) else null end;
    select coalesce(jsonb_agg(coach_private.lesson_view(p0, lang) order by p0.created_at desc, p0.id), '[]'::jsonb) into reply
      from (select * from coach_private.programs x
             where x.archived_at is null and (app is null or x.app_id = app)
               and case when p_action = 'templates_list' then x.is_template else x.coach_id = caller and not x.is_template end
             order by x.created_at desc limit 200) p0;
    return jsonb_build_object('lessons', reply);

  elsif p_action = 'lesson_save' then
    app := coach_private.require_app(p_payload);
    insert into coach_private.programs(coach_id, app_id, title, goal, steps)
      values (caller, app, coach_private.require_text(p_payload, 'title', 1, 160),
              coalesce(coach_private.opt_text(p_payload, 'goal', 2000), ''), coach_private.require_steps(p_payload, app))
      returning id into new_id;
    return jsonb_build_object('id', new_id);

  elsif p_action = 'lesson_copy' then
    select * into p from coach_private.programs x where x.id = coach_private.require_uuid(p_payload, 'program_id')
      and (x.is_template or x.coach_id = caller);
    if not found then raise exception using errcode = '42501', message = 'coach_program_unavailable'; end if;
    insert into coach_private.programs(coach_id, app_id, title, goal, steps)
      values (caller, p.app_id, coalesce(p.i18n->lang->>'title', p.title), coalesce(p.i18n->lang->>'goal', p.goal),
              coalesce(p.i18n->lang->'steps', p.steps))
      returning id into new_id;
    return jsonb_build_object('id', new_id);

  elsif p_action = 'lesson_archive' then
    update coach_private.programs set archived_at = now_
      where id = coach_private.require_uuid(p_payload, 'program_id') and coach_id = caller and not is_template;
    if not found then raise exception using errcode = '42501', message = 'coach_program_unavailable'; end if;
    return jsonb_build_object('archived', true);

  elsif p_action = 'group_save' then
    nm := coach_private.require_text(p_payload, 'name', 1, 80);
    if p_payload ? 'group_id' then
      update coach_private.groups set name = nm where id = coach_private.require_uuid(p_payload, 'group_id') and coach_id = caller
        returning id into new_id;
      if new_id is null then raise exception using errcode = '42501', message = 'coach_group_unavailable'; end if;
    else
      if (select count(*) from coach_private.groups x where x.coach_id = caller and x.archived_at is null) >= 100 then
        raise exception using errcode = '54000', message = 'coach_rate_limited';
      end if;
      insert into coach_private.groups(coach_id, name) values (caller, nm) returning id into new_id;
    end if;
    return jsonb_build_object('id', new_id, 'name', nm);

  elsif p_action = 'groups_list' then
    select coalesce(jsonb_agg(jsonb_build_object('id', g0.id, 'name', g0.name, 'created_at', g0.created_at,
        'students', (select count(*) from coach_private.group_members gm join coach_private.connections c0 on c0.id = gm.connection_id
                     where gm.group_id = g0.id and c0.status = 'active'),
        'active_assignments', (select count(*) from coach_private.assignments a0 where a0.group_id = g0.id and a0.archived_at is null
                     and (a0.recurrence <> 'none' or a0.due_at is null or a0.due_at > now_)),
        'idle', (select count(*) from coach_private.group_members gm join coach_private.connections c0 on c0.id = gm.connection_id
                 where gm.group_id = g0.id and c0.status = 'active'
                   and not exists (select 1 from coach_private.visible_events(c0) e
                                   where coalesce(e.occurred_at, e.received_at) > now_ - interval '7 days'))
      ) order by g0.name, g0.id), '[]'::jsonb) into reply
      from coach_private.groups g0 where g0.coach_id = caller and g0.archived_at is null;
    return jsonb_build_object('groups', reply);

  elsif p_action = 'assignments_list' then
    select coalesce(jsonb_agg(t order by t->>'created_at' desc), '[]'::jsonb) into reply from (
      select jsonb_build_object('id', a0.id, 'title', a0.title, 'app_id', a0.app_id, 'steps', a0.steps, 'program_id', a0.program_id,
          'group_id', a0.group_id, 'connection_id', a0.connection_id,
          'target', coalesce((select x.name from coach_private.groups x where x.id = a0.group_id),
                             (select x.student_name from coach_private.connections x where x.id = a0.connection_id)),
          'due_at', a0.due_at, 'recurrence', a0.recurrence, 'created_at', a0.created_at,
          'counts', (select coalesce(jsonb_object_agg(s.st, s.n), '{}'::jsonb) from (
                       select r->>'status' as st, count(*) as n
                       from coach_private.assignment_targets(a0) c0, lateral coach_private.assignment_row(a0, c0, now_) r
                       group by 1) s)) as t
      from coach_private.assignments a0
      where a0.coach_id = caller and a0.archived_at is null
        and (not (p_payload ? 'group_id') or a0.group_id = coach_private.require_uuid(p_payload, 'group_id'))
        and (a0.recurrence <> 'none' or a0.due_at is null or a0.due_at > now_ - interval '14 days')
      order by a0.created_at desc limit 100) q;
    return jsonb_build_object('assignments', reply);

  elsif p_action = 'assign_lesson' then
    select * into p from coach_private.programs x where x.id = coach_private.require_uuid(p_payload, 'program_id')
      and x.coach_id = caller and x.archived_at is null;
    if not found then raise exception using errcode = '42501', message = 'coach_program_unavailable'; end if;
    rec := coalesce(coach_private.opt_text(p_payload, 'recurrence', 10), 'none');
    if rec not in ('none','daily','weekdays','weekly') then raise exception using errcode = '22023', message = 'coach_invalid_arguments'; end if;
    begin
      due := case when p_payload ? 'due_at' then coach_private.require_text(p_payload, 'due_at', 10, 40)::timestamptz end;
      starts := case when p_payload ? 'starts_at' then coach_private.require_text(p_payload, 'starts_at', 10, 40)::timestamptz end;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception using errcode = '22023', message = 'coach_invalid_arguments';
    end;
    if (p_payload ? 'group_id') = (p_payload ? 'connection_id') then
      raise exception using errcode = '22023', message = 'coach_invalid_arguments';
    end if;
    if not coach_private.hit(caller, 'assign', interval '1 day', 200) then
      raise exception using errcode = '54000', message = 'coach_rate_limited';
    end if;
    if p_payload ? 'group_id' then
      select * into g from coach_private.groups x where x.id = coach_private.require_uuid(p_payload, 'group_id')
        and x.coach_id = caller and x.archived_at is null;
      if not found then raise exception using errcode = '42501', message = 'coach_group_unavailable'; end if;
      insert into coach_private.assignments(connection_id, group_id, coach_id, generation, program_id, app_id, title, steps, due_at, recurrence, starts_at)
        values (null, g.id, caller, 0, p.id, p.app_id, p.title, p.steps, due, rec, starts) returning id into new_id;
    else
      select * into c from coach_private.connections x where x.id = coach_private.require_uuid(p_payload, 'connection_id')
        and x.coach_id = caller and x.status = 'active' for update;
      if not found then raise exception using errcode = '42501', message = 'coach_connection_unavailable'; end if;
      if not exists (select 1 from coach_private.consents k where k.connection_id = c.id and k.app_id = p.app_id and k.revoked_at is null) then
        raise exception using errcode = '42501', message = 'coach_consent_required';
      end if;
      insert into coach_private.assignments(connection_id, group_id, coach_id, generation, program_id, app_id, title, steps, due_at, recurrence, starts_at)
        values (c.id, null, caller, c.generation, p.id, p.app_id, p.title, p.steps, due, rec, starts) returning id into new_id;
    end if;
    return jsonb_build_object('id', new_id);
  end if;

  -- ── Действия над заданием преподавателя ──
  if p_action in ('assignment_report', 'assignment_archive') then
    select * into a from coach_private.assignments x where x.id = coach_private.require_uuid(p_payload, 'assignment_id') and x.coach_id = caller;
    if not found then raise exception using errcode = '42501', message = 'coach_assignment_unavailable'; end if;
    if p_action = 'assignment_archive' then
      update coach_private.assignments set archived_at = now_ where id = a.id;
      return jsonb_build_object('archived', true);
    end if;
    select coalesce(jsonb_agg(r order by r->>'student', r->>'connection_id'), '[]'::jsonb) into reply
      from coach_private.assignment_targets(a) c0, lateral coach_private.assignment_row(a, c0, now_) r;
    return jsonb_build_object('id', a.id, 'title', a.title, 'app_id', a.app_id, 'steps', a.steps, 'due_at', a.due_at,
      'recurrence', a.recurrence, 'rows', reply,
      'target', coalesce((select x.name from coach_private.groups x where x.id = a.group_id),
                         (select x.student_name from coach_private.connections x where x.id = a.connection_id)));
  end if;

  -- ── Действия над группой преподавателя ──
  if p_action in ('group_archive', 'group_members', 'group_members_set', 'group_invite_create', 'group_report') then
    select * into g from coach_private.groups x where x.id = coach_private.require_uuid(p_payload, 'group_id') and x.coach_id = caller for update;
    if not found or g.archived_at is not null then raise exception using errcode = '42501', message = 'coach_group_unavailable'; end if;

    if p_action = 'group_archive' then
      update coach_private.groups set archived_at = now_ where id = g.id;
      update coach_private.group_invites set expires_at = least(expires_at, now_) where group_id = g.id;
      return jsonb_build_object('archived', true);

    elsif p_action = 'group_members_set' then
      if jsonb_typeof(p_payload->'connection_ids') is distinct from 'array' or jsonb_array_length(p_payload->'connection_ids') > 500
         or exists (select 1 from jsonb_array_elements(p_payload->'connection_ids') e
                    where jsonb_typeof(e) <> 'string' or (e #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
        raise exception using errcode = '22023', message = 'coach_invalid_arguments';
      end if;
      select coalesce(array_agg(distinct (e #>> '{}')::uuid), '{}') into ids from jsonb_array_elements(p_payload->'connection_ids') e;
      if exists (select 1 from unnest(ids) x where not exists (
           select 1 from coach_private.connections c0 where c0.id = x and c0.coach_id = caller and c0.status = 'active')) then
        raise exception using errcode = '42501', message = 'coach_connection_unavailable';
      end if;
      delete from coach_private.group_members where group_id = g.id and not (connection_id = any(ids));
      insert into coach_private.group_members(group_id, connection_id) select g.id, x from unnest(ids) x on conflict do nothing;
      return jsonb_build_object('students', cardinality(ids));

    elsif p_action = 'group_invite_create' then
      app := coach_private.require_app(p_payload);
      if not coach_private.hit(caller, 'group_invite_create', interval '1 day', 20) then
        raise exception using errcode = '54000', message = 'coach_rate_limited';
      end if;
      code_v := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48);
      insert into coach_private.group_invites(code_hash, group_id, app_id, max_uses, expires_at)
        values (sha256(convert_to(code_v, 'UTF8')), g.id, app,
                case when jsonb_typeof(p_payload->'max_uses') = 'number'
                     then least(500, greatest(1, (p_payload->>'max_uses')::numeric::integer)) else 200 end,
                now_ + interval '30 days') returning * into gi;
      return jsonb_build_object('code', code_v, 'app_id', app, 'group_id', g.id, 'max_uses', gi.max_uses,
        'expires_at', gi.expires_at, 'ttl_seconds', 2592000);

    elsif p_action = 'group_members' then
      select coalesce(jsonb_agg(s order by s->>'name', s->>'connection_id'), '[]'::jsonb) into reply from (
        select jsonb_build_object('connection_id', c0.id, 'name', c0.student_name,
          'last_at', (select max(coalesce(e.occurred_at, e.received_at)) from coach_private.visible_events(c0) e),
          'week_trainings', (select count(*) from coach_private.visible_events(c0) e
                             where coalesce(e.occurred_at, e.received_at) > now_ - interval '7 days'),
          'apps', coalesce((select jsonb_agg(k.app_id order by k.app_id) from coach_private.consents k
                            where k.connection_id = c0.id and k.revoked_at is null), '[]'::jsonb)) as s
        from coach_private.group_members gm join coach_private.connections c0 on c0.id = gm.connection_id
        where gm.group_id = g.id and c0.status = 'active') q;
      return jsonb_build_object('group', jsonb_build_object('id', g.id, 'name', g.name), 'students', reply);

    elsif p_action = 'group_report' then
      select jsonb_build_object(
        'group', jsonb_build_object('id', g.id, 'name', g.name),
        'students', count(*),
        'avg_week_trainings', coalesce(round(avg(q.n4)::numeric / 4, 1), 0),
        'lagging', coalesce(jsonb_agg(jsonb_build_object('connection_id', q.id, 'name', q.student_name, 'last_at', q.last_at)
                     order by q.last_at nulls first) filter (where q.last_at is null or q.last_at < now_ - interval '7 days'), '[]'::jsonb),
        'modes', '[]'::jsonb) into reply
      from (select c0.id, c0.student_name,
                   (select count(*) from coach_private.visible_events(c0) e where coalesce(e.occurred_at, e.received_at) > now_ - interval '28 days') as n4,
                   (select max(coalesce(e.occurred_at, e.received_at)) from coach_private.visible_events(c0) e) as last_at
            from coach_private.group_members gm join coach_private.connections c0 on c0.id = gm.connection_id
            where gm.group_id = g.id and c0.status = 'active') q;
      select reply || jsonb_build_object('done_share', coalesce(round(avg(case when r->>'status' = 'done' then 1 else 0 end)::numeric, 2), 0),
                                         'assignments', count(distinct a0.id))
        into reply
        from coach_private.assignments a0, coach_private.assignment_targets(a0) c0, lateral coach_private.assignment_row(a0, c0, now_) r
        where a0.group_id = g.id and a0.archived_at is null;
      return reply;
    end if;
  end if;

  -- ── Ученик глазами преподавателя ──
  select * into c from coach_private.connections x where x.id = coach_private.require_uuid(p_payload, 'connection_id')
    and (x.coach_id = caller or x.student_id = caller);
  if not found then raise exception using errcode = '42501', message = 'coach_connection_unavailable'; end if;

  if p_action = 'comment_list' then
    select coalesce(jsonb_agg(jsonb_build_object('id', cm.id, 'text', cm.text, 'at', cm.created_at,
        'from', case when cm.author_id = c.coach_id then 'coach' else 'student' end,
        'author', case when cm.author_id = c.coach_id then (select t.name from coach_private.coaches t where t.user_id = c.coach_id)
                       else c.student_name end) order by cm.created_at desc), '[]'::jsonb) into reply
      from (select * from coach_private.comments x where x.connection_id = c.id order by x.created_at desc limit 50) cm;
    return jsonb_build_object('comments', reply);

  elsif p_action = 'student_report' then
    if caller <> c.coach_id then raise exception using errcode = '42501', message = 'coach_coach_required'; end if;
    if c.status <> 'active' then raise exception using errcode = '42501', message = 'coach_relationship_inactive'; end if;
    select jsonb_build_object(
      'connection_id', c.id, 'name', c.student_name,
      'weeks', (select jsonb_agg((select count(*) from coach_private.visible_events(c) e
                                  where coalesce(e.occurred_at, e.received_at) >= date_trunc('week', now_) - (w || ' weeks')::interval
                                    and coalesce(e.occurred_at, e.received_at) < date_trunc('week', now_) - ((w - 1) || ' weeks')::interval)
                                 order by w desc) from generate_series(0, 5) w),
      'modes', coalesce((select jsonb_agg(m order by (m->>'count')::int desc) from (
                  select jsonb_build_object('app_id', e.app_id, 'mode', e.mode, 'count', count(*),
                    'week', count(*) filter (where coalesce(e.occurred_at, e.received_at) >= date_trunc('week', now_)),
                    'prev_week', count(*) filter (where coalesce(e.occurred_at, e.received_at) >= date_trunc('week', now_) - interval '1 week'
                                                   and coalesce(e.occurred_at, e.received_at) < date_trunc('week', now_))) as m
                  from coach_private.visible_events(c) e
                  where e.mode is not null and coalesce(e.occurred_at, e.received_at) > now_ - interval '28 days'
                  group by e.app_id, e.mode order by count(*) desc limit 8) q), '[]'::jsonb),
      'mistakes', coalesce((select jsonb_agg(jsonb_build_object('app_id', q.app_id, 'mode', q.mode, 'key', q.key, 'count', q.n) order by q.n desc)
                  from (select e.app_id, e.mode, x.key, sum((x.value #>> '{}')::numeric)::integer as n
                        from coach_private.visible_events(c) e
                        join coach_private.consents k on k.connection_id = c.id and k.app_id = e.app_id and k.revoked_at is null
                                                     and 'errors' = any(k.scopes),
                             lateral jsonb_each(e.errors) x
                        where jsonb_typeof(x.value) = 'number' and coalesce(e.occurred_at, e.received_at) > now_ - interval '28 days'
                        group by 1, 2, 3 order by 4 desc limit 5) q), '[]'::jsonb)
    ) into reply;
    return reply;
  end if;
  raise exception using errcode = '22023', message = 'coach_unknown_action';
end;
$$;

-- Задание к тренировке: ученик без области history всё равно отправляет то, что задал преподаватель.
-- Подбирается самое раннее действующее задание с совпадающим шагом; без совпадения запрос не меняется.
create function coach_private.tag_assignment(p jsonb)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare ev jsonb := p->'event'; aid uuid; who uuid := auth.uid();
begin
  if who is null or jsonb_typeof(ev) is distinct from 'object' or ev ? 'assignment_id' or jsonb_typeof(p->'app_id') is distinct from 'string' then
    return p;
  end if;
  select a.id into aid
    from coach_private.connections c
    join coach_private.assignments a on a.archived_at is null and (a.connection_id = c.id
         or a.group_id in (select gm.group_id from coach_private.group_members gm where gm.connection_id = c.id))
    where c.student_id = who and c.status = 'active' and a.app_id = p->>'app_id'
      and (a.starts_at is null or a.starts_at <= clock_timestamp())
      and (a.recurrence <> 'none' or a.due_at is null or a.due_at > clock_timestamp() - interval '1 day')
      and exists (select 1 from jsonb_array_elements(a.steps) s where coach_private.step_match(s, ev->>'mode', ev->>'exercise_ref'))
    order by a.created_at, a.id limit 1;
  if aid is null then return p; end if;
  return jsonb_set(p, '{event,assignment_id}', to_jsonb(aid::text));
end;
$$;

-- Вход всех действий: новое — dispatch3, групповой код — dispatch3, остальное — прежний dispatch coach/2.
create function coach_private.route(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
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

create or replace function public.ecosystem_coach_v2(p_action text, p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select coach_private.route(p_action, p_payload);
$$;

-- Шаблоны PsyGames (идентификаторы — game_type игр, сверены с assets/catalog.json 11.11.2026).
insert into coach_private.programs(coach_id, app_id, title, goal, steps, is_template, i18n) values
 (null, 'psygames', 'Attention: 15 minutes', 'Warm-up before class: attention, inhibition, memory',
  '[{"ref":"schulte_table","title":"Schulte Table","amount":3,"unit":"times"},{"ref":"stroop","title":"Stroop","amount":5,"unit":"minutes"},{"ref":"digit_span","title":"Digit Span","amount":2,"unit":"times"}]',
  true, '{"ru":{"title":"Внимание: 15 минут","goal":"Разогрев перед уроком: внимание, торможение, память","steps":[{"ref":"schulte_table","title":"Таблица Шульте","amount":3,"unit":"times"},{"ref":"stroop","title":"Струп","amount":5,"unit":"minutes"},{"ref":"digit_span","title":"Запомни цифры","amount":2,"unit":"times"}]}}'),
 (null, 'psygames', 'Memory: N-back week', 'Working memory, a little every day',
  '[{"ref":"n_back","title":"N-Back","amount":5,"unit":"times"}]',
  true, '{"ru":{"title":"Память: неделя N-back","goal":"Рабочая память понемногу каждый день","steps":[{"ref":"n_back","title":"N-back","amount":5,"unit":"times"}]}}');

alter function coach_private.dispatch3(text, jsonb) owner to postgres;
alter function coach_private.route(text, jsonb) owner to postgres;
alter function public.ecosystem_coach_v2(text, jsonb) owner to postgres;
revoke all on all functions in schema coach_private from public, anon, authenticated;
revoke all on function public.ecosystem_coach_v2(text, jsonb) from public, anon, authenticated;
grant execute on function coach_private.dispatch(text, jsonb) to authenticated;
grant execute on function coach_private.route(text, jsonb) to authenticated;
grant execute on function public.ecosystem_coach_v2(text, jsonb) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on all tables in schema coach_private from service_role';
    execute 'revoke all on all functions in schema coach_private from service_role';
    execute 'revoke all on function public.ecosystem_coach_v2(text,jsonb) from service_role';
  end if;
end;
$$;
comment on function public.ecosystem_coach_v2(text, jsonb) is
  'ecosystem.coach/2+3: кабинет преподавателя (связи, согласия, тренировки + группы, уроки, задания, отчёты); только зарегистрированный auth.uid; доступ к данным — только через этот вызов.';
commit;
