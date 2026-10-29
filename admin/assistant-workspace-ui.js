window.AssistantWorkspaceUI=(()=>{
 'use strict';
 const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
 const A=window.AssistantWorkspaceAdapter,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 let config=null,adapter=null,userId='',generation=0,workspace=null,lastGoodAt='',busy=false,pending=new Map(),ready=false,plannerListenerBound=false;
 const operationId=()=>crypto.randomUUID(),fingerprint=value=>JSON.stringify(value),pendingKey=(intent,resourceId)=>`${intent}:${resourceId}`;
 function setStatus(message,bad=false){const node=$('#assistant-workspace-status');if(!node)return;node.textContent=message;node.classList.toggle('bad',bad)}
 function syncRefreshControl(){const button=$('#assistant-workspace-refresh');if(!button)return;button.disabled=!ready||!userId||busy;button.setAttribute('aria-busy',busy?'true':'false')}
 async function sessionMatches(run){const result=await config.client.auth.getSession(),current=String(result.data?.session?.user?.id||'');return !result.error&&run===generation&&current===userId&&Boolean(current)}
 function activeSnapshot(){const snapshot=window.PersonalPlanner?.snapshot?.();return snapshot&&String(snapshot.userId||'')===userId?snapshot:null}
 function planPayload(item){return {id:item.id,sourceKind:item.sourceKind,sourceId:item.sourceId,sourceVersion:'',sourceTitle:item.sourceTitle||'',sourceStatus:item.sourceStatus||'',sourceTeamDue:item.sourceTeamDue||'',title:item.title,project:item.project||'',plannedOn:item.plannedOn||'',priority:item.priority,memo:item.memo||'',done:Boolean(item.done),archived:false}}
 function render(){
  const list=$('#assistant-workspace-plans'),snapshot=activeSnapshot(),local=snapshot?.items||[],server=new Map((workspace?.personalPlans||[]).map(row=>[row.id,row]));if(!list)return;
  const rows=local.map(item=>{const remote=server.get(item.id),valid=UUID.test(item.id),waiting=[...pending.values()].some(value=>value.resourceId===item.id),label=`${remote?`서버 v${remote.version}${remote.archived?' · 보관됨':''}`:'서버 미저장'}${waiting?' · 결과 확인 필요':''}`;return `<article data-workspace-plan="${esc(item.id)}"><div><b>${esc(item.title)}</b><small>${esc(label)}</small></div><div><button type="button" data-workspace-save${!valid||!workspace||busy?' disabled':''}>${waiting?'같은 작업 다시 확인':'서버에 저장'}</button>${remote&&!remote.archived?'<button type="button" data-workspace-import>서버 내용 가져오기</button><button type="button" data-workspace-archive>서버 보관</button>':''}</div></article>`}).join('');
  const localIds=new Set(local.map(item=>item.id)),remoteOnly=(workspace?.personalPlans||[]).filter(row=>!row.archived&&!localIds.has(row.id)).map(row=>`<article data-workspace-plan="${esc(row.id)}"><div><b>${esc(row.title)}</b><small>서버 v${row.version} · 이 브라우저에 없음</small></div><div><button type="button" data-workspace-import>이 브라우저로 가져오기</button></div></article>`).join('');
  list.innerHTML=rows+remoteOnly||'<p>서버 자료 확인 뒤 일정별 저장 상태를 볼 수 있습니다.</p>';
  list.querySelectorAll('[data-workspace-save]').forEach(button=>button.onclick=()=>savePlan(button.closest('article').dataset.workspacePlan));
  list.querySelectorAll('[data-workspace-import]').forEach(button=>button.onclick=()=>importPlan(button.closest('article').dataset.workspacePlan));
  list.querySelectorAll('[data-workspace-archive]').forEach(button=>button.onclick=()=>archivePlan(button.closest('article').dataset.workspacePlan));
  const badge=$('#assistant-workspace-state');if(badge)badge.textContent=workspace?`마지막 정상 확인 ${new Date(lastGoodAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}`:'확인 전';syncRefreshControl();
 }
 async function guarded(action){
  if(busy||!userId)return null;
  busy=true;const run=generation;render();
  try{if(!await sessionMatches(run)){config.onDenied?.();return null}const result=await action();if(!await sessionMatches(run))return null;return result}
  finally{if(run===generation){busy=false;render()}}
 }
 function samePlan(row,payload){return Boolean(row&&['sourceKind','sourceId','sourceVersion','sourceTitle','sourceStatus','sourceTeamDue','title','project','plannedOn','priority','memo','done','archived'].every(key=>row[key]===payload[key]))}
 function reconcilePending(next){
  let count=0;
  for(const [key,entry] of pending){let done=false;
   if(entry.intent==='upsert_personal_plan')done=samePlan(next.personalPlans.find(row=>row.id===entry.resourceId),entry.operation.payload);
   if(entry.intent==='archive_personal_plan')done=next.personalPlans.some(row=>row.id===entry.resourceId&&row.archived);
   if(entry.intent==='submit_assistant_request')done=next.requests.some(row=>row.requestId===entry.resourceId&&['submitted','approval_required','execution_waiting'].includes(row.status));
   if(entry.intent==='cancel_assistant_request')done=next.requests.some(row=>row.requestId===entry.resourceId&&row.status==='cancelled');
   if(entry.intent==='approve_assistant_request')done=next.requests.some(row=>row.requestId===entry.resourceId&&row.status==='execution_waiting');
   if(done)pending.delete(key);else count++;
  }
  return count;
 }
 function prepare(intent,resourceId,payload,build){
  const key=pendingKey(intent,resourceId),hash=fingerprint(payload),prior=pending.get(key);
  if(prior){if(prior.fingerprint!==hash)return {state:'changed',key};return {state:'retry',key,entry:prior}}
  const entry={intent,resourceId,fingerprint:hash,operation:build()};pending.set(key,entry);return {state:'new',key,entry};
 }
 function finish(key,result){if(result&&result.state!=='retryable')pending.delete(key)}
 async function refresh(){
  if(busy)return false;
  if(!ready){setStatus('개인 서버 연결 화면을 초기화하지 못했습니다. 페이지를 새로고침해 주세요.',true);syncRefreshControl();return false}
  if(!userId){setStatus('로그인 확인이 끝난 뒤 서버 자료를 확인할 수 있습니다.',true);syncRefreshControl();return false}
  window.AssistantRequestPanel?.setWorkspaceState('loading','개인 서버 자료를 확인하고 있습니다.');setStatus('개인 서버 자료를 확인하고 있습니다.');
  let result;
  try{result=await guarded(()=>adapter.list())}
  catch{window.AssistantRequestPanel?.setWorkspaceState(workspace?'stale':'unchecked',workspace?'서버 응답을 확인하지 못해 마지막 정상본을 유지합니다.':'서버 응답 형식을 확인하지 못했습니다. 접수나 저장은 시작하지 않았습니다.',true);setStatus(workspace?'서버 응답을 확인하지 못해 마지막 정상본을 유지합니다. 로컬 자료는 바뀌지 않았습니다.':'서버 응답 형식을 확인하지 못했습니다. 로컬 자료는 그대로입니다.',true);render();return false}
  if(!result)return false;
  if(result.state==='current'){workspace=result.workspace;lastGoodAt=workspace.fetchedAt;const unresolved=reconcilePending(workspace);window.AssistantRequestPanel?.setWorkspace(workspace.requests,{state:'current',execution:workspace.executionEnabled,approval:workspace.approvalEnabled});setStatus(`서버 일정 ${workspace.personalPlans.length}개 · 요청 ${workspace.requests.length}개를 확인했습니다.${unresolved?` 결과 확인이 필요한 작업 ${unresolved}개는 같은 작업 ID를 유지합니다.`:''} 로컬 일정은 자동 업로드하지 않았습니다.`,Boolean(unresolved));render();return true}
  if(result.state==='denied'){config.onDenied?.();return false}
  window.AssistantRequestPanel?.setWorkspaceState(workspace?'stale':'unchecked',workspace?'서버 확인에 실패해 마지막 정상본을 유지합니다.':'서버 자료를 확인하지 못했습니다. 접수나 저장은 시작하지 않았습니다.',true);setStatus(workspace?'서버 확인에 실패해 마지막 정상본을 유지합니다. 로컬 자료는 바뀌지 않았습니다.':'서버 자료를 확인하지 못했습니다. 로컬 자료는 그대로입니다.',true);render();
  return false;
 }
 async function savePlan(id){
  if(busy||!userId)return;
  const result=await guarded(async()=>{const snapshot=activeSnapshot(),item=snapshot?.items.find(row=>row.id===id),remote=workspace?.personalPlans.find(row=>row.id===id);if(!snapshot||!item||!workspace){render();setStatus('현재 로그인 사용자와 개인 일정 소유자가 달라 저장하지 않았습니다.',true);return null}const payload=planPayload(item),prepared=prepare('upsert_personal_plan',id,payload,()=>A.personalOperation(payload,{operationId:operationId(),expectedVersion:remote?.version??null}));if(prepared.state==='changed')return {changed:true};setStatus(prepared.state==='retry'?'같은 작업 ID로 일정 저장 결과를 다시 확인하고 있습니다.':'선택한 일정을 서버에 저장하고 있습니다.');return {prepared,result:await adapter.send(prepared.entry.operation),item}});if(!result)return;if(result.changed){setStatus('결과가 불명확한 이전 저장과 내용이 달라 새 작업을 만들지 않았습니다. 서버 자료를 다시 확인해 주세요.',true);return}finish(result.prepared.key,result.result);if(['accepted','duplicate'].includes(result.result.state)){const row={...planPayload(result.item),version:result.result.version,updatedAt:new Date().toISOString()};workspace.personalPlans=[row,...workspace.personalPlans.filter(value=>value.id!==id)];setStatus('선택한 일정만 서버에 저장했습니다. 다른 로컬 일정은 업로드하지 않았습니다.');render();return}operationFailure(result.result,'일정을 저장하지 못했습니다.')
 }
 async function archivePlan(id){
  if(busy||!userId)return;
  const result=await guarded(async()=>{const remote=workspace?.personalPlans.find(row=>row.id===id);if(!remote||remote.archived)return null;const payload={id:remote.id,version:remote.version},prepared=prepare('archive_personal_plan',id,payload,()=>A.personalOperation(planPayload(remote),{operationId:operationId(),expectedVersion:remote.version,intent:'archive'}));if(prepared.state==='changed')return {changed:true};setStatus(prepared.state==='retry'?'같은 작업 ID로 보관 결과를 다시 확인하고 있습니다.':'선택한 서버 일정을 보관하고 있습니다.');return {prepared,result:await adapter.send(prepared.entry.operation)}});if(!result)return;if(result.changed){setStatus('결과가 불명확한 보관 작업의 서버 버전이 달라 새 작업을 만들지 않았습니다. 서버 자료를 다시 확인해 주세요.',true);return}finish(result.prepared.key,result.result);if(['accepted','duplicate'].includes(result.result.state)){workspace.personalPlans=workspace.personalPlans.map(row=>row.id===id?{...row,archived:true,version:result.result.version,updatedAt:new Date().toISOString()}:row);setStatus('서버 일정만 보관했습니다. 이 브라우저의 개인 일정은 삭제하지 않았습니다.');render();return}operationFailure(result.result,'서버 일정을 보관하지 못했습니다.')
 }
 function importPlan(id){const snapshot=activeSnapshot(),remote=workspace?.personalPlans.find(row=>row.id===id);if(!snapshot){render();setStatus('현재 로그인 사용자와 개인 일정 소유자가 달라 가져오지 않았습니다.',true);return}if(!remote||remote.archived)return;if(window.PersonalPlanner?.applyServerPlan(remote)){setStatus('선택한 서버 내용을 이 브라우저에 적용했습니다. 자동 동기화는 켜지지 않았습니다.');render()}}
 function operationFailure(result,fallback){const message=result.state==='conflict'?'서버 버전이 달라 저장하지 않았습니다. 서버 자료를 다시 확인한 뒤 내용을 선택해 주세요.':result.state==='denied'?'관리 권한을 다시 확인해야 합니다.':result.state==='retryable'?'응답이 끊겨 처리 결과를 확인할 수 없습니다. 서버 자료를 다시 확인하거나 같은 버튼을 누르면 동일 작업 ID로 확인합니다.':fallback;setStatus(message,true);window.AssistantRequestPanel?.setWorkspaceState(result.state==='retryable'&&workspace?'uncertain':workspace?'stale':'unchecked',message,true)}
 async function submitRequest(draft){
  if(busy||!userId||!draft)return;
  const result=await guarded(async()=>{if(!workspace)return null;const prepared=prepare('submit_assistant_request',draft.requestId,draft,()=>A.requestOperation(draft,{operationId:operationId(),intent:'submit'}));if(prepared.state==='changed')return {changed:true};setStatus(prepared.state==='retry'?'같은 작업 ID로 요청 접수 결과를 다시 확인하고 있습니다.':'요청을 서버에 접수하고 있습니다. 실행은 시작하지 않습니다.');return {prepared,result:await adapter.send(prepared.entry.operation)}});if(!result)return;if(result.changed){setStatus('결과가 불명확한 이전 접수와 내용이 달라 새 요청을 만들지 않았습니다. 서버 자료를 다시 확인해 주세요.',true);return}finish(result.prepared.key,result.result);if(['accepted','duplicate'].includes(result.result.state)){window.AssistantRequestPanel?.submitted(draft,result.result);return}operationFailure(result.result,'요청을 접수하지 못했습니다.')
 }
 async function cancelRequest(row){
  if(busy||!userId||!row)return;
  const result=await guarded(async()=>{if(!workspace)return null;const payload={requestId:row.requestId,version:row.version},prepared=prepare('cancel_assistant_request',row.requestId,payload,()=>A.cancelRequestOperation(row,{operationId:operationId()}));if(prepared.state==='changed')return {changed:true};setStatus(prepared.state==='retry'?'같은 작업 ID로 취소 결과를 다시 확인하고 있습니다.':'요청 접수를 취소하고 있습니다.');return {prepared,result:await adapter.send(prepared.entry.operation)}});if(!result)return;if(result.changed){setStatus('결과가 불명확한 취소 작업의 서버 버전이 달라 새 작업을 만들지 않았습니다. 서버 자료를 다시 확인해 주세요.',true);return}finish(result.prepared.key,result.result);if(['accepted','duplicate'].includes(result.result.state)){window.AssistantRequestPanel?.cancelled(row,result.result);return}operationFailure(result.result,'요청 접수를 취소하지 못했습니다.')
 }
 async function approveRequest(row){
  if(busy||!userId||!row||workspace?.contractVersion!==2||workspace?.approvalEnabled!==true)return;
  const result=await guarded(async()=>{const current=workspace?.requests.find(item=>item.requestId===row.requestId);if(!current||current.status!=='approval_required')return null;const payload={requestId:current.requestId,version:current.version,approvedScope:current.requestedScope},prepared=prepare('approve_assistant_request',current.requestId,payload,()=>A.approveRequestOperation(current,{operationId:operationId()}));if(prepared.state==='changed')return {changed:true};setStatus(prepared.state==='retry'?'같은 승인 ID로 결과를 다시 확인하고 있습니다.':'요청 범위를 승인하고 실행 대기로 옮기고 있습니다.');return {prepared,result:await adapter.send(prepared.entry.operation)}});if(!result)return;if(result.changed){setStatus('결과가 불명확한 승인 작업의 범위나 버전이 달라 새 승인을 만들지 않았습니다. 서버 자료를 다시 확인해 주세요.',true);return}finish(result.prepared.key,result.result);if(['accepted','duplicate'].includes(result.result.state)){window.AssistantRequestPanel?.approved(row,result.result);workspace.requests=workspace.requests.map(item=>item.requestId===row.requestId?{...item,status:'execution_waiting',version:result.result.version,approvalId:result.result.operationId,approvedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}:item);render();return}operationFailure(result.result,'요청을 승인하지 못했습니다.')
 }
 function activate(id){const next=String(id||'');if(next!==userId){generation++;workspace=null;lastGoodAt='';busy=false;pending=new Map()}userId=next;setStatus(ready?'서버 자료는 아직 확인하지 않았습니다. 로컬 일정은 자동 업로드되지 않습니다.':'개인 서버 연결 화면을 초기화하지 못했습니다. 페이지를 새로고침해 주세요.',!ready);render()}
 function deactivate(){generation++;userId='';workspace=null;lastGoodAt='';busy=false;pending=new Map();setStatus('로그인 후 개인 서버 자료를 확인할 수 있습니다.');render()}
 function init(options){config=options;ready=Boolean(config?.client?.functions?.invoke&&config?.client?.auth?.getSession&&A?.createSupabaseAdapter);adapter=ready?A.createSupabaseAdapter({invoke:(name,options)=>config.client.functions.invoke(name,options),onDenied:()=>config.onDenied?.(),...(Number.isInteger(config.timeoutMs)?{timeoutMs:config.timeoutMs}:{}),...(typeof config.schedule==='function'?{schedule:config.schedule}:{}),...(typeof config.cancelTimer==='function'?{cancel:config.cancelTimer}:{})}):null;const button=$('#assistant-workspace-refresh');if(button)button.onclick=refresh;if(!plannerListenerBound){window.addEventListener('planner:changed',event=>{if(event.detail?.userId===userId)render()});plannerListenerBound=true}if(!ready)setStatus('개인 서버 연결 화면을 초기화하지 못했습니다. 페이지를 새로고침해 주세요.',true);render();return {onRefresh:refresh,onSubmit:submitRequest,onCancel:cancelRequest,onApprove:approveRequest}}
 return {init,activate,deactivate,refresh};
})();
