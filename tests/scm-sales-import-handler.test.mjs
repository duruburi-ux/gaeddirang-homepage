import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHandler} from '../supabase/functions/scm-sales-import/handler.mjs';

const req=(method='POST',origin='https://gaeddirang.com',auth='')=>new Request('https://example.test',{method,headers:{origin,...(auth?{authorization:auth}:{})},body:method==='POST'?'{}':undefined});

test('sales importer rejects foreign origins and missing login before upstream calls',async()=>{
  let calls=0;const handler=makeHandler({env:()=>null,fetcher:async()=>{calls++;throw Error('unexpected')}});
  const foreign=await handler(req('POST','https://evil.example','Bearer nope'));assert.equal(foreign.status,403);
  const anonymous=await handler(req('POST'));assert.equal(anonymous.status,401);assert.equal(calls,0);
});

test('sales importer exposes POST-only CORS and validates body before Google access',async()=>{
  let calls=0;const handler=makeHandler({env:name=>name==='SUPABASE_URL'?'https://project.test':name==='SUPABASE_ANON_KEY'?'public-key':null,fetcher:async()=>{calls++;throw Error('unexpected')}});
  const preflight=await handler(req('OPTIONS'));assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-methods'),'POST, OPTIONS');
  const invalid=await handler(req('POST','https://gaeddirang.com','Bearer user'));assert.equal(invalid.status,400);assert.equal((await invalid.json()).error,'INVALID_PAYLOAD');assert.equal(calls,0);
});

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const eventId='2026-08-31T15:02:49+09:00::가상도서::1::15000';
const body=(requestId='11111111-1111-4111-8111-111111111111',canonicalSku='GDR-B-0027')=>({
  dryRun:false,requestId,
  report:{hash:'a'.repeat(64),fileName:'synthetic.xlsx',period:{start:'2026-08-31',end:'2026-08-31'},gross:15000,net:15000},
  rows:[{canonicalSku,productName:'가상 도서',payhereName:'가상도서',quantity:1,unitAmount:15000,grossAmount:15000,occurredAt:'2026-08-31T15:02:49+09:00',externalEventId:eventId}]
});
const applyRequest=value=>new Request('https://example.test',{method:'POST',headers:{origin:'https://gaeddirang.com',authorization:'Bearer synthetic'},body:JSON.stringify(value)});

function fakeBackend({failFinalizeOnce=false,barrierReads=false}={}){
  const reservations=new Map(),googleEvents=new Set(),movements=new Set();
  let appendCount=0,failedFinalize=false,mappingSku='GDR-B-0027';
  const waits={sheet:[],db:[]},counts={sheet:0,db:0};
  async function pair(kind){
    if(!barrierReads)return;
    counts[kind]++;
    if(counts[kind]===2){for(const resolve of waits[kind])resolve();waits[kind]=[]}else await new Promise(resolve=>waits[kind].push(resolve));
  }
  async function fetcher(input,options={}){
    const url=String(input),path=new URL(url).pathname,method=options.method||'GET';
    if(path==='/auth/v1/user')return json({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'admin@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false});
    if(path==='/rest/v1/rpc/is_admin')return json(true);
    if(path==='/rest/v1/admin_emails')return json([{email:'admin@example.test'}]);
    if(path==='/token')return json({access_token:'google-token'});
    if(path.includes('/values:batchGet')){
      await pair('sheet');
      return json({valueRanges:[
        {values:[['SKU','내부표준상품명','정가','현재고'],['GDR-B-0027','가상 도서',15000,10],['GDR-B-9999','가상 도서',15000,10]]},
        {values:[['날짜','transaction_id','source_id','SKU'],...Array.from(googleEvents,id=>['2026-08-31',id,'synthetic','GDR-B-0027'])]}
      ]});
    }
    if(path==='/rest/v1/integration_inventory_movements'){
      await pair('db');return json(Array.from(movements,external_event_id=>({external_event_id})));
    }
    if(path==='/rest/v1/integration_product_mappings')return json([{canonical_sku:mappingSku,external_sku:'가상도서'}]);
    if(path.endsWith(':append')){
      appendCount++;for(const row of JSON.parse(options.body).values)googleEvents.add(row[9]);return json({updates:{updatedRows:1}});
    }
    if(path==='/rest/v1/rpc/reserve_payhere_sales_import'){
      const value=JSON.parse(options.body),out=[];
      for(const event of value.p_events){
        const existing=reservations.get(event.external_event_id);
        if(existing){
          if(existing.reportHash!==value.p_report_hash||existing.sku!==event.canonical_sku||existing.quantity!==event.quantity||existing.amount!==event.unit_amount||existing.occurredAt!==event.occurred_at)return json({message:'IMPORT_EVENT_PAYLOAD_MISMATCH'},409);
          if(existing.status!=='applied'&&existing.requestId!==value.p_request_id)return json({message:'IMPORT_IN_PROGRESS'},409);
          if(event.google_seen&&existing.status!=='applied')existing.status='google_written_pending_control';
          out.push({external_event_id:event.external_event_id,status:existing.status,owned:existing.requestId===value.p_request_id});continue;
        }
        const saved={requestId:value.p_request_id,reportHash:value.p_report_hash,sku:event.canonical_sku,quantity:event.quantity,amount:event.unit_amount,occurredAt:event.occurred_at,status:event.google_seen?'google_written_pending_control':'reserved'};
        reservations.set(event.external_event_id,saved);out.push({external_event_id:event.external_event_id,status:saved.status,owned:true});
      }
      return json(out);
    }
    if(path==='/rest/v1/rpc/mark_payhere_google_written'){
      const value=JSON.parse(options.body);
      for(const id of value.p_event_ids){const saved=reservations.get(id);if(!saved||saved.requestId!==value.p_request_id)return json({message:'IMPORT_RESERVATION_LOST'},409);saved.status='google_written_pending_control'}
      return json(value.p_event_ids.length);
    }
    if(path==='/rest/v1/rpc/finalize_payhere_sales_import'){
      if(failFinalizeOnce&&!failedFinalize){failedFinalize=true;return json({message:'synthetic finalize outage'},503)}
      const value=JSON.parse(options.body);
      for(const row of value.p_rows){const saved=reservations.get(row.external_event_id);if(!saved||saved.requestId!==value.p_request_id||saved.status!=='google_written_pending_control')return json({message:'IMPORT_RESERVATION_LOST'},409);movements.add(row.external_event_id);saved.status='applied'}
      return json(value.p_rows.length);
    }
    if(path==='/rest/v1/integration_sync_runs'&&method==='POST')return new Response(null,{status:201});
    throw Error(`unexpected fetch ${method} ${url}`);
  }
  return {fetcher,reservations,googleEvents,movements,get appendCount(){return appendCount},set mappingSku(value){mappingSku=value}};
}

const handlerFor=backend=>makeHandler({
  env:name=>name==='SUPABASE_URL'?'https://project.test':name==='SUPABASE_ANON_KEY'?'public-key':name==='SCM_GOOGLE_SERVICE_ACCOUNT'?JSON.stringify({client_email:'synthetic@example.test',private_key:'-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----'}):null,
  fetcher:backend.fetcher,
  cryptoImpl:{subtle:{importKey:async()=>({}),sign:async()=>new Uint8Array([1,2,3])}}
});

test('concurrent imports reserve first and append each sale to Google exactly once',async()=>{
  const backend=fakeBackend({barrierReads:true}),first=handlerFor(backend),second=handlerFor(backend);
  const responses=await Promise.all([
    first(applyRequest(body('11111111-1111-4111-8111-111111111111'))),
    second(applyRequest(body('22222222-2222-4222-8222-222222222222')))
  ]);
  assert.deepEqual(responses.map(x=>x.status).sort(),[200,409]);
  assert.equal(backend.appendCount,1);assert.equal(backend.googleEvents.size,1);assert.equal(backend.movements.size,1);
});

test('retry after Google write repairs the control ledger without reducing stock twice',async()=>{
  const backend=fakeBackend({failFinalizeOnce:true}),handler=handlerFor(backend),payload=body();
  const first=await handler(applyRequest(payload));assert.equal(first.status,503);assert.equal((await first.json()).error,'CONTROL_REPAIR_REQUIRED');
  assert.equal(backend.appendCount,1);assert.equal(backend.googleEvents.size,1);assert.equal(backend.movements.size,0);
  const retry=await handler(applyRequest(payload)),result=await retry.json();
  assert.equal(retry.status,200);assert.equal(result.applied,0);assert.equal(result.repaired,1);
  assert.equal(backend.appendCount,1);assert.equal(backend.googleEvents.size,1);assert.equal(backend.movements.size,1);
});

test('a reserved event rejects changed server-side product identity',async()=>{
  const backend=fakeBackend(),handler=handlerFor(backend),payload=body();
  assert.equal((await handler(applyRequest(payload))).status,200);
  backend.movements.clear();backend.mappingSku='GDR-B-9999';
  const changed=await handler(applyRequest(body('33333333-3333-4333-8333-333333333333','GDR-B-9999')));
  assert.equal(changed.status,409);assert.equal((await changed.json()).error,'IMPORT_EVENT_PAYLOAD_MISMATCH');
  assert.equal(backend.appendCount,1);
});
