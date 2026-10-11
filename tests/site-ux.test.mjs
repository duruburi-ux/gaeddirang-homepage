import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
test('public UX helpers parse and never request, persist or transmit visitor data',async()=>{
  const js=await read('assets/site-ux.js');new vm.Script(js);
  assert.doesNotMatch(js,/\b(fetch|XMLHttpRequest|localStorage|sessionStorage|createClient)\s*[.(]/);
  assert.match(js,/MutationObserver/);assert.match(js,/child\.inert/);assert.match(js,/event\.key==='Tab'/);
});
test('main public UX IDs are unique and core form fields have visible labels',async()=>{
  const html=await read('index.html');
  const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const id of ['coName','coContact','coEmail','coAddress','authLoginEmail','authLoginPassword','authSignupEmail','authSignupPassword','apName','apContact','apEmail','apParticipants','emContent','emNickname','leadEmail'])assert.ok(markup.includes(`for="${id}"`),`${id} label`);
  assert.match(markup,/id="uxStatus"[^>]+role="status"/);
  assert.match(markup,/id="siteSearchModal" role="dialog"/);
});
test('canonical book page navigation retains no-redirect delivery and existing price data',async()=>{
  const html=await read('b/dasom_all_emotions_atlas/index.html');
  assert.match(html,/book-page\.css/);assert.match(html,/class="book-page-nav"/);
  assert.match(html,/"price": "15000"/);assert.match(html,/href="https:\/\/gaeddirang\.com\/b\/dasom_all_emotions_atlas\/"/);
  assert.doesNotMatch(html,/location\.(replace|assign)|http-equiv="refresh"/i);
});
