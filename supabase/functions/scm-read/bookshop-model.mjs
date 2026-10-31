// Private bookshop planning sheet mapping. Returns only the fields needed at the counter.
// The spreadsheet id and raw evidence text never leave the server.
export const BOOKSHOP_SETTING_KEY='bookshop_sheet_id';
export const BOOKSHOP_RANGES={inventory:"'통합 재고'!A:W",yes24:"'YES24 확인'!A:J"};

const INVENTORY_HEADERS=['SKU','도서명','SCM 대조수량','페이히어 수량','SS 연결수량','SS 매핑 후보수량','기록 예약수량','입고예정 기록','확인할 사항','재고소유','재고범위·주의','매장 실물수량','판매가능 확정값','매장 실사','근거'];
const YES24_HEADERS=['카트분류','ISBN','도서명','수량','행합계(원)','주문·입고 여부','재고 처리'];
const STATUS_HEADERS=['운영상태','사용자결정시각','채널상태','채널검증시각','출처유형'];
const OPERATIONAL_STATES=new Set(['판매 중','예약판매','교환 대기','열람용','확인 필요']);
const CHANNEL_STATES=new Set(['SALE','SUSPENSION','UNVERIFIED']);
const SOURCE_TYPES=new Set(['YES24_ARRIVAL','IDASOM_CARRYIN','EXISTING_READING','OTHER_VERIFIED']);
const MISSING_COUNTS=new Set(['미확인','미확정','해당 없음','매핑 미확인']);
const text=value=>value==null?'':String(value).trim();
const isbn=value=>text(value).toUpperCase().replace(/[^0-9X]/g,'');
const cell=(range,row,column)=>text(range?.values?.[row-1]?.[column-1]).slice(0,1200);
const kst=(date,time)=>{
  const value=`${date}T${time}:00+09:00`;
  return Number.isFinite(Date.parse(value))?value:null;
};
const datedTime=(value,namePattern)=>{
  const match=value.match(new RegExp(`(?:^|\\n)\\s*(?:${namePattern})\\s+(\\d{4}-\\d{2}-\\d{2})\\s+(\\d{2}:\\d{2})(?:\\s*KST)?`,'i'));
  return match?kst(match[1],match[2]):null;
};
function collectionStatus(raw){
  // The daily collector records its verified successes in these helper cells.
  // Parse only timestamps; detailed free-form evidence and account names stay server-side.
  const inventoryTimes=cell(raw.inventory,2,3);
  const yes24Times=cell(raw.yes24,2,1);
  const yesDate=yes24Times.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
  const yesOrderTime=yes24Times.match(/(?:^|[·\n])\s*주문내역\s+(\d{2}:\d{2})(?=\s*(?:·|$))/)?.[1];
  const yesCartTime=yes24Times.match(/(?:^|[·\n])\s*장바구니\s+(\d{2}:\d{2})(?=\s*(?:·|$))/)?.[1];
  const yesFailed=/(?:실패|미확인|오류)/.test(yes24Times);
  const yesOrderCompletedAt=!yesFailed&&yesDate&&yesOrderTime?kst(yesDate,yesOrderTime):null;
  const yesCartCompletedAt=!yesFailed&&yesDate&&yesCartTime?kst(yesDate,yesCartTime):null;
  // The combined snapshot is complete only after both steps; use the later completion as its watermark.
  const yesCompletedAt=yesOrderCompletedAt&&yesCartCompletedAt
    ?(Date.parse(yesOrderCompletedAt)>=Date.parse(yesCartCompletedAt)?yesOrderCompletedAt:yesCartCompletedAt)
    :null;
  const rows=[
    ['scm','SCM',datedTime(inventoryTimes,'SCM'),'통합 재고!C2'],
    ['payhere','PayHere',datedTime(inventoryTimes,'PayHere|페이히어'),'통합 재고!C2'],
    ['smartstore','SmartStore',datedTime(inventoryTimes,'SmartStore|스마트스토어'),'통합 재고!C2'],
    ['yes24','YES24',yesCompletedAt,'YES24 확인!A2',{ordersCompletedAt:yesOrderCompletedAt,cartCompletedAt:yesCartCompletedAt}],
  ];
  return rows.map(([id,name,lastSuccessAt,evidenceCell,steps])=>({id,name,lastSuccessAt,status:lastSuccessAt?'success':'unknown',evidenceCell,...(steps?{steps}:{})}));
}
const physicalCheckComplete=(value,confirmationNote,sellable)=>{
  const status=text(value),proof=text(confirmationNote);
  if(/^(확인|완료|확정|실사 완료)$/.test(status))return true;
  if(status!=='사용자 확인'||!Number.isSafeInteger(sellable))return false;
  return /사용자\s*확인/.test(proof)&&new RegExp(`판매\\s*가능\\s*${sellable}\\s*권`).test(proof);
};

function table(range,required){
  const values=range?.values;
  if(!Array.isArray(values)||!values.length)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  const headerIndex=values.findIndex(row=>required.every(header=>row.includes(header)));
  if(headerIndex<0)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  const headers=values[headerIndex];
  return values.slice(headerIndex+1).filter(row=>row.some(value=>value!=null&&value!=='')).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??null])));
}

function count(value){
  const raw=text(value);
  if(!raw||MISSING_COUNTS.has(raw)||/^최소\s*\d+$/.test(raw))return null;
  const normalized=raw.replaceAll(',','').replace(/[원권]/g,'').trim();
  const parsed=Number(normalized);
  if(!Number.isSafeInteger(parsed)||parsed<0)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  return parsed;
}

function statusColumns(range){
  const values=range?.values;
  if(!Array.isArray(values))throw Error('BOOKSHOP_SCHEMA_CHANGED');
  const header=values.find(row=>INVENTORY_HEADERS.every(name=>row.includes(name)));
  if(!header)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  const present=STATUS_HEADERS.filter(name=>header.includes(name));
  if(present.length&&present.length!==STATUS_HEADERS.length)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  return present.length===STATUS_HEADERS.length;
}

function enumValue(value,allowed){const result=text(value);if(result&&!allowed.has(result))throw Error('BOOKSHOP_SCHEMA_CHANGED');return result}
function verifiedTime(value){
  const result=text(value);
  if(!result)return null;
  const match=result.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/);
  if(!match)throw Error('BOOKSHOP_SCHEMA_CHANGED');
  const [,year,month,day,hour,minute,second='0',,zone,,offsetHour='0',offsetMinute='0']=match;
  const y=Number(year),m=Number(month),d=Number(day),h=Number(hour),min=Number(minute),sec=Number(second),oh=Number(offsetHour),om=Number(offsetMinute);
  const days=new Date(Date.UTC(y,m,0)).getUTCDate();
  if(m<1||m>12||d<1||d>days||h>23||min>59||sec>59||om>59||oh>14||(oh===14&&om!==0)||!Number.isFinite(Date.parse(result)))throw Error('BOOKSHOP_SCHEMA_CHANGED');
  return result;
}

export function buildBookshop(raw){
  const structuredStatus=statusColumns(raw.inventory),rows=table(raw.inventory,INVENTORY_HEADERS),seen=new Set();
  const items=rows.map(row=>{
    const sku=text(row.SKU);
    if(!sku||seen.has(sku))throw Error('BOOKSHOP_SCHEMA_CHANGED');
    seen.add(sku);
    const physicalCount=count(row['매장 실물수량']);
    const physicalCheck=text(row['매장 실사']);
    const scopeNote=text(row['재고범위·주의']);
    const evidence=text(row['근거']);
    const hasEvidence=Boolean(evidence);
    const recordedSellable=count(row['판매가능 확정값']);
    const sellableConfirmed=physicalCount!=null&&recordedSellable!=null&&recordedSellable<=physicalCount&&hasEvidence&&physicalCheckComplete(physicalCheck,scopeNote,recordedSellable)?recordedSellable:null;
    const status=structuredStatus?{
      operationalState:enumValue(row['운영상태'],OPERATIONAL_STATES),
      userDecisionAt:verifiedTime(row['사용자결정시각']),
      channelState:enumValue(row['채널상태'],CHANNEL_STATES),
      channelVerifiedAt:verifiedTime(row['채널검증시각']),
      sourceType:enumValue(row['출처유형'],SOURCE_TYPES),
    }:{};
    if(structuredStatus){
      if(!status.operationalState||!status.sourceType)throw Error('BOOKSHOP_SCHEMA_CHANGED');
      if(status.operationalState!=='확인 필요'&&!status.userDecisionAt)throw Error('BOOKSHOP_SCHEMA_CHANGED');
      if(status.channelState==='UNVERIFIED'&&status.channelVerifiedAt)throw Error('BOOKSHOP_SCHEMA_CHANGED');
      if((status.channelState==='SALE'||status.channelState==='SUSPENSION')&&!status.channelVerifiedAt)throw Error('BOOKSHOP_SCHEMA_CHANGED');
      if(status.operationalState==='판매 중'&&status.channelState!=='SALE')throw Error('BOOKSHOP_SCHEMA_CHANGED');
      if(['확인 필요','교환 대기','열람용'].includes(status.operationalState)&&status.channelState==='SALE')throw Error('BOOKSHOP_SCHEMA_CHANGED');
    }
    return {
      sku,
      ledgerCount:count(row['SCM 대조수량']),
      payhereCount:count(row['페이히어 수량']),
      smartstoreCount:count(row['SS 연결수량']),
      smartstoreCandidateCount:count(row['SS 매핑 후보수량']),
      reserved:count(row['기록 예약수량']),
      pendingInbound:count(row['입고예정 기록']),
      physicalCount,
      sellableConfirmed,
      physicalCheck,
      review:text(row['확인할 사항']),
      ownership:text(row['재고소유']),
      scopeNote,
      hasEvidence,
      ...status,
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
    ...(structuredStatus?{statusContract:{version:1,coverage:'complete',coveredItems:items.length,totalItems:items.length}}:{}),
    sourceStatement:cell(raw.inventory,2,3).slice(0,600),
    collectionStatus:collectionStatus(raw),
    purchaseCandidates:[...byIsbn].map(([value,quantity])=>({isbn:value,quantity})),
    summary:{
      sourceItems:items.length,
      ledgerQuantity:sum('ledgerCount'),
      reservations:{titles:positive('reserved'),quantity:sum('reserved')},
      pendingInbound:{titles:positive('pendingInbound'),quantity:sum('pendingInbound')},
      purchase:{titles:candidates.length,quantity:purchaseQuantity,supplyTotal},
      sellableConfirmedTitles:items.filter(item=>item.sellableConfirmed!=null).length,
    },
  };
}
