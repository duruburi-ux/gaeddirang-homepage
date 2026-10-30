(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const all=selector=>[...document.querySelectorAll(selector)];
  const routeCopy={
    work:{copy:'대표 확인과 막힌 일을 먼저 봅니다.',action:['확인할 일 보기',()=>{const filter=$('#work-filter');if(filter){filter.value='attention';filter.dispatchEvent(new Event('change'))}$('#work-list')?.scrollIntoView({block:'start'})}],note:'완료·담당 변경은 연결된 노션 원본에서만 확정됩니다.'},
    scm:{copy:'상품을 찾거나 장부에서 확인할 항목을 봅니다.',action:['장부 확인할 일',()=>all('[data-scm-view="checks"]')[0]?.click()],note:'입고 예정은 실입고가 아니며, 장부 수량을 매장 실물 수량으로 사용하지 않습니다.'},
    finance:{copy:'확정 정산과 확인할 증빙을 먼저 봅니다.',action:['확인할 돈 보기',()=>$('#finance-review-list')?.scrollIntoView({block:'start'})],note:'문서 확정은 지급 완료가 아닙니다. 이 화면에서는 송금이나 원장을 바꾸지 않습니다.'},
    publishing:{copy:'프로그램 문안을 이 기기에서 작성하고 미리 볼 수 있습니다.',action:['새 문안 작성',()=>$('#program-new')?.click()],note:'홈페이지에 올리기와 자동 갱신은 아직 연결되지 않았습니다.'},
    partners:{copy:'비공개 연락처 목록은 아직 이 화면에 연결되지 않았습니다.',action:null,note:'지금은 연락처 검색과 최근 연락·회신 기록을 처리할 수 없습니다. 빈 화면을 연락처 0명으로 보지 않습니다.'},
    integration:{copy:'실패·대기 항목과 마지막으로 확인된 시각을 먼저 봅니다.',action:['지금 확인할 일',()=>$('#integration-queue')?.scrollIntoView({block:'start'})],note:'서비스 연결, 자료 확인, 실제 업무 반영은 서로 다른 상태입니다.'},
    operations:{copy:'하려는 일을 검색해 실제 처리 화면이나 연결된 자료로 이동합니다.',action:['업무 검색',()=>$('#ops-search')?.focus()],note:'원고 업무는 자료 링크까지만 연결돼 있습니다. 접수부터 완료까지 이어지는 전용 화면은 아직 없습니다.'},
    finder:{copy:'매장에서 확인한 판매가능 수량만 봅니다.',action:['책 찾기',()=>$('#book-finder-query')?.focus()],note:'입고 예정은 판매가능에 더하지 않습니다. 입고 등록과 검수 완료는 아직 별도 자료에서 처리합니다.'}
  };
  function navigate(tab){if(typeof window.switchTab==='function')window.switchTab(tab);else location.hash=tab}
  function focusPanel(name,anchor){
    const cfg=routeCopy[name];if(!cfg||!anchor||$(`#tab-${name} .workflow-focus`))return;
    const panel=document.createElement('section');panel.className='workflow-focus';panel.setAttribute('aria-label','업무 처리 순서');
    const intro=document.createElement('p');intro.textContent=cfg.copy;panel.append(intro);
    if(cfg.action){const actions=document.createElement('div');actions.className='workflow-focus-actions';const button=document.createElement('button');button.type='button';button.textContent=cfg.action[0];button.addEventListener('click',cfg.action[1]);actions.append(button);panel.append(actions)}
    const note=document.createElement('div');note.className='workflow-connection-note';note.textContent=cfg.note;panel.append(note);anchor.insertAdjacentElement('afterend',panel);
  }
  function disclosure(nodes,title,description=''){
    const kept=nodes.filter(Boolean).filter(node=>node.parentNode);if(!kept.length)return null;
    const details=document.createElement('details');details.className='workflow-disclosure';
    const summary=document.createElement('summary');const copy=document.createElement('span');copy.textContent=title;if(description){const small=document.createElement('small');small.textContent=description;copy.append(small)}summary.append(copy);
    const body=document.createElement('div');body.className='workflow-disclosure-body';const first=kept[0];first.parentNode.insertBefore(details,first);details.append(summary,body);kept.forEach(node=>body.append(node));return details;
  }
  function stableButtonLabel(id,label){const button=$(id);if(!button)return;const sync=()=>{if(button.textContent!==label)button.textContent=label};sync();new MutationObserver(sync).observe(button,{childList:true,characterData:true,subtree:true})}
  function plainStatus(id,replacements){const node=$(id);if(!node)return;let syncing=false;const sync=()=>{if(syncing)return;let text=node.textContent;replacements.forEach(([from,to])=>{text=text.replaceAll(from,to)});if(text!==node.textContent){syncing=true;node.textContent=text;syncing=false}};sync();new MutationObserver(sync).observe(node,{childList:true,characterData:true,subtree:true})}
  let unifiedRefreshBusy=false;
  function bindUnifiedIntegrationRefresh(){
    const button=$('#integration-refresh');if(!button||button.dataset.workflowUnifiedRefresh==='true')return;
    button.dataset.workflowUnifiedRefresh='true';
    button.onclick=async()=>{
      if(unifiedRefreshBusy)return;unifiedRefreshBusy=true;
      const hold=()=>{if(!unifiedRefreshBusy)return;if(!button.disabled)button.disabled=true;if(button.textContent!=='확인 중…')button.textContent='확인 중…'};const observer=new MutationObserver(hold);observer.observe(button,{attributes:true,attributeFilter:['disabled'],childList:true,characterData:true,subtree:true});hold();
      try{await Promise.allSettled([window.Integration?.refresh?.(true),window.OperationsSourcesDashboard?.refresh?.({reason:'manual'})])}
      finally{unifiedRefreshBusy=false;observer.disconnect();button.disabled=false;button.textContent='연결 자료 다시 확인'}
    };
  }
  function syncFocusedChrome(){
    const focused=Object.keys(routeCopy).some(name=>!$(`#tab-${name}`)?.classList.contains('hidden'));
    $('#coreBanner')?.classList.toggle('workflow-suppressed',focused);
  }
  function setup(){
    focusPanel('work',$('#work-status'));focusPanel('scm',$('#scm-status'));focusPanel('finance',$('#finance-status'));focusPanel('publishing',$('.program-publishing-boundary'));focusPanel('partners',$('#partner-directory-status'));focusPanel('integration',$('#integration-status'));focusPanel('operations',$('.ops-hero'));focusPanel('finder',$('#book-finder-status'));
    disclosure([$('.work-filters')],'검색·필터','필요한 업무가 바로 보이지 않을 때만 사용합니다.');
    const scmFilters=$('.scm-filters');if(scmFilters)disclosure([...scmFilters.children].slice(1),'분류·소유·정렬 조건','상품명 검색 뒤 결과를 더 좁힐 때 사용합니다.');
    disclosure([$('.finance-members')],'개인별 상세','개인별 몫과 주고받을 돈을 확인합니다.');
    disclosure([$('.finance-transactions'),$('.finance-note')],'거래·증빙 전체 보기','검색과 세부 근거가 필요할 때 펼칩니다.');
    all('#tab-publishing .program-editor>details').forEach(item=>item.open=false);
    disclosure([$('.partner-directory-controls'),$('.partner-directory-table')],'연락처 원장 보기','운영 원장이 연결되면 검색·충돌 검토에 사용합니다.');
    const sourceRefresh=$('#source-dashboard-refresh');if(sourceRefresh){sourceRefresh.hidden=true;sourceRefresh.setAttribute('aria-hidden','true')}
    stableButtonLabel('#work-refresh','업무 다시 확인');stableButtonLabel('#scm-refresh','재고 자료 다시 확인');stableButtonLabel('#book-finder-refresh','판매가능 다시 확인');stableButtonLabel('#finance-refresh','정산 자료 다시 확인');
    plainStatus('#scm-status',[['전체 상품 원장','상품·재고 원장'],['SCM 연결 설정','재고 자료 연결 설정']]);plainStatus('#book-finder-status',[['SCM','재고 자료']]);
    const integrationGroups=[
      [[$('#assistant-request-panel'),$('.integration-control-grid'),$('.integration-pipeline-wrap')],'최근 처리','확인할 일과 최근 처리 흐름을 봅니다.'],
      [[$('.source-dashboard-controls'),$('.source-dashboard-summary'),$('.source-dashboard-analysis'),$('.integration-sources'),$('.integration-evidence'),$('.payhere-import')],'자료 근거','기간별 변화와 수집 근거를 함께 확인합니다.'],
      [[$('.integration-toolbar'),$('.integration-connectors'),$('.integration-ledger'),$('.integration-guardrails')],'연결 설정','연결 상태와 자동 처리하지 않는 범위를 봅니다.']
    ];const integrationDisclosures=integrationGroups.map(([nodes,title,description])=>disclosure(nodes,title,description)).filter(Boolean);
    let integrationCursor=$('#tab-integration .workflow-focus');
    integrationDisclosures.forEach(details=>{if(integrationCursor){integrationCursor.insertAdjacentElement('afterend',details);integrationCursor=details}});
    disclosure([$('.ops-workflow'),$('.ops-connections')],'업무 연결 범위','어디까지 자동으로 이어지는지 확인합니다.');
    all('[data-focus-tab]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.focusTab)));
    all('.tab').forEach(tab=>new MutationObserver(syncFocusedChrome).observe(tab,{attributes:true,attributeFilter:['class']}));syncFocusedChrome();
    setTimeout(bindUnifiedIntegrationRefresh,0);
  }
  setup();
  window.AdminWorkflowFocus={setup};
})();
