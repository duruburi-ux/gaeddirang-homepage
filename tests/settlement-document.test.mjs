import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';

const require=createRequire(import.meta.url);
const M=require('../admin/settlement-document-model.js');
const fakeFile={name:'가상팀_8·9월_정산.pdf',type:'application/pdf',size:120000};
const base={category:'internal_team',subject:'가상팀',title:'8·9월 정산 상세',periodStart:'2026-08-01',periodEnd:'2026-09-30',periodLabel:'2026년 8~9월',notes:'가상 검증용'};

test('정산 문서는 구분·기간·대상·제목과 허용 파일을 모두 요구한다',()=>{
  const ok=M.validateDraft(base,fakeFile);
  assert.equal(ok.ok,true);
  assert.equal(ok.draft.mimeType,'application/pdf');
  assert.equal(ok.draft.fileName,'가상팀_8·9월_정산.pdf');
  const bad=M.validateDraft({...base,category:'',periodLabel:'',periodStart:'2026-10-01',periodEnd:'2026-09-30'},null);
  assert.equal(bad.ok,false);
  assert.match(bad.errors.join(' '),/분류/);
  assert.match(bad.errors.join(' '),/기간/);
  assert.match(bad.errors.join(' '),/파일/);
});

test('허용되지 않은 형식과 20MB 초과 파일을 차단한다',()=>{
  assert.equal(M.validateDraft(base,{name:'가상정산.txt',type:'text/plain',size:100}).ok,false);
  assert.equal(M.validateDraft(base,{name:'가상정산.pdf',type:'application/pdf',size:M.MAX_FILE_BYTES+1}).ok,false);
});

test('계산 JSON과 무결성 Markdown을 검토자료로 보관할 수 있다',()=>{
  const json=M.validateDraft(base,{name:'가상_계산결과.json',type:'application/json',size:2048});
  const markdown=M.validateDraft(base,{name:'가상_무결성목록.md',type:'text/markdown',size:1024});
  assert.equal(json.ok,true);
  assert.equal(json.draft.mimeType,'application/json');
  assert.equal(markdown.ok,true);
  assert.equal(markdown.draft.mimeType,'text/markdown');
});

test('이전 버전은 같은 구분·대상·기간·제목에만 연결한다',()=>{
  const previous={category:'internal_team',subject:'가상팀',title:'8·9월 정산 상세',period_label:'2026년 8~9월'};
  assert.equal(M.canReplace(previous,M.validateDraft(base,fakeFile).draft),true);
  assert.equal(M.canReplace(previous,M.validateDraft({...base,subject:'다른 가상팀'},fakeFile).draft),false);
  assert.equal(M.canReplace(previous,M.validateDraft({...base,category:'company_report'},fakeFile).draft),false);
  assert.equal(M.canReplace(previous,M.validateDraft({...base,title:'다른 가상 문서'},fakeFile).draft),false);
});

test('미리보기는 실명·실금액 없이 세 구분과 세 상태를 보여 준다',()=>{
  const rows=M.previewRows();
  assert.deepEqual(new Set(rows.map(row=>row.category)),new Set(Object.keys(M.CATEGORIES)));
  assert.deepEqual(new Set(rows.map(row=>row.status)),new Set(Object.keys(M.STATUSES)));
  assert.equal(rows.every(row=>row.subject.startsWith('가상')),true);
  assert.equal(rows.every(row=>!('amount' in row)&&!('account_number' in row)),true);
});

test('자료실 코드는 브라우저 저장소·공개 URL·서비스 키를 사용하지 않는다',()=>{
  const ui=readFileSync(new URL('../admin/docs-settlement-archive.js',import.meta.url),'utf8');
  const sql=readFileSync(new URL('../supabase/migrations/20261010064138_settlement_document_archive.sql',import.meta.url),'utf8');
  assert.equal(/localStorage\.(?:setItem|getItem)/.test(ui),false);
  assert.equal(ui.includes('getPublicUrl'),false);
  assert.equal(ui.includes('service_role'),false);
  assert.match(ui,/createSignedUrl\(row\.storage_path,60/);
  assert.match(sql,/public\s*=\s*false/);
  assert.match(sql,/revoke all privileges on table public\.settlement_documents/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/settlement_documents_admin_read/);
  assert.match(sql,/status = 'superseded'/);
  assert.match(sql,/unique index settlement_documents_sha256_key/);
  assert.match(sql,/DOCUMENT_DUPLICATE_FILE/);
  assert.match(sql,/'application\/json'/);
  assert.match(sql,/'text\/markdown'/);
  assert.doesNotMatch(sql,/libfile_|2026Q3_/);
});
