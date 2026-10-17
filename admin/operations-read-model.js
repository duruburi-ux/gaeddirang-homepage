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
  const sourceStatement=String(bookshop?.sourceStatement||''),sources=sourceStatement.split('\n').map(line=>{const m=line.match(/^(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);if(!m)return null;const at=m[2]+'T'+m[3]+':00+09:00';return {name:m[1],at,status:freshness(at)};}).filter(Boolean);const shopStatus=shopMeta.error||!bookshop?'failed':freshness(shopMeta.fetchedAt,shopMeta.stale||sources.some(s=>s.status==='stale'));
  return {status:meta.error?'stale':freshness(meta.fetchedAt,meta.stale),sourceAt:null,apiAt:meta.fetchedAt||null,queriedAt,shopStatus,shopSourceAt:null,sourceStatement,sources,shopApiAt:shopMeta.fetchedAt||null,unmappedShop:shop.filter(row=>!seen.has(row.sku)).map(row=>String(row.sku)),rows:rows.map(row=>{
   const b=bySku.get(row.sku),key=isbn(row.isbn),returned=/반품|비활성/.test(row.status||''),conflict=number(row.stock)!==null&&number(row.skuStock)!==null&&row.stock!==row.skuStock;
   const physical=number(b?.physicalCount),recorded=number(b?.sellableConfirmed),evidence=b?.hasEvidence===true&&physical!==null&&recorded!==null&&recorded<=physical;
   const sellable=evidence&&!returned&&!conflict?recorded:null;
   const candidates=(bookshop?.purchaseCandidates||[]).filter(c=>isbn(c.isbn)===key&&key&&editions.get(key)===1);
   const candidate=candidates.length===1?number(candidates[0].quantity):null;
   return {sku:String(row.sku),isbn:key||'미확인',name:String(row.name||'도서명 미확인'),owner:String(row.owner||'미확인'),ledger:number(row.stock),payhere:number(b?.payhereCount),smartstore:b?.channelMappingVerified===true?number(b?.smartstoreCount):null,smartstoreState:b?.channelMappingVerified===true?'검증된 채널 연결':/미등록/.test(b?.review||'')?'미등록 기록 · 연결 미검증':'판본 연결 미검증 · 값 보류',physical,reserved:number(b?.reserved),inbound:number(b?.pendingInbound),sellable,payhereDifference:number(b?.payhereCount)!==null&&number(row.stock)!==null?b.payhereCount-row.stock:null,scope:String(b?.scopeNote||'장소별 수량 미제공 · 집·위탁 합산 금지'),review:String(b?.review||''),stockState:returned?'반품·비활성 · 판매 제외':conflict?'원장 불일치 · 확인 필요':shopStatus!=='current'?'판매가능 확인 필요':sellable===null?(number(row.stock)===0?'장부상 품절 · 매장 미확인':'판매가능 미확인'):sellable===0?'매장 판매가능 품절':'매장 판매가능 있음',purchase:returned?null:candidate,purchaseState:returned?'반품·비활성 · 재주문 제외':candidate!==null&&candidate>0?'원천 구매 후보 · 주문 전 검토':!key||editions.get(key)!==1?'ISBN/판본 연결 미확인':bookshop?'확정 후보 없음':'후보 원천 미확인'};
  })};
 }
 function programs(apps,cohorts,queriedAt){
  if(!Array.isArray(apps)||!Array.isArray(cohorts))throw Error('PROGRAM_SCHEMA_INVALID');
  const groups=new Map();for(const c of cohorts){if(!c.id||groups.has(String(c.id)))throw Error('PROGRAM_DUPLICATE_OR_MISSING_ID');groups.set(String(c.id),c);}
  const test=a=>/테스트/.test(a.status||''),matched=a=>a.cohort_id!=null&&groups.has(String(a.cohort_id));
  const rows=[...groups].map(([id,c])=>{const list=apps.filter(a=>String(a.cohort_id)===id&&!test(a));return {key:id,title:[c.program_slug,c.cohort_name].filter(Boolean).join(' · ')||'프로그램 미확인',capacity:number(c.capacity),seatsLeft:number(c.seats_left),total:list.length,waiting:list.filter(a=>a.status==='입금대기').length,newCount:list.filter(a=>!a.status||a.status==='신규').length,confirmed:list.filter(a=>a.status==='확정').length,cancelled:list.filter(a=>['취소','환불'].includes(a.status)).length,other:list.filter(a=>a.status&&!['신규','입금대기','확정','취소','환불'].includes(a.status)).length};});
  return {status:'queried',sourceAt:null,queriedAt,rows,unmatched:apps.filter(a=>!test(a)&&!matched(a)).length,testRecords:apps.filter(test).length,possiblyTruncated:apps.length>=1000||cohorts.length>=1000};
 }
 return {freshness,inventory,programs};
});
