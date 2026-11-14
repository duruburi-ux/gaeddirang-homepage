(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AutomationResultReadModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const UUID=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
  const statuses={submitted:'접수 기록',approval_required:'승인 대기 기록',execution_waiting:'실행 대기 기록',in_progress:'진행 기록',cancel_requested:'취소 요청 기록',verifying:'결과 검증 기록',completed:'완료 표기',failed:'실패 기록',cancelled:'취소 기록'};
  function time(value,now){
    if(!Number.isFinite(now))return {state:'invalid',value:null};
    if(value===null||value===undefined||value==='')return {state:'missing',value:null};
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return {state:'invalid',value:null};
    const stamp=Date.parse(value),parts=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/),[,year,month,day,hour,minute,second]=parts;
    if(!Number.isFinite(stamp)||Number(year)<1000||Number(month)<1||Number(month)>12||Number(day)<1||Number(day)>new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate()||Number(hour)>23||Number(minute)>59||Number(second)>59)return {state:'invalid',value:null};
    if(stamp>now)return {state:'future',value:null};
    return {state:'known',value:new Date(stamp).toISOString()};
  }
  function build(snapshot,{now=Date.now()}={}){
    if(!snapshot||typeof snapshot!=='object'||!Array.isArray(snapshot.requests))throw Error('RESULT_READ_SCHEMA_INVALID');
    const seen=new Set();
    const rows=snapshot.requests.map(row=>{
      if(!row||!UUID.test(row.requestId)||seen.has(row.requestId)||!Object.hasOwn(statuses,row.status)||typeof row.title!=='string'||typeof row.sourceId!=='string')throw Error('RESULT_READ_RECORD_INVALID');
      seen.add(row.requestId);
      const evidence=Array.isArray(row.resultEvidence)?row.resultEvidence.map(item=>time(item?.verifiedAt,now)):[];
      const known=evidence.filter(item=>item.state==='known').length;
      const evidenceState=row.resultEvidence===undefined?'missing':!Array.isArray(row.resultEvidence)?'invalid':!evidence.length?'empty':known===evidence.length?'dated':known?'partial':'unconfirmed';
      return {requestId:row.requestId,sourceId:row.sourceId,title:row.title,status:row.status,statusLabel:statuses[row.status],recordUpdatedAt:time(row.updatedAt,now),sourceStoredAt:{state:'not_provided',value:null},sourceObservedAt:{state:'not_provided',value:null},evidenceVerifiedAt:evidence,evidenceCount:evidence.length,evidenceState,hasUnconfirmedEvidence:!['empty','dated'].includes(evidenceState),hasDatedEvidence:row.status==='completed'&&known>0,naturalExecutionVerified:false};
    });
    return {reportReadAt:time(snapshot.fetchedAt,now),rows,naturalExecutionVerified:false};
  }
  return {build,time};
});
