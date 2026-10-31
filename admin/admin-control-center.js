(function(){
  'use strict';
  const ROUTES=['home','read','work','finder','scm','orders','apps','cohorts','publishing','inquiries','finance','partners','members','alerts','operations','integration'];
  const state=new Map();let active='home',initialized=false;
  const $=selector=>document.querySelector(selector);
  const visibleRoute=()=>ROUTES.find(route=>!$(`#tab-${route}`)?.classList.contains('hidden'))||location.hash.slice(1)||'home';
  function fieldState(route){
    const panel=$(`#tab-${route}`);if(!panel)return[];
    return [...panel.querySelectorAll('input[type="search"],select')].filter(node=>node.id).map(node=>({id:node.id,value:node.value}));
  }
  function remember(route=active){state.set(route,{scrollY:window.scrollY,fields:fieldState(route)})}
  function restore(route){
    const saved=state.get(route);if(!saved)return;
    for(const item of saved.fields||[]){const node=document.getElementById(item.id);if(!node||node.value===item.value)continue;node.value=item.value;node.dispatchEvent(new Event(node.tagName==='SELECT'?'change':'input',{bubbles:true}))}
    requestAnimationFrame(()=>window.scrollTo({top:saved.scrollY||0,left:0,behavior:'auto'}));
  }
  function markRoute(expected){const visible=visibleRoute(),hashed=location.hash.slice(1);active=ROUTES.includes(expected)&&visible===expected?expected:visible;document.documentElement.dataset.adminRoute=active;document.querySelectorAll('[data-control-home]').forEach(button=>button.setAttribute('aria-current',active==='home'?'page':'false'));return {active,visible,hash:ROUTES.includes(hashed)?hashed:'home'}}
  function addHomeReturn(){
    document.querySelectorAll('#appView section[id^="tab-"]').forEach(panel=>{if(panel.id==='tab-home'||panel.querySelector(':scope > .control-home-return'))return;const button=document.createElement('button');button.type='button';button.className='control-home-return';button.dataset.controlHome='';button.textContent='오늘 할 일로 돌아가기';button.onclick=()=>window.switchTab?window.switchTab('home'):location.assign('#home');panel.prepend(button)});
  }
  function plainLanguage(){
    const replacements=new Map([['POSITION','현재 상태'],['PEOPLE','사람별 정산'],['ACTION / REVIEW','확인할 것'],['MONEYPIN / READ ONLY','거래 내역 · 조회만 가능'],['PROGRAM CONTENT','프로그램 운영'],['현재 연결 상태 · 로컬 검토 구현','아직 홈페이지 자동 반영 전'],['READ-ONLY SOURCES','연결된 자료 · 조회만 가능'],['PRODUCT LEDGER / READ ONLY','상품 원장 · 조회만 가능']]);
    document.querySelectorAll('p,span,strong,small').forEach(node=>{const value=node.childNodes.length===1&&node.firstChild?.nodeType===Node.TEXT_NODE?node.textContent.trim():'';if(replacements.has(value))node.textContent=replacements.get(value)});
  }
  function bind(){
    document.addEventListener('click',event=>{const nav=event.target.closest('[data-tab],[data-nav-tab],[data-dash-tab],[data-ux-route],[data-team-route]');if(nav)remember()});
    window.addEventListener('popstate',()=>requestAnimationFrame(()=>{markRoute();restore(active)}));
    window.addEventListener('hashchange',()=>requestAnimationFrame(()=>{markRoute();restore(active)}));
    document.addEventListener('keydown',event=>{active=visibleRoute();if(event.key==='Escape'&&active!=='home'&&!event.target.closest('dialog,[role="dialog"]')){event.preventDefault();window.switchTab?window.switchTab('home'):location.assign('#home')}});
  }
  function init(){if(initialized)return;initialized=true;addHomeReturn();plainLanguage();markRoute();bind()}
  function deactivate(){state.clear();active='home'}
  window.AdminControlCenter={init,deactivate,remember,restore,syncRoute:markRoute};
})();
