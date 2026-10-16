(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.OperationsHubModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SOURCE_EXPECTATIONS=[
    {id:'naver_mail',label:'네이버 메일',scope:'영수증·첨부 근거 후보',aliases:['naver_mail','naver-mail','네이버메일']},
    {id:'google_chat',label:'Google Chat',scope:'업무 메모 근거 · 거래 확정 아님',aliases:['google_chat','google-chat','googlechat','구글챗']},
    {id:'google_calendar',label:'Google 캘린더',scope:'일정 조회 · 등록·수정 권한 별도 확인',aliases:['google_calendar','google-calendar','googlecalendar','구글캘린더']},
    {id:'smartstore',label:'스마트스토어',scope:'주문 수집 · 채널 재고 쓰기 별도',aliases:['smartstore','smart-store','스마트스토어']},
    {id:'payhere',label:'PayHere',scope:'매출 파일 검토 · 예약 API 미연결',aliases:['payhere','페이히어']},
    {id:'naver_settlement',label:'네이버 정산 후보',scope:'정산 후보 보고 · 은행 확정 아님',aliases:['naver_settlement','settlement_candidate','네이버정산']},
    {id:'homepage',label:'홈페이지',scope:'주문·신청·문의 원본',aliases:['homepage','website','홈페이지']},
  ];
  const SUCCESS=new Set(['success','succeeded','completed','complete','applied','ok']);
  const FAILURE=new Set(['failed','failure','error','partial','needs_review','blocked']);
  const STATE_LABELS={healthy:'자동 확인',review:'검토 필요',failed:'재시도 필요',waiting:'수집 대기',unknown:'미확인'};
  const PRIORITY={failed:5,review:4,waiting:3,unknown:2,healthy:1};

  const norm=value=>String(value??'').toLowerCase().replace(/[\s_\-·/]+/g,'');
  const timestamp=row=>row?.completed_at||row?.started_at||row?.created_at||'';
  const timeValue=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0};
  const connectorKey=row=>String(row?.code||row?.connector_code||row?.id||'');
  const runKey=row=>String(row?.connector_code||row?.code||'');
  const runState=row=>{
    const value=String(row?.status||'').toLowerCase();
    if(SUCCESS.has(value))return 'healthy';
    if(FAILURE.has(value))return 'failed';
    if(value==='running'||value==='reserved'||value==='pending')return 'review';
    return 'unknown';
  };
  const worst=states=>states.reduce((current,state)=>(PRIORITY[state]||0)>(PRIORITY[current]||0)?state:current,'healthy');

  function matchesExpectation(connector,expectation){
    const value=norm([connectorKey(connector),connector?.name].filter(Boolean).join(' '));
    return expectation.aliases.some(alias=>value.includes(norm(alias)));
  }

  function latestRuns(rows=[]){
    return [...rows].filter(Boolean).sort((a,b)=>timeValue(timestamp(b))-timeValue(timestamp(a)));
  }

  function collectorSourceRow(expectation,connector,status,now,statusStale=false){
    if(!status)return null;
    const failed=status.status==='failed';
    const successAt=status.last_success_at||'';
    let state=failed?'failed':now-timeValue(successAt)>26*60*60*1000?'review':'healthy';
    let detail=failed?'마지막 읽기 수집이 실패했습니다.':state==='healthy'?'최근 읽기 수집에 성공했습니다.':'마지막 읽기 성공 확인이 오래됐습니다.';
    if(Number.isInteger(status.evidence_total)&&status.evidence_total>=0)detail+=` · 누적 근거 ${status.evidence_total}건`;
    if(statusStale){
      if(state==='healthy')state='review';
      detail='연결 상태 조회 실패 · 아래는 이전 확인본입니다.';
    }
    return {
      id:expectation.id,label:connector?.name||expectation.label,scope:expectation.scope||connector?.purpose||'',state,stateLabel:STATE_LABELS[state],detail,
      lastSuccess:successAt,lastFailure:status.last_failure_at||'',
      nextAction:connector?.next_action||(failed?'Mac mini 수집 로그와 원본 읽기 연결을 확인합니다.':''),connector:connector||null,
    };
  }

  function sourceRow(expectation,connector,runs,now,runsStale=false,collectorStatus=null,collectorStatusStale=false){
    const collected=collectorSourceRow(expectation,connector,collectorStatus,now,collectorStatusStale);
    if(collected)return collected;
    if(!connector){
      return {id:expectation.id,label:expectation.label,scope:expectation.scope||'',state:'waiting',stateLabel:STATE_LABELS.waiting,detail:'연결 기록 없음',lastSuccess:'',lastFailure:'',nextAction:'읽기 범위와 계정 승인이 필요합니다.',connector:null};
    }
    const key=connectorKey(connector),related=latestRuns(runs.filter(row=>norm(runKey(row))===norm(key)));
    const successful=related.find(row=>runState(row)==='healthy');
    const failed=related.find(row=>runState(row)==='failed');
    const latest=related[0];
    const status=String(connector.status||'').toLowerCase();
    let state='unknown',detail='연결 정보는 있지만 실행 이력이 없습니다.';
    if(status==='manual'||status==='setup_required'||status==='disabled'){
      state='waiting';detail=status==='manual'?'사람이 자료를 넣어야 합니다.':'연결 설정이 필요합니다.';
    }else if(status==='attention'){
      state='review';detail='연결 상태를 사람이 확인해야 합니다.';
    }else if(status==='connected'){
      if(latest&&runState(latest)==='failed'){
        state='failed';detail='마지막 실행이 실패 또는 부분 실패입니다.';
      }else if(successful||connector.last_success_at){
        const at=timestamp(successful)||connector.last_success_at;
        state=now-timeValue(at)>26*60*60*1000?'review':'healthy';
        detail=state==='healthy'?'최근 성공 이력이 있습니다.':'마지막 성공 확인이 오래됐습니다.';
      }
    }
    if(runsStale){
      if(state==='healthy')state='review';
      detail='연결·실행 상태 조회 실패 · 아래는 이전 확인본입니다.';
    }
    return {
      id:expectation.id,label:connector.name||expectation.label,scope:expectation.scope||connector.purpose||'',state,stateLabel:STATE_LABELS[state],detail,
      lastSuccess:timestamp(successful)||connector.last_success_at||'',
      lastFailure:timestamp(failed)||connector.last_failure_at||connector.last_error_at||'',
      nextAction:connector.next_action||'',connector,
    };
  }

  function buildSources(connectors=[],runs=[],now=Date.now(),runsStale=false,collectorStatuses=[],collectorStatusStale=false){
    const used=new Set();
    const expected=SOURCE_EXPECTATIONS.map(expectation=>{
      const connector=connectors.find(row=>!used.has(row)&&matchesExpectation(row,expectation));
      if(connector)used.add(connector);
      const collectorStatus=collectorStatuses.find(row=>norm(row?.connector_code)===norm(expectation.id));
      return sourceRow(expectation,connector,runs,now,runsStale,collectorStatus,collectorStatusStale);
    });
    const extra=connectors.filter(row=>!used.has(row)).map(row=>sourceRow({id:connectorKey(row)||row.name,label:row.name||connectorKey(row),scope:row.purpose||'',aliases:[]},row,runs,now,runsStale));
    return [...expected,...extra];
  }

  function buildStages({sources,stats={},scm={},royalty={}}){
    const collectionState=worst(sources.map(row=>row.state));
    const reviewState=stats.issues==null||stats.mappings==null?'unknown':stats.issues>0?'review':'healthy';
    const ledgerState=scm.error?'failed':!scm.available?'unknown':scm.stale?'review':stats.movements==null?'unknown':'healthy';
    const channelSources=sources.filter(row=>['smartstore','payhere'].includes(row.id));
    const outboundReady=channelSources.length>0&&channelSources.every(row=>row.connector&&['outbound','two_way'].includes(row.connector.data_direction)&&row.state==='healthy');
    const channelState=outboundReady?'healthy':'waiting';
    const settlementState=royalty.error?'failed':!royalty.available?'unknown':'review';
    return [
      {id:'collection',step:'01',title:'원천 수집',state:collectionState,stateLabel:STATE_LABELS[collectionState],detail:`${sources.filter(x=>x.state==='healthy').length}곳 최근 성공 · ${sources.filter(x=>x.state!=='healthy').length}곳 확인 필요`},
      {id:'review',step:'02',title:'증빙·중복 검사',state:reviewState,stateLabel:STATE_LABELS[reviewState],detail:stats.issues==null?'열린 불일치 수 미확인':`상품 연결 ${stats.mappings??'미확인'}건 · 열린 불일치 ${stats.issues}건`},
      {id:'ledger',step:'03',title:'SCM 기준 원장',state:ledgerState,stateLabel:STATE_LABELS[ledgerState],detail:scm.error?'SCM 조회 실패':!scm.available?'SCM 조회 전':scm.stale?'이전 정상본 표시 중':`입출고 기록 ${stats.movements??'미확인'}건`},
      {id:'channel',step:'04',title:'채널 재고',state:channelState,stateLabel:STATE_LABELS[channelState],detail:outboundReady?'승인된 양방향 실행 이력 있음':'자동 재고 쓰기 확인 안 됨'},
      {id:'settlement',step:'05',title:'월 정산 검토자료',state:settlementState,stateLabel:STATE_LABELS[settlementState],detail:royalty.error?'인세 원본 조회 실패':!royalty.available?'인세 원본 조회 전':`${royalty.bookCount??0}건 기준정보 · 지급 확정 아님`},
    ];
  }

  function buildQueue({sources,stats={},scm={},royalty={},stages}){
    const rows=[];
    for(const source of sources){
      if(source.state==='failed')rows.push({level:'failed',title:`${source.label} 재시도`,detail:source.detail,action:source.nextAction||'같은 실행 키로 마지막 실패 단계부터 다시 확인합니다.'});
      else if(source.state==='review')rows.push({level:'review',title:`${source.label} 확인`,detail:source.detail,action:source.nextAction||'원본과 마지막 성공·실패 시각을 대조합니다.'});
      else if(source.state==='waiting'&&['naver_mail','google_chat','google_calendar','smartstore','payhere','naver_settlement'].includes(source.id))rows.push({level:'waiting',title:`${source.label} 수집 대기`,detail:source.detail,action:source.nextAction||'읽기 범위·권한·주기를 승인한 뒤 연결합니다.'});
    }
    if(Number(stats.issues)>0)rows.push({level:'review',title:`열린 불일치 ${stats.issues}건`,detail:'확정 매출·재고·정산으로 자동 승격하지 않았습니다.',action:'원천 증빙과 SKU·거래 종류를 대조합니다.'});
    if(scm.stale)rows.push({level:'review',title:'SCM 이전 정상본 확인',detail:'최근 원본 조회가 실패해 마지막 정상 값을 표시합니다.',action:'원본 연결을 복구한 뒤 다시 불러옵니다.'});
    if(royalty.error)rows.push({level:'failed',title:'인세 원본 다시 확인',detail:'정산 검토자료를 최신 상태로 읽지 못했습니다.',action:'실제 지급을 표시하지 말고 읽기 연결부터 복구합니다.'});
    if(stages.find(row=>row.id==='channel')?.state!=='healthy')rows.push({level:'waiting',title:'채널 재고 자동 반영 미승인',detail:'SCM과 채널의 차이를 자동으로 쓰는 경로가 확인되지 않았습니다.',action:'채널별 읽기 비교와 dry-run 파일럿을 먼저 승인합니다.'});
    rows.push({level:'review',title:'정산 규칙 원본 확인',detail:'개인·계약·판본별 예외를 공개 코드의 기본 비율로 추정하지 않습니다.',action:'비공개 규칙 버전과 적용 기간이 연결되기 전에는 검토로 남깁니다.'});
    return rows;
  }

  function buildRecentRuns(runs=[],connectors=[]){
    const names=new Map(connectors.map(row=>[norm(connectorKey(row)),row.name||connectorKey(row)]));
    return latestRuns(runs).slice(0,8).map(row=>{
      const state=runState(row),key=runKey(row);
      return {
        connector:key,label:names.get(norm(key))||key||'연결 미확인',state,stateLabel:STATE_LABELS[state],at:timestamp(row),
        received:Number.isFinite(Number(row.records_received))?Number(row.records_received):null,
        applied:Number.isFinite(Number(row.records_applied))?Number(row.records_applied):null,
        rejected:Number.isFinite(Number(row.records_rejected))?Number(row.records_rejected):null,
      };
    });
  }

  function buildOperationsHub(input={}){
    const connectors=Array.isArray(input.connectors)?input.connectors:[],runs=Array.isArray(input.runs)?input.runs:[],now=Number(input.now)||Date.now();
    const collectorStatuses=Array.isArray(input.collectorStatuses)?input.collectorStatuses:[];
    const sources=buildSources(connectors,runs,now,Boolean(input.runsStale||input.sourcesStale),collectorStatuses,Boolean(input.collectorStatusStale)),stages=buildStages({sources,stats:input.stats,scm:input.scm,royalty:input.royalty});
    const metrics={healthy:stages.filter(x=>x.state==='healthy').length,review:stages.filter(x=>x.state==='review').length,failed:stages.filter(x=>x.state==='failed').length,waiting:stages.filter(x=>x.state==='waiting'||x.state==='unknown').length};
    return {sources,stages,metrics,queue:buildQueue({sources,stats:input.stats,scm:input.scm,royalty:input.royalty,stages}),recentRuns:buildRecentRuns(runs,connectors)};
  }

  return {SOURCE_EXPECTATIONS,STATE_LABELS,buildSources,buildOperationsHub,runState};
});
