\set ON_ERROR_STOP on
-- Fudao — пятое приложение кабинета: свои области согласия; чужие области отклоняются в обе стороны.
begin;
set local role authenticated;
create temp table f(k text primary key, val text);
grant all on f to authenticated;
select test.login(4);
insert into f select 'fc', public.ecosystem_coach_v2('invite_create','{"app_id":"fudao"}')->>'code';
insert into f select 'pc', public.ecosystem_coach_v2('invite_create','{"app_id":"psygames"}')->>'code';
select test.ok((select val from f where k='fc') ~ '^[0-9a-f]{48}$','приглашение в Fudao создаётся');
select test.login(3);
select test.reject('invite_accept',jsonb_build_object('app_id','fudao','code',(select val from f where k='fc'),'student_name','Клиент','consent',true,'scopes','["completion","metrics"]'::jsonb,'policy_version','coach/2'),'22023','Fudao: область игр (metrics) отклонена');
select test.reject('invite_accept',jsonb_build_object('app_id','psygames','code',(select val from f where k='pc'),'student_name','Клиент','consent',true,'scopes','["completion","birth_data"]'::jsonb,'policy_version','coach/2'),'22023','PsyGames: область Fudao (birth_data) отклонена');
insert into f select 'conn', public.ecosystem_coach_v2('invite_accept',jsonb_build_object('app_id','fudao','code',(select val from f where k='fc'),'student_name','Клиент','consent',true,'scopes','["completion","birth_data","charts"]'::jsonb,'policy_version','coach/2'))->>'connection_id';
select test.ok((select val from f where k='conn') is not null,'клиент принял приглашение Fudao с данными рождения и картами');
select test.ok((public.ecosystem_coach_v2('consent_update',jsonb_build_object('connection_id',(select val from f where k='conn'),'app_id','fudao','scopes','["completion","birth_data","charts","readings","diary_shared"]'::jsonb,'policy_version','coach/2','consent',true))->'scopes') ? 'diary_shared','клиент расширил согласие Fudao до всех пяти областей');
select test.login(4);
select test.ok((select count(*) from jsonb_array_elements(public.ecosystem_coach_v2('dashboard','{}')->'students') s, jsonb_array_elements(s->'apps') a where a->>'app_id'='fudao')=1,'специалист видит клиента Fudao в сводке');
select test.ok((public.ecosystem_coach_v2('templates_list','{"app_id":"fudao"}')->'lessons') = '[]'::jsonb,'coach/3 принимает Fudao (шаблонов пока нет)');
commit;
