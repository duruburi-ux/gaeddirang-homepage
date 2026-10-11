import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../admin/evidence-batch-import.js',import.meta.url),'utf8');
const sandbox={TextEncoder};vm.runInNewContext(source,sandbox);const M=sandbox.IntegrationEvidenceBatchModel;
const hash=value=>String(value).repeat(64);
const mail={action:'ingest',connectorCode:'naver_mail',runId:'11111111-1111-5111-8111-111111111111',dryRun:false,events:[{messageId:`naver-mail:${hash('a')}:${hash('b')}`,receivedAt:'2026-10-11T00:00:00Z',mailbox:'INBOX',uidHash:hash('a'),messageIdHash:hash('b'),attachments:[{sha256:hash('c'),mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:1200,localRef:`moneypin_attachments/2026-10/${hash('c')}.xlsx`}]}]};
const chat={action:'ingest',connectorCode:'google_chat',runId:'22222222-2222-5222-8222-222222222222',dryRun:false,events:[{messageId:'spaces/example/messages/one',createTime:'2026-10-11T00:00:00Z',threadName:'spaces/example/threads/one',contentHash:hash('d'),attachmentRefHashes:[hash('e')]}]};

test('collector exports stay evidence-only and retain deterministic run ids',()=>{
  const parsed=M.parse(JSON.stringify(mail));assert.equal(parsed.connectorCode,'naver_mail');assert.equal(M.describe(parsed).count,1);
  assert.equal(parsed.events[0].messageId,mail.events[0].messageId);
  assert.equal(M.parse(JSON.stringify(chat)).events[0].contentHash,hash('d'));
});

test('unknown or sensitive-looking fields fail closed before upload',()=>{
  assert.throws(()=>M.validate({...mail,events:[{...mail.events[0],subject:'must not travel'}]}),/EVIDENCE_BATCH_INVALID/);
  assert.throws(()=>M.validate({...chat,events:[{...chat.events[0],body:'must not travel'}]}),/EVIDENCE_BATCH_INVALID/);
  assert.throws(()=>M.validate({...mail,events:[{...mail.events[0],attachments:[{...mail.events[0].attachments[0],fileName:'private.xlsx'}]}]}),/EVIDENCE_BATCH_INVALID/);
});

test('changed hashes, paths, duplicate ids and oversized files are rejected',()=>{
  assert.throws(()=>M.validate({...mail,events:[{...mail.events[0],attachments:[{...mail.events[0].attachments[0],localRef:`moneypin_attachments/2026-10/${hash('d')}.xlsx`}]}]}),/EVIDENCE_BATCH_INVALID/);
  assert.throws(()=>M.validate({...chat,events:[chat.events[0],chat.events[0]]}),/EVIDENCE_BATCH_INVALID/);
  assert.throws(()=>M.parse('x'.repeat(300000)),/EVIDENCE_BATCH_TOO_LARGE/);
});

test('only exporter-shaped batches can request an ingest',()=>{
  assert.throws(()=>M.validate({...mail,dryRun:true}),/EVIDENCE_BATCH_INVALID/);
  assert.throws(()=>M.validate({...mail,connectorCode:'homepage'}),/EVIDENCE_BATCH_INVALID/);
  assert.throws(()=>M.validate({...mail,action:'review'}),/EVIDENCE_BATCH_INVALID/);
});
