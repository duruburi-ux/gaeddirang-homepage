// Payhere export parsing and deterministic SCM import planning.
// The browser controller lives in integration.js; these pure helpers are tested in Node.
((root) => {
  'use strict';

  const ALIASES={
    // Direct-book names currently used in Payhere.
    '불편한거야불편한건':{sku:'GDR-B-0027',title:'이러나저러나 불편한 거야 불편한 건'},
    '우울의바깥을향하며':{sku:'GDR-B-0025',title:'우울의 바깥을 향하며'},
    // Keyword blind books. Inventory is deducted from the contained book SKU.
    '키워드바깥우울의바깥을향하며':{sku:'GDR-B-0025',title:'우울의 바깥을 향하며'},
    '키워드괜찮다어느날문득잘살고싶어졌다':{sku:'GDR-B-0032',title:'어느 날 문득 잘 살고 싶어졌다'},
    '키워드경험백빵기행2':{sku:'GDR-B-0023',title:'백빵기행 2'},
    '키워드문문고리':{sku:'GDR-B-0031',title:'문고리'},
    '키워드사랑가족이어서할수없는이야기':{sku:'GDR-B-0036',title:'가족이어서 할 수 없는 이야기'},
    '키워드처음백빵기행1':{sku:'GDR-B-0022',title:'백빵기행 1'},
    '키워드알다나에게도빵빵한하루가필요해':{sku:'GDR-B-0030',title:'나에게도 빵빵한 하루가 필요해!'},
    '키워드용기불안과밤산책':{sku:'GDR-B-0026',title:'불안과 밤 산책'},
    '키워드감정모든감정도감':{sku:'GDR-B-0028',title:'모든 감정 도감'},
    '키워드궁금하다이러나저러나불편한거야불편한건':{sku:'GDR-B-0027',title:'이러나저러나 불편한 거야 불편한 건'},
    // Earlier Payhere labels remain valid during the naming transition.
    '바깥우울바깥':{sku:'GDR-B-0025',title:'우울의 바깥을 향하며'},
    '괜찮다어문잘':{sku:'GDR-B-0032',title:'어느 날 문득 잘 살고 싶어졌다'},
    '경험백빵기행2':{sku:'GDR-B-0023',title:'백빵기행 2'},
    '문문고리':{sku:'GDR-B-0031',title:'문고리'},
    '사랑가족이어서':{sku:'GDR-B-0036',title:'가족이어서 할 수 없는 이야기'},
    '처음백빵기행1':{sku:'GDR-B-0022',title:'백빵기행 1'},
    '알다나빵해':{sku:'GDR-B-0030',title:'나에게도 빵빵한 하루가 필요해!'},
    '용기불안과밤산책':{sku:'GDR-B-0026',title:'불안과 밤 산책'},
    '감정모든감정도감':{sku:'GDR-B-0028',title:'모든 감정 도감'},
    '궁금하다불편한거야불편한건':{sku:'GDR-B-0027',title:'이러나저러나 불편한 거야 불편한 건'},
    // Emotion blind books.
    '감정불안하다문고리':{sku:'GDR-B-0031',title:'문고리'},
    '감정즐겁다백빵기행2':{sku:'GDR-B-0023',title:'백빵기행 2'},
    '감정미안하다어느날문득잘살고싶어졌다':{sku:'GDR-B-0032',title:'어느 날 문득 잘 살고 싶어졌다'},
    '감정두근거리다이러나저러나불편한거야불편한건':{sku:'GDR-B-0027',title:'이러나저러나 불편한 거야 불편한 건'},
    '불안하다문고리':{sku:'GDR-B-0031',title:'문고리'},
    '즐겁다백빵2':{sku:'GDR-B-0023',title:'백빵기행 2'},
    '미안하다어문잘':{sku:'GDR-B-0032',title:'어느 날 문득 잘 살고 싶어졌다'},
    '두근거리다불편한거야':{sku:'GDR-B-0027',title:'이러나저러나 불편한 거야 불편한 건'}
  };
  const EXCLUDED_NAMES=new Set(['감정엽서키트']);
  const number=v=>Number.isFinite(Number(v))?Number(v):0;
  const text=v=>String(v??'').trim();
  const normalizeName=v=>text(v).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
  const findRow=(rows,label)=>rows.findIndex(r=>r.some(v=>text(v)===label));
  const periodFrom=rows=>{
    for(const row of rows)for(const value of row){const m=text(value).match(/(\d{4}-\d{2}-\d{2})\s*[~～-]\s*(\d{4}-\d{2}-\d{2})/);if(m)return {start:m[1],end:m[2]}}
    return {start:null,end:null};
  };
  const headerMap=row=>Object.fromEntries(row.map((v,i)=>[text(v),i]));

  function parseSheets(sheets,fileName='페이히어 매출내역.xlsx'){
    const sales=sheets['매출 내역'],products=sheets['상품별'];
    if(!Array.isArray(sales)||!Array.isArray(products))throw Error('PAYHERE_SHEETS_MISSING');
    const salesHeader=findRow(sales,'결제일'),productHeader=findRow(products,'상품명');
    if(salesHeader<0||productHeader<0)throw Error('PAYHERE_SCHEMA_CHANGED');
    const sh=headerMap(sales[salesHeader]),ph=headerMap(products[productHeader]);
    for(const key of ['결제일','결제시간','결제 내역','합계'])if(sh[key]==null)throw Error('PAYHERE_SCHEMA_CHANGED');
    for(const key of ['상품명','상품별 단가','수량','총매출','실매출'])if(ph[key]==null)throw Error('PAYHERE_SCHEMA_CHANGED');
    const transactions=sales.slice(salesHeader+1).filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(text(r[sh['결제일']]))).map(r=>({
      date:text(r[sh['결제일']]),time:text(r[sh['결제시간']]),label:text(r[sh['결제 내역']]),gross:number(r[sh['합계']]),discount:number(r[sh['상품별 할인']])+number(r[sh['결제 할인']])
    }));
    const productRows=products.slice(productHeader+1).filter(r=>/^\d+$/.test(text(r[ph['No.']]))).map(r=>({
      category:text(r[ph['카테고리']]),name:text(r[ph['상품명']]),unitPrice:number(r[ph['상품별 단가']]),quantity:number(r[ph['수량']]),gross:number(r[ph['총매출']]),discount:number(r[ph['할인, 포인트, 선불권 사용']]),net:number(r[ph['실매출']])
    })).filter(r=>r.name&&r.quantity>0);
    const summaryIndex=findRow(sales,'총 매출'),summary=summaryIndex>=0?sales[summaryIndex+1]||[]:[];
    const period=periodFrom(sales).start?periodFrom(sales):periodFrom(products);
    return {fileName,period,merchant:text(sales[4]?.[0]),gross:number(summary[0]),net:number(summary[1]),transactionCount:number(summary[2]),transactions,products:productRows};
  }

  async function parseWorkbook(file,xlsx=root.XLSX){
    if(!xlsx?.read||!xlsx?.utils?.sheet_to_json)throw Error('XLSX_READER_UNAVAILABLE');
    const wb=xlsx.read(await file.arrayBuffer(),{cellDates:false,dense:false});
    const sheets={};
    for(const name of wb.SheetNames)sheets[name]=xlsx.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:null,raw:true});
    return parseSheets(sheets,file.name);
  }

  function mappingIndex(mappings=[]){
    const map=new Map();
    for(const m of mappings){
      if(m.mapping_status&&m.mapping_status!=='active')continue;
      const sku=text(m.canonical_sku),names=[m.external_sku,m.product_name].map(text).filter(Boolean);
      for(const name of names)if(sku)map.set(normalizeName(name),{sku,title:text(m.product_name)||name,source:'saved'});
    }
    return map;
  }

  function inventoryMatch(name,inventory=[]){
    const key=normalizeName(name),matches=inventory.filter(x=>{const n=normalizeName(x.name);return n===key||n.startsWith(key)||key.startsWith(n)});
    return matches.length===1?{sku:matches[0].sku,title:matches[0].name,source:'scm-name'}:null;
  }

  function assignTransactions(rows,transactions){
    const pendingRows=new Set(rows.map((_,i)=>i)),pendingTx=new Set(transactions.map((_,i)=>i));
    for(const [ri,row] of rows.entries()){
      const key=normalizeName(row.name);let found=-1;
      for(const ti of pendingTx){if(normalizeName(transactions[ti].label)===key){if(found!==-1){found=-2;break}found=ti}}
      if(found>=0){row.occurredAt=`${transactions[found].date}T${transactions[found].time}+09:00`;row.transactionLabel=transactions[found].label;pendingRows.delete(ri);pendingTx.delete(found)}
    }
    let changed=true;
    while(changed){
      changed=false;
      for(const ti of [...pendingTx]){
        const tx=transactions[ti],candidates=[...pendingRows].filter(ri=>rows[ri].gross===tx.gross);
        if(candidates.length===1){const ri=candidates[0];rows[ri].occurredAt=`${tx.date}T${tx.time}+09:00`;rows[ri].transactionLabel=tx.label;pendingRows.delete(ri);pendingTx.delete(ti);changed=true}
      }
    }
    if(pendingTx.size===1&&pendingRows.size){
      const ti=[...pendingTx][0],tx=transactions[ti],gross=[...pendingRows].reduce((sum,ri)=>sum+rows[ri].gross,0);
      if(gross===tx.gross){for(const ri of pendingRows){rows[ri].occurredAt=`${tx.date}T${tx.time}+09:00`;rows[ri].transactionLabel=tx.label}pendingRows.clear();pendingTx.delete(ti)}
    }
    return rows;
  }

  function eventId(row){return `${row.occurredAt}::${normalizeName(row.name)}::${row.quantity}::${row.unitPrice}`}

  function planImport(report,{mappings=[],inventory=[]}={}){
    const saved=mappingIndex(mappings);
    const rows=report.products.map(row=>{
      const key=normalizeName(row.name),excluded=EXCLUDED_NAMES.has(key);
      const mapped=saved.get(key)||ALIASES[key]&&{...ALIASES[key],source:'known'}||inventoryMatch(row.name,inventory);
      const inv=mapped&&inventory.find(x=>x.sku===mapped.sku);
      const priceOkay=!inv||row.unitPrice===number(inv.price)||row.unitPrice===number(inv.price)+3000;
      return {...row,excluded,mapped,priceOkay};
    });
    assignTransactions(rows,report.transactions);
    for(const row of rows){
      if(row.excluded){row.state='excluded';row.message='재고를 차감하지 않는 결제';continue}
      if(!row.mapped){row.state='unmapped';row.message='SCM 상품 연결 필요';continue}
      if(!row.occurredAt){row.state='ambiguous';row.message='거래일시를 상품과 연결할 수 없음';continue}
      if(!row.priceOkay){row.state='price_mismatch';row.message='SCM 가격과 다름';continue}
      row.state='ready';row.message='중복 검사 대기';row.externalEventId=eventId(row);
    }
    return {...report,rows,ready:rows.filter(r=>r.state==='ready'),blocked:rows.filter(r=>['unmapped','ambiguous','price_mismatch'].includes(r.state)),excluded:rows.filter(r=>r.state==='excluded')};
  }

  async function fileHash(file){const bytes=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('')}

  root.PayhereImportModel={ALIASES,EXCLUDED_NAMES,normalizeName,parseSheets,parseWorkbook,planImport,eventId,fileHash};
})(typeof window!=='undefined'?window:globalThis);
