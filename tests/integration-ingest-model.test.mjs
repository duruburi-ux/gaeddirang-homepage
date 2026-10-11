import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptEvent,canonicalEvidence,homepageRows,validateBatch} from '../supabase/functions/integration-ingest/model.mjs';

const runId='11111111-1111-4111-8111-111111111111';

test('message connectors keep only metadata and can never become a transaction',()=>{
  const event=adaptEvent('naver_mail',{
    messageId:`naver-mail:${'b'.repeat(64)}:${'c'.repeat(64)}`,receivedAt:'2026-10-11T09:00:00+09:00',subject:'가상 고객 이름과 금액',body:'저장하면 안 되는 본문',candidateType:'sale',
    uidHash:'b'.repeat(64),messageIdHash:'c'.repeat(64),mailbox:'INBOX',attachments:[{
      sha256:'a'.repeat(64),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:123,localRef:`moneypin_attachments/2026-10/${'a'.repeat(64)}.xlsx`,
    }],
  });
  assert.equal(event.candidateType,'evidence');
  assert.equal(event.summary,'네이버 메일');
  assert.deepEqual(event.attachmentHashes,['a'.repeat(64)]);
  assert.equal(event.evidenceMetadata.source_uid_hash,'b'.repeat(64));
  assert.equal(event.evidenceMetadata.attachments[0].size,123);
  assert.ok(!JSON.stringify(event).includes('저장하면 안 되는 본문'));
  assert.ok(!JSON.stringify(event).includes('가상 고객 이름과 금액'));
});

test('Google Chat stores content and attachment reference hashes, never bodies',()=>{
  const event=adaptEvent('google_chat',{
    messageId:'spaces/s/messages/m1',createTime:'2026-10-11T00:00:00Z',threadName:'spaces/s/threads/t1',
    contentHash:'d'.repeat(64),attachmentRefHashes:['e'.repeat(64)],text:'저장하면 안 되는 본문',
  });
  assert.deepEqual(event.evidenceMetadata,{content_hash:'d'.repeat(64),attachment_ref_hashes:['e'.repeat(64)]});
  assert.ok(!JSON.stringify(event).includes('저장하면 안 되는 본문'));
  assert.deepEqual(event.attachmentHashes,[]);
});

test('message metadata fails closed instead of silently truncating attachments',()=>{
  const attachment=index=>({sha256:index.toString(16).padStart(64,'0'),mimeType:'text/csv',size:1,localRef:`moneypin_attachments/2026-10/${index.toString(16).padStart(64,'0')}.csv`});
  assert.throws(()=>adaptEvent('naver_mail',{
    messageId:`naver-mail:${'b'.repeat(64)}:${'c'.repeat(64)}`,receivedAt:'2026-10-11T00:00:00Z',mailbox:'INBOX',uidHash:'b'.repeat(64),messageIdHash:'c'.repeat(64),attachments:Array.from({length:21},(_,index)=>attachment(index+1)),
  }),/INVALID_SOURCE_EVENT/);
  assert.throws(()=>adaptEvent('google_chat',{
    messageId:'spaces/s/messages/m2',createTime:'2026-10-11T00:00:00Z',contentHash:'d'.repeat(64),attachmentRefHashes:Array.from({length:21},(_,index)=>index.toString(16).padStart(64,'0')),
  }),/INVALID_SOURCE_EVENT/);
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
