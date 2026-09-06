// Private SCM data is fetched only after authorization; never embedded or persisted.
window.SCM=(()=>{
  const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v==null?'미확인':v.toLocaleString('ko-KR')+'원';
  const norm=v=>String(v??'').replace(/\s/g,'').toLowerCase();
  const attention=x=>x.stock==null||x.stock<0||x.stock!==x.skuStock||x.status==='반품·재고 확인';
  let config,data=null,meta=null,busy=false,controller=null,generation=0,view='inventory',timer;
  function status(text,bad=false){$('#scm-status').textContent=text;$('#scm-status').classList.toggle('warn',bad)}
  function clear(){generation++;controller?.abort();controller=null;busy=false;data=null;meta=null;$('#scm-content').hidden=true;for(const id of ['scm-rows','scm-blind-cards','scm-metrics','scm-issues','scm-counts','scm-detail-body'])$('#'+id).replaceChildren();$('#scm-book').replaceChildren();$('#scm-price').textContent='';$('#scm-category').replaceChildren(new Option('전체 분류',''));$('#scm-detail').close();$('#scm-refresh').disabled=false;status('로그인한 관리자만 SCM을 볼 수 있습니다.')}
  function freshness(){if(!meta)return;const time=meta.fetchedAt?new Date(meta.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'없음';const age=meta.fetchedAt?Date.now()-Date.parse(meta.fetchedAt):Infinity;const stale=meta.stale||age>150000;status(`${stale?'최신 조회 미확인':'SCM 연결됨'} · 마지막 성공 ${time}${stale?' · 이전 확인본입니다.':' · 화면을 보는 동안 1분마다 확인'}`,stale);if(age>600000){$('#scm-content').hidden=true;data=null;$('#scm-detail').close()}}
  function setView(next){view=next;all('[data-scm-view]').forEach(b=>{b.classList.toggle('active',b.dataset.scmView===view);b.setAttribute('aria-pressed',String(b.dataset.scmView===view))});for(const key of ['inventory','blind','checks'])$('#scm-'+key).hidden=key!==view;render()}
  function detail(sku){const x=data?.inventory.find(x=>x.sku===sku);if(!x)return;const pairs=[['분류',x.category],['판매가',money(x.price)],['원가 / 정산 기준',money(x.cost)],['원본 장부',x.stock??'미확인'],['상품SKU마스터',x.skuStock??'미확인'],['소유',x.owner],['SKU',x.sku],['바코드',x.barcode]];$('#scm-detail-body').innerHTML=`<p class="scm-eyebrow">PRODUCT / READ ONLY</p><h2>${esc(x.name)}</h2><dl>${pairs.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><p class="scm-notice">장부값이며 실물 일치나 정산율 확정을 뜻하지 않습니다. 원가 미입력은 0원이 아닙니다.</p>`;$('#scm-detail').showModal()}
  function calc(){const value=$('#scm-book').value;$('#scm-price').textContent=value?money(Number(value)+3000):'도서 정가 미확인'}
  function render(){if(!data)return;
    const q=norm($('#scm-search').value),category=$('#scm-category').value,f=$('#scm-filter').value,sort=$('#scm-sort').value;
    const rows=data.inventory.filter(x=>(!q||norm(x.name+' '+x.sku+' '+x.barcode).includes(q))&&(!category||x.category===category)&&(!f||(f==='attention'?attention(x):f==='zero'?x.stock===0:x.stock>0&&!x.status.includes('반품'))));
    rows.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'ko'):(a[sort]??Infinity)-(b[sort]??Infinity));
    $('#scm-rows').innerHTML=rows.length?rows.map(x=>`<tr><td><button class="scm-name" data-scm-product="${esc(x.sku)}">${esc(x.name)}</button><span class="scm-sku">${esc(x.sku)}</span></td><td>${esc(x.category)}</td><td>${money(x.price)}</td><td>${x.stock??'—'}</td><td><span class="scm-tag ${attention(x)?'bad':''}">${esc(x.status)}</span>${x.stock!==x.skuStock?'<span class="scm-sku">마스터 불일치</span>':''}</td></tr>`).join(''):'<tr><td colspan="5" class="scm-empty">해당 상품이 없습니다.</td></tr>';
    $('#scm-result').textContent=`${rows.length}종 표시 / 전체 ${data.inventory.length}종 · 1~3개 보유는 재주문 권고가 아닙니다.`;
    all('[data-scm-product]').forEach(b=>b.onclick=()=>detail(b.dataset.scmProduct));
    const type=$('#scm-blind-type').value;const blinds=data.blind.filter(x=>!type||x.type===type);
    $('#scm-blind-cards').innerHTML=blinds.map(x=>`<article class="scm-card ${x.type==='감정'?'emotion':''}"><div class="scm-card-top"><span class="scm-eyebrow">${esc(x.type)} BLIND BOOK</span><h3>${esc(x.keyword)}</h3><span class="scm-tag">${x.stock==null?'수량 미확인':x.stock<0?'실사 필요':x.stock===0?'품절':'재고 '+x.stock}</span></div><div class="scm-card-bottom">담긴 책<br>${esc(x.book)}<strong>${money(x.price)}</strong><small>${money(x.base)} + 3,000원</small>${x.check?`<p class="scm-notice warn">${esc(x.check)}</p>`:''}</div></article>`).join('');
    $('#scm-issues').innerHTML=data.actions.length?data.actions.map(x=>`<div class="scm-issue"><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></div>`).join(''):'<p class="scm-note">자동 검사에서 추가 경고가 없습니다. 실물 검증 완료를 뜻하지는 않습니다.</p>';
    $('#scm-counts').innerHTML=data.counts.map(x=>`<div class="scm-issue"><strong>${esc(x.name)} · 현재 장부 ${x.current??'미확인'}</strong><p>${esc(x.scope)} · ${esc(x.date)} 실사/등록 ${x.count??'미확인'}</p></div>`).join('');calc();
  }
  function apply(next){
    if(!next||!['inventory','blind','counts','actions'].every(k=>Array.isArray(next[k])))throw Error('INVALID_DATA');data=next;
    const cat=$('#scm-category').value;$('#scm-category').replaceChildren(new Option('전체 분류',''));[...new Set(data.inventory.map(x=>x.category))].forEach(c=>$('#scm-category').add(new Option(c,c)));$('#scm-category').value=cat;
    const selected=$('#scm-book').value;$('#scm-book').replaceChildren();data.inventory.filter(x=>x.kind==='도서'&&x.price>0&&!x.status.includes('반품')).forEach(x=>$('#scm-book').add(new Option(x.name,x.price)));if([...$('#scm-book').options].some(x=>x.value===selected))$('#scm-book').value=selected;
    const cards=[['관리 상품',data.inventory.length,'inventory'],['확인 필요',data.inventory.filter(attention).length,'attention'],['블라인드북',data.blind.length,'blind'],['장부 경고',data.actions.length,'checks']];
    $('#scm-metrics').innerHTML=cards.map(([label,n,key])=>`<button class="scm-metric ${['attention','checks'].includes(key)&&n?'bad':''}" data-scm-metric="${key}"><span>${label}</span><strong>${n}</strong></button>`).join('');
    all('[data-scm-metric]').forEach(b=>b.onclick=()=>{const k=b.dataset.scmMetric;if(k==='attention'){$('#scm-filter').value='attention';$('#scm-search').value='';$('#scm-category').value='';setView('inventory')}else setView(k)});
    $('#scm-content').hidden=false;if($('#scm-detail').open)$('#scm-detail').close();render();
    window.dispatchEvent(new CustomEvent('scm:summary',{detail:{products:data.inventory.length,blind:data.blind.length,attention:data.inventory.filter(attention).length,warnings:data.actions.length,fetchedAt:meta?.fetchedAt,stale:!!meta?.stale}}));
  }
  async function refresh(){
    if(!config||busy||$('#appView').classList.contains('hidden'))return;
    busy=true;const run=generation;controller=new AbortController();const currentController=controller;const timeout=setTimeout(()=>currentController.abort(),45000);$('#scm-refresh').disabled=true;
    try{
      const {data:auth,error}=await config.client.auth.getSession();if(error||!auth.session){clear();config.onDenied();return}
      const res=await fetch(config.url+'/functions/v1/scm-read',{method:'GET',headers:{Authorization:'Bearer '+auth.session.access_token,apikey:config.key},signal:currentController.signal,cache:'no-store'});
      if(run!==generation)return;
      if(res.status===401||res.status===403){clear();config.onDenied();return}
      const result=await res.json();
      if(!res.ok&&!result.meta)throw Error('SERVICE_UNAVAILABLE');
      meta=result.meta;if(result.datasets)apply(result.datasets);else{$('#scm-content').hidden=true;data=null;$('#scm-detail').close()}
      freshness();
      if(meta?.error==='SOURCE_NOT_CONFIGURED')status('SCM 연결 설정 대기 · 홈페이지 서버에 Google 조회 계정 설정이 필요합니다.',true);
    }catch(e){if(run!==generation)return;if(meta){meta.stale=true;freshness()}else status('SCM을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.',true)}
    finally{clearTimeout(timeout);if(run===generation){busy=false;$('#scm-refresh').disabled=false;controller=null}}
  }
  function init(c){config=c;$('#scm-refresh').onclick=refresh;all('[data-scm-view]').forEach(b=>b.onclick=()=>setView(b.dataset.scmView));for(const id of ['scm-search','scm-category','scm-filter','scm-sort','scm-blind-type'])$('#'+id).addEventListener(id==='scm-search'?'input':'change',render);$('#scm-book').onchange=calc;$('#scm-detail-close').onclick=()=>$('#scm-detail').close();config.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='USER_UPDATED')clear()});timer=setInterval(()=>{if(!document.hidden&&!$('#tab-scm').classList.contains('hidden'))refresh()},60000);setInterval(freshness,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#tab-scm').classList.contains('hidden'))refresh()});window.addEventListener('pagehide',clear);}
  function open(target){if(target==='attention'){$('#scm-filter').value='attention';$('#scm-search').value='';$('#scm-category').value='';setView('inventory')}else if(['inventory','blind','checks'].includes(target))setView(target)}
  return {init,refresh,clear,open};
})();
