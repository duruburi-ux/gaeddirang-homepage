-- Local-only synthetic baseline for the admin atomicity harness.
-- It mirrors only the production columns and constraints required by the
-- additive migration; it contains no production rows or credentials.

create schema if not exists private;

create table if not exists public.admin_emails (
  email text primary key,
  name text not null default ''
);

-- The additive migration replaces this predicate with the live-session check.
-- This definition only mirrors the pre-migration production dependency so a
-- fresh, isolated local database can apply and test the migration chain.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_emails a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.admin_emails enable row level security;
revoke all privileges on table public.admin_emails from public, anon, authenticated;
grant select on table public.admin_emails to authenticated;
grant select, insert, delete on table public.admin_emails to service_role;

create policy admin_emails_admin_read on public.admin_emails
  for select to authenticated
  using ((select public.is_admin()));

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  category text not null check (category in ('book', 'card')),
  img_path text not null,
  spec text,
  description text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  price integer
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_name text not null,
  contact text not null,
  email text not null,
  shipping_address text not null,
  message text,
  status text not null default '신규',
  created_at timestamptz not null default now(),
  total_amount integer,
  user_id uuid references auth.users(id),
  channel text not null default '홈페이지'
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  book_title text not null,
  unit_price integer,
  quantity integer not null,
  created_at timestamptz default now()
);

create table if not exists public.integration_inventory_movements (
  id bigint generated always as identity primary key,
  canonical_sku text not null,
  location_code text not null,
  connector_code text not null,
  external_event_id text,
  movement_type text not null,
  quantity_delta integer not null,
  unit_amount integer,
  occurred_at timestamptz not null,
  note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists integration_inventory_movements_event_uidx
  on public.integration_inventory_movements (connector_code, external_event_id)
  where external_event_id is not null;

alter table public.books enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.integration_inventory_movements enable row level security;

revoke all privileges on table public.books, public.orders, public.order_items,
  public.integration_inventory_movements from public, anon, authenticated;
grant select on table public.books to anon, authenticated;
grant select on table public.orders, public.order_items to authenticated;
grant select on table public.orders, public.order_items,
  public.integration_inventory_movements to service_role;

create policy books_public_read on public.books
for select to anon, authenticated using (true);

create policy orders_admin_read on public.orders
for select to authenticated using ((select public.is_admin()));

create policy order_items_admin_read on public.order_items
for select to authenticated using ((select public.is_admin()));

insert into public.books(title, author, category, img_path, description, price)
values ('원자성 HTTP 가상 도서', '가상 작가', 'book', 'synthetic.webp', '로컬 회귀용 합성 도서', 7000);

create or replace function private.reject_http_synthetic_order_item()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.book_title='강제실패 HTTP 가상도서' then
    raise exception 'SYNTHETIC_HTTP_ITEM_FAILURE';
  end if;
  return new;
end;
$$;

create trigger reject_http_synthetic_order_item
before insert on public.order_items
for each row execute function private.reject_http_synthetic_order_item();
