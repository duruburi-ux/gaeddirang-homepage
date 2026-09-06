import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../admin/operations.js',import.meta.url),'utf8');
function setup(){
  class Element{constructor(tag='div'){this.tag=tag;this.children=[];this.events={};this.value='';this.dataset={};this.focused=false;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}addEventListener(name,fn){this.events[name]=fn;}focus(){this.focused=true;}}
  const nodes=Object.fromEntries(['ops-areas','ops-search','ops-count'].map(id=>[id,new Element()]));
  const buttons=['orders','apps','inquiries','scm'].map(tab=>{const e=new Element('button');e.dataset.opsTab=tab;return e;});
  const context={window:{},document:{createElement:tag=>new Element(tag),getElementById:id=>nodes[id],querySelectorAll:()=>buttons}};
  vm.runInNewContext(code,context);return {api:context.window.Operations,nodes,buttons};
}
test('catalog has nine distinct areas and only fixed Notion source links',()=>{
  const {api}=setup();const all=api.search('');assert.equal(all.length,9);assert.equal(new Set(all.map(a=>a.id)).size,9);
  for(const a of all){for(const [,id] of a.links)assert.match(id,/^[a-f0-9]{32}$/);assert.equal(a.status,undefined);assert.equal(a.stock,undefined);}
});
test('search handles aliases, Korean Unicode, spaces, case and empty results',()=>{
  const {api}=setup();assert.equal(api.search('블라인드 북')[0].id,'stock');assert.equal(api.search('SCM')[0].id,'stock');assert.equal(api.search('수업'.normalize('NFD'))[0].id,'program');assert.equal(api.search('정산')[0].id,'finance');assert.equal(api.search('<script>nothing')[0],undefined);
});
test('renders directory and filters without HTML injection or network requests',()=>{
  const {api,nodes}=setup();api.init({navigate:()=>{}});assert.equal(nodes['ops-areas'].children.length,9);
  const a=nodes['ops-areas'].children[0].children[3].children[0];assert.match(a.href,/^https:\/\/app.notion.com\/p\/[a-f0-9]{32}$/);assert.equal(a.rel,'noopener noreferrer');
  nodes['ops-search'].value='없는업무<img onerror=x>';nodes['ops-search'].events.input();assert.equal(nodes['ops-areas'].children.length,1);assert.equal(nodes['ops-areas'].children[0].tag,'p');assert.match(nodes['ops-count'].textContent,/^0개/);
  assert.doesNotMatch(code,/\bfetch\s*\(|localStorage|sessionStorage|innerHTML/);
});
test('shortcuts and card actions use existing tab navigation',()=>{
  const {api,nodes,buttons}=setup();const called=[];api.init({navigate:name=>called.push(name)});buttons.forEach(b=>b.events.click());assert.deepEqual(called,['orders','apps','inquiries','scm']);
  nodes['ops-areas'].children[0].children[3].children.at(-1).events.click();assert.equal(called.at(-1),'scm');
});
test('dashboard search can narrow the shared work directory',()=>{
  const {api,nodes}=setup();api.init({navigate:()=>{}});api.setQuery('정산');assert.equal(nodes['ops-search'].value,'정산');assert.equal(nodes['ops-search'].focused,true);assert.equal(nodes['ops-areas'].children.length,1);assert.match(nodes['ops-areas'].children[0].children[1].textContent,/재무/);
});
test('directory is inside existing gated app and includes explicit sync boundaries',()=>{
  const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');assert.ok(html.indexOf('id="appView"')<html.indexOf('id="tab-operations"'));assert.ok(html.includes('await checkAdmin()'));assert.ok(html.includes("if(!TABS.includes(name))return;"));assert.match(html,/상태를 관리자 화면으로 자동 조회합니다/);assert.match(html,/메일로 받은 매출 엑셀을 연결 현황에서 검사한 뒤 승인하면 SCM에 반영합니다/);assert.match(html,/스마트스토어·스마트플레이스/);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.filter(id=>id==='tab-operations').length,1);
  for(const id of ['priorityTotal','dashSearchForm','dashScmStatus','dashScmMetrics','dashDataStatus'])assert.ok(html.includes(`id="${id}"`));
  for(const label of ['대시보드','업무 찾기','상품 재고','수업 신청','고객 명부','프로그램'])assert.ok(html.includes(`>${label}<`)||html.includes(`>${label}<span`));
});
