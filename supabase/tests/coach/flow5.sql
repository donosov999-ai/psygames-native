\set ON_ERROR_STOP on
-- coach/3.1 — правка будущих назначений и часовой пояс расписания (TeamOps 0ff0b928).
begin;
set local role authenticated;
create temp table h(k text primary key, val text);
grant all on h to authenticated;
create function pg_temp.v(key text) returns text language sql as $$ select val from h where k = key $$;

select test.login(4);
insert into h select 'code', public.ecosystem_coach_v2('invite_create','{"app_id":"psygames"}')->>'code';
select test.login(5);
insert into h select 'conn', public.ecosystem_coach_v2('invite_accept',jsonb_build_object('app_id','psygames','code',pg_temp.v('code'),'student_name','Иван','consent',true,'scopes','["completion"]'::jsonb,'policy_version','coach/2'))->>'connection_id';
select test.login(4);
insert into h select 'p1', public.ecosystem_coach_v2('lesson_save','{"app_id":"psygames","title":"Шульте","steps":[{"ref":"schulte_table","amount":2}]}')->>'id';
insert into h select 'p2', public.ecosystem_coach_v2('lesson_save','{"app_id":"psygames","title":"Струп","steps":[{"ref":"stroop","amount":1}]}')->>'id';
select test.reject('assign_lesson',jsonb_build_object('program_id',pg_temp.v('p1'),'connection_id',pg_temp.v('conn'),'tz_offset_min',5000),'22023','смещение пояса вне ±14 ч отклонено');
insert into h select 'a1', public.ecosystem_coach_v2('assign_lesson',jsonb_build_object('program_id',pg_temp.v('p1'),'connection_id',pg_temp.v('conn'),'recurrence','daily','tz_offset_min',300))->>'id';
select test.ok(pg_temp.v('a1') is not null,'назначение с поясом +5 ч');

select test.login(5);
select public.ecosystem_coach_v2('result_submit','{"app_id":"psygames","event":{"event_id":"tz1","kind":"game","mode":"schulte_table"}}');
select test.ok((public.ecosystem_coach_v2('student_assignments','{}')->'assignments'->0->'done'->>0)::int=1,'тренировка засчитана в назначении с поясом');

select test.login(4);
select test.reject('assignment_update',jsonb_build_object('assignment_id',pg_temp.v('a1'),'title','x'),'22023','лишние поля правки отклонены');
insert into h select 'a2', public.ecosystem_coach_v2('assignment_update',jsonb_build_object('assignment_id',pg_temp.v('a1'),'recurrence','weekly','due_at','2099-01-01T00:00:00Z'))->>'id';
select test.ok(pg_temp.v('a2') is not null and pg_temp.v('a2') <> pg_temp.v('a1'),'правка срока/повтора — новое назначение');
select test.ok((public.ecosystem_coach_v2('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a2')))->'rows'->0->'done'->>0)::int=1,'урок прежний — сделанное сохранилось');
select test.ok((public.ecosystem_coach_v2('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a1')))->'rows'->0->'done'->>0)::int=1,'старое назначение: отчёт как был (прошлое не переписано)');
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('assignments_list','{}')->'assignments')=1,'в списке только новое назначение');
select test.reject('assignment_update',jsonb_build_object('assignment_id',pg_temp.v('a1'),'recurrence','daily'),'42501','архивное назначение не правится');
insert into h select 'a3', public.ecosystem_coach_v2('assignment_update',jsonb_build_object('assignment_id',pg_temp.v('a2'),'program_id',pg_temp.v('p2')))->>'id';
select test.ok((public.ecosystem_coach_v2('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a3')))->'rows'->0->'done'->>0)::int=0,'смена урока — отсчёт заново');
select test.ok((public.ecosystem_coach_v2('assignment_report',jsonb_build_object('assignment_id',pg_temp.v('a3')))->>'title')='Струп','новое назначение несёт новый урок');

select test.login(1);
select test.reject('assignment_update',jsonb_build_object('assignment_id',pg_temp.v('a3'),'recurrence','daily'),'42501','чужое назначение не правится');
select test.login(5);
select test.ok(jsonb_array_length(public.ecosystem_coach_v2('student_assignments','{}')->'assignments')=1,'у ученика одно действующее задание');
reset role;
select test.ok((select tz_offset_min from coach_private.assignments where id = pg_temp.v('a3')::uuid)=300,'пояс переходит в новое назначение');
select test.ok(coach_private.period_start_tz('daily', timestamptz '2026-01-01', timestamptz '2026-11-12 03:00+00', 300) = timestamptz '2026-11-11 19:00+00','«каждый день» при +5 ч — с полуночи по местному (19:00 UTC)');
select test.ok(not has_function_privilege('authenticated','coach_private.dispatch31(text,jsonb)','execute'),'dispatch31 напрямую не вызвать');
commit;
