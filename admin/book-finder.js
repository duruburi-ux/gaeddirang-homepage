// Read-only counter lookup. Uses the existing authenticated scm-read function only.
window.BookFinder=(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector),all=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatTime=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'미등록';
  const display=value=>value==null||value===''?'미등록':String(value);
  const MAX_CACHE_AGE_MS=10*60*1000;
  let config,data=null,meta=null,busy=false,controller=null,generation=0,query='',filter='all',view='cards',lastFocus=null,lastSku='';

  function status(text,bad=false){const node=$('#book-finder-status');node.textContent=text;node.classList.toggle('bad',bad)}
  function cacheExpired(value){const checkedAt=Date.parse(value||'');return !Number.isFinite(checkedAt)||Date.now()-checkedAt>MAX_CACHE_AGE_MS}
  function hideUntrustedData(message){data=null;meta=null;$('#book-finder-content').hidden=true;$('#book-finder-results').replaceChildren();$('#book-finder-supplement').replaceChildren();$('#book-finder-summary').textContent='';status(message,true);$('#book-finder-retry').hidden=false}
  function closeDetail(){const dialog=$('#book-finder-detail');if(dialog?.open)dialog.close();const target=lastFocus?.isConnected?lastFocus:all('[data-book-sku]').find(button=>button.dataset.bookSku===lastSku);target?.focus?.();lastFocus=null;lastSku=''}
  function clear(){
    generation++;controller?.abort();controller=null;busy=false;data=null;meta=null;query='';filter='all';view='cards';
    $('#book-finder-query').value='';$('#book-finder-filter').value='all';$('#book-finder-content').hidden=true;$('#book-finder-results').replaceChildren();$('#book-finder-supplement').replaceChildren();
    $('#book-finder-summary').textContent='';$('#book-finder-refresh').disabled=false;$('#book-finder-retry').hidden=true;closeDetail();
    status('로그인한 관리자만 책 찾기를 볼 수 있습니다.');
  }

  function filteredResult(){
    const result=window.BookFinderModel.searchBooks({inventory:data?.inventory,counts:data?.counts,query,fetchedAt:meta?.fetchedAt});
    result.items=result.items.filter(row=>filter==='all'||(filter==='recorded'?Number.isInteger(row.recordedStock)&&row.recordedStock>0:filter==='zero'?row.recordedStock===0:filter==='conflict'?row.hasConflict:row.recordedStock==null||row.countAt==='미등록'));
    return result;
  }

  function resultCard(row){
    const warning=row.hasConflict?`<span class="finder-badge danger">${esc(row.conflicts.join(' · '))}</span>`:row.countAt==='미등록'?'<span class="finder-badge caution">실사 정보 미등록</span>':'<span class="finder-badge">실사 기록 있음</span>';
    return `<button type="button" class="finder-result ${view==='list'?'list':''}" data-book-sku="${esc(row.sku)}">
      <span class="finder-cover" aria-hidden="true"><span>표지<br>미등록</span></span>
      <span class="finder-result-copy"><span class="finder-title">${esc(row.title)}</span><span class="finder-author">${esc(row.author)}</span>
      <span class="finder-stock">시스템 ${esc(row.stockLabel)}</span><span class="finder-proof">최근 실사/등록 ${esc(row.countQuantity??'미등록')}권 · ${esc(row.countAt)}</span><span class="finder-proof">예약 제외 가용 수량 미등록</span><span class="finder-identifiers">ISBN ${esc(row.isbn)} · SKU ${esc(row.sku||'미등록')}</span>
      ${row.sameTitleCount>1?`<span class="finder-edition">동명 도서 ${row.sameTitleCount}개 · ISBN·SKU 확인</span>`:''}${warning}</span>
    </button>`;
  }

  function render(){
    if(!data)return;
    const result=filteredResult(),host=$('#book-finder-results');
    all('[data-finder-view]').forEach(button=>{const active=button.dataset.finderView===view;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active))});
    if(!query){
      host.innerHTML='<div class="finder-empty"><strong>손님이 물어본 제목·저자·ISBN을 검색하세요.</strong><p>검색 전에는 전체 목록을 펼치지 않습니다. ISBN은 하이픈과 공백을 빼고도 찾을 수 있어요.</p></div>';
      $('#book-finder-summary').textContent=`등록 도서 ${result.total}종 · 수량 충돌 ${result.conflictTotal}건 · 검색 결과를 재고 확답으로 사용하지 마세요.`;
      return;
    }
    if(!result.items.length){
      host.innerHTML=`<div class="finder-empty"><strong>‘${esc(query)}’와 일치하는 등록을 찾지 못했습니다.</strong><p>검색 결과 없음은 품절을 뜻하지 않습니다. 철자·ISBN·SCM 등록 여부를 확인하세요.</p><button type="button" id="book-finder-clear-empty">검색어 지우기</button></div>`;
      $('#book-finder-clear-empty').onclick=()=>{query='';$('#book-finder-query').value='';render();$('#book-finder-query').focus()};
    }else host.innerHTML=result.items.map(resultCard).join('');
    $('#book-finder-summary').textContent=`${result.exactIsbn?'정확한 ISBN 우선 · ':''}${result.items.length}종 표시 · 전체 도서 ${result.total}종 · 수량 충돌 ${result.conflictTotal}건`;
    all('[data-book-sku]').forEach(button=>button.onclick=()=>openDetail(button.dataset.bookSku,button));
  }

  function renderSupplement(){
    const rows=window.BookFinderModel.bookRows(data?.inventory||[],data?.counts||[],meta?.fetchedAt);
    const needs=rows.filter(row=>row.hasConflict||row.recordedStock==null||row.countAt==='미등록').length;
    $('#book-finder-supplement').innerHTML=[
      ['도서 장부',`${rows.length}종`,'SCM 읽기'],
      ['수량 확인 필요',`${needs}종`,'충돌·수량·실사 미확인'],
      ['예약·입고 예정','미등록','책별 원본 미연결'],
      ['YES24 구매 후보','미등록','구매 실행 없음'],
    ].map(([label,value,note])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
  }

  function detailRow(label,value,help=''){return `<div><dt>${esc(label)}</dt><dd>${esc(display(value))}${help?`<small>${esc(help)}</small>`:''}</dd></div>`}
  function openDetail(sku,button){
    const row=window.BookFinderModel.bookRows(data?.inventory||[],data?.counts||[],meta?.fetchedAt).find(item=>item.sku===sku);if(!row)return;
    lastFocus=button||document.activeElement;lastSku=sku;
    const conflict=row.hasConflict?`<div class="finder-detail-alert danger"><strong>수량 충돌</strong><p>${esc(row.conflicts.join(' · '))}. 손님에게 수량을 확답하지 말고 원본과 실물을 확인하세요.</p></div>`:'';
    $('#book-finder-detail-body').innerHTML=`<p class="finder-kicker">COUNTER LOOKUP / READ ONLY</p><h2>${esc(row.title)}</h2><p class="finder-detail-author">${esc(row.author)}</p>
      <div class="finder-detail-alert"><strong>${esc(row.stockLabel)}</strong><p>양수 기록이어도 매장·집·위탁 재고가 섞였을 수 있어 실물 ‘있음’을 보증하지 않습니다.</p></div>${conflict}
      <section><h3>도서 구분</h3><dl>${detailRow('ISBN',row.isbn)}${detailRow('SKU',row.sku)}${detailRow('판본',row.edition,'판본 열이 없어 ISBN과 SKU로 구분합니다.')}${detailRow('분류',row.category)}</dl></section>
      <section><h3>수량 기록</h3><dl>${detailRow('장부상 수량',row.recordedStock)}${detailRow('상품 마스터 수량',row.masterStock)}${detailRow('재고 소유 구분',row.owner)}${detailRow('예약 수량',row.reserved,'예약 원본이 연결되지 않았습니다.')}${detailRow('입고 예정',row.incoming,'입고 예정 원본이 연결되지 않았습니다.')}</dl></section>
      <section><h3>위치·실사</h3><dl>${detailRow('책장 위치',row.shelf,'위치 정보가 없으면 현장에서 확인합니다.')}${detailRow('실사 범위',row.countScope)}${detailRow('최근 실사/등록일',row.countAt)}${detailRow('최근 실사 수량',row.countQuantity)}</dl></section>
      <section><h3>채널·조회 시각</h3><dl>${detailRow('채널 수량',row.channelStock,'채널별 재고 조회가 연결되지 않았습니다.')}${detailRow('채널 조회 시각',row.channelCheckedAt)}${detailRow('SCM 조회 시각',formatTime(row.sourceCheckedAt))}</dl></section>
      ${row.note?`<p class="finder-note"><strong>운영 메모</strong><br>${esc(row.note)}</p>`:''}`;
    const dialog=$('#book-finder-detail');dialog.showModal();
    if(!history.state?.bookFinderDetail)history.pushState({...history.state,tab:'finder',bookFinderDetail:true},'',location.href);
    $('#book-finder-detail-close').focus();
  }

  function apply(next,nextMeta){
    if(!next||!Array.isArray(next.inventory)||!Array.isArray(next.counts))throw Error('INVALID_DATA');
    if(cacheExpired(nextMeta?.fetchedAt)){hideUntrustedData('SCM 확인본이 10분 넘게 갱신되지 않아 수량을 숨겼습니다. 재조회 후 안내해 주세요.');return}
    data=next;meta=nextMeta||{};$('#book-finder-content').hidden=false;$('#book-finder-retry').hidden=true;
    const result=window.BookFinderModel.searchBooks({inventory:data.inventory,counts:data.counts,query:'',fetchedAt:meta.fetchedAt});
    const stale=!!meta.stale||!meta.fetchedAt||Date.now()-Date.parse(meta.fetchedAt)>150000;
    status(`${stale?'최신 상태 확인 필요':'SCM 읽기 완료'} · ${result.total}종 · 수량 충돌 ${result.conflictTotal}건 · ${formatTime(meta.fetchedAt)}`,stale);
    renderSupplement();render();
  }

  async function refresh(){
    if(!config||busy||$('#appView').classList.contains('hidden'))return;
    busy=true;const run=++generation;controller=new AbortController();const active=controller;const timeout=setTimeout(()=>active.abort(),45000);
    $('#book-finder-refresh').disabled=true;$('#book-finder-retry').hidden=true;status('SCM 최신 장부를 확인하고 있어요.');
    try{
      const {data:auth,error}=await config.client.auth.getSession();if(error||!auth.session){clear();config.onDenied();return}
      const response=await fetch(config.url+'/functions/v1/scm-read',{method:'GET',headers:{Authorization:'Bearer '+auth.session.access_token,apikey:config.key},signal:active.signal,cache:'no-store'});
      if(run!==generation)return;
      if(response.status===401||response.status===403){clear();config.onDenied();return}
      const result=await response.json();if(!response.ok||!result.datasets)throw Error('SCM_READ_FAILED');apply(result.datasets,result.meta);
    }catch(error){
      if(run!==generation)return;
      if(data&&!cacheExpired(meta?.fetchedAt)){meta={...meta,stale:true};status('SCM 재조회에 실패해 10분 이내 이전 확인본을 표시합니다. 수량을 확답하지 마세요.',true);render()}
      else hideUntrustedData(data?'SCM 확인본이 10분 넘게 갱신되지 않아 수량을 숨겼습니다. 다시 확인해 주세요.':'SCM을 불러오지 못했습니다. 0권으로 판단하지 말고 다시 확인해 주세요.');
    }finally{clearTimeout(timeout);if(run===generation){busy=false;controller=null;$('#book-finder-refresh').disabled=false}}
  }

  function init(options){
    config=options;$('#book-finder-form').onsubmit=event=>{event.preventDefault();query=$('#book-finder-query').value.trim();render()};
    $('#book-finder-query').oninput=event=>{query=event.target.value.trim();render()};
    $('#book-finder-filter').onchange=event=>{filter=event.target.value;render()};
    $('#book-finder-refresh').onclick=refresh;$('#book-finder-retry').onclick=refresh;
    all('[data-finder-view]').forEach(button=>button.onclick=()=>{view=button.dataset.finderView;render()});
    $('#book-finder-detail-close').onclick=()=>{if(history.state?.bookFinderDetail)history.back();else closeDetail()};
    $('#book-finder-detail').addEventListener('cancel',event=>{event.preventDefault();if(history.state?.bookFinderDetail)history.back();else closeDetail()});
    window.addEventListener('popstate',event=>{if($('#book-finder-detail').open&&!event.state?.bookFinderDetail)closeDetail()});
    config.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='USER_UPDATED')clear()});
    setInterval(()=>{if(!document.hidden&&!$('#tab-finder').classList.contains('hidden'))refresh()},60000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#tab-finder').classList.contains('hidden'))refresh()});
    window.addEventListener('pagehide',clear);
  }

  function open(value=''){if(value){query=String(value).trim();$('#book-finder-query').value=query}refresh();render();requestAnimationFrame(()=>$('#book-finder-query').focus())}
  return {init,refresh,clear,open};
})();
