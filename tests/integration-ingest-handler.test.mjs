import test from 'node:test';
import assert from 'node:assert/strict';
import {makeHandler} from '../supabase/functions/integration-ingest/handler.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const request=body=>new Request('https://example.test',{method:'POST',headers:{origin:'https://gaeddirang.com',authorization:'Bearer synthetic'},body:JSON.stringify(body)});
const runId='11111111-1111-4111-8111-111111111111';

function backend({ingestFailure=false,runFailure=false}={}){
  const calls=[];
  async function fetcher(input,options={}){
    const url=String(input),path=new URL(url).pathname+new URL(url).search,method=options.method||'GET';calls.push({url,path,method,body:options.body?JSON.parse(options.body):null});
    if(path==='/auth/v1/user')return json({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'admin@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',is_anonymous:false});
    if(path==='/rest/v1/rpc/is_admin')return json(true);
    if(path==='/rest/v1/admin_emails?select=email')return json([{email:'admin@example.test'}]);
    if(path.startsWith('/rest/v1/orders?'))return json([{id:'virtual-order',status:'발송준비',total_amount:12000,created_at:'2026-10-11T00:00:00Z',updated_at:'2026-10-11T01:00:00Z'}]);
    if(path==='/rest/v1/rpc/ingest_integration_evidence')return ingestFailure?json({message:'synthetic outage'},503):json([{evidence_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',source_event_id:'order:virtual-order:발송준비',result:'inserted'}]);
    if(path==='/rest/v1/rpc/review_integration_evidence')return json({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',review_status:'reviewed',ledger_changed:false});
    if(path==='/rest/v1/integration_sync_runs')return runFailure?json({message:'run log denied'},403):new Response(null,{status:201});
    throw Error(`unexpected ${method} ${url}`);
  }
  return {calls,fetcher};
}

const handlerFor=source=>makeHandler({env:name=>name==='SUPABASE_URL'?'https://project.test':name==='SUPABASE_ANON_KEY'?'public-key':null,fetcher:source.fetcher});

test('ingest rejects foreign origin and missing login before upstream calls',async()=>{
  let calls=0;const handler=makeHandler({env:()=>null,fetcher:async()=>{calls++;throw Error('unexpected')}});
  const foreign=await handler(new Request('https://example.test',{method:'POST',headers:{origin:'https://evil.example',authorization:'Bearer nope'},body:'{}'}));assert.equal(foreign.status,403);
  const anonymous=await handler(new Request('https://example.test',{method:'POST',headers:{origin:'https://gaeddirang.com'},body:'{}'}));assert.equal(anonymous.status,401);assert.equal(calls,0);
});

test('external collectors stay blocked until their exact connector approval',async()=>{
  const source=backend(),response=await handlerFor(source)(request({action:'collect',connectorCode:'smartstore',runId,dryRun:true})),body=await response.json();
  assert.equal(response.status,409);assert.equal(body.error,'CONNECTOR_APPROVAL_REQUIRED');assert.equal(body.capability.mode,'official_api');
  assert.equal(source.calls.some(call=>call.path.startsWith('/rest/v1/orders?')),false);
});

test('unknown actions and malformed review ids fail closed',async()=>{
  const source=backend(),handler=handlerFor(source);
  const unknown=await handler(request({action:'delete',connectorCode:'homepage',runId,events:[{id:'order-1',status:'신규',created_at:'2026-10-11T00:00:00Z'}]}));assert.equal(unknown.status,400);assert.equal((await unknown.json()).error,'ACTION_NOT_SUPPORTED');
  const badReview=await handler(request({action:'review',evidenceId:'------------------------------------',decision:'reviewed'}));assert.equal(badReview.status,400);assert.equal((await badReview.json()).error,'REVIEW_INVALID');
  assert.equal(source.calls.some(call=>call.path.includes('ingest_integration_evidence')),false);
});

test('homepage collection previews non-PII evidence without writing',async()=>{
  const source=backend(),response=await handlerFor(source)(request({action:'collect',connectorCode:'homepage',runId,dryRun:true})),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.received,1);assert.equal(body.rows[0].candidateType,'reservation');
  assert.equal(source.calls.some(call=>call.path==='/rest/v1/rpc/ingest_integration_evidence'),false);
  const orderCall=source.calls.find(call=>call.path.startsWith('/rest/v1/orders?'));assert.ok(orderCall.path.includes('select=id%2Cstatus%2Ctotal_amount%2Ccreated_at%2Cupdated_at')||orderCall.path.includes('select=id,status,total_amount,created_at,updated_at'));
  assert.ok(!orderCall.path.includes('buyer_name'));assert.ok(!orderCall.path.includes('contact'));
});

test('write uses hashed evidence, records a run, and never changes the ledger',async()=>{
  const source=backend(),response=await handlerFor(source)(request({action:'collect',connectorCode:'homepage',runId,dryRun:false})),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.inserted,1);assert.equal(body.runRecorded,true);assert.equal(body.warning,null);
  const call=source.calls.find(row=>row.path==='/rest/v1/rpc/ingest_integration_evidence');assert.match(call.body.p_rows[0].content_hash,/^[a-f0-9]{64}$/);
  assert.deepEqual(call.body.p_rows[0].candidate_payload,{canonical_sku:null,quantity:null,unit_amount:12000,reverses_event_id:null});
  assert.equal(source.calls.filter(row=>row.path==='/rest/v1/integration_sync_runs').length,1);
  assert.equal(source.calls.some(row=>/inventory|settlement_entries/.test(row.path)),false);
});

test('review marks evidence only and failed ingest is visible as a failed run',async()=>{
  const source=backend(),handler=handlerFor(source),review=await handler(request({action:'review',evidenceId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',decision:'reviewed'}));
  assert.equal(review.status,200);assert.equal((await review.json()).ledgerChanged,false);
  const failedSource=backend({ingestFailure:true}),failed=await handlerFor(failedSource)(request({action:'collect',connectorCode:'homepage',runId,dryRun:false}));
  assert.equal(failed.status,503);const run=failedSource.calls.find(row=>row.path==='/rest/v1/integration_sync_runs');assert.equal(run.body.status,'failure');assert.equal(run.body.records_rejected,1);
});

test('a saved inbox item never pretends its missing run history was recorded',async()=>{
  const source=backend({runFailure:true}),response=await handlerFor(source)(request({action:'collect',connectorCode:'homepage',runId,dryRun:false})),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.inserted,1);assert.equal(body.runRecorded,false);assert.equal(body.warning,'RUN_HISTORY_WRITE_FAILED');
});
