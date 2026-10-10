import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../admin/docs.html',import.meta.url),'utf8');
const source=html.match(/function parseCount\(text\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(source,'parseCount source should exist');
const context={};
vm.runInNewContext(`${source};this.parseCount=parseCount;`,context);

test('정산 수량 파서는 음수 반품을 양수 판매로 뒤집지 않는다',()=>{
  assert.equal(Number.isNaN(context.parseCount('-2')),true);
  assert.equal(context.parseCount('2권'),2);
  assert.equal(context.parseCount('1,234건'),1234);
  assert.equal(context.parseCount(''),null);
});
