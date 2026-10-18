(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.OperationsReadModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const stamp=x=>Number.isFinite(Date.parse(x||'')),number=x=>Number.isSafeInteger(x)&&x>=0?x:null;
 function freshness(at,stale=false,now=Date.now()){return !stamp(at)?'unknown':stale||now-Date.parse(at)>36*3600000?'stale':'current';}
 function isbn(value){const s=String(value||'').replace(/[\s-]/g,'');if(!/^\d{13}$/.test(s))return '';return [...s].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0)%10===0?s:'';}
 function inventory(payload,queriedAt){
  if(!payload?.meta||!Array.isArray(payload.datasets?.inventory))throw Error('SCM_SCHEMA_INVALID');
  const rows=payload.datasets.inventory,seen=new Set(),meta=payload.meta,bookshop=payload.datasets.bookshop,shop=bookshop?.items||[],shopMeta=meta.bookshop||{};
  for(const row of rows){if(!row.sku||seen.has(row.sku))throw Error('SCM_DUPLICATE_OR_MISSING_SKU');seen.add(row.sku);}
  const bySku=new Map();for(const row of shop){if(!row.sku||bySku.has(row.sku))throw Error('SCM_DUPLICATE_OR_MISSING_SKU');bySku.set(row.sku,row);}
  const editions=new Map();for(const row of rows){const k=isbn(row.isbn);if(k)editions.set(k,(editions.get(k)||0)+1);}
  const sourceStatement=String(bookshop?.sourceStatement||'');
  const structuredSources=Array.isArray(bookshop?.collectionStatus)?bookshop.collectionStatus.map(row=>{const at=stamp(row?.lastSuccessAt)?row.lastSuccessAt:null,steps=row?.steps&&typeof row.steps==='object'?Object.fromEntries(Object.entries(row.steps).map(([key,value])=>[key,stamp(value)?value:null])):null;return {id:String(row?.id||''),name:String(row?.name||'원천'),at,status:at?freshness(at):'unknown',evidenceCell:String(row?.evidenceCell||''),...(steps?{steps}:{})};}).filter(row=>row.id):[];
  const sources=structuredSources.length?structuredSources:sourceStatement.split('\n').map(line=>{const m=line.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);if(!m)return null;const at=m[2]+'T'+m[3]+':00+09:00';return {id:'',name:m[1],at,status:freshness(at),evidenceCell:''};}).filter(Boolean);const shopStatus=shopMeta.error||!bookshop?'failed':freshness(shopMeta.fetchedAt,shopMeta.stale||sources.some(s=>s.status==='stale'));
  return {status:meta.error?'stale':freshness(meta.fetchedAt,meta.stale),sourceAt:null,apiAt:meta.fetchedAt||null,queriedAt,shopStatus,shopSourceAt:null,sourceStatement,sources,shopApiAt:shopMeta.fetchedAt||null,unmappedShop:shop.filter(row=>!seen.has(row.sku)).map(row=>String(row.sku)),missingShop:rows.filter(row=>row.kind==='도서'&&!bySku.has(row.sku)).map(row=>String(row.sku)),rows:rows.map(row=>{
   const b=bySku.get(row.sku),key=isbn(row.isbn),returned=/반품|비활성/.test(row.status||''),conflict=number(row.stock)!==null&&number(row.skuStock)!==null&&row.stock!==row.skuStock;
   const physical=number(b?.physicalCount),recorded=number(b?.sellableConfirmed),evidence=b?.hasEvidence===true&&physical!==null&&recorded!==null&&recorded<=physical;
   const sellable=evidence&&!returned&&!conflict?recorded:null;
   const candidates=(bookshop?.purchaseCandidates||[]).filter(c=>isbn(c.isbn)===key&&key&&editions.get(key)===1);
   const candidate=candidates.length===1?number(candidates[0].quantity):null;
   return {sku:String(row.sku),isbn:key||'미확인',name:String(row.name||'도서명 미확인'),owner:String(row.owner||'미확인'),snapshotState:b?'matched':row.kind==='도서'?'pending':'not_applicable',ledger:number(row.stock),payhere:number(b?.payhereCount),smartstore:b?.channelMappingVerified===true?number(b?.smartstoreCount):null,smartstoreState:b?.channelMappingVerified===true?'검증된 채널 연결':/미등록/.test(b?.review||'')?'미등록 기록 · 연결 미검증':'판본 연결 미검증 · 값 보류',physical,reserved:number(b?.reserved),inbound:number(b?.pendingInbound),sellable,payhereDifference:number(b?.payhereCount)!==null&&number(row.stock)!==null?b.payhereCount-row.stock:null,scope:String(b?.scopeNote||'장소별 수량 미제공 · 집·위탁 합산 금지'),review:String(b?.review||''),stockState:returned?'반품·비활성 · 판매 제외':conflict?'원장 불일치 · 확인 필요':shopStatus!=='current'?'판매가능 확인 필요':sellable===null?(number(row.stock)===0?'장부상 품절 · 매장 미확인':'판매가능 미확인'):sellable===0?'매장 판매가능 품절':'매장 판매가능 있음',purchase:returned?null:candidate,purchaseState:returned?'반품·비활성 · 재주문 제외':candidate!==null&&candidate>0?'원천 구매 후보 · 주문 전 검토':!key||editions.get(key)!==1?'ISBN/판본 연결 미확인':bookshop?'확정 후보 없음':'후보 원천 미확인'};
  })};
 }
 function programs(apps,cohorts,queriedAt){
  if(!Array.isArray(apps)||!Array.isArray(cohorts))throw Error('PROGRAM_SCHEMA_INVALID');
  const groups=new Map();for(const c of cohorts){if(!c.id||groups.has(String(c.id)))throw Error('PROGRAM_DUPLICATE_OR_MISSING_ID');groups.set(String(c.id),c);}
  const test=a=>/테스트/.test(a.status||''),matched=a=>a.cohort_id!=null&&groups.has(String(a.cohort_id));
  const rows=[...groups].map(([id,c])=>{const list=apps.filter(a=>String(a.cohort_id)===id&&!test(a));return {key:id,title:[c.program_slug,c.cohort_name].filter(Boolean).join(' · ')||'프로그램 미확인',capacity:number(c.capacity),seatsLeft:number(c.seats_left),total:list.length,waiting:list.filter(a=>a.status==='입금대기').length,newCount:list.filter(a=>!a.status||a.status==='신규').length,confirmed:list.filter(a=>a.status==='확정').length,cancelled:list.filter(a=>['취소','환불'].includes(a.status)).length,other:list.filter(a=>a.status&&!['신규','입금대기','확정','취소','환불'].includes(a.status)).length};});
  return {status:'queried',sourceAt:null,queriedAt,rows,unmatched:apps.filter(a=>!test(a)&&!matched(a)).length,testRecords:apps.filter(test).length,possiblyTruncated:apps.length>=1000||cohorts.length>=1000};
 }
 function operationsHome({scm=null,programs=null,core={}}={}){
  const value=(ready,n)=>ready&&Number.isSafeInteger(n)&&n>=0?n:null;
  const tasks=[];
  if(scm&&scm.status!=='failed'){
   for(const row of scm.rows||[]){
    if(row.stockState&&(/품절|확인 필요|불일치/.test(row.stockState)||Number(row.purchase)>0))tasks.push({kind:'inventory',key:row.sku,title:row.name,detail:[row.stockState,Number(row.purchase)>0?`재주문 후보 ${row.purchase}권`:row.purchaseState].filter(Boolean).join(' · '),level:/확인 필요|불일치/.test(row.stockState)?'review':'action'});
   }
  }
  if(programs&&programs.status!=='failed')for(const row of programs.rows||[]){
   if(row.newCount>0)tasks.push({kind:'programs',key:row.key,title:row.title,detail:`신규 신청 ${row.newCount}건`,level:'action'});
   if(row.waiting>0)tasks.push({kind:'programs',key:row.key,title:row.title,detail:`결제대기 ${row.waiting}건 · 입금 확인은 별도`,level:'action'});
  }
  const addCore=(ready,n,kind,title,detail)=>{if(ready&&n>0)tasks.push({kind,key:kind,title,detail:`${detail} ${n}건`,level:'action'});};
  addCore(core.ordersKnown,core.newOrders,'orders','새 주문 확인','신규');addCore(core.ordersKnown,core.toShip,'orders','발송 준비 확인','처리 대기');addCore(core.inquiriesKnown,core.newInquiries,'inquiries','기관 문의 답변','신규');
  const allRequiredKnown=Boolean(scm&&scm.status!=='failed'&&programs&&programs.status!=='failed'&&core.ok!==false&&core.ordersKnown&&core.inquiriesKnown);
  return {tasks,metrics:{tasks:allRequiredKnown?tasks.length:null,knownTasks:tasks.length,allRequiredKnown,stockAttention:scm&&scm.status!=='failed'?tasks.filter(x=>x.kind==='inventory').length:null,programWaiting:programs&&programs.status!=='failed'?(programs.rows||[]).reduce((n,row)=>n+row.waiting,0):null,newOrders:value(core.ordersKnown,core.newOrders),newInquiries:value(core.inquiriesKnown,core.newInquiries)},sources:{inventory:scm?.status||'unknown',programs:programs?.status||'unknown',core:core.ok===true?'current':core.ok===false?'failed':'unknown',finance:'separate',calendar:'not_connected'}};
 }
 function dashboardCharts({scm=null,programs=null}={}){
  let inventoryChart={state:'unavailable',total:null,reorder:null,rows:[]};
  if(scm&&scm.status!=='failed'){
   const counts={soldout:0,review:0,available:0,excluded:0};
   for(const row of scm.rows||[]){
    if(/^반품·비활성/.test(row.stockState||''))counts.excluded++;
    else if(scm.shopStatus!=='current'||row.sellable===null||/불일치|확인 필요/.test(row.stockState||''))counts.review++;
    else if(row.sellable===0)counts.soldout++;
    else counts.available++;
   }
   inventoryChart={state:'ready',total:(scm.rows||[]).length,reorder:(scm.rows||[]).filter(row=>Number(row.purchase)>0).length,rows:[
    {id:'soldout',label:'판매가능 품절',value:counts.soldout,tone:'urgent'},
    {id:'review',label:'실사·연결 확인',value:counts.review,tone:'review'},
    {id:'available',label:'판매가능 확인',value:counts.available,tone:'ok'},
    {id:'excluded',label:'반품·비활성',value:counts.excluded,tone:'muted'},
   ]};
  }
  let programChart={state:'unavailable',total:null,rows:[]};
  if(programs&&programs.status!=='failed'){
   const rows=programs.rows||[],counts={new:0,waiting:0,confirmed:0,other:programs.unmatched||0,cancelled:0};
   for(const row of rows){counts.new+=row.newCount||0;counts.waiting+=row.waiting||0;counts.confirmed+=row.confirmed||0;counts.other+=row.other||0;counts.cancelled+=row.cancelled||0;}
   programChart={state:'ready',total:Object.values(counts).reduce((a,b)=>a+b,0),rows:[
    {id:'new',label:'신규',value:counts.new,tone:'review'},
    {id:'waiting',label:'결제대기',value:counts.waiting,tone:'urgent'},
    {id:'confirmed',label:'확정',value:counts.confirmed,tone:'ok'},
    {id:'other',label:'연결·상태 확인',value:counts.other,tone:'muted'},
    {id:'cancelled',label:'취소·환불',value:counts.cancelled,tone:'muted'},
   ]};
  }
  return {inventory:inventoryChart,programs:programChart};
 }
 const REQUEST_ID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 function hasSensitiveContact(body){
  if(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(body))return true;
  return /(?:^|[^\d])(?:\+?82[\s().-]*0?[\s().-]*|0)(?:1[016789]|2|3[1-3]|4[1-4]|5[0-5]|6[1-4]|70|80)[\s().-]*\d{3,4}[\s().-]*\d{4}(?:[^\d]|$)/.test(body);
 }
 function requestDraft({id,sourceKind,sourceId,sourceTitle,text,owner,due,createdAt}={}){
  const body=String(text||'').trim();
  if(!REQUEST_ID.test(String(id||'')))throw Error('REQUEST_ID_INVALID');
  if(!sourceKind||!sourceId||!sourceTitle||!body)throw Error('REQUEST_REQUIRED');
  if(hasSensitiveContact(body))throw Error('REQUEST_SENSITIVE');
  return {id:String(id),sourceKind:String(sourceKind),sourceId:String(sourceId),sourceTitle:String(sourceTitle),text:body,owner:String(owner||'팀 미지정'),due:String(due||''),createdAt:String(createdAt||''),status:'draft',delivery:'not_connected'};
 }
 function transitionRequest(row,next){
  const allowed={draft:['ready','held'],ready:['manual_delivered','held'],manual_delivered:['done','held'],held:['ready'],done:[]};
  if(!row||!allowed[row.status]?.includes(next))throw Error('REQUEST_TRANSITION_INVALID');
  return {...row,status:next,delivery:next==='manual_delivered'?'self_reported_manual':row.delivery};
 }
 function requestText(row){return [`[책공방 운영 요청] ${row.sourceTitle}`,`원천: ${row.sourceKind} / ${row.sourceId}`,`담당: ${row.owner}`,`기한: ${row.due||'미지정'}`,`요청: ${row.text}`,'주의: 이 전달문은 구매·송금·재고/일정 변경 승인이 아닙니다.'].join('\n');}
 const BACKUP_HEADER='BOOKSHOP_REQUEST_BACKUP_V1';
 function exportRequests(rows=[]){
  if(!Array.isArray(rows)||rows.length>100)throw Error('BACKUP_INVALID');
  const requests=rows.map(row=>({...requestDraft(row),status:row.status,delivery:row.delivery}));
  return BACKUP_HEADER+'\n'+JSON.stringify({version:1,exportedAt:new Date().toISOString(),requests},null,2);
 }
 function importRequests(text,existing=[]){
  const raw=String(text||'');if(raw.length>200000||!raw.startsWith(BACKUP_HEADER+'\n'))throw Error('BACKUP_INVALID');
  let parsed;try{parsed=JSON.parse(raw.slice(BACKUP_HEADER.length+1));}catch{throw Error('BACKUP_INVALID');}
  if(parsed?.version!==1||!Array.isArray(parsed.requests)||parsed.requests.length>100)throw Error('BACKUP_INVALID');
  const statuses=new Set(['draft','ready','manual_delivered','held','done']),current=new Map(existing.map(row=>[row.id,row])),added=[];let skipped=0;
  for(const rawRow of parsed.requests){
   const row={...requestDraft(rawRow),status:rawRow.status,delivery:rawRow.delivery};
   if(!statuses.has(row.status)||!['not_connected','self_reported_manual'].includes(row.delivery))throw Error('BACKUP_INVALID');
   const prior=current.get(row.id);if(prior){if(JSON.stringify(prior)!==JSON.stringify(row))throw Error('BACKUP_ID_CONFLICT');skipped++;continue;}current.set(row.id,row);added.push(row);
  }
  return {rows:[...existing,...added],added:added.length,skipped};
 }
 return {freshness,inventory,programs,operationsHome,dashboardCharts,requestDraft,transitionRequest,requestText,exportRequests,importRequests,BACKUP_HEADER};
});
