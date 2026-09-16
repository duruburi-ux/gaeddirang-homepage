-- 강사 프로필의 공통 이력서 제작기 확장
-- 기존 careers/works/lectures 열은 파일 불러오기와 이전 저장본 호환을 위해 유지한다.
-- sections에는 사용자가 이름·순서를 바꾸거나 직접 만든 이력 항목을 저장한다.

alter table public.instructor_profiles
  add column if not exists sections jsonb not null default '[]'::jsonb;

alter table public.instructor_profiles
  drop constraint if exists instructor_profiles_sections_is_array;

alter table public.instructor_profiles
  add constraint instructor_profiles_sections_is_array
  check (jsonb_typeof(sections) = 'array');

