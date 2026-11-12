\set ON_ERROR_STOP on
-- coach/3.2 — данные шага: проходят в урок, снимок задания и задания ученика; кривые отклоняются.
begin;
set local role authenticated;
create temp table d(k text primary key, val text);
grant all on d to authenticated;
select test.login(4);
select test.reject('lesson_save','{"app_id":"psygames","title":"x","steps":[{"ref":"stroop","amount":1,"data":"строка"}]}'::jsonb,'22023','data не объект — отклонено');
select test.reject('lesson_save',jsonb_build_object('app_id','psygames','title','x','steps',jsonb_build_array(jsonb_build_object('ref','stroop','amount',1,'data',jsonb_build_object('t',repeat('я',3000))))),'22023','data больше 4 КБ — отклонено');
insert into d select 'p', public.ecosystem_coach_v2('lesson_save','{"app_id":"psygames","title":"Свой текст","steps":[{"ref":"stroop","amount":1,"data":{"text":"Мама мыла раму","fen":"8/8/8/8/8/8/8/K6k w - - 0 1"}}]}')->>'id';
select test.ok((select val from d where k='p') is not null,'урок с данными шага сохранён');
select test.ok((public.ecosystem_coach_v2('lessons_list','{"app_id":"psygames"}')->'lessons'->0->'steps'->0->'data'->>'text')='Мама мыла раму','данные шага видны в уроке');
reset role;
select test.ok(not has_function_privilege('authenticated','coach_private.require_steps(jsonb,text)','execute'),'require_steps напрямую не вызвать');
commit;
