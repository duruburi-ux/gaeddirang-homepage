window.AdminAppleUX=(()=>{
  'use strict';
  const routes=[
    {tab:'home',label:'전체 현황',group:'오늘',description:'팀 운영과 확인 대기를 한눈에 봅니다.',icon:'현',keys:'오늘 팀 현황 대시보드'},
    {tab:'read',label:'개인·팀 일정',group:'오늘',description:'오늘 할 일과 서버 저장 상태를 확인합니다.',icon:'일',keys:'스케줄 일정 개인'},
    {tab:'finder',label:'매장 판매가능 찾기',group:'책·위탁',description:'도서명·ISBN·SKU로 근거를 찾습니다.',icon:'책',keys:'도서 책 재고 위탁 isbn sku'},
    {tab:'scm',label:'전체 상품 원장',group:'책·위탁',description:'장부·실물·채널 관측값을 구분합니다.',icon:'원',keys:'상품 재고 원장 scm 위탁'},
    {tab:'partners',label:'위탁 연락처',group:'책·위탁',description:'비공개 연락처 연결 상태를 확인합니다.',icon:'연',keys:'작가 출판사 연락처 작가의서재'},
    {tab:'publishing',label:'홈페이지 프로그램',group:'프로그램',description:'초안·검토·승인 payload를 분리합니다.',icon:'프',keys:'프로그램 검토 공개 홈페이지 초안'},
    {tab:'cohorts',label:'프로그램 원본',group:'프로그램',description:'기수·정원·접수 상태를 확인합니다.',icon:'기',keys:'기수 모집 신청'},
    {tab:'orders',label:'주문',group:'처리',description:'입금과 발송 준비를 확인합니다.',icon:'주',keys:'주문 입금 발송'},
    {tab:'apps',label:'수업 신청',group:'처리',description:'신청·입금·참석 상태를 확인합니다.',icon:'신',keys:'수업 신청 예약'},
    {tab:'inquiries',label:'기관 문의',group:'처리',description:'새 문의와 견적 연결을 확인합니다.',icon:'문',keys:'기관 문의 견적'},
    {tab:'work',label:'팀 업무',group:'업무',description:'Notion 원본의 진행·승인·막힘을 봅니다.',icon:'팀',keys:'팀 업무 노션 승인 막힘'},
    {tab:'finance',label:'재정 현황',group:'업무',description:'확정·입금·보관금을 분리해 봅니다.',icon:'재',keys:'재정 정산 입금'},
    {tab:'integration',label:'연결 현황',group:'연결',description:'마지막 성공과 실패·대기를 확인합니다.',icon:'연',keys:'연결 오류 실패 최신성'},
  ];
  let dialog,input,results,activeIndex=0,lastFocus=null,initialized=false;
  const normalize=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  const currentTab=()=>location.hash.slice(1)||'home';
  function go(tab){if(typeof window.switchTab==='function')window.switchTab(tab);else document.querySelector(`.tab[data-tab="${tab}"]`)?.click();close();syncNav()}
  function filtered(){const query=normalize(input?.value);if(!query)return routes;return routes.filter(route=>normalize([route.label,route.group,route.description,route.keys].join(' ')).includes(query))}
  function render(){const rows=filtered();activeIndex=Math.min(activeIndex,Math.max(0,rows.length-1));results.innerHTML=rows.length?rows.map((route,index)=>`<button type="button" class="ux-command-result" data-ux-command="${route.tab}" aria-selected="${index===activeIndex}"><i>${route.icon}</i><span><b>${route.label}</b><small>${route.description}</small></span><span>${route.group}</span></button>`).join(''):'<p class="ux-command-empty">찾는 화면이 없습니다. 다른 업무 이름으로 검색해 보세요.</p>';results.querySelectorAll('[data-ux-command]').forEach(button=>button.onclick=()=>go(button.dataset.uxCommand))}
  function open(query=''){if(!dialog||!document.querySelector('#appView:not(.hidden)'))return;lastFocus=document.activeElement;input.value=query;activeIndex=0;render();dialog.showModal();requestAnimationFrame(()=>input.focus())}
  function close(restoreFocus=true){if(dialog?.open)dialog.close();if(restoreFocus&&lastFocus?.isConnected&&!lastFocus.closest('#appView.hidden'))lastFocus.focus({preventScroll:true});lastFocus=null}
  function deactivate(){close(false);activeIndex=0;if(input)input.value='';if(results)render()}
  function move(step){const buttons=[...results.querySelectorAll('[data-ux-command]')];if(!buttons.length)return;activeIndex=(activeIndex+step+buttons.length)%buttons.length;buttons.forEach((button,index)=>button.setAttribute('aria-selected',String(index===activeIndex)));buttons[activeIndex].scrollIntoView({block:'nearest'})}
  function syncNav(){const tab=currentTab();document.querySelectorAll('[data-ux-route]').forEach(button=>{if(button.dataset.uxRoute===tab)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')})}
  function buildDialog(){
    dialog=document.createElement('dialog');dialog.className='ux-command';dialog.setAttribute('aria-label','화면과 업무 찾기');dialog.innerHTML='<div class="ux-command-head"><span aria-hidden="true">⌕</span><label class="sr-only" for="ux-command-input">화면과 업무 찾기</label><input id="ux-command-input" type="search" autocomplete="off" placeholder="화면이나 업무를 입력하세요"><button class="ux-command-close" type="button" aria-label="닫기">×</button></div><p class="ux-command-help"><span>↑↓ 이동</span><span>Enter 열기</span><span>Esc 닫기</span><span>⌘K 언제든 찾기</span></p><div class="ux-command-results" role="listbox"></div>';
    document.body.appendChild(dialog);input=dialog.querySelector('input');results=dialog.querySelector('.ux-command-results');input.oninput=()=>{activeIndex=0;render()};input.onkeydown=event=>{if(event.key==='ArrowDown'){event.preventDefault();move(1)}else if(event.key==='ArrowUp'){event.preventDefault();move(-1)}else if(event.key==='Enter'){event.preventDefault();results.querySelectorAll('[data-ux-command]')[activeIndex]?.click()}else if(event.key==='Escape'){event.preventDefault();close()}};dialog.querySelector('.ux-command-close').onclick=close;dialog.onclick=event=>{if(event.target===dialog)close()};dialog.addEventListener('cancel',event=>{event.preventDefault();close()});render();
  }
  function buildTriggers(){
    const foot=document.querySelector('.personal-plan-sidebar-foot');if(foot&&!foot.querySelector('.ux-command-trigger')){const button=document.createElement('button');button.type='button';button.className='ux-command-trigger';button.innerHTML='<span>화면·업무 찾기</span><kbd>⌘ K</kbd>';button.onclick=()=>open();foot.prepend(button)}
    const nav=document.createElement('nav');nav.className='ux-mobile-nav';nav.setAttribute('aria-label','핵심 화면');nav.innerHTML=[['home','⌂','현황'],['read','◷','일정'],['finder','⌕','책 찾기'],['publishing','◇','프로그램']].map(([tab,icon,label])=>`<button type="button" data-ux-route="${tab}"><i aria-hidden="true">${icon}</i><span>${label}</span></button>`).join('')+'<button type="button" data-ux-more><i aria-hidden="true">•••</i><span>더보기</span></button>';document.querySelector('#appView')?.appendChild(nav);nav.querySelectorAll('[data-ux-route]').forEach(button=>button.onclick=()=>go(button.dataset.uxRoute));nav.querySelector('[data-ux-more]').onclick=()=>open();
  }
  function init(){if(initialized)return;initialized=true;buildDialog();buildTriggers();syncNav();let prefix='';let prefixTimer=0;window.addEventListener('hashchange',syncNav);document.addEventListener('click',event=>{if(event.target.closest('[data-tab],[data-nav-tab],[data-dash-tab]'))requestAnimationFrame(syncNav)});document.addEventListener('keydown',event=>{const editable=event.target.matches?.('input,textarea,select,[contenteditable=true]');if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();dialog.open?close():open();return}if(event.key==='/'&&!editable&&!dialog.open){event.preventDefault();open();return}if(editable||dialog.open||event.metaKey||event.ctrlKey||event.altKey)return;const key=event.key.toLowerCase();if(key==='g'){prefix='g';clearTimeout(prefixTimer);prefixTimer=setTimeout(()=>prefix='',850);return}if(prefix==='g'){const map={h:'home',t:'read',b:'finder',p:'publishing'};prefix='';clearTimeout(prefixTimer);if(map[key]){event.preventDefault();go(map[key])}}});}
  return {init,open,close,deactivate};
})();
window.AdminAppleUX.init();
