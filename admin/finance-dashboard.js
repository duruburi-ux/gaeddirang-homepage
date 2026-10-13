(function(){
  'use strict';
  const M=window.FinanceDashboardModel,$=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let client,onDenied,model=null,documents=[],loading=false,loaded=false,generation=0,scope='team',periodKey='',transactionQuery='',transactionDirection='',transactionGroup='',transactionReview='';

  function setStatus(message,bad=false){const node=$('#finance-status');node.textContent=message;node.classList.toggle('bad',bad)}
  function setFreshnessStatus(){
    const generated=Date.parse(model?.generatedAt||''),screen=new Date(),stale=!Number.isFinite(generated)||screen.getTime()-generated>36*60*60*1000;
    const sourceTime=Number.isFinite(generated)?new Date(generated).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'미확인';
    const screenTime=screen.toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'});
    setStatus(`자료 생성 ${sourceTime} · 화면 조회 ${screenTime}${stale?' · 오래된 스냅샷이므로 원천을 다시 확인하세요.':''}`,stale);
  }
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
  function renderCoverage(period){
    const coverage=period.coverage||{included:[],pending:[]};
    $('#finance-coverage').innerHTML=`<div><strong>이번 화면에 포함</strong><ul>${coverage.included.map(value=>`<li>${esc(value)}</li>`).join('')||'<li>확인된 자료가 없습니다.</li>'}</ul></div><div class="pending"><strong>누락·확인 중</strong><ul>${coverage.pending.map(value=>`<li>${esc(value)}</li>`).join('')||'<li>추가 확인 항목이 없습니다.</li>'}</ul></div>`;
  }
  function renderMembers(period){
    const keys=['duru','jini','dasom'];
    $('#finance-member-grid').innerHTML=keys.map(key=>{
      const rows=Object.fromEntries(period.scopes[key].metrics.map(row=>[row.key,row])),settlement=rows.settlement;
      const exchange=settlement.availability==='verified'?(settlement.amount>0?`팀에서 받을 ${M.formatWon(settlement.amount)}`:settlement.amount<0?`팀에 돌려줄 ${M.formatWon(Math.abs(settlement.amount))}`:'주고받을 돈 없음'):'정산 확인 필요';
      const value=row=>row?.availability==='verified'?M.formatWon(row.amount):M.AVAILABILITY[row?.availability]||'확인 필요';
      return `<article><div class="finance-member-title"><strong>${esc(M.SCOPES[key])}</strong><span>${esc(exchange)}</span></div><dl><div><dt>내 몫</dt><dd>${esc(value(rows.share))}</dd></div><div><dt>이미 받은 돈</dt><dd>${esc(value(rows.received))}</dd></div><div><dt>개인 보관 팀 돈</dt><dd>${esc(value(rows.held_unsettled))}</dd></div><div><dt>개인 100% 수입</dt><dd>${esc(value(rows.income))}</dd></div></dl></article>`;
    }).join('');
  }
  function renderTransactions(period){
    const query=transactionQuery.trim().toLocaleLowerCase('ko-KR');
    const reviewMatches=row=>!transactionReview||(transactionReview==='candidate'&&(row.reviewStatus.includes('candidate')||row.reviewStatus==='paired_reversal'))||(transactionReview==='excluded'&&(row.reviewStatus.includes('excluded')||row.reviewStatus.startsWith('do_not_')))||(transactionReview==='needs'&&row.reviewStatus.startsWith('needs_'))||(transactionReview==='duplicate'&&row.duplicateCandidateGroupId);
    const rows=period.financeRecords.filter(row=>(!transactionDirection||row.direction===transactionDirection)&&(!transactionGroup||row.group===transactionGroup)&&reviewMatches(row)&&(!query||`${row.date} ${row.label} ${row.sourceType} ${row.sourceTag} ${row.reason}`.toLocaleLowerCase('ko-KR').includes(query)));
    const groupLabel={bank:'은행',card:'카드',invoice:'계산서',other:'기타 증빙'},directionLabel={inflow_or_positive_document:'유입·양수',outflow_or_negative_document:'유출·음수',zero:'0원'};
    const reviewLabel=value=>value==='bank_link_candidate'?'은행·증빙 연결 후보':value==='paired_reversal'?'결제·취소 짝':value==='do_not_add_again'?'중복 합산 제외':value==='do_not_add_to_sales_again'?'매출 재합산 제외':value==='excluded_from_company_expense'?'회사 비용 제외':value==='excluded_from_profit_loss'?'회사 손익 제외':value.startsWith('needs_')?'추가 확인 필요':'검토 중';
    $('#finance-transaction-count').textContent=period.financeRecords.length?`이 달 전체 ${period.financeRecords.length}행 중 ${rows.length}행 · 회사 손익 합계에는 아직 반영하지 않음`:'이 달에 연결된 머니핀 거래·증빙 행이 없습니다.';
    $('#finance-transaction-list').innerHTML=rows.length?rows.map(row=>{
      const negative=row.direction==='outflow_or_negative_document',links=row.evidenceLinkIds.length?` · 연결 후보 ${row.evidenceLinkIds.length}건`:'',duplicate=row.duplicateCandidateGroupId?' · 중복 후보':'';
      return `<div class="finance-transaction-row"><span class="finance-transaction-direction ${negative?'outflow':row.direction==='zero'?'zero':'inflow'}">${esc(directionLabel[row.direction])}</span><span class="finance-transaction-copy"><strong>${esc(row.label)}</strong><small>${esc(row.date)} · ${esc(groupLabel[row.group])} / ${esc(row.sourceType)}${row.sourceTag?` · ${esc(row.sourceTag)}`:''} · 원본 ${esc(row.sourceRow||'—')}행</small><small class="finance-transaction-review">${esc(reviewLabel(row.reviewStatus))}${esc(links)}${esc(duplicate)}</small>${row.reason?`<small>${esc(row.reason)}</small>`:''}</span><b>${negative?'−':row.direction==='zero'?'':'+'}${esc(M.formatWon(Math.abs(row.amount)))}</b></div>`;
    }).join(''):'<div class="finance-empty-detail">검색 조건에 맞는 거래가 없습니다. 회사 수입·지출 0원으로 처리하지 않았습니다.</div>';
  }
  function renderReview(){
    const open=model.openItems.map(row=>`<article class="finance-review-item ${esc(row.severity)}"><div><span>미해결</span><strong>${esc(row.title)}</strong><small>${esc(row.status)} · ${esc(row.note)}</small></div><b>${esc(M.formatWon(row.amount))}</b></article>`);
    const issues=model.evidenceIssues.map(row=>`<article class="finance-review-item ${esc(row.severity)}"><div><span>증빙 점검</span><strong>${esc(row.title)}</strong><small>${esc(row.evidence)}</small><small>${esc(row.action)}</small></div><b>확인</b></article>`);
    $('#finance-review-list').innerHTML=[...open,...issues].join('')||'<div class="finance-empty-detail">현재 등록된 확인 항목이 없습니다.</div>';
  }
  function render(){
    if(!model)return;
    const period=M.period(model,periodKey);periodKey=period.key;renderControls();
    $('#finance-period-banner').innerHTML=`<strong>${esc(period.label)}</strong><span class="finance-state ${esc(period.status)}">${esc(period.statusLabel)}</span><span>${period.status==='confirmed'?'계산 문서 확정 · 지급 완료와 별개':'자료가 들어오는 중 · 확정 수치와 분리 표시'}</span>${period.sourceAsOf?`<span>자료 기준 ${esc(period.sourceAsOf)}</span>`:''}`;
    renderCoverage(period);
    const balance=period.teamAccountBalance,balanceNode=$('#finance-balance');balanceNode.hidden=scope!=='team';balanceNode.className=`finance-balance ${esc(balance.availability)}`;balanceNode.innerHTML=`<div><strong>팀 계좌 잔액</strong><p>${esc(balance.note)}</p></div><b>${esc(balance.availability==='verified'?M.formatWon(balance.amount):M.AVAILABILITY[balance.availability])}</b>`;
    const movement=period.bankMovement,movementNode=$('#finance-bank-movement');movementNode.hidden=scope!=='team';movementNode.className=`finance-bank-movement ${esc(movement.availability)}`;movementNode.innerHTML=`<div class="finance-bank-movement-head"><div><strong>머니핀에 기록된 통장 입출금 · 참고</strong><p>${esc(movement.note)}</p></div><span>${movement.rowCount==null?'손익·잔액 아님':esc(movement.rowCount+'행 · 손익·잔액 아님')}</span></div><div class="finance-bank-values"><div><span>통장 유입 행 합계</span><b>${esc(M.formatWon(movement.inflow))}</b></div><div><span>통장 유출 행 합계</span><b>${esc(M.formatWon(movement.outflow))}</b></div><div><span>참고 순증감</span><b>${esc(M.formatWon(movement.netChange))}</b></div></div>`;
    const warnings=$('#finance-warnings');warnings.innerHTML=period.warnings.map(text=>`<div class="finance-warning">${esc(text)}</div>`).join('');warnings.hidden=!period.warnings.length;
    const order=scope==='team'?['income','expense','receivable','payable','held_unsettled','settlement','scheduled','share','received']:['share','receivable','payable','settlement','received','held_unsettled','scheduled','income','expense'];const metrics=[...period.scopes[scope].metrics].sort((a,b)=>order.indexOf(a.key)-order.indexOf(b.key));$('#finance-metrics').innerHTML=metrics.map(item=>`<button type="button" class="finance-card ${esc(item.availability)}" data-finance-metric="${esc(item.key)}" aria-label="${esc(item.label)} ${esc(statusValue(item))}, 근거 보기"><span class="finance-card-label">${esc(item.label)}<span class="finance-badge ${esc(item.availability)}">${esc(M.AVAILABILITY[item.availability])}</span></span><strong class="finance-card-value">${esc(statusValue(item))}</strong><span class="finance-card-help">${esc(item.help)}</span></button>`).join('');
    $('#finance-metrics').querySelectorAll('button').forEach(button=>button.onclick=()=>openDetail(button.dataset.financeMetric));
    $('#finance-source-scope').textContent=model.sourceScope||'확인된 기간 밖 자료는 포함하지 않습니다.';renderMembers(period);renderReview();renderTransactions(period);
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
      model=M.normalizePayload(finance.data);documents=Array.isArray(docs.data)?docs.data:[];periodKey=model.periods.some(row=>row.key===periodKey)?periodKey:model.periods[0].key;loaded=true;render();setFreshnessStatus();
    }catch(error){if(run!==generation)return;console.error(error);model=null;documents=[];loaded=false;$('#finance-content').hidden=true;setStatus(error.message==='FINANCE_PERIODS_EMPTY'?'게시된 재정 스냅샷이 없습니다. 실제 수치를 추정하지 않았습니다.':'재정 자료 형식을 확인해야 합니다. 실제 수치를 표시하지 않았습니다.',true)}finally{if(run===generation){loading=false;button.disabled=false;button.textContent='지금 확인'}}
  }
  function clear(){generation++;model=null;documents=[];loading=false;loaded=false;periodKey='';scope='team';transactionQuery='';transactionDirection='';transactionGroup='';transactionReview='';$('#finance-content').hidden=true;$('#finance-metrics').replaceChildren();$('#finance-warnings').replaceChildren();$('#finance-member-grid').replaceChildren();$('#finance-review-list').replaceChildren();$('#finance-transaction-list').replaceChildren();setStatus('로그인한 관리자만 재정 현황을 볼 수 있습니다.')}
  function init(options){client=options.client;onDenied=options.onDenied;$('#finance-refresh').onclick=()=>refresh(true);$('#finance-transaction-search').oninput=event=>{transactionQuery=event.target.value;if(model)renderTransactions(M.period(model,periodKey))};$('#finance-transaction-group').onchange=event=>{transactionGroup=event.target.value;if(model)renderTransactions(M.period(model,periodKey))};$('#finance-transaction-direction').onchange=event=>{transactionDirection=event.target.value;if(model)renderTransactions(M.period(model,periodKey))};$('#finance-transaction-review').onchange=event=>{transactionReview=event.target.value;if(model)renderTransactions(M.period(model,periodKey))};$('#finance-transaction-reset').onclick=()=>{transactionQuery='';transactionDirection='';transactionGroup='';transactionReview='';$('#finance-transaction-search').value='';$('#finance-transaction-group').value='';$('#finance-transaction-direction').value='';$('#finance-transaction-review').value='';if(model)renderTransactions(M.period(model,periodKey));$('#finance-transaction-search').focus()};client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='USER_UPDATED')clear()})}
  window.FinanceDashboard={init,refresh,clear};
})();
