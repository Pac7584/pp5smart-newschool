-- EMERGENCY rollback by owner in SQL Editor: restores OLD broad teacher access.
-- Retains assignments, policies and data for inspection/re-enablement; does not delete tables or school data.
begin;
update public.teacher_scope_settings set enabled=false,updated_at=now() where id;
notify pgrst, 'reload schema';
commit;
