window.AdminActionFlow=(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  const all=selector=>[...document.querySelectorAll(selector)];
  const ROUTES={
    home:['오늘 할 일','할 일을 적거나, 확인이 필요한 일부터 고르세요.',null],
    read:['내 계획','개인 일정과 수집함을 확인합니다.','#personal-quick-title'],
    work:['팀 업무','확인할 일과 막힌 일을 먼저 봅니다.','#work-search'],
    finder:['책 찾기','판매가능 여부를 확인할 책을 찾습니다.','#book-finder-query'],
    scm:['상품·재고','상품을 찾고 장부의 확인 항목을 봅니다.','#scm-search'],
    orders:['주문','주문을 찾거나 새 주문을 기록합니다.','#oSearch'],
    apps:['수업 신청','신청자를 찾고 처리 상태를 확인합니다.','#fSearch'],
    cohorts:['프로그램 현황','프로그램과 기수별 접수 현황을 찾습니다.','#cSearch'],
    publishing:['홈페이지 프로그램','문안을 작성하고 공개 전 내용을 검토합니다.','#program-new'],
    inquiries:['기관 문의','새 문의와 상담 상태를 확인합니다.','#iSearch'],
    finance:['정산','확정된 근거와 확인할 증빙을 나눠 봅니다.','#finance-refresh'],
    partners:['위탁 연락처','연결된 연락처만 확인합니다.',null],
    members:['고객 이력','이름이나 연락처로 참여 이력을 찾습니다.','#mSearch'],
    alerts:['출간 알림','책별 알림 신청 기록을 찾습니다.','#alSearch'],
    operations:['업무 찾기','하려는 일을 검색해 실제 처리 화면으로 이동합니다.','#ops-search'],
    integration:['연결 상태','실패하거나 다시 확인할 자료만 봅니다.','#integration-refresh']
  };
  const FILTERS=['#tab-work .work-filters','#tab-apps .filter-panel','#tab-members .filter-panel','#tab-cohorts .filter-panel','#tab-inquiries .filter-panel','#tab-alerts .filter-panel','#tab-partners .partner-directory-controls'];
  const ADVANCED={
    publishing:['.program-publishing-boundary'],partners:['.partner-directory-boundary','.partner-sensitive-boundary'],
    finance:['.finance-note'],integration:['.integration-ledger','.integration-guardrails']
  };
  let initialized=false;
  function route(){return location.hash.slice(1)||'home'}
  function navigate(name){if(typeof window.switchTab==='function')window.switchTab(name);else location.hash=name}
  function activateTarget(selector){
    const target=$(selector);if(!target)return false;
    const closed=[];for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open)closed.unshift(parent);closed.forEach(details=>{details.open=true});
    if(target.tagName==='BUTTON'){target.click();return true}
    target.scrollIntoView?.({block:'center'});if(target.matches('input,select,textarea,[tabindex],a[href],button'))target.focus?.({preventScroll:false});else{target.tabIndex=-1;target.focus?.({preventScroll:false})}return true;
  }
  function renderBar(){
    const name=route(),panel=$(`#tab-${name}`),cfg=ROUTES[name];
    all('.action-route-bar').forEach(node=>node.remove());
    if(name==='home'||name==='read'||!panel||!cfg)return;
    const bar=document.createElement('div');bar.className='action-route-bar';bar.innerHTML=`<div class="action-route-copy"><small>${name==='home'?'지금 필요한 것만':'현재 화면'}</small><strong>${cfg[0]}</strong><p>${cfg[1]}</p></div><div class="action-route-actions"></div>`;
    const actions=bar.lastElementChild;
    if(name!=='home'){
      const home=document.createElement('button');home.type='button';home.className='action-secondary';home.textContent='오늘 할 일';home.onclick=()=>navigate('home');actions.append(home);
    }
    if(cfg[2]){const primary=document.createElement('button');primary.type='button';primary.className='action-primary';primary.textContent={read:'할 일 추가',work:'업무 찾기',finder:'책 찾기',scm:'상품 찾기',orders:'주문 찾기',apps:'신청자 찾기',cohorts:'프로그램 찾기',publishing:'새 문안',inquiries:'문의 찾기',finance:'정산 다시 확인',members:'고객 찾기',alerts:'알림 찾기',operations:'업무 찾기',integration:'자료 다시 확인'}[name]||'바로 시작';primary.onclick=()=>activateTarget(cfg[2]);actions.append(primary)}
    panel.prepend(bar);
  }
  function disclosure(node,title){
    if(!node||node.closest('.action-filter-details'))return;
    const details=document.createElement('details');details.className='action-filter-details';
    const summary=document.createElement('summary');summary.innerHTML=`<span>${title}</span><small>필요할 때 펼치기</small>`;
    const body=document.createElement('div');body.className='action-filter-body';node.parentNode.insertBefore(details,node);body.append(node);details.append(summary,body);
    const controls=[...node.querySelectorAll('input,select,textarea')];
    const isActive=control=>control.matches('[type=checkbox],[type=radio]')?control.checked!==control.defaultChecked:control.tagName==='SELECT'?control.selectedIndex>0:String(control.value||'').trim()!==String(control.defaultValue||'').trim();
    const syncState=()=>{const active=controls.some(isActive);details.dataset.active=String(active);summary.querySelector('small').textContent=active?'조건 적용 중':'필요할 때 펼치기';if(active)details.open=true};
    controls.forEach(control=>{control.addEventListener('input',syncState);control.addEventListener('change',syncState)});syncState();
  }
  function advanced(routeName,selectors,title='연결·운영 정보'){
    const nodes=selectors.map(selector=>$(`#tab-${routeName} ${selector}`)).filter(Boolean).filter(node=>!node.closest('.action-advanced-details'));if(!nodes.length)return;
    const details=document.createElement('details');details.className='action-advanced-details';details.innerHTML=`<summary>${title}</summary>`;
    const body=document.createElement('div');body.className='action-advanced-body';nodes[0].parentNode.insertBefore(details,nodes[0]);nodes.forEach(node=>body.append(node));details.append(body);
  }
  function bindQuickAdd(){
    const form=$('#home-quick-form'),input=$('#home-quick-title'),status=$('#home-quick-status');if(!form||form.dataset.bound)return;form.dataset.bound='true';
    form.addEventListener('submit',event=>{event.preventDefault();const value=input.value.trim();const source=$('#personal-quick-title'),sourceForm=$('#personal-quick-form');if(!value||!source||!sourceForm)return;
      source.value=value;sourceForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      if(source.value){status.textContent='추가하지 못했습니다. 내 계획에서 다시 확인해 주세요.';status.classList.add('bad');return}
      input.value='';status.textContent='수집함에 추가했습니다.';status.classList.remove('bad');navigate('read');window.PersonalPlanner?.setView?.('inbox');
    });
  }
  function simplify(){
    document.body.classList.add('admin-action-flow');all('.workflow-focus').forEach(node=>node.remove());
    FILTERS.forEach(selector=>disclosure($(selector),'검색·필터'));
    Object.entries(ADVANCED).forEach(([name,selectors])=>advanced(name,selectors));
    const recent=$('#tab-home .dash-work');if(recent&&!recent.closest('.action-advanced-details'))advanced('home',['.dash-work'],'최근 바뀐 일');
  }
  function sync(){renderBar()}
  function init(){if(initialized)return;initialized=true;simplify();bindQuickAdd();window.addEventListener('hashchange',()=>requestAnimationFrame(sync));document.addEventListener('click',event=>{if(event.target.closest('[data-nav-tab],[data-tab],[data-dash-tab]'))requestAnimationFrame(sync)});sync()}
  function deactivate(){const quick=$('#home-quick-title'),status=$('#home-quick-status');if(quick)quick.value='';if(status){status.textContent='';status.classList.remove('bad')}all('.action-filter-details,.action-advanced-details').forEach(node=>node.open=false);all('.action-route-bar').forEach(node=>node.remove())}
  return {init,deactivate,sync,routes:()=>Object.keys(ROUTES)};
})();
window.AdminActionFlow.init();
