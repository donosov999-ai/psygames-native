-- ecosystem.coach/2 — кабинет преподавателя для 4 приложений (эпик TeamOps 892cd2c3, 11.11.2026).
-- Архитектура: ~/Documents/TeamOps/teacher-cabinet/TEACHER_CABINET_ARCHITECTURE_20261111.md (§1, §5).
-- Основа — локальный кандидат coach/1 (coach-student-pilot-20261024/scripts/coach/schema.sql): та же защита
-- (закрытые таблицы, один SECURITY DEFINER-диспетчер, личность только из auth.uid(), белый список полей,
-- блокировка связи при отзыве), обобщено на psygames / abstract-hub / smart-alarm / typerighting.
-- Применять в боевую базу только по прямому «да» Дениса.
begin;

create schema coach_private;
revoke all on schema coach_private from public, anon, authenticated;
alter default privileges in schema coach_private revoke all on tables from public, anon, authenticated;

-- Преподаватель: профиль поверх общего аккаунта, один на все приложения.
create table coach_private.coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default clock_timestamp()
);

-- Приглашение — в конкретное приложение. Код 192 бита, хранится только SHA-256, 7 дней, одноразовое.
create table coach_private.invites (
  id uuid primary key default gen_random_uuid(),
  code_hash bytea unique not null,
  coach_id uuid not null references coach_private.coaches(user_id) on delete cascade,
  app_id text not null check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index invites_coach on coach_private.invites(coach_id);

-- Связь преподаватель–ученик (одна на пару). Отзыв = status revoked + новая ревизия (generation).
create table coach_private.connections (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_private.coaches(user_id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null check (length(btrim(student_name)) between 1 and 120),
  status text not null default 'active' check (status in ('active','revoked')),
  generation bigint not null default 1 check (generation > 0),
  created_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  check (coach_id <> student_id),
  check ((status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);
create unique index connections_active_pair on coach_private.connections(coach_id, student_id) where status = 'active';
create index connections_student on coach_private.connections(student_id);

-- Согласие ученика — ОТДЕЛЬНО по каждому приложению, с областями. Отзыв — revoked_at, не удаление.
create table coach_private.consents (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references coach_private.connections(id) on delete cascade,
  app_id text not null check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting')),
  scopes text[] not null check (
    'completion' = any(scopes)
    and scopes <@ array['completion','metrics','errors','history']::text[]
    and cardinality(scopes) between 1 and 4),
  policy_version text not null check (length(policy_version) between 1 and 40),
  granted_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);
create unique index consents_active on coach_private.consents(connection_id, app_id) where revoked_at is null;

-- Тренировка ученика. Хранится одна на ученика (видят все его преподаватели с согласием на это приложение).
create table coach_private.events (
  id uuid primary key default gen_random_uuid(),
  app_id text not null check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting')),
  student_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 128),
  kind text not null check (length(kind) between 1 and 40),
  mode text check (length(mode) <= 60),
  exercise_ref text check (length(exercise_ref) <= 120),
  assignment_id uuid,
  step integer check (step between 0 and 1000),
  occurred_at timestamptz,          -- время на устройстве; null — «время неизвестно»
  received_at timestamptz not null default clock_timestamp(),
  metrics jsonb not null default '{}'::jsonb,
  errors jsonb not null default '{}'::jsonb,
  payload jsonb not null,           -- исходное событие: повтор с другим содержимым = conflict
  unique (app_id, student_id, event_id)
);
create index events_student_app on coach_private.events(student_id, app_id, received_at desc);

-- Программы (неизменяемые версии) и задания — у Chess & Go и TypeFree с первой выкладки.
create table coach_private.programs (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references coach_private.coaches(user_id) on delete cascade,
  app_id text not null check (app_id in ('psygames','abstract-hub','smart-alarm','typerighting')),
  title text not null check (length(btrim(title)) between 1 and 160),
  goal text not null check (length(goal) <= 2000),
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 50),
  created_at timestamptz not null default clock_timestamp()
);
create index programs_coach on coach_private.programs(coach_id);

create table coach_private.assignments (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references coach_private.connections(id) on delete cascade,
  generation bigint not null,
  program_id uuid not null references coach_private.programs(id) on delete cascade,
  app_id text not null,
  title text not null,
  steps jsonb not null,
  due_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index assignments_connection on coach_private.assignments(connection_id);

create table coach_private.comments (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references coach_private.connections(id) on delete cascade,
  generation bigint not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 2000),
  created_at timestamptz not null default clock_timestamp()
);
create index comments_connection on coach_private.comments(connection_id);

-- Счётчики лимитов (приглашения, результаты, неверные коды).
create table coach_private.limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table coach_private.coaches enable row level security;
alter table coach_private.invites enable row level security;
alter table coach_private.connections enable row level security;
alter table coach_private.consents enable row level security;
alter table coach_private.events enable row level security;
alter table coach_private.programs enable row level security;
alter table coach_private.assignments enable row level security;
alter table coach_private.comments enable row level security;
alter table coach_private.limits enable row level security;
revoke all on all tables in schema coach_private from public, anon, authenticated;

create function coach_private.require_text(p jsonb, k text, lo integer, hi integer)
returns text language plpgsql security invoker set search_path = '' as $$
declare v text := p->>k;
begin
  if jsonb_typeof(p->k) is distinct from 'string' or length(btrim(v)) < lo or length(v) > hi then
    raise exception using errcode = '22023', message = 'coach_invalid_arguments';
  end if;
  return btrim(v);
end;
$$;

create function coach_private.opt_text(p jsonb, k text, hi integer)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if not (p ? k) or jsonb_typeof(p->k) = 'null' then return null; end if;
  return coach_private.require_text(p, k, 0, hi);
end;
$$;

create function coach_private.require_uuid(p jsonb, k text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v text := coach_private.require_text(p, k, 36, 36);
begin
  if v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'coach_invalid_arguments';
  end if;
  return v::uuid;
end;
$$;

create function coach_private.require_app(p jsonb)
returns text language plpgsql security invoker set search_path = '' as $$
declare v text := coach_private.require_text(p, 'app_id', 1, 40);
begin
  if v not in ('psygames','abstract-hub','smart-alarm','typerighting') then
    raise exception using errcode = '22023', message = 'coach_app_not_enabled';
  end if;
  return v;
end;
$$;

-- Области согласия из запроса: массив строк, обязательно completion, только из 4 известных.
create function coach_private.require_scopes(p jsonb)
returns text[] language plpgsql security invoker set search_path = '' as $$
declare s text[];
begin
  if jsonb_typeof(p->'scopes') is distinct from 'array' or jsonb_array_length(p->'scopes') not between 1 and 4
     or exists (select 1 from jsonb_array_elements(p->'scopes') e where jsonb_typeof(e) <> 'string') then
    raise exception using errcode = '22023', message = 'coach_invalid_scopes';
  end if;
  select array_agg(distinct e) into s from jsonb_array_elements_text(p->'scopes') e;
  if not ('completion' = any(s)) or not (s <@ array['completion','metrics','errors','history']::text[]) then
    raise exception using errcode = '22023', message = 'coach_invalid_scopes';
  end if;
  return s;
end;
$$;

-- Плоский объект значений: до max ключей, значения — число, логическое или строка до 120 знаков.
create function coach_private.flat_object(v jsonb, max_keys integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) = 'null' then return '{}'::jsonb; end if;
  if jsonb_typeof(v) <> 'object'
     or (select count(*) from jsonb_object_keys(v)) > max_keys
     or exists (select 1 from jsonb_each(v) e where length(e.key) > 60
                or jsonb_typeof(e.value) not in ('number','boolean','string')
                or (jsonb_typeof(e.value) = 'string' and length(e.value #>> '{}') > 120)) then
    raise exception using errcode = '22023', message = 'coach_invalid_metrics';
  end if;
  return v;
end;
$$;

-- Лимит: true — можно, false — превышен. Счётчик пишется в той же транзакции.
create function coach_private.hit(p_who uuid, p_bucket text, p_win interval, p_cap integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare ws timestamptz := date_bin(p_win, clock_timestamp(), timestamptz '2026-01-01');
declare n integer;
begin
  insert into coach_private.limits as l (user_id, bucket, window_start, hits) values (p_who, p_bucket, ws, 1)
    on conflict (user_id, bucket, window_start) do update set hits = l.hits + 1
    returning l.hits into n;
  return n <= p_cap;
end;
$$;

-- Событие в виде, который видит преподаватель: поля по областям согласия.
create function coach_private.event_view(e coach_private.events, scopes text[])
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'app_id', e.app_id, 'kind', e.kind, 'mode', e.mode, 'exercise_ref', e.exercise_ref,
    'assignment_id', e.assignment_id, 'step', e.step, 'occurred_at', e.occurred_at, 'received_at', e.received_at)
    || case when 'metrics' = any(scopes) then jsonb_build_object('metrics', e.metrics) else '{}'::jsonb end
    || case when 'errors' = any(scopes) then jsonb_build_object('errors', e.errors) else '{}'::jsonb end;
$$;

create function coach_private.dispatch(p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  allowed text[];
  app text;
  nm text;
  code_v text;
  sc text[];
  ev jsonb;
  occ timestamptz;
  occ_raw text;
  start_at timestamptz;
  page_v integer := 0;
  c coach_private.connections%rowtype;
  i coach_private.invites%rowtype;
  p coach_private.programs%rowtype;
  e coach_private.events%rowtype;
  new_id uuid;
  reply jsonb;
begin
  -- Только зарегистрированный аккаунт: анонимный вход и удалённые пользователи — отказ.
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
    when 'dashboard' then array['page']
    when 'profile_save' then array['name']
    when 'invite_create' then array['app_id']
    when 'invite_preview' then array['app_id','code']
    when 'invite_accept' then array['app_id','code','student_name','consent','scopes','policy_version']
    when 'consent_update' then array['connection_id','app_id','scopes','policy_version','consent']
    when 'consent_revoke' then array['connection_id','app_id']
    when 'disconnect' then array['connection_id']
    when 'result_submit' then array['app_id','event']
    when 'student_events' then array['connection_id','app_id','page']
    when 'program_save' then array['app_id','title','goal','steps']
    when 'assign' then array['connection_id','program_id','due_at']
    when 'comment_add' then array['connection_id','text']
    else null end;
  if allowed is null then
    raise exception using errcode = '22023', message = 'coach_unknown_action';
  end if;
  if exists (select 1 from jsonb_object_keys(p_payload) k where not (k = any(allowed))) then
    raise exception using errcode = '22023', message = 'coach_invalid_arguments';
  end if;
  if p_payload ? 'page' then
    if jsonb_typeof(p_payload->'page') <> 'number' or (p_payload->>'page')::numeric not between 0 and 10000
       or (p_payload->>'page')::numeric <> trunc((p_payload->>'page')::numeric) then
      raise exception using errcode = '22023', message = 'coach_invalid_arguments';
    end if;
    page_v := (p_payload->>'page')::integer;
  end if;

  -- ── Сводка: я как преподаватель (ученики по всем приложениям) и я как ученик (мои преподаватели) ──
  if p_action = 'dashboard' then
    perform c0.id from coach_private.connections c0 where c0.coach_id = caller or c0.student_id = caller order by c0.id for share;
    select jsonb_build_object(
      'contract', 'ecosystem.coach/2',
      'profile', (select jsonb_build_object('name', t.name) from coach_private.coaches t where t.user_id = caller),
      'students', coalesce((select jsonb_agg(s order by s->>'student_name', s->>'connection_id') from (
        select jsonb_build_object(
          'connection_id', c0.id, 'student_name', c0.student_name, 'since', c0.created_at,
          'apps', coalesce((select jsonb_agg(jsonb_build_object(
            'app_id', k.app_id, 'scopes', to_jsonb(k.scopes), 'granted_at', k.granted_at,
            'events', (select count(*) from coach_private.events e0 where e0.student_id = c0.student_id and e0.app_id = k.app_id
                         and e0.received_at >= k.granted_at and ('history' = any(k.scopes) or e0.assignment_id is not null)),
            'last_at', (select max(coalesce(e0.occurred_at, e0.received_at)) from coach_private.events e0 where e0.student_id = c0.student_id
                         and e0.app_id = k.app_id and e0.received_at >= k.granted_at and ('history' = any(k.scopes) or e0.assignment_id is not null))
          ) order by k.app_id) from coach_private.consents k where k.connection_id = c0.id and k.revoked_at is null), '[]'::jsonb)
        ) s
        from coach_private.connections c0 where c0.coach_id = caller and c0.status = 'active'
        order by c0.student_name, c0.id limit 50 offset page_v * 50) q), '[]'::jsonb),
      'coaches', coalesce((select jsonb_agg(jsonb_build_object(
        'connection_id', c0.id, 'coach_name', t.name, 'since', c0.created_at,
        'apps', coalesce((select jsonb_agg(jsonb_build_object('app_id', k.app_id, 'scopes', to_jsonb(k.scopes), 'granted_at', k.granted_at) order by k.app_id)
                 from coach_private.consents k where k.connection_id = c0.id and k.revoked_at is null), '[]'::jsonb))
        order by c0.created_at, c0.id)
        from coach_private.connections c0 join coach_private.coaches t on t.user_id = c0.coach_id
        where c0.student_id = caller and c0.status = 'active'), '[]'::jsonb)
    ) into reply;
    return reply;

  elsif p_action = 'profile_save' then
    nm := coach_private.require_text(p_payload, 'name', 1, 120);
    insert into coach_private.coaches(user_id, name) values (caller, nm) on conflict (user_id) do update set name = excluded.name;
    return jsonb_build_object('profile', jsonb_build_object('name', nm));

  elsif p_action = 'invite_create' then
    app := coach_private.require_app(p_payload);
    if not exists (select 1 from coach_private.coaches t where t.user_id = caller) then
      raise exception using errcode = '42501', message = 'coach_profile_required';
    end if;
    if not coach_private.hit(caller, 'invite_create', interval '1 day', 20) then
      raise exception using errcode = '54000', message = 'coach_rate_limited';
    end if;
    -- 192 случайных бита (две CSPRNG UUIDv4 — 244 бита, берём 48 hex). Хранится только SHA-256.
    code_v := left(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 48);
    insert into coach_private.invites(code_hash, coach_id, app_id, expires_at)
      values (sha256(convert_to(code_v, 'UTF8')), caller, app, clock_timestamp() + interval '7 days') returning * into i;
    return jsonb_build_object('code', code_v, 'app_id', app, 'expires_at', i.expires_at, 'ttl_seconds', 604800);

  elsif p_action in ('invite_preview', 'invite_accept') then
    app := coach_private.require_app(p_payload);
    code_v := coach_private.require_text(p_payload, 'code', 48, 48);
    if code_v !~ '^[0-9a-f]{48}$' then raise exception using errcode = '22023', message = 'coach_invalid_arguments'; end if;
    if p_action = 'invite_accept' then
      if p_payload->'consent' is distinct from 'true'::jsonb then
        raise exception using errcode = '42501', message = 'coach_explicit_consent_required';
      end if;
      nm := coach_private.require_text(p_payload, 'student_name', 1, 120);
      sc := coach_private.require_scopes(p_payload);
      select * into i from coach_private.invites i0 where i0.code_hash = sha256(convert_to(code_v, 'UTF8')) for update;
    else
      select * into i from coach_private.invites i0 where i0.code_hash = sha256(convert_to(code_v, 'UTF8'));
    end if;
    -- Неверный код — ответ без исключения, чтобы счётчик попыток сохранился (10 в час на аккаунт).
    if not found or i.consumed_at is not null or i.expires_at <= clock_timestamp() or i.app_id <> app then
      if not coach_private.hit(caller, 'invite_miss', interval '1 hour', 10) then
        return jsonb_build_object('error', 'coach_rate_limited');
      end if;
      return jsonb_build_object('error', 'coach_invite_unavailable');
    end if;
    if p_action = 'invite_preview' then
      return jsonb_build_object('coach_name', (select t.name from coach_private.coaches t where t.user_id = i.coach_id),
        'app_id', i.app_id, 'expires_at', i.expires_at, 'scopes_available', jsonb_build_array('completion','metrics','errors','history'),
        'policy_version', 'coach/2');
    end if;
    if caller = i.coach_id then raise exception using errcode = '42501', message = 'coach_self_connection_forbidden'; end if;
    select * into c from coach_private.connections c0 where c0.coach_id = i.coach_id and c0.student_id = caller and c0.status = 'active' for update;
    if not found then
      insert into coach_private.connections(coach_id, student_id, student_name) values (i.coach_id, caller, nm)
        on conflict (coach_id, student_id) where status = 'active' do nothing returning * into c;
      if not found then raise exception using errcode = '40001', message = 'coach_retry'; end if;
    end if;
    update coach_private.consents set revoked_at = clock_timestamp() where connection_id = c.id and app_id = i.app_id and revoked_at is null;
    insert into coach_private.consents(connection_id, app_id, scopes, policy_version)
      values (c.id, i.app_id, sc, coach_private.require_text(p_payload, 'policy_version', 1, 40));
    update coach_private.invites set consumed_at = clock_timestamp() where id = i.id;
    return jsonb_build_object('connection_id', c.id, 'app_id', i.app_id, 'scopes', to_jsonb(sc), 'status', 'active', 'generation', c.generation);

  -- ── Тренировка ученика: принимается только при активном согласии на это приложение ──
  elsif p_action = 'result_submit' then
    app := coach_private.require_app(p_payload);
    ev := p_payload->'event';
    if jsonb_typeof(ev) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(ev) k where k not in
         ('event_id','kind','mode','exercise_ref','assignment_id','step','occurred_at','metrics','errors')) then
      raise exception using errcode = '22023', message = 'coach_invalid_arguments';
    end if;
    -- Согласия ученика на это приложение (у любого преподавателя) блокируются: отзыв не проскочит мимо записи.
    perform k.id from coach_private.consents k join coach_private.connections c0 on c0.id = k.connection_id
      where c0.student_id = caller and k.app_id = app and k.revoked_at is null and c0.status = 'active' order by k.id for update;
    select min(k.granted_at) into start_at from coach_private.consents k join coach_private.connections c0 on c0.id = k.connection_id
      where c0.student_id = caller and k.app_id = app and k.revoked_at is null and c0.status = 'active';
    if start_at is null then
      return jsonb_build_object('stored', false, 'reason', 'no_consent');
    end if;
    if (ev->>'assignment_id') is null and not exists (
         select 1 from coach_private.consents k join coach_private.connections c0 on c0.id = k.connection_id
         where c0.student_id = caller and k.app_id = app and k.revoked_at is null and c0.status = 'active' and 'history' = any(k.scopes)) then
      return jsonb_build_object('stored', false, 'reason', 'history_not_granted');
    end if;
    -- Время устройства: будущее (> +5 мин), старше 30 дней или раньше согласия — null, событие пишется.
    occ_raw := ev->>'occurred_at';
    begin
      occ := occ_raw::timestamptz;
    exception when others then occ := null;
    end;
    if occ is not null and (occ > clock_timestamp() + interval '5 minutes' or occ < clock_timestamp() - interval '30 days') then
      occ := null;
    end if;
    if occ is not null and occ < start_at then
      return jsonb_build_object('stored', false, 'reason', 'before_consent');
    end if;
    if not coach_private.hit(caller, 'result_submit', interval '1 day', 1000) then
      raise exception using errcode = '54000', message = 'coach_rate_limited';
    end if;
    insert into coach_private.events(app_id, student_id, event_id, kind, mode, exercise_ref, assignment_id, step, occurred_at, metrics, errors, payload)
      values (app, caller,
        coach_private.require_text(ev, 'event_id', 1, 128),
        coach_private.require_text(ev, 'kind', 1, 40),
        coach_private.opt_text(ev, 'mode', 60),
        coach_private.opt_text(ev, 'exercise_ref', 120),
        case when (ev->>'assignment_id') is null then null else coach_private.require_uuid(ev, 'assignment_id') end,
        case when jsonb_typeof(ev->'step') = 'number' then (ev->>'step')::numeric::integer else null end,
        occ,
        coach_private.flat_object(ev->'metrics', 40),
        coach_private.flat_object(ev->'errors', 100),
        ev)
      on conflict (app_id, student_id, event_id) do nothing returning * into e;
    if not found then
      select * into e from coach_private.events e0 where e0.app_id = app and e0.student_id = caller and e0.event_id = ev->>'event_id';
      if e.payload is distinct from ev then
        raise exception using errcode = '23505', message = 'coach_event_payload_conflict';
      end if;
      return jsonb_build_object('stored', true, 'duplicate', true, 'id', e.id);
    end if;
    return jsonb_build_object('stored', true, 'duplicate', false, 'id', e.id, 'occurred_at', e.occurred_at);

  elsif p_action = 'program_save' then
    app := coach_private.require_app(p_payload);
    if not exists (select 1 from coach_private.coaches t where t.user_id = caller) then
      raise exception using errcode = '42501', message = 'coach_profile_required';
    end if;
    if jsonb_typeof(p_payload->'steps') is distinct from 'array' or jsonb_array_length(p_payload->'steps') not between 1 and 50
       or octet_length((p_payload->'steps')::text) > 8000 then
      raise exception using errcode = '22023', message = 'coach_invalid_arguments';
    end if;
    insert into coach_private.programs(coach_id, app_id, title, goal, steps)
      values (caller, app, coach_private.require_text(p_payload, 'title', 1, 160), coach_private.require_text(p_payload, 'goal', 0, 2000), p_payload->'steps')
      returning id into new_id;
    return jsonb_build_object('id', new_id);
  end if;

  -- ── Действия над связью: строка связи блокируется до любых проверок ──
  select * into c from coach_private.connections c0 where c0.id = coach_private.require_uuid(p_payload, 'connection_id')
    and (c0.coach_id = caller or c0.student_id = caller) for update;
  if not found then raise exception using errcode = '42501', message = 'coach_connection_unavailable'; end if;

  if p_action = 'disconnect' then
    if c.status = 'active' then
      update coach_private.consents set revoked_at = clock_timestamp() where connection_id = c.id and revoked_at is null;
      update coach_private.connections set status = 'revoked', generation = generation + 1, revoked_at = clock_timestamp() where id = c.id;
    end if;
    return jsonb_build_object('status', 'revoked');
  end if;
  if c.status <> 'active' then raise exception using errcode = '42501', message = 'coach_relationship_inactive'; end if;

  if p_action = 'consent_revoke' then
    if caller <> c.student_id then raise exception using errcode = '42501', message = 'coach_student_required'; end if;
    app := coach_private.require_app(p_payload);
    update coach_private.consents set revoked_at = clock_timestamp() where connection_id = c.id and app_id = app and revoked_at is null;
    return jsonb_build_object('app_id', app, 'revoked', true);

  elsif p_action = 'consent_update' then
    if caller <> c.student_id then raise exception using errcode = '42501', message = 'coach_student_required'; end if;
    if p_payload->'consent' is distinct from 'true'::jsonb then
      raise exception using errcode = '42501', message = 'coach_explicit_consent_required';
    end if;
    app := coach_private.require_app(p_payload);
    sc := coach_private.require_scopes(p_payload);
    update coach_private.consents set revoked_at = clock_timestamp() where connection_id = c.id and app_id = app and revoked_at is null;
    insert into coach_private.consents(connection_id, app_id, scopes, policy_version)
      values (c.id, app, sc, coach_private.require_text(p_payload, 'policy_version', 1, 40));
    return jsonb_build_object('app_id', app, 'scopes', to_jsonb(sc));

  elsif p_action = 'student_events' then
    if caller <> c.coach_id then raise exception using errcode = '42501', message = 'coach_coach_required'; end if;
    app := coach_private.require_app(p_payload);
    select k.scopes, k.granted_at into sc, start_at from coach_private.consents k where k.connection_id = c.id and k.app_id = app and k.revoked_at is null;
    if sc is null then return jsonb_build_object('app_id', app, 'events', '[]'::jsonb, 'consent', false); end if;
    select coalesce(jsonb_agg(coach_private.event_view(e0, sc) order by coalesce(e0.occurred_at, e0.received_at) desc, e0.id), '[]'::jsonb) into reply
      from (select * from coach_private.events e1 where e1.student_id = c.student_id and e1.app_id = app and e1.received_at >= start_at
              and ('history' = any(sc) or e1.assignment_id is not null)
            order by coalesce(e1.occurred_at, e1.received_at) desc, e1.id limit 50 offset page_v * 50) e0;
    return jsonb_build_object('app_id', app, 'scopes', to_jsonb(sc), 'events', reply, 'consent', true);

  elsif p_action = 'assign' then
    if caller <> c.coach_id then raise exception using errcode = '42501', message = 'coach_coach_required'; end if;
    select * into p from coach_private.programs p0 where p0.id = coach_private.require_uuid(p_payload, 'program_id') and p0.coach_id = caller;
    if not found then raise exception using errcode = '42501', message = 'coach_program_unavailable'; end if;
    if not exists (select 1 from coach_private.consents k where k.connection_id = c.id and k.app_id = p.app_id and k.revoked_at is null) then
      raise exception using errcode = '42501', message = 'coach_consent_required';
    end if;
    insert into coach_private.assignments(connection_id, generation, program_id, app_id, title, steps, due_at)
      values (c.id, c.generation, p.id, p.app_id, p.title, p.steps,
        case when (p_payload->>'due_at') is null then null else (coach_private.require_text(p_payload, 'due_at', 10, 40))::timestamptz end)
      returning id into new_id;
    return jsonb_build_object('id', new_id);

  elsif p_action = 'comment_add' then
    insert into coach_private.comments(connection_id, generation, author_id, text)
      values (c.id, c.generation, caller, coach_private.require_text(p_payload, 'text', 1, 2000)) returning id into new_id;
    return jsonb_build_object('id', new_id);
  end if;
  raise exception using errcode = '22023', message = 'coach_unknown_action';
end;
$$;

create function public.ecosystem_coach_v2(p_action text, p_payload jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select coach_private.dispatch(p_action, p_payload);
$$;
alter function coach_private.dispatch(text, jsonb) owner to postgres;
alter function public.ecosystem_coach_v2(text, jsonb) owner to postgres;
revoke all on all functions in schema coach_private from public, anon, authenticated;
revoke all on function public.ecosystem_coach_v2(text, jsonb) from public, anon, authenticated;
grant usage on schema coach_private to authenticated;
grant execute on function coach_private.dispatch(text, jsonb) to authenticated;
grant execute on function public.ecosystem_coach_v2(text, jsonb) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on schema coach_private from service_role';
    execute 'revoke all on all tables in schema coach_private from service_role';
    execute 'revoke all on all functions in schema coach_private from service_role';
    execute 'revoke all on function public.ecosystem_coach_v2(text,jsonb) from service_role';
  end if;
end;
$$;
comment on function public.ecosystem_coach_v2(text, jsonb) is
  'ecosystem.coach/2: кабинет преподавателя для psygames/abstract-hub/smart-alarm/typerighting; только зарегистрированный auth.uid; доступ к данным — только через этот вызов.';
commit;
