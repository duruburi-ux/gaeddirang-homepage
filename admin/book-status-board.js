window.BookStatusBoard=(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const time=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'미확인';
  let state=null,active='review';

  function status(text,bad=false){const node=$('#book-status-board-status');if(!node)return;node.textContent=text;node.classList.toggle('bad',bad)}
  function metric(key,value){return `<button type="button" data-book-status-filter="${esc(key)}"><span>${esc(value.label)}</span><strong>${value.count===null?'분류 미확인':`구조화 분류 ${value.count}종`}</strong></button>`}
  function card(row){return `<article class="book-status-row"><div><span>${esc(row.source)} · ${esc(row.isbn==='미확인'?'ISBN 미확인':row.isbn)}</span><strong>${esc(row.title)}</strong><p>${esc(row.basis)}</p></div><dl><div><dt>사용자 분류</dt><dd>${esc(row.decision)}${row.userDecisionAt?` · ${esc(time(row.userDecisionAt))}`:''}</dd></div><div><dt>채널 관측</dt><dd>${esc(row.observation.label)}</dd></div><div><dt>채널 확인 시각</dt><dd>${esc(time(row.observation.verifiedAt))}</dd></div><div><dt>다음 조치</dt><dd>${esc(row.nextAction)}</dd></div></dl></article>`}
  function render(){
    const host=$('#book-status-board-groups');if(!host||!state)return;
    $('#book-status-board-metrics').innerHTML=window.BookStatusBoardModel.CATEGORIES.map(({key})=>metric(key,state.metrics[key])).join('');
    $('#book-status-channel-metrics').innerHTML=state.channelMetrics?`<span>구조화 ${state.coveredItems}종의 최근 10분 채널 관측</span><b>판매 ${state.channelMetrics.selling}종</b><b>판매중지 ${state.channelMetrics.suspended}종</b><b>과거 관측 ${state.channelMetrics.historical}종</b><b>미확인 ${state.channelMetrics.unverified}종</b>`:'<span>최근 10분 채널 관측</span><b>구조화 범위 미확인</b>';
    host.innerHTML=window.BookStatusBoardModel.CATEGORIES.map(({key,label})=>{const rows=state.grouped[key],open=key===active?' open':'';return `<details class="book-status-group" data-book-status-group="${esc(key)}"${open}><summary><span>${esc(label)}</span><b>사용자 분류 ${rows.length}종</b></summary><div>${rows.length?rows.map(card).join(''):`<p class="book-status-empty">이 사용자 분류에 해당하는 구조화 행이 없습니다.</p>`}</div></details>`}).join('');
    document.querySelectorAll('[data-book-status-filter]').forEach(button=>button.onclick=()=>{active=button.dataset.bookStatusFilter;render();const group=$(`[data-book-status-group="${active}"]`);group?.scrollIntoView?.({block:'start',behavior:'smooth'});group?.querySelector('summary')?.focus?.()});
    const coverage=state.coverage==='complete'?`구조화 범위 ${state.coveredItems}/${state.totalItems}종`:state.coverage==='partial'?`일부 구조화 ${state.coveredItems}/${state.totalItems}종 · 미분류 ${state.unclassifiedItems}종`:`구조화 범위 없음 · 전체 장부 ${state.totalItems}종은 분류 미확인`;
    status(`${state.stale?'지난 조회 기록':'도서 원본 확인'} · 관리판 재조회 ${time(state.fetchedAt)} · ${coverage} · 전체 실사 완료 근거 없음`,state.stale||state.coverage!=='complete');
    $('#book-status-board-scope').textContent=`${state.scope}. 사용자 분류와 최근 10분 이내 채널 관측을 별도로 표시합니다.`;
  }
  function apply(payload){
    try{state=window.BookStatusBoardModel.build(payload);$('#book-status-board').hidden=false;render()}
    catch(error){fail('도서 범위가 이전 검증과 달라 현재 현황을 표시하지 않습니다. 원본 범위를 다시 확인해 주세요.')}
  }
  function fail(message='도서 원본 조회에 실패했습니다. 0종으로 판단하지 마세요.'){$('#book-status-board').hidden=false;state=null;$('#book-status-board-metrics').replaceChildren();$('#book-status-channel-metrics').replaceChildren();$('#book-status-board-groups').replaceChildren();$('#book-status-board-scope').textContent='전체 실사와 채널 상태를 확인하지 못했습니다.';status(message,true)}
  function clear(message='관리자 확인 후 도서 운영 현황을 표시합니다.'){$('#book-status-board').hidden=true;state=null;active='review';$('#book-status-board-metrics')?.replaceChildren();$('#book-status-channel-metrics')?.replaceChildren();$('#book-status-board-groups')?.replaceChildren();status(message,false)}
  return {apply,fail,clear};
})();
