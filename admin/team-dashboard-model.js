(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.TeamDashboardModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const text=value=>String(value??'').trim();
  const stateLabel={current:'최근 읽기 성공',stale:'이전 성공본',partial:'일부 확인',failed:'조회 실패',access_denied:'권한 확인 필요',not_checked:'확인 전'};
  const sourceLabel={team:'팀 업무',work:'팀 업무·대표 결정',management:'도서 운영',scm:'SCM·위탁',orders:'주문 수집'};
  function sourceRows(operations,workSnapshot){
    const rows=Object.entries(operations?.sources||{}).filter(([key])=>!(workSnapshot&&key==='team')).map(([key,row])=>({
      key,label:sourceLabel[key]||key,state:text(row?.readState)||'not_checked',stateLabel:stateLabel[row?.readState]||'확인 전',lastSuccessAt:text(row?.lastSuccessAt),errorCode:text(row?.errorCode),bad:!['current'].includes(row?.readState)
    }));
    if(workSnapshot)rows.unshift({key:'work',label:sourceLabel.work,state:workSnapshot.stale?'stale':'current',stateLabel:workSnapshot.stale?stateLabel.stale:stateLabel.current,lastSuccessAt:text(workSnapshot.fetchedAt),errorCode:workSnapshot.stale?'최근 조회 확인 필요':'',bad:workSnapshot.stale===true});
    return rows;
  }
  function operationTasks(operations){
    return (operations?.datasets?.team?.tasks||[]).map(row=>({
      id:text(row.sourceId),kind:'team_task',kindLabel:'팀 업무',title:text(row.title)||'제목 없는 공동 업무',status:text(row.status)||'상태 미확인',due:text(row.teamDue).slice(0,10),updatedAt:text(row.lastEditedAt),assignees:Array.isArray(row.assignees)?row.assignees.map(text).filter(Boolean):[],collaborators:Array.isArray(row.collaborators)?row.collaborators.map(text).filter(Boolean):[],definition:text(row.definition),sourceUrl:''
    })).filter(row=>row.id);
  }
  function workTasks(snapshot){
    return (snapshot?.records||[]).map(row=>({
      id:text(row.sourceId),kind:text(row.sourceType),kindLabel:row.sourceType==='representative_decision'?'대표 결정':'팀 업무',title:text(row.title)||'제목 없는 공동 업무',status:text(row.status)||'상태 미확인',due:text(row.due).slice(0,10),updatedAt:text(row.fetchedAt),assignees:text(row.owner).split(' · ').filter(Boolean),collaborators:[],definition:'',sourceUrl:text(row.sourceUrl)
    })).filter(row=>row.id);
  }
  function build(input={}){
    const core=input.core||{},known=input.coreKnown!==false,hasWork=Boolean(input.workSnapshot),teamTasks=hasWork?workTasks(input.workSnapshot):operationTasks(input.operations),sources=sourceRows(input.operations,input.workSnapshot);
    const cohorts=Array.isArray(core.cohorts)?core.cohorts:[],orders=Array.isArray(core.orders)?core.orders:[],apps=Array.isArray(core.applications)?core.applications:[],inquiries=Array.isArray(core.inquiries)?core.inquiries:[];
    const activePrograms=known?cohorts.filter(row=>!/종료|마감/.test(text(row.status))).length:null;
    const pendingOrders=known?orders.filter(row=>!/발송완료|취소/.test(text(row.status))).length:null;
    const pendingApplications=known?apps.filter(row=>!/참석완료|취소|환불/.test(text(row.status))).length:null;
    const waiting=known?pendingOrders+pendingApplications+inquiries.filter(row=>!/완료/.test(text(row.status))).length:null;
    const failed=sources.filter(row=>row.bad).length;
    return {
      tasks:teamTasks,sources,summary:{failed,waiting},lanes:[
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
  return {build,stateLabel};
});
