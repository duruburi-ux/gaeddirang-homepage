(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const labels={connected:'자동 연결',manual:'수동 관리',setup_required:'준비 필요',attention:'확인 필요',disabled:'사용 안 함'};
  const modes={realtime:'실시간',scheduled:'주기 확인',manual:'사람이 입력',reference_only:'참고용'};
  const directions={inbound:'가져오기',outbound:'보내기',two_way:'양방향',reference_only:'참고만'};
  let client,onDenied,connectors=[],loaded=false,loading=false,stats={mappings:0,movements:0,issues:0,settlements:0};

  function counts(){
    return connectors.reduce((a,x)=>{a[x.status]=(a[x.status]||0)+1;return a},{connected:0,manual:0,setup_required:0,attention:0,disabled:0});
  }
  function emit(ok=true){
    const c=counts();window.dispatchEvent(new CustomEvent('integration:summary',{detail:{ok,connected:c.connected,manual:c.manual,setup:c.setup_required,attention:c.attention,fetchedAt:new Date().toISOString()}}));
  }
  function renderMetrics(){
    const c=counts();$('#integration-metrics').innerHTML=[['자동 연결',c.connected],['수동 관리',c.manual],['연결 준비 필요',c.setup_required],['확인 필요',c.attention]].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('');
  }
  function renderCards(){
    const filter=$('#integration-filter').value;
    const rows=connectors.filter(x=>!filter||x.status===filter);
    $('#integration-connectors').innerHTML=rows.map(x=>`<article class="integration-card"><div class="integration-card-head"><h3>${esc(x.name)}</h3><span class="integration-pill ${esc(x.status)}">${labels[x.status]||esc(x.status)}</span></div><p class="integration-purpose">${esc(x.purpose)}</p><div class="integration-facts"><div><small>반영 방식</small><b>${modes[x.sync_mode]||esc(x.sync_mode)}</b></div><div><small>데이터 방향</small><b>${directions[x.data_direction]||esc(x.data_direction)}</b></div></div><div class="integration-next"><small>다음 행동</small><p>${esc(x.next_action||'별도 작업 없음')}</p></div>${x.admin_url?`<a href="${esc(x.admin_url)}" target="_blank" rel="noopener noreferrer">원본·연결 안내 열기 ↗</a>`:''}</article>`).join('')||'<p class="integration-empty">이 상태에 해당하는 시스템이 없어요.</p>';
  }
  function renderLedger(){
    $('#integration-ledger-stats').className='integration-ledger-stats';
    $('#integration-ledger-stats').innerHTML=[['상품 연결표',stats.mappings],['입출고 기록',stats.movements],['열린 불일치',stats.issues],['정산 기록',stats.settlements]].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('');
  }
  async function refresh(force=false){
    if(loading||(!force&&loaded))return;
    loading=true;const button=$('#integration-refresh');button.disabled=true;button.textContent='확인 중…';
    try{
      const [co,ma,mv,is,se]=await Promise.all([
        client.from('integration_connectors').select('*').order('sort_order'),
        client.from('integration_product_mappings').select('*',{count:'exact',head:true}),
        client.from('integration_inventory_movements').select('*',{count:'exact',head:true}),
        client.from('integration_reconciliation_issues').select('*',{count:'exact',head:true}).in('status',['open','investigating']),
        client.from('integration_settlement_entries').select('*',{count:'exact',head:true})
      ]);
      if(co.error){if(co.error.code==='PGRST301'||co.error.message?.toLowerCase().includes('jwt'))onDenied?.();throw co.error}
      connectors=co.data||[];stats={mappings:ma.count||0,movements:mv.count||0,issues:is.count||0,settlements:se.count||0};loaded=true;
      renderMetrics();renderCards();renderLedger();$('#integration-content').hidden=false;
      const now=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});$('#integration-status').textContent=`통합 원장 정상 · ${now} 확인 · 자동 ${counts().connected}곳 / 사람 확인 ${counts().manual+counts().setup_required+counts().attention}곳`;$('#integration-status').classList.remove('bad');emit(true);
    }catch(error){$('#integration-status').textContent=`연결 현황을 불러오지 못했어요. ${error.message||''}`;$('#integration-status').classList.add('bad');emit(false)}finally{loading=false;button.disabled=false;button.textContent='지금 확인'}
  }
  function open(kind){
    const filter=$('#integration-filter');filter.value=kind==='connected'?'connected':'';renderCards();if(kind==='needs')$('#integration-connectors').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function clear(){connectors=[];loaded=false;stats={mappings:0,movements:0,issues:0,settlements:0};$('#integration-content').hidden=true}
  function init(options){client=options.client;onDenied=options.onDenied;$('#integration-refresh').onclick=()=>refresh(true);$('#integration-filter').onchange=renderCards}
  window.Integration={init,refresh,clear,open};
})();
