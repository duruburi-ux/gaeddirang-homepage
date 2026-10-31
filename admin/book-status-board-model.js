(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BookStatusBoardModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const CURRENT_OBSERVATION_MS=10*60*1000;
  const CATEGORIES=[
    {key:'selling',label:'판매 중'},
    {key:'preorder',label:'예약판매'},
    {key:'exchange',label:'교환 대기'},
    {key:'reading',label:'열람용'},
    {key:'review',label:'확인 필요'},
  ];
  const STATE_KEYS=new Map(CATEGORIES.map(({key,label})=>[label,key]));
  const normalize=value=>String(value??'').normalize('NFKC').trim();
  const compact=value=>normalize(value).replace(/\s+/g,' ');
  const timestamp=value=>Number.isFinite(Date.parse(value||''))?String(value):'';
  const isCount=value=>Number.isSafeInteger(value)&&value>=0;
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object||{},key);

  function sourceLabel(book,supplement,text){
    const sourceType=compact(supplement?.sourceType).toUpperCase();
    if(sourceType==='YES24_ARRIVAL')return 'YES24 입고';
    if(sourceType==='IDASOM_CARRYIN')return '이다솜 반입';
    if(sourceType==='EXISTING_READING')return '기존 열람용';
    if(/YES24/.test(text))return 'YES24 입고';
    if(/이다솜.*반입|이다솜.*가져/.test(text))return '이다솜 반입';
    if(/열람용|비판매|개인\s*소장/.test(text))return '기존 열람용';
    return compact(supplement?.ownership||book.owner||'')||'기존 장부';
  }

  function channelObservation(supplement,now){
    const state=compact(supplement?.channelState).toUpperCase();
    const verifiedAt=timestamp(supplement?.channelVerifiedAt);
    if(state==='UNVERIFIED'||!state)return {key:'unverified',label:'검증 미확인',verifiedAt:'',current:false};
    if(!['SALE','SUSPENSION'].includes(state)||!verifiedAt)return {key:'conflict',label:'근거 충돌',verifiedAt,current:false};
    const age=now-Date.parse(verifiedAt);
    if(age<0||age>CURRENT_OBSERVATION_MS)return {key:'historical',label:`과거 ${state==='SALE'?'판매':'판매중지'} 관측`,verifiedAt,current:false};
    return {key:state==='SALE'?'selling':'suspended',label:`현재 ${state==='SALE'?'판매':'판매중지'} 관측`,verifiedAt,current:true};
  }

  function legacyDecision(text){
    if(/교환.*(?:대기|격리)|(?:대기|격리).*교환/.test(text))return ['exchange','자유문에 교환·격리 표시가 있습니다.'];
    if(/열람용|비판매|개인\s*소장/.test(text))return ['reading','자유문에 열람·비판매 표시가 있습니다.'];
    if(/예약\s*판매/.test(text))return ['preorder','자유문에 예약판매 표시가 있습니다.'];
    return ['review','구조화된 상태 근거가 없습니다.'];
  }

  function classify(book,supplement,meta,{structured=false,now=Date.now()}={}){
    const fields=[book.status,book.note,book.owner,supplement?.review,supplement?.ownership,supplement?.scopeNote];
    const text=compact(fields.filter(Boolean).join(' · '));
    const [legacyCategory,legacyBasis]=legacyDecision(text);
    const category=structured?(STATE_KEYS.get(compact(supplement?.operationalState))||'review'):legacyCategory;
    if(structured&&!own(supplement,'operationalState'))throw Error('INCOMPLETE_BOOK_STATUS_COVERAGE');
    const observation=structured?channelObservation(supplement,now):{key:'unverified',label:'구조화 관측 없음',verifiedAt:'',current:false};
    if(structured&&category==='selling'&&observation.key!=='selling'&&observation.key!=='historical')throw Error('BOOK_STATUS_CONFLICT');
    if(structured&&['review','exchange','reading'].includes(category)&&observation.key==='selling')throw Error('BOOK_STATUS_CONFLICT');
    const userDecisionAt=timestamp(supplement?.userDecisionAt);
    const decision=structured?(userDecisionAt?'승인 기록 있음':'확인 필요'):(/사용자\s*(?:승인|확정|지시)/.test(text)?'자유문 확인':'미확인');
    const basis=structured?`${CATEGORIES.find(item=>item.key===category)?.label||'확인 필요'} 구조화 분류${observation.current?' · 최근 채널 관측 있음':observation.key==='historical'?' · 채널 관측이 10분을 지남':' · 현재 채널 관측 없음'}`:legacyBasis;
    const nextAction=category==='selling'?(observation.current?'실물 근거와 계속 대조':'채널을 다시 확인'):category==='preorder'?(observation.current?'출고 예정과 고객 도착을 구분':'예약판매 채널 반영을 확인'):category==='exchange'?'교환 완료 근거 전에는 판매 재개 금지':category==='reading'?'판매 재고와 분리 유지':isCount(supplement?.pendingInbound)&&supplement.pendingInbound>0?'실입고 후 상태를 다시 확인':'판본·실물·채널 근거 확인';
    return {category,basis,decision,userDecisionAt,observation,lastChecked:observation.verifiedAt||timestamp(meta?.bookshop?.fetchedAt)||timestamp(meta?.fetchedAt),nextAction,source:sourceLabel(book,supplement,text),structured};
  }

  function build({inventory=[],bookshop=null,meta={},now=Date.now()}={}){
    if(!Array.isArray(inventory))throw Error('INVALID_INVENTORY');
    const supplements=Array.isArray(bookshop?.items)?bookshop.items:[];
    const contract=bookshop?.statusContract;
    const structured=contract?.version===1&&['complete','partial'].includes(contract?.coverage)&&Number.isSafeInteger(contract.coveredItems)&&Number.isSafeInteger(contract.totalItems)&&contract.coveredItems>=0&&contract.coveredItems<=contract.totalItems;
    const bySku=new Map();
    for(const item of supplements){const sku=compact(item?.sku);if(!sku)throw Error('INCOMPLETE_BOOK_STATUS_COVERAGE');if(bySku.has(sku))throw Error('DUPLICATE_BOOK_STATUS_SKU');bySku.set(sku,item)}
    if(structured&&bySku.size!==contract.totalItems)throw Error('INCOMPLETE_BOOK_STATUS_COVERAGE');
    const inventoryBooks=inventory.filter(row=>row?.kind==='도서'),inventoryBySku=new Map();
    for(const book of inventoryBooks){const sku=compact(book?.sku);if(!sku)continue;if(inventoryBySku.has(sku))throw Error('DUPLICATE_BOOK_STATUS_SKU');inventoryBySku.set(sku,book)}
    const outsideScopeItems=structured?[...inventoryBySku.keys()].filter(sku=>!bySku.has(sku)).length:0;
    const missingInventoryItems=structured?[...bySku.keys()].filter(sku=>!inventoryBySku.has(sku)).length:0;
    if(structured&&missingInventoryItems)throw Error('INCOMPLETE_BOOK_STATUS_COVERAGE');
    const scoped=structured?[...bySku].map(([sku,supplement])=>({sku,book:inventoryBySku.get(sku)||{},supplement})):inventoryBooks.map(book=>({sku:compact(book.sku),book,supplement:bySku.get(compact(book.sku))||null}));
    const items=[];
    for(const {sku,book,supplement} of scoped){
      const rowStructured=structured&&supplement&&own(supplement,'operationalState');
      const classification=classify(book,supplement,meta,{structured:rowStructured,now});
      items.push({sku,title:compact(book.name)||'도서명 미확인',isbn:compact(book.isbn||book.barcode)||'미확인',recordedStock:isCount(book.stock)?book.stock:null,sellableConfirmed:isCount(supplement?.sellableConfirmed)?supplement.sellableConfirmed:null,pendingInbound:isCount(supplement?.pendingInbound)?supplement.pendingInbound:null,reserved:isCount(supplement?.reserved)?supplement.reserved:null,...classification});
    }
    const coveredItems=items.filter(item=>item.structured).length;
    if(structured&&coveredItems!==contract.coveredItems)throw Error('INCOMPLETE_BOOK_STATUS_COVERAGE');
    const coverage=structured?(coveredItems===contract.totalItems?'complete':'partial'):(coveredItems?'partial':'legacy');
    if(structured&&coverage!==contract.coverage)throw Error('INCOMPLETE_BOOK_STATUS_COVERAGE');
    const structuredItems=items.filter(item=>item.structured);
    const grouped=Object.fromEntries(CATEGORIES.map(({key})=>[key,structuredItems.filter(item=>item.category===key)]));
    const metrics=Object.fromEntries(CATEGORIES.map(({key,label})=>[key,{label,count:coveredItems?grouped[key].length:null}]));
    const channelMetrics=coveredItems?{selling:structuredItems.filter(item=>item.observation.key==='selling').length,suspended:structuredItems.filter(item=>item.observation.key==='suspended').length,historical:structuredItems.filter(item=>item.observation.key==='historical').length,unverified:structuredItems.filter(item=>['unverified','conflict'].includes(item.observation.key)).length}:null;
    const fetchedAt=timestamp(meta?.bookshop?.fetchedAt)||timestamp(meta?.fetchedAt);
    const totalItems=structured?contract.totalItems:items.length;
    const baseScope=compact(bookshop?.scopeStatement)||'같은 SCM 도서 SKU 모수 · 권수 합계 아님';
    const scope=structured?`${baseScope} · 상태 계약 ${totalItems} SKU · SCM 도서 ${inventoryBySku.size}종 중 계약 밖 ${outsideScopeItems}종 별도`:baseScope;
    return {items,structuredItems,grouped,metrics,channelMetrics,fetchedAt,stale:Boolean(meta?.stale||meta?.bookshop?.stale),coverage,coveredItems,unclassifiedItems:totalItems-coveredItems,totalItems,outsideScopeItems,missingInventoryItems,inventoryItems:inventoryBySku.size,wholePhysicalCensusComplete:false,scope};
  }

  return {CATEGORIES,CURRENT_OBSERVATION_MS,build,classify};
});
