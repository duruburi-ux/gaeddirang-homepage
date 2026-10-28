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
 const exact=(value,keys)=>Boolean(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));
 const copy=value=>JSON.parse(JSON.stringify(value));
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
 return {requestOperation,cancelRequestOperation,approveRequestOperation,personalOperation,validateOperation,validateWorkspace,result,createAdapter,createSupabaseAdapter};
});
