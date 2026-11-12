\set ON_ERROR_STOP on
-- ecosystem.coach/3 — группы, уроки, задания, отчёты. Подставные пользователи (как в flow.sql):
-- 1 преподаватель, 2 и 5 ученики, 3 посторонний, 4 другой преподаватель. Без сети и реальных аккаунтов.
begin;
set local role authenticated;
create temp table w(k text primary key, val text);
grant all on w to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from w where k = key $$;

select test.login(1);
select public.ecosystem_coach_v2('profile_save','{"name":"Анна Петровна"}');
select test.reject('groups_list','{"x":1}'::jsonb,'22023','лишние поля отклонены (coach/3)');
insert into w select 'g', public.ecosystem_coach_v2('group_save','{"name":"5А"}')->>'id';
select test.ok(pg_temp.v('g') is not null,'группа создана');
select test.ok((public.ecosystem_coach_v2('group_save',jsonb_build_object('group_id',pg_temp.v('g'),'name','5 «А»'))->>'name')='5 «А»','группа переименована');
insert into w select 'gcode', public.ecosystem_coach_v2('group_invite_create',jsonb_build_object('group_id',pg_temp.v('g'),'app_id','psygames','max_uses',2))->>'code';
select test.ok(pg_temp.v('gcode') ~ '^[0-9a-f]{48}$','групповой код — та же форма 48 hex, что у coach/2');

-- Шаблоны и уроки
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('templates_list','{"app_id":"psygames","lang":"ru"}')->'lessons')>=2,'шаблоны PsyGames есть');
select test.ok((public.ecosystem_coach_v2('templates_list','{"app_id":"psygames","lang":"ru"}')->'lessons'->0->>'title') ~ '[А-я]','шаблон отдаётся по-русски');
select test.reject('lesson_save','{"app_id":"psygames","title":"x","steps":[{"ref":"stroop","amount":0}]}'::jsonb,'22023','шаг с нулём раз отклонён');
select test.reject('lesson_save','{"app_id":"psygames","title":"x","steps":[{"ref":"stroop","amount":1,"script":"<b>"}]}'::jsonb,'22023','лишнее поле шага отклонено');
select test.reject('lesson_save','{"app_id":"psygames","title":"x","steps":[{"ref":"stroop","amount":1,"app_id":"typerighting"}]}'::jsonb,'22023','шаг чужого приложения отклонён');
insert into w select 'p', public.ecosystem_coach_v2('lesson_save','{"app_id":"psygames","title":"Внимание","goal":"разогрев","steps":[{"ref":"schulte_table","amount":2},{"ref":"stroop","amount":1,"unit":"minutes"}]}')->>'id';
select test.ok(pg_temp.v('p') is not null,'урок сохранён');
insert into w select 'tpl', public.ecosystem_coach_v2('templates_list','{"app_id":"psygames"}')->'lessons'->0->>'id';
select test.ok((public.ecosystem_coach_v2('lesson_copy',jsonb_build_object('program_id',pg_temp.v('tpl'),'lang','ru'))->>'id') is not null,'шаблон скопирован в свои');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('lessons_list','{"app_id":"psygames"}')->'lessons')=2,'мои уроки: свой + копия шаблона');

-- Два ученика входят по одной групповой ссылке; уже выпущенное приложение зовёт старые invite_preview/accept
select test.login(2);
select test.ok((public.ecosystem_coach_v2('invite_preview',jsonb_build_object('app_id','psygames','code',pg_temp.v('gcode')))->>'group_name')='5 «А»','предпросмотр групповой ссылки показывает группу');
insert into w select 'c2', public.ecosystem_coach_v2('invite_accept',jsonb_build_object('app_id','psygames','code',pg_temp.v('gcode'),'student_name','Маша','consent',true,'scopes','["completion","metrics","errors"]'::jsonb,'policy_version','coach/2'))->>'connection_id';
select test.ok(pg_temp.v('c2') is not null,'ученик 2 вошёл по групповой ссылке');
select test.login(5);
insert into w select 'c5', public.ecosystem_coach_v2('invite_accept',jsonb_build_object('app_id','psygames','code',pg_temp.v('gcode'),'student_name','Иван','consent',true,'scopes','["completion"]'::jsonb,'policy_version','coach/2'))->>'connection_id';
select test.ok(pg_temp.v('c5') is not null,'ученик 5 вошёл по той же ссылке');
select test.login(3);
select test.ok((public.ecosystem_coach_v2('invite_accept',jsonb_build_object('app_id','psygames','code',pg_temp.v('gcode'),'student_name','Лишний','consent',true,'scopes','["completion"]'::jsonb,'policy_version','coach/2'))->>'error')='coach_invite_unavailable','после max_uses ссылка закрыта');

-- Назначение группе: каждый будний день; без области history тренировка по заданию всё равно засчитывается
select test.login(1);
select test.ok((public.ecosystem_coach_v2('group_members',jsonb_build_object('group_id',pg_temp.v('g')))->'students'->0->>'name') is not null,'в группе есть ученики');
select test.reject('assign_lesson',jsonb_build_object('program_id',pg_temp.v('p'),'group_id',pg_temp.v('g'),'connection_id',pg_temp.v('c2')),'22023','кому — либо группа, либо ученик');
select test.reject('assign_lesson',jsonb_build_object('program_id',pg_temp.v('p'),'group_id',pg_temp.v('g'),'recurrence','hourly'),'22023','неизвестный повтор отклонён');
insert into w select 'a', public.ecosystem_coach_v2('assign_lesson',jsonb_build_object('program_id',pg_temp.v('p'),'group_id',pg_temp.v('g'),'recurrence','daily'))->>'id';
select test.ok(pg_temp.v('a') is not null,'урок назначен группе');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a')))->'rows')=2,'в отчёте по заданию оба ученика');

select test.login(5);
select test.ok((public.ecosystem_coach_v2('result_submit','{"app_id":"psygames","event":{"event_id":"x1","kind":"game","mode":"schulte_table"}}')->>'stored')::boolean,'без history тренировка по шагу задания записана');
select test.ok((public.ecosystem_coach_v2('result_submit','{"app_id":"psygames","event":{"event_id":"x2","kind":"game","mode":"sudoku"}}')->>'reason')='history_not_granted','тренировка вне задания без history — не пишется');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('student_assignments','{}')->'assignments')=1,'у ученика одно задание');
select test.ok((public.ecosystem_coach_v2('student_assignments','{}')->'assignments'->0->'done'->>0)::int=1,'у ученика засчитан 1 из 2 по Шульте');
select test.ok((public.ecosystem_coach_v2('student_assignments','{}')->'assignments'->0->>'status')='inProgress','статус ученика — в процессе');

select test.login(2);
select public.ecosystem_coach_v2('result_submit','{"app_id":"psygames","event":{"event_id":"m1","kind":"game","mode":"schulte_table","metrics":{"score":40}}}');
select public.ecosystem_coach_v2('result_submit','{"app_id":"psygames","event":{"event_id":"m2","kind":"game","mode":"schulte_table","metrics":{"score":50}}}');
select public.ecosystem_coach_v2('result_submit','{"app_id":"psygames","event":{"event_id":"m3","kind":"game","exercise_ref":"stroop:hard","metrics":{"time_seconds":75},"errors":{"wrong_color":4}}}');
select test.ok((public.ecosystem_coach_v2('student_assignments','{"app_id":"psygames"}')->'assignments'->0->>'status')='done','ученик 2 выполнил задание: 2 раза + 1 минута');

select test.login(1);
select test.ok((select count(*) from jsonb_array_elements(public.ecosystem_coach_v2('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a')))->'rows') r where r->>'status'='done')=1,'в отчёте один «сделал»');
select test.ok((public.ecosystem_coach_v2('assignments_list','{}')->'assignments'->0->'counts'->>'done')::int=1,'счётчики статусов в списке заданий');
select test.ok((public.ecosystem_coach_v2('groups_list','{}')->'groups'->0->>'students')::int=2,'в группе 2 ученика');
select test.ok((public.ecosystem_coach_v2('groups_list','{}')->'groups'->0->>'active_assignments')::int=1,'у группы одно активное задание');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('student_report',jsonb_build_object('connection_id',pg_temp.v('c2')))->'weeks')=6,'отчёт по ученику: 6 недель');
select test.ok((public.ecosystem_coach_v2('student_report',jsonb_build_object('connection_id',pg_temp.v('c2')))->'mistakes'->0->>'key')='wrong_color','частые ошибки видны при области errors');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('student_report',jsonb_build_object('connection_id',pg_temp.v('c5')))->'mistakes')=0,'без области errors ошибок не видно');
select test.ok((public.ecosystem_coach_v2('group_report',jsonb_build_object('group_id',pg_temp.v('g')))->>'done_share')::numeric=0.5,'отчёт по группе: выполнено 50 %');
select public.ecosystem_coach_v2('comment_add',jsonb_build_object('connection_id',pg_temp.v('c2'),'text','Отлично!'));
select test.ok((public.ecosystem_coach_v2('comment_list',jsonb_build_object('connection_id',pg_temp.v('c2')))->'comments'->0->>'from')='coach','комментарий преподавателя в ленте');
select test.login(2);
select test.ok((public.ecosystem_coach_v2('student_assignments','{}')->'assignments'->0->>'comment')='Отлично!','ученик видит комментарий у задания');

-- Состав группы правит только преподаватель и только своими учениками
select test.login(1);
select test.ok((public.ecosystem_coach_v2('group_members_set',jsonb_build_object('group_id',pg_temp.v('g'),'connection_ids',jsonb_build_array(pg_temp.v('c2'))))->>'students')::int=1,'из группы убран ученик');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a')))->'rows')=1,'убранный ученик пропал из отчёта');

-- Изоляция: другой преподаватель, посторонний, ученик
select test.login(4);
select test.reject('group_members',jsonb_build_object('group_id',pg_temp.v('g')),'42501','чужая группа недоступна');
select test.reject('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a')),'42501','чужое задание недоступно');
select test.reject('assign_lesson',jsonb_build_object('program_id',pg_temp.v('p'),'connection_id',pg_temp.v('c2')),'42501','чужой урок не назначить');
select test.reject('group_members_set',jsonb_build_object('group_id',pg_temp.v('g'),'connection_ids','[]'::jsonb),'42501','чужой состав не правится');
select test.login(3);
select test.reject('groups_list','{}'::jsonb,'42501','без профиля преподавателя групп нет');
select test.reject('student_report',jsonb_build_object('connection_id',pg_temp.v('c2')),'42501','посторонний не видит отчёт');
select test.login(2);
select test.reject('student_report',jsonb_build_object('connection_id',pg_temp.v('c2')),'42501','ученик не читает отчёт как преподаватель');

-- Отзыв согласия: прогресс по заданию обнуляется для преподавателя
select public.ecosystem_coach_v2('consent_revoke',jsonb_build_object('connection_id',pg_temp.v('c2'),'app_id','psygames'));
select test.login(1);
select test.ok((public.ecosystem_coach_v2('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a')))->'rows'->0->>'consent')='false','после отзыва согласия прогресс скрыт');

-- Архив
select test.ok((public.ecosystem_coach_v2('group_archive',jsonb_build_object('group_id',pg_temp.v('g')))->>'archived')::boolean,'группа в архиве');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('groups_list','{}')->'groups')=0,'архивная группа не в списке');
select test.reject('assign_lesson',jsonb_build_object('program_id',pg_temp.v('p'),'group_id',pg_temp.v('g')),'42501','архивной группе не назначить');
reset role;
select test.ok(not has_table_privilege('authenticated','coach_private.groups','select'),'таблицы групп закрыты от прямого чтения');
select test.ok(not has_function_privilege('authenticated','coach_private.dispatch3(text,jsonb)','execute'),'dispatch3 напрямую не вызвать');
commit;
