// Private bookshop planning sheet mapping. Returns only the fields needed at the counter.
// The spreadsheet id and raw evidence text never leave the server.
export const BOOKSHOP_SETTING_KEY='bookshop_sheet_id';
export const BOOKSHOP_RANGES={inventory:"'통합 재고'!A:R",yes24:"'YES24 확인'!A:J"};

const INVENTORY_HEADERS=['SKU','도서명','SCM 대조수량','페이히어 수량','SS 연결수량','SS 매핑 후보수량','기록 예약수량','입고예정 기록','확인할 사항','재고소유','재고범위·주의','매장 실물수량','판매가능 확정값','매장 실사','근거'];
const YES24_HEADERS=['카트분류','ISBN','도서명','수량','행합계(원)','주문·입고 여부','재고 처리'];
const text=value=>value==null?'':String(value).trim();
const isbn=value=>text(value).toUpperCase().replace(/[^0-9X]/g,'');

function table(range,required){
  const values=range?.values;
  if(!Array.isArray(values)||!values.length)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  const headerIndex=values.findIndex(row=>required.every(header=>row.includes(header)));
  if(headerIndex<0)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  const headers=values[headerIndex];
  return values.slice(headerIndex+1).filter(row=>row.some(value=>value!=null&&value!=='')).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??null])));
}

function count(value){
  if(value==null||value==='')return null;
  const normalized=String(value).replaceAll(',','').replace(/[원권]/g,'').trim();
  const parsed=Number(normalized);
  if(!Number.isSafeInteger(parsed)||parsed<0)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  return parsed;
}

export function buildBookshop(raw){
  const rows=table(raw.inventory,INVENTORY_HEADERS),seen=new Set();
  const items=rows.map(row=>{
    const sku=text(row.SKU);
    if(!sku||seen.has(sku))throw Error('BOOKSHOP_SCHEMA_CHANGED');
    seen.add(sku);
    return {
      sku,
      ledgerCount:count(row['SCM 대조수량']),
      payhereCount:count(row['페이히어 수량']),
      smartstoreCount:count(row['SS 연결수량']),
      smartstoreCandidateCount:count(row['SS 매핑 후보수량']),
      reserved:count(row['기록 예약수량']),
      pendingInbound:count(row['입고예정 기록']),
      physicalCount:count(row['매장 실물수량']),
      sellableConfirmed:count(row['판매가능 확정값']),
      physicalCheck:text(row['매장 실사']),
      review:text(row['확인할 사항']),
      ownership:text(row['재고소유']),
      scopeNote:text(row['재고범위·주의']),
      hasEvidence:Boolean(text(row['근거'])),
    };
  });

  const candidates=table(raw.yes24,YES24_HEADERS).filter(row=>text(row['주문·입고 여부'])==='장바구니'&&text(row['재고 처리'])==='미반영');
  const byIsbn=new Map();
  let purchaseQuantity=0,supplyTotal=0;
  for(const row of candidates){
    const quantity=count(row['수량']);
    const lineTotal=count(row['행합계(원)']);
    if(quantity==null||lineTotal==null)throw Error('BOOKSHOP_SCHEMA_CHANGED');
    purchaseQuantity+=quantity;supplyTotal+=lineTotal;
    const key=isbn(row.ISBN);
    if(key)byIsbn.set(key,(byIsbn.get(key)||0)+quantity);
  }

  const sum=key=>items.reduce((total,item)=>total+(item[key]??0),0);
  const positive=key=>items.filter(item=>(item[key]??0)>0).length;
  return {
    items,
    purchaseCandidates:[...byIsbn].map(([value,quantity])=>({isbn:value,quantity})),
    summary:{
      sourceItems:items.length,
      reservations:{titles:positive('reserved'),quantity:sum('reserved')},
      pendingInbound:{titles:positive('pendingInbound'),quantity:sum('pendingInbound')},
      purchase:{titles:candidates.length,quantity:purchaseQuantity,supplyTotal},
      sellableConfirmedTitles:items.filter(item=>item.sellableConfirmed!=null).length,
    },
  };
}
