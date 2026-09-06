import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const html=fs.readFileSync(new URL('admin/index.html',root),'utf8');
const js=fs.readFileSync(new URL('admin/integration.js',root),'utf8');
const model=fs.readFileSync(new URL('admin/payhere-import.js',root),'utf8');

test('integration hub is inside the gated admin and labels connection boundaries',()=>{
  assert.ok(html.includes('id="tab-integration"'));
  assert.ok(html.includes('자동 연결된 곳과 사람이 입력해야 하는 곳'));
  assert.ok(html.includes('중복 거래 방지 원장 적용'));
  assert.ok(html.includes('id="payhere-file"'));
  assert.ok(html.includes('승인 전 재고 변경 없음'));
  assert.ok(html.includes('xlsx-0.20.3'));
  assert.ok(html.indexOf('id="tab-integration"')>html.indexOf('id="appView"'));
  assert.ok(!js.includes('service_role'));
  assert.ok(!js.includes('SUPABASE_SERVICE'));
});

test('integration browser scripts parse and require a reviewed server import',()=>{
  new vm.Script(js);new vm.Script(model);
  for(const table of ['integration_connectors','integration_product_mappings','integration_inventory_movements','integration_reconciliation_issues','integration_settlement_entries']) assert.ok(js.includes(table));
  assert.ok(!/\.delete\s*\(/.test(js));
  assert.ok(js.includes('/functions/v1/scm-sales-import'));
  assert.ok(js.includes("confirm('검사된 판매 수량"));
  assert.ok(!js.includes('SCM_GOOGLE_SERVICE_ACCOUNT'));
});
