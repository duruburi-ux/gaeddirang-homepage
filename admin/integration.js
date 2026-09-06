(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const money=value=>(Number(value)||0).toLocaleString('ko-KR')+'원';
  const labels={connected:'자동 연결',manual:'수동 관리',setup_required:'준비 필요',attention:'확인 필요',disabled:'사용 안 함'};
  const modes={realtime:'실시간',scheduled:'주기 확인',manual:'사람이 입력',reference_only:'참고용'};
  const directions={inbound:'가져오기',outbound:'보내기',two_way:'양방향',reference_only:'참고만'};
  const rowLabels={ready:'반영 후보',excluded:'재고 제외',unmapped:'상품 연결 필요',ambiguous:'거래 연결 필요',price_mismatch:'가격 확인 필요',duplicate:'이미 반영',applicable:'반영 가능',blocked:'확인 필요',applied:'반영 완료'};
  let config,client,onDenied,connectors=[],mappings=[],inventory=[],loaded=false,loading=false,stats={mappings:0,movements:0,issues:0,settlements:0};
  let importFile=null,importHash='',importPlan=null,dryResult=null,importBusy=false;

  function counts(){return connectors.reduce((a,x)=>{a[x.status]=(a[x.status]||0)+1;return a},{connected:0,manual:0,setup_required:0,attention:0,disabled:0})}
  function emit(ok=true){const c=counts();window.dispatchEvent(new CustomEvent('integration:summary',{detail:{ok,connected:c.connected,manual:c.manual,setup:c.setup_required,attention:c.attention,fetchedAt:new Date().toISOString()}}))}
  function renderMetrics(){const c=counts();$('#integration-metrics').innerHTML=[['자동 연결',c.connected],['수동 관리',c.manual],['연결 준비 필요',c.setup_required],['확인 필요',c.attention]].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}
  function renderCards(){
    const filter=$('#integration-filter').value,rows=connectors.filter(x=>!filter||x.status===filter);
    $('#integration-connectors').innerHTML=rows.map(x=>`<article class="integration-card"><div class="integration-card-head"><h3>${esc(x.name)}</h3><span class="integration-pill ${esc(x.status)}">${labels[x.status]||esc(x.status)}</span></div><p class="integration-purpose">${esc(x.purpose)}</p><div class="integration-facts"><div><small>반영 방식</small><b>${modes[x.sync_mode]||esc(x.sync_mode)}</b></div><div><small>데이터 방향</small><b>${directions[x.data_direction]||esc(x.data_direction)}</b></div></div><div class="integration-next"><small>다음 행동</small><p>${esc(x.next_action||'별도 작업 없음')}</p></div>${x.admin_url?`<a href="${esc(x.admin_url)}" target="_blank" rel="noopener noreferrer">원본·연결 안내 열기 ↗</a>`:''}</article>`).join('')||'<p class="integration-empty">이 상태에 해당하는 시스템이 없어요.</p>';
  }
  function renderLedger(){
    $('#integration-ledger-stats').className='integration-ledger-stats';
    $('#integration-ledger-stats').innerHTML=[['상품 연결표',stats.mappings],['입출고 기록',stats.movements],['열린 불일치',stats.issues],['정산 기록',stats.settlements]].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('');
  }

  async function loadInventory(){
    try{
      const {data,error}=await client.auth.getSession();if(error||!data.session)return [];
      const res=await fetch(config.url+'/functions/v1/scm-read',{headers:{Authorization:'Bearer '+data.session.access_token,apikey:config.key},cache:'no-store'});
      if(!res.ok)return [];
      return (await res.json()).datasets?.inventory||[];
    }catch{return []}
  }

  async function refresh(force=false){
    if(loading||(!force&&loaded))return;
    loading=true;const button=$('#integration-refresh');button.disabled=true;button.textContent='확인 중…';
    try{
      const [co,ma,mv,is,se,scm]=await Promise.all([
        client.from('integration_connectors').select('*').order('sort_order'),
        client.from('integration_product_mappings').select('*',{count:'exact'}),
        client.from('integration_inventory_movements').select('*',{count:'exact',head:true}),
        client.from('integration_reconciliation_issues').select('*',{count:'exact',head:true}).in('status',['open','investigating']),
        client.from('integration_settlement_entries').select('*',{count:'exact',head:true}),
        loadInventory()
      ]);
      if(co.error){if(co.error.code==='PGRST301'||co.error.message?.toLowerCase().includes('jwt'))onDenied?.();throw co.error}
      connectors=co.data||[];mappings=ma.data||[];inventory=scm;stats={mappings:ma.count||0,movements:mv.count||0,issues:is.count||0,settlements:se.count||0};loaded=true;
      renderMetrics();renderCards();renderLedger();$('#integration-content').hidden=false;
      const now=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});$('#integration-status').textContent=`통합 원장 정상 · ${now} 확인 · 자동 ${counts().connected}곳 / 사람 확인 ${counts().manual+counts().setup_required+counts().attention}곳`;$('#integration-status').classList.remove('bad');emit(true);
    }catch(error){$('#integration-status').textContent=`연결 현황을 불러오지 못했어요. ${error.message||''}`;$('#integration-status').classList.add('bad');emit(false)}finally{loading=false;button.disabled=false;button.textContent='지금 확인'}
  }

  function importStatus(text,bad=false,good=false){const el=$('#payhere-import-status');el.textContent=text;el.classList.toggle('bad',bad);el.classList.toggle('good',good)}
  function serverRow(row){return dryResult?.results?.find(x=>x.externalEventId===row.externalEventId)}
  function rowState(row){const server=serverRow(row);return server?.status||row.state}
  function renderImport(){
    if(!importPlan){$('#payhere-review').hidden=true;return}
    $('#payhere-review').hidden=false;
    const quantity=importPlan.ready.reduce((sum,row)=>sum+row.quantity,0),period=importPlan.period.start?`${importPlan.period.start} ~ ${importPlan.period.end}`:'기간 확인 필요';
    $('#payhere-summary').innerHTML=[['판매 기간',period],['실매출',money(importPlan.net)],['재고 후보',quantity+'권/개'],['재고 제외',importPlan.excluded.reduce((s,x)=>s+x.quantity,0)+'건']].map(([k,v])=>`<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
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
    importFile=file;importPlan=null;dryResult=null;importHash='';$('#payhere-confirm').checked=false;renderImport();
    if(!file)return importStatus('파일을 선택하면 화면 안에서 먼저 검사합니다.');
    importStatus('엑셀을 읽고 상품을 연결하고 있어요.');
    try{
      const model=window.PayhereImportModel;if(!model)throw Error('IMPORT_READER_MISSING');
      const [report,hash]=await Promise.all([model.parseWorkbook(file),model.fileHash(file)]);importHash=hash;importPlan=model.planImport(report,{mappings,inventory});
      renderImport();
      const bad=importPlan.blocked.length>0;importStatus(bad?'상품 연결이나 거래일시를 확인해야 합니다. 아직 재고는 바뀌지 않았습니다.':'1차 검사가 끝났습니다. 중복까지 최종 검사해 주세요.',bad,!bad);
    }catch(error){console.error(error);importStatus(error.message==='PAYHERE_SHEETS_MISSING'?'페이히어 매출내역 엑셀이 아닙니다. ‘매출 내역’과 ‘상품별’ 시트가 필요해요.':'파일을 읽지 못했습니다. 페이히어에서 새로 받은 .xlsx 파일인지 확인해 주세요.',true)}
  }

  function requestRows(){return importPlan.ready.map(row=>({canonicalSku:row.mapped.sku,productName:row.mapped.title||row.name,payhereName:row.name,quantity:row.quantity,unitAmount:row.unitPrice,grossAmount:row.gross,occurredAt:row.occurredAt,externalEventId:row.externalEventId}))}
  async function callImport(dryRun){
    if(importBusy||!importPlan||!importHash)return;
    importBusy=true;dryResult=null;renderImport();importStatus(dryRun?'중복과 현재 재고를 확인하고 있어요.':'SCM 원장에 반영하고 있어요.');
    try{
      const {data,error}=await client.auth.getSession();if(error||!data.session){onDenied?.();return}
      const res=await fetch(config.url+'/functions/v1/scm-sales-import',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({dryRun,report:{hash:importHash,fileName:importFile.name,period:importPlan.period,gross:importPlan.gross,net:importPlan.net},rows:requestRows()})});
      const result=await res.json();if(res.status===401||res.status===403){onDenied?.();return}if(!res.ok)throw Error(result.error||'IMPORT_FAILED');
      dryResult=result;renderImport();
      if(dryRun){const n=result.results.filter(x=>x.status==='applicable').length,repairs=result.results.filter(x=>x.repairControl).length;importStatus(n?`${n}개 상품을 반영할 수 있습니다. 표를 확인하고 마지막 체크를 해 주세요.`:repairs?`재고는 이미 반영됐고, 빠진 통합 기록 ${repairs}개만 복구할 수 있습니다.`:'새로 반영할 판매가 없습니다. 이미 처리된 내역은 다시 차감하지 않습니다.',false,true)}
      else{importStatus(`${result.applied}개 상품 반영 완료 · 중복 ${result.duplicates}개 건너뜀${result.repaired?` · 기록 ${result.repaired}개 복구`:''}`,false,true);$('#payhere-confirm').checked=false;await refresh(true);window.SCM?.clear()}
    }catch(error){console.error(error);const message=error.message==='PARTIAL_CONTROL_LEDGER'?'SCM 재고는 반영됐지만 통합 기록 저장을 확인해야 합니다. 같은 파일을 다시 반영하지 마세요.':error.message==='SOURCE_WRITE_DENIED'?'SCM 쓰기 권한을 확인해야 합니다. 재고는 변경되지 않았습니다.':'최종 검사를 완료하지 못했습니다. 재고는 변경되지 않았습니다.';importStatus(message,true)}finally{importBusy=false;renderImport()}
  }

  function open(kind){const filter=$('#integration-filter');filter.value=kind==='connected'?'connected':'';renderCards();if(kind==='needs')$('#integration-connectors').scrollIntoView({behavior:'smooth',block:'start'})}
  function clear(){connectors=[];mappings=[];inventory=[];loaded=false;stats={mappings:0,movements:0,issues:0,settlements:0};$('#integration-content').hidden=true;importFile=null;importHash='';importPlan=null;dryResult=null;$('#payhere-file').value='';$('#payhere-confirm').checked=false;renderImport()}
  function init(options){
    config=options;client=options.client;onDenied=options.onDenied;$('#integration-refresh').onclick=()=>refresh(true);$('#integration-filter').onchange=renderCards;
    $('#payhere-file').onchange=e=>chooseFile(e.target.files?.[0]);$('#payhere-dry-run').onclick=()=>callImport(true);$('#payhere-confirm').onchange=renderImport;
    $('#payhere-apply').onclick=()=>{if(!$('#payhere-confirm').checked)return;if(confirm('검사된 판매 수량을 SCM 원장에 반영할까요? 이 작업은 재고를 차감합니다.'))callImport(false)};
  }
  window.Integration={init,refresh,clear,open};
})();
