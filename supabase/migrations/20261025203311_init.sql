create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  course_code text not null,
  course_title text not null,
  instructor text,
  semester text not null,
  academic_year text not null,
  section text not null,
  midterm_visible boolean not null default false,
  final_visible boolean not null default false,
  source_file text,
  updated_at timestamptz not null default now(),
  unique (course_code, semester, academic_year, section)
);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_no text not null,
  student_key text generated always as (
    regexp_replace(student_no, '[^0-9]', '', 'g')
  ) stored,
  full_name text not null,
  program_sec text,
  midterm text,
  final text,
  remarks text,
  unique (class_id, student_no)
);

create index grades_student_key_idx on public.grades (student_key);

alter table public.admins enable row level security;
alter table public.classes enable row level security;
alter table public.grades enable row level security;

create policy admin_self on public.admins
  for select
  using (user_id = auth.uid());

create policy admin_classes on public.classes
  for all
  using (exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  ));

create policy admin_grades on public.grades
  for all
  using (exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.admins a where a.user_id = auth.uid()
  ));

grant select on public.admins to authenticated;
grant select, insert, update, delete on public.classes, public.grades to authenticated;
revoke all on public.admins, public.classes, public.grades from anon;

create or replace function public.lookup_grades(p_student_no text)
returns table (
  course_code text,
  course_title text,
  instructor text,
  semester text,
  academic_year text,
  section text,
  student_no text,
  full_name text,
  midterm text,
  final text,
  remarks text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.course_code,
    c.course_title,
    c.instructor,
    c.semester,
    c.academic_year,
    c.section,
    g.student_no,
    g.full_name,
    case when c.midterm_visible then g.midterm end,
    case when c.final_visible then g.final end,
    g.remarks
  from public.grades g
  join public.classes c on c.id = g.class_id
  where length(regexp_replace(coalesce(p_student_no, ''), '[^0-9]', '', 'g')) = 7
    and g.student_key = regexp_replace(coalesce(p_student_no, ''), '[^0-9]', '', 'g')
  order by c.academic_year desc, c.semester, c.course_code;
$$;

revoke all on function public.lookup_grades(text) from public;
grant execute on function public.lookup_grades(text) to anon, authenticated;
