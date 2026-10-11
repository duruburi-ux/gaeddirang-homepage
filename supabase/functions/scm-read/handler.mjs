import {buildData,RANGES} from './model.mjs';
import {BOOKSHOP_RANGES,BOOKSHOP_SETTING_KEY,buildBookshop} from './bookshop-model.mjs';
const SHEET='1ZeH4pa5s1QS8BlC_gbHWLLp0dhezISXfYTXXxiE0NKw';
const ORIGINS=new Set(['https://gaeddirang.com','https://www.gaeddirang.com']);
const FRESH_MS=10*60*1000,HISTORY_MS=36*60*60*1000;
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const json64=v=>b64(enc.encode(JSON.stringify(v)));

export function makeHandler({env,fetcher=fetch,now=()=>Date.now(),cryptoImpl=crypto}){
  let token=null,tokenExpiry=0,cache=null,cacheAt=0,bookshopCache=null,bookshopAt=0,attempt=0,inFlight=null,lastError=null,bookshopError=null;
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
  async function readRanges(access,sheet,ranges,schemaError='SCHEMA_CHANGED'){
    const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheet)}/values:batchGet`);
    Object.values(ranges).forEach(range=>url.searchParams.append('ranges',range));url.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
    const res=await request(url,{headers:{Authorization:'Bearer '+access}});
    if(!res.ok){if(res.status===401){token=null;tokenExpiry=0}throw Error('SOURCE_READ_FAILED')}
    const data=await res.json();if(data.valueRanges?.length!==Object.keys(ranges).length)throw Error(schemaError);
    return Object.fromEntries(Object.keys(ranges).map((key,index)=>[key,data.valueRanges[index]]));
  }
  async function refresh(bookshopSheetId){
    const access=await googleToken();
    const next=buildData(await readRanges(access,SHEET,RANGES));
    cache=next;cacheAt=now();lastError=null;
    if(!/^[A-Za-z0-9_-]{20,100}$/.test(bookshopSheetId||'')){bookshopError='BOOKSHOP_SOURCE_NOT_CONFIGURED';return}
    try{
      bookshopCache=buildBookshop(await readRanges(access,bookshopSheetId,BOOKSHOP_RANGES,'BOOKSHOP_SCHEMA_CHANGED'));
      bookshopAt=now();bookshopError=null;
    }catch(error){bookshopError=error.message==='BOOKSHOP_SCHEMA_CHANGED'?'BOOKSHOP_SCHEMA_CHANGED':'BOOKSHOP_SOURCE_READ_FAILED'}
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
    const h={Authorization:auth,apikey:apiKey};let bookshopSheetId='';
    try{
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
    try{
      const settingRes=await request(base+`/rest/v1/doc_settings?select=value&key=eq.${BOOKSHOP_SETTING_KEY}`,{headers:h});
      if(settingRes.ok){const settings=await settingRes.json();bookshopSheetId=String(settings?.[0]?.value||'').trim()}
      else bookshopError='BOOKSHOP_SOURCE_NOT_CONFIGURED';
    }catch{bookshopError='BOOKSHOP_SOURCE_NOT_CONFIGURED'}
    if(!attempt||now()-attempt>=55000){
      if(!inFlight){attempt=now();inFlight=refresh(bookshopSheetId).catch(e=>{lastError=['SOURCE_NOT_CONFIGURED','SOURCE_AUTH_FAILED','SOURCE_READ_FAILED','SCHEMA_CHANGED','DUPLICATE_SKU'].includes(e.message)?e.message:'SOURCE_READ_FAILED'}).finally(()=>{inFlight=null})}
    }
    if(inFlight)await inFlight;
    // Daily operational sources remain visible as an explicitly historical record for 36 hours.
    const age=cacheAt?now()-cacheAt:Infinity,usable=cache&&age<HISTORY_MS,fresh=usable&&age<FRESH_MS&&!lastError;
    const bookshopAge=bookshopAt?now()-bookshopAt:Infinity,bookshopUsable=bookshopCache&&bookshopAge<HISTORY_MS;
    const datasets=usable?{...cache,bookshop:bookshopUsable?bookshopCache:null}:null;
    return send({datasets,meta:{fetchedAt:cacheAt?new Date(cacheAt).toISOString():null,stale:!fresh,freshness:fresh?'fresh':'historical',error:lastError,readOnly:true,pollSeconds:60,payhere:'reviewed_import',stockCalculation:'ledger',bookshop:{fetchedAt:bookshopAt?new Date(bookshopAt).toISOString():null,stale:!bookshopUsable||bookshopAge>=FRESH_MS||!!bookshopError,error:bookshopError,readOnly:true}}},usable?200:503);
  };
}
