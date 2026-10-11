import {SOURCE_CAPABILITIES,canonicalEvidence,homepageRows,validateBatch} from './model.mjs';

const ORIGINS=new Set(['https://gaeddirang.com','https://www.gaeddirang.com']);
const enc=new TextEncoder();
const hex=buffer=>[...new Uint8Array(buffer)].map(value=>value.toString(16).padStart(2,'0')).join('');

export function makeHandler({env,fetcher=fetch,now=()=>Date.now(),cryptoImpl=crypto}){
  async function request(url,options={}){return fetcher(url,{...options,signal:AbortSignal.timeout(15000)})}
  async function authenticate(auth,base,key){
    const h={Authorization:auth,apikey:key};
    const userRes=await request(base+'/auth/v1/user',{headers:h});
    if(userRes.status===401||userRes.status===403)throw Error('LOGIN_REQUIRED');
    if(!userRes.ok)throw Error('AUTH_CHECK_FAILED');
    const user=await userRes.json();
    if(!user.id||!user.email||user.is_anonymous||!user.email_confirmed_at)throw Error('ADMIN_REQUIRED');
    const adminRes=await request(base+'/rest/v1/rpc/is_admin',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:'{}'});
    if(!adminRes.ok||await adminRes.json()!==true)throw Error(adminRes.ok?'ADMIN_REQUIRED':'AUTH_CHECK_FAILED');
    const allowRes=await request(base+'/rest/v1/admin_emails?select=email',{headers:h});
    if(!allowRes.ok)throw Error('AUTH_CHECK_FAILED');
    const allow=await allowRes.json();
    if(!Array.isArray(allow)||!allow.some(row=>String(row.email).toLowerCase()===user.email.toLowerCase()))throw Error('ADMIN_REQUIRED');
    return {h,user};
  }
  async function rpc(base,h,name,body){
    const res=await request(base+'/rest/v1/rpc/'+name,{method:'POST',headers:{...h,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.message||data.code||'CONTROL_RPC_FAILED')}
    return res.status===204?null:res.json();
  }
  async function homepageEvents(base,h){
    const res=await request(base+'/rest/v1/orders?select=id,status,total_amount,created_at,updated_at&order=created_at.desc&limit=100',{headers:h});
    if(!res.ok)throw Error('SOURCE_READ_FAILED');
    const rows=await res.json();if(!Array.isArray(rows))throw Error('SCHEMA_CHANGED');return homepageRows(rows);
  }
  async function prepare(batch){
    const rows=[];
    for(const event of batch.events){
      const contentHash=hex(await cryptoImpl.subtle.digest('SHA-256',enc.encode(canonicalEvidence(batch.connectorCode,event))));
      rows.push({
        source_event_id:event.sourceEventId,content_hash:contentHash,occurred_at:event.occurredAt,evidence_type:event.evidenceType,
        summary:event.summary,source_ref:event.sourceRef||null,attachment_hashes:event.attachmentHashes||[],candidate_type:event.candidateType,
        candidate_payload:{canonical_sku:event.canonicalSku||null,quantity:event.quantity,unit_amount:event.unitAmount,reverses_event_id:event.reversesEventId||null},
        review_reason:event.reviewReason||null,
      });
    }
    return rows;
  }
  async function recordRun(base,h,batch,status,counts,error=''){
    const row={connector_code:batch.connectorCode,external_run_id:batch.runId,status,records_received:counts.received,records_applied:counts.applied,records_rejected:counts.rejected,completed_at:new Date(now()).toISOString(),metadata:{kind:'evidence_inbox',dry_run:batch.dryRun,error:error||undefined}};
    const response=await request(base+'/rest/v1/integration_sync_runs',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)}).catch(()=>null);
    return Boolean(response?.ok);
  }
  return async function handle(req){
    const origin=req.headers.get('origin'),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(origin&&ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;
    const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    if(origin&&!ORIGINS.has(origin))return send({error:'ORIGIN_NOT_ALLOWED'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Max-Age':'600'}});
    if(req.method!=='POST')return send({error:'POST_REQUIRED'},405);
    const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return send({error:'LOGIN_REQUIRED'},401);
    const base=env('SUPABASE_URL');let apiKey=env('SUPABASE_ANON_KEY');
    if(!apiKey){try{apiKey=JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS')||'{}').default}catch{}}
    if(!base||!apiKey)return send({error:'SERVER_NOT_CONFIGURED'},503);
    try{
      const {h}=await authenticate(auth,base,apiKey);let body;
      try{body=await req.json()}catch{throw Error('INVALID_JSON')}
      const action=String(body?.action||'ingest');
      if(!['capabilities','review','collect','ingest'].includes(action))return send({error:'ACTION_NOT_SUPPORTED'},400);
      if(action==='capabilities')return send({sources:SOURCE_CAPABILITIES,readOnly:true});
      if(action==='review'){
        const evidenceId=String(body?.evidenceId||''),decision=String(body?.decision||''),note=String(body?.note||'').trim().slice(0,500);
        if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(evidenceId)||!['reviewed','rejected','pending'].includes(decision))return send({error:'REVIEW_INVALID'},400);
        const result=await rpc(base,h,'review_integration_evidence',{p_evidence_id:evidenceId,p_decision:decision,p_note:note||null});
        return send({review:result,ledgerChanged:false});
      }
      let payload=body;
      if(action==='collect'){
        const connectorCode=String(body?.connectorCode||'');
        if(connectorCode!=='homepage')return send({error:'CONNECTOR_APPROVAL_REQUIRED',connectorCode,capability:SOURCE_CAPABILITIES[connectorCode]||null},409);
        payload={connectorCode,runId:body.runId,dryRun:body.dryRun!==false,events:await homepageEvents(base,h)};
        if(!payload.events.length)return send({connectorCode,runId:body.runId,dryRun:payload.dryRun,received:0,applied:0,duplicates:0,conflicts:0,reviewRequired:0});
      }
      const batch=validateBatch(payload),rows=await prepare(batch);
      if(batch.dryRun)return send({connectorCode:batch.connectorCode,runId:batch.runId,dryRun:true,received:rows.length,reviewRequired:rows.length,rows:rows.map(row=>({sourceEventId:row.source_event_id,evidenceType:row.evidence_type,candidateType:row.candidate_type,summary:row.summary,reviewReason:row.review_reason}))});
      let result;
      try{
        result=await rpc(base,h,'ingest_integration_evidence',{p_connector_code:batch.connectorCode,p_run_id:batch.runId,p_rows:rows});
      }catch(error){
        await recordRun(base,h,batch,'failure',{received:rows.length,applied:0,rejected:rows.length},error.message||'INGEST_FAILED');
        throw error;
      }
      const items=Array.isArray(result)?result:[],counts={received:rows.length,applied:items.filter(row=>row.result==='inserted').length,rejected:items.filter(row=>row.result==='conflict').length};
      const runRecorded=await recordRun(base,h,batch,counts.rejected?'partial':'success',counts);
      return send({connectorCode:batch.connectorCode,runId:batch.runId,dryRun:false,received:rows.length,inserted:counts.applied,duplicates:items.filter(row=>row.result==='duplicate').length,conflicts:counts.rejected,reviewRequired:items.filter(row=>['inserted','conflict'].includes(row.result)).length,runRecorded,warning:runRecorded?null:'RUN_HISTORY_WRITE_FAILED',items});
    }catch(error){
      const code=error.message||'INGEST_FAILED',status=['INVALID_JSON','ACTION_NOT_SUPPORTED','INVALID_SOURCE_EVENT','CONNECTOR_NOT_SUPPORTED','RUN_ID_REQUIRED','EVENTS_INVALID','DUPLICATE_SOURCE_EVENT','REVIEW_INVALID'].includes(code)?400:code==='LOGIN_REQUIRED'?401:code==='ADMIN_REQUIRED'||code==='ORIGIN_NOT_ALLOWED'?403:code==='CONNECTOR_APPROVAL_REQUIRED'?409:503;
      return send({error:code},status);
    }
  };
}
