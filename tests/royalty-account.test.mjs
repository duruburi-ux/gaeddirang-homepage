import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require=createRequire(import.meta.url);
const {normalizeAccountNumber,maskAccountNumber,maskHolder,validateDraft}=require('../admin/royalty-account-model.js');

const base={
  authorName:'가상작가',bankName:'가상은행',accountNumber:'0000-0000-0000',holderName:'가상예금주',
  sourceType:'original_image',sourceCheckedOn:'2026-10-10',holderConfirmed:true,sourceClear:true,markVerified:true,
};

test('계좌번호는 저장 전에 숫자로 정규화하고 목록에는 끝 네 자리만 남긴다',()=>{
  assert.equal(normalizeAccountNumber('0000-0000 0000'),'000000000000');
  assert.equal(maskAccountNumber('0000-0000 0000'),'•••• 0000');
  assert.equal(maskHolder('가상예금주'),'가***주');
});

test('예금주 또는 원본 판독을 확인하지 않으면 확인 완료로 승격하지 않는다',()=>{
  for(const patch of [
    {holderName:''},
    {holderConfirmed:false},
    {sourceClear:false},
  ]){
    const result=validateDraft({...base,...patch});
    assert.equal(result.ok,false);
    assert.match(result.errors.join(' '),/확인 완료/);
  }
});

test('재확인 필요 상태는 예금주가 비어 있어도 출처와 계좌 형식을 검증해 저장할 수 있다',()=>{
  const result=validateDraft({...base,holderName:'',holderConfirmed:false,sourceClear:false,markVerified:false});
  assert.equal(result.ok,true);
  assert.equal(result.draft.accountNumber,'000000000000');
});

test('불명확한 출처와 비정상 계좌번호는 저장 전에 막는다',()=>{
  const result=validateDraft({...base,accountNumber:'12-34',sourceType:'unknown',sourceCheckedOn:''});
  assert.equal(result.ok,false);
  assert.equal(result.errors.length,3);
});

test('계좌 UI는 브라우저 저장·로그·정산서 출력 경로와 분리된다',()=>{
  const ui=readFileSync(new URL('../admin/docs-royalty-accounts.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../admin/docs.html',import.meta.url),'utf8');
  assert.ok(!/localStorage\.(?:setItem|getItem)/.test(ui));
  assert.ok(!ui.includes('console.'));
  assert.ok(html.indexOf('id="ryAccountHost"')<html.indexOf('id="ryBox"'));
  const printer=html.slice(html.indexOf('function royaltyHtml'),html.indexOf('function renderRoyalty',html.indexOf('function royaltyHtml')));
  assert.ok(!printer.includes('ryAccount'));
});

test('계좌번호 입력은 저장된 로그인 비밀번호 자동완성 대상으로 취급되지 않는다',()=>{
  const ui=readFileSync(new URL('../admin/docs-royalty-accounts.js',import.meta.url),'utf8');
  assert.match(ui,/id="ryAccountBank"[^>]+autocomplete="off"/);
  assert.match(ui,/id="ryAccountNumber"[^>]+autocomplete="new-password"/);
  assert.match(ui,/id="ryAccountHolder"[^>]+autocomplete="off"/);
});

test('마이그레이션은 Vault·RLS·관리자 전용 RPC와 무내용 감사기록을 함께 둔다',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261010051525_royalty_payment_accounts.sql',import.meta.url),'utf8');
  for(const token of ['vault.create_secret','vault.update_secret','vault.decrypted_secrets','enable row level security','private.require_royalty_account_admin','revoke all on function','ACCOUNT_NOT_VERIFIED'])assert.ok(sql.includes(token));
  assert.match(sql,/royalty_payment_account_events[\s\S]+actor_email text not null,[\s\S]+happened_at timestamptz/);
});
