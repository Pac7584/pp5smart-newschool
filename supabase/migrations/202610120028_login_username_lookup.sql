-- 202610120028_login_username_lookup (owner 2026-10-12)
-- Teachers created with a real e-mail (admin-users uses that e-mail as the Auth identity) could not sign in with
-- their short username: the login page always tried "<username>@pp5smart.local". The login page now asks this
-- function for the sign-in e-mail of ONE exact username, then signs in from the user's own browser as before
-- (Supabase's per-IP sign-in limit stays per user; nothing signs in on the server).
--
-- Trade-off accepted by the owner: anyone who knows a teacher's/admin's username can learn that account's sign-in
-- e-mail. It never returns a list, never returns parent accounts, inactive accounts or ambiguous names, and never
-- reveals anything else (role, name, existence of parents). Passwords are still checked only by Supabase Auth.
-- Safe to run again. Rollback: supabase/rollbacks/202610120028_login_username_lookup_rollback.sql

create or replace function public.pp5_login_email(p_username text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_count integer;
  v_email text;
begin
  if v_name = '' or length(v_name) > 160 or position('@' in v_name) > 0 then
    return null;
  end if;

  select count(*)::integer, min(u.email::text)
    into v_count, v_email
  from public.user_profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = v_name
    and p.active
    and p.role in ('admin', 'teacher')
    and u.email is not null;

  if v_count <> 1 then
    return null;
  end if;
  return lower(v_email);
end;
$$;

comment on function public.pp5_login_email(text) is
  'Sign-in e-mail for one exact active admin/teacher username (login page). Returns null otherwise. owner 2026-10-12';

revoke all on function public.pp5_login_email(text) from public;
grant execute on function public.pp5_login_email(text) to anon, authenticated;
