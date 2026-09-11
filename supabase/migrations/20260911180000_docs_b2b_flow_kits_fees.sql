-- 서류실 확장 (2026-09-11, 대표 요청 "다 구축해줘")
-- 1) B2B 진행: 견적 기록에 보낸 날 · 입금 확인일 · 계산서 발행일 칸
-- 2) 기관 제출 서류: 강의계획서 · 강사 프로필 저장
-- 3) 사례비·원천세 지급 명세 저장
-- 4) 서류실 설정값(doc_settings): 인세시트 ID처럼 공개 저장소에 두지 않을 값. 값은 이 파일에 넣지 않는다.
-- 모두 관리자(public.is_admin())만 읽고 쓴다.

alter table public.quotes add column if not exists sent_at date;
alter table public.quotes add column if not exists paid_at date;
alter table public.quotes add column if not exists invoice_at date;
alter table public.quotes add column if not exists invoice_skip boolean not null default false;
alter table public.quotes add column if not exists memo text not null default '';

create table if not exists public.lecture_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  target text not null default '',
  headcount text not null default '',
  duration text not null default '',
  goal text not null default '',
  overview text not null default '',
  sessions jsonb not null default '[]'::jsonb check (jsonb_typeof(sessions) = 'array'),
  materials text not null default '',
  instructor text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.instructor_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  headline text not null default '',
  intro text not null default '',
  careers text[] not null default '{}',
  works text[] not null default '{}',
  lectures text[] not null default '{}',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.fee_sheets (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  pay_date date,
  belong_month text not null default '',
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array'),
  total_gross bigint not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.doc_settings (
  key text primary key,
  value text not null default '',
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

drop trigger if exists lecture_plans_touch on public.lecture_plans;
create trigger lecture_plans_touch before insert or update on public.lecture_plans
  for each row execute function public.docs_touch_row();
drop trigger if exists instructor_profiles_touch on public.instructor_profiles;
create trigger instructor_profiles_touch before insert or update on public.instructor_profiles
  for each row execute function public.docs_touch_row();
drop trigger if exists fee_sheets_touch on public.fee_sheets;
create trigger fee_sheets_touch before insert or update on public.fee_sheets
  for each row execute function public.docs_touch_row();
drop trigger if exists doc_settings_touch on public.doc_settings;
create trigger doc_settings_touch before insert or update on public.doc_settings
  for each row execute function public.docs_touch_row();

alter table public.lecture_plans enable row level security;
alter table public.instructor_profiles enable row level security;
alter table public.fee_sheets enable row level security;
alter table public.doc_settings enable row level security;

drop policy if exists lecture_plans_admin_all on public.lecture_plans;
create policy lecture_plans_admin_all on public.lecture_plans
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists instructor_profiles_admin_all on public.instructor_profiles;
create policy instructor_profiles_admin_all on public.instructor_profiles
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists fee_sheets_admin_all on public.fee_sheets;
create policy fee_sheets_admin_all on public.fee_sheets
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists doc_settings_admin_read on public.doc_settings;
create policy doc_settings_admin_read on public.doc_settings
  for select to authenticated using ((select public.is_admin()));

revoke all privileges on table public.lecture_plans, public.instructor_profiles, public.fee_sheets, public.doc_settings from anon, authenticated;
grant select, insert, update, delete on table public.lecture_plans, public.instructor_profiles, public.fee_sheets to authenticated;
grant select on table public.doc_settings to authenticated;

-- 이미 보냈거나 수주한 견적은 견적일을 보낸 날로 채워 둔다 (나중에 고칠 수 있음)
update public.quotes set sent_at = quote_date where sent_at is null and status in ('보냄', '수주');
