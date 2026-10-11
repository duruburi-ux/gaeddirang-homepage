import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import api from '../assets/public-site.js';
test('Korean date boundary and enrollment are independent of class end date', () => {
  assert.equal(api.seoulDate(new Date('2026-09-29T15:00:00Z')), '2026-09-30');
  const p={is_open:true,start_date:'2026-09-20',end_date:'2026-11-22',late_join:false};
  assert.equal(api.programStatus(p,'2026-09-30'),'in_progress');
  assert.equal(api.programStatus({...p,late_join:true},'2026-09-30'),'check_required');
  assert.equal(api.programStatus({...p,late_join:true,registration_verified_until:'2026-10-01'},'2026-09-30'),'open');
  assert.equal(api.programStatus({...p,late_join:true,registration_verified_until:'2026-09-29'},'2026-09-30'),'check_required');
  assert.equal(api.programStatus({...p,registration_end:'2026-09-19'},'2026-09-30'),'closed');
  assert.equal(api.programStatus(p,'2026-11-23'),'ended');
  assert.equal(api.programStatus({...p,registration_start:'2026-09-10'},'2026-09-01'),'upcoming');
});
test('expired sessions retain their historical price but no late-join promises',()=>{
  for(const is_open of [true,false]){
    const p=api.programForDisplay({is_open,end_date:'2026-09-29',time_info:'9월 29일<br>늦은 합류 가능',price:'59,000원'},'2026-09-30');
    assert.equal(p.badge_type,'지난 회차 정보');assert.doesNotMatch(p.time_info,/늦은 합류/);assert.match(p.price,/지난 회차/);
  }
});
test('CMS newest notices displace fallback; duplicate, expired, draft and future posts are handled',()=>{
  const fallback=Array.from({length:6},(_,i)=>({category:'news',title:`기록${i}`,published_on:'2026-09-08'}));
  const cms=[{category:'news',title:'최신',created_at:'2026-09-30T02:00:00Z'},{category:'news',title:'만료',expires_on:'2026-09-29',published_on:'2026-09-30'},{category:'news',title:'기록0',published_on:'2026-09-29',body:'갱신'},{category:'news',title:'미래',published_on:'2026-10-01'},{category:'news',title:'초안',is_published:false,published_on:'2026-09-30'}];
  const list=api.mergeNotices(fallback,cms,new Set(['기록5']),'2026-09-30');
  assert.equal(list[0].title,'최신');assert.equal(list[1].body,'갱신');assert.equal(list.filter(n=>n.title==='기록0').length,1);
  assert.ok(!list.some(n=>['만료','미래','초안','기록5'].includes(n.title)));
  assert.equal(api.noticeDate({date_label:'09.30'}),'');
  assert.equal(api.mergeNotices([{category:'notice',title:'고정 자료',published_on:'2026-09-30'}],[{category:'notice',title:'새 CMS 안내',published_on:'2026-09-30'}],new Set(),'2026-09-30')[0].title,'새 CMS 안내');
});
test('all advertised static book URLs exist without automatic redirects',async()=>{
  assert.equal(api.bookShareUrl({title:'문고리',slug:'moongori',img:'assets/moongori/cover.png'}),'https://gaeddirang.com/b/moongori/');
  assert.ok(api.bookShareUrl({title:'새 책',img:'cover.png'}).startsWith('https://gaeddirang.com/?book='));
  for(const slug of api.BOOK_SLUGS){
    const file=new URL(`../b/${slug}/index.html`,import.meta.url);await access(file);
    const html=await readFile(file,'utf8');assert.ok(html.includes(`href="https://gaeddirang.com/b/${slug}/"`));assert.doesNotMatch(html,/http-equiv=["']refresh|location\.(replace|assign)/i);
  }
});
test('shipping estimates match the published threshold',()=>{
  assert.deepEqual(api.shippingEstimate(17000),{subtotal:17000,shipping:3400,estimatedTotal:20400});
  assert.deepEqual(api.shippingEstimate(30000),{subtotal:30000,shipping:0,estimatedTotal:30000});
  assert.equal(api.shippingEstimate(34000).shipping,0);assert.equal(api.shippingEstimate(0).estimatedTotal,0);
});
test('inline scripts parse; opt-in is not checked; PDF does not forge consent; preview blocks writes',async()=>{
  const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
  for(const [,attrs,body] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(!attrs.includes('application/ld+json')&&!attrs.includes('src='))new vm.Script(body);}
  assert.doesNotMatch(html,/id="authMarketingConsent" checked/);assert.match(html,/photo_consent: false, refund_confirmed: false/);
  assert.match(html,/isLocalPreview && !\['GET','HEAD'\].includes\(method\)/);
});
