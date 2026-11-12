\set ON_ERROR_STOP on
-- ecosystem.coach/2 — сквозной сценарий на подставных пользователях (1 преподаватель, 2 ученик,
-- 3 посторонний, 4 другой преподаватель, 5 другой ученик, 6 анонимный). Без сети и реальных аккаунтов.
begin;
set local role authenticated;
create temp table v(k text primary key, val text);
grant all on v to authenticated;

-- Анонимный вход и посторонние действия
select test.login(6);
select test.reject('dashboard','{}'::jsonb,'42501','анонимный вход отклонён');
select test.login(1);
select test.reject('drop_all','{}'::jsonb,'22023','неизвестное действие отклонено');
select test.reject('invite_create','{"app_id":"psygames"}'::jsonb,'42501','без профиля приглашать нельзя');
select test.reject('invite_create','{"app_id":"other"}'::jsonb,'22023','чужое приложение отклонено');
select test.ok((public.ecosystem_coach_v2('profile_save','{"name":"Анна Петровна"}')->'profile'->>'name')='Анна Петровна','профиль преподавателя');

-- Приглашение в Chess & Go, предпросмотр, принятие с согласием (completion+metrics, без history)
insert into v select 'code', public.ecosystem_coach_v2('invite_create','{"app_id":"abstract-hub"}')->>'code';
select test.ok(length((select val from v where k='code'))=48,'код приглашения 48 hex = 192 бита');
select test.login(2);
select test.ok((public.ecosystem_coach_v2('invite_preview',jsonb_build_object('app_id','abstract-hub','code',(select val from v where k='code')))->>'coach_name')='Анна Петровна','предпросмотр показывает преподавателя');
select test.ok((public.ecosystem_coach_v2('invite_preview',jsonb_build_object('app_id','psygames','code',(select val from v where k='code')))->>'error')='coach_invite_unavailable','код другого приложения не подходит');
select test.reject('invite_accept',jsonb_build_object('app_id','abstract-hub','code',(select val from v where k='code'),'student_name','Ваня','consent',false,'scopes','["completion"]'::jsonb,'policy_version','coach/2'),'42501','без явного согласия не подключает');
select test.reject('invite_accept',jsonb_build_object('app_id','abstract-hub','code',(select val from v where k='code'),'student_name','Ваня','consent',true,'scopes','["metrics"]'::jsonb,'policy_version','coach/2'),'22023','область completion обязательна');
insert into v select 'conn', public.ecosystem_coach_v2('invite_accept',jsonb_build_object('app_id','abstract-hub','code',(select val from v where k='code'),'student_name','Ваня','consent',true,'scopes','["completion","metrics"]'::jsonb,'policy_version','coach/2'))->>'connection_id';
select test.ok((select val from v where k='conn') is not null,'ученик подключён');
select test.ok((public.ecosystem_coach_v2('invite_accept',jsonb_build_object('app_id','abstract-hub','code',(select val from v where k='code'),'student_name','Ваня','consent',true,'scopes','["completion"]'::jsonb,'policy_version','coach/2'))->>'error')='coach_invite_unavailable','код одноразовый');

-- Тренировки: без history — только задания; с заданием — пишется; в чужом приложении без согласия — нет
select test.ok((public.ecosystem_coach_v2('result_submit','{"app_id":"abstract-hub","event":{"event_id":"e1","kind":"puzzle","mode":"go-capture"}}')->>'reason')='history_not_granted','вне заданий без области history — не пишется');
select test.ok((public.ecosystem_coach_v2('result_submit','{"app_id":"psygames","event":{"event_id":"p1","kind":"game"}}')->>'reason')='no_consent','без согласия на приложение — не пишется');
select test.ok((public.ecosystem_coach_v2('consent_update',jsonb_build_object('connection_id',(select val from v where k='conn'),'app_id','abstract-hub','scopes','["completion","metrics","history"]'::jsonb,'policy_version','coach/2','consent',true))->'scopes') ? 'history','ученик расширил согласие: history');
insert into v select 't', to_char((clock_timestamp()+interval '2 seconds') at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"');
select test.ok((public.ecosystem_coach_v2('result_submit',jsonb_build_object('app_id','abstract-hub','event',jsonb_build_object('event_id','e2','kind','puzzle','mode','go-capture','exercise_ref','go-capture:12','occurred_at',(select val from v where k='t'),'metrics',jsonb_build_object('score',80,'seconds',95),'errors',jsonb_build_object('wrong_moves',3))))->>'stored')::boolean,'тренировка записана');
select test.ok((public.ecosystem_coach_v2('result_submit',jsonb_build_object('app_id','abstract-hub','event',jsonb_build_object('event_id','e2','kind','puzzle','mode','go-capture','exercise_ref','go-capture:12','occurred_at',(select val from v where k='t'),'metrics',jsonb_build_object('score',80,'seconds',95),'errors',jsonb_build_object('wrong_moves',3))))->>'duplicate')::boolean,'тот же повтор — duplicate');
select test.reject('result_submit','{"app_id":"abstract-hub","event":{"event_id":"e2","kind":"puzzle","metrics":{"score":1}}}'::jsonb,'23505','изменённый повтор — conflict');
select test.ok((public.ecosystem_coach_v2('result_submit','{"app_id":"abstract-hub","event":{"event_id":"e3","kind":"puzzle","occurred_at":"2099-01-01T00:00:00Z"}}')->>'occurred_at') is null,'будущее время — «время неизвестно»');
select test.reject('result_submit','{"app_id":"abstract-hub","event":{"event_id":"e4","kind":"puzzle","text":"мой дневник"}}'::jsonb,'22023','лишние поля (текст) не принимаются');
select test.reject('result_submit','{"app_id":"abstract-hub","event":{"event_id":"e5","kind":"puzzle","metrics":{"fen":{"deep":1}}}}'::jsonb,'22023','вложенные данные в metrics не принимаются');

-- Преподаватель видит сводку и тренировки; без области errors — ошибок не видно
select test.login(1);
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('dashboard','{}')->'students')=1,'в сводке преподавателя один ученик');
select test.ok((public.ecosystem_coach_v2('dashboard','{}')->'students'->0->'apps'->0->>'events')::int=2,'по Chess & Go видно 2 тренировки');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('student_events',jsonb_build_object('connection_id',(select val from v where k='conn'),'app_id','abstract-hub'))->'events')=2,'список тренировок ученика');
select test.ok((public.ecosystem_coach_v2('student_events',jsonb_build_object('connection_id',(select val from v where k='conn'),'app_id','abstract-hub'))->'events'->0) ? 'metrics','показатели видны (metrics)');
select test.ok(not ((public.ecosystem_coach_v2('student_events',jsonb_build_object('connection_id',(select val from v where k='conn'),'app_id','abstract-hub'))->'events'->0) ? 'errors'),'ошибки скрыты без области errors');

-- Изоляция: посторонний и другой преподаватель ничего не видят
select test.login(3);
select test.reject('student_events',jsonb_build_object('connection_id',(select val from v where k='conn'),'app_id','abstract-hub'),'42501','посторонний не видит тренировки');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('dashboard','{}')->'students')=0,'у постороннего пустая сводка');
select test.login(4);
select test.ok((public.ecosystem_coach_v2('profile_save','{"name":"Другой"}')->'profile'->>'name')='Другой','второй преподаватель');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('dashboard','{}')->'students')=0,'чужих учеников не видно');
select test.login(2);
select test.reject('student_events',jsonb_build_object('connection_id',(select val from v where k='conn'),'app_id','abstract-hub'),'42501','ученик не читает как преподаватель');

-- Отзыв согласия: дальше не пишется, преподаватель больше не видит
select test.ok((public.ecosystem_coach_v2('consent_revoke',jsonb_build_object('connection_id',(select val from v where k='conn'),'app_id','abstract-hub'))->>'revoked')::boolean,'ученик отозвал согласие');
select test.ok((public.ecosystem_coach_v2('result_submit','{"app_id":"abstract-hub","event":{"event_id":"e6","kind":"puzzle"}}')->>'reason')='no_consent','после отзыва тренировки не уходят');
select test.login(1);
select test.ok((public.ecosystem_coach_v2('student_events',jsonb_build_object('connection_id',(select val from v where k='conn'),'app_id','abstract-hub'))->>'consent')='false','после отзыва преподаватель не видит тренировки');

-- Разрыв связи
select test.login(2);
select test.ok((public.ecosystem_coach_v2('disconnect',jsonb_build_object('connection_id',(select val from v where k='conn')))->>'status')='revoked','ученик разорвал связь');
select test.login(1);
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('dashboard','{}')->'students')=0,'после разрыва ученика нет в сводке');

-- Лимиты: 20 приглашений в сутки; 10 неверных кодов в час
do $$ begin for n in 1..19 loop perform public.ecosystem_coach_v2('invite_create','{"app_id":"psygames"}'); end loop; end $$;
select test.reject('invite_create','{"app_id":"psygames"}'::jsonb,'54000','21-е приглашение за сутки — лимит');
select test.login(5);
do $$ begin for n in 1..10 loop perform public.ecosystem_coach_v2('invite_preview','{"app_id":"psygames","code":"000000000000000000000000000000000000000000000000"}'); end loop; end $$;
select test.ok((public.ecosystem_coach_v2('invite_preview','{"app_id":"psygames","code":"000000000000000000000000000000000000000000000000"}')->>'error')='coach_rate_limited','11-я неверная попытка за час — лимит');

-- Прямой доступ к таблицам закрыт
select test.ok(not has_table_privilege('authenticated','coach_private.events','select'),'таблицы закрыты от прямого чтения');
reset role;
select test.ok((select count(*) from public.legacy_progress)=1,'чужие данные не тронуты');

-- Удаление аккаунта ученика удаляет его тренировки и согласия
delete from auth.users where id='00000000-0000-0000-0000-000000000002';
select test.ok((select count(*) from coach_private.events where student_id='00000000-0000-0000-0000-000000000002')=0,'удаление ученика удаляет его тренировки');
commit;
