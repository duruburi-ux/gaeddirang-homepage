(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BookFinderModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const UNKNOWN='미등록';
  const VERIFIED_COVERS=new Map([
    ['9791199271524','../assets/moongori/cover.png'],
  ]);
  const isCount=value=>Number.isSafeInteger(value);
  const normalizeText=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
  const normalizeIsbn=value=>String(value??'').normalize('NFKC').toUpperCase().replace(/[^0-9X]/g,'');
  const timeValue=value=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0};
  const SOURCE_AGE_MS=36*60*60*1000,API_AGE_MS=10*60*1000;
  function timestamp(value){
    if(typeof value!=='string')return null;
    const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
    if(!match)return null;
    const [,year,month,day,hour,minute,second,zone]=match,n=Number(year),m=Number(month),d=Number(day);
    const days=[31,n%4===0&&(n%100!==0||n%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
    if(m<1||m>12||d<1||d>days[m-1]||Number(hour)>23||Number(minute)>59||Number(second)>59)return null;
    if(zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59))return null;
    return Number.isFinite(Date.parse(value))?value:null;
  }
  function clockState(value,now,maxAge){
    const at=timestamp(value);if(!at||!Number.isFinite(now))return 'unknown';
    const age=now-Date.parse(at);return age<0?'unknown':age>maxAge?'stale':'current';
  }
  function readSafety(bookshop,meta={},now=Date.now()){
    const rows=Array.isArray(bookshop?.collectionStatus)?bookshop.collectionStatus:[],seen=new Set(),duplicates=new Set();
    const sources=rows.filter(row=>row&&typeof row==='object'&&typeof row.id==='string'&&row.id.trim()).map(row=>{
      const id=row.id.trim();if(seen.has(id))duplicates.add(id);seen.add(id);
      const observedAt=timestamp(row.lastSuccessAt),steps={};
      if(row.steps&&typeof row.steps==='object'&&!Array.isArray(row.steps))for(const [key,value]of Object.entries(row.steps))steps[key]=timestamp(value);
      const state=row.status==='failed'||row.error?'failed':row.status!=null&&row.status!=='success'?'unknown':clockState(observedAt,now,SOURCE_AGE_MS);
      return {id,name:String(row.name||'원천'),observedAt,state,steps};
    });
    for(const source of sources)if(duplicates.has(source.id))source.state='unknown';
    const apiAt=timestamp(meta?.fetchedAt),bookshopApiAt=timestamp(meta?.bookshop?.fetchedAt);
    const apiStates=[clockState(apiAt,now,API_AGE_MS),clockState(bookshopApiAt,now,API_AGE_MS)];
    const required=['scm','payhere','smartstore'].map(id=>sources.find(row=>row.id===id)?.state||'unknown');
    const states=[...apiStates,...required];
    const failed=Boolean(meta?.error||meta?.bookshop?.error||required.includes('failed'));
    const state=failed?'failed':!bookshop||states.includes('unknown')?'unknown':meta?.stale||meta?.bookshop?.stale||states.includes('stale')?'stale':'current';
    // These separate clocks/fields are not delivered by the current response.
    return {apiAt,bookshopApiAt,sources,state,transactionAt:null,physicalObservedAt:null,opinionProvided:false,collectionCompleteness:null,automaticAdjustmentAllowed:false};
  }

  function latestCount(counts,sku){
    return (Array.isArray(counts)?counts:[]).filter(row=>row&&String(row.sku||'')===String(sku||'')).sort((a,b)=>timeValue(b.date)-timeValue(a.date))[0]||null;
  }

  function stockLabel(item){
    if(!isCount(item.stock))return '장부 수량 미확인';
    if(item.stock<0)return `장부상 ${item.stock}권 · 실사 필요`;
    if(String(item.status||'').includes('반품'))return `장부상 ${item.stock}권 · 판매 가능 여부 확인`;
    if(item.stock===0)return '장부상 0권 · 실물 확인 필요';
    return `장부상 ${item.stock}권 · 실물 확인 필요`;
  }

  function bookRows(inventory=[],counts=[],fetchedAt='',bookshop=null,meta={},now=Date.now()){
    const books=(Array.isArray(inventory)?inventory:[]).filter(item=>item?.kind==='도서');
    const supplementBySku=new Map(),duplicateSkus=new Set();
    for(const item of Array.isArray(bookshop?.items)?bookshop.items:[]){
      if(!item||typeof item!=='object'||!String(item.sku||'').trim())continue;
      const sku=String(item.sku);if(supplementBySku.has(sku))duplicateSkus.add(sku);supplementBySku.set(sku,item);
    }
    const candidatesByIsbn=new Map();
    for(const item of Array.isArray(bookshop?.purchaseCandidates)?bookshop.purchaseCandidates:[]){
      if(!item||typeof item!=='object')continue;const key=normalizeIsbn(item.isbn);if(key)candidatesByIsbn.set(key,candidatesByIsbn.has(key)?null:item.quantity);
    }
    const safety=readSafety(bookshop,{...meta,fetchedAt:meta?.fetchedAt||fetchedAt},now);
    const titleCounts=new Map();
    for(const item of books){const key=normalizeText(item.name);titleCounts.set(key,(titleCounts.get(key)||0)+1)}
    return books.map(item=>{
      const counted=latestCount(counts,item.sku);
      const duplicateSupplement=duplicateSkus.has(String(item.sku||''));
      const supplement=duplicateSupplement?null:supplementBySku.get(String(item.sku||''));
      const stockConflict=isCount(item.stock)&&isCount(item.skuStock)&&item.stock!==item.skuStock;
      const countConflict=!!counted&&isCount(counted.count)&&isCount(item.stock)&&counted.count!==item.stock;
      const ledgerConflict=isCount(item.stock)&&isCount(supplement?.ledgerCount)&&item.stock!==supplement.ledgerCount;
      const conflicts=[stockConflict?'원본 수량 불일치':'',countConflict?'최근 실사 수량 불일치':'',ledgerConflict?'통합 장부 수량 불일치':'',duplicateSupplement?'통합 재고 SKU 중복 · 연결 미확인':''].filter(Boolean);
      const isbn=String(item.isbn||item.barcode||'').trim();
      const reserved=isCount(supplement?.reserved)&&supplement.reserved>=0?supplement.reserved:null;
      const incoming=isCount(supplement?.pendingInbound)?supplement.pendingInbound:null;
      const ledgerCount=isCount(supplement?.ledgerCount)?supplement.ledgerCount:null;
      const calculatedAvailable=isCount(ledgerCount)&&isCount(reserved)?Math.max(ledgerCount-reserved,0):null;
      const physicalCount=isCount(supplement?.physicalCount)&&supplement.physicalCount>=0?supplement.physicalCount:null;
      const physicalCheck=String(supplement?.physicalCheck||UNKNOWN);
      const physicalCheckComplete=/^(확인|완료|확정|실사 완료|사용자 확인)$/.test(physicalCheck);
      const hasPhysicalEvidence=physicalCount!=null&&physicalCheckComplete&&supplement?.hasEvidence===true;
      const savedSellable=isCount(supplement?.sellableConfirmed)&&supplement.sellableConfirmed>=0?supplement.sellableConfirmed:null;
      const sellableConfirmed=safety.state==='current'&&hasPhysicalEvidence&&reserved!==null&&savedSellable!==null&&reserved<=physicalCount&&savedSellable<=physicalCount-reserved&&conflicts.length===0&&!/반품|비활성/.test(String(item.status||''))?savedSellable:null;
      return {
        sku:String(item.sku||''),title:String(item.name||UNKNOWN),author:String(item.author||UNKNOWN),isbn:isbn||UNKNOWN,
        category:String(item.category||UNKNOWN),owner:String(item.owner||UNKNOWN),note:String(item.note||''),
        recordedStock:isCount(item.stock)?item.stock:null,masterStock:isCount(item.skuStock)?item.skuStock:null,
        stockLabel:stockLabel(item),status:String(item.status||'수량 미확인'),conflicts,hasConflict:conflicts.length>0,
        sameTitleCount:titleCounts.get(normalizeText(item.name))||1,
        edition:titleCounts.get(normalizeText(item.name))>1?'동명 도서 · ISBN과 SKU로 구분':UNKNOWN,
        shelf:UNKNOWN,reserved,incoming,ledgerCount,calculatedAvailable,sellableConfirmed,savedSellable,readSafety:safety,
        sellableLabel:isCount(sellableConfirmed)?`매장 판매 가능 확정 ${sellableConfirmed}권`:'매장 판매 가능 · 확인 필요',
        physicalCount,physicalCheck,hasPhysicalEvidence,
        payhereCount:isCount(supplement?.payhereCount)?supplement.payhereCount:null,smartstoreCount:isCount(supplement?.smartstoreCount)?supplement.smartstoreCount:null,
        smartstoreCandidateCount:isCount(supplement?.smartstoreCandidateCount)?supplement.smartstoreCandidateCount:null,
        purchaseCandidate:candidatesByIsbn.has(normalizeIsbn(isbn))?(isCount(candidatesByIsbn.get(normalizeIsbn(isbn)))?candidatesByIsbn.get(normalizeIsbn(isbn)):null):(bookshop?0:null),
        bookshopLinked:Boolean(supplement),bookshopAvailable:Boolean(bookshop),review:String(supplement?.review||''),scopeNote:String(supplement?.scopeNote||''),
        countAt:String(counted?.date||UNKNOWN),countScope:String(counted?.scope||UNKNOWN),countQuantity:isCount(counted?.count)?counted.count:null,countRecorded:Boolean(counted),
        sourceCheckedAt:String(fetchedAt||''),coverUrl:VERIFIED_COVERS.get(normalizeIsbn(isbn))||'',
        _title:normalizeText(item.name),_author:normalizeText(item.author),_isbn:normalizeIsbn(isbn),_sku:normalizeText(item.sku),
      };
    });
  }

  function rank(row,queryText){
    if(row._title===queryText)return 0;
    if(row._title.startsWith(queryText))return 1;
    if(row._author===queryText)return 2;
    if(row._author.startsWith(queryText))return 3;
    return 4;
  }

  function searchBooks({inventory=[],counts=[],bookshop=null,query='',fetchedAt='',meta={},now=Date.now()}={}){
    const raw=String(query??'').trim(),rows=bookRows(inventory,counts,fetchedAt,bookshop,meta,now);
    if(!raw)return {items:[],total:rows.length,query:'',exactIsbn:false,conflictTotal:rows.filter(row=>row.hasConflict).length};
    const queryText=normalizeText(raw),queryIsbn=normalizeIsbn(raw);
    const isbnLike=/^[\dXx\s-]+$/.test(raw)&&queryIsbn.length>=10;
    const exact=isbnLike?rows.filter(row=>row._isbn===queryIsbn):[];
    const items=(exact.length?exact:rows.filter(row=>[row._title,row._author,row._isbn,row._sku].some(value=>value.includes(queryText)||(queryIsbn&&value.includes(queryIsbn)))))
      .sort((a,b)=>rank(a,queryText)-rank(b,queryText)||a.title.localeCompare(b.title,'ko')||a.isbn.localeCompare(b.isbn,'ko'));
    return {items,total:rows.length,query:raw,exactIsbn:exact.length>0,conflictTotal:rows.filter(row=>row.hasConflict).length};
  }

  return {UNKNOWN,normalizeText,normalizeIsbn,bookRows,searchBooks,stockLabel,readSafety};
});
