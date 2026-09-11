-- 서류실: 품목표 · 견적 기록 · 링크 모음 (2026-09-11, 대표 승인)
-- 관리자(public.is_admin())만 읽고 쓴다. 익명 접근은 막는다.
-- 링크 모음의 실제 주소(구글시트 등)는 공개 저장소에 두지 않기 위해 이 파일에 넣지 않는다.

create table if not exists public.doc_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  search_keys text[] not null default '{}',
  description text not null default '',
  list_price integer check (list_price is null or list_price >= 0),
  inst_price integer check (inst_price is null or inst_price >= 0),
  unit text not null default '세트',
  taxable boolean not null default true,
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number text unique,
  quote_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  status text not null default '작성' check (status in ('작성', '보냄', '수주', '무산')),
  inquiry_id bigint,
  to_name text not null default '',
  to_manager text not null default '',
  to_biz text not null default '',
  title text not null default '',
  vat_mode text not null default 'in' check (vat_mode in ('in', 'out')),
  valid_days integer not null default 30 check (valid_days between 1 and 365),
  alt boolean not null default false,
  items jsonb not null default '[]'::jsonb,
  extra_notes text[] not null default '{}',
  total_amount bigint not null default 0,
  statement_date date,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quotes_quote_date_idx on public.quotes (quote_date desc);

create table if not exists public.team_links (
  id uuid primary key default gen_random_uuid(),
  category text not null default '기타',
  title text not null,
  url text not null check (url ~* '^https?://'),
  note text not null default '',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

-- 수정 시각·수정한 사람 기록
create or replace function public.docs_touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  if tg_op = 'INSERT' and tg_table_name = 'quotes' then
    new.created_by := coalesce(auth.jwt() ->> 'email', new.created_by);
  end if;
  return new;
end;
$$;

-- 견적번호: GDR-연도-월일, 같은 날 두 번째부터 -A, -B … (기존 견적서 규칙). 한 번 매긴 번호는 바꾸지 않는다.
create or replace function public.assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n integer := 0;
begin
  if tg_op = 'UPDATE' then
    new.number := old.number;
    return new;
  end if;
  if new.number is not null and btrim(new.number) <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('gdr-quote-' || new.quote_date::text));
  base := 'GDR-' || to_char(new.quote_date, 'YYYY') || '-' || to_char(new.quote_date, 'MMDD');
  candidate := base;
  while exists (select 1 from public.quotes q where q.number = candidate) loop
    n := n + 1;
    if n > 26 then
      raise exception '같은 날 견적이 27건을 넘었습니다';
    end if;
    candidate := base || '-' || chr(64 + n);
  end loop;
  new.number := candidate;
  return new;
end;
$$;

drop trigger if exists doc_items_touch on public.doc_items;
create trigger doc_items_touch before insert or update on public.doc_items
  for each row execute function public.docs_touch_row();

drop trigger if exists quotes_number on public.quotes;
create trigger quotes_number before insert or update on public.quotes
  for each row execute function public.assign_quote_number();

drop trigger if exists quotes_touch on public.quotes;
create trigger quotes_touch before insert or update on public.quotes
  for each row execute function public.docs_touch_row();

drop trigger if exists team_links_touch on public.team_links;
create trigger team_links_touch before insert or update on public.team_links
  for each row execute function public.docs_touch_row();

-- 권한: 관리자만
alter table public.doc_items enable row level security;
alter table public.quotes enable row level security;
alter table public.team_links enable row level security;

drop policy if exists doc_items_admin_all on public.doc_items;
create policy doc_items_admin_all on public.doc_items
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists quotes_admin_select on public.quotes;
create policy quotes_admin_select on public.quotes
  for select to authenticated
  using ((select public.is_admin()));

drop policy if exists quotes_admin_insert on public.quotes;
create policy quotes_admin_insert on public.quotes
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists quotes_admin_update on public.quotes;
create policy quotes_admin_update on public.quotes
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists team_links_admin_all on public.team_links;
create policy team_links_admin_all on public.team_links
  for all to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

revoke all privileges on table public.doc_items, public.quotes, public.team_links from anon, authenticated;
grant select, insert, update, delete on table public.doc_items, public.team_links to authenticated;
grant select, insert, update on table public.quotes to authenticated;  -- 견적은 지우지 않고 「무산」으로 둔다

revoke execute on function public.docs_touch_row() from public, anon, authenticated;
revoke execute on function public.assign_quote_number() from public, anon, authenticated;

-- 품목표 기본값 (2026-09 기준 정가, 비어 있을 때만)
insert into public.doc_items (name, search_keys, description, list_price, unit, taxable, sort)
select v.name, v.search_keys, v.description, v.list_price, v.unit, v.taxable, v.sort
from (values
  ('32가지 모든감정카드', array['모든감정', '모든 감정 카드', '32가지 감정'], '32장 1세트 · 54×86mm · 양면 컬러', 25000, '세트', true, 10),
  ('35가지 불편감정카드', array['불편감정', '불편한 감정 카드', '불편한감정', '35가지 감정'], '35장 1세트 · 54×86mm · 양면 컬러', 25000, '세트', true, 20),
  ('두루마음체크카드 (노랑)', array['마음체크카드 노랑', '마음체크 노랑', '노랑'], '40장 1세트 · 54×86mm · 양면 컬러', 25000, '세트', true, 30),
  ('두루마음체크카드 (초록)', array['마음체크카드 초록', '마음체크 초록', '초록'], '40장 1세트 · 54×86mm · 양면 컬러', 25000, '세트', true, 40),
  ('40가지 빵질문카드', array['빵질문', '빵 질문'], '40장 1세트 · 54×86mm · 양면 컬러', 25000, '세트', true, 50),
  ('대형 키워드카드 40장 세트', array['대형 키워드', '큰 키워드', '키워드카드'], 'A5 148×210mm · 40종 · 양면 컬러 · 코팅', 35000, '세트', true, 60),
  ('5문장으로 1권의 책을 만나는 연필문학', array['연필문학', '연필'], '', 15000, '개', true, 70),
  ('어느 날 문득 잘 살고 싶어졌다', array['어느날 문득', '잘 살고 싶어졌다', '어문잘'], '두루 지음', 13000, '권', false, 110),
  ('우울의 바깥을 향하며', array['우울의 바깥', '우울 바깥'], '두루 지음', 13000, '권', false, 120),
  ('불안과 밤 산책', array['불안과 밤산책', '밤 산책'], '두루 지음', 15000, '권', false, 130),
  ('모든 감정 도감', array['모든감정도감', '감정 도감'], '이다솜 지음', 15000, '권', false, 140),
  ('이러나저러나 불편한 거야 불편한 건', array['이러나저러나'], '이다솜 지음', 15000, '권', false, 150),
  ('우당탕탕 잡았다 내 감정!', array['우당탕탕'], '이다솜 지음', 16000, '권', false, 160),
  ('백빵기행 1', array['백빵기행1'], '개띠랑 지음', 15000, '권', false, 170),
  ('백빵기행 2', array['백빵기행2'], '개띠랑 지음', 15000, '권', false, 180),
  ('대한민국 빵집 대장정', array['빵집 대장정'], '개띠랑 지음', 18000, '권', false, 190),
  ('나에게도 빵빵한 하루가 필요해', array['빵빵한 하루'], '개띠랑·이다솜·두루 지음', 15000, '권', false, 200)
) as v(name, search_keys, description, list_price, unit, taxable, sort)
where not exists (select 1 from public.doc_items);
