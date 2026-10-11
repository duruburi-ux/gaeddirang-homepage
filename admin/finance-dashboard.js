(function(){
  'use strict';
  const M=window.FinanceDashboardModel,$=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let client,onDenied,model=null,documents=[],loading=false,loaded=false,generation=0,scope='team',periodKey='';

  function setStatus(message,bad=false){const node=$('#finance-status');node.textContent=message;node.classList.toggle('bad',bad)}
  function statusValue(item){return item.availability==='verified'?M.formatWon(item.amount):M.AVAILABILITY[item.availability]||'확인 필요'}
  function documentMeta(id){return documents.find(row=>row.id===id)||null}
  function periodMatches(row,key){const label=`${key.slice(0,4)}년 ${Number(key.slice(5))}월`;return [row.period_start,row.period_end].some(value=>String(value||'').startsWith(key))||String(row.period_label||'').includes(key)||String(row.period_label||'').includes(label)}
  function selectorMatches(row,selector){return row.status==='confirmed'&&(!selector.category||row.category===selector.category)&&(!selector.periodKey||periodMatches(row,selector.periodKey))&&(!selector.subject||String(row.subject||'').trim()===selector.subject)&&(!selector.sha256||row.sha256===selector.sha256)}
  function linkedDocuments(metric){const direct=metric.documentIds.map(documentMeta).filter(Boolean),selected=metric.documentSelectors.flatMap(selector=>documents.filter(row=>selectorMatches(row,selector)));return [...new Map([...direct,...selected].map(row=>[row.id,row])).values()]}
  function renderControls(){
    const host=$('#finance-scope');host.innerHTML=Object.entries(M.SCOPES).map(([key,label])=>`<button type="button" data-finance-scope="${key}" aria-pressed="${scope===key}">${esc(label)}</button>`).join('');
    host.querySelectorAll('button').forEach(button=>button.onclick=()=>{scope=button.dataset.financeScope;render()});
    const select=$('#finance-period');select.innerHTML=model.periods.map(row=>`<option value="${row.key}"${periodKey===row.key?' selected':''}>${esc(row.label)} · ${esc(row.statusLabel)}</option>`).join('');select.onchange=()=>{periodKey=select.value;render()};
  }
  function render(){
    if(!model)return;
    const period=M.period(model,periodKey);periodKey=period.key;renderControls();
    $('#finance-period-banner').innerHTML=`<strong>${esc(period.label)}</strong><span class="finance-state ${esc(period.status)}">${esc(period.statusLabel)}</span><span>${period.status==='confirmed'?'계산 문서 확정 · 지급 완료와 별개':'자료가 들어오는 중 · 확정 수치와 분리 표시'}</span>${period.sourceAsOf?`<span>원천 ${esc(period.sourceAsOf)}</span>`:''}`;
    const balance=period.teamAccountBalance,balanceNode=$('#finance-balance');balanceNode.hidden=scope!=='team';balanceNode.className=`finance-balance ${esc(balance.availability)}`;balanceNode.innerHTML=`<div><strong>팀 계좌 잔액</strong><p>${esc(balance.note)}</p></div><b>${esc(balance.availability==='verified'?M.formatWon(balance.amount):M.AVAILABILITY[balance.availability])}</b>`;
    const movement=period.bankMovement,movementNode=$('#finance-bank-movement');movementNode.hidden=scope!=='team';movementNode.className=`finance-bank-movement ${esc(movement.availability)}`;movementNode.innerHTML=`<div class="finance-bank-movement-head"><div><strong>머니핀에 기록된 통장 입출금 · 참고</strong><p>${esc(movement.note)}</p></div><span>${movement.rowCount==null?'손익·잔액 아님':esc(movement.rowCount+'행 · 손익·잔액 아님')}</span></div><div class="finance-bank-values"><div><span>통장 유입 행 합계</span><b>${esc(M.formatWon(movement.inflow))}</b></div><div><span>통장 유출 행 합계</span><b>${esc(M.formatWon(movement.outflow))}</b></div><div><span>참고 순증감</span><b>${esc(M.formatWon(movement.netChange))}</b></div></div>`;
    const warnings=$('#finance-warnings');warnings.innerHTML=period.warnings.map(text=>`<div class="finance-warning">${esc(text)}</div>`).join('');warnings.hidden=!period.warnings.length;
    const order=scope==='team'?['settlement','held_unsettled','scheduled','share','received','income','expense']:['share','settlement','received','held_unsettled','scheduled','income','expense'];const metrics=[...period.scopes[scope].metrics].sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));$('#finance-metrics').innerHTML=metrics.map(item=>`<button type="button" class="finance-card ${esc(item.availability)}" data-finance-metric="${esc(item.key)}" aria-label="${esc(item.label)} ${esc(statusValue(item))}, 근거 보기"><span class="finance-card-label">${esc(item.label)}<span class="finance-badge ${esc(item.availability)}">${esc(M.AVAILABILITY[item.availability])}</span></span><strong class="finance-card-value">${esc(statusValue(item))}</strong><span class="finance-card-help">${esc(item.help)}</span></button>`).join('');
    $('#finance-metrics').querySelectorAll('button').forEach(button=>button.onclick=()=>openDetail(button.dataset.financeMetric));
    $('#finance-content').hidden=false;
  }
  function detailRows(detail){
    const calc=detail.metric.calculation.length?`<h3>계산식</h3><div class="finance-calc">${detail.metric.calculation.map(row=>`<div class="finance-calc-row"><span><i>${esc(row.operator||'·')}</i>${esc(row.label)}</span><b>${esc(M.formatWon(row.amount))}</b></div>`).join('')}</div>`:'';
    const evidence=detail.evidence.length?`<h3>거래 근거</h3><div class="finance-evidence">${detail.evidence.map(row=>`<div class="finance-evidence-row"><span><strong>${esc(row.label)}</strong><small>${esc([row.date,row.source,row.status==='excluded'?'합계 제외':''].filter(Boolean).join(' · '))}</small>${row.note?`<small>${esc(row.note)}</small>`:''}</span><b>${esc(M.formatWon(row.amount))}</b></div>`).join('')}</div>`:'<h3>거래 근거</h3><div class="finance-empty-detail">연결된 거래 근거가 없습니다. 숫자를 0원으로 단정하지 않았습니다.</div>';
    const linked=linkedDocuments(detail.metric);const docs=linked.length?`<h3>관련 최종 정산 문서</h3><div class="finance-documents">${linked.map(row=>`<button class="finance-document" type="button" data-finance-document="${esc(row.id)}"><span><strong>${esc(row.title)}</strong><small>${esc(row.period_label)} · v${esc(row.version_no)} · ${row.status==='confirmed'?'확정 문서':'문서 상태 '+esc(row.status)}</small></span><b>60초 링크로 열기 ↗</b></button>`).join('')}</div>`:'<h3>관련 최종 정산 문서</h3><div class="finance-empty-detail">이 항목에 연결된 확정 문서가 없습니다.</div>';
    return calc+evidence+docs;
  }
  function openDetail(key){
    const detail=M.details(model,periodKey,scope,key),item=detail.metric;if(!item)return;
    const {panel}=mountPanel(`<div class="backdrop"><section class="panel finance-detail"><button class="p-close" type="button" aria-label="닫기">×</button><div class="panel-head"><p class="finance-kicker">${esc(M.SCOPES[scope])} · ${esc(M.period(model,periodKey).label)}</p><h2>${esc(item.label)} 근거</h2></div><div class="panel-body"><div class="finance-detail-summary"><span>${esc(M.AVAILABILITY[item.availability])}</span><b>${esc(statusValue(item))}</b></div>${item.note?`<p class="finance-detail-note">${esc(item.note)}</p>`:''}${detailRows(detail)}</div></section></div>`);
    panel.querySelectorAll('[data-finance-document]').forEach(button=>button.onclick=()=>openDocument(button.dataset.financeDocument));
  }
  async function openDocument(id){
    const row=documentMeta(id);if(!row)return;
    const audit=await client.rpc('record_settlement_document_access',{p_id:id,p_action:'download'});if(audit.error){setStatus('문서 접근 기록을 남기지 못해 열기를 중단했어요.',true);return}
    const {data,error}=await client.storage.from('settlement-documents').createSignedUrl(row.storage_path,60,{download:row.file_name});if(error||!data?.signedUrl){setStatus('정산 문서의 짧은 링크를 만들지 못했어요.',true);return}window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }
  function authError(error){return ['JWT expired','PGRST301','ADMIN_REQUIRED'].some(value=>String(error?.message||error?.code||'').includes(value))}
  async function refresh(force=false){
    if(loading||(!force&&loaded))return;const run=++generation;loading=true;const button=$('#finance-refresh');button.disabled=true;button.textContent='확인 중…';setStatus('재정 원천과 정산 문서를 확인하고 있어요.');
    try{
      const [finance,docs]=await Promise.all([client.rpc('get_finance_dashboard'),client.rpc('list_settlement_documents')]);if(run!==generation)return;
      const error=finance.error||docs.error;if(error){model=null;documents=[];loaded=false;$('#finance-content').hidden=true;if(authError(error))onDenied?.('로그인 시간이 끝났어요. 다시 로그인해 주세요.');else setStatus('재정 원천을 불러오지 못했어요. 이전 값을 재사용하지 않았습니다.',true);return}
      model=M.normalizePayload(finance.data);documents=Array.isArray(docs.data)?docs.data:[];periodKey=model.periods.some(row=>row.key===periodKey)?periodKey:model.periods[0].key;loaded=true;render();setStatus(`검증된 재정 스냅샷을 불러왔어요 · ${new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`);
    }catch(error){if(run!==generation)return;console.error(error);model=null;documents=[];loaded=false;$('#finance-content').hidden=true;setStatus(error.message==='FINANCE_PERIODS_EMPTY'?'게시된 재정 스냅샷이 없습니다. 실제 수치를 추정하지 않았습니다.':'재정 자료 형식을 확인해야 합니다. 실제 수치를 표시하지 않았습니다.',true)}finally{if(run===generation){loading=false;button.disabled=false;button.textContent='지금 확인'}}
  }
  function clear(){generation++;model=null;documents=[];loading=false;loaded=false;periodKey='';scope='team';$('#finance-content').hidden=true;$('#finance-metrics').replaceChildren();$('#finance-warnings').replaceChildren();setStatus('로그인한 관리자만 재정 현황을 볼 수 있습니다.')}
  function init(options){client=options.client;onDenied=options.onDenied;$('#finance-refresh').onclick=()=>refresh(true);client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='USER_UPDATED')clear()})}
  window.FinanceDashboard={init,refresh,clear};
})();
