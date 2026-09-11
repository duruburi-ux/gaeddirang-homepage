-- 견적 기록에 「거래명세서만 발행」 구분 (2026-09-11)
alter table public.quotes add column if not exists kind text not null default 'quote';
alter table public.quotes drop constraint if exists quotes_kind_check;
alter table public.quotes add constraint quotes_kind_check check (kind in ('quote', 'statement'));
