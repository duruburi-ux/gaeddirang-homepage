import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../admin/finance-dashboard-model.js',import.meta.url),'utf8');
const browser=readFileSync(new URL('../admin/finance-dashboard.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261012010500_finance_dashboard_private_snapshots.sql',import.meta.url),'utf8');
const sandbox={Intl};vm.runInNewContext(source,sandbox);const M=sandbox.FinanceDashboardModel;

function fixture(){
  const metrics=[
    {key:'income',amount:120000,availability:'verified',status:'confirmed',evidenceIds:['sale-1','transfer-1'],documentIds:[],calculation:[{label:'검증 판매',amount:120000,operator:'='}]},
    {key:'expense',amount:999999,availability:'withheld',status:'review',evidenceIds:[],documentIds:[],note:'중복 근거 부족'},
    {key:'settlement',amount:40000,availability:'verified',status:'confirmed',evidenceIds:['settlement-1'],documentIds:['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']},
  ];
  return {schemaVersion:1,generatedAt:'2026-10-12T01:00:00Z',periods:[{key:'2026-10',label:'2026년 10월',status:'in_progress',sourceAsOf:'2026-10-11',teamAccountBalance:{amount:777777,availability:'pending',note:'은행 근거 미확인'},warnings:['합성 경고'],scopes:[{key:'team',metrics}],evidence:[{id:'sale-1',date:'2026-10-03',label:'합성 판매',amount:120000,kind:'income',source:'합성 원장',status:'verified',included:true,sourceRefHash:'a'.repeat(64)},{id:'transfer-1',date:'2026-10-03',label:'합성 내부 이체',amount:50000,kind:'internal_transfer',source:'합성 원장',status:'excluded',included:false,note:'수입 제외',sourceRefHash:'b'.repeat(64)},{id:'settlement-1',date:'2026-10-04',label:'합성 정산',amount:40000,kind:'settlement',source:'합성 문서',status:'verified',included:true,sourceRefHash:'c'.repeat(64)}],documents:[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'합성 정산서',periodLabel:'2026년 10월',status:'confirmed',versionNo:3}]}]};
}

test('검증된 집계만 금액을 표시하고 보류·미확인 값은 0이나 입력값으로 바꾸지 않는다',()=>{
  const model=M.normalizePayload(fixture());
  assert.equal(M.metric(model,'2026-10','team','income').amount,120000);
  assert.equal(M.metric(model,'2026-10','team','expense').availability,'withheld');
  assert.equal(M.metric(model,'2026-10','team','expense').amount,null);
  assert.equal(M.metric(model,'2026-10','team','received').availability,'pending');
  assert.equal(M.metric(model,'2026-10','team','received').amount,null);
  assert.equal(M.period(model,'2026-10').teamAccountBalance.amount,null);
});

test('내부 이체는 거래 근거에서 제외 상태를 보존하고 합계를 브라우저에서 재계산하지 않는다',()=>{
  const model=M.normalizePayload(fixture()),detail=M.details(model,'2026-10','team','income');
  assert.equal(detail.metric.amount,120000);
  assert.equal(detail.evidence.length,2);
  assert.equal(detail.evidence.find(row=>row.id==='transfer-1').included,false);
  assert.equal(detail.evidence.find(row=>row.id==='transfer-1').status,'excluded');
});

test('확정 정산 계산과 지급 완료를 분리하고 관련 비공개 문서 식별자를 연결한다',()=>{
  const model=M.normalizePayload(fixture()),detail=M.details(model,'2026-10','team','settlement');
  assert.equal(detail.metric.status,'confirmed');
  assert.equal(detail.documents[0].title,'합성 정산서');
  assert.equal(M.period(model,'2026-10').status,'in_progress');
});

test('지원하지 않는 스키마와 빈 기간은 fail-closed 한다',()=>{
  assert.throws(()=>M.normalizePayload({schemaVersion:2,periods:[]}),/FINANCE_SCHEMA_UNSUPPORTED/);
  assert.throws(()=>M.normalizePayload({schemaVersion:1,periods:[]}),/FINANCE_PERIODS_EMPTY/);
});

test('재정 탭은 데스크톱·모바일 메뉴와 세션 정리에 연결되고 브라우저 스크립트가 파싱된다',()=>{
  assert.match(html,/data-tab="finance">재정 현황/);
  assert.match(html,/<option value="finance">재정 현황/);
  assert.match(html,/id="tab-finance"/);
  assert.match(html,/window\.FinanceDashboard\?\.clear\(\)/);
  assert.match(html,/if\(name==='finance'\)window\.FinanceDashboard\?\.refresh\(\)/);
  new vm.Script(source);new vm.Script(browser);
});

test('실데이터는 공개 코드에 넣지 않고 기존 3인 정산 관리자 경계의 읽기 RPC로만 노출한다',()=>{
  assert.match(migration,/alter table public\.finance_dashboard_snapshots enable row level security/);
  assert.match(migration,/revoke all privileges on table public\.finance_dashboard_snapshots\s+from public, anon, authenticated/);
  assert.match(migration,/perform private\.require_settlement_document_admin\(\)/);
  assert.match(migration,/revoke all on function public\.get_finance_dashboard\(\)\s+from public, anon, authenticated/);
  assert.match(migration,/grant execute on function public\.get_finance_dashboard\(\)\s+to authenticated/);
  assert.match(migration,/payload \? 'periods'/);
  assert.match(migration,/jsonb_array_length\(payload -> 'periods'\) > 0/);
  assert.doesNotMatch(migration,/insert\s+into\s+public\.finance_dashboard_snapshots/i);
  for(const file of [source,browser,html,migration])assert.doesNotMatch(file,/\/Users\/[^'"\s]+\/finance-dashboard-source/);
});
