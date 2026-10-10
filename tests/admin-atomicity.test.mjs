import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';

const additive=fs.readFileSync(new URL('../supabase/migrations/20261010095936_admin_atomicity_additive.sql',import.meta.url),'utf8');
const cutover=fs.readFileSync(new URL('../supabase/migration-plans/20261010095948_admin_atomicity_cutover.sql',import.meta.url),'utf8');
const publicHtml=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const previewHtml=fs.readFileSync(new URL('../preview/index.html',import.meta.url),'utf8');
const adminHtml=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');

test('order RPC migration keeps header and items in one idempotent database transaction',()=>{
  assert.match(additive,/create or replace function private\.create_order_v1[\s\S]+insert into public\.orders[\s\S]+insert into public\.order_items/);
  assert.match(additive,/orders_client_request_id_uidx/);
  assert.match(additive,/IDEMPOTENCY_KEY_REUSED/);
  assert.match(additive,/p_validate_catalog and exists/);
  assert.match(additive,/create_public_order_v1[\s\S]+auth\.uid\(\), true/);
  assert.match(additive,/create_admin_order_v1[\s\S]+private\.require_current_admin/);
});

test('cutover closes split browser writes only after both clients use the RPC',()=>{
  for(const html of [publicHtml,previewHtml]){
    assert.match(html,/rpc\('create_public_order_v1'/);
    assert.doesNotMatch(html,/from\('orders'\)\.insert/);
    assert.doesNotMatch(html,/from\('order_items'\)\.insert/);
    assert.match(html,/gaeddirang\.checkout\.request\.v1/);
  }
  assert.match(adminHtml,/rpc\('create_admin_order_v1'/);
  assert.match(adminHtml,/id="naEmail" type="email"/);
  assert.match(cutover,/drop policy if exists "누구나 주문 제출 가능"/);
  assert.match(cutover,/revoke insert, delete on table public\.orders from anon, authenticated/);
  assert.match(cutover,/revoke insert, update, delete on table public\.order_items from anon, authenticated/);
});

test('strict admin predicate requires a live matching session, confirmed user and allowlist',()=>{
  assert.match(additive,/auth\.uid\(\) as user_id/);
  assert.match(additive,/auth\.jwt\(\) ->> 'session_id'/);
  assert.match(additive,/from auth\.sessions s/);
  assert.match(additive,/s\.not_after is null or s\.not_after > now\(\)/);
  assert.match(additive,/not coalesce\(u\.is_anonymous, false\)/);
  assert.match(additive,/u\.email_confirmed_at is not null/);
  assert.match(additive,/join public\.admin_emails/);
});

class VirtualOrderStore{
  constructor(){this.orders=[];this.items=[];this.requests=new Map()}
  create(requestId,payload,{failItem=false}={}){
    const hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex'),prior=this.requests.get(requestId);
    if(prior){if(prior.hash!==hash)throw Error('IDEMPOTENCY_KEY_REUSED');return prior.result}
    const order={id:`virtual-${this.orders.length+1}`,total:payload.items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0)};
    const items=payload.items.map(item=>({...item,order_id:order.id}));
    if(failItem)throw Error('SYNTHETIC_ITEM_FAILURE');
    this.orders.push(order);this.items.push(...items);const result={id:order.id,total_amount:order.total};this.requests.set(requestId,{hash,result});return result;
  }
}

test('virtual order data: retry is idempotent, changed reuse conflicts, item failure rolls back',()=>{
  const store=new VirtualOrderStore(),payload={buyer:'가상 주문자',items:[{book_title:'가상 도서',quantity:2,unit_price:7000}]};
  const first=store.create('request-a',payload),retry=store.create('request-a',payload);
  assert.deepEqual(retry,first);assert.equal(store.orders.length,1);assert.equal(store.items.length,1);assert.equal(first.total_amount,14000);
  assert.throws(()=>store.create('request-a',{...payload,buyer:'다른 가상 주문자'}),/IDEMPOTENCY_KEY_REUSED/);
  assert.throws(()=>store.create('request-b',payload,{failItem:true}),/SYNTHETIC_ITEM_FAILURE/);
  assert.equal(store.orders.length,1);assert.equal(store.items.length,1);assert.equal(store.requests.has('request-b'),false);
});

test('Payhere reservation contract is private-by-table and exact-by-event',()=>{
  assert.match(additive,/integration_sales_import_reservations[\s\S]+enable row level security/);
  assert.match(additive,/revoke all privileges on table public\.integration_sales_import_reservations/);
  assert.match(additive,/primary key \(connector_code, external_event_id\)/);
  assert.match(additive,/IMPORT_EVENT_PAYLOAD_MISMATCH/);
  assert.match(additive,/google_written_pending_control/);
  assert.match(additive,/on conflict \(connector_code, external_event_id\) where external_event_id is not null do nothing/);
});
