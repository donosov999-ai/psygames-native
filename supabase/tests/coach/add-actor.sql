\set ON_ERROR_STOP on
-- psql quotes this validated synthetic UUID as a literal, never SQL text.
insert into auth.users(id,is_anonymous) values (:'actor_id'::uuid,false)
on conflict(id) do nothing;
