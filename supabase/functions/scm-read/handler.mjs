import {buildData,RANGES} from './model.mjs';
const SHEET='1ZeH4pa5s1QS8BlC_gbHWLLp0dhezISXfYTXXxiE0NKw';
const ORIGINS=new Set(['https://gaeddirang.com','https://www.gaeddirang.com']);
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const json64=v=>b64(enc.encode(JSON.stringify(v)));

export function makeHandler({env,fetcher=fetch,now=()=>Date.now(),cryptoImpl=crypto}){
  let token=null,tokenExpiry=0,cache=null,cacheAt=0,attempt=0,inFlight=null,lastError=null;
  async function request(url,options={}){return fetcher(url,{...options,signal:AbortSignal.timeout(12000)})}
  async function googleToken(){
    if(token&&now()<tokenExpiry-60000)return token;
    const value=env('SCM_GOOGLE_SERVICE_ACCOUNT');if(!value)throw Error('SOURCE_NOT_CONFIGURED');
    const c=JSON.parse(value);
    if(!c.client_email||!c.private_key)throw Error('SOURCE_NOT_CONFIGURED');
    const iat=Math.floor(now()/1000),url='https://oauth2.googleapis.com/token';
    const input=json64({alg:'RS256',typ:'JWT'})+'.'+json64({iss:c.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:url,iat,exp:iat+3600});
    const pem=c.private_key.replace(/-----[^-]+-----|\s/g,'');
    const key=await cryptoImpl.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
    const signature=await cryptoImpl.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(input));
    const response=await request(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:input+'.'+b64(signature)})});
    if(!response.ok)throw Error('SOURCE_AUTH_FAILED');
    const d=await response.json();if(!d.access_token)throw Error('SOURCE_AUTH_FAILED');
    token=d.access_token;tokenExpiry=now()+Math.min(Number(d.expires_in)||3600,3600)*1000;return token;
  }
  async function refresh(){
    const access=await googleToken();const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values:batchGet`);
    Object.values(RANGES).forEach(r=>url.searchParams.append('ranges',r));url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
    const res=await request(url,{headers:{Authorization:'Bearer '+access}});
    if(!res.ok){if(res.status===401){token=null;tokenExpiry=0}throw Error('SOURCE_READ_FAILED')}
    const d=await res.json();if(d.valueRanges?.length!==Object.keys(RANGES).length)throw Error('SCHEMA_CHANGED');
    const next=buildData(Object.fromEntries(Object.keys(RANGES).map((k,i)=>[k,d.valueRanges[i]])));
    cache=next;cacheAt=now();lastError=null;
  }
  return async function handle(req){
    const origin=req.headers.get('origin');
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
    if(origin&&ORIGINS.has(origin))headers['Access-Control-Allow-Origin']=origin;
    const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
    if(origin&&!ORIGINS.has(origin))return send({error:'ORIGIN_NOT_ALLOWED'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Max-Age':'600'}});
    if(req.method!=='GET')return send({error:'READ_ONLY'},405);
    const auth=req.headers.get('authorization');if(!auth?.startsWith('Bearer '))return send({error:'LOGIN_REQUIRED'},401);
    const base=env('SUPABASE_URL');let apiKey=env('SUPABASE_ANON_KEY');
    if(!apiKey){try{apiKey=JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS')||'{}').default}catch{}}
    if(!base||!apiKey)return send({error:'SERVER_NOT_CONFIGURED'},503);
    // Validate the bearer on every request, including cache hits. Never trust browser role flags.
    try{
      const h={Authorization:auth,apikey:apiKey};
      const userRes=await request(base+'/auth/v1/user',{headers:h});
      if(userRes.status===401||userRes.status===403)return send({error:'LOGIN_REQUIRED'},401);
      if(!userRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      const user=await userRes.json();if(!user.id||!user.email||user.is_anonymous||!user.email_confirmed_at)return send({error:'ADMIN_REQUIRED'},403);
      const adminRes=await request(base+'/rest/v1/rpc/is_admin',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:'{}'});
      if(!adminRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      if(await adminRes.json()!==true)return send({error:'ADMIN_REQUIRED'},403);
      // Also compare the authoritative current email, not only an older JWT email claim.
      const allowRes=await request(base+'/rest/v1/admin_emails?select=email',{headers:h});
      if(!allowRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      const allow=await allowRes.json();
      if(!Array.isArray(allow)||!allow.some(r=>String(r.email).toLowerCase()===user.email.toLowerCase()))return send({error:'ADMIN_REQUIRED'},403);
    }catch{return send({error:'AUTH_CHECK_FAILED'},503)}
    if(!attempt||now()-attempt>=55000){
      if(!inFlight){attempt=now();inFlight=refresh().catch(e=>{lastError=['SOURCE_NOT_CONFIGURED','SOURCE_AUTH_FAILED','SOURCE_READ_FAILED','SCHEMA_CHANGED','DUPLICATE_SKU'].includes(e.message)?e.message:'SOURCE_READ_FAILED'}).finally(()=>{inFlight=null})}
    }
    if(inFlight)await inFlight;
    // Keep stale data at most 10 minutes; clients always see the actual successful read time.
    const usable=cache&&now()-cacheAt<600000;
    return send({datasets:usable?cache:null,meta:{fetchedAt:cacheAt?new Date(cacheAt).toISOString():null,stale:!!lastError||!usable,error:lastError,readOnly:true,pollSeconds:60,payhere:'not_connected',stockCalculation:'needs_review'}},usable?200:503);
  };
}
