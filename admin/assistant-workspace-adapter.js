(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./assistant-request-model.js'));else root.AssistantWorkspaceAdapter=factory(root.AssistantRequestModel);})(typeof globalThis!=='undefined'?globalThis:this,function(RequestModel){
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,DAY=/^(?:|\d{4}-\d{2}-\d{2})$/;
 const OP_KEYS=['contractVersion','operationId','resourceId','expectedVersion','intent','payload'];
 const REQUEST_PAYLOAD=['requestId','sourceId','sourceVersion','kind','route','requestedScope','title','body','createdAt'];
 const PLAN_PAYLOAD=['id','sourceKind','sourceId','sourceVersion','sourceTitle','sourceStatus','sourceTeamDue','title','project','plannedOn','priority','memo','done','archived'];
 const WORKSPACE_KEYS=['contractVersion','fetchedAt','executionEnabled','personalPlans','requests'];
 const SERVER_PLAN_KEYS=['id','sourceKind','sourceId','sourceVersion','sourceTitle','sourceStatus','sourceTeamDue','title','project','plannedOn','priority','memo','done','archived','version','updatedAt'];
 const SERVER_REQUEST_KEYS=['requestId','sourceId','sourceVersion','kind','route','requestedScope','title','body','status','executionEnabled','version','submittedAt','updatedAt'];
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
  if(!request||!UUID.test(String(request.requestId||''))||!UUID.test(String(operationId||''))||!Number.isInteger(request.version)||request.version<2||!['submitted','approval_required'].includes(request.status))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  return {contractVersion:1,operationId:String(operationId),resourceId:String(request.requestId),expectedVersion:request.version,intent:'cancel_assistant_request',payload:{requestId:String(request.requestId)}};
 }
 function validateOperation(input){
  if(!exact(input,OP_KEYS)||input.contractVersion!==1||!UUID.test(String(input.operationId||''))||!UUID.test(String(input.resourceId||''))||!(input.expectedVersion===null||(Number.isInteger(input.expectedVersion)&&input.expectedVersion>=1)))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  const shapes={submit_assistant_request:REQUEST_PAYLOAD,cancel_assistant_request:['requestId'],upsert_personal_plan:PLAN_PAYLOAD,archive_personal_plan:['id']},keys=shapes[input.intent];
  if(!keys||!exact(input.payload,keys))throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  const payloadId=input.payload.requestId??input.payload.id;if(payloadId!==input.resourceId)throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(input.intent==='submit_assistant_request'&&input.expectedVersion!==null)throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(['cancel_assistant_request','archive_personal_plan'].includes(input.intent)&&input.expectedVersion===null)throw Error('ASSISTANT_WORKSPACE_OPERATION_INVALID');
  if(input.intent==='upsert_personal_plan')planPayload(input.payload);
  return copy(input);
 }
 function result(status,body,expected){
  if([401,403].includes(status))return {state:'denied'};
  if([408,425,429,502,503,504].includes(status))return {state:'retryable',retryAfter:Number.isInteger(body?.retryAfterSeconds)?body.retryAfterSeconds:null};
  if(status===409){const keys=['outcome','resourceId','operationId','currentVersion'];if(!expected||!exact(body,keys)||body.resourceId!==expected.resourceId||body.operationId!==expected.operationId||!['version_conflict','idempotency_conflict','state_conflict'].includes(body.outcome)||!Number.isInteger(body.currentVersion))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');return {state:'conflict',reason:body.outcome,requestId:body.resourceId,operationId:body.operationId,currentVersion:body.currentVersion}}
  if([200,201].includes(status)){
   if(!expected)throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');
   const request=expected.intent.includes('assistant_request'),keys=request?['outcome','resourceId','operationId','resourceType','version','status','executionEnabled']:['outcome','resourceId','operationId','resourceType','version','archived'];
   const next=expected.expectedVersion===null?(request?2:1):expected.expectedVersion+1;
   if(!expected||!exact(body,keys)||!['accepted','duplicate'].includes(body.outcome)||body.resourceId!==expected.resourceId||body.operationId!==expected.operationId||body.resourceType!==(request?'assistant_request':'personal_plan')||body.version!==next||(request&&(body.executionEnabled!==false||!['submitted','approval_required','cancelled'].includes(body.status)))||(!request&&typeof body.archived!=='boolean'))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');
   return request?{state:body.outcome==='duplicate'?'duplicate':'accepted',requestId:body.resourceId,operationId:body.operationId,version:body.version,status:body.status,executionEnabled:false}:{state:body.outcome==='duplicate'?'duplicate':'accepted',planId:body.resourceId,operationId:body.operationId,version:body.version,archived:body.archived};
  }
  return {state:'failed'};
 }
 function validateWorkspace(input){
  if(!exact(input,WORKSPACE_KEYS)||input.contractVersion!==1||input.executionEnabled!==false||!Number.isFinite(Date.parse(input.fetchedAt))||!Array.isArray(input.personalPlans)||!Array.isArray(input.requests))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');
  const personalPlans=input.personalPlans.map(row=>{if(!exact(row,SERVER_PLAN_KEYS)||!UUID.test(String(row.id||''))||!Number.isInteger(row.version)||row.version<1||!Number.isFinite(Date.parse(row.updatedAt)))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');planPayload(Object.fromEntries(PLAN_PAYLOAD.map(key=>[key,row[key]])));return copy(row)});
  const requests=input.requests.map(row=>{if(!exact(row,SERVER_REQUEST_KEYS)||!UUID.test(String(row.requestId||''))||!['memo','execution_request'].includes(row.kind)||!['self','astra','decision'].includes(row.route)||!['submitted','approval_required','cancelled'].includes(row.status)||row.executionEnabled!==false||!Number.isInteger(row.version)||row.version<2||!Number.isFinite(Date.parse(row.submittedAt))||!Number.isFinite(Date.parse(row.updatedAt)))throw Error('ASSISTANT_WORKSPACE_RESPONSE_INVALID');return copy(row)});
  return {contractVersion:1,fetchedAt:new Date(input.fetchedAt).toISOString(),executionEnabled:false,personalPlans,requests};
 }
 function createAdapter({endpoint:target,approvedOrigin,fetcher=globalThis.fetch,onDenied=()=>{}}={}){const url=endpoint(target,approvedOrigin);return {async send(input,{token,apiKey}={}){const payload=validateOperation(input);if(!token||!apiKey)throw Error('ASSISTANT_WORKSPACE_CREDENTIALS_REQUIRED');let response;try{response=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:apiKey,'Content-Type':'application/json','Idempotency-Key':payload.operationId},body:JSON.stringify(payload),cache:'no-store'})}catch{return {state:'retryable',retryAfter:null}}const body=await response.json().catch(()=>({})),out=result(response.status,body,payload);if(out.state==='denied')onDenied();return out}}}
 function createSupabaseAdapter({invoke,onDenied=()=>{}}={}){
  if(typeof invoke!=='function')throw Error('ASSISTANT_WORKSPACE_INVOKER_REQUIRED');
  async function call(method,payload){
   try{
    const options={method,headers:{'Cache-Control':'no-store'}};if(payload){options.body=payload;options.headers['Idempotency-Key']=payload.operationId}
    const response=await invoke('assistant-workspace',options);
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
 return {requestOperation,cancelRequestOperation,personalOperation,validateOperation,validateWorkspace,result,createAdapter,createSupabaseAdapter};
});
