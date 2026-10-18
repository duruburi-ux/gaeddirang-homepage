(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OperationsRequestSyncModel=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 const STATES=new Set(['not_connected','pending','synced','duplicate','conflict','retryable','denied','failed']);
 const OPERATION_KEYS=['contractVersion','operationId','requestId','baseVersion','intent','request'];
 const ALLOWED_KEYS=['id','sourceKind','sourceId','sourceTitle','text','owner','due','createdAt','status','delivery'];
 function integer(value,min=0){return Number.isSafeInteger(value)&&value>=min?value:null;}
 function exact(value,keys){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(value,key));}
 function sensitive(value){const body=String(value||'');return /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(body)||/(?:^|[^\d])(?:\+?82[\s().-]*0?[\s().-]*|0)(?:1[016789]|2|3[1-3]|4[1-4]|5[0-5]|6[1-4]|70|80)[\s().-]*\d{3,4}[\s().-]*\d{4}(?:[^\d]|$)/.test(body);}
 function request(row,{strict=false}={}){
  if(!row||!UUID.test(String(row.id||'')))throw Error('SYNC_REQUEST_INVALID');
  if(strict&&(!exact(row,ALLOWED_KEYS)||ALLOWED_KEYS.some(key=>typeof row[key]!=='string')))throw Error('SYNC_REQUEST_INVALID');
  const clean=Object.fromEntries(ALLOWED_KEYS.map(key=>[key,String(row[key]??'')]));
  if(!['inventory','programs','orders','inquiries'].includes(clean.sourceKind)||!clean.sourceId||clean.sourceId.length>120||!clean.sourceTitle||clean.sourceTitle.length>160||!clean.text||clean.text.length>1000)throw Error('SYNC_REQUEST_INVALID');
  if(!['팀 미지정','담당 A','담당 B','담당 C'].includes(clean.owner)||clean.due&&!/^\d{4}-\d{2}-\d{2}$/.test(clean.due)||!Number.isFinite(Date.parse(clean.createdAt)))throw Error('SYNC_REQUEST_INVALID');
  if(sensitive(clean.sourceId)||sensitive(clean.sourceTitle)||sensitive(clean.text))throw Error('SYNC_REQUEST_SENSITIVE');
  if(!['draft','ready','manual_delivered','held','done'].includes(clean.status)||!['not_connected','self_reported_manual'].includes(clean.delivery))throw Error('SYNC_REQUEST_INVALID');
  return clean;
 }
 function operation(row,{operationId,baseVersion=null}={}){
  if(!UUID.test(String(operationId||'')))throw Error('SYNC_OPERATION_ID_INVALID');
  const version=baseVersion===null?null:integer(baseVersion,1);
  if(baseVersion!==null&&version===null)throw Error('SYNC_VERSION_INVALID');
  return {contractVersion:1,operationId:String(operationId),requestId:String(row?.id||''),baseVersion:version,intent:'upsert_request',request:request(row)};
 }
 function normalizeOperation(payload){
  if(!exact(payload,OPERATION_KEYS)||payload.contractVersion!==1||payload.intent!=='upsert_request'||!UUID.test(String(payload.operationId||''))||!UUID.test(String(payload.requestId||'')))throw Error('SYNC_OPERATION_INVALID');
  const baseVersion=payload.baseVersion===null?null:integer(payload.baseVersion,1);if(payload.baseVersion!==null&&baseVersion===null)throw Error('SYNC_OPERATION_INVALID');
  const cleanRequest=request(payload.request,{strict:true});if(payload.requestId!==cleanRequest.id)throw Error('SYNC_OPERATION_INVALID');
  return {contractVersion:1,operationId:String(payload.operationId),requestId:String(payload.requestId),baseVersion,intent:'upsert_request',request:cleanRequest};
 }
 function receipt(body,expected){
  let clean;try{clean=normalizeOperation(expected);}catch{throw Error('SYNC_RESPONSE_INVALID');}
  if(String(body.requestId||'')!==clean.requestId||String(body.operationId||'')!==clean.operationId)throw Error('SYNC_RESPONSE_INVALID');return clean;
 }
 function list(status,body={}){
  if(Number(status)===401||Number(status)===403)return {state:'denied',requests:[],fetchedAt:null};
  if(Number(status)!==200||body?.contractVersion!==1||!Array.isArray(body.requests)||!Number.isFinite(Date.parse(body.fetchedAt)))return {state:'failed',requests:[],fetchedAt:null};
  try{
   const requests=body.requests.map(row=>{
    const base=request(row),version=integer(row.version,1);
    if(version===null||!Number.isFinite(Date.parse(row.updatedAt)))throw Error('SYNC_LIST_INVALID');
    return {...base,version,updatedAt:String(row.updatedAt),completedAt:row.completedAt?String(row.completedAt):null};
   });
   return {state:'synced',requests,fetchedAt:String(body.fetchedAt)};
  }catch{return {state:'failed',requests:[],fetchedAt:null};}
 }
 function result(status,body={},expected=null){
  const code=Number(status),outcome=String(body?.outcome||'');
  if((code===200||code===201)&&['accepted','duplicate'].includes(outcome)){
   const contract=receipt(body,expected),version=integer(body.version,1),requestId=String(body.requestId||''),operationId=String(body.operationId||'');if(version===null||!UUID.test(requestId)||version!==(contract.baseVersion??0)+1)throw Error('SYNC_RESPONSE_INVALID');
   return {state:outcome==='duplicate'?'duplicate':'synced',requestId,operationId,version,retryAfter:null};
  }
  if(code===409){const contract=receipt(body,expected),version=integer(body.currentVersion,1);if(version===null||contract.baseVersion!==null&&version<=contract.baseVersion)throw Error('SYNC_RESPONSE_INVALID');return {state:'conflict',requestId:String(body.requestId||''),operationId:String(body.operationId||''),currentVersion:version,retryAfter:null};}
  if([408,425,429,502,503,504].includes(code)){const seconds=integer(body.retryAfterSeconds)||5;return {state:'retryable',retryAfter:Math.min(seconds,300)};}
  if(code===401||code===403)return {state:'denied',retryAfter:null};
  return {state:'failed',retryAfter:null};
 }
 function view(state){
  const value=STATES.has(state)?state:'failed';
  return ({
   not_connected:{label:'공동 저장 미연결',tone:'bad',detail:'현재 화면 초안만 유지됩니다.',canRetry:false},
   pending:{label:'저장 확인 중',tone:'warn',detail:'서버 확인 전이며 완료로 표시하지 않습니다.',canRetry:false},
   synced:{label:'공동 저장 확인',tone:'ok',detail:'서버 버전 확인이 끝났습니다.',canRetry:false},
   duplicate:{label:'중복 요청 확인',tone:'ok',detail:'같은 작업 키가 이미 반영되어 다시 만들지 않았습니다.',canRetry:false},
   conflict:{label:'다른 변경과 충돌',tone:'bad',detail:'서버의 최신 버전을 확인한 뒤 선택해야 합니다.',canRetry:false},
   retryable:{label:'재시도 필요',tone:'warn',detail:'기존 작업 키를 유지한 채 다시 확인해야 합니다.',canRetry:true},
   denied:{label:'권한 확인 필요',tone:'bad',detail:'자료를 지우고 다시 로그인해야 합니다.',canRetry:false},
   failed:{label:'저장 실패',tone:'bad',detail:'저장됐다고 간주하지 않습니다.',canRetry:false},
  })[value];
 }
 function createAdapter({endpoint='',fetcher,approvedOrigin='',onDenied=null}={}){
  const path='/functions/v1/operations-requests',target=String(endpoint||'');
  let connected=false;
  if(target&&approvedOrigin){
   try{const url=new URL(target),approved=new URL(approvedOrigin);connected=url.protocol==='https:'&&url.pathname===path&&url.search===''&&url.hash===''&&url.origin===approved.origin;}
   catch{connected=false;}
  }
  return {
   capability:connected?'configured':'not_connected',
   async load({signal,token='',apiKey=''}={}){
    if(!connected)return {state:'not_connected',requests:[],fetchedAt:null};
    if(typeof fetcher!=='function'||!token||!apiKey)throw Error('SYNC_AUTH_REQUIRED');
    let response;try{response=await fetcher(target,{method:'GET',headers:{Authorization:`Bearer ${token}`,apikey:apiKey},signal,cache:'no-store'});}catch{return {state:'retryable',requests:[],fetchedAt:null};}
    let body={};try{body=await response.json();}catch{}
    const outcome=list(response.status,body);if(outcome.state==='denied'&&typeof onDenied==='function')await onDenied(outcome);return outcome;
   },
   async save(payload,{signal,token='',apiKey=''}={}){
    if(!connected)return {state:'not_connected',retryAfter:null};
    if(typeof fetcher!=='function'||!token||!apiKey)throw Error('SYNC_AUTH_REQUIRED');
    const clean=normalizeOperation(payload);let response;
    try{response=await fetcher(target,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:apiKey,'Content-Type':'application/json','Idempotency-Key':clean.operationId},body:JSON.stringify(clean),signal,cache:'no-store'});}
    catch{return {state:'retryable',retryAfter:5};}
    let body={};try{body=await response.json();}catch{}
    const outcome=result(response.status,body,clean);if(outcome.state==='denied'&&typeof onDenied==='function')await onDenied(outcome);return outcome;
   }
  };
 }
 return {request,operation,normalizeOperation,list,result,view,createAdapter};
});
