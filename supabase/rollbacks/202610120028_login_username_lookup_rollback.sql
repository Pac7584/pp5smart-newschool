-- Rollback of 202610120028_login_username_lookup.
-- After this, the login page falls back to "<username>@pp5smart.local" (accounts created with a real e-mail must
-- sign in with that e-mail again). No data is changed.
drop function if exists public.pp5_login_email(text);
