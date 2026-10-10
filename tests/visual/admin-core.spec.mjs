import {test,expect} from '@playwright/test';

async function installVirtualAdmin(page){
  await page.addInitScript(()=>{
    const clone=value=>JSON.parse(JSON.stringify(value));
    window.__db={
      applications:[
        {id:'app-new',applicant_name:'가상 고객 새신청',contact:'010-0000-0001',email:'new@example.test',program_name:'가상 수업',participant_count:'1',status:'신규',photo_consent:true,refund_confirmed:true,created_at:'2026-10-10T01:00:00Z'},
        {id:'app-wait',applicant_name:'가상 고객 입금대기',contact:'010-0000-0002',email:'wait@example.test',program_name:'가상 수업',participant_count:'1',status:'입금대기',photo_consent:true,refund_confirmed:true,created_at:'2026-10-10T00:00:00Z'},
      ],
      cohorts:[{id:'cohort-a',cohort_name:'1기',program_name:'가상 수업',program_slug:'virtual-class',capacity:10,seats_left:8,status:'모집중',sort:1}],
      orders:[
        {id:'order-new',buyer_name:'가상 주문자 A',contact:'010-1000-0001',total_amount:12000,status:'신규',channel:'홈페이지',shipping_address:'가상시 가상로 1',created_at:'2026-10-10T02:00:00Z'},
        {id:'order-ship',buyer_name:'가상 주문자 B',contact:'010-1000-0002',total_amount:15000,status:'발송준비',channel:'스마트스토어',shipping_address:'가상시 가상로 2',created_at:'2026-10-10T01:00:00Z'},
      ],
      order_items:[
        {id:'item-1',order_id:'order-new',book_title:'가상 도서 A',quantity:1,unit_price:12000},
        {id:'item-2',order_id:'order-ship',book_title:'가상 도서 B',quantity:1,unit_price:15000},
      ],
      inquiries:[{id:'inq-new',org_name:'가상 기관',manager_name:'가상 담당자',contact:'02-000-0000',email:'org@example.test',status:'신규',created_at:'2026-10-10T01:00:00Z'}],
      book_alerts:[{id:'alert-1',email:'reader@example.test',book_title:'가상 신간',created_at:'2026-10-10T01:00:00Z'}],
      integration_connectors:[{id:'connector-1',name:'가상 연결',purpose:'검증용',status:'connected',sync_mode:'scheduled',data_direction:'inbound',sort_order:1,next_action:'없음',admin_url:'https://example.test/admin'}],
      integration_product_mappings:[{id:'map-1'}],integration_inventory_movements:[{id:'move-1'}],integration_reconciliation_issues:[],integration_settlement_entries:[],
    };
    window.__failTable='';window.__authCallbacks=[];window.__orderRequests=new Map();window.__adminOrderRpcCalls=0;
    class Query{
      constructor(table){this.table=table;this.op='select';this.filters=[];this.options={};this.patch=null;this.payload=null;this.returning=false;}
      select(_columns,options={}){if(this.op==='update')this.returning=true;else this.op='select';this.options={...this.options,...options};return this;}
      order(){return this;}in(_field,_values){return this;}
      eq(field,value){this.filters.push(row=>row[field]===value);return this;}
      update(patch){this.op='update';this.patch=patch;return this;}
      insert(payload){this.op='insert';this.payload=payload;return this;}
      rows(){return (window.__db[this.table]||[]).filter(row=>this.filters.every(filter=>filter(row)));}
      execute(){
        if(window.__failTable===this.table&&this.op==='select')return {data:null,error:{message:'virtual fetch failure'},count:null};
        if(this.op==='update'){
          const rows=this.rows();for(const row of rows)Object.assign(row,this.patch);
          return {data:this.returning?clone(rows):null,error:rows.length?null:{message:'no rows'},count:rows.length};
        }
        if(this.op==='insert'){
          const rows=(Array.isArray(this.payload)?this.payload:[this.payload]).map(clone);window.__db[this.table].push(...rows);return {data:clone(rows),error:null,count:rows.length};
        }
        const rows=clone(this.rows());return {data:this.options.head?null:rows,error:null,count:this.options.count?rows.length:null};
      }
      then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject);}
      single(){return Promise.resolve(this.execute()).then(result=>result.error?result:result.data?.length===1?{data:result.data[0],error:null}:{data:null,error:{message:'single row required'}});}
    }
    const auth={
      getSession:async()=>({data:{session:{access_token:'virtual-token',user:{email:'admin@example.test'}}},error:null}),
      signInWithPassword:async()=>({data:{session:{access_token:'virtual-token',user:{email:'admin@example.test'}}},error:null}),
      signOut:async()=>{window.__authCallbacks.forEach(cb=>cb('SIGNED_OUT',null));return {error:null};},
      resetPasswordForEmail:async()=>({error:null}),onAuthStateChange:cb=>{window.__authCallbacks.push(cb);return {data:{subscription:{unsubscribe(){}}}};},
    };
    const rpc=async(name,args)=>{
      if(name==='is_admin')return {data:true,error:null};
      if(name==='create_admin_order_v1'){
        window.__adminOrderRpcCalls++;
        const fingerprint=JSON.stringify(args),prior=window.__orderRequests.get(args.p_request_id);
        if(prior){return prior.fingerprint===fingerprint?{data:clone(prior.result),error:null}:{data:null,error:{message:'IDEMPOTENCY_KEY_REUSED'}}}
        const id=`order-direct-${window.__orderRequests.size+1}`,total=args.p_items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0);
        const order={id,buyer_name:args.p_buyer_name,contact:args.p_contact,email:args.p_email,shipping_address:args.p_shipping_address,message:args.p_message,total_amount:total,status:args.p_status,channel:args.p_channel,created_at:'2026-10-10T03:00:00Z'};
        const items=args.p_items.map((item,index)=>({id:`direct-item-${index+1}`,order_id:id,book_title:item.book_title,quantity:item.quantity,unit_price:item.unit_price}));
        window.__db.orders.push(order);window.__db.order_items.push(...items);const result={id,status:order.status,total_amount:total};window.__orderRequests.set(args.p_request_id,{fingerprint,result});return {data:clone(result),error:null};
      }
      return {data:null,error:{message:'unsupported rpc'}};
    };
    window.supabase={createClient:()=>({auth,from:table=>new Query(table),rpc})};
  });
  await page.route('**/supabase.min.js',route=>route.fulfill({contentType:'application/javascript',body:''}));
  await page.route('**/xlsx.full.min.js',route=>route.fulfill({contentType:'application/javascript',body:'window.XLSX={};'}));
  await page.route('**/functions/v1/scm-read',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({meta:{fetchedAt:'2026-10-10T03:00:00Z',stale:false},datasets:{inventory:[{sku:'V-001',name:'가상 도서',author:'가상 작가',category:'도서',owner:'가상팀',price:12000,cost:6000,stock:4,skuStock:4,status:'판매중',kind:'도서'}],blind:[],counts:[],actions:[]}})}));
  await page.route('**/functions/v1/work-read',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({meta:{fetchedAt:'2026-10-10T03:00:00Z',stale:false},work:{summary:{active:1,attention:1,approvals:0,blocked:0,stale:0},coverage:[],records:[{id:'work-1',kind:'tasks',title:'가상 확인 업무',status:'진행',owner:'가상 담당',updated:'2026-10-10T02:00:00Z',attention:true,terminal:false}]}})}));
}

async function openAdmin(page,viewport){
  await page.setViewportSize(viewport);await installVirtualAdmin(page);await page.goto('/admin/#home',{waitUntil:'domcontentloaded'});await expect(page.locator('#appView')).toBeVisible();await expect(page.locator('#priorityTotal')).toContainText('5건');
}
async function goTab(page,viewport,value,name){
  if(viewport.width<=700)await page.locator('#mobileNav').selectOption(value);
  else await page.getByRole('tab',{name}).click();
}

for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:360,height:780}]){
  test(`admin core ${viewport.name}: daily priorities, keyboard and history`,async({page})=>{
    await openAdmin(page,viewport);
    if(viewport.width>700){const home=page.getByRole('tab',{name:'대시보드'});await home.focus();await home.press('ArrowRight');await expect(page.locator('#tab-work')).toBeVisible();await page.goBack();await expect(page.locator('#tab-home')).toBeVisible();}
    else await expect(page.locator('#mobileNav')).toBeVisible();
    await page.screenshot({path:`test-results/admin-core-${viewport.name}-dashboard.png`,fullPage:true});
    await page.getByRole('button',{name:/입금 대기 신청/}).click();
    await expect(page.locator('#tab-apps')).toBeVisible();await expect(page.locator('#fStatus')).toHaveValue('입금대기');await expect(page.locator('#appsCount')).toHaveText('전체 2건 중 1건');
    const row=page.locator('#appsList .row').first();await row.focus();await row.press('Enter');
    await expect(row).toContainText('환불규정✓');await expect(row).not.toContainText('입금✓');
    const panel=page.locator('#panelHost .panel');await expect(panel).toBeVisible();await expect(panel).toContainText('환불 규정 확인');await expect(panel).not.toContainText('입금 확인');
    await panel.press('Escape');await expect(panel).not.toBeVisible();await expect(row).toBeFocused();
    await goTab(page,viewport,'orders',/주문/);await goTab(page,viewport,'apps',/수업 신청/);await page.goBack();await expect(page.locator('#tab-orders')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/admin-core-${viewport.name}-orders.png`,fullPage:true});
  });
}

test('admin core: partial refresh keeps last-known-good data and saved rows are re-read',async({page})=>{
  await openAdmin(page,{width:1200,height:900});
  await page.evaluate(()=>{window.__failTable='orders';return loadAll();});
  await expect(page.locator('#coreBanner')).toBeVisible();await expect(page.locator('#coreBanner')).toContainText('주문');await expect(page.locator('#coreBanner')).toContainText('마지막 정상 값');
  await page.getByRole('tab',{name:/주문/}).click();await expect(page.locator('#ordersCount')).toHaveText('2건');
  await page.locator('#ordersList .row').first().click();await page.locator('#oStatusSel').selectOption('입금확인');await expect(page.locator('#toast')).toContainText('다시 확인');
  expect(await page.evaluate(()=>window.__db.orders.find(row=>row.id==='order-new').status)).toBe('입금확인');
  await page.evaluate(()=>{window.__failTable='';return loadAll();});await expect(page.locator('#coreBanner')).toBeHidden();
});

test('admin core: session expiration clears private UI and returns to login',async({page})=>{
  await openAdmin(page,{width:1200,height:900});
  await page.evaluate(()=>window.__authCallbacks.forEach(cb=>cb('SIGNED_OUT',null)));
  await expect(page.locator('#loginView')).toBeVisible();await expect(page.locator('#appView')).toBeHidden();await expect(page.locator('#loginMsg')).toContainText('다시 로그인');
  expect(await page.evaluate(()=>({apps:APPS.length,orders:ORDERS.length,panel:document.querySelector('#panelHost').childElementCount}))).toEqual({apps:0,orders:0,panel:0});
});

test('admin core: direct order requires delivery address but allows minimal in-person data',async({page})=>{
  await openAdmin(page,{width:1200,height:900});await page.getByRole('tab',{name:/주문/}).click();await page.locator('#oAddBtn').click();
  await page.waitForTimeout(250);await page.screenshot({path:'test-results/admin-core-direct-order.png',fullPage:true});
  await expect(page.locator('#naAddressLabel')).toContainText('배송지');await expect(page.locator('#naAddressLabel')).toContainText('필수');await expect(page.locator('#naAddress')).toHaveAttribute('aria-required','true');
  await page.locator('#naSave').click();await expect(page.locator('#naFormError')).toBeVisible();await expect(page.locator('#naFormError')).toContainText('필수 항목');
  await page.locator('#naChannel').selectOption('기타');await expect(page.locator('#naAddressLabel')).toContainText('선택');await expect(page.locator('#naAddress')).toHaveAttribute('aria-required','false');await page.screenshot({path:'test-results/admin-core-direct-order-in-person.png',fullPage:true});
  await page.locator('#naName').fill('가상 직접 주문자');await page.locator('#naContact').fill('010-0000-0003');
  await page.locator('#naItem').fill('가상 도서 C');await page.locator('#naQty').fill('2');await page.locator('#naAmt').fill('7000');
  await expect(page.locator('#naTotalPreview')).toContainText('14,000원');await page.locator('#naSave').evaluate(button=>{button.click();button.click()});await expect(page.locator('#toast')).toContainText('주문과 품목을 저장');await expect(page.locator('#ordersCount')).toHaveText('3건');
  const state=await page.evaluate(()=>({calls:window.__adminOrderRpcCalls,orders:window.__db.orders.filter(x=>x.id.startsWith('order-direct-')),items:window.__db.order_items.filter(x=>x.order_id.startsWith('order-direct-'))}));
  expect(state.calls).toBe(1);expect(state.orders).toHaveLength(1);expect(state.orders[0]).toMatchObject({total_amount:14000,email:'',shipping_address:'',channel:'기타'});expect(state.items).toHaveLength(1);expect(state.items[0].unit_price).toBe(7000);
});

test('admin core: list search, sort, reset and browser-back detail flow',async({page})=>{
  await openAdmin(page,{width:1200,height:900});await page.getByRole('tab',{name:/주문/}).click();
  await page.locator('#oSort').selectOption('amount_desc');await expect(page.locator('#ordersList .row').first()).toContainText('15,000원');
  await page.locator('#oSearch').fill('없는 주문');await expect(page.locator('#ordersList .empty-state')).toContainText('조건에 맞는 주문이 없어요');await expect(page.locator('#ordersCount')).toContainText('전체 2건 중 0건');
  await page.getByRole('button',{name:'조건 지우고 전체 보기'}).click();await expect(page.locator('#ordersCount')).toHaveText('2건');await expect(page.locator('#oSearch')).toBeFocused();
  const row=page.locator('#ordersList .row').first();await row.click();await expect(page.locator('#panelHost .panel')).toBeVisible();await page.goBack();await expect(page.locator('#panelHost .panel')).toBeHidden();await expect(row).toBeFocused();
});
