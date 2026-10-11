(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.BookFinderModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const UNKNOWN='미등록';
  const isCount=value=>Number.isSafeInteger(value);
  const normalizeText=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/\s+/g,'');
  const normalizeIsbn=value=>String(value??'').normalize('NFKC').toUpperCase().replace(/[^0-9X]/g,'');
  const timeValue=value=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0};

  function latestCount(counts,sku){
    return [...counts].filter(row=>String(row?.sku||'')===String(sku||'')).sort((a,b)=>timeValue(b.date)-timeValue(a.date))[0]||null;
  }

  function stockLabel(item){
    if(!isCount(item.stock))return '장부 수량 미확인';
    if(item.stock<0)return `장부상 ${item.stock}권 · 실사 필요`;
    if(String(item.status||'').includes('반품'))return `장부상 ${item.stock}권 · 판매 가능 여부 확인`;
    if(item.stock===0)return '장부상 0권 · 실물 확인 필요';
    return `장부상 ${item.stock}권 · 실물 확인 필요`;
  }

  function bookRows(inventory=[],counts=[],fetchedAt=''){
    const books=inventory.filter(item=>item?.kind==='도서');
    const titleCounts=new Map();
    for(const item of books){const key=normalizeText(item.name);titleCounts.set(key,(titleCounts.get(key)||0)+1)}
    return books.map(item=>{
      const counted=latestCount(counts,item.sku);
      const stockConflict=isCount(item.stock)&&isCount(item.skuStock)&&item.stock!==item.skuStock;
      const countConflict=!!counted&&isCount(counted.count)&&isCount(item.stock)&&counted.count!==item.stock;
      const conflicts=[stockConflict?'원본 수량 불일치':'',countConflict?'최근 실사 수량 불일치':''].filter(Boolean);
      const isbn=String(item.isbn||item.barcode||'').trim();
      return {
        sku:String(item.sku||''),title:String(item.name||UNKNOWN),author:String(item.author||UNKNOWN),isbn:isbn||UNKNOWN,
        category:String(item.category||UNKNOWN),owner:String(item.owner||UNKNOWN),note:String(item.note||''),
        recordedStock:isCount(item.stock)?item.stock:null,masterStock:isCount(item.skuStock)?item.skuStock:null,
        stockLabel:stockLabel(item),status:String(item.status||'수량 미확인'),conflicts,hasConflict:conflicts.length>0,
        sameTitleCount:titleCounts.get(normalizeText(item.name))||1,
        edition:titleCounts.get(normalizeText(item.name))>1?'동명 도서 · ISBN과 SKU로 구분':UNKNOWN,
        shelf:UNKNOWN,reserved:UNKNOWN,incoming:UNKNOWN,channelStock:UNKNOWN,channelCheckedAt:UNKNOWN,
        countAt:String(counted?.date||UNKNOWN),countScope:String(counted?.scope||UNKNOWN),countQuantity:isCount(counted?.count)?counted.count:null,
        sourceCheckedAt:String(fetchedAt||''),
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

  function searchBooks({inventory=[],counts=[],query='',fetchedAt=''}={}){
    const raw=String(query??'').trim(),rows=bookRows(inventory,counts,fetchedAt);
    if(!raw)return {items:[],total:rows.length,query:'',exactIsbn:false,conflictTotal:rows.filter(row=>row.hasConflict).length};
    const queryText=normalizeText(raw),queryIsbn=normalizeIsbn(raw);
    const isbnLike=/^[\dXx\s-]+$/.test(raw)&&queryIsbn.length>=10;
    const exact=isbnLike?rows.filter(row=>row._isbn===queryIsbn):[];
    const items=(exact.length?exact:rows.filter(row=>[row._title,row._author,row._isbn,row._sku].some(value=>value.includes(queryText)||(queryIsbn&&value.includes(queryIsbn)))))
      .sort((a,b)=>rank(a,queryText)-rank(b,queryText)||a.title.localeCompare(b.title,'ko')||a.isbn.localeCompare(b.isbn,'ko'));
    return {items,total:rows.length,query:raw,exactIsbn:exact.length>0,conflictTotal:rows.filter(row=>row.hasConflict).length};
  }

  return {UNKNOWN,normalizeText,normalizeIsbn,bookRows,searchBooks,stockLabel};
});
