(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./assistant-request-model.js'));else root.AssistantWorkspaceAdapter=factory(root.AssistantRequestModel);})(typeof globalThis!=='undefined'?globalThis:this,function(RequestModel){
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,DAY=/^(?:|\d{4}-\d{2}-\d{2})$/;
 const OP_KEYS=['contractVersion','operationId','resourceId','expectedVersion','intent','payload'];
 const REQUEST_PAYLOAD=['requestId','sourceId','sourceVersion','kind','route','requestedScope','title','body','createdAt'];
 const PLAN_PAYLOAD=['id','sourceKind','sourceId','sourceVersion','sourceTitle','sourceStatus','sourceTeamDue','title','project','plannedOn','priority','memo','done','archived'];
 const WORKSPACE_KEYS=['contractVersion','fetchedAt','executionEnabled','personalPlans','requests'];
 const WORKSPACE_V2_KEYS=['contractVersion','fetchedAt','executionEnabled','approvalEnabled','personalPlans','requests'];
 const REQUEST_SCOPES=new Set(['read_only','local_plan','content_change','external_communication','inventory_or_sales','financial_action']);
 const REQUEST_V2_STATUSES=new Set(['submitted','approval_required','execution_waiting','in_progress','cancel_requested','verifying','completed','failed','cancelled']);
 const SERVER_PLAN_KEYS=['id','sourceKind','sourceId','sourceVersion','sourceTitle','sourceStatus','sourceTeamDue','title','project','plannedOn','priority','memo','done','archived','version','updatedAt'];
 const SERVER_REQUEST_KEYS=['requestId','sourceId','sourceVersion','kind','route','requestedScope','title','body','status','executionEnabled','version','submittedAt','updatedAt'];
 const SERVER_REQUEST_V2_KEYS=['requestId','sourceId','sourceVersion','kind','route','requestedScope','title','body','status','executionEnabled','version','submittedAt','updatedAt','approvalId','approvalReason','approvedAt','executionId','executorKind','leaseExpiresAt','attemptCount','resultSummary','resultEvidence','errorCode','cancelRequestedAt'];
 const DEFAULT_TIMEOUT_MS=20000;
 const REQUEST_FRESH_MS=150000;
 const REQUEST_LABELS={submitted:'접수됨 · 자동 실행 아님',approval_required:'승인 대기 · 자동 실행 아님',execution_waiting:'실행 대기',in_progress:'진행 중',cancel_requested:'취소 요청 확인 중',verifying:'결과 검증 중',completed:'완료 기록',failed:'실패',cancelled:'취소됨'};
 const exact=(value,keys)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));
 const copy=value=>JSON.parse(JSON.stringify(value));
 const displayText=value=>typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';
 const displayStamp=value=>typeof value==='string'&&value.trim()?Date.parse(value):NaN;
 const plainReference=value=>Boolean(value&&!/[\u0000-\u001f\u007f]/.test(value)&&!/^(?:[a-z][a-z0-9+.-]*\s*:|\/\/)/i.test(value));
 const EVIDENCE_KINDS=new Set(['read','change','delivery','test','artifact']);
 const opaqueReference=value=>Boolean(value&&value.length<=500&&!/[\u0000-\u001f\u007f]/.test(value)&&!/^(?:(?:https?|javascript|data|vbscript|file|blob|ftp|sftp)\s*:|[a-z][a-z0-9+.-]*:\/\/|\/\/)/i.test(value));
 function evidenceLink(value){
  const raw=displayText(value);if(!/^https?:\/\//i.test(raw)||/[\u0000-\u0020\u007f]/.test(raw))return '';
  try{const url=new URL(raw);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:''}catch{return ''}
 }
 // Display only fields already present in evidence. This does not extend the server contract.
 function evidenceView(input,now=Date.now()){
  const item=input&&typeof input==='object'&&!Array.isArray(input)?input:{},label=displayText(item.label)||displayText(input)||'이름 없는 근거',verified=displayStamp(item.verifiedAt),verifiedAt=Number.isFinite(verified)&&verified<=now?new Date(verified).toISOString():'';
  const fields=[['kind','종류'],['reference','근거 위치'],['location','위치'],['url','주소'],['path','경로'],['id','식별자']].map(([key,name])=>({key,name,value:displayText(item[key]),href:['reference','location','url'].includes(key)?evidenceLink(item[key]):''})).filter(field=>field.value);
  return {label,verifiedAt,fields,inspectable:Boolean(displayText(item.label)&&verifiedAt&&fields.some(field=>field.key==='reference'?EVIDENCE_KINDS.has(item.kind)&&field.value.length<=500&&Boolean(field.href||opaqueReference(field.value)):['url','location'].includes(field.key)?Boolean(field.href):['path','id'].includes(field.key)&&plainReference(field.value)))};
 }
 function requestView(row,{execution=false,state='unchecked',fetchedAt='',now=Date.now()}={}){
  const status=displayText(row?.status),proof=Array.isArray(row?.resultEvidence)?row.resultEvidence.map(item=>evidenceView(item,now)):[],checked=displayStamp(fetchedAt),fresh=state==='current'&&Number.isFinite(checked)&&checked<=now&&now-checked<REQUEST_FRESH_MS,lease=displayStamp(row?.leaseExpiresAt);
  const view={label:REQUEST_LABELS[status]||status||'상태 미확인',note:'',attention:false,proof};
  if(status==='completed'){
   const supported=Boolean(displayText(row?.resultSummary)&&proof.some(item=>item.inspectable));
   view.label=supported?'완료 기록':'완료 기록 · 근거 확인 필요';view.attention=!supported;view.note=supported?'서버에 남은 완료 기록입니다. 결과 근거를 확인해 주세요.':'결과 요약·확인 시각·결과 위치가 있는 근거를 확인해야 합니다. 완료 여부를 새로 판정하지 않았습니다.';
  }else if(status==='verifying'){
   const supported=Boolean(displayText(row?.resultSummary)&&proof.some(item=>item.inspectable)),notes=['결과가 제출된 검증 기록입니다. 실행 임대가 비어 있어도 완료로 판단하지 않습니다.'];
   view.label=supported?'결과 검증 기록':'검증 기록 · 근거 확인 필요';view.attention=!supported;
   if(!supported)notes.push('결과 요약·확인 시각·결과 위치가 있는 근거를 확인해야 합니다.');
   if(!fresh){if(supported)view.label='검증 기록 · 최근 확인 필요';notes.push('서버 조회가 오래됐거나 확인되지 않아 자료를 다시 확인해야 합니다.');view.attention=true}
   view.note=notes.join(' ');
  }else if(status==='in_progress'){
   if(!execution){view.label='진행 기록 · 실행 담당 확인 필요';view.note='실행 담당의 연결을 확인해야 합니다. 실제 가동 여부는 별도로 확인합니다.';view.attention=true}
   else if(!Number.isFinite(lease)||lease<=now){view.label='진행 기록 · 실행 확인 필요';view.note=Number.isFinite(lease)?'실행 임대가 만료됐습니다. 마지막 상태 기록이며 자동으로 완료·실패 처리하지 않았습니다.':'실행 임대 시각이 없어 현재 실행 여부를 확정하지 않습니다.';view.attention=true}
   else if(!fresh){view.label='진행 기록 · 최근 확인 필요';view.note='서버 조회가 오래됐거나 확인되지 않았습니다. 자료를 다시 확인해 주세요.';view.attention=true}
   else{view.label='진행 기록 · 실제 가동 별도 확인';view.note='실행 담당 연결됨 · 실제 가동 별도 확인. 최근 서버 상태 기록과 남은 실행 임대이며, 실제 완료는 결과 근거로 따로 확인합니다.'}
  }else if(status==='execution_waiting'){
   view.label=execution?'실행 대기 기록':'실행 대기 · 담당 확인 필요';view.note=execution?'실행 담당 연결됨 · 실제 가동 별도 확인. 대기 기록이며 실행 시작을 뜻하지 않습니다.':'실행 담당 연결을 확인해야 합니다. 대기 상태를 실행 시작으로 바꾸지 않았습니다.';view.attention=!execution;
  }else if(status==='cancel_requested'&&(!execution||!fresh)){view.label='취소 요청 기록 · 확인 필요';view.note='실행 담당과 취소 확인 기록을 다시 확인해야 합니다. 취소 완료로 바꾸지 않았습니다.';view.attention=true}
  return view;
 }
 function endpoint(value,approvedOrigin){const url=new URL(String(value||''));if(url.origin!==approvedOrigin||url.pathname!=='/functions/v1/assistant-workspace'||url.search||url.hash)throw Error('ASSISTANT_WORKSPACE_ENDPOINT_INVALID');return url.toString()}
 function requestPayload(request){return {requestId:request.requestId,sourceId:request.sourceId,sourceVersion:request.sourceVersion,kind:request.kind,route:request.route,requestedScope:request.requestedScope,title:request.title,body:request.body,createdAt:request.createdAt}}
 function requestOperation(request,{operationId,intent='submit'}={}){
  const clean=RequestModel.validateRequest(request),mapping={submit:'submit_assistant_request',cancel:'cancel_assistant_request'},serverIntent=mapping[intent];
  if(!serverIntent||!UUID.test(String(operationId||'')))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(intent==='submit'&&clean.status!=='draft')throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(intent==='cancel'&&!['submitted','approval_required'].includes(clean.status))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  return {contractVersion:1,operationId:String(operationId),resourceId:clean.requestId,expectedVersion:intent==='submit'?null:clean.version,intent:serverIntent,payload:intent==='cancel'?{requestId:clean.requestId}:requestPayload(clean)};
 }
 function planPayload(input){if(!exact(input,PLAN_PAYLOAD)||!UUID.test(String(input.id||''))||!['personal','notion_work','operations_request','team_task'].includes(input.sourceKind)||!String(input.sourceId||'')||!String(input.title||'')||!['low','normal','high'].includes(input.priority)||!DAY.test(String(input.sourceTeamDue??''))||!DAY.test(String(input.plannedOn??''))||typeof input.done!=='boolean'||typeof input.archived!=='boolean')throw Error('ASSISTANT_WORKSPACE_PLAN_INVALID');return copy(input)}
 function personalOperation(plan,{operationId,expectedVersion=null,intent='upsert'}={}){
  if(!UUID.test(String(operationId||''))||!(expectedVersion===null||(Number.isInteger(expectedVersion)&&expectedVersion>=1))||!['upsert','archive'].includes(intent))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  const clean=planPayload(plan);if(intent==='archive'&&expectedVersion===null)throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  return {contractVersion:1,operationId:String(operationId),resourceId:clean.id,expectedVersion,intent:intent==='archive'?'archive_personal_plan':'upsert_personal_plan',payload:intent==='archive'?{id:clean.id}:clean};
 }
 function cancelRequestOperation(request,{operationId}={}){
  if(!request||!UUID.test(String(request.requestId||''))||!UUID.test(String(operationId||''))||!Number.isInteger(request.version)||request.version<2||!['submitted','approval_required','execution_waiting','in_progress','cancel_requested','verifying'].includes(request.status))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  return {contractVersion:1,operationId:String(operationId),resourceId:String(request.requestId),expectedVersion:request.version,intent:'cancel_assistant_request',payload:{requestId:String(request.requestId)}};
 }
 function approveRequestOperation(request,{operationId}={}){if(!request||!UUID.test(String(request.requestId||''))||!UUID.test(String(operationId||''))||!Number.isInteger(request.version)||request.version<2||request.status!=='approval_required')throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');return {contractVersion:2,operationId:String(operationId),resourceId:String(request.requestId),expectedVersion:request.version,intent:'approve_assistant_request',payload:{requestId:String(request.requestId),approvedScope:String(request.requestedScope||'')}}}
 function validateOperation(input){
  if(!exact(input,OP_KEYS)||![1,2].includes(input.contractVersion)||!UUID.test(String(input.operationId||''))||!UUID.test(String(input.resourceId||''))||!(input.expectedVersion===null||(Number.isInteger(input.expectedVersion)&&input.expectedVersion>=1)))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  const shapes={submit_assistant_request:REQUEST_PAYLOAD,cancel_assistant_request:['requestId'],approve_assistant_request:['requestId','approvedScope'],upsert_personal_plan:PLAN_PAYLOAD,archive_personal_plan:['id']},keys=shapes[input.intent];
  if(!keys||!exact(input.payload,keys))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  const payloadId=input.payload.requestId??input.payload.id;if(payloadId!==input.resourceId)throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(input.intent==='submit_assistant_request'&&input.expectedVersion!==null)throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(['cancel_assistant_request','approve_assistant_request','archive_personal_plan'].includes(input.intent)&&input.expectedVersion===null)throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(input.intent==='approve_assistant_request'&&(input.contractVersion!==2||!REQUEST_SCOPES.has(input.payload.approvedScope)))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(input.intent!=='approve_assistant_request'&&input.contractVersion!==1)throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(input.intent==='upsert_personal_plan')planPayload(input.payload);
  return copy(input);
 }
 function result(status,body,expected){
  if([401,403].includes(status))return {state:'denied'};
  if([408,425,429,502,503,504].includes(status))return {state:'retryable',retryAfter:Number.isInteger(body?.retryAfterSeconds)?body.retryAfterSeconds:null};
  if(status===409){const keys=['outcome','resourceId','operationId','currentVersion'];if(!expected||!exact(body,keys)||body.resourceId!==expected.resourceId||body.operationId!==expected.operationId||!['version_conflict','idempotency_conflict','state_conflict'].includes(body.outcome)||!Number.isInteger(body.currentVersion))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');return {state:'conflict',reason:body.outcome,requestId:body.resourceId,operationId:body.operationId,currentVersion:body.currentVersion}}
  if([200,201].includes(status)){
   if(!expected)throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');
   if(expected.intent==='approve_assistant_request'){
    const keys=['outcome','resourceId','operationId','resourceType','version','status','executionEnabled'];
    if(!exact(body,keys)||!['accepted','duplicate'].includes(body.outcome)||body.resourceId!==expected.resourceId||body.operationId!==expected.operationId||body.resourceType!=='assistant_request'||body.version!==expected.expectedVersion+1||body.status!=='execution_waiting'||body.executionEnabled!==true)throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');
    return {state:body.outcome==='duplicate'?'duplicate':'accepted',requestId:body.resourceId,operationId:body.operationId,version:body.version,status:body.status,executionEnabled:true};
   }
   const request=expected.intent.includes('assistant_request'),keys=request?['outcome','resourceId','operationId','resourceType','version','status','executionEnabled']:['outcome','resourceId','operationId','resourceType','version','archived'];
   const next=expected.expectedVersion===null?(request?2:1):expected.expectedVersion+1;
   const requestStatus=expected.intent==='cancel_assistant_request'?['cancelled','cancel_requested']:['submitted','approval_required','execution_waiting'];
   if(!expected||!exact(body,keys)||!['accepted','duplicate'].includes(body.outcome)||body.resourceId!==expected.resourceId||body.operationId!==expected.operationId||body.resourceType!==(request?'assistant_request':'personal_plan')||body.version!==next||(request&&(!requestStatus.includes(body.status)||body.executionEnabled!==['execution_waiting','cancel_requested'].includes(body.status)))||(!request&&typeof body.archived!=='boolean'))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');
   return request?{state:body.outcome==='duplicate'?'duplicate':'accepted',requestId:body.resourceId,operationId:body.operationId,version:body.version,status:body.status,executionEnabled:body.executionEnabled}:{state:body.outcome==='duplicate'?'duplicate':'accepted',planId:body.resourceId,operationId:body.operationId,version:body.version,archived:body.archived};
  }
  return {state:'failed'};
 }
 function validateWorkspace(input){
  const v2=input?.contractVersion===2,workspaceKeys=v2?WORKSPACE_V2_KEYS:WORKSPACE_KEYS;
  if(!exact(input,workspaceKeys)||![1,2].includes(input.contractVersion)||typeof input.executionEnabled!=='boolean'||(v2?typeof input.approvalEnabled!=='boolean':input.executionEnabled!==false)||!Number.isFinite(Date.parse(input.fetchedAt))||!Array.isArray(input.personalPlans)||!Array.isArray(input.requests))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');
  const personalPlans=input.personalPlans.map(row=>{if(!exact(row,SERVER_PLAN_KEYS)||!UUID.test(String(row.id||''))||!Number.isInteger(row.version)||row.version<1||!Number.isFinite(Date.parse(row.updatedAt)))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');planPayload(Object.fromEntries(PLAN_PAYLOAD.map(key=>[key,row[key]])));return copy(row)});
  const requests=input.requests.map(row=>{const keys=v2?SERVER_REQUEST_V2_KEYS:SERVER_REQUEST_KEYS;if(!exact(row,keys)||!UUID.test(String(row.requestId||''))||!['memo','execution_request'].includes(row.kind)||!['self','astra','decision'].includes(row.route)||!(v2?REQUEST_V2_STATUSES.has(row.status):['submitted','approval_required','cancelled'].includes(row.status))||typeof row.executionEnabled!=='boolean'||(!v2&&row.executionEnabled!==false)||!Number.isInteger(row.version)||row.version<2||!Number.isFinite(Date.parse(row.submittedAt))||!Number.isFinite(Date.parse(row.updatedAt)))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');if(v2&&(!REQUEST_SCOPES.has(row.requestedScope)||!Number.isInteger(row.attemptCount)||row.attemptCount<0||!Array.isArray(row.resultEvidence)))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');return copy(row)});
  return {contractVersion:input.contractVersion,fetchedAt:new Date(input.fetchedAt).toISOString(),executionEnabled:input.executionEnabled,...(v2?{approvalEnabled:input.approvalEnabled}:{}),personalPlans,requests};
 }
 async function limited(task,{timeoutMs=DEFAULT_TIMEOUT_MS,schedule=globalThis.setTimeout,cancel=globalThis.clearTimeout,onTimeout=()=>{}}={}){
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||typeof schedule!=='function'||typeof cancel!=='function')throw Error('ASSISTANT_WORKSPACE_TIMEOUT_INVALID');
  let timer;const work=Promise.resolve().then(task).then(value=>({state:'done',value}),()=>({state:'failed'})),deadline=new Promise(resolve=>{timer=schedule(()=>{onTimeout();resolve({state:'timeout'})},timeoutMs)}),out=await Promise.race([work,deadline]);cancel(timer);return out;
 }
 function createAdapter({endpoint:target,approvedOrigin,fetcher=globalThis.fetch,onDenied=()=>{},timeoutMs=DEFAULT_TIMEOUT_MS,schedule=globalThis.setTimeout,cancel=globalThis.clearTimeout}={}){const url=endpoint(target,approvedOrigin);return {async send(input,{token,apiKey}={}){const payload=validateOperation(input);if(!token||!apiKey)throw Error('ASSISTANT_WORKSPACE_CREDENTIALS_REQUIRED');const controller=typeof AbortController==='function'?new AbortController():null,outcome=await limited(async()=>{const response=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:apiKey,'Content-Type':'application/json','Idempotency-Key':payload.operationId},body:JSON.stringify(payload),cache:'no-store',...(controller?{signal:controller.signal}:{})}),body=await response.json().catch(()=>({}));return {response,body}},{timeoutMs,schedule,cancel,onTimeout:()=>controller?.abort()});if(outcome.state!=='done')return {state:'retryable',retryAfter:null};const {response,body}=outcome.value,out=result(response.status,body,payload);if(out.state==='denied')onDenied();return out}}}
 function createSupabaseAdapter({invoke,onDenied=()=>{},timeoutMs=DEFAULT_TIMEOUT_MS,schedule=globalThis.setTimeout,cancel=globalThis.clearTimeout}={}){
  if(typeof invoke!=='function')throw Error('ASSISTANT_WORKSPACE_INVOKER_REQUIRED');
  async function call(method,payload){
   try{
    const options={method,headers:{'Cache-Control':'no-store'}};if(payload){options.body=payload;options.headers['Idempotency-Key']=payload.operationId}
    const outcome=await limited(()=>invoke('assistant-workspace',options),{timeoutMs,schedule,cancel});if(outcome.state==='timeout')return {status:504,body:{}};if(outcome.state!=='done')return {status:503,body:{}};const response=outcome.value;
    if(!response?.error)return {status:method==='GET'?200:(response?.data?.outcome==='accepted'?201:200),body:response?.data??{}};
    const context=response.error.context;if(context&&typeof context.json==='function')return {status:Number(context.status)||503,body:await context.json().catch(()=>({}))};
    return {status:503,body:{}};
   }catch{return {status:503,body:{}}}
  }
  return {
   async list(){const response=await call('GET');if([401,403].includes(response.status)){onDenied();return {state:'denied'}}if([408,425,429,502,503,504].includes(response.status))return {state:'retryable'};if(response.status!==200)return {state:'failed'};return {state:'current',workspace:validateWorkspace(response.body)}},
   async send(input){const payload=validateOperation(input),response=await call('POST',payload),out=result(response.status,response.body,payload);if(out.state==='denied')onDenied();return out}
  };
 }
 return {requestOperation,cancelRequestOperation,approveRequestOperation,personalOperation,validateOperation,validateWorkspace,result,createAdapter,createSupabaseAdapter,evidenceLink,evidenceView,requestView,REQUEST_FRESH_MS};
});
