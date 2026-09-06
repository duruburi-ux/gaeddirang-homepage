import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildData,num,RANGES} from '../supabase/functions/scm-read/model.mjs';
import {makeHandler} from '../supabase/functions/scm-read/handler.mjs';

// Entirely synthetic. Never commit real inventory or accounts as fixtures.
function fixture(){return {
 products:{values:[['SKU','페이히어상품명','내부표준상품명','상품군','재고SKU','바코드번호','정가','원가','페이히어카테고리','재고소유','활성상태','현재고'],['TEST-B','테스트책','테스트책','도서','TEST-B','TEST-B',12000,null,'도서','자체','활성',8],['TEST-BB','감정-테스트','감정-테스트','블라인드북','TEST-B','TEST-BB',15000,null,'블라인드북','자체','활성',1]]},
 books:{values:[['SKU','현재고','정가'],['TEST-B',8,12000]]},
 goods:{values:[['SKU','총재고']]},
 blind:{values:[['블라인드SKU','구성도서SKU','도서정가','블라인드판매가','현재고','키워드','유형','구성도서'],['TEST-BB','TEST-B',12000,15000,1,'테스트','감정','테스트책']]},
 counts:{values:[['SKU','확정수량','상품명','실사·등록일','재고 범위'],['TEST-B',8,'테스트책','2026-09-01','테스트 장소']]},
 ledger:{values:[['날짜','유형','SKU','원장주의']]}
}}
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s});
async function setup(){
 let clock=2000000000000,admin=true,valid=true,currentEmail='team@example.test',fail=false;
 const raw=fixture(),calls=[];
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pk=await crypto.subtle.exportKey('pkcs8',pair.privateKey);
 const envValues={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test-public',SCM_GOOGLE_SERVICE_ACCOUNT:JSON.stringify({client_email:'service@example.test',private_key:'-----BEGIN PRIVATE KEY-----\n'+Buffer.from(pk).toString('base64')+'\n-----END PRIVATE KEY-----'})};
 const fetcher=async(url,opts)=>{
   calls.push({url,opts});
   if(String(url).endsWith('/auth/v1/user'))return valid?json({id:'test-user',email:currentEmail,email_confirmed_at:'2026-01-01'}):json({},401);
   if(String(url).endsWith('/rpc/is_admin'))return json(admin);
   if(String(url).endsWith('/admin_emails?select=email'))return json([{email:'team@example.test'}]);
   if(url==='https://oauth2.googleapis.com/token')return json({access_token:'test-google',expires_in:3600});
   if(url instanceof URL&&url.hostname==='sheets.googleapis.com')return fail?json({},500):json({valueRanges:Object.keys(RANGES).map(k=>raw[k])});
   throw Error('Unexpected external request');
 };
 const handler=makeHandler({env:k=>envValues[k],fetcher,now:()=>clock});
 const request=(extra={})=>handler(new Request('https://test.supabase.co/functions/v1/scm-read',{headers:{authorization:'Bearer test-user-token',origin:'https://gaeddirang.com'},...extra}));
 return {raw,calls,envValues,request,handler,advance:n=>clock+=n,setAdmin:v=>admin=v,setValid:v=>valid=v,setEmail:v=>currentEmail=v,setFail:v=>fail=v};
}
test('mapping preserves packaged stock, null costs and current book quantities',()=>{const d=buildData(fixture());assert.equal(d.inventory[0].stock,8);assert.equal(d.inventory[1].stock,1);assert.equal(d.inventory[0].cost,null);assert.equal(d.blind[0].price,15000);assert.equal(d.blind[0].check,'')});
test('blank/malformed/negative counts are not converted into zero',()=>{assert.equal(num(''),null);assert.equal(num('55/장'),null);assert.equal(num(-1),-1);assert.equal(num('1,000'),1000);assert.equal(num(true),null)});
test('new source rows included and missing links marked unknown',()=>{const f=fixture();f.products.values.push(['TEST-NEW','New','New','도서','UNKNOWN']);const d=buildData(f);assert.equal(d.inventory.length,3);assert.equal(d.inventory[2].stock,null);assert.ok(d.actions.length)});
test('duplicate keys and schema changes fail closed',()=>{const f=fixture();f.products.values.push([...f.products.values[1]]);assert.throws(()=>buildData(f),/DUPLICATE_SKU/);const g=fixture();g.books.values[0][1]='renamed';assert.throws(()=>buildData(g),/SCHEMA_CHANGED/)});
test('column order is not a data contract',()=>{const f=fixture();f.books.values=f.books.values.map(r=>r.toReversed());assert.equal(buildData(f).inventory[0].stock,8)});
test('source price change creates blind-book validation error',()=>{const f=fixture();f.books.values[1][2]=13000;assert.match(buildData(f).blind[0].check,/3,000/)});
test('returned item with positive stock is blocked from normal available status',()=>{const f=fixture();f.products.values[1][10]='반품·미등록';assert.equal(buildData(f).inventory[0].status,'반품·재고 확인')});
test('no token, foreign origin, write request cannot invoke any upstream',async()=>{const s=await setup();assert.equal((await s.handler(new Request('https://test/'))).status,401);assert.equal((await s.request({method:'POST'})).status,405);assert.equal((await s.request({headers:{origin:'https://evil.test'}})).status,403);assert.equal(s.calls.length,0)});
test('CORS preflight permits only intended origins and read methods',async()=>{const s=await setup();const r=await s.request({method:'OPTIONS'});assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://gaeddirang.com');assert.equal(r.headers.get('Access-Control-Allow-Methods'),'GET, OPTIONS');assert.equal(s.calls.length,0)});
test('invalid token and non-admin never reach Google',async()=>{const s=await setup();s.setValid(false);assert.equal((await s.request()).status,401);s.setValid(true);s.setAdmin(false);assert.equal((await s.request()).status,403);assert.ok(s.calls.every(c=>!String(c.url).includes('google')))});
test('current user email must match allowlist even if old JWT passed RPC',async()=>{const s=await setup();s.setEmail('changed@example.test');assert.equal((await s.request()).status,403);assert.ok(s.calls.every(c=>!String(c.url).includes('google')))});
test('authorized source call succeeds; Google scope is read-only',async()=>{const s=await setup(),r=await s.request(),d=await r.json();assert.equal(r.status,200);assert.equal(d.datasets.inventory.length,2);assert.equal(d.meta.stale,false);assert.equal(d.meta.payhere,'not_connected');assert.equal(r.headers.get('Cache-Control'),'private, no-store');const assertion=s.calls.find(x=>x.url==='https://oauth2.googleapis.com/token').opts.body.get('assertion');const payload=JSON.parse(Buffer.from(assertion.split('.')[1],'base64url'));assert.equal(payload.scope,'https://www.googleapis.com/auth/spreadsheets.readonly');assert.equal(payload.exp-payload.iat,3600)});
test('cache is reauthorized every request and revoked admins cannot get it',async()=>{const s=await setup();await s.request();const firstGoogle=s.calls.filter(c=>String(c.url).includes('sheets.googleapis')).length;s.setAdmin(false);const r=await s.request();assert.equal(r.status,403);assert.equal(s.calls.filter(c=>String(c.url).includes('sheets.googleapis')).length,firstGoogle);assert.deepEqual(await r.json(),{error:'ADMIN_REQUIRED'})});
test('failure preserves last timestamp and expires the previous data',async()=>{const s=await setup();const first=await(await s.request()).json();s.advance(60000);s.setFail(true);const d=await(await s.request()).json();assert.equal(d.meta.stale,true);assert.equal(d.meta.fetchedAt,first.meta.fetchedAt);assert.equal(d.datasets.inventory.length,2);s.advance(600000);const expired=await s.request();assert.equal(expired.status,503);assert.equal((await expired.json()).datasets,null)});
test('missing source secret is explicit and does not leak environment values',async()=>{const s=await setup();delete s.envValues.SCM_GOOGLE_SERVICE_ACCOUNT;const r=await s.request();assert.equal(r.status,503);const d=await r.json();assert.equal(d.meta.error,'SOURCE_NOT_CONFIGURED');assert.equal(d.datasets,null);assert.ok(!JSON.stringify(d).includes('test-public'))});
test('browser scripts parse; baseline actions kept; no embedded inventory or secret',()=>{const h=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');for(const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);new vm.Script(readFileSync(new URL('../admin/scm.js',import.meta.url),'utf8'));for(const tab of ['home','orders','apps','members','cohorts','inquiries','alerts','scm','operations'])assert.ok(h.includes(`id="tab-${tab}"`));assert.ok(!h.includes('app-data'));assert.ok(!h.includes('BEGIN PRIVATE KEY'));assert.ok(h.includes("const TABS=['home','operations','scm','orders','apps','members','cohorts','inquiries','alerts']"))});
