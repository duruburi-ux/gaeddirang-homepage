(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WorkboardEvidenceContract=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Conservative client boundary after an observed 1,500-character truncation.
  // The provider's Unicode counting implementation has not been established.
  const EVIDENCE_MAX_UTF16=1500;
  const PAYLOAD_KEYS=Object.freeze(['id','type','title','status','category','verificationStage','nextAction','blocker','evidence','sourceUrl','observedAt','dueDate']);
  const REQUIRED=Object.freeze(['id','type','title','status']);
  const STATUSES=Object.freeze(['requested','preparing','running','waiting','blocked','verified_done','cancelled']);
  const STAGES=Object.freeze(['prepared','local_test','independent_review','production_applied','official_rechecked']);
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
  function object(value){
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const prototype=Object.getPrototypeOf(value);
    return prototype===Object.prototype||prototype===null;
  }
  function dataObject(value){
    return object(value)&&Reflect.ownKeys(value).every(key=>typeof key==='string'&&own(Object.getOwnPropertyDescriptor(value,key),'value'));
  }
  function wellFormed(value){
    for(let i=0;i<value.length;i++){
      const unit=value.charCodeAt(i);
      if(unit>=0xd800&&unit<=0xdbff){const next=value.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))return false;}
      else if(unit>=0xdc00&&unit<=0xdfff)return false;
    }
    return true;
  }
  function validateEvidence(raw,limit=EVIDENCE_MAX_UTF16){
    const validLimit=Number.isInteger(limit)&&limit>=0&&limit<=EVIDENCE_MAX_UTF16;
    const string=typeof raw==='string',units=string?raw.length:null;
    const result={ok:false,state:'invalid',code:'EVIDENCE_INVALID',value:string?raw:null,units,codePoints:string?[...raw].length:null,countUnit:'utf16_code_units',limit:validLimit?limit:EVIDENCE_MAX_UTF16,providerCountVerified:false};
    if(!validLimit){result.code='EVIDENCE_LIMIT_INVALID';return result;}
    if(!string)return result;
    if(!wellFormed(raw)){result.code='EVIDENCE_INVALID_UNICODE';return result;}
    if(units>limit){result.state='too_long';result.code='EVIDENCE_TOO_LONG';return result;}
    result.ok=true;result.state='valid';result.code=null;return result;
  }
  function timestamp(raw){
    if(raw===null||raw===undefined||raw==='')return {state:'unknown',value:null};
    if(typeof raw!=='string')return {state:'invalid',value:null};
    const match=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
    if(!match)return {state:'invalid',value:null};
    const [,year,month,day,hour,minute,second,zone]=match,y=Number(year),m=Number(month),d=Number(day);
    if(y<1000||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate()||Number(hour)>23||Number(minute)>59||Number(second)>59||zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59)||!Number.isFinite(Date.parse(raw)))return {state:'invalid',value:null};
    return {state:'known',value:raw};
  }
  function day(raw){
    if(raw===null)return true;
    if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
    return timestamp(raw+'T00:00:00Z').state==='known';
  }
  function validateRecordPayload(raw){
    const errors=[];
    try{
      if(!dataObject(raw))return {ok:false,state:'invalid',errors:[{field:null,code:'PAYLOAD_OBJECT_REQUIRED'}],payload:null};
      const keys=Reflect.ownKeys(raw);
      for(const key of keys)if(!PAYLOAD_KEYS.includes(key))errors.push({field:key,code:'PAYLOAD_FIELD_UNKNOWN'});
      for(const key of REQUIRED)if(!own(raw,key))errors.push({field:key,code:'PAYLOAD_FIELD_REQUIRED'});
      if(typeof raw.id!=='string'||!raw.id||!wellFormed(raw.id)||raw.id!==raw.id.trim()||/[\u0000-\u001f\u007f]/.test(raw.id))errors.push({field:'id',code:'EXISTING_SOURCE_ID_REQUIRED'});
      if(!['task','source'].includes(raw.type))errors.push({field:'type',code:'RECORD_TYPE_INVALID'});
      if(typeof raw.title!=='string'||!raw.title.trim())errors.push({field:'title',code:'TITLE_REQUIRED'});
      if(!STATUSES.includes(raw.status))errors.push({field:'status',code:'STATUS_INVALID'});
      for(const key of ['title','category','nextAction','blocker','sourceUrl'])if(own(raw,key)&&(typeof raw[key]!=='string'||!wellFormed(raw[key])))errors.push({field:key,code:'TEXT_INVALID'});
      if(own(raw,'verificationStage')&&!STAGES.includes(raw.verificationStage))errors.push({field:'verificationStage',code:'VERIFICATION_STAGE_INVALID'});
      const evidence=own(raw,'evidence')?validateEvidence(raw.evidence):null;
      if(evidence&&!evidence.ok)errors.push({field:'evidence',code:evidence.code});
      if(['running','verified_done'].includes(raw.status)&&!(typeof raw.evidence==='string'&&raw.evidence.trim()))errors.push({field:'evidence',code:'EXECUTION_EVIDENCE_REQUIRED'});
      if(own(raw,'observedAt')&&raw.observedAt!==null&&timestamp(raw.observedAt).state!=='known')errors.push({field:'observedAt',code:'OBSERVATION_TIME_INVALID'});
      if(own(raw,'dueDate')&&!day(raw.dueDate))errors.push({field:'dueDate',code:'DUE_DATE_INVALID'});
      const payload={};for(const key of PAYLOAD_KEYS)if(own(raw,key))payload[key]=raw[key];
      return {ok:errors.length===0,state:errors.length?'invalid':'valid',errors,payload:errors.length?null:payload,evidence};
    }catch{return {ok:false,state:'invalid',errors:[{field:null,code:'PAYLOAD_INVALID'}],payload:null};}
  }
  function canonicalPayload(raw){
    const result=validateRecordPayload(raw);
    if(!result.ok)return null;
    const value={};for(const key of Object.keys(result.payload).sort())value[key]=result.payload[key];
    return JSON.stringify(value);
  }
  function timings(record={},snapshot={}){
    return {
      recordedObservedAt:{...timestamp(record.observedAt),meaning:'recorded_observation'},
      recordUpdatedAt:{...timestamp(record.updatedAt),meaning:'record_modified'},
      reportReadAt:{...timestamp(snapshot.readAt),meaning:'report_read'},
      sourceStoredAt:{state:'unprovided',value:null},
      lastRecordedSuccessAt:{...timestamp(record.lastSuccessAt),meaning:'recorded_last_success'},
      sourceFreshness:'not_established',executionVerified:false
    };
  }
  function comparison(state,extra={}){return {state,matched:state==='matched',verification:'stored_fields',executionVerified:false,...extra};}
  function incomplete(value){
    const invalid=()=>{const error=new Error('Invalid completeness metadata');error.code='READ_COMPLETENESS_INVALID';throw error;};
    if(value===null||value===undefined)return false;
    if(!dataObject(value))invalid();
    let partial=false;
    for(const key of ['truncated','isTruncated','has_more','hasMore']){
      if(!own(value,key))continue;
      if(typeof value[key]!=='boolean')invalid();
      if(value[key])partial=true;
    }
    for(const key of ['next_cursor','nextCursor']){
      if(!own(value,key))continue;
      if(value[key]!==null&&typeof value[key]!=='string')invalid();
      if(typeof value[key]==='string'&&value[key])partial=true;
    }
    return partial;
  }
  function parseSingleJson(raw){
    const parsed=JSON.parse(raw);let index=0;
    const space=()=>{while(/\s/.test(raw.charAt(index))&&index<raw.length)index++;};
    function string(){
      const start=index++;
      while(index<raw.length){const char=raw.charAt(index++);if(char==='\\')index++;else if(char==='"')return JSON.parse(raw.slice(start,index));}
    }
    // JSON.parse validates the grammar. This second walk only rejects duplicate
    // (including escaped-equivalent) object keys that JSON.parse would discard.
    function walk(){
      space();const char=raw.charAt(index);
      if(char==='{'){
        index++;space();const keys=new Set();if(raw.charAt(index)==='}'){index++;return;}
        while(index<raw.length){
          space();const key=string();if(keys.has(key)){const error=new Error('Ambiguous JSON');error.code='READ_JSON_DUPLICATE_KEY';throw error;}keys.add(key);
          space();index++;walk();space();if(raw.charAt(index++)==='}')return;
        }
      }else if(char==='['){
        index++;space();if(raw.charAt(index)===']'){index++;return;}
        while(index<raw.length){walk();space();if(raw.charAt(index++)===']')return;}
      }else if(char==='"')string();
      else while(index<raw.length&&!/[\s,}\]]/.test(raw.charAt(index)))index++;
    }
    walk();return parsed;
  }
  function normalizeReadResponse(raw){
    try{
      if(!dataObject(raw))return {ok:false,state:'read_failed',code:'READ_RESPONSE_INVALID',snapshot:null};
      if(raw.isError!==undefined&&raw.isError!==false)return {ok:false,state:'read_failed',code:'READ_TOOL_FAILED',snapshot:null};
      if(incomplete(raw)||incomplete(raw._meta))return {ok:false,state:'read_failed',code:'READ_RESPONSE_INCOMPLETE',snapshot:null};
      let snapshot=raw,transport='plain';
      if(own(raw,'content')){
        if(own(raw,'structuredContent')&&raw.structuredContent!=null&&(!dataObject(raw.structuredContent)||Object.keys(raw.structuredContent).length))return {ok:false,state:'read_failed',code:'READ_RESPONSE_AMBIGUOUS',snapshot:null};
        if(!Array.isArray(raw.content)||raw.content.length!==1||!dataObject(raw.content[0])||raw.content[0].type!=='text'||typeof raw.content[0].text!=='string')return {ok:false,state:'read_failed',code:'READ_TEXT_RESPONSE_AMBIGUOUS',snapshot:null};
        if(incomplete(raw.content[0])||incomplete(raw.content[0]._meta))return {ok:false,state:'read_failed',code:'READ_RESPONSE_INCOMPLETE',snapshot:null};
        // Parse exactly the one JSON text block; never evaluate source strings,
        // extract a JSON-looking substring, or follow instructions in records.
        snapshot=parseSingleJson(raw.content[0].text);transport='mcp_text_json';
      }
      if(!dataObject(snapshot)||snapshot.error||!Array.isArray(snapshot.records)||own(snapshot,'history')&&!Array.isArray(snapshot.history))return {ok:false,state:'read_failed',code:'READ_RESPONSE_INVALID',snapshot:null};
      if(incomplete(snapshot)||incomplete(snapshot._meta))return {ok:false,state:'read_failed',code:'READ_RESPONSE_INCOMPLETE',snapshot:null};
      if(timestamp(snapshot.readAt).state!=='known')return {ok:false,state:'read_failed',code:'READ_TIME_UNCONFIRMED',snapshot:null};
      return {ok:true,state:'read_success',code:null,snapshot,transport,adapterOrigin:'provided_read_response'};
    }catch(error){return {ok:false,state:'read_failed',code:['READ_JSON_DUPLICATE_KEY','READ_COMPLETENESS_INVALID'].includes(error?.code)?error.code:'READ_RESPONSE_INVALID',snapshot:null};}
  }
  function compareStored(expected,snapshot){
    const validation=validateRecordPayload(expected);
    if(!validation.ok)return comparison('invalid_expected',{code:'PAYLOAD_INVALID',errors:validation.errors});
    try{
      const normalized=normalizeReadResponse(snapshot);
      if(!normalized.ok)return comparison('read_failed',{code:normalized.code});
      snapshot=normalized.snapshot;
      if(!snapshot.records.every(row=>dataObject(row)&&typeof row.id==='string'&&row.id&&['task','source'].includes(row.type)))return comparison('read_failed',{code:'READ_RECORD_INVALID'});
      const payload=validation.payload,ids=snapshot.records.filter(row=>row.id===payload.id),rows=ids.filter(row=>row.type===payload.type);
      if(!rows.length)return comparison(ids.length?'identity_mismatch':'missing',{code:ids.length?'RECORD_TYPE_MISMATCH':'RECORD_NOT_FOUND',timing:timings({},snapshot)});
      if(rows.length!==1)return comparison('duplicate',{code:'DUPLICATE_IDENTITY',timing:timings({},snapshot)});
      const row=rows[0],mismatches=[];
      for(const key of Object.keys(payload)){
        if(!own(row,key)){mismatches.push({field:key,kind:'missing'});continue;}
        if(!Object.is(row[key],payload[key])){
          const truncated=typeof payload[key]==='string'&&typeof row[key]==='string'&&row[key].length<payload[key].length&&payload[key].startsWith(row[key]);
          mismatches.push({field:key,kind:truncated?'truncated':'different'});
        }
      }
      return comparison(mismatches.length?'mismatch':'matched',{code:mismatches.length?'STORED_VALUE_MISMATCH':null,mismatches,timing:timings(row,snapshot)});
    }catch{return comparison('read_failed',{code:'READ_RESPONSE_INVALID'});}
  }
  function createVerifiedRecorder(options={}){
    const read=typeof options.read==='function'?options.read:null,write=typeof options.write==='function'?options.write:null;
    const inFlight=new Map(),pending=new Map();
    const key=payload=>JSON.stringify([payload.type,payload.id]);
    const result=(state,extra={})=>({state,verification:'stored_fields',executionVerified:false,adapterOrigin:'provided_callbacks',...extra});
    async function readComparison(payload){
      try{return compareStored(payload,await read());}
      catch{return comparison('read_failed',{code:'READ_FAILED'});}
    }
    function verified(state,cmp,extra={}){return result(state,{storageVerified:true,readbackMatched:true,comparison:cmp,...extra});}
    async function execute(payload,identity,fingerprint){
      const prior=pending.get(identity);let before=await readComparison(payload);
      if(prior&&before.timing?.reportReadAt?.state==='known'&&Date.parse(before.timing.reportReadAt.value)<Date.parse(prior.minimumReadAt))before=comparison('read_failed',{code:'READBACK_OLDER_THAN_PREFLIGHT'});
      if(before.matched){pending.delete(identity);return verified(prior?'verified':'noop',before,{writeAttempted:Boolean(prior),resumed:Boolean(prior)});}
      if(prior)return result('uncertain',{code:'PENDING_READBACK_UNCONFIRMED',storageVerified:false,writeAttempted:true,comparison:before});
      if(before.state!=='mismatch')return result('blocked',{code:before.code,storageVerified:false,writeAttempted:false,comparison:before});
      // Reserve before invoking write. A rejection/throw may still mean that the
      // remote operation executed, so another record() attempt only re-reads.
      pending.set(identity,{fingerprint,minimumReadAt:before.timing.reportReadAt.value});
      let writeReturned=false;
      try{await write({...payload});writeReturned=true;}catch{}
      let after=await readComparison(payload);
      if(after.timing?.reportReadAt?.state==='known'&&before.timing?.reportReadAt?.state==='known'&&Date.parse(after.timing.reportReadAt.value)<Date.parse(before.timing.reportReadAt.value))after=comparison('read_failed',{code:'READBACK_OLDER_THAN_PREFLIGHT'});
      if(after.matched){pending.delete(identity);return verified('verified',after,{writeAttempted:true,writeReturned,resumed:false});}
      return result('uncertain',{code:'WRITE_READBACK_UNCONFIRMED',storageVerified:false,writeAttempted:true,writeReturned,comparison:after});
    }
    function record(raw){
      const validation=validateRecordPayload(raw);
      if(!validation.ok)return Promise.resolve(result('invalid',{code:'PAYLOAD_INVALID',errors:validation.errors,storageVerified:false,writeAttempted:false}));
      if(!read||!write)return Promise.resolve(result('blocked',{code:!read?'READ_ADAPTER_UNAVAILABLE':'WRITE_ADAPTER_UNAVAILABLE',storageVerified:false,writeAttempted:false}));
      const payload=validation.payload,identity=key(payload),fingerprint=canonicalPayload(payload),active=inFlight.get(identity),prior=pending.get(identity);
      if(active)return active.fingerprint===fingerprint?active.promise:Promise.resolve(result('blocked',{code:'DIFFERENT_PAYLOAD_IN_FLIGHT',storageVerified:false,writeAttempted:false}));
      if(prior&&prior.fingerprint!==fingerprint)return Promise.resolve(result('blocked',{code:'DIFFERENT_PAYLOAD_PENDING',storageVerified:false,writeAttempted:false}));
      const entry={fingerprint,promise:null};
      entry.promise=Promise.resolve().then(()=>execute(payload,identity,fingerprint)).finally(()=>{if(inFlight.get(identity)===entry)inFlight.delete(identity);});
      inFlight.set(identity,entry);return entry.promise;
    }
    async function verify(raw){
      const validation=validateRecordPayload(raw);
      if(!validation.ok)return result('invalid',{code:'PAYLOAD_INVALID',errors:validation.errors,storageVerified:false,writeAttempted:false});
      if(!read)return result('blocked',{code:'READ_ADAPTER_UNAVAILABLE',storageVerified:false,writeAttempted:false});
      let cmp=await readComparison(validation.payload);const prior=pending.get(key(validation.payload));
      if(prior&&cmp.timing?.reportReadAt?.state==='known'&&Date.parse(cmp.timing.reportReadAt.value)<Date.parse(prior.minimumReadAt))cmp=comparison('read_failed',{code:'READBACK_OLDER_THAN_PREFLIGHT'});
      if(cmp.matched&&pending.get(key(validation.payload))?.fingerprint===canonicalPayload(validation.payload))pending.delete(key(validation.payload));
      return cmp.matched?verified('verified',cmp,{writeAttempted:false}):result('unconfirmed',{code:cmp.code,storageVerified:false,writeAttempted:false,comparison:cmp});
    }
    function state(){return {inFlight:inFlight.size,pending:pending.size,pendingScope:'this_recorder_instance_only',persistentExactlyOnceGuaranteed:false};}
    return {record,verify,state};
  }
  return {EVIDENCE_MAX_UTF16,PAYLOAD_KEYS,STATUSES,STAGES,validateEvidence,validateRecordPayload,canonicalPayload,timestamp,timings,normalizeReadResponse,compareStored,createVerifiedRecorder};
});
