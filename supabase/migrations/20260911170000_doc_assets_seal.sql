-- 서류 자산(도장 이미지 등) (2026-09-11)
-- 도장 이미지는 위조 위험 때문에 공개 저장소에 두지 않는다. 데이터는 이 파일에 넣지 않고 DB에만 넣는다.
-- 관리자만 읽을 수 있고, 화면에서는 바꾸지 않는다(바꿀 때는 DB 관리 화면에서).
create table if not exists public.doc_assets (
  key text primary key,
  data_url text not null check (data_url like 'data:image/%'),
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by text
);

drop trigger if exists doc_assets_touch on public.doc_assets;
create trigger doc_assets_touch before insert or update on public.doc_assets
  for each row execute function public.docs_touch_row();

alter table public.doc_assets enable row level security;

drop policy if exists doc_assets_admin_read on public.doc_assets;
create policy doc_assets_admin_read on public.doc_assets
  for select to authenticated
  using ((select public.is_admin()));

revoke all privileges on table public.doc_assets from anon, authenticated;
grant select on table public.doc_assets to authenticated;
