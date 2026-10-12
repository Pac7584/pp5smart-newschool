-- Stage scoped teacher access. Applying this file does NOT enable enforcement.
-- Owner applies in SQL Editor on the TEST project first; see docs/TEACHER_PERMISSIONS.md.
begin;
create table if not exists public.teacher_scope_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  legacy_backfilled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.teacher_scope_settings(id) values (true) on conflict do nothing;
create table if not exists public.teacher_access_assignments (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  academic_year text not null check (academic_year ~ '^[0-9]{4}$'),
  scope text not null check (scope in ('homeroom','subject')),
  grade text not null check (grade ~ '^(ป\.[1-6]|ม\.[1-3])$'),
  room text not null check (length(btrim(room)) > 0),
  subject_id text references public.subjects(id),
  semester smallint not null default 0 check (semester in (0,1,2)),
  active boolean not null default true,
  check ((scope = 'homeroom' and subject_id is null and semester = 0)
      or (scope = 'subject' and subject_id is not null))
);
create unique index if not exists teacher_access_unique on public.teacher_access_assignments
  (user_id, academic_year, scope, grade, room, coalesce(subject_id,''), semester);
alter table public.teacher_scope_settings enable row level security;
alter table public.teacher_access_assignments enable row level security;
revoke all on public.teacher_scope_settings, public.teacher_access_assignments from public, anon, authenticated;
grant select on public.teacher_scope_settings, public.teacher_access_assignments to authenticated;
grant all on public.teacher_scope_settings, public.teacher_access_assignments to service_role;
drop policy if exists scope_settings_read on public.teacher_scope_settings;
create policy scope_settings_read on public.teacher_scope_settings for select to authenticated using (auth.uid() is not null);
drop policy if exists scope_assignments_read on public.teacher_access_assignments;
create policy scope_assignments_read on public.teacher_access_assignments for select to authenticated
  using (public.pp5_current_role() = 'admin' or (user_id = auth.uid() and public.pp5_current_role() = 'teacher'));

create or replace function public.pp5_teacher_scope_enabled()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select enabled from public.teacher_scope_settings where id),false)
$$;
create or replace function public.pp5_teacher_scope_year()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select academic_year from public.school_settings order by id limit 1
$$;

-- Never infer identity from printable teacher names. Copy only existing account IDs.
do $$ begin
if not (select legacy_backfilled from public.teacher_scope_settings where id) then
insert into public.teacher_access_assignments(user_id, academic_year, scope, grade, room)
select distinct a.user_id,a.academic_year,'homeroom',a.grade,a.room
from public.teacher_assignments a join public.user_profiles p on p.id=a.user_id
where a.active and p.active and p.role='teacher' and a.grade ~ '^(ป\.[1-6]|ม\.[1-3])$'
on conflict do nothing;
insert into public.teacher_access_assignments(user_id, academic_year, scope, grade, room)
select p.id,public.pp5_teacher_scope_year(),'homeroom',p.grade,p.room from public.user_profiles p
where p.active and p.role='teacher' and p.grade ~ '^(ป\.[1-6]|ม\.[1-3])$' and nullif(btrim(p.room),'') is not null
  and public.pp5_teacher_scope_year() ~ '^[0-9]{4}$'
on conflict do nothing;
update public.teacher_scope_settings set legacy_backfilled=true where id;
end if;
end $$;

-- SECURITY DEFINER reads the roster without recursing through its RLS. The caller is always auth.uid().
-- roster_names is reserved for the minimal-name RPC, NOT a base-table policy.
create or replace function public.pp5_teacher_scope_access(
  p_table text, p_student text, p_year text default null,
  p_subject text default null, p_semester integer default null, p_write boolean default false)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_role text := public.pp5_current_role();
  v_year text := coalesce(p_year,public.pp5_teacher_scope_year());
begin
  if v_role='admin' then return true; end if;
  if not p_write and v_role='parent' then return public.pp5_can_read_student(p_student); end if;
  if v_role is distinct from 'teacher' then return false; end if;
  if p_table not in ('students','student_year_rosters','student_details','scores','assessments',
      'attendance_daily','attendance_monthly','student_comments','student_growth','behavior_records','roster_names')
    then return false; end if;
  if p_write and (v_year is null or not exists(select 1 from public.academic_years
      where academic_year=v_year and status='active' and not is_locked)) then return false; end if;
  return exists(
    select 1 from public.teacher_access_assignments a
    where a.user_id=auth.uid() and a.active
      and (a.academic_year=v_year or (p_year is null and not p_write and p_table in ('students','roster_names')))
      and (
        exists(select 1 from public.student_year_rosters r where r.student_id=p_student
          and r.academic_year=a.academic_year and r.grade=a.grade and r.room=a.room)
        or (not exists(select 1 from public.student_year_rosters r where r.student_id=p_student and r.academic_year=a.academic_year)
          and exists(select 1 from public.students s where s.id=p_student and s.academic_year=a.academic_year
            and s.grade=a.grade and s.room=a.room))
      )
      and (p_table<>'scores' or (p_semester in (1,2) and exists(
        select 1 from public.subjects s where s.id=p_subject and s.grade=a.grade
          and (s.semester is null or s.semester=p_semester))))
      and (a.scope='homeroom' or (a.scope='subject' and (
        p_table='roster_names' or (p_table='scores' and a.subject_id=p_subject
          and (a.semester=0 or a.semester=p_semester)
          and exists(select 1 from public.subjects s where s.id=p_subject and s.grade=a.grade
            and (s.semester is null or s.semester=p_semester)))
      )))
  );
end $$;

create or replace function public.pp5_teacher_scope_context()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_role text := public.pp5_current_role();
begin
  if v_role is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  return jsonb_build_object('installed',true,'enabled',public.pp5_teacher_scope_enabled(),
    'role',v_role,'userId',auth.uid(),'academicYear',public.pp5_teacher_scope_year(),
    'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.academic_year,a.grade,a.room,a.scope,a.subject_id)
      from public.teacher_access_assignments a where a.user_id=auth.uid() and a.active),'[]'::jsonb));
end $$;

-- Subject teachers receive only the roster fields needed for score entry, never identity/family/health data.
create or replace function public.pp5_teacher_scope_roster(p_year text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.pp5_current_role() is distinct from 'teacher' then raise exception 'TEACHER_REQUIRED' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',r.student_id,'student_id',r.student_id,
    'prefix',r.prefix,'first_name',r.first_name,'last_name',r.last_name,'gender',r.gender,
    'student_number',r.student_number,'grade',r.grade,'room',r.room,'academic_year',r.academic_year,'status',r.status)
    order by r.grade,r.room,r.student_number)
    from (
      select student_id,prefix,first_name,last_name,gender,student_number,grade,room,academic_year,status
      from public.student_year_rosters where academic_year=p_year
      union all
      select s.id,s.prefix,s.first_name,s.last_name,s.gender,s.student_number,s.grade,s.room,s.academic_year,s.status
      from public.students s where s.academic_year=p_year and not exists(
        select 1 from public.student_year_rosters r where r.student_id=s.id and r.academic_year=p_year)
    ) r where public.pp5_teacher_scope_access('roster_names',r.student_id,p_year)), '[]'::jsonb);
end $$;

create or replace function public.pp5_replace_teacher_access(p_user uuid,p_year text,p_assignments jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb; v_scope text; v_subject public.subjects%rowtype;
begin
  if public.pp5_current_role() is distinct from 'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if not exists(select 1 from public.user_profiles where id=p_user and role='teacher' and active)
    then raise exception 'เลือกบัญชีครูที่เปิดใช้งาน'; end if;
  if p_year !~ '^[0-9]{4}$' or p_year is null or not exists(select 1 from public.academic_years where academic_year=p_year)
    then raise exception 'ปีการศึกษาไม่ถูกต้อง'; end if;
  if jsonb_typeof(p_assignments) is distinct from 'array' or jsonb_array_length(p_assignments)>200
    then raise exception 'รายการมอบหมายไม่ถูกต้อง'; end if;
  -- Serialize competing editors and activation; validate the entire request before replacing anything.
  perform 1 from public.teacher_scope_settings where id for update;
  for v in select value from jsonb_array_elements(p_assignments) loop
    v_scope := v->>'scope';
    if v_scope is null or v_scope not in ('homeroom','subject') or not exists(
      select 1 from public.student_year_rosters where academic_year=p_year and grade=v->>'grade' and room=v->>'room'
      union all select 1 from public.students where academic_year=p_year and grade=v->>'grade' and room=v->>'room')
      then raise exception 'ห้องหรือประเภทงานไม่ถูกต้อง'; end if;
    if v_scope='homeroom' then
      if nullif(v->>'subject_id','') is not null or coalesce((v->>'semester')::integer,0)<>0
        then raise exception 'ครูประจำชั้นไม่ต้องระบุวิชาหรือภาค'; end if;
    else
      select * into v_subject from public.subjects where id=v->>'subject_id' and grade=v->>'grade';
      if not found or coalesce((v->>'semester')::integer,0) not in (0,1,2)
        or (v_subject.semester is not null and coalesce((v->>'semester')::integer,0)<>v_subject.semester)
        then raise exception 'วิชาหรือภาคเรียนไม่ตรงกับห้อง'; end if;
    end if;
  end loop;
  if public.pp5_teacher_scope_enabled() and p_year=public.pp5_teacher_scope_year() and jsonb_array_length(p_assignments)=0
    then raise exception 'ขณะเปิดใช้สิทธิ์ ต้องปิดบัญชีครูหรือมอบหมายงานใหม่ก่อนถอนงานทั้งหมด'; end if;
  delete from public.teacher_access_assignments where user_id=p_user and academic_year=p_year;
  insert into public.teacher_access_assignments(user_id,academic_year,scope,grade,room,subject_id,semester)
    select distinct p_user,p_year,item.value->>'scope',item.value->>'grade',item.value->>'room',
      nullif(item.value->>'subject_id',''),coalesce((item.value->>'semester')::integer,0)
    from jsonb_array_elements(p_assignments) as item(value);
  return jsonb_build_object('success',true);
end $$;

create or replace function public.pp5_enable_teacher_scope(p_confirmation text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.pp5_current_role() is distinct from 'admin' then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_confirmation is distinct from 'ENABLE_TEACHER_SCOPE' then raise exception 'กรุณายืนยันการเปิดสิทธิ์'; end if;
  perform 1 from public.teacher_scope_settings where id for update;
  if not exists(select 1 from public.academic_years where academic_year=public.pp5_teacher_scope_year() and status='active' and not is_locked)
    then raise exception 'ปีการศึกษาปัจจุบันยังไม่เปิดให้บันทึก'; end if;
  if exists(select 1 from public.user_profiles p where p.role='teacher' and p.active and not exists(
    select 1 from public.teacher_access_assignments a where a.user_id=p.id and a.active
      and a.academic_year=public.pp5_teacher_scope_year()
      and (exists(select 1 from public.student_year_rosters r where r.academic_year=a.academic_year and r.grade=a.grade and r.room=a.room)
        or exists(select 1 from public.students s where s.academic_year=a.academic_year and s.grade=a.grade and s.room=a.room))
      and (a.scope='homeroom' or exists(select 1 from public.subjects s where s.id=a.subject_id and s.grade=a.grade
        and (s.semester is null or s.semester=a.semester)))))
    then raise exception 'ยังมีบัญชีครูที่ไม่ได้รับมอบหมายงานในปีปัจจุบัน'; end if;
  update public.teacher_scope_settings set enabled=true,updated_at=now() where id;
  return jsonb_build_object('success',true,'enabled',true);
end $$;

-- Restrictive policies are ANDed with existing permissive policies. Old policies cannot bypass these.
do $$
declare t text; yr text; sub text; sem text; rd text; wr text;
begin
  foreach t in array array['students','student_year_rosters','student_details','scores','assessments',
    'attendance_daily','attendance_monthly','student_comments','student_growth','behavior_records'] loop
    yr := case when t in ('students','student_details') then 'null' else 'academic_year' end;
    sub := case when t='scores' then 'subject_id' else 'null' end;
    sem := case when t='scores' then 'semester' else 'null' end;
    rd := format('not public.pp5_teacher_scope_enabled() or public.pp5_teacher_scope_access(%L,%I,%s,%s,%s,false)',
      t,case when t='students' then 'id' else 'student_id' end,yr,sub,sem);
    wr := format('not public.pp5_teacher_scope_enabled() or public.pp5_teacher_scope_access(%L,%I,%s,%s,%s,true)',
      t,case when t='students' then 'id' else 'student_id' end,yr,sub,sem);
    execute format('drop policy if exists pp5_scoped_read on public.%I',t);
    execute format('create policy pp5_scoped_read on public.%I as restrictive for select to authenticated using (%s)',t,rd);
    execute format('drop policy if exists pp5_scoped_insert on public.%I',t);
    execute format('drop policy if exists pp5_scoped_update on public.%I',t);
    execute format('drop policy if exists pp5_scoped_delete on public.%I',t);
    if t in ('students','student_year_rosters') then
      execute format('create policy pp5_scoped_insert on public.%I as restrictive for insert to authenticated with check (not public.pp5_teacher_scope_enabled() or public.pp5_current_role()=''admin'')',t);
      execute format('create policy pp5_scoped_delete on public.%I as restrictive for delete to authenticated using (not public.pp5_teacher_scope_enabled() or public.pp5_current_role()=''admin'')',t);
    else
      execute format('create policy pp5_scoped_insert on public.%I as restrictive for insert to authenticated with check (%s)',t,wr);
      execute format('create policy pp5_scoped_delete on public.%I as restrictive for delete to authenticated using (%s)',t,wr);
    end if;
    execute format('create policy pp5_scoped_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)',t,wr,wr);
  end loop;
  foreach t in array array['academic_year_transition_drafts','academic_year_transition_students','line_notifications','teachers'] loop
    execute format('drop policy if exists pp5_scoped_admin_read on public.%I',t);
    execute format('create policy pp5_scoped_admin_read on public.%I as restrictive for select to authenticated using (not public.pp5_teacher_scope_enabled() or public.pp5_current_role()=''admin'')',t);
  end loop;
end $$;

-- Changing a student's placement/status or identity key remains an administrator operation.
create or replace function public.pp5_scope_guard_student_placement()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if public.pp5_teacher_scope_enabled() and public.pp5_current_role()='teacher' and (
      (to_jsonb(new)->>'grade',to_jsonb(new)->>'room',to_jsonb(new)->>'academic_year',
       to_jsonb(new)->>'status',to_jsonb(new)->>'national_id',to_jsonb(new)->>'enrollment_status',
       to_jsonb(new)->>'id',to_jsonb(new)->>'student_id')
      is distinct from
      (to_jsonb(old)->>'grade',to_jsonb(old)->>'room',to_jsonb(old)->>'academic_year',
       to_jsonb(old)->>'status',to_jsonb(old)->>'national_id',to_jsonb(old)->>'enrollment_status',
       to_jsonb(old)->>'id',to_jsonb(old)->>'student_id'))
    then raise exception 'การย้ายห้อง เปลี่ยนปี สถานะ หรือเลขประจำตัว ต้องให้ผู้ดูแลดำเนินการ' using errcode='42501'; end if;
  return new;
end $$;
drop trigger if exists pp5_scope_guard_student_placement on public.students;
create trigger pp5_scope_guard_student_placement before update on public.students
  for each row execute function public.pp5_scope_guard_student_placement();
drop trigger if exists pp5_scope_guard_student_placement on public.student_year_rosters;
create trigger pp5_scope_guard_student_placement before update on public.student_year_rosters
  for each row execute function public.pp5_scope_guard_student_placement();

-- Private photo URLs follow homeroom scope; subject-only teachers use names, not family/health/photos.
do $$ declare cmd text; begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists pp5_scoped_photo_read on storage.objects;
    create policy pp5_scoped_photo_read on storage.objects as restrictive for select to authenticated
      using (bucket_id<>'student-photos' or not public.pp5_teacher_scope_enabled()
        or public.pp5_teacher_scope_access('student_details',split_part(name,'/',1)));
    foreach cmd in array array['insert','update','delete'] loop
      execute format('drop policy if exists pp5_scoped_photo_%s on storage.objects',cmd);
      execute format('create policy pp5_scoped_photo_%s on storage.objects as restrictive for %s to authenticated %s %s',
        cmd,cmd,
        case when cmd<>'insert' then 'using (bucket_id<>''student-photos'' or not public.pp5_teacher_scope_enabled() or public.pp5_teacher_scope_access(''student_details'',split_part(name,''/'',1),null,null,null,true))' else '' end,
        case when cmd<>'delete' then 'with check (bucket_id<>''student-photos'' or not public.pp5_teacher_scope_enabled() or public.pp5_teacher_scope_access(''student_details'',split_part(name,''/'',1),null,null,null,true))' else '' end);
    end loop;
  end if;
end $$;

-- Explicit execute grants; no default PUBLIC access to these SECURITY DEFINER functions.
do $$ declare f text; begin
  foreach f in array array[
    'pp5_teacher_scope_enabled()','pp5_teacher_scope_year()',
    'pp5_teacher_scope_access(text,text,text,text,integer,boolean)',
    'pp5_teacher_scope_context()','pp5_teacher_scope_roster(text)',
    'pp5_replace_teacher_access(uuid,text,jsonb)','pp5_enable_teacher_scope(text)',
    'pp5_scope_guard_student_placement()'] loop
    execute 'revoke all on function public.'||f||' from public,anon,authenticated';
    execute 'grant execute on function public.'||f||' to authenticated,service_role';
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
