-- G2 prerequisite: narrow read-only live-session check for this account project.
-- Filename aligned with independently read-back Supabase migration ledger.
-- No arbitrary owner/session arguments, no access to auth tables for callers.
create function public.ecosystem_account_session_active()
returns boolean
language plpgsql stable security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  claims jsonb := auth.jwt();
  session_text text := claims->>'session_id';
begin
  if caller is null
     or claims->>'role' is distinct from 'authenticated'
     or claims->>'iss' is distinct from 'https://iuvvheeocobhiothfgei.supabase.co/auth/v1'
     or claims->'is_anonymous' is distinct from 'false'::jsonb
     or session_text is null
     or session_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;
  return exists (
    select 1 from auth.sessions s
    join auth.users u on u.id=s.user_id
    where s.id=session_text::uuid and s.user_id=caller
      and u.is_anonymous is false
      and (s.not_after is null or s.not_after>now())
  );
end;
$$;
alter function public.ecosystem_account_session_active() owner to postgres;
revoke all on function public.ecosystem_account_session_active() from public, anon, authenticated, service_role;
grant execute on function public.ecosystem_account_session_active() to authenticated;
comment on function public.ecosystem_account_session_active() is
  'Own live registered-user session only; no user-table grants, no mutation, no arbitrary identity arguments.';
