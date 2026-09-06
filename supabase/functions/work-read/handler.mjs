import {buildWork,SOURCES} from './model.mjs';
const ORIGINS=new Set(['https://gaeddirang.com','https://www.gaeddirang.com']);
const NOTION_VERSION='2026-03-11';

export function makeHandler({env,fetcher=fetch,now=()=>Date.now()}){
  let cache=null,cacheAt=0,attempt=0,inFlight=null,lastError=null;
  async function request(url,options={}){return fetcher(url,{...options,signal:AbortSignal.timeout(12000)})}
  async function querySource(source,token){
    const rows=[];let cursor;
    for(let page=0;page<3;page++){
      const body={page_size:100};if(cursor)body.start_cursor=cursor;
      const res=await request(`https://api.notion.com/v1/data_sources/${source.id}/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Notion-Version':NOTION_VERSION,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(res.status===401||res.status===403||res.status===404)throw Error('SOURCE_ACCESS_DENIED');
      if(!res.ok)throw Error('SOURCE_READ_FAILED');
      const data=await res.json();if(!Array.isArray(data.results))throw Error('SCHEMA_CHANGED');
      rows.push(...data.results);if(!data.has_more)break;
      cursor=data.next_cursor;if(!cursor)throw Error('SCHEMA_CHANGED');
    }
    return rows;
  }
  async function refresh(){
    const token=env('WORK_NOTION_TOKEN');if(!token)throw Error('SOURCE_NOT_CONFIGURED');
    const pairs=await Promise.all(SOURCES.map(async source=>[source.key,await querySource(source,token)]));
    cache=buildWork(Object.fromEntries(pairs),now());cacheAt=now();lastError=null;
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
    try{
      const h={Authorization:auth,apikey:apiKey};
      const userRes=await request(base+'/auth/v1/user',{headers:h});
      if(userRes.status===401||userRes.status===403)return send({error:'LOGIN_REQUIRED'},401);
      if(!userRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      const user=await userRes.json();if(!user.id||!user.email||user.is_anonymous||!user.email_confirmed_at)return send({error:'ADMIN_REQUIRED'},403);
      const adminRes=await request(base+'/rest/v1/rpc/is_admin',{method:'POST',headers:{...h,'Content-Type':'application/json'},body:'{}'});
      if(!adminRes.ok||await adminRes.json()!==true)return send({error:adminRes.ok?'ADMIN_REQUIRED':'AUTH_CHECK_FAILED'},adminRes.ok?403:503);
      const allowRes=await request(base+'/rest/v1/admin_emails?select=email',{headers:h});if(!allowRes.ok)return send({error:'AUTH_CHECK_FAILED'},503);
      const allow=await allowRes.json();if(!Array.isArray(allow)||!allow.some(r=>String(r.email).toLowerCase()===user.email.toLowerCase()))return send({error:'ADMIN_REQUIRED'},403);
    }catch{return send({error:'AUTH_CHECK_FAILED'},503)}
    if(!attempt||now()-attempt>=55000){
      if(!inFlight){attempt=now();inFlight=refresh().catch(e=>{lastError=['SOURCE_NOT_CONFIGURED','SOURCE_ACCESS_DENIED','SOURCE_READ_FAILED','SCHEMA_CHANGED'].includes(e.message)?e.message:'SOURCE_READ_FAILED'}).finally(()=>{inFlight=null})}
    }
    if(inFlight)await inFlight;
    const usable=cache&&now()-cacheAt<600000;
    return send({work:usable?cache:null,meta:{fetchedAt:cacheAt?new Date(cacheAt).toISOString():null,stale:!!lastError||!usable,error:lastError,readOnly:true,pollSeconds:60,sources:SOURCES.map(({key,label})=>({key,label}))}},usable?200:503);
  };
}
