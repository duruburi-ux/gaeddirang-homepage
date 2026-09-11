-- 가견적(상대 정보 없이 먼저 보내는 참고용 견적) 표시 (2026-09-11)
alter table public.quotes add column if not exists is_draft boolean not null default false;
