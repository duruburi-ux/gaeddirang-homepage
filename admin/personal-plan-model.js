(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.PersonalPlanModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const VERSION=1,PRIORITIES=['normal','high'],SOURCE_KINDS=['personal','notion_work'];
 const clean=(value,max=1000)=>String(value??'').trim().slice(0,max);
 const iso=value=>{const text=clean(value,40);return Number.isFinite(Date.parse(text))?new Date(text).toISOString():''};
 const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
 const nowIso=now=>new Date(now??Date.now()).toISOString();
 const makeId=()=>globalThis.crypto?.randomUUID?.()||`plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
 function dayKey(value=new Date()){
  const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return'';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),pick=type=>parts.find(part=>part.type===type)?.value||'';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
 }
 function emptyState(now){return {version:VERSION,items:[],history:[],updatedAt:nowIso(now)}}
 const sourceKey=value=>value?.sourceKind&&value?.sourceId?`${value.sourceKind}:${value.sourceId}`:'';
 function normalizeItem(value,{now}={}){
  const sourceKind=SOURCE_KINDS.includes(value?.sourceKind)?value.sourceKind:'personal',sourceId=clean(value?.sourceId,160),title=clean(value?.title,200),id=clean(value?.id,120)||makeId();
  if(!title)throw Error('PLAN_TITLE_REQUIRED');
  if(sourceKind!=='personal'&&!sourceId)throw Error('PLAN_SOURCE_REQUIRED');
  return {id,sourceKind,sourceId:sourceKind==='personal'?(sourceId||id):sourceId,sourceTitle:clean(value?.sourceTitle,200),sourceTeamDue:day(value?.sourceTeamDue),sourceStatus:clean(value?.sourceStatus,80),title,project:clean(value?.project,120),plannedOn:day(value?.plannedOn),priority:PRIORITIES.includes(value?.priority)?value.priority:'normal',memo:clean(value?.memo,1200),done:Boolean(value?.done),createdAt:iso(value?.createdAt)||nowIso(now),updatedAt:iso(value?.updatedAt)||nowIso(now),localEditedAt:iso(value?.localEditedAt),baseSourceUpdatedAt:iso(value?.baseSourceUpdatedAt)};
 }
 function validateState(input,{now}={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||input.version!==VERSION||!Array.isArray(input.items)||!Array.isArray(input.history))throw Error('PLAN_STATE_INVALID');
  if(input.items.length>2000||input.history.length>10000)throw Error('PLAN_STATE_TOO_LARGE');
  const ids=new Set(),sources=new Set(),items=input.items.map(raw=>{const item=normalizeItem(raw,{now});if(ids.has(item.id))throw Error('PLAN_ID_DUPLICATE');ids.add(item.id);const key=sourceKey(item);if(sources.has(key))throw Error('PLAN_SOURCE_DUPLICATE');sources.add(key);return item});
  const today=dayKey(new Date(now??Date.now()));if(items.filter(item=>!item.done&&item.plannedOn===today).length>3)throw Error('PLAN_TODAY_LIMIT');
  const history=input.history.slice(-10000).map(row=>({id:clean(row?.id,120)||makeId(),at:iso(row?.at)||nowIso(now),action:clean(row?.action,80)||'변경',itemId:clean(row?.itemId,120),detail:clean(row?.detail,300)}));
  return {version:VERSION,items,history,updatedAt:iso(input.updatedAt)||nowIso(now)};
 }
 function record(state,action,item,detail='',now){state.history.push({id:makeId(),at:nowIso(now),action,itemId:item?.id||'',detail:clean(detail,300)});if(state.history.length>10000)state.history=state.history.slice(-10000);state.updatedAt=nowIso(now)}
 function addPersonal(state,input,{now}={}){
  const item=normalizeItem({...input,id:input?.id||makeId(),sourceKind:'personal',sourceId:input?.id||'',sourceTitle:''},{now});item.sourceId=item.id;item.localEditedAt=nowIso(now);state.items.push(item);record(state,'개인 할 일 추가',item,item.title,now);return item;
 }
 function importSource(state,source,{now}={}){
  const descriptor={sourceKind:clean(source?.sourceKind,40),sourceId:clean(source?.sourceId,160),title:clean(source?.title,200),project:clean(source?.project,120),updatedAt:iso(source?.updatedAt),teamDue:day(String(source?.teamDue||'').slice(0,10)),status:clean(source?.status,80)};
  if(descriptor.sourceKind!=='notion_work'||!descriptor.sourceId||!descriptor.title||!descriptor.updatedAt)throw Error('PLAN_SOURCE_INVALID');
  const same=state.items.filter(item=>sourceKey(item)===`${descriptor.sourceKind}:${descriptor.sourceId}`);if(same.length>1)throw Error('PLAN_SOURCE_DUPLICATE');
  if(same.length===1)return {outcome:'duplicate',item:same[0]};
  const item=normalizeItem({id:makeId(),sourceKind:descriptor.sourceKind,sourceId:descriptor.sourceId,sourceTitle:descriptor.title,sourceTeamDue:descriptor.teamDue,sourceStatus:descriptor.status,title:descriptor.title,project:descriptor.project,plannedOn:'',priority:'normal',memo:'',baseSourceUpdatedAt:descriptor.updatedAt},{now});state.items.push(item);record(state,'원천 업무 연결',item,descriptor.title,now);return {outcome:'imported',item};
 }
 function commitDraft(state,draft){state.version=draft.version;state.items=draft.items;state.history=draft.history;state.updatedAt=draft.updatedAt;return state}
 function batchImportSources(state,sources,{now}={}){
  if(!Array.isArray(sources)||!sources.length)throw Error('PLAN_BATCH_EMPTY');
  const draft=validateState(JSON.parse(JSON.stringify(state)),{now}),seen=new Set();let imported=0,duplicates=0;
  for(const source of sources){const key=`${clean(source?.sourceKind,40)}:${clean(source?.sourceId,160)}`;if(!source?.sourceId||seen.has(key))throw Error('PLAN_BATCH_SOURCE_DUPLICATE');seen.add(key);const result=importSource(draft,source,{now});if(result.outcome==='imported')imported++;else duplicates++}
  commitDraft(state,draft);return {outcome:'success',imported,duplicates,total:sources.length};
 }
 function batchScheduleSources(state,sourceIds,plannedOn,{now}={}){
  const ids=[...new Set((Array.isArray(sourceIds)?sourceIds:[]).map(value=>clean(value,160)).filter(Boolean))],date=day(plannedOn);
  if(!ids.length)throw Error('PLAN_BATCH_EMPTY');if(!date)throw Error('PLAN_BATCH_DATE_REQUIRED');
  const draft=validateState(JSON.parse(JSON.stringify(state)),{now}),items=ids.map(id=>draft.items.find(item=>item.sourceKind==='notion_work'&&item.sourceId===id));
  if(items.some(item=>!item))throw Error('PLAN_BATCH_SOURCE_NOT_LINKED');
  for(const item of items)update(draft,item.id,{plannedOn:date},{now});commitDraft(state,draft);return {outcome:'success',updated:items.length,plannedOn:date};
 }
 function sourceStatus(item,source){
  if(!item||!source||sourceKey(item)!==`${source.sourceKind}:${source.sourceId}`)return {state:'missing'};
  const incoming=Date.parse(source.updatedAt||''),base=Date.parse(item.baseSourceUpdatedAt||''),local=Date.parse(item.localEditedAt||'');
  if(!Number.isFinite(incoming)||!Number.isFinite(base)||incoming<=base)return {state:'current'};
  return Number.isFinite(local)&&local>base?{state:'conflict',message:'원본이 갱신됐지만 내 계획은 유지했습니다.'}:{state:'updated',message:'원본에 새 갱신이 있습니다.'};
 }
 function acknowledgeSource(state,itemId,source,{now}={}){
  const item=state.items.find(row=>row.id===itemId);if(!item||sourceKey(item)!==`${source?.sourceKind}:${source?.sourceId}`)throw Error('PLAN_SOURCE_INVALID');
  const updated=iso(source.updatedAt);if(!updated)throw Error('PLAN_SOURCE_INVALID');item.sourceTitle=clean(source.title,200)||item.sourceTitle;item.sourceTeamDue=day(String(source.teamDue||'').slice(0,10));item.sourceStatus=clean(source.status,80);item.baseSourceUpdatedAt=updated;item.updatedAt=nowIso(now);record(state,'원본 갱신 확인',item,item.sourceTitle,now);return item;
 }
 function update(state,itemId,patch,{now}={}){
  const index=state.items.findIndex(item=>item.id===itemId);if(index<0)throw Error('PLAN_ITEM_MISSING');const current=state.items[index];
  const next=normalizeItem({...current,title:patch?.title??current.title,project:patch?.project??current.project,plannedOn:patch?.plannedOn??current.plannedOn,priority:patch?.priority??current.priority,memo:patch?.memo??current.memo,done:patch?.done??current.done,updatedAt:nowIso(now),localEditedAt:nowIso(now)},{now});
  if(next.plannedOn&&next.plannedOn===dayKey(new Date(now??Date.now()))&&!next.done&&state.items.filter(item=>item.id!==itemId&&!item.done&&item.plannedOn===next.plannedOn).length>=3)throw Error('PLAN_TODAY_LIMIT');
  state.items[index]=next;record(state,'개인 계획 수정',next,next.title,now);return next;
 }
 function placeToday(state,itemId,{now}={}){return update(state,itemId,{plannedOn:dayKey(new Date(now??Date.now())),done:false},{now})}
 function applyServerPlan(state,row,{now}={}){
  if(!row||typeof row!=='object'||!Number.isInteger(row.version)||row.version<1||row.archived)throw Error('PLAN_SERVER_ITEM_INVALID');
  const incoming=normalizeItem({id:row.id,sourceKind:row.sourceKind,sourceId:row.sourceId,sourceTitle:row.sourceTitle,sourceTeamDue:row.sourceTeamDue,sourceStatus:row.sourceStatus,title:row.title,project:row.project,plannedOn:row.plannedOn,priority:row.priority,memo:row.memo,done:row.done,createdAt:row.updatedAt,updatedAt:row.updatedAt,localEditedAt:'',baseSourceUpdatedAt:''},{now});
  const index=state.items.findIndex(item=>item.id===incoming.id),sameSource=state.items.findIndex(item=>sourceKey(item)===sourceKey(incoming));
  if(sameSource>=0&&sameSource!==index)throw Error('PLAN_SOURCE_DUPLICATE');
  if(index>=0){incoming.createdAt=state.items[index].createdAt;state.items[index]=incoming}else state.items.push(incoming);
  record(state,index>=0?'서버 일정 적용':'서버 일정 가져오기',incoming,incoming.title,now);return incoming;
 }
 function scheduleBoundary(item,source){
  const liveDue=day(String(source?.teamDue||'').slice(0,10)),snapshotDue=day(item?.sourceTeamDue),teamDue=liveDue||snapshotDue;
  return {teamDue,fromLive:Boolean(liveDue),plannedOn:day(item?.plannedOn),afterTeamDue:Boolean(teamDue&&item?.plannedOn&&item.plannedOn>teamDue)};
 }
 function projectSummary(state){const map=new Map();for(const item of state.items){const name=item.project||'프로젝트 없음',row=map.get(name)||{name,total:0,done:0,today:0};row.total++;if(item.done)row.done++;if(!item.done&&item.plannedOn===dayKey())row.today++;map.set(name,row)}return [...map.values()].sort((a,b)=>b.today-a.today||a.name.localeCompare(b.name,'ko'))}
 return {VERSION,PRIORITIES,SOURCE_KINDS,emptyState,validateState,normalizeItem,sourceKey,dayKey,addPersonal,importSource,batchImportSources,batchScheduleSources,sourceStatus,acknowledgeSource,update,placeToday,applyServerPlan,scheduleBoundary,projectSummary};
});
