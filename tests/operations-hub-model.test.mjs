import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../admin/operations-hub-model.js',import.meta.url),'utf8');
const sandbox={};vm.runInNewContext(source,sandbox);const M=sandbox.OperationsHubModel;
const now=Date.parse('2026-10-11T06:00:00Z');

test('캘린더는 연결 근거가 없으면 수집 대기이며 최근 성공과 오래된 기록을 구분한다',()=>{
  const empty=M.buildOperationsHub({now});
  const missing=empty.sources.find(row=>row.id==='google_calendar');
  assert.equal(missing.state,'waiting');
  assert.match(missing.scope,/등록·수정 권한 별도/);
  assert.ok(empty.queue.some(row=>row.title==='Google 캘린더 수집 대기'));
  const connected={code:'google_calendar',status:'connected',last_success_at:'2026-10-11T05:00:00Z'};
  assert.equal(M.buildSources([connected],[],now).find(row=>row.id==='google_calendar').state,'healthy');
  assert.equal(M.buildSources([connected],[],now+27*60*60*1000).find(row=>row.id==='google_calendar').state,'review');
  assert.equal(M.buildSources([connected],[],now,true).find(row=>row.id==='google_calendar').state,'review');
});

test('통합 운영 모델은 최근 실패를 성공으로 덮지 않고 미연결 원천을 수집 대기로 둔다',()=>{
  const model=M.buildOperationsHub({
    now,
    connectors:[
      {code:'homepage',name:'홈페이지',status:'connected',sync_mode:'scheduled',data_direction:'inbound'},
      {code:'smartstore',name:'스마트스토어',status:'connected',sync_mode:'scheduled',data_direction:'inbound'},
      {code:'payhere',name:'PayHere',status:'manual',sync_mode:'manual',data_direction:'inbound'},
    ],
    runs:[
      {connector_code:'smartstore',status:'partial',completed_at:'2026-10-11T05:00:00Z',records_received:4,records_applied:3,records_rejected:1},
      {connector_code:'smartstore',status:'success',completed_at:'2026-10-11T04:00:00Z',records_received:3,records_applied:3,records_rejected:0},
      {connector_code:'homepage',status:'success',completed_at:'2026-10-11T05:30:00Z',records_received:2,records_applied:2,records_rejected:0},
    ],
    stats:{mappings:12,movements:30,issues:2,settlements:5},
    scm:{available:true,stale:false},
    royalty:{available:true,stale:false,bookCount:3},
  });
  const sourceById=Object.fromEntries(model.sources.map(row=>[row.id,row]));
  assert.equal(sourceById.smartstore.state,'failed');
  assert.equal(sourceById.smartstore.lastSuccess,'2026-10-11T04:00:00Z');
  assert.equal(sourceById.smartstore.lastFailure,'2026-10-11T05:00:00Z');
  assert.equal(sourceById.naver_mail.state,'waiting');
  assert.equal(sourceById.google_chat.state,'waiting');
  assert.deepEqual(Object.fromEntries(model.stages.map(row=>[row.id,row.state])),{collection:'failed',review:'review',ledger:'healthy',channel:'waiting',settlement:'review'});
  assert.equal(model.recentRuns[0].state,'healthy');
  assert.ok(model.queue.some(row=>row.title==='스마트스토어 재시도'));
  assert.ok(model.queue.some(row=>row.title==='열린 불일치 2건'));
  assert.ok(model.queue.some(row=>row.title==='채널 재고 자동 반영 미승인'));
});

test('부분 조회 실패와 없는 값은 0건 정상 대신 미확인·재시도로 남는다',()=>{
  const model=M.buildOperationsHub({now,connectors:[],runs:[],stats:{mappings:null,movements:null,issues:null,settlements:null},scm:{available:false,error:'SCM 조회 실패'},royalty:{available:false,error:'인세 원본 조회 실패'}});
  const stages=Object.fromEntries(model.stages.map(row=>[row.id,row]));
  assert.equal(stages.review.state,'unknown');
  assert.match(stages.review.detail,/미확인/);
  assert.equal(stages.ledger.state,'failed');
  assert.equal(stages.settlement.state,'failed');
  assert.ok(model.queue.some(row=>row.title==='인세 원본 다시 확인'));
  assert.equal(model.recentRuns.length,0);
});

test('채널 재고 단계는 승인된 양방향 연결과 최근 성공이 모두 있을 때만 자동 확인이다',()=>{
  const connectors=[
    {code:'smartstore',name:'스마트스토어',status:'connected',data_direction:'two_way'},
    {code:'payhere',name:'PayHere',status:'connected',data_direction:'two_way'},
  ];
  const runs=connectors.map((row,index)=>({connector_code:row.code,status:'success',completed_at:`2026-10-11T05:0${index}:00Z`}));
  const model=M.buildOperationsHub({now,connectors,runs,stats:{mappings:1,movements:1,issues:0,settlements:0},scm:{available:true,stale:false},royalty:{available:true,stale:false,bookCount:1}});
  assert.equal(model.stages.find(row=>row.id==='channel').state,'healthy');
  assert.ok(!model.queue.some(row=>row.title==='채널 재고 자동 반영 미승인'));
});

test('실행 이력 조회 실패 시 이전 성공본을 자동 확인으로 표시하지 않는다',()=>{
  const model=M.buildOperationsHub({
    now,
    runsStale:true,
    connectors:[{code:'smartstore',name:'스마트스토어',status:'connected',data_direction:'inbound'}],
    runs:[{connector_code:'smartstore',status:'success',completed_at:'2026-10-11T05:00:00Z'}],
    stats:{mappings:1,movements:1,issues:0,settlements:0},
    scm:{available:true,stale:false},
    royalty:{available:true,stale:false,bookCount:1},
  });
  const source=model.sources.find(row=>row.id==='smartstore');
  assert.equal(source.state,'review');
  assert.match(source.detail,/이전 확인본/);
});

test('조회 실패는 성공 이력이 오래됐어도 이전 확인본임을 숨기지 않는다',()=>{
  const model=M.buildOperationsHub({
    now,
    sourcesStale:true,
    connectors:[{code:'homepage',name:'홈페이지',status:'connected',data_direction:'inbound'}],
    runs:[{connector_code:'homepage',status:'success',completed_at:'2026-10-09T05:00:00Z'}],
    stats:{mappings:1,movements:1,issues:0,settlements:0},
    scm:{available:true,stale:false},
    royalty:{available:true,stale:false,bookCount:1},
  });
  const source=model.sources.find(row=>row.id==='homepage');
  assert.equal(source.state,'review');
  assert.match(source.detail,/이전 확인본/);
});

test('조회 실패는 이전 실패 상태에도 이전 확인본 표시를 남긴다',()=>{
  const model=M.buildOperationsHub({
    now,
    collectorStatusStale:true,
    collectorStatuses:[{connector_code:'google_chat',status:'failed',last_success_at:'2026-10-10T05:00:00Z',last_failure_at:'2026-10-11T05:30:00Z',evidence_total:0,error_code:'COLLECTOR_EXIT_7'}],
    connectors:[],runs:[],
    stats:{mappings:1,movements:1,issues:0,settlements:0},
    scm:{available:true,stale:true},
    royalty:{available:true,stale:false,bookCount:1},
  });
  const source=model.sources.find(row=>row.id==='google_chat');
  assert.equal(source.state,'failed');
  assert.match(source.detail,/이전 확인본/);
});

test('SCM 연결상태의 최근 수집 성공은 수동 커넥터보다 우선해 읽기 연결을 자동 확인한다',()=>{
  const model=M.buildOperationsHub({
    now,
    connectors:[{code:'naver_mail',name:'네이버 메일',status:'manual',data_direction:'inbound'}],
    runs:[],
    collectorStatuses:[{connector_code:'naver_mail',status:'success',last_success_at:'2026-10-11T05:00:00Z',last_failure_at:'',evidence_total:4}],
    stats:{mappings:1,movements:1,issues:0,settlements:0},scm:{available:true,stale:false},royalty:{available:true,stale:false,bookCount:1},
  });
  const source=model.sources.find(row=>row.id==='naver_mail');
  assert.equal(source.state,'healthy');
  assert.equal(source.lastSuccess,'2026-10-11T05:00:00Z');
  assert.match(source.detail,/누적 근거 4건/);
});

test('수집 실패는 이전 근거가 0건이어도 정상으로 표시하지 않고 마지막 성공을 보존한다',()=>{
  const model=M.buildOperationsHub({
    now,
    connectors:[],runs:[],
    collectorStatuses:[{connector_code:'google_chat',status:'failed',last_success_at:'2026-10-10T05:00:00Z',last_failure_at:'2026-10-11T05:30:00Z',evidence_total:0,error_code:'COLLECTOR_EXIT_7'}],
    stats:{mappings:1,movements:1,issues:0,settlements:0},scm:{available:true,stale:false},royalty:{available:true,stale:false,bookCount:1},
  });
  const source=model.sources.find(row=>row.id==='google_chat');
  assert.equal(source.state,'failed');
  assert.equal(source.lastSuccess,'2026-10-10T05:00:00Z');
  assert.equal(source.lastFailure,'2026-10-11T05:30:00Z');
  assert.ok(model.queue.some(row=>row.title==='Google Chat 재시도'));
});

test('연결상태 조회가 이전 정상본이면 최근 성공도 자동 확인으로 단정하지 않는다',()=>{
  const model=M.buildOperationsHub({now,collectorStatusStale:true,collectorStatuses:[{connector_code:'naver_mail',status:'success',last_success_at:'2026-10-11T05:00:00Z',last_failure_at:'',evidence_total:0}],connectors:[],runs:[],stats:{mappings:1,movements:1,issues:0,settlements:0},scm:{available:true,stale:true},royalty:{available:true,stale:false,bookCount:1}});
  const source=model.sources.find(row=>row.id==='naver_mail');
  assert.equal(source.state,'review');
  assert.match(source.detail,/이전 확인본/);
});
