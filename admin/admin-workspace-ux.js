window.AdminWorkspaceUX=(()=>{
  'use strict';
  const states=new Map(),transitions=[];
  let active='',transitionStarted=0,readyMs=null,suppressedRepeats=0,busyStarted=0,busyDurations=[],indicator=null,observer=null;
  const now=()=>performance.now();
  const visibleRoute=()=>[...document.querySelectorAll('[id^="tab-"]')].find(panel=>!panel.classList.contains('hidden'))?.id.slice(4)||'';
  function ensureIndicator(){
    if(indicator)return indicator;
    indicator=document.createElement('div');indicator.className='ux-load-status';indicator.setAttribute('role','status');indicator.setAttribute('aria-live','polite');indicator.hidden=true;document.body.appendChild(indicator);return indicator;
  }
  function syncBusy(){
    const main=document.querySelector('main'),busy=main?.getAttribute('aria-busy')==='true',node=ensureIndicator();
    if(busy&&!busyStarted)busyStarted=now();
    if(!busy&&busyStarted){busyDurations.push(Math.round((now()-busyStarted)*10)/10);busyDurations=busyDurations.slice(-12);busyStarted=0}
    node.hidden=!busy;node.textContent=busy?'자료를 확인하고 있습니다…':'';
  }
  function init(){
    active=visibleRoute()||location.hash.slice(1)||'home';syncBusy();const main=document.querySelector('main');if(main){observer=new MutationObserver(syncBusy);observer.observe(main,{attributes:true,attributeFilter:['aria-busy']})}
  }
  function beforeNavigate({from,to}={}){
    const current=from||active||visibleRoute();
    if(current&&current!==to){states.set(current,{scrollY:Math.max(0,Math.round(window.scrollY))});if(history.state?.tab===current)history.replaceState({...history.state,scrollY:Math.max(0,Math.round(window.scrollY))},'',location.href)}
    transitionStarted=now();
  }
  function afterNavigate({to,historyMode='push'}={}){
    active=to||visibleRoute()||'home';const saved=historyMode==='none'&&Number.isFinite(history.state?.scrollY)?history.state.scrollY:states.get(active)?.scrollY||0;
    requestAnimationFrame(()=>{window.scrollTo({top:Math.max(0,saved),left:0,behavior:'auto'});if(transitionStarted){transitions.push({route:active,durationMs:Math.round((now()-transitionStarted)*10)/10});transitions.splice(0,Math.max(0,transitions.length-20));transitionStarted=0}});
    return true;
  }
  function repeat(){suppressedRepeats++;return true}
  function markReady(){if(readyMs==null){readyMs=Math.round(now()*10)/10;performance.mark?.('gaeddirang-admin-ready')}}
  function deactivate(){states.clear();transitions.length=0;active='';transitionStarted=0;readyMs=null;suppressedRepeats=0;busyStarted=0;busyDurations=[];if(indicator){indicator.hidden=true;indicator.textContent=''}}
  function metrics(){return {readyMs,suppressedRepeats,routeTransitions:transitions.map(item=>({...item})),dataLoadDurationsMs:[...busyDurations],savedRoutes:[...states.keys()]}}
  init();
  return {beforeNavigate,afterNavigate,repeat,markReady,deactivate,metrics};
})();

