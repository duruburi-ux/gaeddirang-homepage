import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildWork,mapPage,SOURCES} from '../supabase/functions/work-read/model.mjs';
import {makeHandler} from '../supabase/functions/work-read/handler.mjs';

const rich=value=>({type:'rich_text',rich_text:[{plain_text:value}]});
const title=value=>({type:'title',title:[{plain_text:value}]});
const select=value=>({type:'select',select:value?{name:value}:null});
const date=value=>({type:'date',date:value?{start:value}:null});
function page(kind,overrides={}){
  const props={
    rooms:{'업무방':title('테스트 운영실'),'상태':select('진행 중'),'고친 쪽':select('코덱스'),'다음 행동':rich('다음 확인'),'최종 업데이트':date('2026-09-05')},
    tasks:{'업무명':title('테스트 업무'),'상태':select('진행 중'),'우선순위':select('높음'),'담당 팀':select('개발팀'),'담당 에이전트':rich('테스트 담당'),'실행 지시':rich('검수하기'),'마감일':date('2026-09-10'),'최근 수정':{type:'last_edited_time',last_edited_time:'2026-09-05T00:00:00Z'}},
    projects:{'프로젝트명':title('테스트 프로젝트'),'상태':select('차단'),'우선순위':select('최우선'),'책임 팀':select('공동'),'다음 마일스톤':rich('자료 받기'),'목표일':date('2026-09-12'),'최근 수정':{type:'last_edited_time',last_edited_time:'2026-08-01T00:00:00Z'}},
    decisions:{'결정 제목':title('테스트 결정'),'상태':select('승인 대기'),'우선순위':select('보통'),'실행 책임':select('대표'),'시행일':date('2026-09-20'),'최종 수정일':{type:'last_edited_time',last_edited_time:'2026-09-04T00:00:00Z'}},
  }[kind];
  return {object:'page',id:`test-${kind}`,url:`https://app.notion.com/test-${kind}`,last_edited_time:'2026-09-05T00:00:00Z',properties:{...props,...overrides},children:[{private:'must not leak'}]};
}
function fixture(){return Object.fromEntries(SOURCES.map(s=>[s.key,[page(s.key)]]))}
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s});

test('mapping returns only allowlisted operational fields and flags stale/attention',()=>{
  const now=Date.parse('2026-09-06T00:00:00Z'),d=buildWork(fixture(),now);
  assert.equal(d.records.length,4);assert.equal(d.summary.active,4);assert.equal(d.summary.blocked,1);assert.equal(d.summary.approvals,1);assert.equal(d.summary.stale,1);
  const project=d.records.find(x=>x.kind==='projects');assert.equal(project.stale,true);assert.equal(project.blocked,true);
  assert.ok(!('properties' in project));assert.ok(!('children' in project));assert.ok(!JSON.stringify(d).includes('must not leak'));
});

test('terminal records are excluded from active summary and room update is not a due date',()=>{
  const done=page('tasks',{'상태':select('완료')});const d=buildWork({...fixture(),tasks:[done]},Date.parse('2026-09-06T00:00:00Z'));
  assert.equal(d.records.find(x=>x.kind==='tasks').terminal,true);assert.equal(d.summary.active,3);
  assert.equal(mapPage('rooms',page('rooms'),Date.parse('2026-09-06T00:00:00Z')).due,'');
});

async function setup(){
  let clock=Date.parse('2026-09-06T00:00:00Z'),admin=true,valid=true,fail=false;
  const calls=[],envValues={SUPABASE_URL:'https://test.supabase.co',SUPABASE_ANON_KEY:'test-public',WORK_NOTION_TOKEN:'secret-test-token'};
  const sourceById=new Map(SOURCES.map(s=>[s.id,s.key]));
  const fetcher=async(url,opts={})=>{
    calls.push({url:String(url),opts});
    if(String(url).endsWith('/auth/v1/user'))return valid?json({id:'u',email:'team@example.test',email_confirmed_at:'2026-01-01'}):json({},401);
    if(String(url).endsWith('/rpc/is_admin'))return json(admin);
    if(String(url).endsWith('/admin_emails?select=email'))return json([{email:'team@example.test'}]);
    const m=String(url).match(/data_sources\/([^/]+)\/query$/);if(m){if(fail)return json({},500);const kind=sourceById.get(m[1]);return json({results:[page(kind)],has_more:false,next_cursor:null})}
    throw Error('Unexpected request '+url);
  };
  const handler=makeHandler({env:k=>envValues[k],fetcher,now:()=>clock});
  const request=(extra={})=>handler(new Request('https://test.supabase.co/functions/v1/work-read',{headers:{authorization:'Bearer user-token',origin:'https://gaeddirang.com'},...extra}));
  return {calls,envValues,request,handler,setAdmin:v=>admin=v,setValid:v=>valid=v,setFail:v=>fail=v,advance:n=>clock+=n};
}

test('unauthenticated, foreign-origin and write requests never reach Notion',async()=>{
  const s=await setup();assert.equal((await s.handler(new Request('https://test/'))).status,401);assert.equal((await s.request({method:'POST'})).status,405);assert.equal((await s.request({headers:{origin:'https://evil.test'}})).status,403);assert.equal(s.calls.length,0);
});

test('admin auth is rechecked and only four fixed Notion data sources are queried',async()=>{
  const s=await setup(),res=await s.request(),body=await res.json();assert.equal(res.status,200);assert.equal(body.work.records.length,4);assert.equal(body.meta.readOnly,true);
  const notion=s.calls.filter(x=>x.url.includes('api.notion.com'));assert.equal(notion.length,4);assert.deepEqual(notion.map(x=>x.url.split('/').at(-2)).sort(),SOURCES.map(x=>x.id).sort());
  for(const call of notion){assert.equal(call.opts.headers.Authorization,'Bearer secret-test-token');assert.equal(call.opts.headers['Notion-Version'],'2026-03-11')}
  const before=notion.length;s.setAdmin(false);assert.equal((await s.request()).status,403);assert.equal(s.calls.filter(x=>x.url.includes('api.notion.com')).length,before);
});

test('missing token is explicit and stale cache expires without leaking the token',async()=>{
  const s=await setup();delete s.envValues.WORK_NOTION_TOKEN;const r=await s.request();assert.equal(r.status,503);const d=await r.json();assert.equal(d.meta.error,'SOURCE_NOT_CONFIGURED');assert.equal(d.work,null);assert.ok(!JSON.stringify(d).includes('secret-test-token'));
});

test('source failure preserves a recent cache and marks it stale',async()=>{
  const s=await setup();const first=await(await s.request()).json();assert.equal(first.meta.stale,false);s.advance(60000);s.setFail(true);const second=await(await s.request()).json();assert.equal(second.meta.stale,true);assert.equal(second.work.records.length,4);s.advance(600000);const expired=await s.request();assert.equal(expired.status,503);assert.equal((await expired.json()).work,null);
});

test('browser integration is gated and contains no task snapshot or Notion token',()=>{
  const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8'),js=readFileSync(new URL('../admin/work.js',import.meta.url),'utf8');new vm.Script(js);for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
  assert.ok(html.indexOf('id="appView"')<html.indexOf('id="tab-work"'));assert.ok(html.includes("const TABS=['home','work','integration','operations','scm','orders','apps','members','cohorts','inquiries','alerts']"));assert.ok(html.includes('window.Work?.init'));
  assert.ok(js.includes('signal:current.signal'));assert.ok(!js.includes('signal:current,cache'));
  assert.ok(!html.includes('WORK_NOTION_TOKEN'));assert.ok(!js.includes('WORK_NOTION_TOKEN'));assert.ok(!html.includes('테스트 업무'));assert.ok(!js.includes('테스트 업무'));
});
