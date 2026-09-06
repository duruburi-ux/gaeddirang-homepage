// Private Notion work data is fetched only after authorization; never embedded or persisted.
window.Work=(()=>{
  const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFC').replace(/\s/g,'').toLowerCase();
  const KIND={rooms:'업무 영역',tasks:'실행 업무',projects:'프로젝트',decisions:'결정할 일'};
  let config,data=null,meta=null,busy=false,controller=null,generation=0;
  function status(text,bad=false){$('#work-status').textContent=text;$('#work-status').classList.toggle('warn',bad)}
  function clear(){generation++;controller?.abort();controller=null;busy=false;data=null;meta=null;$('#work-content').hidden=true;$('#work-list').replaceChildren();$('#work-metrics').replaceChildren();$('#work-result').textContent='';$('#work-refresh').disabled=false;status('로그인한 관리자만 진행 업무를 볼 수 있습니다.')}
  function when(value){if(!value)return'날짜 미입력';return new Date(value).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'})}
  function freshness(){if(!meta)return;const time=meta.fetchedAt?new Date(meta.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'없음';const age=meta.fetchedAt?Date.now()-Date.parse(meta.fetchedAt):Infinity;const stale=meta.stale||age>150000;status(`${stale?'최신 조회 미확인':'노션 연결됨'} · 마지막 성공 ${time}${stale?' · 이전 확인본입니다.':' · 화면을 보는 동안 1분마다 확인'}`,stale);if(age>600000){$('#work-content').hidden=true;data=null}}
  function matches(x,filter){if(filter==='all')return true;if(filter==='active')return !x.terminal;if(filter==='attention')return !x.terminal&&(x.attention||x.overdue);if(filter==='approval')return !x.terminal&&x.approval;if(filter==='blocked')return !x.terminal&&x.blocked;if(filter==='stale')return !x.terminal&&x.stale;return true}
  function render(){if(!data)return;
    const q=norm($('#work-search').value),kind=$('#work-kind').value,filter=$('#work-filter').value,sort=$('#work-sort').value;
    const rows=data.records.filter(x=>(!kind||x.kind===kind)&&matches(x,filter)&&(!q||norm([x.title,x.status,x.priority,x.owner,x.next].join(' ')).includes(q)));
    rows.sort((a,b)=>sort==='updated'?Date.parse(b.updated||0)-Date.parse(a.updated||0):sort==='due'?(Date.parse(a.due)||Infinity)-(Date.parse(b.due)||Infinity):Number(b.attention||b.overdue)-Number(a.attention||a.overdue)||Number(b.blocked)-Number(a.blocked)||Date.parse(b.updated||0)-Date.parse(a.updated||0));
    $('#work-result').textContent=`${rows.length}개 표시 · 총 ${data.records.length}개 기록`;
    $('#work-list').innerHTML=rows.length?rows.map(x=>`<article class="work-card ${x.attention||x.overdue?'attention':''} ${x.terminal?'done':''}" data-work-id="${esc(x.id)}"><div class="work-card-top"><span class="work-kind">${esc(KIND[x.kind]||x.kind)}</span><div class="work-tags"><span class="work-tag status">${esc(x.status)}</span>${x.priority?`<span class="work-tag">${esc(x.priority)}</span>`:''}${x.overdue?'<span class="work-tag danger">기한 지남</span>':''}${x.stale?'<span class="work-tag old">오래됨</span>':''}</div></div><h2>${esc(x.title)}</h2><dl>${x.owner?`<div><dt>${x.kind==='rooms'?'최근 기록':'담당'}</dt><dd>${esc(x.owner)}</dd></div>`:''}${x.next?`<div><dt>다음 행동</dt><dd>${esc(x.next)}</dd></div>`:''}<div><dt>날짜</dt><dd>${x.due?'기한 '+when(x.due)+' · ':''}수정 ${when(x.updated)}</dd></div></dl>${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">노션 원본 열기 →</a>`:''}</article>`).join(''):'<div class="work-empty">조건에 맞는 업무가 없어요.</div>';
  }
  function apply(next){
    if(!next||!Array.isArray(next.records)||!Array.isArray(next.coverage)||!next.summary)throw Error('INVALID_DATA');data=next;
    const s=data.summary,cards=[['진행 업무',s.active,'active'],['확인할 것',s.attention,'attention'],['승인할 것',s.approvals,'approval'],['막힌 것',s.blocked,'blocked'],['오래된 기록',s.stale,'stale']];
    $('#work-metrics').innerHTML=cards.map(([label,n,key])=>`<button class="work-metric ${['attention','approval','blocked'].includes(key)&&n?'bad':''}" data-work-metric="${key}"><span>${label}</span><strong>${n}</strong></button>`).join('');
    all('[data-work-metric]').forEach(b=>b.onclick=()=>{$('#work-filter').value=b.dataset.workMetric==='active'?'active':b.dataset.workMetric;render()});
    $('#work-content').hidden=false;render();
    const preview=data.records.filter(x=>!x.terminal).slice(0,4).map(x=>({id:x.id,title:x.title,status:x.status,kindLabel:KIND[x.kind]||x.kind,stale:x.stale}));
    window.dispatchEvent(new CustomEvent('work:summary',{detail:{...s,preview,fetchedAt:meta?.fetchedAt,stale:!!meta?.stale}}));
  }
  async function refresh(){
    if(!config||busy||$('#appView').classList.contains('hidden'))return;
    busy=true;const run=generation;controller=new AbortController();const current=controller;const timeout=setTimeout(()=>current.abort(),45000);$('#work-refresh').disabled=true;
    try{
      const {data:auth,error}=await config.client.auth.getSession();if(error||!auth.session){clear();config.onDenied();return}
      const res=await fetch(config.url+'/functions/v1/work-read',{method:'GET',headers:{Authorization:'Bearer '+auth.session.access_token,apikey:config.key},signal:current.signal,cache:'no-store'});
      if(run!==generation)return;if(res.status===401||res.status===403){clear();config.onDenied();return}
      const result=await res.json();if(!res.ok&&!result.meta)throw Error('SERVICE_UNAVAILABLE');meta=result.meta;if(result.work)apply(result.work);else{$('#work-content').hidden=true;data=null}freshness();
      if(meta?.error==='SOURCE_NOT_CONFIGURED')status('노션 연결 설정 대기 · 읽기 전용 연결키와 원본 권한이 필요합니다.',true);
      if(meta?.error==='SOURCE_ACCESS_DENIED')status('노션 권한 확인 필요 · 연결된 원본 범위를 확인해 주세요.',true);
    }catch(e){
      if(run!==generation)return;
      if(meta){meta.stale=true;freshness()}
      else{
        const code=String(e?.message||e?.name||'UNKNOWN').replace(/[^A-Z0-9_ -]/gi,'').slice(0,40);
        status(`진행 업무를 불러오지 못했습니다. 다시 확인해 주세요. · ${code}`,true);
      }
    }
    finally{clearTimeout(timeout);if(run===generation){busy=false;$('#work-refresh').disabled=false;controller=null}}
  }
  function open(target){$('#work-search').value='';$('#work-kind').value='';$('#work-filter').value=target==='active'?'active':target;render()}
  function focus(id){if(!data)return;$('#work-search').value='';$('#work-kind').value='';$('#work-filter').value='all';render();const card=all('[data-work-id]').find(x=>x.dataset.workId===id);card?.scrollIntoView({behavior:'smooth',block:'center'});card?.classList.add('focus');setTimeout(()=>card?.classList.remove('focus'),1800)}
  function init(c){config=c;$('#work-refresh').onclick=refresh;for(const id of ['work-search','work-kind','work-filter','work-sort'])$('#'+id).addEventListener(id==='work-search'?'input':'change',render);config.client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'||event==='USER_UPDATED')clear()});setInterval(()=>{if(!document.hidden&&!$('#tab-work').classList.contains('hidden'))refresh()},60000);setInterval(freshness,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#tab-work').classList.contains('hidden'))refresh()});window.addEventListener('pagehide',clear)}
  return {init,refresh,clear,open,focus};
})();
