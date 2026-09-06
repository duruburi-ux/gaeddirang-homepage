import {googleRows,movementRows,parseSheetData,reconcileRows,validatePayload} from './model.mjs';

const SHEET='1ZeH4pa5s1QS8BlC_gbHWLLp0dhezISXfYTXXxiE0NKw';
const RANGES=["'상품SKU마스터'!A:M","'입출고원장'!A:L"];
const ORIGINS=new Set(['https://gaeddirang.com','https://www.gaeddirang.com']);
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const json64=v=>b64(enc.encode(JSON.stringify(v)));

export function makeHandler({env,fetcher=fetch,now=()=>Date.now(),cryptoImpl=crypto}){
  async function request(url,options={}){return fetcher(url,{...options,signal:AbortSignal.timeout(15000)})}
  async function authenticate(auth,base,key){
    const h={Authorization:auth,apikey:key};
    const userRes=await request(base+'/auth/v1/user',{headers:h});if(userRes.status===401||userRes.status===403)throw Error('LOGIN_REQUIRED');if(!userRes.ok)throw Error('AUTH_CHECK_FAILED');
    const user=await userRes.json();if(!user.id||!user.email||user.is_anonymous||!user.email_confirmed_at)throw Error('ADMIN_REQUIRED');
    const adminRes=await request(base+'/rest/v1/rpc/is_admin',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:'{}'});if(!adminRes.ok||await adminRes.json()!==true)throw Error('ADMIN_REQUIRED');
    const allowRes=await request(base+'/rest/v1/admin_emails?select=email',{headers:h});if(!allowRes.ok)throw Error('AUTH_CHECK_FAILED');
    const allow=await allowRes.json();if(!Array.isArray(allow)||!allow.some(r=>String(r.email).toLowerCase()===user.email.toLowerCase()))throw Error('ADMIN_REQUIRED');
    return {h,user};
  }
  async function googleToken(){
    const value=env('SCM_GOOGLE_SERVICE_ACCOUNT');if(!value)throw Error('SOURCE_NOT_CONFIGURED');const c=JSON.parse(value);if(!c.client_email||!c.private_key)throw Error('SOURCE_NOT_CONFIGURED');
    const iat=Math.floor(now()/1000),url='https://oauth2.googleapis.com/token',input=json64({alg:'RS256',typ:'JWT'})+'.'+json64({iss:c.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:url,iat,exp:iat+3600});
    const pem=c.private_key.replace(/-----[^-]+-----|\s/g,''),key=await cryptoImpl.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),x=>x.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
    const signature=await cryptoImpl.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(input));
    const response=await request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:input+'.'+b64(signature)})});
    if(!response.ok)throw Error(response.status===403?'SOURCE_WRITE_DENIED':'SOURCE_AUTH_FAILED');const d=await response.json();if(!d.access_token)throw Error('SOURCE_AUTH_FAILED');return d.access_token;
  }
  async function sheetData(access){
    const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values:batchGet`);for(const range of RANGES)url.searchParams.append('ranges',range);url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
    const res=await request(url,{headers:{Authorization:'Bearer '+access}});if(!res.ok)throw Error(res.status===403?'SOURCE_WRITE_DENIED':'SOURCE_READ_FAILED');return parseSheetData((await res.json()).valueRanges);
  }
  async function dbContext(base,h){
    const [eventsRes,mappingsRes]=await Promise.all([
      request(base+'/rest/v1/integration_inventory_movements?select=external_event_id&connector_code=eq.payhere',{headers:h}),
      request(base+'/rest/v1/integration_product_mappings?select=canonical_sku,external_sku&connector_code=eq.payhere&mapping_status=eq.active',{headers:h})
    ]);
    if(!eventsRes.ok||!mappingsRes.ok)throw Error('CONTROL_LEDGER_READ_FAILED');
    const events=new Set((await eventsRes.json()).map(x=>x.external_event_id).filter(Boolean));
    const normalize=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[^0-9a-z가-힣]/g,'');
    const productMappings=new Map((await mappingsRes.json()).map(x=>[normalize(x.external_sku),x.canonical_sku]));
    return {events,productMappings};
  }
  async function appendGoogle(access,values){
    if(!values.length)return;
    const range=encodeURIComponent("'입출고원장'!A:L"),url=`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
    const res=await request(url,{method:'POST',headers:{Authorization:'Bearer '+access,'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values})});if(!res.ok)throw Error(res.status===403?'SOURCE_WRITE_DENIED':'SOURCE_WRITE_FAILED');
  }
  async function appendControl(base,h,values){
    if(!values.length)return;
    const res=await request(base+'/rest/v1/integration_inventory_movements',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(values)});if(!res.ok)throw Error('PARTIAL_CONTROL_LEDGER');
  }
  async function recordRun(base,h,payload,received,applied,rejected,status){
    const row={connector_code:'payhere',external_run_id:payload.report.hash,status,records_received:received,records_applied:applied,records_rejected:rejected,completed_at:new Date(now()).toISOString(),metadata:{file_name:payload.report.fileName,period:payload.report.period,dry_run:false}};
    await request(base+'/rest/v1/integration_sync_runs',{method:'POST',headers:{...h,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(row)}).catch(()=>{});
  }
  return async function handle(req){
    const origin=req.headers.get('origin'),headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};if(origin&&ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;
    const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    if(origin&&!ORIGINS.has(origin))return send({error:'ORIGIN_NOT_ALLOWED'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Max-Age':'600'}});
    if(req.method!=='POST')return send({error:'POST_REQUIRED'},405);
    const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return send({error:'LOGIN_REQUIRED'},401);
    const base=env('SUPABASE_URL');let apiKey=env('SUPABASE_ANON_KEY');if(!apiKey){try{apiKey=JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS')||'{}').default}catch{}}if(!base||!apiKey)return send({error:'SERVER_NOT_CONFIGURED'},503);
    try{
      const payload=validatePayload(await req.json()),{h}=await authenticate(auth,base,apiKey),access=await googleToken(),[sheet,db]=await Promise.all([sheetData(access),dbContext(base,h)]),results=reconcileRows(payload.rows,{...sheet,dbEvents:db.events,productMappings:db.productMappings});
      const blocked=results.filter(x=>x.status==='blocked'),applicable=results.filter(x=>x.status==='applicable'),duplicates=results.filter(x=>x.status==='duplicate'),repairs=duplicates.filter(x=>x.repairControl);
      if(payload.dryRun)return send({dryRun:true,canApply:blocked.length===0&&(applicable.length>0||repairs.length>0),results,received:results.length,applicable:applicable.length,duplicates:duplicates.length,repairs:repairs.length,blocked:blocked.length});
      if(blocked.length)return send({error:'REVIEW_REQUIRED',results},409);
      await appendGoogle(access,googleRows(applicable,payload.report));
      const controlRows=[...applicable,...repairs];
      try{await appendControl(base,h,movementRows(controlRows,payload.report))}catch(error){await recordRun(base,h,payload,results.length,applicable.length,blocked.length,'partial');throw error}
      await recordRun(base,h,payload,results.length,applicable.length,blocked.length,'success');
      return send({dryRun:false,canApply:false,results:results.map(x=>x.status==='applicable'?{...x,status:'applied',message:'SCM 원장과 통합 기록 반영 완료'}:x),received:results.length,applied:applicable.length,repaired:repairs.length,duplicates:duplicates.length,blocked:0});
    }catch(error){const code=error.message||'IMPORT_FAILED',status=code==='INVALID_PAYLOAD'?400:code==='LOGIN_REQUIRED'?401:code==='ADMIN_REQUIRED'||code==='ORIGIN_NOT_ALLOWED'?403:code==='REVIEW_REQUIRED'?409:503;return send({error:code,fields:error.fields||undefined},status)}
  };
}
