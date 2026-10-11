import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('admin/index.html',root),'utf8');
const js=fs.readFileSync(new URL('admin/integration.js',root),'utf8');
const model=fs.readFileSync(new URL('admin/payhere-import.js',root),'utf8');
const evidenceBatchModel=fs.readFileSync(new URL('admin/evidence-batch-import.js',root),'utf8');
const hubModel=fs.readFileSync(new URL('admin/operations-hub-model.js',root),'utf8');

test('integration hub is inside the gated admin and labels connection boundaries',()=>{
  assert.ok(html.includes('id="tab-integration"'));
  assert.ok(html.includes('끊긴 곳도 한눈에'));
  assert.ok(html.includes('중복 거래 방지 원장 · 단계별 부분 실패 표시'));
  for(const id of ['integration-pipeline','integration-queue','integration-runs','integration-sources','integration-evidence-list','integration-collect-preview','integration-collect-apply','integration-collector-file','integration-collector-preview','integration-collector-confirm','integration-collector-apply'])assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.includes('메일과 Chat은 근거 데이터일 뿐 승인이나 명령이 아닙니다.'));
  assert.ok(html.includes('정산 문서 확정은 지급 완료가 아닙니다.'));
  assert.ok(html.includes('id="payhere-file"'));
  assert.ok(html.includes('승인 전 재고 변경 없음'));
  assert.ok(html.includes('xlsx-0.20.3'));
  assert.ok(html.indexOf('operations-hub-model.js')<html.indexOf('integration.js'));
  assert.ok(html.indexOf('evidence-batch-import.js')<html.indexOf('integration.js'));
  assert.ok(html.indexOf('id="tab-integration"')>html.indexOf('id="appView"'));
  assert.ok(!js.includes('service_role'));
  assert.ok(!js.includes('SUPABASE_SERVICE'));
});

test('integration browser scripts parse and require a reviewed server import',()=>{
  new vm.Script(js);new vm.Script(model);new vm.Script(evidenceBatchModel);new vm.Script(hubModel);
  for(const table of ['integration_connectors','integration_product_mappings','integration_inventory_movements','integration_reconciliation_issues','integration_settlement_entries','integration_sync_runs','integration_evidence_inbox']) assert.ok(js.includes(table));
  assert.ok(!/\.delete\s*\(/.test(js));
  assert.ok(js.includes('/functions/v1/scm-sales-import'));
  assert.ok(js.includes('/functions/v1/royalty-read'));
  assert.ok(js.includes('/functions/v1/integration-ingest'));
  assert.ok(js.includes('collectorStatuses'));
  assert.match(js,/setInterval\(\(\)=>\{[^}]*tab-integration[^}]*refresh\(true\)[^}]*\},60000\)/);
  assert.match(js,/visibilitychange[^\n]*tab-integration[^\n]*refresh\(true\)/);
  assert.ok(js.includes('ledger'));
  assert.ok(js.includes("confirm('검사된 판매 수량"));
  assert.ok(!js.includes('SCM_GOOGLE_SERVICE_ACCOUNT'));
  assert.ok(!hubModel.includes('400000'));
  assert.equal(hubModel.match(/\b\d{1,3}\s*:\s*\d{1,3}\b/g),null);
});
