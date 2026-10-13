import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../admin/docs.html', import.meta.url), 'utf8');

test('거래명세서 수정은 기존 updated_at을 조건으로 사용한다', () => {
  assert.match(html, /if\(TS_EDIT\.updated_at\) req = req\.eq\('updated_at', TS_EDIT\.updated_at\)/);
});

test('저장형 거래명세서는 실패나 충돌 뒤 PDF를 만들지 않고 견적 기반 PDF는 상태를 바꾸지 않는다', () => {
  const start = html.indexOf('async function printStatement()');
  const end = html.indexOf('/* ============ 작가 정산서', start);
  const source = html.slice(start, end);
  assert.match(source, /if\(res\.error\)\{[^}]+return;\s*\}/s);
  assert.match(source, /if\(!res\.data\)\{[^}]+return;\s*\}/s);
  assert.ok(source.lastIndexOf('printHtml(') > source.indexOf('if(!res.data)'));
  assert.doesNotMatch(source,/s\.row\.updated_at|patch\.status|→ 수주/);
});
