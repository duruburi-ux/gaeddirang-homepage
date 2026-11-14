(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TeamDashboardModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=value=>String(value??'').trim();
  const stateLabel={current:'최근 읽기 성공',stale:'이전 성공본',partial:'일부 확인',failed:'조회 실패',access_denied:'권한 확인 필요',not_checked:'확인 전'};
  const sourceLabel={team:'팀 업무',work:'팀 업무·대표 결정',management:'도서 운영',scm:'SCM·위탁',orders:'주문 수집'};
  const readFieldStateLabel={empty:'미입력',unavailable:'미제공(구형 응답 또는 필드 없음)',invalid:'형식 확인 필요'};
  function metadataModel(){if(globalThis.ReadMetadataModel)return globalThis.ReadMetadataModel;if(typeof require==='function'){try{return require('./read-metadata-model.js')}catch{}}return null}
  function taskMetadata(row,now,duplicate=false){
    if(!row||!['sourceReference','workReference','observation'].some(key=>Object.hasOwn(row,key)))return {};
    return {readMetadata:metadataModel()?.task?.(row,{sourceKey:'team.tasks',id:row.sourceId,relationKey:'workReference',duplicate,now})||{identity:{state:'unavailable',label:'원본 신원 확인 필요',id:null},relation:{state:'unresolved',label:'대응 원본 확인 필요',reason:'METADATA_TOOL_UNAVAILABLE'},observation:{state:'unknown',label:'원천 관측 시각 미확인',value:null}}};
  }
  function snapshotMetadata(row){
    const value=row?.readMetadata;if(!value||typeof value!=='object')return {};
    return {readMetadata:{identity:{state:text(value.identity?.state),label:text(value.identity?.label),id:value.identity?.id??null},relation:{state:text(value.relation?.state),label:text(value.relation?.label),reason:value.relation?.reason??null},observation:{state:text(value.observation?.state),label:text(value.observation?.label),value:value.observation?.value??null}}};
  }
  function readStringField(row,key){
    if(!row||!Object.hasOwn(row,key))return {value:'',state:'unavailable'};
    if(typeof row[key]!=='string')return {value:'',state:'invalid'};
    const value=row[key].trim();return {value,state:value?'provided':'empty'};
  }
  function safeSourceUrl(value){
    if(typeof value!=='string'||value.length>2000||!/^https?:\/\//i.test(value)||/[\s\u0000-\u001f\u007f-\u009f]/u.test(value)||value.includes('\\')||/%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(value))return '';
    if(value.match(/^https?:\/\/([^/?#]*)/i)?.[1].includes('@'))return '';
    try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.hostname&&!url.username&&!url.password&&url.href.length<=2000?url.href:''}catch{return ''}
  }
  function legacyNextAction(value){
    const text=typeof value==='string'?value.replace(/\s+/g,' ').trim():'',label=/다음\s*행동\s*[:：]\s*/.exec(text);
    if(!label)return '';
    const rest=text.slice(label.index+label[0].length),stop=/(?:^|\s)(?:완료\s*기준|근거|범위)\s*[:：]/.exec(rest);
    return rest.slice(0,stop?stop.index:rest.length).trim().slice(0,140);
  }
  function readTaskFields(row={}){
    if(!row||typeof row!=='object'||Array.isArray(row))row={};
    const role=readStringField(row,'assigneeRole'),action=readStringField(row,'nextAction'),source=readStringField(row,'sourceUrl');
    if(action.state==='unavailable'){const legacy=legacyNextAction(row.definition);if(legacy){action.value=legacy;action.state='legacy'}}
    if(source.state==='provided'||source.state==='empty'&&row.sourceUrl!==''){source.value=safeSourceUrl(row.sourceUrl);source.state=source.value?'provided':'invalid'}
    return {readFields:true,assigneeRole:role.value,assigneeRoleState:role.state,nextAction:action.value,nextActionState:action.state,sourceUrl:source.value,sourceUrlState:source.state};
  }
  const validSourceId=value=>typeof value==='string'&&/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(value);
  const timestamp=value=>typeof value==='string'&&value.trim()===value&&value?Date.parse(value):NaN;
  const iso=value=>Number.isFinite(timestamp(value))?new Date(timestamp(value)).toISOString():'';
  function supplementIndex(snapshot,operations){
    const workCounts=new Map(),sourceCounts=new Map(),sourceById=new Map(),rows=Array.isArray(operations?.datasets?.team?.tasks)?operations.datasets.team.tasks:[];
    for(const row of snapshot?.records||[])if(validSourceId(row?.sourceId))workCounts.set(row.sourceId,(workCounts.get(row.sourceId)||0)+1);
    for(const row of rows)if(validSourceId(row?.sourceId)){sourceCounts.set(row.sourceId,(sourceCounts.get(row.sourceId)||0)+1);sourceById.set(row.sourceId,row)}
    return {workCounts,sourceCounts,sourceById,source:operations?.sources?.team,available:Array.isArray(operations?.datasets?.team?.tasks)};
  }
  function readSupplement(row,snapshot,index,now){
    const source=index.source,sourceRow=index.sourceById.get(row.sourceId),workAt=timestamp(snapshot?.fetchedAt),sourceAt=timestamp(source?.lastSuccessAt);
    const result={state:'unlinked',reason:'no_match',sourceReadState:text(source?.readState)||'not_checked',lastSuccessAt:iso(source?.lastSuccessAt),lastAttemptAt:iso(source?.lastAttemptAt),sourceEditedAt:iso(sourceRow?.lastEditedAt),workFetchedAt:iso(snapshot?.fetchedAt),notes:[],difference:{nextAction:'not_comparable'}};
    const unlinked=reason=>({...result,reason});
    if(!validSourceId(row.sourceId))return unlinked('invalid_work_id');
    if(index.workCounts.get(row.sourceId)!==1)return unlinked('duplicate_work_id');
    if(!index.available||!source||!['current','stale'].includes(source.readState))return unlinked('source_unavailable');
    if((index.sourceCounts.get(row.sourceId)||0)>1)return unlinked('duplicate_source_id');
    if(!sourceRow)return unlinked('no_match');
    const sourceMetadata=taskMetadata(sourceRow,now).readMetadata;
    if(row.readMetadata||sourceMetadata)return unlinked('unresolved_reference');
    if(!Number.isFinite(workAt)||!Number.isFinite(sourceAt)||!Number.isFinite(now))return unlinked('invalid_time');
    if(workAt>now||sourceAt>now)return unlinked('future_time');
    if(now-workAt>=600000)return unlinked('work_expired');
    if(now-sourceAt>=600000)return unlinked('source_expired');
    // Equal page IDs in different source scopes are not verified relations.
    // Current readers provide no validated cross-source relation contract.
    return unlinked('unresolved_reference');
  }
  function sourceRows(operations,workSnapshot){
    const rows=Object.entries(operations?.sources||{}).filter(([key])=>!(workSnapshot&&key==='team')).map(([key,row])=>({
      key,label:sourceLabel[key]||key,state:text(row?.readState)||'not_checked',stateLabel:stateLabel[row?.readState]||'확인 전',lastSuccessAt:text(row?.lastSuccessAt),errorCode:text(row?.errorCode),bad:!['current'].includes(row?.readState)
    }));
    if(workSnapshot)rows.unshift({key:'work',label:sourceLabel.work,state:workSnapshot.stale?'stale':'current',stateLabel:workSnapshot.stale?stateLabel.stale:stateLabel.current,lastSuccessAt:text(workSnapshot.fetchedAt),errorCode:workSnapshot.stale?'최근 조회 확인 필요':'',bad:workSnapshot.stale===true,...(workSnapshot.readMetadata?{readMetadata:workSnapshot.readMetadata}:{})});
    return rows;
  }
  function operationTasks(operations,now){
    const rows=operations?.datasets?.team?.tasks||[],api=metadataModel(),counts=new Map();
    for(const row of rows){const id=api?.canonicalId?.(row?.sourceId);if(id)counts.set(id,(counts.get(id)||0)+1)}
    return rows.map(row=>({
      id:text(row.sourceId),kind:'team_task',kindLabel:'팀 업무',title:text(row.title)||'제목 없는 공동 업무',status:text(row.status)||'상태 미확인',due:text(row.teamDue).slice(0,10),updatedAt:text(row.lastEditedAt),assignees:Array.isArray(row.assignees)?row.assignees.map(text).filter(Boolean):[],collaborators:Array.isArray(row.collaborators)?row.collaborators.map(text).filter(Boolean):[],definition:text(row.definition),...readTaskFields(row),...taskMetadata(row,now,(counts.get(api?.canonicalId?.(row.sourceId))||0)>1)
    })).filter(row=>row.id);
  }
  function workTasks(snapshot,operations,now){
    const index=supplementIndex(snapshot,operations);
    return (snapshot?.records||[]).map(row=>({
      id:text(row.sourceId),kind:text(row.sourceType),kindLabel:row.sourceType==='representative_decision'?'대표 결정':'팀 업무',title:text(row.title)||'제목 없는 공동 업무',status:text(row.status)||'상태 미확인',priority:text(row.priority),due:text(row.due).slice(0,10),updatedAt:text(row.updatedAt)||text(row.fetchedAt),assignees:text(row.owner).split(' · ').filter(Boolean),collaborators:[],definition:text(row.next),sourceUrl:safeSourceUrl(row.sourceUrl),attention:row.attention===true,approval:row.approval===true,blocked:row.blocked===true,overdue:row.overdue===true,stale:row.stale===true
      ,...snapshotMetadata(row),...(row.sourceType==='team_task'?{teamReadSupplement:readSupplement(row,snapshot,index,now)}:{})
    })).filter(row=>row.id);
  }
  function build(input={}){
    const core=input.core||{},known=input.coreKnown!==false,hasWork=Boolean(input.workSnapshot),now=Number.isFinite(input.now)?input.now:Date.now(),teamTasks=hasWork?workTasks(input.workSnapshot,input.operations,now):operationTasks(input.operations,now),sources=sourceRows(input.operations,input.workSnapshot);
    const teamReadCoverage={total:0,matched:0,current:0,stale:0,unlinked:0,reasons:{}};
    for(const row of teamTasks){const supplement=row.teamReadSupplement;if(!supplement)continue;teamReadCoverage.total++;teamReadCoverage[supplement.state]++;if(supplement.reason==='matched')teamReadCoverage.matched++;else teamReadCoverage.reasons[supplement.reason]=(teamReadCoverage.reasons[supplement.reason]||0)+1}
    const cohorts=Array.isArray(core.cohorts)?core.cohorts:[],orders=Array.isArray(core.orders)?core.orders:[],apps=Array.isArray(core.applications)?core.applications:[],inquiries=Array.isArray(core.inquiries)?core.inquiries:[];
    const activePrograms=known?cohorts.filter(row=>!/종료|마감/.test(text(row.status))).length:null;
    const pendingOrders=known?orders.filter(row=>!/발송완료|취소/.test(text(row.status))).length:null;
    const pendingApplications=known?apps.filter(row=>!/참석완료|취소|환불/.test(text(row.status))).length:null;
    const waiting=known?pendingOrders+pendingApplications+inquiries.filter(row=>!/완료/.test(text(row.status))).length:null;
    const failed=sources.filter(row=>row.bad).length;
    return {
      tasks:teamTasks,sources,teamReadCoverage,summary:{failed,waiting},lanes:[
        {key:'programs',label:'프로그램',value:activePrograms,note:known?'기수 원본의 진행·모집 상태':'원본 미확인',route:'cohorts',tone:'program'},
        {key:'projects',label:'프로젝트·팀 업무',value:hasWork||input.operations?.datasets?.team?teamTasks.length:null,note:hasWork?`팀 업무 ${teamTasks.filter(row=>row.kind==='team_task').length} · 대표 결정 ${teamTasks.filter(row=>row.kind==='representative_decision').length}`:input.operations?.datasets?.team?'Notion 원본 ID 기준':'연결 확인 필요',route:'work',tone:'team'},
        {key:'orders',label:'주문·신청',value:known?pendingOrders+pendingApplications:null,note:known?'완료·취소 전 처리 건':'원본 미확인',route:'orders',tone:'orders'},
        {key:'inventory',label:'재고·위탁',value:input.operations?.datasets?.scm?.summary?.books??null,note:'장부·채널 관측값, 실재고 아님',route:'scm',tone:'stock'},
        {key:'consignment',label:'위탁 정산',value:null,note:'2026-10-29 검토자료 · 운영 원장 미연결',route:'integration',tone:'settlement',evidence:'기존 후보 4종 / 신규 문의 9종(미입고)'},
        {key:'partners',label:'위탁 연락처',value:null,note:'비공개 대장 준비 중 · 계좌정보 분리',route:'partners',tone:'partners'},
        {key:'grants',label:'지원사업',value:null,note:'로컬 원천 없음 · 자격/진행 분리 설계',route:'integration',tone:'grant'},
        {key:'waiting',label:'확인 대기',value:waiting==null?null:waiting+failed,note:failed?`연결 확인 ${failed}개 포함`:'처리·문의·연결 상태',route:'integration',tone:'waiting'},
        {key:'publishing',label:'홈페이지 공개',value:null,note:'고정 자료 사용 중 · 로컬 승인 흐름 준비',route:'publishing',tone:'publishing'}
      ]
    };
  }
  return {build,stateLabel,readTaskFields,readFieldStateLabel};
});
