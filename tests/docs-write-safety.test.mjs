import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../admin/docs.html', import.meta.url), 'utf8');

test('거래명세서 수정은 기존 updated_at을 조건으로 사용한다', () => {
  assert.match(html, /if\(TS_EDIT\.updated_at\) req = req\.eq\('updated_at', TS_EDIT\.updated_at\)/);
  assert.match(html, /if\(s\.row\.updated_at\) req = req\.eq\('updated_at', s\.row\.updated_at\)/);
});

test('거래명세서 상태 저장 실패나 충돌 뒤에는 PDF를 만들지 않는다', () => {
  const start = html.indexOf('async function printStatement()');
  const end = html.indexOf('/* ============ 작가 정산서', start);
  const source = html.slice(start, end);
  assert.match(source, /if\(error\)\{[^}]+return;\s*\}/s);
  assert.match(source, /if\(!data\)\{[^}]+return;\s*\}/s);
  assert.ok(source.lastIndexOf('printHtml(') > source.indexOf('if(!data)'));
});
