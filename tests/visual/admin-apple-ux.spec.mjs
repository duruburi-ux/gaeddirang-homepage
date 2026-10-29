import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import path from 'node:path';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const screenshotDir=path.resolve('artifacts/admin-apple-ux-20261029');
mkdirSync(screenshotDir,{recursive:true});

async function install(page){
  await page.addInitScript(A=>{
    window.__session={access_token:`token-${A}`,user:{id:A,email:'admin@example.test'}};
    window.__authCallbacks=[];
    class Query{
      select(){return this}order(){return this}range(){return this}limit(){return this}in(){return this}eq(){return this}
      then(resolve){return Promise.resolve({data:[],error:null,count:0}).then(resolve)}
      single(){return Promise.resolve({data:null,error:{message:'empty fixture'}})}
    }
    const auth={getSession:async()=>({data:{session:window.__session},error:null}),onAuthStateChange:cb=>{window.__authCallbacks.push(cb);return {data:{subscription:{unsubscribe(){}}}}},signOut:async()=>({error:null}),signInWithPassword:async()=>({data:{session:window.__session},error:null}),resetPasswordForEmail:async()=>({error:null})};
    const functions={invoke:async(name,options={})=>name==='assistant-workspace'&&options.method==='GET'?{data:{contractVersion:1,fetchedAt:new Date().toISOString(),executionEnabled:false,personalPlans:[],requests:[]},error:null}:{data:null,error:{message:'unconnected fixture function'}}};
    window.supabase={createClient:()=>({auth,from:()=>new Query(),rpc:async name=>name==='is_admin'?{data:true,error:null}:{data:null,error:{message:'unsupported fixture rpc'}},functions,storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{message:'empty fixture'}})})}})};
  },A);
  await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
  await page.route('**/xlsx.full.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.XLSX={};'}));
  await page.route('**/functions/v1/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await page.route('**/functions/v1/scm-read',route=>{const fetchedAt=new Date().toISOString();return route.fulfill({contentType:'application/json',body:JSON.stringify({meta:{fetchedAt,stale:false,bookshop:{fetchedAt,stale:false,error:null,readOnly:true}},datasets:{inventory:[{sku:'UX-001',name:'가상 책공방 산책',author:'가상 작가',isbn:'9780000000011',category:'에세이',owner:'위탁',price:12000,stock:4,status:'재고 있음',kind:'도서'}],blind:[],counts:[],actions:[],connections:[],bookshop:{items:[{sku:'UX-001',ledgerCount:4,reserved:1,pendingInbound:0,physicalCount:null,sellableConfirmed:null,physicalCheck:'미확인',hasEvidence:false,review:'합성 자료 · 실사 필요'}],purchaseCandidates:[],summary:{sourceItems:1,ledgerQuantity:4,reservations:{titles:1,quantity:1},pendingInbound:{titles:0,quantity:0},purchase:{titles:0,quantity:0,supplyTotal:0},sellableConfirmedTitles:0}}}})});});
}

test.beforeEach(async({page})=>{await install(page)});

test('1440 team overview keeps clear hierarchy and safe unknown states',async({page})=>{
  await page.setViewportSize({width:1440,height:1050});
  await page.goto('/admin/#home',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:'세 사람이 함께 보는 전체 현황'})).toBeVisible();
  await expect(page.locator('#team-lanes-grid .team-lane')).toHaveCount(9);
  await expect(page.locator('#team-lanes-status')).toContainText('원천 확인 전');
  await expect(page.locator('.ux-command-trigger')).toBeVisible();
  await page.screenshot({path:path.join(screenshotDir,'team-overview-1440.png'),fullPage:true});
});

test('command palette supports keyboard navigation and repeated opening without duplication',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/admin/#home',{waitUntil:'domcontentloaded'});
  await page.keyboard.press(process.platform==='darwin'?'Meta+K':'Control+K');
  await expect(page.locator('.ux-command')).toBeVisible();
  await page.locator('#ux-command-input').fill('프로그램 검토');
  await expect(page.locator('[data-ux-command="publishing"]')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tab-publishing')).toBeVisible();
  await page.keyboard.press(process.platform==='darwin'?'Meta+K':'Control+K');
  await page.keyboard.press('Escape');
  await expect(page.locator('.ux-command')).toBeHidden();
  expect(await page.locator('.ux-command').count()).toBe(1);
  expect(await page.locator('.ux-mobile-nav').count()).toBe(1);
});

test('390 book finder keeps search and primary navigation within touch reach',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/#finder',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#tab-finder')).toBeVisible();
  await expect(page.locator('.ux-mobile-nav')).toBeVisible();
  await expect(page.locator('#book-finder-query')).toBeVisible();
  await expect(page.locator('[data-ux-route="finder"]')).toHaveAttribute('aria-current','page');
  const boxes=await page.locator('.ux-mobile-nav button').evaluateAll(rows=>rows.map(row=>row.getBoundingClientRect().height));
  expect(boxes.every(height=>height>=54)).toBeTruthy();
  await page.screenshot({path:path.join(screenshotDir,'book-finder-390.png'),fullPage:true});
});

test('program review keeps draft actions, preview and disconnected publishing boundary visible',async({page})=>{
  await page.setViewportSize({width:1440,height:1050});
  await page.goto('/admin/#publishing',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.program-publishing-boundary')).toContainText('자동 게시 스케줄은 연결하지 않습니다');
  await expect(page.locator('#program-rollback')).toBeVisible();
  await expect(page.locator('#program-preview')).toBeVisible();
  await page.screenshot({path:path.join(screenshotDir,'program-review-1440.png'),fullPage:true});
});

test('account transition and rapid navigation do not multiply UX shell controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/#home',{waitUntil:'domcontentloaded'});
  for(let i=0;i<3;i++){await page.locator('[data-ux-route="finder"]').click();await page.locator('[data-ux-route="home"]').click()}
  expect(await page.locator('.ux-mobile-nav').count()).toBe(1);
  expect(await page.locator('.ux-command').count()).toBe(1);
  await page.evaluate(()=>window.__authCallbacks.forEach(callback=>callback('SIGNED_OUT',null)));
  await expect(page.locator('#loginView')).toBeVisible();
  await expect(page.locator('#team-lanes-grid')).toBeEmpty();
});
