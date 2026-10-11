import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptEvent,canonicalEvidence,homepageRows,validateBatch} from '../supabase/functions/integration-ingest/model.mjs';

const runId='11111111-1111-4111-8111-111111111111';

test('message connectors keep only metadata and can never become a transaction',()=>{
  const event=adaptEvent('naver_mail',{
    uid:'mail-1',receivedAt:'2026-10-11T09:00:00+09:00',subject:'가상 고객 이름과 금액',body:'저장하면 안 되는 본문',candidateType:'sale',
    attachmentHashes:['a'.repeat(64),'not-a-hash'],mailbox:'INBOX',
  });
  assert.equal(event.candidateType,'evidence');
  assert.equal(event.summary,'네이버 메일');
  assert.deepEqual(event.attachmentHashes,['a'.repeat(64)]);
  assert.ok(!JSON.stringify(event).includes('저장하면 안 되는 본문'));
  assert.ok(!JSON.stringify(event).includes('가상 고객 이름과 금액'));
});

test('SmartStore state is normalized conservatively',()=>{
  const base={productOrderId:'virtual-order',lastChangedAt:'2026-10-11T00:00:00Z',quantity:1};
  assert.equal(adaptEvent('smartstore',{...base,status:'PURCHASE_DECIDED'}).candidateType,'sale');
  assert.equal(adaptEvent('smartstore',{...base,status:'RETURN_REQUEST'}).candidateType,'reversal');
  assert.equal(adaptEvent('smartstore',{...base,status:'PAYED'}).candidateType,'reservation');
  assert.equal(adaptEvent('smartstore',{...base,status:'UNKNOWN'}).candidateType,'evidence');
});

test('homepage rows do not carry customer fields and empty money stays unknown',()=>{
  const rows=homepageRows([{id:'order-1',status:'신규',total_amount:'',created_at:'2026-10-11T00:00:00Z',updated_at:'2026-10-11T01:00:00Z',buyer_name:'가상 고객',contact:'010-0000-0000'}]);
  assert.equal(rows[0].buyer_name,undefined);assert.equal(rows[0].contact,undefined);
  const event=adaptEvent('homepage',rows[0]);assert.equal(event.unitAmount,null);assert.equal(event.occurredAt,'2026-10-11T01:00:00.000Z');
});

test('batch requires one run id and rejects duplicate source events before storage',()=>{
  const raw={id:'order-1',status:'신규',created_at:'2026-10-11T00:00:00Z'};
  assert.throws(()=>validateBatch({connectorCode:'homepage',runId:'bad',events:[raw]}),/RUN_ID_REQUIRED/);
  assert.throws(()=>validateBatch({connectorCode:'homepage',runId,events:[raw,raw]}),/DUPLICATE_SOURCE_EVENT/);
});

test('canonical evidence is deterministic and excludes review prose',()=>{
  const event=adaptEvent('smartstore',{productOrderId:'virtual-order',status:'PAYED',lastChangedAt:'2026-10-11T00:00:00Z',quantity:1});
  const first=canonicalEvidence('smartstore',event),second=canonicalEvidence('smartstore',{...event,reviewReason:'다른 검토 문구'});
  assert.equal(first,second);
});
