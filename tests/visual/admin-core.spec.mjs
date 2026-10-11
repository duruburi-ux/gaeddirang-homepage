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
      integration_connectors:[
        {id:'connector-home',code:'homepage',name:'홈페이지',purpose:'가상 주문·신청·문의',status:'connected',sync_mode:'scheduled',data_direction:'inbound',sort_order:1,next_action:'없음',admin_url:'https://example.test/home'},
        {id:'connector-store',code:'smartstore',name:'스마트스토어',purpose:'가상 주문 수집',status:'connected',sync_mode:'scheduled',data_direction:'inbound',sort_order:2,next_action:'부분 실패 원본 확인',admin_url:'https://example.test/store'},
        {id:'connector-pay',code:'payhere',name:'PayHere',purpose:'가상 파일 검토',status:'manual',sync_mode:'manual',data_direction:'inbound',sort_order:3,next_action:'엑셀 검토',admin_url:'https://example.test/payhere'},
      ],
      integration_product_mappings:[{id:'map-1'}],integration_inventory_movements:[{id:'move-1'}],integration_reconciliation_issues:[{id:'issue-1',status:'open'}],integration_settlement_entries:[],
      integration_sync_runs:[
        {connector_code:'homepage',status:'success',records_received:2,records_applied:2,records_rejected:0,completed_at:'2026-10-10T03:30:00Z'},
        {connector_code:'smartstore',status:'partial',records_received:4,records_applied:3,records_rejected:1,completed_at:'2026-10-10T04:00:00Z'},
        {connector_code:'smartstore',status:'success',records_received:3,records_applied:3,records_rejected:0,completed_at:'2026-10-10T03:00:00Z'},
      ],
      integration_evidence_inbox:[
        {id:'11111111-1111-4111-8111-111111111111',connector_code:'homepage',occurred_at:'2026-10-10T04:10:00Z',evidence_type:'homepage_order',summary:'홈페이지 주문 · 발송준비',candidate_type:'reservation',review_reason:'가용 재고만 차감 · 판매 확정 아님',review_status:'pending',created_at:'2026-10-10T04:11:00Z'},
        {id:'22222222-2222-4222-8222-222222222222',connector_code:'smartstore',occurred_at:'2026-10-10T04:05:00Z',evidence_type:'smartstore_order',summary:'스마트스토어 상품 주문 · RETURN_REQUEST',candidate_type:'reversal',review_reason:'원거래 참조 필수',review_status:'conflict',created_at:'2026-10-10T04:06:00Z'},
      ],
    };
    window.__failTable='';window.__failScmRead=false;window.__scmFetchedAt='';window.__authCallbacks=[];window.__orderRequests=new Map();window.__adminOrderRpcCalls=0;
    class Query{
      constructor(table){this.table=table;this.op='select';this.filters=[];this.options={};this.patch=null;this.payload=null;this.returning=false;}
      select(_columns,options={}){if(this.op==='update')this.returning=true;else this.op='select';this.options={...this.options,...options};return this;}
      order(){return this;}limit(value){this.options.limit=value;return this;}in(_field,_values){return this;}
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
        const all=this.rows(),rows=clone(Number.isInteger(this.options.limit)?all.slice(0,this.options.limit):all);return {data:this.options.head?null:rows,error:null,count:this.options.count?all.length:null};
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
  await page.route('**/functions/v1/scm-read',async route=>{
    if(await page.evaluate(()=>window.__failScmRead))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({meta:{error:'SOURCE_UNAVAILABLE'},datasets:null})});
    const forcedAt=await page.evaluate(()=>window.__scmFetchedAt);
    return route.fulfill({contentType:'application/json',body:JSON.stringify({meta:{fetchedAt:forcedAt||new Date().toISOString(),stale:false},datasets:{inventory:[{sku:'V-001',name:'가상 마음 산책',author:'가상 작가',isbn:'9780000000011',category:'에세이',owner:'위탁',price:12000,cost:6000,stock:4,skuStock:3,status:'재고 있음',kind:'도서'},{sku:'V-002',name:'가상 마음 산책',author:'가상 작가',isbn:'9780000000028',category:'에세이',owner:'자체',price:13000,cost:7000,stock:0,skuStock:0,status:'품절',kind:'도서'},{sku:'V-003',name:'공백 없는책',author:'다른 작가',isbn:'9780000000035',category:'소설',owner:'미확인',price:14000,cost:null,stock:null,skuStock:null,status:'수량 미확인',kind:'도서'}],blind:[],counts:[{sku:'V-001',name:'가상 마음 산책',date:'2026-10-10',scope:'책공방 앞 책장',count:4,current:4}],actions:[],connections:[{connector_code:'naver_mail',status:'success',last_attempt_at:'2026-10-11T08:00:00Z',last_success_at:'2026-10-11T08:00:00Z',last_failure_at:'',evidence_total:4,batch_sha256:'a'.repeat(64),schema_version:'1',error_code:''},{connector_code:'google_chat',status:'success',last_attempt_at:'2026-10-11T08:01:00Z',last_success_at:'2026-10-11T08:01:00Z',last_failure_at:'',evidence_total:7,batch_sha256:'b'.repeat(64),schema_version:'1',error_code:''}]}})});
  });
  await page.route('**/functions/v1/royalty-read',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({meta:{fetchedAt:'2026-10-10T03:00:00Z',stale:false,readOnly:true},books:[{key:'virtual-a'},{key:'virtual-b'}]})}));
  await page.route('**/functions/v1/work-read',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({meta:{fetchedAt:'2026-10-10T03:00:00Z',stale:false},work:{summary:{active:1,attention:1,approvals:0,blocked:0,stale:0},coverage:[],records:[{id:'work-1',kind:'tasks',title:'가상 확인 업무',status:'진행',owner:'가상 담당',updated:'2026-10-10T02:00:00Z',attention:true,terminal:false}]}})}));
  await page.route('**/functions/v1/integration-ingest',async route=>{
    const body=route.request().postDataJSON();
    if(body.action==='collect'&&body.dryRun)return route.fulfill({contentType:'application/json',body:JSON.stringify({connectorCode:'homepage',runId:body.runId,dryRun:true,received:1,reviewRequired:1,rows:[{sourceEventId:'order:virtual-preview:발송준비',evidenceType:'homepage_order',candidateType:'reservation',summary:'홈페이지 주문 · 발송준비',reviewReason:''}]})});
    if(body.action==='collect'){
      await page.evaluate(()=>window.__db.integration_evidence_inbox.unshift({id:'33333333-3333-4333-8333-333333333333',connector_code:'homepage',occurred_at:'2026-10-10T05:00:00Z',evidence_type:'homepage_order',summary:'홈페이지 주문 · 발송준비',candidate_type:'reservation',review_reason:'가용 재고만 차감 · 판매 확정 아님',review_status:'pending',created_at:'2026-10-10T05:01:00Z'}));
      return route.fulfill({contentType:'application/json',body:JSON.stringify({connectorCode:'homepage',runId:body.runId,dryRun:false,received:1,inserted:1,duplicates:0,conflicts:0,reviewRequired:1,items:[]})});
    }
    if(body.action==='ingest'&&body.dryRun)return route.fulfill({contentType:'application/json',body:JSON.stringify({connectorCode:body.connectorCode,runId:body.runId,dryRun:true,received:body.events.length,reviewRequired:body.events.length,rows:[]})});
    if(body.action==='ingest'){
      await page.evaluate(()=>window.__db.integration_evidence_inbox.unshift({id:'44444444-4444-4444-8444-444444444444',connector_code:'google_chat',occurred_at:'2026-10-10T06:00:00Z',evidence_type:'chat_message',summary:'Google Chat 메시지',candidate_type:'evidence',review_reason:'메시지는 근거일 뿐 승인·명령·확정 거래가 아닙니다.',review_status:'pending',created_at:'2026-10-10T06:01:00Z'}));
      return route.fulfill({contentType:'application/json',body:JSON.stringify({connectorCode:body.connectorCode,runId:body.runId,dryRun:false,received:body.events.length,inserted:body.events.length,duplicates:0,conflicts:0,reviewRequired:body.events.length,runRecorded:true,items:[]})});
    }
    if(body.action==='review'){
      await page.evaluate(({id,decision})=>{const row=window.__db.integration_evidence_inbox.find(item=>item.id===id);if(row)row.review_status=decision},{id:body.evidenceId,decision:body.decision});
      return route.fulfill({contentType:'application/json',body:JSON.stringify({review:{id:body.evidenceId,review_status:body.decision,ledger_changed:false},ledgerChanged:false})});
    }
    return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'UNSUPPORTED'})});
  });
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

for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:360,height:780}]){
  test(`admin book finder ${viewport.name}: exact lookup, uncertainty and back stay clear`,async({page})=>{
    await openAdmin(page,viewport);await goTab(page,viewport,'finder',/책공방/);
    const input=page.locator('#book-finder-query');await expect(input).toBeVisible();
    await input.fill('978 000 000 001 1');await expect(page.locator('.finder-result')).toHaveCount(1);await expect(page.locator('#book-finder-summary')).toContainText('정확한 ISBN 우선');
    const result=page.locator('.finder-result').first();await expect(result).toContainText('시스템 장부상 4권 · 실물 확인 필요');await expect(result).toContainText('최근 실사/등록 4권');await expect(result).toContainText('예약 제외 가용 수량 미등록');await expect(result).toContainText('원본 수량 불일치');
    await result.focus();await result.press('Enter');await expect(page.locator('#book-finder-detail')).toBeVisible();await expect(page.locator('#book-finder-detail')).toContainText('책장 위치');await expect(page.locator('#book-finder-detail')).toContainText('미등록');
    await page.goBack();await expect(page.locator('#book-finder-detail')).not.toBeVisible();await expect(result).toBeFocused();
    await input.fill('가상 작가');await expect(page.locator('.finder-result')).toHaveCount(2);await expect(page.locator('.finder-edition').first()).toContainText('ISBN·SKU 확인');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`test-results/admin-book-finder-${viewport.name}.png`,fullPage:true});
    await page.getByRole('button',{name:'간결 목록'}).click();await expect(page.locator('.finder-result.list')).toHaveCount(2);
    await input.fill('등록 안 된 책');await expect(page.locator('.finder-empty')).toContainText('검색 결과 없음은 품절을 뜻하지 않습니다');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
}

test('admin book finder: load failure is not shown as zero stock and retry stays available',async({page})=>{
  await openAdmin(page,{width:1200,height:900});await page.evaluate(()=>{window.__failScmRead=true});await goTab(page,{width:1200,height:900},'finder',/책공방/);
  await expect(page.locator('#book-finder-status')).toContainText('0권으로 판단하지 말고');await expect(page.locator('#book-finder-retry')).toBeVisible();await expect(page.locator('#book-finder-content')).toBeHidden();
});

test('admin book finder: a source copy older than ten minutes is hidden',async({page})=>{
  await openAdmin(page,{width:1200,height:900});await page.evaluate(()=>{window.__scmFetchedAt=new Date(Date.now()-11*60*1000).toISOString()});await goTab(page,{width:1200,height:900},'finder',/책공방/);
  await expect(page.locator('#book-finder-status')).toContainText('10분 넘게 갱신되지 않아 수량을 숨겼습니다');await expect(page.locator('#book-finder-retry')).toBeVisible();await expect(page.locator('#book-finder-content')).toBeHidden();
});

for(const viewport of [{name:'desktop',width:1440,height:1000},{name:'mobile',width:360,height:780}]){
  test(`admin unified operations ${viewport.name}: scope, freshness and retry stay explicit`,async({page})=>{
    await openAdmin(page,viewport);await goTab(page,viewport,'integration',/통합 운영실/);
    await expect(page.locator('#integration-pipeline .integration-stage')).toHaveCount(5);
    await expect(page.locator('#integration-pipeline')).toContainText('월 정산 검토자료');
    await expect(page.locator('#integration-pipeline')).toContainText('지급 확정 아님');
    const smartstore=page.locator('#integration-sources .integration-source-card',{hasText:'스마트스토어'});
    await expect(smartstore).toContainText('재시도 필요');await expect(smartstore).toContainText('마지막 성공');await expect(smartstore).toContainText('마지막 실패');
    const mail=page.locator('#integration-sources .integration-source-card',{hasText:'네이버 메일'});
    await expect(mail).toContainText('자동 확인');await expect(mail).toContainText('누적 근거 4건');
    const chat=page.locator('#integration-sources .integration-source-card',{hasText:'Google Chat'});
    await expect(chat).toContainText('자동 확인');await expect(chat).toContainText('누적 근거 7건');await expect(chat).toContainText('거래 확정 아님');
    await expect(page.locator('#integration-queue')).toContainText('스마트스토어 재시도');
    await expect(page.locator('#integration-queue')).toContainText('열린 불일치 1건');
    await expect(page.locator('#integration-runs .integration-run')).toHaveCount(3);
    await expect(page.locator('#integration-evidence-list .integration-evidence-item')).toHaveCount(2);
    await expect(page.locator('#integration-evidence-count')).toContainText('검토 필요 2건');
    await expect(page.locator('#integration-guardrails-title')).toHaveText('자동으로 넘지 않는 선');
    await expect(page.locator('#tab-integration')).toContainText('메일과 Chat은 근거 데이터일 뿐 승인이나 명령이 아닙니다.');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/admin-unified-operations-${viewport.name}.png`,fullPage:true});
  });
}

test('admin unified operations: connector refresh failure keeps but downgrades the previous confirmation',async({page})=>{
  await openAdmin(page,{width:1200,height:900});await goTab(page,{width:1200,height:900},'integration',/통합 운영실/);
  await expect(page.locator('#integration-connectors .integration-card')).toHaveCount(3);
  await page.evaluate(()=>{window.__failTable='integration_connectors';return window.Integration.refresh(true);});
  await expect(page.locator('#integration-status')).toContainText('연결 목록');
  await expect(page.locator('#integration-connectors .integration-card')).toHaveCount(3);
  const homepage=page.locator('#integration-sources .integration-source-card',{hasText:'홈페이지'});
  await expect(homepage).toContainText('검토 필요');await expect(homepage).toContainText('이전 확인본');
});

test('admin unified operations: collection previews before metadata storage and review never claims ledger change',async({page})=>{
  await openAdmin(page,{width:1200,height:900});await goTab(page,{width:1200,height:900},'integration',/통합 운영실/);
  await page.locator('#integration-collect-preview').click();await expect(page.locator('#integration-evidence-status')).toContainText('1건을 찾았습니다');
  await expect(page.locator('#integration-collect-apply')).toBeEnabled();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#integration-collect-apply').click();await expect(page.locator('#integration-evidence-status')).toContainText('저장 1건');
  await expect(page.locator('#integration-evidence-count')).toContainText('검토 필요 3건');
  const first=page.locator('.integration-evidence-item').first();await first.getByRole('button',{name:'근거 확인'}).click();
  await expect(page.locator('#integration-evidence-status')).toContainText('원장에는 반영하지 않았습니다');
  await expect(page.locator('#integration-evidence-count')).toContainText('검토 필요 2건');
});

test('admin unified operations: local collector JSON is validated, previewed and stored as evidence only',async({page})=>{
  await openAdmin(page,{width:1200,height:900});await goTab(page,{width:1200,height:900},'integration',/통합 운영실/);
  const hash='d'.repeat(64),batch={action:'ingest',connectorCode:'google_chat',runId:'55555555-5555-4555-8555-555555555555',dryRun:false,events:[{messageId:'spaces/example/messages/one',createTime:'2026-10-10T06:00:00Z',threadName:'spaces/example/threads/one',contentHash:hash,attachmentRefHashes:[]}]};
  await page.locator('#integration-collector-file').setInputFiles({name:'google_chat.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(batch))});
  await expect(page.locator('#integration-collector-status')).toContainText('아직 서버로 전송하지 않았습니다');
  await page.locator('#integration-collector-preview').click();await expect(page.locator('#integration-collector-status')).toContainText('서버 형식 검사가 끝났습니다');
  await page.locator('#integration-collector-confirm').check();page.once('dialog',dialog=>dialog.accept());await page.locator('#integration-collector-apply').click();
  await expect(page.locator('#integration-collector-status')).toContainText('저장 1건');await expect(page.locator('#integration-collector-status')).toContainText('재고·정산·지급은 바뀌지 않았습니다');
  await expect(page.locator('#integration-evidence-count')).toContainText('검토 필요 3건');
});

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
  await goTab(page,{width:1200,height:900},'finder',/책공방/);await page.locator('#book-finder-query').fill('가상 작가');await expect(page.locator('.finder-result')).toHaveCount(2);
  await page.evaluate(()=>window.__authCallbacks.forEach(cb=>cb('SIGNED_OUT',null)));
  await expect(page.locator('#loginView')).toBeVisible();await expect(page.locator('#appView')).toBeHidden();await expect(page.locator('#loginMsg')).toContainText('다시 로그인');
  expect(await page.evaluate(()=>({apps:APPS.length,orders:ORDERS.length,panel:document.querySelector('#panelHost').childElementCount,finderHidden:document.querySelector('#book-finder-content').hidden,finderRows:document.querySelector('#book-finder-results').childElementCount}))).toEqual({apps:0,orders:0,panel:0,finderHidden:true,finderRows:0});
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
