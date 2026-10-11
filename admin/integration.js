(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const money=value=>value==null||value===''||!Number.isFinite(Number(value))?'미확인':Number(value).toLocaleString('ko-KR')+'원';
  const labels={connected:'연결 등록',manual:'수동 관리',setup_required:'준비 필요',attention:'확인 필요',disabled:'사용 안 함'};
  const modes={realtime:'실시간',scheduled:'주기 확인',manual:'사람이 입력',reference_only:'참고용'};
  const directions={inbound:'가져오기',outbound:'보내기',two_way:'양방향',reference_only:'참고만'};
  const rowLabels={ready:'반영 후보',excluded:'재고 제외',unmapped:'상품 연결 필요',ambiguous:'거래 연결 필요',price_mismatch:'가격 확인 필요',duplicate:'이미 반영',applicable:'반영 가능',blocked:'확인 필요',applied:'반영 완료'};
  const importRequestStorageKey='gaeddirang.payhere.import-request.v1';
  let config,client,onDenied,connectors=[],mappings=[],inventory=[],syncRuns=[],evidenceInbox=[],hub=null,loaded=false,loading=false,generation=0,fileGeneration=0,stats={mappings:null,movements:null,issues:null,settlements:null},scmState={available:false,stale:false,error:''},royaltyState={available:false,stale:false,error:'',bookCount:null},connectorsState={stale:false,error:''},syncRunsState={stale:false,error:''},evidenceState={stale:false,error:''};
  let importFile=null,importHash='',importPlan=null,dryResult=null,importBusy=false,importRequestId='';
  let evidencePreview=null,evidenceRunId='',evidenceBusy=false;

  function counts(){return connectors.reduce((a,x)=>{a[x.status]=(a[x.status]||0)+1;return a},{connected:0,manual:0,setup_required:0,attention:0,disabled:0})}
  function emit(ok=true){const c=counts(),m=hub?.metrics||{};window.dispatchEvent(new CustomEvent('integration:summary',{detail:{ok,connected:c.connected,manual:c.manual,setup:c.setup_required,attention:c.attention,healthy:m.healthy??null,review:m.review??null,failed:m.failed??null,waiting:m.waiting??null,fetchedAt:new Date().toISOString()}}))}
  function renderMetrics(){const m=hub?.metrics||{};$('#integration-metrics').innerHTML=[['자동 확인 단계',m.healthy],['검토 필요',m.review],['재시도 필요',m.failed],['연결·확인 대기',m.waiting]].map(([label,n])=>`<div><strong>${n==null?'—':n}</strong><span>${label}</span></div>`).join('')}
  function safeAdminUrl(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:''}catch{return''}}
  function renderCards(){
    const filter=$('#integration-filter').value,rows=connectors.filter(x=>!filter||x.status===filter);
    $('#integration-connectors').innerHTML=rows.map(x=>{const url=safeAdminUrl(x.admin_url);return `<article class="integration-card"><div class="integration-card-head"><h3>${esc(x.name)}</h3><span class="integration-pill ${esc(x.status)}">${labels[x.status]||esc(x.status)}</span></div><p class="integration-purpose">${esc(x.purpose)}</p><div class="integration-facts"><div><small>반영 방식</small><b>${modes[x.sync_mode]||esc(x.sync_mode)}</b></div><div><small>데이터 방향</small><b>${directions[x.data_direction]||esc(x.data_direction)}</b></div></div><div class="integration-next"><small>다음 행동</small><p>${esc(x.next_action||'별도 작업 없음')}</p></div>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">원본·연결 안내 열기 ↗</a>`:''}</article>`}).join('')||'<p class="integration-empty">이 상태에 해당하는 시스템이 없어요.</p>';
  }
  function renderLedger(){
    $('#integration-ledger-stats').className='integration-ledger-stats';
    $('#integration-ledger-stats').innerHTML=[['상품 연결표',stats.mappings],['입출고 기록',stats.movements],['열린 불일치',stats.issues],['정산 기록',stats.settlements]].map(([label,n])=>`<div><strong>${n==null?'미확인':n}</strong><span>${label}</span></div>`).join('');
  }

  function formatTime(value){
    if(!value)return '없음';const date=new Date(value);return Number.isNaN(date.valueOf())?'확인 불가':date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  }
  function renderHub(){
    const model=window.OperationsHubModel;if(!model)return;
    hub=model.buildOperationsHub({connectors,runs:syncRuns,sourcesStale:Boolean(connectorsState.error||syncRunsState.error),stats,scm:scmState,royalty:royaltyState});
    renderMetrics();
    $('#integration-pipeline').innerHTML=hub.stages.map(row=>`<article class="integration-stage"><small>${esc(row.step)} / ${esc(row.id.toUpperCase())}</small><b>${esc(row.title)}</b><span class="integration-stage-state ${esc(row.state)}">${esc(row.stateLabel)}</span><p>${esc(row.detail)}</p></article>`).join('');
    $('#integration-queue-count').textContent=`${hub.queue.length}건`;
    $('#integration-queue').innerHTML=hub.queue.length?hub.queue.map(row=>`<article class="integration-queue-item ${esc(row.level)}"><span class="integration-queue-mark" aria-hidden="true"></span><div><b>${esc(row.title)}</b><p>${esc(row.detail)}</p><small>${esc(row.action)}</small></div></article>`).join(''):'<p class="integration-empty-state">지금 표시할 검토 항목이 없습니다. 원본 전체 확인 완료를 뜻하지는 않습니다.</p>';
    const runsWarning=syncRunsState.stale?'<p class="integration-inline-warning">실행 이력 조회에 실패했습니다. 아래 내용은 이전 확인본이며 현재 상태로 단정하지 않습니다.</p>':'';
    $('#integration-runs').innerHTML=runsWarning+(hub.recentRuns.length?hub.recentRuns.map(row=>`<article class="integration-run"><b>${esc(row.label)}</b><span class="integration-run-state ${esc(row.state)}">${esc(row.stateLabel)}</span><time>${esc(formatTime(row.at))}</time><small>수신 ${row.received??'미확인'} · 반영 ${row.applied??'미확인'} · 제외/거절 ${row.rejected??'미확인'}</small></article>`).join(''):'<p class="integration-empty-state">이 화면에 연결된 실행 이력이 없습니다. 자동화를 실행 중이라고 판단하지 않습니다.</p>');
    $('#integration-sources').innerHTML=hub.sources.map(row=>`<article class="integration-source-card"><div class="integration-source-head"><h3>${esc(row.label)}</h3><span class="integration-source-state ${esc(row.state)}">${esc(row.stateLabel)}</span></div><p class="integration-source-scope">${esc(row.scope||'등록된 수집 범위 미확인')}</p><p class="integration-source-detail">${esc(row.detail)}</p><div class="integration-source-times"><span>마지막 성공 ${esc(formatTime(row.lastSuccess))}</span><span>마지막 실패 ${esc(formatTime(row.lastFailure))}</span></div>${row.nextAction?`<p class="integration-source-next">다음: ${esc(row.nextAction)}</p>`:''}</article>`).join('');
  }

  const evidenceConnectorLabels={homepage:'홈페이지',smartstore:'스마트스토어',payhere:'PayHere',naver_mail:'네이버 메일',google_chat:'Google Chat',naver_settlement:'네이버 정산'};
  const evidenceTypeLabels={evidence:'근거만',reservation:'예약 후보',sale:'판매 후보',reversal:'취소·반품 후보',settlement_candidate:'정산 후보'};
  const evidenceStatusLabels={pending:'검토 대기',conflict:'내용 충돌',reviewed:'근거 확인',rejected:'반려',duplicate:'중복'};
  function evidenceStatus(text,bad=false,good=false){const el=$('#integration-evidence-status');el.textContent=text;el.classList.toggle('bad',bad);el.classList.toggle('good',good)}
  function renderEvidence(){
    const filter=$('#integration-evidence-filter').value,rows=evidenceInbox.filter(row=>!filter||(filter==='needs'?['pending','conflict'].includes(row.review_status):row.review_status===filter)),needs=evidenceInbox.filter(row=>['pending','conflict'].includes(row.review_status)).length;
    $('#integration-evidence-count').textContent=`검토 필요 ${needs}건 · 표시 ${rows.length}건`;
    const warning=evidenceState.error?`<p class="integration-inline-warning">검토함 조회에 실패했습니다. ${evidenceState.stale?'아래는 이전 확인본입니다.':'건수를 미확인으로 둡니다.'}</p>`:'';
    $('#integration-evidence-list').innerHTML=warning+(rows.length?rows.map(row=>{
      const actionable=['pending','conflict'].includes(row.review_status);
      return `<article class="integration-evidence-item ${esc(row.review_status)}"><div class="integration-evidence-item-head"><div><span>${esc(evidenceConnectorLabels[row.connector_code]||row.connector_code)}</span><b>${esc(row.summary)}</b></div><span class="integration-evidence-state">${esc(evidenceStatusLabels[row.review_status]||row.review_status)}</span></div><p>${esc(evidenceTypeLabels[row.candidate_type]||row.candidate_type)} · ${esc(formatTime(row.occurred_at))}</p>${row.review_reason?`<small>${esc(row.review_reason)}</small>`:''}${actionable?`<div class="integration-evidence-row-actions"><button type="button" data-evidence-id="${esc(row.id)}" data-evidence-decision="reviewed">근거 확인</button><button type="button" data-evidence-id="${esc(row.id)}" data-evidence-decision="rejected">반려</button></div>`:''}</article>`;
    }).join(''):'<p class="integration-empty-state">이 상태의 근거가 없습니다. 원천 전체 확인 완료를 뜻하지는 않습니다.</p>');
    $('#integration-collect-preview').disabled=evidenceBusy;
    $('#integration-collect-apply').disabled=evidenceBusy||!evidencePreview||!evidencePreview.received;
    if(evidenceState.error)evidenceStatus('검토함을 불러오지 못했습니다. 다시 확인해 주세요.',true);
  }

  async function loadInventory(){
    try{
      const {data,error}=await client.auth.getSession();if(error||!data.session)return {data:null,error:error||Error('AUTH_REQUIRED')};
      const res=await fetch(config.url+'/functions/v1/scm-read',{headers:{Authorization:'Bearer '+data.session.access_token,apikey:config.key},cache:'no-store'});
      if(!res.ok)return {data:null,error:Error(`SCM_${res.status}`)};
      const result=await res.json();return {data:result.datasets?.inventory||[],meta:result.meta||{},error:null};
    }catch(error){return {data:null,error}}
  }
  async function loadRoyalty(){
    try{
      const {data,error}=await client.auth.getSession();if(error||!data.session)return {data:null,error:error||Error('AUTH_REQUIRED')};
      const res=await fetch(config.url+'/functions/v1/royalty-read',{headers:{Authorization:'Bearer '+data.session.access_token,apikey:config.key},cache:'no-store'});
      if(!res.ok)return {data:null,error:Error(`ROYALTY_${res.status}`)};
      const result=await res.json();return {data:{bookCount:Array.isArray(result.books)?result.books.length:null},meta:result.meta||{},error:null};
    }catch(error){return {data:null,error}}
  }

  async function refresh(force=false){
    if(loading||(!force&&loaded))return;
    loading=true;const run=++generation,button=$('#integration-refresh');button.disabled=true;button.textContent='확인 중…';
    try{
      const [co,ma,mv,issues,se,runs,evidence,scm,royalty]=await Promise.all([
        client.from('integration_connectors').select('*').order('sort_order'),
        client.from('integration_product_mappings').select('*',{count:'exact'}),
        client.from('integration_inventory_movements').select('*',{count:'exact',head:true}),
        client.from('integration_reconciliation_issues').select('*',{count:'exact',head:true}).in('status',['open','investigating']),
        client.from('integration_settlement_entries').select('*',{count:'exact',head:true}),
        client.from('integration_sync_runs').select('connector_code,status,records_received,records_applied,records_rejected,completed_at').order('completed_at',{ascending:false}),
        client.from('integration_evidence_inbox').select('id,connector_code,occurred_at,evidence_type,summary,candidate_type,review_reason,review_status,created_at').order('occurred_at',{ascending:false}).limit(100),
        loadInventory(),
        loadRoyalty()
      ]);
      if(run!==generation)return;
      const results=[['연결 목록',co],['상품 연결표',ma],['입출고 기록',mv],['불일치',issues],['정산',se],['실행 이력',runs],['근거 검토함',evidence],['SCM',scm],['인세 원본',royalty]],failed=results.filter(([,r])=>r.error);
      const denied=failed.find(([,r])=>r.error?.code==='PGRST301'||/jwt|auth/i.test(r.error?.message||''));if(denied){onDenied?.();return}
      if(!co.error){connectors=co.data||[];connectorsState={stale:false,error:''}}else connectorsState={stale:connectors.length>0,error:co.error?.message||'연결 목록 조회 실패'};
      if(!ma.error)mappings=ma.data||[];if(!runs.error){syncRuns=runs.data||[];syncRunsState={stale:false,error:''}}else syncRunsState={stale:syncRuns.length>0,error:runs.error?.message||'실행 이력 조회 실패'};
      if(!evidence.error){evidenceInbox=evidence.data||[];evidenceState={stale:false,error:''}}else evidenceState={stale:evidenceInbox.length>0,error:evidence.error?.message||'근거 검토함 조회 실패'};
      if(!scm.error){inventory=scm.data;scmState={available:true,stale:!!scm.meta?.stale,error:'',fetchedAt:scm.meta?.fetchedAt||''}}else scmState={...scmState,stale:scmState.available,error:'SCM 조회 실패'};
      if(!royalty.error)royaltyState={available:true,stale:!!royalty.meta?.stale,error:'',fetchedAt:royalty.meta?.fetchedAt||'',bookCount:royalty.data?.bookCount??null};else royaltyState={...royaltyState,stale:royaltyState.available,error:'인세 원본 조회 실패'};
      stats={mappings:ma.error?null:(ma.count??ma.data?.length??0),movements:mv.error?null:(mv.count??0),issues:issues.error?null:(issues.count??0),settlements:se.error?null:(se.count??0)};loaded=true;
      renderCards();renderLedger();renderHub();renderEvidence();$('#integration-content').hidden=false;
      const now=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),partial=failed.length>0,needs=(hub?.metrics.review||0)+(hub?.metrics.failed||0)+(hub?.metrics.waiting||0);$('#integration-status').textContent=partial?`일부 원본 확인 실패 · ${failed.map(([name])=>name).join('·')} 값은 0이 아니라 미확인입니다.`:`원본 조회 완료 · ${now} · 자동 확인 ${hub?.metrics.healthy??0}단계 / 검토·재시도·대기 ${needs}단계`;$('#integration-status').classList.toggle('bad',partial||(hub?.metrics.failed||0)>0);emit(!partial);
    }catch(error){if(run!==generation)return;$('#integration-status').textContent='연결 현황을 불러오지 못했어요. 다시 확인해 주세요.';$('#integration-status').classList.add('bad');emit(false)}finally{if(run===generation){loading=false;button.disabled=false;button.textContent='지금 확인'}}
  }

  async function integrationRequest(body){
    const {data,error}=await client.auth.getSession();if(error||!data.session){onDenied?.();throw Error('LOGIN_REQUIRED')}
    const res=await fetch(config.url+'/functions/v1/integration-ingest',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await res.json().catch(()=>({}));if(res.status===401||res.status===403){onDenied?.();throw Error('LOGIN_REQUIRED')}if(!res.ok)throw Error(result.error||'INTEGRATION_REQUEST_FAILED');return result;
  }
  async function previewHomepage(){
    if(evidenceBusy)return;evidenceBusy=true;evidencePreview=null;evidenceRunId=crypto.randomUUID();renderEvidence();evidenceStatus('홈페이지 주문을 읽어 저장 전 후보를 만들고 있어요.');
    try{evidencePreview=await integrationRequest({action:'collect',connectorCode:'homepage',runId:evidenceRunId,dryRun:true});const count=evidencePreview.received||0;evidenceStatus(count?`${count}건을 찾았습니다. 검토함에 넣어도 주문·SCM·정산 상태는 바뀌지 않습니다.`:'새로 미리 볼 주문이 없습니다.',false,true)}catch(error){console.error(error);evidenceRunId='';evidenceStatus('미리보기를 완료하지 못했습니다. 어떤 기록도 저장하지 않았습니다.',true)}finally{evidenceBusy=false;renderEvidence()}
  }
  async function applyHomepage(){
    if(evidenceBusy||!evidencePreview?.received||!evidenceRunId)return;
    if(!confirm(`미리 본 ${evidencePreview.received}건의 메타데이터를 검토함에 넣을까요? 주문·SCM·정산 원장은 바뀌지 않습니다.`))return;
    evidenceBusy=true;renderEvidence();evidenceStatus('검토함에 저장하고 중복·충돌을 확인하고 있어요.');
    try{const result=await integrationRequest({action:'collect',connectorCode:'homepage',runId:evidenceRunId,dryRun:false}),historyWarning=result.runRecorded===false?' · 실행 이력 저장 실패':'';evidenceStatus(`저장 ${result.inserted||0}건 · 중복 ${result.duplicates||0}건 · 충돌 ${result.conflicts||0}건${historyWarning}`,Boolean(result.conflicts)||result.runRecorded===false,!result.conflicts&&result.runRecorded!==false);evidencePreview=null;evidenceRunId='';await refresh(true)}catch(error){console.error(error);evidenceStatus('저장 결과를 확인하지 못했습니다. 같은 미리보기로 다시 시도하면 중복 저장하지 않습니다.',true)}finally{evidenceBusy=false;renderEvidence()}
  }
  async function reviewEvidence(id,decision){
    if(evidenceBusy)return;evidenceBusy=true;renderEvidence();evidenceStatus(decision==='reviewed'?'근거 확인 상태를 저장하고 있어요.':'반려 상태를 저장하고 있어요.');
    try{await integrationRequest({action:'review',evidenceId:id,decision});evidenceStatus(decision==='reviewed'?'근거 확인으로 표시했습니다. 원장에는 반영하지 않았습니다.':'반려했습니다. 원장에는 반영하지 않았습니다.',false,true);await refresh(true)}catch(error){console.error(error);evidenceStatus('검토 상태를 저장하지 못했습니다. 다시 시도해 주세요.',true)}finally{evidenceBusy=false;renderEvidence()}
  }

  function importStatus(text,bad=false,good=false){const el=$('#payhere-import-status');el.textContent=text;el.classList.toggle('bad',bad);el.classList.toggle('good',good)}
  function serverRow(row){return dryResult?.results?.find(x=>x.externalEventId===row.externalEventId)}
  function rowState(row){const server=serverRow(row);return server?.status||row.state}
  function renderImport(){
    if(!importPlan){$('#payhere-review').hidden=true;return}
    $('#payhere-review').hidden=false;
    const quantity=importPlan.ready.reduce((sum,row)=>sum+row.quantity,0),period=importPlan.period.start?`${importPlan.period.start} ~ ${importPlan.period.end}`:'기간 확인 필요';
    $('#payhere-summary').innerHTML=[['판매 기간',period],['할인 반영 매출액',money(importPlan.net)],['재고 반영 후보',quantity+'권/개'],['재고에서 제외',importPlan.excluded.reduce((s,x)=>s+x.quantity,0)+'건']].map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
    $('#payhere-rows').innerHTML=importPlan.rows.map(row=>{
      const server=serverRow(row),state=rowState(row),sku=row.mapped?.sku||'—',detail=server?.message||row.message;
      const stock=server&&Number.isInteger(server.currentStock)?`<small>현재 ${server.currentStock} → 반영 후 ${server.afterStock}</small>`:'';
      return `<tr><td><strong>${esc(row.name)}</strong><small>${esc(row.category||'미분류')}</small></td><td>${row.quantity} × ${money(row.unitPrice)}<small>${esc(row.occurredAt?.slice(0,16).replace('T',' ')||'거래일시 미확인')}</small></td><td><code>${esc(sku)}</code><small>${esc(row.mapped?.title||'연결 안 됨')}</small></td><td><span class="payhere-row-state ${esc(state)}">${esc(rowLabels[state]||state)}</span><small>${esc(detail)}</small>${stock}</td></tr>`;
    }).join('');
    const blockers=importPlan.blocked.length,duplicates=dryResult?.results?.filter(x=>x.status==='duplicate').length||0,applicable=dryResult?.results?.filter(x=>x.status==='applicable').length||0,repairs=dryResult?.results?.filter(x=>x.repairControl).length||0;
    $('#payhere-review-note').textContent=dryResult?`최종 검사: 재고 반영 ${applicable}개 · 이미 반영 ${duplicates}개${repairs?` · 기록 복구 ${repairs}개`:''} · 확인 필요 ${dryResult.results.filter(x=>x.status==='blocked').length}개`:`1차 검사: 반영 후보 ${importPlan.ready.length}개 · 재고 제외 ${importPlan.excluded.length}개 · 확인 필요 ${blockers}개`;
    const canApply=!!dryResult?.canApply&&(applicable>0||repairs>0)&&!blockers&&!importBusy;
    $('#payhere-confirm').disabled=!canApply;$('#payhere-apply').disabled=!canApply||!$('#payhere-confirm').checked;
  }

  async function chooseFile(file){
    const run=++fileGeneration;
    importFile=file;importPlan=null;dryResult=null;importHash='';importRequestId='';$('#payhere-confirm').checked=false;renderImport();
    if(!file)return importStatus('파일을 선택하면 화면 안에서 먼저 검사합니다.');
    importStatus('엑셀을 읽고 상품을 연결하고 있어요.');
    try{
      const model=window.PayhereImportModel;if(!model)throw Error('IMPORT_READER_MISSING');
      const [report,hash]=await Promise.all([model.parseWorkbook(file),model.fileHash(file)]);if(run!==fileGeneration)return;importHash=hash;
      let saved=null;try{saved=JSON.parse(sessionStorage.getItem(importRequestStorageKey)||'null')}catch{}
      importRequestId=saved?.hash===hash&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved?.id||'')?saved.id:crypto.randomUUID();
      try{sessionStorage.setItem(importRequestStorageKey,JSON.stringify({hash,id:importRequestId}))}catch{}
      importPlan=model.planImport(report,{mappings,inventory});
      renderImport();
      const bad=importPlan.blocked.length>0;importStatus(bad?'상품 연결이나 거래일시를 확인해야 합니다. 아직 재고는 바뀌지 않았습니다.':'1차 검사가 끝났습니다. 중복까지 최종 검사해 주세요.',bad,!bad);
    }catch(error){if(run!==fileGeneration)return;console.error(error);importStatus(error.message==='PAYHERE_SHEETS_MISSING'?'페이히어 매출내역 엑셀이 아닙니다. ‘매출 내역’과 ‘상품별’ 시트가 필요해요.':'파일을 읽지 못했습니다. 페이히어에서 새로 받은 .xlsx 파일인지 확인해 주세요.',true)}
  }

  function requestRows(){return importPlan.ready.map(row=>({canonicalSku:row.mapped.sku,productName:row.mapped.title||row.name,payhereName:row.name,quantity:row.quantity,unitAmount:row.unitPrice,grossAmount:row.gross,occurredAt:row.occurredAt,externalEventId:row.externalEventId}))}
  async function callImport(dryRun){
    if(importBusy||!importPlan||!importHash)return;
    const run=fileGeneration,file=importFile,hash=importHash,plan=importPlan;importBusy=true;$('#payhere-file').disabled=true;dryResult=null;renderImport();importStatus(dryRun?'중복과 현재 재고를 확인하고 있어요.':'SCM 원장에 반영하고 있어요.');
    try{
      const {data,error}=await client.auth.getSession();if(error||!data.session){onDenied?.();return}
      const rows=plan.ready.map(row=>({canonicalSku:row.mapped.sku,productName:row.mapped.title||row.name,payhereName:row.name,quantity:row.quantity,unitAmount:row.unitPrice,grossAmount:row.gross,occurredAt:row.occurredAt,externalEventId:row.externalEventId}));
      const res=await fetch(config.url+'/functions/v1/scm-sales-import',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({dryRun,requestId:importRequestId,report:{hash,fileName:file.name,period:plan.period,gross:plan.gross,net:plan.net},rows})});
      if(run!==fileGeneration)return;
      const result=await res.json();if(res.status===401||res.status===403){onDenied?.();return}if(!res.ok)throw Error(result.error||'IMPORT_FAILED');
      dryResult=result;renderImport();
      if(dryRun){const n=result.results.filter(x=>x.status==='applicable').length,repairs=result.results.filter(x=>x.repairControl).length;importStatus(n?`${n}개 상품을 반영할 수 있습니다. 표를 확인하고 마지막 체크를 해 주세요.`:repairs?`재고는 이미 반영됐고, 빠진 통합 기록 ${repairs}개만 복구할 수 있습니다.`:'새로 반영할 판매가 없습니다. 이미 처리된 내역은 다시 차감하지 않습니다.',false,true)}
      else{try{sessionStorage.removeItem(importRequestStorageKey)}catch{}importStatus(`${result.applied}개 상품 반영 완료 · 중복 ${result.duplicates}개 건너뜀${result.repaired?` · 기록 ${result.repaired}개 복구`:''}`,false,true);$('#payhere-confirm').checked=false;await refresh(true);window.SCM?.clear()}
    }catch(error){if(run!==fileGeneration)return;console.error(error);const message=error.message==='CONTROL_REPAIR_REQUIRED'?'SCM 원장 반영 뒤 통합 기록 완료를 확인하지 못했습니다. 같은 파일로 다시 검사하면 재고를 재차감하지 않고 기록만 복구합니다.':error.message==='IMPORT_IN_PROGRESS'?'같은 판매를 다른 요청이 처리 중입니다. 잠시 뒤 같은 파일로 다시 검사해 주세요.':error.message==='SOURCE_WRITE_DENIED'?'SCM 쓰기 권한을 확인해야 합니다. 재고는 변경되지 않았습니다.':'최종 검사를 완료하지 못했습니다. 재고 반영 여부를 단정하지 말고 같은 파일로 다시 검사해 주세요.';importStatus(message,true)}finally{if(run===fileGeneration){importBusy=false;$('#payhere-file').disabled=false;renderImport()}}
  }

  function open(kind){const filter=$('#integration-filter');filter.value=kind==='connected'?'connected':'';renderCards();if(kind==='needs')$('#integration-queue').scrollIntoView({behavior:'smooth',block:'start'});else $('#integration-pipeline').scrollIntoView({behavior:'smooth',block:'start'})}
  function clear(){generation++;fileGeneration++;connectors=[];mappings=[];inventory=[];syncRuns=[];evidenceInbox=[];hub=null;loaded=false;loading=false;importBusy=false;evidenceBusy=false;evidencePreview=null;evidenceRunId='';stats={mappings:null,movements:null,issues:null,settlements:null};scmState={available:false,stale:false,error:''};royaltyState={available:false,stale:false,error:'',bookCount:null};connectorsState={stale:false,error:''};syncRunsState={stale:false,error:''};evidenceState={stale:false,error:''};$('#integration-content').hidden=true;for(const id of ['integration-metrics','integration-pipeline','integration-queue','integration-runs','integration-sources','integration-connectors','integration-ledger-stats','integration-evidence-list'])$('#'+id).replaceChildren();$('#integration-queue-count').textContent='';$('#integration-status').textContent='로그인한 관리자만 통합 운영실을 볼 수 있습니다.';$('#integration-status').classList.remove('bad');importFile=null;importHash='';importRequestId='';importPlan=null;dryResult=null;$('#payhere-file').value='';$('#payhere-file').disabled=false;$('#payhere-confirm').checked=false;renderImport();emit(false)}
  function init(options){
    config=options;client=options.client;onDenied=options.onDenied;$('#integration-refresh').onclick=()=>refresh(true);$('#integration-filter').onchange=renderCards;
    $('#integration-evidence-filter').onchange=renderEvidence;$('#integration-collect-preview').onclick=previewHomepage;$('#integration-collect-apply').onclick=applyHomepage;
    $('#integration-evidence-list').onclick=event=>{const button=event.target.closest('[data-evidence-id]');if(button)reviewEvidence(button.dataset.evidenceId,button.dataset.evidenceDecision)};
    $('#payhere-file').onchange=e=>chooseFile(e.target.files?.[0]);$('#payhere-dry-run').onclick=()=>callImport(true);$('#payhere-confirm').onchange=renderImport;
    $('#payhere-apply').onclick=()=>{if(!$('#payhere-confirm').checked)return;if(confirm('검사된 판매 수량을 SCM 원장에 반영할까요? 이 작업은 재고를 차감합니다.'))callImport(false)};
    client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='USER_UPDATED')clear()});
  }
  window.Integration={init,refresh,clear,open};
})();
