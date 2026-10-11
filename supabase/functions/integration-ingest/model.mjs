const CONNECTORS=new Set(['homepage','smartstore','payhere','naver_mail','google_chat','naver_settlement']);
const TYPES=new Set(['evidence','reservation','sale','reversal','settlement_candidate']);
const text=(value,max=300)=>String(value??'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const integer=value=>value===null||value===undefined||value===''?null:Number.isSafeInteger(Number(value))?Number(value):null;
const iso=value=>{const time=Date.parse(value||'');return Number.isFinite(time)?new Date(time).toISOString():''};

function transaction(type,{sku='',quantity=null,unitAmount=null,reversesEventId='',reason=''}){
  return {
    candidateType:TYPES.has(type)?type:'evidence',canonicalSku:text(sku,80),quantity:integer(quantity),unitAmount:integer(unitAmount),
    reversesEventId:text(reversesEventId,300),reviewReason:text(reason,500),
  };
}

function homepage(raw){
  const id=text(raw?.id,160),status=text(raw?.status,60),occurredAt=iso(raw?.updated_at||raw?.created_at);
  if(!id||!occurredAt)throw Error('INVALID_SOURCE_EVENT');
  const lowered=status.toLowerCase();
  const type=/취소|환불/.test(lowered)?'reversal':/발송완료|배송완료|완료/.test(lowered)?'sale':/입금확인|발송준비/.test(lowered)?'reservation':'evidence';
  return {sourceEventId:`order:${id}:${status||'unknown'}`,occurredAt,evidenceType:'homepage_order',summary:`홈페이지 주문 · ${status||'상태 미확인'}`,sourceRef:`order:${id}`,...transaction(type,{quantity:raw?.quantity,unitAmount:raw?.total_amount,reversesEventId:raw?.reverses_event_id,reason:type==='evidence'?'주문 상태를 확인해야 합니다.':''})};
}

function smartstore(raw){
  const id=text(raw?.productOrderId||raw?.product_order_id||raw?.id,180),status=text(raw?.claimStatus||raw?.claim_status||raw?.status,80).toUpperCase(),occurredAt=iso(raw?.lastChangedAt||raw?.last_changed_at||raw?.updated_at||raw?.created_at);
  if(!id||!occurredAt)throw Error('INVALID_SOURCE_EVENT');
  let type='evidence',reason='상품 주문 상태를 확인해야 합니다.';
  if(['PURCHASE_DECIDED','COMPLETED'].includes(status)){type='sale';reason='구매 확정 후보 · SCM 원장과 중복 확인 필요';}
  else if(/CANCEL|RETURN/.test(status)){type='reversal';reason='취소·반품 후보 · 원거래 참조 필수';}
  else if(['PAYED','DELIVERING','DELIVERED','DISPATCHED'].includes(status)){type='reservation';reason='가용 재고만 차감 · 판매 확정 아님';}
  return {sourceEventId:`product-order:${id}:${status||'UNKNOWN'}`,occurredAt,evidenceType:'smartstore_order',summary:`스마트스토어 상품 주문 · ${status||'상태 미확인'}`,sourceRef:`product-order:${id}`,...transaction(type,{sku:raw?.canonicalSku||raw?.canonical_sku,quantity:raw?.quantity,unitAmount:raw?.unitAmount||raw?.unit_amount,reversesEventId:raw?.originalEventId||raw?.original_event_id,reason})};
}

function payhere(raw){
  const id=text(raw?.externalEventId||raw?.external_event_id,300),occurredAt=iso(raw?.occurredAt||raw?.occurred_at);
  if(!id||!occurredAt)throw Error('INVALID_SOURCE_EVENT');
  return {sourceEventId:id,occurredAt,evidenceType:'payhere_reviewed_file',summary:'PayHere 검토 파일의 판매 후보',sourceRef:text(raw?.reportHash||raw?.report_hash,80),...transaction('sale',{sku:raw?.canonicalSku||raw?.canonical_sku,quantity:raw?.quantity,unitAmount:raw?.unitAmount||raw?.unit_amount,reason:'기존 PayHere 중복 검사와 관리자 승인을 통과해야 합니다.'})};
}

function message(raw,connectorCode){
  const id=text(raw?.messageId||raw?.message_id||raw?.uid||raw?.id,300),occurredAt=iso(raw?.receivedAt||raw?.received_at||raw?.createTime||raw?.created_at),kind=connectorCode==='google_chat'?'chat_message':'mail_message';
  if(!id||!occurredAt)throw Error('INVALID_SOURCE_EVENT');
  const label=connectorCode==='google_chat'?'Google Chat 메시지':'네이버 메일';
  const hashes=Array.isArray(raw?.attachmentHashes)?raw.attachmentHashes.map(value=>text(value,64)).filter(value=>/^[a-f0-9]{64}$/.test(value)).slice(0,20):[];
  return {sourceEventId:id,occurredAt,evidenceType:kind,summary:label,sourceRef:text(raw?.threadName||raw?.thread_name||raw?.mailbox||'',300),attachmentHashes:hashes,...transaction('evidence',{reason:'메시지는 근거일 뿐 승인·명령·확정 거래가 아닙니다.'})};
}

function settlement(raw){
  const id=text(raw?.reportId||raw?.report_id||raw?.id,200),occurredAt=iso(raw?.occurredAt||raw?.occurred_at||raw?.created_at);
  if(!id||!occurredAt)throw Error('INVALID_SOURCE_EVENT');
  return {sourceEventId:id,occurredAt,evidenceType:'settlement_candidate',summary:'네이버 정산 후보 보고',sourceRef:text(raw?.period||'',80),...transaction('settlement_candidate',{reason:'은행 대조와 지급 확인 전에는 정산 완료가 아닙니다.'})};
}

export function adaptEvent(connectorCode,raw){
  if(connectorCode==='homepage')return homepage(raw);
  if(connectorCode==='smartstore')return smartstore(raw);
  if(connectorCode==='payhere')return payhere(raw);
  if(connectorCode==='naver_mail'||connectorCode==='google_chat')return message(raw,connectorCode);
  if(connectorCode==='naver_settlement')return settlement(raw);
  throw Error('CONNECTOR_NOT_SUPPORTED');
}

export function validateBatch(body){
  const connectorCode=text(body?.connectorCode,60),runId=text(body?.runId,60),dryRun=body?.dryRun!==false;
  if(!CONNECTORS.has(connectorCode))throw Error('CONNECTOR_NOT_SUPPORTED');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId))throw Error('RUN_ID_REQUIRED');
  if(!Array.isArray(body?.events)||body.events.length<1||body.events.length>100)throw Error('EVENTS_INVALID');
  const seen=new Set(),events=body.events.map(raw=>{
    const event=adaptEvent(connectorCode,raw);
    if(seen.has(event.sourceEventId))throw Error('DUPLICATE_SOURCE_EVENT');
    seen.add(event.sourceEventId);return event;
  });
  return {connectorCode,runId,dryRun,events};
}

export function canonicalEvidence(connectorCode,event){
  return JSON.stringify({connectorCode,sourceEventId:event.sourceEventId,occurredAt:event.occurredAt,evidenceType:event.evidenceType,summary:event.summary,sourceRef:event.sourceRef||'',attachmentHashes:event.attachmentHashes||[],candidateType:event.candidateType,canonicalSku:event.canonicalSku||'',quantity:event.quantity,unitAmount:event.unitAmount,reversesEventId:event.reversesEventId||''});
}

export function homepageRows(rows=[]){
  return rows.map(row=>({id:row.id,status:row.status,total_amount:row.total_amount,created_at:row.created_at,updated_at:row.updated_at}));
}

export const SOURCE_CAPABILITIES={
  homepage:{mode:'direct_read',requires:[]},
  smartstore:{mode:'official_api',requires:['NAVER_COMMERCE_CLIENT_ID','NAVER_COMMERCE_CLIENT_SECRET','판매자 계정 식별자']},
  google_chat:{mode:'official_api',requires:['Google Chat API 사용 설정','읽기 전용 승인','대상 space ID']},
  naver_mail:{mode:'collector',requires:['읽기 전용 메일 수집 자격증명','대상 폴더','발신자/첨부 필터']},
  payhere:{mode:'reviewed_file',requires:['공식 자동 API 계약 확인 전까지 관리자 검토 파일']},
  naver_settlement:{mode:'candidate_report',requires:['기존 후보 보고 출력 연결']},
};
