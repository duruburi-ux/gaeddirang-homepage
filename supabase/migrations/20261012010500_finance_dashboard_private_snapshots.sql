-- 관리자 재정 현황용 검증 스냅샷 저장소.
-- 공개 저장소에는 구조만 두고 실제 거래·개인·금액 데이터는 이 private DB 경계 안에서만 적재한다.

create table public.finance_dashboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  schema_version integer not null default 1 check (schema_version = 1),
  source_as_of timestamptz not null,
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and payload ->> 'schemaVersion' = '1'
    and payload ? 'periods'
    and jsonb_typeof(payload -> 'periods') = 'array'
    and jsonb_array_length(payload -> 'periods') > 0
  ),
  is_active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  created_by text not null check (char_length(btrim(created_by)) between 3 and 180),
  notes text check (char_length(coalesce(notes, '')) <= 1000),
  constraint finance_dashboard_activation_check check (
    (is_active and activated_at is not null) or (not is_active)
  )
);

create unique index finance_dashboard_snapshots_source_sha256_key
  on public.finance_dashboard_snapshots (source_sha256);

create unique index finance_dashboard_one_active_idx
  on public.finance_dashboard_snapshots (is_active)
  where is_active;

alter table public.finance_dashboard_snapshots enable row level security;

revoke all privileges on table public.finance_dashboard_snapshots
  from public, anon, authenticated;

create or replace function public.get_finance_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  perform private.require_settlement_document_admin();

  select s.payload
  into v_payload
  from public.finance_dashboard_snapshots s
  where s.is_active
  order by s.activated_at desc, s.created_at desc
  limit 1;

  return v_payload;
end;
$$;

revoke all on function public.get_finance_dashboard()
  from public, anon, authenticated;

grant execute on function public.get_finance_dashboard()
  to authenticated;

comment on table public.finance_dashboard_snapshots is
  'Private verified finance dashboard snapshots. Never seed real finance data in repository migrations.';

comment on function public.get_finance_dashboard() is
  'Returns the single active verified snapshot to an existing settlement-document admin.';
