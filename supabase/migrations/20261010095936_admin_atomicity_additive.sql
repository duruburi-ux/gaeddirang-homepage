-- Additive phase only. This file is not safe to treat as the cutover by itself:
-- the old browser INSERT policies stay in place until the matching static clients
-- are deployed and the separate cutover migration is approved.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with claims as (
    select auth.uid() as user_id,
           lower(coalesce(auth.jwt() ->> 'email', '')) as jwt_email,
           case
             when coalesce(auth.jwt() ->> 'session_id', '') ~
                  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             then (auth.jwt() ->> 'session_id')::uuid
           end as session_id
  )
  select c.user_id is not null
    and c.jwt_email <> ''
    and c.session_id is not null
    and exists (
      select 1
      from auth.users u
      join public.admin_emails a on lower(a.email) = lower(u.email)
      where u.id = c.user_id
        and not coalesce(u.is_anonymous, false)
        and u.email_confirmed_at is not null
        and lower(coalesce(u.email, '')) = c.jwt_email
    )
    and exists (
      select 1
      from auth.sessions s
      where s.id = c.session_id
        and s.user_id = c.user_id
        and (s.not_after is null or s.not_after > now())
    )
  from claims c;
$$;

revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;

create or replace function private.require_current_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not (select public.is_admin()) then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  return v_user_id;
end;
$$;

revoke all on function private.require_current_admin() from public, anon, authenticated;

alter table public.orders
  add column if not exists client_request_id uuid,
  add column if not exists client_request_hash text;

alter table public.orders
  drop constraint if exists orders_client_request_hash_check;
alter table public.orders
  add constraint orders_client_request_hash_check
  check (client_request_hash is null or client_request_hash ~ '^[0-9a-f]{64}$');

create unique index if not exists orders_client_request_id_uidx
  on public.orders (client_request_id)
  where client_request_id is not null;

create or replace function private.create_order_v1(
  p_request_id uuid,
  p_buyer_name text,
  p_contact text,
  p_email text,
  p_shipping_address text,
  p_message text,
  p_channel text,
  p_status text,
  p_items jsonb,
  p_user_id uuid,
  p_validate_catalog boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer text := btrim(coalesce(p_buyer_name, ''));
  v_contact text := btrim(coalesce(p_contact, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_address text := btrim(coalesce(p_shipping_address, ''));
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_title text;
  v_quantity integer;
  v_unit_price integer;
  v_hash text;
  v_total bigint := 0;
  v_order public.orders%rowtype;
begin
  if p_request_id is null then raise exception 'ORDER_REQUEST_ID_REQUIRED'; end if;
  if char_length(v_buyer) not between 1 and 100 then raise exception 'ORDER_BUYER_INVALID'; end if;
  if char_length(v_contact) not between 3 and 50 then raise exception 'ORDER_CONTACT_INVALID'; end if;
  if char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'ORDER_EMAIL_INVALID';
  end if;
  if char_length(v_address) not between 1 and 500 then raise exception 'ORDER_ADDRESS_INVALID'; end if;
  if char_length(coalesce(v_message, '')) > 1000 then raise exception 'ORDER_MESSAGE_TOO_LONG'; end if;
  if p_channel is null or p_channel not in ('홈페이지', '스마트스토어', '기타') then raise exception 'ORDER_CHANNEL_INVALID'; end if;
  if p_status is null or p_status not in ('신규', '입금확인', '발송준비', '발송완료', '취소') then raise exception 'ORDER_STATUS_INVALID'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'ORDER_ITEMS_INVALID';
  end if;

  for v_item in
    select x.value from jsonb_array_elements(p_items) with ordinality as x(value, ord) order by x.ord
  loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'ORDER_ITEMS_INVALID'; end if;
    v_title := btrim(coalesce(v_item ->> 'book_title', ''));
    begin
      if coalesce(v_item ->> 'quantity', '') !~ '^[0-9]+$'
         or coalesce(v_item ->> 'unit_price', '') !~ '^[0-9]+$' then
        raise exception 'ORDER_ITEMS_INVALID';
      end if;
      v_quantity := (v_item ->> 'quantity')::integer;
      v_unit_price := (v_item ->> 'unit_price')::integer;
    exception when numeric_value_out_of_range or invalid_text_representation then
      raise exception 'ORDER_ITEMS_INVALID';
    end;
    if char_length(v_title) not between 1 and 180
       or v_quantity not between 1 and 500
       or v_unit_price not between 0 and 10000000 then
      raise exception 'ORDER_ITEMS_INVALID';
    end if;
    v_total := v_total + v_quantity::bigint * v_unit_price::bigint;
    if v_total > 2000000000 then raise exception 'ORDER_ITEMS_INVALID'; end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'book_title', v_title, 'quantity', v_quantity, 'unit_price', v_unit_price
    ));
  end loop;
  if p_validate_catalog and exists (
    select 1
    from jsonb_array_elements(v_items) as x(item)
    where not exists (
      select 1 from public.books b
      where b.title = item ->> 'book_title'
        and b.price = (item ->> 'unit_price')::integer
    )
  ) then
    raise exception 'ORDER_CATALOG_MISMATCH';
  end if;

  v_hash := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'buyer_name', v_buyer,
      'contact', v_contact,
      'email', v_email,
      'shipping_address', v_address,
      'message', v_message,
      'channel', p_channel,
      'status', p_status,
      'items', v_items,
      'user_id', p_user_id
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  select * into v_order
  from public.orders o
  where o.client_request_id = p_request_id
  for update;

  if found then
    if v_order.client_request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    return jsonb_build_object('id', v_order.id, 'status', v_order.status, 'total_amount', v_order.total_amount);
  end if;

  begin
    insert into public.orders (
      buyer_name, contact, email, shipping_address, message, status,
      total_amount, user_id, channel, client_request_id, client_request_hash
    ) values (
      v_buyer, v_contact, v_email, v_address, v_message, p_status,
      v_total::integer, p_user_id, p_channel, p_request_id, v_hash
    ) returning * into v_order;
  exception when unique_violation then
    select * into v_order
    from public.orders o
    where o.client_request_id = p_request_id
    for update;
    if not found or v_order.client_request_hash <> v_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    return jsonb_build_object('id', v_order.id, 'status', v_order.status, 'total_amount', v_order.total_amount);
  end;

  insert into public.order_items (order_id, book_title, unit_price, quantity)
  select v_order.id,
         item ->> 'book_title',
         (item ->> 'unit_price')::integer,
         (item ->> 'quantity')::integer
  from jsonb_array_elements(v_items) as x(item);

  return jsonb_build_object('id', v_order.id, 'status', v_order.status, 'total_amount', v_order.total_amount);
end;
$$;

revoke all on function private.create_order_v1(uuid, text, text, text, text, text, text, text, jsonb, uuid, boolean)
  from public, anon, authenticated;

create or replace function public.create_public_order_v1(
  p_request_id uuid,
  p_buyer_name text,
  p_contact text,
  p_email text,
  p_shipping_address text,
  p_message text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.create_order_v1(
    p_request_id, p_buyer_name, p_contact, p_email, p_shipping_address,
    p_message, '홈페이지', '신규', p_items, auth.uid(), true
  );
end;
$$;

create or replace function public.create_admin_order_v1(
  p_request_id uuid,
  p_buyer_name text,
  p_contact text,
  p_email text,
  p_shipping_address text,
  p_message text,
  p_channel text,
  p_status text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_current_admin();
  return private.create_order_v1(
    p_request_id, p_buyer_name, p_contact, p_email, p_shipping_address,
    p_message, p_channel, p_status, p_items, null, false
  );
end;
$$;

revoke all on function public.create_public_order_v1(uuid, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.create_admin_order_v1(uuid, text, text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_public_order_v1(uuid, text, text, text, text, text, jsonb)
  to anon, authenticated;
grant execute on function public.create_admin_order_v1(uuid, text, text, text, text, text, text, text, jsonb)
  to authenticated;

create table public.integration_sales_import_reservations (
  connector_code text not null default 'payhere' check (connector_code = 'payhere'),
  external_event_id text not null,
  request_id uuid not null,
  report_hash text not null check (report_hash ~ '^[0-9a-f]{64}$'),
  canonical_sku text not null check (canonical_sku ~ '^GDR-[A-Z]+-[0-9]{4}$'),
  quantity integer not null check (quantity between 1 and 500),
  unit_amount integer not null check (unit_amount between 0 and 10000000),
  occurred_at timestamptz not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'google_written_pending_control', 'applied', 'failed_before_google')),
  reserved_by uuid not null,
  reserved_at timestamptz not null default now(),
  google_written_at timestamptz,
  applied_at timestamptz,
  updated_at timestamptz not null default now(),
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  primary key (connector_code, external_event_id)
);

create index integration_sales_import_reservations_request_idx
  on public.integration_sales_import_reservations (request_id, status);

alter table public.integration_sales_import_reservations enable row level security;
revoke all privileges on table public.integration_sales_import_reservations
  from public, anon, authenticated;

create or replace function public.reserve_payhere_sales_import(
  p_report_hash text,
  p_request_id uuid,
  p_events jsonb
)
returns table (external_event_id text, status text, owned boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_event jsonb;
  v_existing public.integration_sales_import_reservations%rowtype;
  v_event_id text;
  v_sku text;
  v_quantity integer;
  v_unit_amount integer;
  v_occurred_at timestamptz;
  v_google_seen boolean;
begin
  v_actor := private.require_current_admin();
  if p_request_id is null or coalesce(p_report_hash, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'IMPORT_RESERVATION_INVALID';
  end if;
  if p_events is null or jsonb_typeof(p_events) is distinct from 'array'
     or jsonb_array_length(p_events) not between 1 and 100 then
    raise exception 'IMPORT_RESERVATION_INVALID';
  end if;

  for v_event in
    select value from jsonb_array_elements(p_events) order by value ->> 'external_event_id'
  loop
    v_event_id := btrim(coalesce(v_event ->> 'external_event_id', ''));
    v_sku := btrim(coalesce(v_event ->> 'canonical_sku', ''));
    begin
      v_google_seen := coalesce((v_event ->> 'google_seen')::boolean, false);
      v_quantity := (v_event ->> 'quantity')::integer;
      v_unit_amount := (v_event ->> 'unit_amount')::integer;
      v_occurred_at := (v_event ->> 'occurred_at')::timestamptz;
    exception when others then
      raise exception 'IMPORT_RESERVATION_INVALID';
    end;
    if v_event_id = '' or char_length(v_event_id) > 300
       or v_sku !~ '^GDR-[A-Z]+-[0-9]{4}$'
       or v_quantity is null or v_quantity not between 1 and 500
       or v_unit_amount is null or v_unit_amount not between 0 and 10000000
       or v_occurred_at is null then
      raise exception 'IMPORT_RESERVATION_INVALID';
    end if;

    insert into public.integration_sales_import_reservations (
      external_event_id, request_id, report_hash, canonical_sku, quantity,
      unit_amount, occurred_at, status, reserved_by
    ) values (
      v_event_id, p_request_id, p_report_hash, v_sku, v_quantity,
      v_unit_amount, v_occurred_at,
      case when v_google_seen then 'google_written_pending_control' else 'reserved' end,
      v_actor
    ) on conflict do nothing;

    select * into v_existing
    from public.integration_sales_import_reservations r
    where r.connector_code='payhere' and r.external_event_id=v_event_id
    for update;

    if v_existing.report_hash <> p_report_hash
       or v_existing.canonical_sku <> v_sku
       or v_existing.quantity <> v_quantity
       or v_existing.unit_amount <> v_unit_amount
       or v_existing.occurred_at <> v_occurred_at then
      raise exception 'IMPORT_EVENT_PAYLOAD_MISMATCH' using errcode = '23505';
    end if;

    if v_existing.status = 'applied' then
      continue;
    elsif v_existing.request_id = p_request_id then
      if v_google_seen and v_existing.status <> 'google_written_pending_control' then
        update public.integration_sales_import_reservations r set
          status='google_written_pending_control', google_written_at=coalesce(r.google_written_at, now()),
          updated_at=now(), last_error_code=null
        where r.connector_code='payhere' and r.external_event_id=v_event_id;
      end if;
    elsif v_google_seen or v_existing.status = 'failed_before_google' then
      update public.integration_sales_import_reservations r set
        request_id=p_request_id, reserved_by=v_actor,
        status=case when v_google_seen then 'google_written_pending_control' else 'reserved' end,
        reserved_at=now(),
        google_written_at=case when v_google_seen then coalesce(r.google_written_at, now()) else null end,
        applied_at=null, updated_at=now(), last_error_code=null
      where r.connector_code='payhere' and r.external_event_id=v_event_id;
    else
      raise exception 'IMPORT_IN_PROGRESS' using errcode = '55P03';
    end if;
  end loop;

  return query
  select r.external_event_id, r.status, r.request_id=p_request_id
  from public.integration_sales_import_reservations r
  where r.connector_code='payhere'
    and r.external_event_id in (select value ->> 'external_event_id' from jsonb_array_elements(p_events))
  order by r.external_event_id;
end;
$$;

create or replace function public.mark_payhere_google_written(
  p_request_id uuid,
  p_event_ids jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_updated integer;
begin
  perform private.require_current_admin();
  if p_request_id is null or p_event_ids is null or jsonb_typeof(p_event_ids) is distinct from 'array'
     or jsonb_array_length(p_event_ids) not between 1 and 100 then
    raise exception 'IMPORT_MARK_INVALID';
  end if;
  v_expected := jsonb_array_length(p_event_ids);
  update public.integration_sales_import_reservations r set
    status='google_written_pending_control',
    google_written_at=coalesce(r.google_written_at, now()),
    updated_at=now(), last_error_code=null
  where r.connector_code='payhere'
    and r.request_id=p_request_id
    and r.status in ('reserved','google_written_pending_control')
    and r.external_event_id in (select jsonb_array_elements_text(p_event_ids));
  get diagnostics v_updated = row_count;
  if v_updated <> v_expected then raise exception 'IMPORT_RESERVATION_LOST' using errcode='55P03'; end if;
  return v_updated;
end;
$$;

create or replace function public.finalize_payhere_sales_import(
  p_request_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row jsonb;
  v_res public.integration_sales_import_reservations%rowtype;
  v_existing public.integration_inventory_movements%rowtype;
  v_count integer := 0;
  v_event_id text;
  v_sku text;
  v_quantity integer;
  v_unit_amount integer;
  v_occurred_at timestamptz;
begin
  v_actor := private.require_current_admin();
  if p_request_id is null or p_rows is null or jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 100 then
    raise exception 'IMPORT_FINALIZE_INVALID';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) order by value ->> 'external_event_id'
  loop
    v_event_id := btrim(coalesce(v_row ->> 'external_event_id', ''));
    v_sku := btrim(coalesce(v_row ->> 'canonical_sku', ''));
    begin
      v_quantity := (v_row ->> 'quantity')::integer;
      v_unit_amount := (v_row ->> 'unit_amount')::integer;
      v_occurred_at := (v_row ->> 'occurred_at')::timestamptz;
    exception when others then
      raise exception 'IMPORT_FINALIZE_INVALID';
    end;
    if v_event_id = '' or char_length(v_event_id) > 300
       or v_sku !~ '^GDR-[A-Z]+-[0-9]{4}$'
       or v_quantity is null or v_quantity not between 1 and 500
       or v_unit_amount is null or v_unit_amount not between 0 and 10000000
       or v_occurred_at is null then
      raise exception 'IMPORT_FINALIZE_INVALID';
    end if;

    select * into v_res
    from public.integration_sales_import_reservations r
    where r.connector_code='payhere' and r.external_event_id=v_event_id
    for update;
    if not found or v_res.request_id <> p_request_id
       or v_res.status not in ('google_written_pending_control','applied') then
      raise exception 'IMPORT_RESERVATION_LOST' using errcode='55P03';
    end if;
    if v_res.canonical_sku <> v_sku or v_res.quantity <> v_quantity
       or v_res.unit_amount <> v_unit_amount or v_res.occurred_at <> v_occurred_at then
      raise exception 'IMPORT_EVENT_PAYLOAD_MISMATCH' using errcode='23505';
    end if;

    insert into public.integration_inventory_movements (
      canonical_sku, location_code, connector_code, external_event_id,
      movement_type, quantity_delta, unit_amount, occurred_at, note, payload, created_by
    ) values (
      v_sku, 'workshop', 'payhere', v_event_id,
      'sale', -v_quantity, v_unit_amount, v_occurred_at,
      '페이히어 매출 엑셀 · SCM 원장 반영',
      jsonb_build_object(
        'report_hash', v_res.report_hash,
        'payhere_name', left(coalesce(v_row ->> 'payhere_name',''), 180),
        'gross_amount', v_quantity * v_unit_amount
      ),
      v_actor
    ) on conflict (connector_code, external_event_id) where external_event_id is not null do nothing;

    select * into v_existing
    from public.integration_inventory_movements m
    where m.connector_code='payhere' and m.external_event_id=v_event_id;
    if not found or v_existing.canonical_sku <> v_sku
       or v_existing.location_code <> 'workshop'
       or v_existing.movement_type <> 'sale'
       or v_existing.quantity_delta <> -v_quantity
       or v_existing.unit_amount is distinct from v_unit_amount
       or v_existing.occurred_at <> v_occurred_at then
      raise exception 'IMPORT_CONTROL_LEDGER_MISMATCH' using errcode='23505';
    end if;

    update public.integration_sales_import_reservations r set
      status='applied', applied_at=coalesce(r.applied_at, now()),
      updated_at=now(), last_error_code=null
    where r.connector_code='payhere' and r.external_event_id=v_event_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.fail_payhere_sales_import(
  p_request_id uuid,
  p_error_code text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  perform private.require_current_admin();
  if p_request_id is null or char_length(coalesce(p_error_code,'')) not between 1 and 80 then
    raise exception 'IMPORT_FAILURE_INVALID';
  end if;
  update public.integration_sales_import_reservations r set
    status='failed_before_google', updated_at=now(),
    last_error_code=regexp_replace(p_error_code, '[^A-Z0-9_]', '', 'g')
  where r.connector_code='payhere' and r.request_id=p_request_id
    and r.status='reserved' and r.google_written_at is null;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.reserve_payhere_sales_import(text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.mark_payhere_google_written(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.finalize_payhere_sales_import(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.fail_payhere_sales_import(uuid, text)
  from public, anon, authenticated;
grant execute on function public.reserve_payhere_sales_import(text, uuid, jsonb) to authenticated;
grant execute on function public.mark_payhere_google_written(uuid, jsonb) to authenticated;
grant execute on function public.finalize_payhere_sales_import(uuid, jsonb) to authenticated;
grant execute on function public.fail_payhere_sales_import(uuid, text) to authenticated;
