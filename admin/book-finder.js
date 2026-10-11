// Read-only counter lookup. Uses the existing authenticated scm-read function only.
window.BookFinder=(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector),all=selector=>[...document.querySelectorAll(selector)];
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const formatTime=value=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'미등록';
  const display=value=>value==null||value===''?'미등록':String(value);
  const money=value=>Number.isSafeInteger(value)?value.toLocaleString('ko-KR')+'원':'미등록';
  const FRESH_AGE_MS=10*60*1000,HISTORY_AGE_MS=36*60*60*1000;
  let config,data=null,meta=null,busy=false,controller=null,generation=0,query='',filter='all',view='cards',lastFocus=null,lastSku='';

  function status(text,bad=false){const node=$('#book-finder-status');node.textContent=text;node.classList.toggle('bad',bad)}
  function freshnessState(value){const checkedAt=Date.parse(value||'');if(!Number.isFinite(checkedAt))return 'missing';const age=Date.now()-checkedAt;return age>HISTORY_AGE_MS?'expired':age>FRESH_AGE_MS?'historical':'fresh'}
  function hideUntrustedData(message){data=null;meta=null;$('#book-finder-content').hidden=true;$('#book-finder-results').replaceChildren();$('#book-finder-supplement').replaceChildren();$('#book-finder-summary').textContent='';status(message,true);$('#book-finder-retry').hidden=false}
  function closeDetail(){const dialog=$('#book-finder-detail');if(dialog?.open)dialog.close();const target=lastFocus?.isConnected?lastFocus:all('[data-book-sku]').find(button=>button.dataset.bookSku===lastSku);target?.focus?.();lastFocus=null;lastSku=''}
  function clear(){
    generation++;controller?.abort();controller=null;busy=false;data=null;meta=null;query='';filter='all';view='cards';
    $('#book-finder-query').value='';$('#book-finder-filter').value='all';$('#book-finder-content').hidden=true;$('#book-finder-results').replaceChildren();$('#book-finder-supplement').replaceChildren();
    $('#book-finder-summary').textContent='';$('#book-finder-refresh').disabled=false;$('#book-finder-retry').hidden=true;closeDetail();
    status('로그인한 관리자만 책 찾기를 볼 수 있습니다.');
  }

  function filteredResult(){
    const result=window.BookFinderModel.searchBooks({inventory:data?.inventory,counts:data?.counts,bookshop:data?.bookshop,query,fetchedAt:meta?.fetchedAt});
    result.items=result.items.filter(row=>filter==='all'||(filter==='recorded'?Number.isInteger(row.recordedStock)&&row.recordedStock>0:filter==='zero'?row.recordedStock===0:filter==='conflict'?row.hasConflict:row.sellableConfirmed==null));
    return result;
  }

  function resultCard(row){
    const warning=row.hasConflict?`<span class="finder-badge danger">${esc(row.conflicts.join(' · '))}</span>`:row.hasPhysicalEvidence?'<span class="finder-badge">매장 실사 근거 확인</span>':'<span class="finder-badge caution">판매 가능 확인 필요</span>';
    const facts=[['예약',row.reserved],['입고 예정',row.incoming],['YES24 후보',row.purchaseCandidate]].filter(([,value])=>Number.isInteger(value)&&value>0).map(([label,value])=>`<span>${esc(label)} ${value}권</span>`).join('');
    const cover=row.coverUrl?`<img src="${esc(row.coverUrl)}" alt="" loading="lazy">`:'<span>표지<br>미등록</span>';
    return `<button type="button" class="finder-result ${view==='list'?'list':''}" data-book-sku="${esc(row.sku)}">
      <span class="finder-cover" aria-hidden="true">${cover}</span>
      <span class="finder-result-copy"><span class="finder-title">${esc(row.title)}</span><span class="finder-author">${esc(row.author)}</span>
      <span class="finder-stock">${esc(row.sellableLabel)}</span><span class="finder-proof">시스템 장부 ${esc(row.recordedStock??'미확인')}권 · 예약 차감 ${esc(row.calculatedAvailable??'미확인')}권</span>${facts?`<span class="finder-facts">${facts}</span>`:''}<span class="finder-identifiers">ISBN ${esc(row.isbn)} · SKU ${esc(row.sku||'미등록')}</span>
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
    const rows=window.BookFinderModel.bookRows(data?.inventory||[],data?.counts||[],meta?.fetchedAt,data?.bookshop);
    const needs=rows.filter(row=>row.hasConflict||!row.hasPhysicalEvidence).length;
    const summary=data?.bookshop?.summary,sourceMeta=meta?.bookshop;
    const sourceNote=summary?(sourceMeta?.stale?'지난 조회 기록':'통합 재고 원본'):(sourceMeta?.error==='BOOKSHOP_SOURCE_NOT_CONFIGURED'?'비공개 원본 설정 대기':'원본 조회 필요');
    const ledgerValue=summary?`${summary.sourceItems}종${Number.isInteger(summary.ledgerQuantity)?` · ${summary.ledgerQuantity.toLocaleString('ko-KR')}권`:''}`:`${rows.length}종`;
    $('#book-finder-supplement').innerHTML=[
      ['시스템 장부',ledgerValue,summary?`${sourceMeta?.stale?'지난 조회 기록 · ':''}매장 실물 합계 아님`:sourceNote],
      ['예약 근거',summary?`${summary.reservations.titles}종 · ${summary.reservations.quantity}권`:'미등록',summary?'예약은 판매 가능 계산에서만 차감':'수량 확인 필요 '+needs+'종'],
      ['입고 예정',summary?`${summary.pendingInbound.titles}종 · ${summary.pendingInbound.quantity}권`:'미등록',summary?'실입고 전 재고 미반영':'원본 조회 필요'],
      ['YES24 구매 후보',summary?`${summary.purchase.titles}종 · ${summary.purchase.quantity}권`:'미등록',summary?`공급가 합계 ${money(summary.purchase.supplyTotal)} · 구매 미실행`:'구매 실행 없음'],
    ].map(([label,value,note])=>`<div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
  }

  function detailRow(label,value,help=''){return `<div><dt>${esc(label)}</dt><dd>${esc(display(value))}${help?`<small>${esc(help)}</small>`:''}</dd></div>`}
  function openDetail(sku,button){
    const row=window.BookFinderModel.bookRows(data?.inventory||[],data?.counts||[],meta?.fetchedAt,data?.bookshop).find(item=>item.sku===sku);if(!row)return;
    lastFocus=button||document.activeElement;lastSku=sku;
    const conflict=row.hasConflict?`<div class="finder-detail-alert danger"><strong>수량 충돌</strong><p>${esc(row.conflicts.join(' · '))}. 손님에게 수량을 확답하지 말고 원본과 실물을 확인하세요.</p></div>`:'';
    $('#book-finder-detail-body').innerHTML=`<p class="finder-kicker">COUNTER LOOKUP / READ ONLY</p><h2>${esc(row.title)}</h2><p class="finder-detail-author">${esc(row.author)}</p>
      <div class="finder-detail-alert"><strong>${esc(row.sellableLabel)}</strong><p>${row.hasPhysicalEvidence?'매장 실물수량·실사 상태·근거가 함께 확인된 값입니다.':'실물 근거가 없으면 기록값이 0이어도 판매 가능 수량으로 확정하지 않습니다.'}</p></div>${conflict}
      <section><h3>도서 구분</h3><dl>${detailRow('ISBN',row.isbn)}${detailRow('SKU',row.sku)}${detailRow('판본',row.edition,'판본 열이 없어 ISBN과 SKU로 구분합니다.')}${detailRow('분류',row.category)}</dl></section>
      <section><h3>수량 기록</h3><dl>${detailRow('SCM 장부상 수량',row.recordedStock)}${detailRow('상품 마스터 수량',row.masterStock)}${detailRow('예약 수량',row.reserved,row.bookshopLinked?'통합 재고 원본의 기록 예약':'원본 미연결')}${detailRow('예약 차감 계산',row.calculatedAvailable,'SCM 대조수량−예약이며 실물 판매 가능 확정값이 아닙니다.')}${detailRow('입고 예정',row.incoming,'실입고 전에는 판매 재고에 포함하지 않습니다.')}${detailRow('YES24 구매 후보',row.purchaseCandidate,'장바구니 후보이며 주문·입고 완료가 아닙니다.')}</dl></section>
      <section><h3>매장·채널</h3><dl>${detailRow('판매 가능 확정값',row.sellableConfirmed,'매장 실사로 확정되지 않았다면 미등록을 유지합니다.')}${detailRow('매장 실물수량',row.physicalCount)}${detailRow('매장 실사 상태',row.physicalCheck)}${detailRow('PayHere 수량',row.payhereCount,'책공방 실물 기준 채널 기록')}${detailRow('SmartStore 연결 수량',row.smartstoreCount,'책공방에서 즉시 발송 가능한 채널 기록')}${detailRow('SmartStore 매핑 후보',row.smartstoreCandidateCount,'연결 확정 전에는 채널 수량으로 합산하지 않습니다.')}</dl></section>
      <section><h3>위치·조회 시각</h3><dl>${detailRow('책장 위치',row.shelf,'위치 정보가 없으면 현장에서 확인합니다.')}${detailRow('실사 범위',row.countScope)}${detailRow('최근 실사/등록일',row.countAt)}${detailRow('최근 실사 수량',row.countQuantity)}${detailRow('SCM 조회 시각',formatTime(row.sourceCheckedAt))}${detailRow('통합 재고 조회 시각',formatTime(meta?.bookshop?.fetchedAt))}</dl></section>
      ${row.review||row.scopeNote?`<p class="finder-note"><strong>통합 재고 확인 사항</strong><br>${esc([row.review,row.scopeNote].filter(Boolean).join(' · '))}</p>`:''}
      ${row.note?`<p class="finder-note"><strong>운영 메모</strong><br>${esc(row.note)}</p>`:''}`;
    const dialog=$('#book-finder-detail');dialog.showModal();
    if(!history.state?.bookFinderDetail)history.pushState({...history.state,tab:'finder',bookFinderDetail:true},'',location.href);
    $('#book-finder-detail-close').focus();
  }

  function apply(next,nextMeta){
    if(!next||!Array.isArray(next.inventory)||!Array.isArray(next.counts))throw Error('INVALID_DATA');
    if(freshnessState(nextMeta?.fetchedAt)==='expired'){hideUntrustedData('SCM 마지막 성공 기록이 36시간을 넘어 수량을 숨겼습니다. 재조회 후 안내해 주세요.');return}
    if(!next.bookshop&&data?.bookshop&&freshnessState(meta?.bookshop?.fetchedAt)!=='expired'){
      next={...next,bookshop:data.bookshop};nextMeta={...nextMeta,bookshop:{...meta.bookshop,stale:true,error:nextMeta?.bookshop?.error||'BOOKSHOP_SOURCE_READ_FAILED'}};
    }
    data=next;meta=nextMeta||{};$('#book-finder-content').hidden=false;$('#book-finder-retry').hidden=true;
    const result=window.BookFinderModel.searchBooks({inventory:data.inventory,counts:data.counts,bookshop:data.bookshop,query:'',fetchedAt:meta.fetchedAt});
    const historical=!!meta.stale||freshnessState(meta.fetchedAt)!=='fresh';
    status(`${historical?'지난 조회 기록':'SCM 읽기 완료'} · ${result.total}종 · 수량 충돌 ${result.conflictTotal}건 · ${formatTime(meta.fetchedAt)}${historical?' · 실물 재고 확정 아님':''}`,historical);
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
      if(data&&freshnessState(meta?.fetchedAt)!=='expired'){meta={...meta,stale:true};status('SCM 재조회에 실패해 지난 조회 기록을 표시합니다. 실물 수량을 확답하지 마세요.',true);renderSupplement();render()}
      else hideUntrustedData(data?'SCM 마지막 성공 기록이 36시간을 넘어 수량을 숨겼습니다. 다시 확인해 주세요.':'SCM을 불러오지 못했습니다. 0권으로 판단하지 말고 다시 확인해 주세요.');
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
