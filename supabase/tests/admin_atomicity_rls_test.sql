begin;
select plan(26);

select has_column('public','orders','client_request_id','orders has a nullable idempotency key');
select has_column('public','orders','client_request_hash','orders has an idempotency payload hash');
select has_index('public','orders','orders_client_request_id_uidx','order idempotency key is unique when present');
select has_function('public','create_public_order_v1',array['uuid','text','text','text','text','text','jsonb'],'public atomic order RPC exists');
select has_function('public','create_admin_order_v1',array['uuid','text','text','text','text','text','text','text','jsonb'],'admin atomic order RPC exists');
select ok(has_function_privilege('anon','public.create_public_order_v1(uuid,text,text,text,text,text,jsonb)','execute'),'anon can call the constrained public order RPC');
select ok(not has_function_privilege('anon','public.create_admin_order_v1(uuid,text,text,text,text,text,text,text,jsonb)','execute'),'anon cannot call the admin order RPC');
select ok(has_function_privilege('authenticated','public.create_admin_order_v1(uuid,text,text,text,text,text,text,text,jsonb)','execute'),'authenticated reaches the admin RPC authorization check');
select ok((select relrowsecurity from pg_class where oid='public.integration_sales_import_reservations'::regclass),'Payhere reservations have RLS');
select ok(not has_table_privilege('anon','public.integration_sales_import_reservations','select'),'anon cannot read Payhere reservations');

insert into public.admin_emails(email,name) values ('atomic-admin@example.test','Atomic test admin');
insert into auth.users(id,email,email_confirmed_at,is_anonymous)
values
  ('10101010-1010-4010-8010-101010101010','atomic-admin@example.test',now(),false),
  ('20202020-2020-4020-8020-202020202020','ordinary-atomic@example.test',now(),false);
insert into auth.sessions(id,user_id,created_at,updated_at)
values
  ('30303030-3030-4030-8030-303030303030','10101010-1010-4010-8010-101010101010',now(),now()),
  ('40404040-4040-4040-8040-404040404040','20202020-2020-4020-8020-202020202020',now(),now());

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20202020-2020-4020-8020-202020202020","email":"ordinary-atomic@example.test","role":"authenticated","session_id":"40404040-4040-4040-8040-404040404040"}',true);
select is(public.is_admin(),false,'ordinary authenticated user is not an admin');
select throws_ok(
  $$select public.create_admin_order_v1('50505050-5050-4050-8050-505050505050','가상 주문자','010-0000-0000','buyer@example.test','가상시 안전로 1',null,'기타','신규','[{"book_title":"가상 도서","quantity":1,"unit_price":7000}]'::jsonb)$$,
  '42501','ADMIN_REQUIRED','ordinary user cannot create an admin order'
);

select set_config('request.jwt.claims','{"sub":"10101010-1010-4010-8010-101010101010","email":"atomic-admin@example.test","role":"authenticated","session_id":"30303030-3030-4030-8030-303030303030"}',true);
select is(public.is_admin(),true,'allowlisted confirmed user with a live matching session is an admin');
select results_eq(
  $$select (public.create_admin_order_v1('60606060-6060-4060-8060-606060606060','가상 주문자','010-0000-0000','buyer@example.test','가상시 안전로 1',null,'기타','신규','[{"book_title":"가상 도서","quantity":2,"unit_price":7000}]'::jsonb)->>'total_amount')::integer$$,
  $$values (14000)$$,'admin order total is calculated from items'
);
select results_eq($$select count(*)::bigint from public.orders where client_request_id='60606060-6060-4060-8060-606060606060'$$,$$values (1::bigint)$$,'admin RPC creates one order');
select results_eq($$select count(*)::bigint from public.order_items where order_id=(select id from public.orders where client_request_id='60606060-6060-4060-8060-606060606060')$$,$$values (1::bigint)$$,'admin RPC creates its item');
select lives_ok(
  $$select public.create_admin_order_v1('60606060-6060-4060-8060-606060606060','가상 주문자','010-0000-0000','buyer@example.test','가상시 안전로 1',null,'기타','신규','[{"book_title":"가상 도서","quantity":2,"unit_price":7000}]'::jsonb)$$,
  'same request and payload can be retried'
);
select results_eq($$select count(*)::bigint from public.orders where client_request_id='60606060-6060-4060-8060-606060606060'$$,$$values (1::bigint)$$,'same request and payload returns the existing order');
select throws_ok(
  $$select public.create_admin_order_v1('60606060-6060-4060-8060-606060606060','바뀐 가상 주문자','010-0000-0000','buyer@example.test','가상시 안전로 1',null,'기타','신규','[{"book_title":"가상 도서","quantity":2,"unit_price":7000}]'::jsonb)$$,
  '23505','IDEMPOTENCY_KEY_REUSED','same request id with changed payload is rejected'
);

reset role;
create or replace function private.reject_synthetic_order_item()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.book_title='강제실패 가상도서' then raise exception 'SYNTHETIC_ITEM_FAILURE'; end if;
  return new;
end;
$$;
create trigger reject_synthetic_order_item before insert on public.order_items
for each row execute function private.reject_synthetic_order_item();

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10101010-1010-4010-8010-101010101010","email":"atomic-admin@example.test","role":"authenticated","session_id":"30303030-3030-4030-8030-303030303030"}',true);
select throws_ok(
  $$select public.create_admin_order_v1('70707070-7070-4070-8070-707070707070','가상 주문자','010-0000-0000','buyer@example.test','가상시 안전로 1',null,'기타','신규','[{"book_title":"강제실패 가상도서","quantity":1,"unit_price":7000}]'::jsonb)$$,
  'P0001','SYNTHETIC_ITEM_FAILURE','item failure aborts the RPC'
);
select results_eq($$select count(*)::bigint from public.orders where client_request_id='70707070-7070-4070-8070-707070707070'$$,$$values (0::bigint)$$,'item failure rolls back the order header');

reset role;
delete from auth.sessions where id='30303030-3030-4030-8030-303030303030';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10101010-1010-4010-8010-101010101010","email":"atomic-admin@example.test","role":"authenticated","session_id":"30303030-3030-4030-8030-303030303030"}',true);
select is(public.is_admin(),false,'a deleted session is rejected immediately');
select throws_ok(
  $$select public.create_admin_order_v1('80808080-8080-4080-8080-808080808080','가상 주문자','010-0000-0000','buyer@example.test','가상시 안전로 1',null,'기타','신규','[{"book_title":"가상 도서","quantity":1,"unit_price":7000}]'::jsonb)$$,
  '42501','ADMIN_REQUIRED','a revoked admin session cannot call the admin RPC'
);

reset role;
insert into public.books(title,author,category,img_path,description,price)
values ('원자성 가상 도서','가상 작가','테스트','synthetic.webp','합성 회귀용이며 롤백된다.',7000);
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select results_eq(
  $$select (public.create_public_order_v1('90909090-9090-4090-8090-909090909090','가상 공개 주문자','010-0000-0000','public@example.test','가상시 안전로 2',null,'[{"book_title":"원자성 가상 도서","quantity":2,"unit_price":7000}]'::jsonb)->>'total_amount')::integer$$,
  $$values (14000)$$,'public RPC validates catalog data and calculates total'
);
select results_eq($$select count(*)::bigint from public.orders where client_request_id='90909090-9090-4090-8090-909090909090'$$,$$values (1::bigint)$$,'public RPC creates one order');
select results_eq($$select count(*)::bigint from public.order_items where order_id=(select id from public.orders where client_request_id='90909090-9090-4090-8090-909090909090')$$,$$values (1::bigint)$$,'public RPC creates one matching item');

select * from finish();
rollback;
