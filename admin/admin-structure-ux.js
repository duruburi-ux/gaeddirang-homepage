window.AdminStructureUX=(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  const AREAS={
    today:{label:'오늘 할 일',entry:'home',routes:[['home','전체 현황'],['read','개인 일정'],['work','팀 업무']]},
    books:{label:'책과 판매',entry:'finder',routes:[['finder','책 찾기'],['orders','주문'],['scm','상품·재고'],['partners','위탁 연락처']]},
    programs:{label:'프로그램',entry:'publishing',routes:[['publishing','홈페이지 프로그램'],['cohorts','기수·정원'],['apps','수업 신청'],['inquiries','기관 문의']]},
    finance:{label:'정산',entry:'finance',routes:[['finance','정산·재정'],['integration','자료 연결']]},
    content:{label:'콘텐츠',entry:'operations',routes:[['operations','업무 찾기'],['members','고객 이력'],['alerts','출간 알림']]},
  };
  const routeArea=new Map(Object.entries(AREAS).flatMap(([area,value])=>value.routes.map(([route])=>[route,area])));
  let initialized=false,observer=null;
  const currentRoute=()=>location.hash.slice(1)||'home';
  function navigate(route){window.dispatchEvent(new CustomEvent('planner:close-drawers'));if(typeof window.switchTab==='function')window.switchTab(route);else location.hash=route;requestAnimationFrame(sync)}
  function renderSubnav(area,route){
    const host=$('.workspace-area-subnav'),definition=AREAS[area];if(!host||!definition)return;
    if(host.dataset.area!==area){host.dataset.area=area;host.innerHTML=definition.routes.map(([key,label])=>`<button type="button" data-area-route="${key}">${label}</button>`).join('')+(area==='finance'?'<a href="docs.html">견적·정산·서류 ↗</a>':'');host.querySelectorAll('[data-area-route]').forEach(button=>button.onclick=()=>navigate(button.dataset.areaRoute))}
    host.querySelectorAll('[data-area-route]').forEach(button=>{if(button.dataset.areaRoute===route)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
  }
  function rebuildMobile(){
    const nav=$('.ux-mobile-nav');if(!nav||nav.dataset.structureReady)return;nav.dataset.structureReady='true';nav.innerHTML=Object.entries(AREAS).map(([key,value])=>`<button type="button" data-mobile-area="${key}"><i aria-hidden="true">${{today:'✓',books:'책',programs:'프',finance:'₩',content:'글'}[key]}</i><span>${value.label}</span></button>`).join('');nav.querySelectorAll('[data-mobile-area]').forEach(button=>button.onclick=()=>navigate(AREAS[button.dataset.mobileArea].entry));
  }
  function sync(){
    const route=currentRoute(),area=routeArea.get(route)||'today';
    document.querySelectorAll('.workspace-main-nav [data-area]').forEach(button=>{if(button.dataset.area===area)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
    renderSubnav(area,route);rebuildMobile();
    document.querySelectorAll('.ux-mobile-nav [data-mobile-area]').forEach(button=>{if(button.dataset.mobileArea===area)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
    const group=$('#managementGroup');if(group)group.textContent=AREAS[area].label;
  }
  function syncConnection(){const source=$('#team-lanes-status'),label=$('#home-connection-label');if(!source||!label)return;label.textContent=source.textContent||'자료 확인 전';label.classList.toggle('bad',source.classList.contains('bad'))}
  function init(){
    if(initialized)return;initialized=true;
    const more=$('#personal-open-manage');if(more){more.hidden=true;more.setAttribute('aria-hidden','true')}
    const legacy=$('.personal-admin-menu');if(legacy){legacy.hidden=true;legacy.setAttribute('aria-hidden','true')}
    const summary=$('#home-connection-summary'),details=$('.dash-more');if(summary&&details){summary.onclick=()=>{details.open=!details.open;summary.setAttribute('aria-expanded',String(details.open));summary.querySelector('b').textContent=details.open?'세부 닫기':'자세히 보기';if(details.open)details.scrollIntoView({block:'start'})};details.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(details.open));summary.querySelector('b').textContent=details.open?'세부 닫기':'자세히 보기'})}
    const status=$('#team-lanes-status');if(status){observer=new MutationObserver(syncConnection);observer.observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});syncConnection()}
    document.querySelectorAll('.workspace-main-nav [data-area]').forEach(button=>button.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('planner:close-drawers'))));
    window.addEventListener('hashchange',()=>requestAnimationFrame(sync));document.addEventListener('click',event=>{if(event.target.closest('[data-nav-tab],[data-dash-tab],[data-management-tab]'))requestAnimationFrame(sync)});sync();
  }
  function deactivate(){const subnav=$('.workspace-area-subnav');if(subnav){subnav.replaceChildren();delete subnav.dataset.area}const label=$('#home-connection-label');if(label){label.textContent='자료 확인 전';label.classList.remove('bad')}const details=$('.dash-more');if(details)details.open=false;const summary=$('#home-connection-summary');if(summary){summary.setAttribute('aria-expanded','false');summary.querySelector('b').textContent='자세히 보기'}}
  return {init,activate:sync,deactivate,areas:()=>JSON.parse(JSON.stringify(AREAS))};
})();
window.AdminStructureUX.init();
