(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ReadMetadataModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const own=(value,key)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.hasOwn(value,key));
  const object=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
  const sourceLabels={'work.rooms':'업무 영역','work.tasks':'실행 업무','work.projects':'프로젝트','work.decisions':'결정할 일','team.tasks':'팀 업무'};
  const relationReasons={NO_VERIFIED_REFERENCE:'검증된 원천 관계 없음',INVALID_SOURCE_ID:'원본 식별자 형식 확인 필요',DUPLICATE_SOURCE_ID:'원본 식별자 중복 · 확인 필요',NOT_TEAM_TASK:'교차 업무 연결 대상 아님'};
  const observationReasons={INVALID_CHECK_TIME:'시각 검사 기준 미확인',HELPER_MISSING:'원래 관측 기록 없음',HELPER_INVALID_TYPE:'관측 기록 형식 확인 필요',ACCUMULATED_HISTORY:'누적 이력 · 단일 관측시각 미확인',HELPER_TRUNCATED:'긴 기록의 일부만 확인됨',NEGATIVE_MARKER:'실패·미확인 표시가 있는 기록',YEAR_MISSING:'원래 기록에 연도 없음',SOURCE_MISSING:'해당 원천 관측 기록 없음',FUTURE_TIMESTAMP:'미래 관측시각 · 확인 필요',INVALID_TIMESTAMP:'관측시각 형식 확인 필요',SUCCESS_UNCONFIRMED:'원래 성공 기록 미확인',FORMAT_UNSUPPORTED:'관측 기록 형식 확인 필요',SUCCESS_RECORD:'같은 기록의 원래 성공시각 확인',READ_FAILED:'선택 읽기 실패 · 관측시각 미확인'};
  const readErrors={OBSERVATION_TIMEOUT:'선택 읽기 제한시간 초과',OBSERVATION_AUTH_FAILED:'선택 읽기 인증 확인 필요',OBSERVATION_ACCESS_DENIED:'선택 읽기 접근 확인 필요',OBSERVATION_READ_FAILED:'선택 읽기 실패',OBSERVATION_SCHEMA_CHANGED:'선택 읽기 응답 형식 확인 필요',SOURCE_NOT_CONFIGURED:'원천 연결 설정 미확인',SOURCE_ACCESS_DENIED:'원천 접근 확인 필요',SOURCE_READ_FAILED:'원천 조회 실패',SOURCE_TOO_LARGE:'조회 범위 초과 · 전체 자료 미확인',SCHEMA_CHANGED:'조회 응답 형식 확인 필요',INVALID_READ_TIME:'조회시각 확인 필요',CACHE_UNAVAILABLE:'사용 가능한 조회본 없음',CLIENT_READ_FAILED:'화면 조회 실패 · 이전 성공본 유지'};
  function canonicalId(value){
    if(typeof value!=='string'||!/^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(value))return null;
    const hex=value.replaceAll('-','').toLowerCase();return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
  }
  function timestamp(value,now=Date.now()){
    if(value===null||value===undefined||value==='')return {state:'missing',value:null};
    if(typeof value!=='string')return {state:'invalid',value:null};
    const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/);
    if(!match)return {state:'invalid',value:null};
    const [,year,month,day,hour,minute,second,,zone]=match,y=Number(year),m=Number(month),d=Number(day),stamp=Date.parse(value);
    if(y<1000||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate()||Number(hour)>23||Number(minute)>59||Number(second)>59||zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59)||!Number.isFinite(stamp)||!Number.isFinite(now))return {state:'invalid',value:null};
    if(stamp>now)return {state:'future',value:null};
    return {state:'known',value:new Date(stamp).toISOString()};
  }
  function task(record={},options={}){
    const {sourceKey,id,relationKey,duplicate=false,now=Date.now()}=options,reference=record?.sourceReference,expectedId=canonicalId(id);
    let identity={state:'unavailable',label:'원본 신원 메타 미제공',id:null};
    if(own(record,'sourceReference')){
      const valid=!duplicate&&object(reference)&&reference.sourceSystem==='notion'&&own(sourceLabels,sourceKey)&&reference.sourceKey===sourceKey&&expectedId&&canonicalId(reference.sourceId)===expectedId;
      identity=valid?{state:'identified',label:'Notion · '+sourceLabels[sourceKey],id:expectedId}:{state:'invalid',label:duplicate?'원본 식별자 중복 · 확인 필요':'원본 신원 메타 확인 필요',id:null};
    }
    const value=record?.[relationKey];let relation={state:'unavailable',label:'관계 메타 미제공',reason:null};
    if(own(record,relationKey)){
      if(object(value)&&value.sourceReference===null&&value.state==='unresolved'&&own(relationReasons,value.reason)&&value.reason!=='NOT_TEAM_TASK')relation={state:'unresolved',label:'관계 미해결 · '+relationReasons[value.reason],reason:value.reason};
      else if(object(value)&&value.sourceReference===null&&value.state==='not_applicable'&&value.reason==='NOT_TEAM_TASK'&&sourceKey!=='work.tasks'&&sourceKey!=='team.tasks')relation={state:'not_applicable',label:relationReasons.NOT_TEAM_TASK,reason:'NOT_TEAM_TASK'};
      else relation={state:'invalid',label:'관계 메타 확인 필요 · 합류 미확인',reason:null};
    }
    let observation={state:'unknown',label:'원래 관측시각 미확인',value:null};
    if(own(record,'observation')&&(!object(record.observation)||record.observation.state!=='unknown'||record.observation.observedAt!==null||record.observation.reason!=='SOURCE_OBSERVATION_NOT_PROVIDED'))observation={state:'invalid',label:'관측시각 메타 확인 필요',value:null};
    return {identity,relation,observation};
  }
  function read(meta={},options={}){
    const now=options.now??Date.now(),value=meta?.read,attempt=timestamp(object(value)?value.lastAttemptAt:null,now);
    let success=timestamp(object(value)?value.lastSuccessAt:meta?.fetchedAt,now);
    let state='unavailable',label='조회 메타 미제공',errorLabel='';
    if(own(meta,'read')){
      const valid=object(value)&&['current','stale','failed'].includes(value.state);
      state=valid?value.state:'invalid';
      const fetched=timestamp(meta?.fetchedAt,now);
      if(valid&&own(meta,'fetchedAt')&&success.state==='known'&&(fetched.state!=='known'||fetched.value!==success.value)){success={state:'invalid',value:null};state='invalid'}
      if(valid&&state==='current'&&(success.state!=='known'||value.errorCode!==null))state='invalid';
      if(valid&&['invalid','future'].includes(success.state)||['invalid','future'].includes(attempt.state))state='invalid';
      if(valid&&state==='current'&&meta?.stale===true)state='stale';
      label={current:'API 조회 성공',stale:'이전 조회본 · 최신 조회 미확인',failed:'API 조회 실패',invalid:'조회 메타 확인 필요'}[state];
      errorLabel=value?.errorCode==null?'':typeof value.errorCode==='string'&&own(readErrors,value.errorCode)?readErrors[value.errorCode]:'조회 오류 유형 미확인';
    }else if(success.state==='known'){state='legacy';label=meta?.stale?'기존 API 이전 조회본':'기존 API 조회시각'}
    return {state,label,attempt,success,errorLabel};
  }
  function management(dataset={},source={},now=Date.now()){
    const available=own(dataset,'collectionRead')||own(dataset,'collectionStatus'),rawRead=dataset?.collectionRead,attempt=timestamp(rawRead?.attemptedAt,now),previous=Boolean(source?.readState&&source.readState!=='current');
    let readState='unavailable',readLabel='C2 선택 읽기 메타 미제공',errorLabel='';
    if(own(dataset,'collectionRead')){
      if(object(rawRead)&&['read_success','read_failed','not_checked'].includes(rawRead.state)){
        readState=rawRead.state;readLabel={read_success:'C2 선택 읽기 성공',read_failed:'C2 선택 읽기 실패 · 본자료와 별도',not_checked:'C2 선택 읽기 전'}[readState];
        errorLabel=rawRead.errorCode==null?'':typeof rawRead.errorCode==='string'&&own(readErrors,rawRead.errorCode)?readErrors[rawRead.errorCode]:'선택 읽기 오류 유형 미확인';
        if(['invalid','future'].includes(attempt.state)||readState==='read_success'&&(attempt.state!=='known'||rawRead.errorCode!==null)||readState==='read_failed'&&!(typeof rawRead.errorCode==='string'&&rawRead.errorCode.startsWith('OBSERVATION_')&&own(readErrors,rawRead.errorCode))){readState='invalid';readLabel='C2 선택 읽기 메타 확인 필요'}
        if(previous&&readState==='read_success')readLabel='이전 C2 선택 읽기 성공본 · 현재 조회 미확인';
      }else{readState='invalid';readLabel='C2 선택 읽기 메타 확인 필요'}
    }
    const rows=Array.isArray(dataset?.collectionStatus)?dataset.collectionStatus:[],observations=[['scm','SCM'],['payhere','PayHere'],['smartstore','SmartStore']].map(([id,name])=>{
      const matches=rows.filter(row=>object(row)&&row.id===id),row=matches[0],stamp=timestamp(row?.lastSuccessAt,now);
      let result={id,name,state:'unknown',label:'원래 관측시각 미확인',value:null,reasonLabel:'원래 관측 메타 미제공'};
      if(matches.length>1)return {...result,state:'invalid',reasonLabel:'원천 관측 메타 중복 · 확인 필요'};
      if(!row)return result;
      const reasonsValid=Array.isArray(row.reasons)&&row.reasons.length>0&&row.reasons.length<=20&&row.reasons.every(code=>typeof code==='string'&&own(observationReasons,code))&&row.reasons.includes(row.reason);
      if(row.evidenceCell!=='통합 재고!C2'||!reasonsValid)return {...result,state:'invalid',reasonLabel:'관측 응답 계약 확인 필요'};
      const reason=own(observationReasons,row.reason)?observationReasons[row.reason]:'관측 사유 확인 필요';
      if(row.status==='success'&&row.reason==='SUCCESS_RECORD'&&row.reasons.length===1&&stamp.state==='known'&&readState==='read_success'){
        const ageDays=Math.floor((now-Date.parse(stamp.value))/86400000);
        return {id,name,state:'known',label:'검증된 원래 성공시각'+(ageDays>=1?' · '+ageDays+'일 전 기록':''),value:stamp.value,reasonLabel:reason};
      }
      if(row.status==='unknown'&&row.lastSuccessAt===null&&!row.reasons.includes('SUCCESS_RECORD'))return {...result,reasonLabel:reason};
      return {...result,state:'invalid',reasonLabel:stamp.state==='future'?'미래 관측시각 · 확인 필요':'관측 메타 확인 필요'};
    });
    return {available,read:{state:readState,label:readLabel,attempt,errorLabel,previous},observations};
  }
  return {canonicalId,timestamp,task,read,management};
});
