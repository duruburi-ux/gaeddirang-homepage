import {build,RANGES,SETTING_KEY} from './model.mjs';
// SCM 「거래처」 탭 읽기 전용. 인증·구글 계정은 scm-read·royalty-read와 같다.
// 시트 ID는 doc_settings(key=SETTING_KEY, 관리자만 읽기)에서 요청한 사람 권한으로 읽는다.
const ORIGINS=new Set(['https://gaeddirang.com','https://www.gaeddirang.com']);
const enc=new TextEncoder();
const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const json64=v=>b64(enc.encode(JSON.stringify(v)));
const KNOWN=['SOURCE_NOT_CONFIGURED','SOURCE_AUTH_FAILED','SOURCE_READ_FAILED','SHEET_NOT_SHARED','SCHEMA_CHANGED'];

export function makeHandler({env,fetcher=fetch,now=()=>Date.now(),cryptoImpl=crypto}){
  let token=null,tokenExpiry=0,serviceEmail=null;
  const cache=new Map();
  async function request(url,options={}){return fetcher(url,{...options,signal:AbortSignal.timeout(12000)})}
  async function googleToken(){
    if(token&&now()<tokenExpiry-60000)return token;
    const value=env('SCM_GOOGLE_SERVICE_ACCOUNT');if(!value)throw Error('SOURCE_NOT_CONFIGURED');
    const c=JSON.parse(value);
    if(!c.client_email||!c.private_key)throw Error('SOURCE_NOT_CONFIGURED');
    serviceEmail=c.client_email;
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
  async function read(sheetId){
    const hit=cache.get(sheetId);
    if(hit&&now()-hit.at<55000)return hit;
    const access=await googleToken();
    const url=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchGet`);
    Object.values(RANGES).forEach(r=>url.searchParams.append('ranges',r));
    url.searchParams.set('valueRenderOption','FORMATTED_VALUE');
    const res=await request(url,{headers:{Authorization:'Bearer '+access}});
    if(!res.ok){
      if(res.status===401){token=null;tokenExpiry=0}
      throw Error(res.status===403||res.status===404?'SHEET_NOT_SHARED':res.status===400?'SCHEMA_CHANGED':'SOURCE_READ_FAILED');
    }
    const d=await res.json();if(d.valueRanges?.length!==Object.keys(RANGES).length)throw Error('SCHEMA_CHANGED');
    const entry={data:build(Object.fromEntries(Object.keys(RANGES).map((k,i)=>[k,d.valueRanges[i]]))),at:now()};
    cache.set(sheetId,entry);return entry;
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
    const h={Authorization:auth,apikey:apiKey};
    let sheetId;
    try{
      const userRes=await request(base+'/auth/v1/user',{headers:h});
      if(userRes.status===401||userRes.status===403)return send({error:'LOGIN_REQUIRED'},401);
      if(!userRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      const user=await userRes.json();if(!user.id||!user.email||user.is_anonymous||!user.email_confirmed_at)return send({error:'ADMIN_REQUIRED'},403);
      const adminRes=await request(base+'/rest/v1/rpc/is_admin',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:'{}'});
      if(!adminRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      if(await adminRes.json()!==true)return send({error:'ADMIN_REQUIRED'},403);
      const allowRes=await request(base+'/rest/v1/admin_emails?select=email',{headers:h});
      if(!allowRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      const allow=await allowRes.json();
      if(!Array.isArray(allow)||!allow.some(r=>String(r.email).toLowerCase()===user.email.toLowerCase()))return send({error:'ADMIN_REQUIRED'},403);
      const setRes=await request(base+`/rest/v1/doc_settings?select=value&key=eq.${SETTING_KEY}`,{headers:h});
      if(!setRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      sheetId=String((await setRes.json())[0]?.value||'').trim();
    }catch{return send({error:'AUTH_CHECK_FAILED'},503)}
    if(!/^[A-Za-z0-9_-]{20,100}$/.test(sheetId))return send({error:'SOURCE_NOT_CONFIGURED',meta:{readOnly:true}},503);
    try{
      const entry=await read(sheetId);
      return send({...entry.data,meta:{fetchedAt:new Date(entry.at).toISOString(),stale:false,readOnly:true}});
    }catch(e){
      const error=KNOWN.includes(e.message)?e.message:'SOURCE_READ_FAILED';
      const hit=cache.get(sheetId);
      if(hit&&now()-hit.at<600000)return send({...hit.data,meta:{fetchedAt:new Date(hit.at).toISOString(),stale:true,error,readOnly:true}});
      return send({error,meta:{readOnly:true,serviceAccount:error==='SHEET_NOT_SHARED'?serviceEmail:undefined}},503);
    }
  };
}
