// Validate local collector batches before they are sent with an existing admin session.
((root) => {
  'use strict';

  const CONNECTORS=new Set(['naver_mail','google_chat']);
  const HASH=/^[a-f0-9]{64}$/;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOP_KEYS=new Set(['action','connectorCode','runId','dryRun','events']);
  const MAIL_KEYS=new Set(['messageId','receivedAt','mailbox','uidHash','messageIdHash','attachments']);
  const CHAT_KEYS=new Set(['messageId','createTime','threadName','contentHash','attachmentRefHashes']);
  const ATTACHMENT_KEYS=new Set(['sha256','mimeType','size','localRef']);
  const exactKeys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.has(key))&&Object.keys(value).length===allowed.size;
  const iso=value=>typeof value==='string'&&value.length<=64&&Number.isFinite(Date.parse(value));
  const hashes=value=>Array.isArray(value)&&value.length<=20&&new Set(value).size===value.length&&value.every(item=>typeof item==='string'&&HASH.test(item));

  function mailEvent(event){
    if(!exactKeys(event,MAIL_KEYS)||event.mailbox!=='INBOX'||!iso(event.receivedAt)||!HASH.test(event.uidHash||'')||!HASH.test(event.messageIdHash||''))return false;
    if(event.messageId!==`naver-mail:${event.uidHash}:${event.messageIdHash}`||!Array.isArray(event.attachments)||event.attachments.length<1||event.attachments.length>20)return false;
    const seen=new Set();
    return event.attachments.every(item=>{
      if(!exactKeys(item,ATTACHMENT_KEYS)||!HASH.test(item.sha256||'')||seen.has(item.sha256)||typeof item.mimeType!=='string'||!item.mimeType||item.mimeType.length>160||!Number.isSafeInteger(item.size)||item.size<1||item.size>10*1024*1024)return false;
      seen.add(item.sha256);
      return new RegExp(`^moneypin_attachments/[0-9]{4}-[0-9]{2}/${item.sha256}\\.(xlsx|xls|csv)$`).test(item.localRef||'');
    });
  }

  function chatEvent(event){
    return exactKeys(event,CHAT_KEYS)&&typeof event.messageId==='string'&&event.messageId.length>0&&event.messageId.length<=300&&iso(event.createTime)&&typeof event.threadName==='string'&&event.threadName.length<=300&&HASH.test(event.contentHash||'')&&hashes(event.attachmentRefHashes);
  }

  function validate(value){
    if(!exactKeys(value,TOP_KEYS)||value.action!=='ingest'||value.dryRun!==false||!CONNECTORS.has(value.connectorCode)||!UUID.test(value.runId||'')||!Array.isArray(value.events)||value.events.length<1||value.events.length>100)throw Error('EVIDENCE_BATCH_INVALID');
    const valid=value.connectorCode==='naver_mail'?mailEvent:chatEvent,seen=new Set();
    for(const event of value.events){
      if(!valid(event)||seen.has(event.messageId))throw Error('EVIDENCE_BATCH_INVALID');
      seen.add(event.messageId);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function parse(text,maxBytes=256*1024){
    if(typeof text!=='string'||new TextEncoder().encode(text).length>maxBytes)throw Error('EVIDENCE_BATCH_TOO_LARGE');
    let value;try{value=JSON.parse(text)}catch{throw Error('EVIDENCE_BATCH_JSON_INVALID')}
    return validate(value);
  }

  function describe(batch){
    return {connectorCode:batch.connectorCode,count:batch.events.length,label:batch.connectorCode==='naver_mail'?'MoneyPin 메일':'Google Chat 정산'};
  }

  root.IntegrationEvidenceBatchModel={parse,validate,describe};
})(typeof window==='undefined'?globalThis:window);
