(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PartnerDirectoryModel=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STATES=['confirmed','user_candidate','conflict','unknown'];
  const MAIL_SOURCE_STATES=['available','verified_absent','not_checked','extraction_failed','access_blocked'];
  const GENERAL_FIELDS=['id','name','role','email','phone','relatedBooks','writersStudyRelations','evidenceLabel','evidenceRef','lastContactAt','lastReplyAt','verification'];
  const SENSITIVE_KEYS=['accountNumber','bankAccount','accountHolder','bankName','taxId','residentNumber','payout','settlement','paymentDocument'];
  const PRIVATE_SOURCE_CONTRACT=Object.freeze({sha256:'6cf2a07b17c34db5cbf783a9e8590e53e6729f39cd436b6cc299500518ca43e5',sheet:'어드민후보',liveConnected:false,groupRows:Object.freeze({consignment:4,inboundInquiry:3,writersStudy:9}),uniquePeopleKnown:false,allowedColumns:Object.freeze(['contact_id','party_name','organization','relation_tags','channel_type','channel_value','verification_status','conflict_group','related_sku','related_isbn','source_type','source_ref','last_verified_date','last_contact_date','reply_status','live_connected','notes'])});
  const clean=(value,max=300)=>String(value??'').replace(/[<>\u0000-\u001F]/g,'').trim().slice(0,max);
  const mapVerification=value=>({'확인':'confirmed','사용자 확인':'confirmed','참여 확인':'confirmed','부분 확인':'user_candidate','충돌 확인 필요':'conflict'}[clean(value,80)]||'unknown');
  const normalizeMailSourceState=value=>MAIL_SOURCE_STATES.includes(value)?value:'not_checked';
  function preparePrivateCandidate(row={}){
    const unknown=Object.keys(row).filter(key=>!PRIVATE_SOURCE_CONTRACT.allowedColumns.includes(key));if(unknown.length)throw Error('PRIVATE_SOURCE_SCHEMA_CHANGED');
    const relation=clean(row.relation_tags,120),channel=clean(row.channel_type,40),channelValue=clean(row.channel_value,200),refs=[clean(row.related_sku,100),clean(row.related_isbn,100)].filter(Boolean);
    return sanitize({id:row.contact_id,name:row.party_name,role:[relation,clean(row.organization,120)].filter(Boolean).join(' · '),email:channel==='email'?channelValue:'',phone:channel==='phone'?channelValue:'',relatedBooks:refs,writersStudyRelations:relation==='작가의서재 참여자'?[relation]:[],evidenceLabel:row.source_type,evidenceRef:row.source_ref,lastContactAt:row.last_contact_date,lastReplyAt:row.reply_status,verification:mapVerification(row.verification_status)});
  }
  function sanitize(record={}){
    const verification=STATES.includes(record.verification)?record.verification:'unknown';
    return Object.freeze({id:clean(record.id,128),name:clean(record.name,120),role:clean(record.role,120),email:clean(record.email,200),phone:clean(record.phone,80),relatedBooks:Array.isArray(record.relatedBooks)?record.relatedBooks.map(value=>clean(value,180)).filter(Boolean):[],writersStudyRelations:Array.isArray(record.writersStudyRelations)?record.writersStudyRelations.map(value=>clean(value,180)).filter(Boolean):[],evidenceLabel:clean(record.evidenceLabel,180),evidenceRef:clean(record.evidenceRef,180),lastContactAt:clean(record.lastContactAt,40),lastReplyAt:clean(record.lastReplyAt,40),verification});
  }
  function build(records,options={}){
    if(options.canViewContacts!==true)return Object.freeze({available:false,reason:'CONTACT_PERMISSION_REQUIRED',records:Object.freeze([]),sensitiveSettlement:{available:false,reason:'SEPARATE_PERMISSION_REQUIRED',references:Object.freeze([])}});
    const rows=(Array.isArray(records)?records:[]).map(sanitize).filter(row=>row.id&&row.name);
    return Object.freeze({available:true,reason:'',records:Object.freeze(rows),sensitiveSettlement:{available:false,reason:'SEPARATE_PERMISSION_REQUIRED',references:Object.freeze([])}});
  }
  function containsSensitiveValue(payload){const text=JSON.stringify(payload);return SENSITIVE_KEYS.some(key=>text.includes(`"${key}"`));}
  return {STATES,MAIL_SOURCE_STATES,GENERAL_FIELDS,SENSITIVE_KEYS,PRIVATE_SOURCE_CONTRACT,mapVerification,normalizeMailSourceState,preparePrivateCandidate,sanitize,build,containsSensitiveValue};
});
