(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ProgramPublishingModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const STATES=['draft','review','published','recruitment_closed','ended'];
  const PUBLIC_FIELDS=['id','slug','title','summary','state','instructors','schedule','location','price','applyUrl','startDate','endDate','imageUrl'];
  const PRIVATE_KEYS=['internalNote','participants','participantData','settlement','payout','contact','email','phone'];
  const PUBLIC_TEXT_FIELDS=['title','summary','instructors','schedule','location','price','applyUrl','imageUrl'];
  const EMAIL_PATTERN=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
  const PHONE_PATTERN=/(?<!\d)(?:\+?82[\s./()-]?)?(?:0?1[016789]|0?2|0?[3-6][1-5])(?:[\s./()-]*\d){7,8}(?!\d)/gu;
  const ZERO_WIDTH=/[\u200B-\u200D\u2060\uFEFF]/gu;
  const ENCODED_TOKEN=/%[0-9A-Fa-f]{2}|&#(?:x[0-9A-Fa-f]+|\d+);?|&(?:amp|lt|gt|quot|apos|commat|period|sol|colon|plus|hyphen|minus)(?:;|(?=[^A-Za-z0-9]|$))/giu;
  const TEXT_ONLY_MARKUP=/<|>|&#(?:x[0-9A-Fa-f]+|\d+);?|&(?:amp|lt|gt|quot|apos|commat|period|sol|colon|plus|hyphen|minus)(?:;|(?=[^A-Za-z0-9]|$))/iu;
  const clean=value=>String(value??'').trim();
  const slug=value=>clean(value).toLowerCase().replace(/[^a-z0-9가-힣]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
  const safeUrl=value=>{const v=clean(value);if(!v)return'';try{const url=new URL(v);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.toString():''}catch{return''}};
  function normalize(record={}){
    const id=clean(record.id)||`program-${Date.now()}`;
    return {id,slug:slug(record.slug||record.title||id),title:clean(record.title).slice(0,120),summary:clean(record.summary).slice(0,600),state:STATES.includes(record.state)?record.state:'draft',instructors:clean(record.instructors).slice(0,160),schedule:clean(record.schedule).slice(0,240),location:clean(record.location).slice(0,160),price:clean(record.price).slice(0,100),applyUrl:safeUrl(record.applyUrl),startDate:clean(record.startDate).slice(0,10),endDate:clean(record.endDate).slice(0,10),imageUrl:safeUrl(record.imageUrl),internalNote:clean(record.internalNote).slice(0,1000),approvedAt:clean(record.approvedAt),revision:Number.isSafeInteger(record.revision)?record.revision:0};
  }
  function decodeEntity(value){return value.replace(/&#(x[0-9A-Fa-f]+|\d+);/gu,(_,body)=>{const point=body[0].toLowerCase()==='x'?Number.parseInt(body.slice(1),16):Number.parseInt(body,10);return Number.isSafeInteger(point)&&point>=0&&point<=0x10FFFF?String.fromCodePoint(point):'�'}).replace(/&(amp|commat|period|sol|colon|plus|hyphen|minus);/giu,(_,name)=>({amp:'&',commat:'@',period:'.',sol:'/',colon:':',plus:'+',hyphen:'-',minus:'-'}[name.toLowerCase()]));}
  function inspectableText(value){let text=clean(value).normalize('NFKC').replace(ZERO_WIDTH,''),failed=false,hasMarkup=TEXT_ONLY_MARKUP.test(text);for(let depth=0;depth<3;depth++){const before=text;text=decodeEntity(text);if(/%[0-9A-Fa-f]{2}/u.test(text)){try{text=decodeURIComponent(text)}catch{failed=true}}text=text.normalize('NFKC').replace(ZERO_WIDTH,'');hasMarkup=hasMarkup||TEXT_ONLY_MARKUP.test(text);if(text===before)break}if(ENCODED_TOKEN.test(text))failed=true;ENCODED_TOKEN.lastIndex=0;return Object.freeze({text,failed,hasMarkup})}
  function sensitiveFindings(record={}){const row=normalize(record),findings=[];for(const field of PUBLIC_TEXT_FIELDS){const value=row[field];if(!value)continue;const inspected=inspectableText(value);if(inspected.hasMarkup)findings.push(Object.freeze({field,kind:'text_only_markup',value:''}));if(inspected.failed)findings.push(Object.freeze({field,kind:'decode_error',value:''}));for(const match of inspected.text.matchAll(EMAIL_PATTERN))findings.push(Object.freeze({field,kind:'email',value:match[0]}));for(const match of inspected.text.matchAll(PHONE_PATTERN))findings.push(Object.freeze({field,kind:'phone',value:match[0]}));}return Object.freeze(findings)}
  function reviewPublicText(record={}){const findings=sensitiveFindings(record);return Object.freeze({ok:findings.length===0,findings,unapproved:findings,classification:'server_registry_unavailable'})}
  function validate(record,forApproval=false){
    const row=normalize(record),errors=[];
    if(!row.title)errors.push('TITLE_REQUIRED');if(!row.summary)errors.push('SUMMARY_REQUIRED');
    if(forApproval&&!['published','recruitment_closed','ended'].includes(row.state))errors.push('PUBLIC_STATE_REQUIRED');
    if(record.applyUrl&&!row.applyUrl)errors.push('APPLY_URL_INVALID');
    const publicText=reviewPublicText(row);if(forApproval&&!publicText.ok)errors.push('SENSITIVE_PUBLIC_TEXT_REVIEW_REQUIRED');
    return {ok:errors.length===0,errors,row,publicText};
  }
  function publicRecord(record){
    const result={};for(const key of PUBLIC_FIELDS)result[key]=normalize(record)[key];
    return Object.freeze(result);
  }
  function approve(record,now=new Date().toISOString()){
    const check=validate(record,true);if(!check.ok){const error=new TypeError(check.errors.join(','));error.codes=check.errors;throw error}
    const approved={...check.row,approvedAt:now,revision:check.row.revision+1};
    return Object.freeze({record:Object.freeze(approved),payload:Object.freeze({contractVersion:1,publishedAt:now,programs:Object.freeze([publicRecord(approved)]),automaticPublish:false,writes:Object.freeze([])})});
  }
  function fromLegacy(program,index=0){return normalize({id:`legacy-${index+1}`,slug:program.slug,title:String(program.title||'').replace(/<br\s*\/?>/gi,' '),summary:program.description,state:program.is_open?'published':'ended',instructors:program.instructor,schedule:program.time_info?.replace(/<br\s*\/?>/gi,' · '),location:program.location,price:program.price,applyUrl:program.apply_url,startDate:program.start_date,endDate:program.end_date,internalNote:'현재 홈페이지 고정 자료에서 읽은 값 · 운영 공개 원천 아님'});}
  function assertNoPrivatePayload(payload){const body=JSON.stringify(payload);return PRIVATE_KEYS.every(key=>!body.includes(`"${key}"`));}
  return {STATES,PUBLIC_FIELDS,PRIVATE_KEYS,PUBLIC_TEXT_FIELDS,normalize,inspectableText,sensitiveFindings,reviewPublicText,validate,publicRecord,approve,fromLegacy,assertNoPrivatePayload};
});
