import {test,expect} from '@playwright/test';

const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function install(page,{initial=A,admins=[A,B],delayAdminFor=''}={}){
  await page.addInitScript(({A,B,initial,admins,delayAdminFor})=>{
    window.__session=initial?{access_token:`token-${initial}`,user:{id:initial,email:`${initial[0]}@example.test`}}:null;
    window.__authCallbacks=[];window.__adminResolvers=[];
    class Query{
      select(){return this}order(){return this}range(){return this}limit(){return this}in(){return this}eq(){return this}
      then(resolve){return Promise.resolve({data:[],error:null,count:0}).then(resolve)}
      single(){return Promise.resolve({data:null,error:{message:'empty fixture'}})}
    }
    const auth={
      getSession:async()=>({data:{session:window.__session},error:null}),
      onAuthStateChange:cb=>{window.__authCallbacks.push(cb);return {data:{subscription:{unsubscribe(){}}}}},
      signOut:async()=>{window.__session=null;window.__authCallbacks.forEach(cb=>cb('SIGNED_OUT',null));return {error:null}},
      signInWithPassword:async()=>({data:{session:window.__session},error:null}),
      resetPasswordForEmail:async()=>({error:null}),
    };
    const rpc=async name=>{
      if(name!=='is_admin')return {data:null,error:{message:'unsupported fixture rpc'}};
      const id=window.__session?.user?.id||'';
      if(id===delayAdminFor)await new Promise(resolve=>window.__adminResolvers.push(resolve));
      return {data:admins.includes(id),error:null};
    };
    const functions={invoke:async(name,options={})=>{
      if(name==='assistant-workspace'&&options.method==='GET')return {data:{contractVersion:1,fetchedAt:new Date().toISOString(),executionEnabled:false,personalPlans:[],requests:[]},error:null};
      return {data:null,error:{message:'unconnected fixture function'}};
    }};
    window.supabase={createClient:()=>({auth,from:()=>new Query(),rpc,functions,storage:{from:()=>({createSignedUrl:async()=>({data:null,error:{message:'empty fixture'}})})}})};
  },{A,B,initial,admins,delayAdminFor});
  await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
  await page.route('**/xlsx.full.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.XLSX={};'}));
  await page.route('**/functions/v1/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
}
async function switchUser(page,id,event='SIGNED_IN'){
  await page.evaluate(({id,event})=>{
    window.__session=id?{access_token:`token-${id}`,user:{id,email:`${id[0]}@example.test`}}:null;
    window.__authCallbacks.forEach(callback=>callback(event,window.__session));
  },{id,event});
}
async function open(page,options={}){
  await install(page,options);
  await page.goto('/admin/#home',{waitUntil:'domcontentloaded'});
}
async function seedTeam(page,userId,generation,title='A 전용 집계'){
  await page.evaluate(({userId,generation,title})=>{
    window.TeamDashboard.activate(userId,generation);
    window.TeamDashboard.setCore({applications:[],cohorts:[{status:'모집중'}],orders:[],inquiries:[],alerts:[]},true,{userId,generation});
    window.dispatchEvent(new CustomEvent('operations:sources-snapshot',{detail:{userId,generation,snapshot:{sources:{team:{readState:'current',lastSuccessAt:'2026-10-29T00:00:00Z'}},datasets:{team:{tasks:[{sourceId:'task-a',title,status:'진행',assignees:['장진호'],collaborators:[],lastEditedAt:'2026-10-29T00:00:00Z'}]}}}}}));
  },{userId,generation,title});
}

test('anonymous entry keeps every team dashboard DOM container empty',async({page})=>{
  await open(page,{initial:''});
  await expect(page.locator('#loginView')).toBeVisible();
  for(const id of ['team-lanes-grid','team-workboard-list','team-freshness-grid'])await expect(page.locator(`#${id}`)).toBeEmpty();
});

test('verified entry shows unknown sources and preserves planner return navigation',async({page})=>{
  await open(page);
  await expect(page.locator('#tab-home')).toBeVisible();
  await expect(page.locator('#team-lanes-grid .team-lane')).toHaveCount(9);
  await expect(page.locator('#team-lanes-status')).toContainText('원천 확인 전');
  await expect(page.locator('#team-work-to-plan')).toBeDisabled();
  await page.getByRole('tab',{name:'개인·팀 일정'}).click();
  await page.locator('#personal-open-manage').click();
  await page.locator('.personal-admin-menu [data-nav-tab="home"]').click();
  await expect(page.locator('#tab-home')).toBeVisible();
});

test('A aggregate clears before delayed B verification and late A snapshots are discarded',async({page})=>{
  await open(page,{delayAdminFor:B});
  await seedTeam(page,A,77,'A 전용 집계');
  await expect(page.locator('#team-workboard-list')).toContainText('A 전용 집계');
  await switchUser(page,B);
  await expect(page.locator('#loginView')).toBeVisible();
  for(const id of ['team-lanes-grid','team-workboard-list','team-freshness-grid'])await expect(page.locator(`#${id}`)).toBeEmpty();
  await page.evaluate(({A})=>window.dispatchEvent(new CustomEvent('operations:sources-snapshot',{detail:{userId:A,generation:77,snapshot:{sources:{team:{readState:'current'}},datasets:{team:{tasks:[{sourceId:'late-a',title:'늦은 A 집계',status:'진행'}]}}}}})),{A});
  await expect(page.locator('#team-workboard-list')).toBeEmpty();
  await page.evaluate(()=>window.__adminResolvers.splice(0).forEach(resolve=>resolve()));
  await expect(page.locator('#appView')).toBeVisible();
  await expect(page.locator('#team-workboard-list')).not.toContainText(/A 전용 집계|늦은 A 집계/);
});

test('same-user late generation cannot replace the current snapshot',async({page})=>{
  await open(page);
  await seedTeam(page,A,10,'이전 세대 집계');
  await page.evaluate(A=>window.TeamDashboard.activate(A,11),A);
  await page.evaluate(A=>window.dispatchEvent(new CustomEvent('operations:sources-snapshot',{detail:{userId:A,generation:10,snapshot:{sources:{team:{readState:'current'}},datasets:{team:{tasks:[{sourceId:'late',title:'늦은 이전 세대',status:'진행'}]}}}}})),A);
  await expect(page.locator('#team-workboard-list')).not.toContainText('늦은 이전 세대');
  await page.evaluate(A=>window.dispatchEvent(new CustomEvent('operations:sources-snapshot',{detail:{userId:A,generation:11,snapshot:{sources:{team:{readState:'current'}},datasets:{team:{tasks:[{sourceId:'current',title:'현재 세대 집계',status:'진행',assignees:[]} ]}}}}})),A);
  await expect(page.locator('#team-workboard-list')).toContainText('현재 세대 집계');
});

test('logout clears selected work, core counts, operations snapshot and freshness DOM immediately',async({page})=>{
  await open(page);
  await seedTeam(page,A,21,'로그아웃 전 집계');
  await page.locator('[data-team-work-check]').check();
  await expect(page.locator('#team-work-selected')).toHaveText('1개 선택');
  await switchUser(page,'','SIGNED_OUT');
  await expect(page.locator('#loginView')).toBeVisible();
  for(const id of ['team-lanes-grid','team-workboard-list','team-freshness-grid'])await expect(page.locator(`#${id}`)).toBeEmpty();
  await expect(page.locator('#team-work-selected')).toHaveText('0개 선택');
  await expect(page.locator('#team-work-to-plan')).toBeDisabled();
});

test('program drafts remain account-isolated and partner contacts remain unloaded',async({page})=>{
  await open(page,{delayAdminFor:B});
  await page.goto('/admin/#publishing');
  await expect(page.locator('#tab-publishing')).toBeVisible();
  await page.locator('#program-new').click();
  await page.locator('#program-title').fill('A 전용 프로그램');
  await page.locator('#program-summary').fill('공개 설명');
  await page.locator('#program-internal-note').fill('A 비공개 메모');
  await page.locator('#program-form button[type="submit"]').click();
  await switchUser(page,B);
  await expect(page.locator('#program-title')).toHaveValue('');
  await page.evaluate(()=>window.__adminResolvers.splice(0).forEach(resolve=>resolve()));
  await expect(page.locator('#appView')).toBeVisible();
  await page.goto('/admin/#partners');
  await expect(page.locator('#tab-partners')).toBeVisible();
  await expect(page.locator('#partner-directory-status')).toContainText('live_connected=false');
  const text=await page.locator('#tab-partners').innerText();
  for(const value of ['A 비공개 메모','123-456','writer@example.test','010-0000-0000'])expect(text).not.toContain(value);
});

