const text=v=>String(v??'').trim();
const number=v=>Number.isFinite(Number(v))?Number(v):null;
const normalizeName=v=>text(v).normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
const eventId=row=>`${row.occurredAt}::${normalizeName(row.payhereName)}::${row.quantity}::${row.unitAmount}`;

export function validatePayload(body){
  const errors=[];
  if(typeof body?.dryRun!=='boolean')errors.push('dryRun');
  if(!/^[a-f0-9]{64}$/.test(text(body?.report?.hash)))errors.push('report.hash');
  if(!Array.isArray(body?.rows)||body.rows.length<1||body.rows.length>100)errors.push('rows');
  const seen=new Set(),rows=[];
  for(const [index,row] of (body?.rows||[]).entries()){
    const x={
      canonicalSku:text(row.canonicalSku),productName:text(row.productName),payhereName:text(row.payhereName),
      quantity:number(row.quantity),unitAmount:number(row.unitAmount),grossAmount:number(row.grossAmount),
      occurredAt:text(row.occurredAt),externalEventId:text(row.externalEventId)
    };
    if(!/^GDR-[A-Z]+-\d{4}$/.test(x.canonicalSku))errors.push(`rows.${index}.canonicalSku`);
    if(!x.productName||x.productName.length>180)errors.push(`rows.${index}.productName`);
    if(!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>500)errors.push(`rows.${index}.quantity`);
    if(!Number.isSafeInteger(x.unitAmount)||x.unitAmount<0||x.unitAmount>10000000)errors.push(`rows.${index}.unitAmount`);
    if(!Number.isSafeInteger(x.grossAmount)||x.grossAmount!==x.unitAmount*x.quantity)errors.push(`rows.${index}.grossAmount`);
    if(!x.occurredAt||Number.isNaN(Date.parse(x.occurredAt)))errors.push(`rows.${index}.occurredAt`);
    if(!x.externalEventId||x.externalEventId.length>300||seen.has(x.externalEventId))errors.push(`rows.${index}.externalEventId`);
    if(x.externalEventId&&x.externalEventId!==eventId(x))errors.push(`rows.${index}.externalEventId`);
    seen.add(x.externalEventId);rows.push(x);
  }
  if(errors.length)throw Object.assign(Error('INVALID_PAYLOAD'),{fields:[...new Set(errors)]});
  return {dryRun:body.dryRun,report:{hash:text(body.report.hash),fileName:text(body.report.fileName).slice(0,180),period:body.report.period||{},gross:number(body.report.gross),net:number(body.report.net)},rows};
}

export function parseSheetData(valueRanges){
  const products=valueRanges?.[0]?.values||[],ledger=valueRanges?.[1]?.values||[];
  if(!products.length||!ledger.length)throw Error('SCHEMA_CHANGED');
  const ph=products[0],lh=ledger[0];
  for(const key of ['SKU','내부표준상품명','정가','현재고'])if(!ph.includes(key))throw Error('SCHEMA_CHANGED');
  for(const key of ['날짜','transaction_id','source_id','SKU'])if(!lh.includes(key))throw Error('SCHEMA_CHANGED');
  const pi=Object.fromEntries(ph.map((v,i)=>[v,i])),li=Object.fromEntries(lh.map((v,i)=>[v,i]));
  const catalog=new Map(products.slice(1).filter(r=>r[pi.SKU]).map(r=>[String(r[pi.SKU]),{sku:String(r[pi.SKU]),name:String(r[pi['내부표준상품명']]||''),price:number(r[pi['정가']]),stock:number(r[pi['현재고']])}]));
  const ledgerEvents=new Set(ledger.slice(1).map(r=>text(r[li.transaction_id])).filter(Boolean));
  return {catalog,ledgerEvents};
}

export function reconcileRows(rows,{catalog,ledgerEvents,dbEvents=new Set(),productMappings=new Map()}){
  return rows.map(row=>{
    const product=catalog.get(row.canonicalSku),inSheet=ledgerEvents.has(row.externalEventId),inDb=dbEvents.has(row.externalEventId);
    if(inSheet&&inDb)return {...row,status:'duplicate',message:'SCM과 통합 원장에 이미 반영됨'};
    if(inSheet&&!inDb)return {...row,status:'duplicate',repairControl:true,message:'SCM에 이미 반영됨 · 통합 기록만 복구'};
    if(!inSheet&&inDb)return {...row,status:'blocked',message:'통합 기록은 있으나 SCM 행이 없어 확인 필요'};
    const mappedSku=productMappings.get(normalizeName(row.payhereName));
    if(!mappedSku||mappedSku!==row.canonicalSku)return {...row,status:'blocked',message:'서버 상품 연결표와 다름'};
    if(!product)return {...row,status:'blocked',message:'SCM에 없는 SKU'};
    if(product.price==null||![product.price,product.price+3000].includes(row.unitAmount))return {...row,status:'blocked',message:`SCM 가격 ${product.price??'미확인'}원과 다름`,currentStock:product.stock};
    if(product.stock==null)return {...row,status:'blocked',message:'SCM 현재고 미확인'};
    const afterStock=product.stock-row.quantity;
    if(afterStock<0)return {...row,status:'blocked',message:'반영하면 재고가 음수가 됨',currentStock:product.stock,afterStock};
    return {...row,status:'applicable',message:'중복 없음 · 재고 반영 가능',currentStock:product.stock,afterStock};
  });
}

export function googleRows(rows,report){
  const source=`payhere:${report.hash.slice(0,16)}`;
  return rows.map(row=>[row.occurredAt.slice(0,10),row.productName,'현장결제(페이히어)','직판',row.quantity,'정가',row.grossAmount,'입금대기','페이히어 매출 엑셀 · 관리자 검사 후 반영',row.externalEventId,source,row.canonicalSku]);
}

export function movementRows(rows,report){
  return rows.map(row=>({canonical_sku:row.canonicalSku,location_code:'workshop',connector_code:'payhere',external_event_id:row.externalEventId,movement_type:'sale',quantity_delta:-row.quantity,unit_amount:row.unitAmount,occurred_at:row.occurredAt,note:'페이히어 매출 엑셀 · SCM 원장 반영',payload:{report_hash:report.hash,file_name:report.fileName,payhere_name:row.payhereName,gross_amount:row.grossAmount}}));
}
