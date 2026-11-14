// Private Notion work data is fetched only after authorization; never embedded or persisted.
window.Work=(()=>{
  const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=v=>String(v??'').normalize('NFC').replace(/\s/g,'').toLowerCase();
  const KIND={rooms:'업무 영역',tasks:'실행 업무',projects:'프로젝트',decisions:'결정할 일'};
  let config,data=null,meta=null,busy=false,controller=null,generation=0,dataContext=null,readContext=null,sessionUserId='',readNotice=null;
  const sameContext=(left,right)=>Boolean(left&&right&&left.userId&&left.userId===right.userId&&Number.isSafeInteger(left.generation)&&left.generation===right.generation);
  function context(){const value=config?.getContext?.();return value&&value.userId&&Number.isSafeInteger(Number(value.generation))?{userId:String(value.userId),generation:Number(value.generation)}:null}
  function isCurrent(run,owner,userId=''){return run===generation&&(typeof config?.getContext!=='function'||sameContext(owner,context()))&&(!userId||(!sessionUserId||sessionUserId===userId)&&owner?.userId===userId)}
  function ownsData(){return Boolean(dataContext&&(typeof config?.getContext==='function'?sameContext(dataContext,context()):dataContext.generation===generation)&&(!sessionUserId||dataContext.userId===sessionUserId))}
  function ownsRead(){return Boolean(readContext&&(typeof config?.getContext==='function'?sameContext(readContext,context()):readContext.generation===generation)&&(!sessionUserId||readContext.userId===sessionUserId))}
  function status(text,bad=false){$('#work-status').textContent=text;$('#work-status').classList.toggle('warn',bad)}
  const unknownTaskMetadata=()=>({identity:{state:'unavailable',label:'원본 신원 메타 미제공',id:null},relation:{state:'unavailable',label:'관계 메타 미제공',reason:null},observation:{state:'unknown',label:'원래 관측시각 미확인',value:null}});
  const unknownReadMetadata=()=>({state:'unavailable',label:'서버 조회 정보 확인 필요',attempt:{state:'missing',value:null},success:{state:'missing',value:null},errorLabel:''});
  const hasReadMetadata=value=>Boolean(value&&['read','observation'].some(key=>Object.hasOwn(value,key)));
  function readMetadata(stale=meta?.stale===true){try{return window.ReadMetadataModel?.read?.({...meta,stale},{now:Date.now()})||unknownReadMetadata()}catch{return unknownReadMetadata()}}
  function metadataTime(value){
    if(value?.state!=='known'||typeof value.value!=='string')return {missing:'시각 미제공',invalid:'시각 형식 확인 필요',future:'미래 시각 · 확인 필요'}[value?.state]||'시각 미확인';
    const stamp=Date.parse(value.value);if(!Number.isFinite(stamp)||stamp>Date.now())return '시각 확인 필요';
    return `<time datetime="${esc(value.value)}">${esc(new Date(stamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}))}</time>`;
  }
  function taskMetadata(record,duplicate){
    try{return window.ReadMetadataModel?.task?.(record,{sourceKey:'work.'+record.kind,id:record.id,relationKey:'teamReference',duplicate,now:Date.now()})||unknownTaskMetadata()}catch{return unknownTaskMetadata()}
  }
  function duplicateRecordIds(){
    const counts=new Map();
    for(const record of data.records){const id=window.ReadMetadataModel?.canonicalId?.(record.id);if(id){const key=record.kind+':'+id;counts.set(key,(counts.get(key)||0)+1)}}
    return record=>{const id=window.ReadMetadataModel?.canonicalId?.(record.id);return Boolean(id&&counts.get(record.kind+':'+id)>1)};
  }
  function sourceMetadata(record,duplicate){
    const value=taskMetadata(record,duplicate),identity=value.identity||unknownTaskMetadata().identity,relation=value.relation||unknownTaskMetadata().relation,observation=value.observation||unknownTaskMetadata().observation;
    return `<details class="work-read-metadata work-source-metadata"><summary>원천·관계 확인</summary><div class="work-read-metadata-body"><dl><div><dt>원본 신원</dt><dd>${esc(identity.label)}${identity.state==='identified'&&identity.id?`<small>원본 ID ${esc(identity.id)}</small>`:''}</dd></div><div><dt>팀 원천 관계</dt><dd>${esc(relation.label)}</dd></div><div><dt>원천 관측</dt><dd>${esc(observation.label)}${observation.state==='known'?` · ${metadataTime(observation)}`:''}</dd></div><div><dt>원천 저장</dt><dd>시각 미제공</dd></div></dl><p>서버 조회 성공, 원천 관측, 업무 완료는 각각 별도 정보입니다.</p></div></details>`;
  }
  function renderReadMetadata(){
    if(!meta){if(readNotice){readNotice.hidden=true;readNotice.replaceChildren()}return}
    if(!readNotice){const notice=$('#work-status');if(!notice?.insertAdjacentHTML)return;notice.insertAdjacentHTML('afterend','<details id="work-read-metadata" class="work-read-metadata work-server-metadata"></details>');readNotice=$('#work-read-metadata')}
    const stale=window.WorkDashboardSnapshotModel?.freshness(meta,Date.now())?.stale??meta.stale===true;
    const value=readMetadata(stale);readNotice.hidden=false;
    readNotice.innerHTML=`<summary>서버 조회 확인 · ${esc(value.label)}</summary><div class="work-read-metadata-body"><dl><div><dt>서버 마지막 성공</dt><dd>${metadataTime(value.success)}</dd></div><div><dt>서버 조회 시도</dt><dd>${metadataTime(value.attempt)}</dd></div></dl>${value.errorLabel?`<p class="work-read-error">${esc(value.errorLabel)}</p>`:''}<p>서버 조회 시각은 원천 수집·관측 시각이나 업무 완료 시각이 아닙니다. 원천 관측 정보는 각 업무에서 확인해 주세요.</p></div>`;
  }
  const descriptor=x=>({id:String(x.id||''),title:String(x.title||''),kindLabel:KIND[x.kind]||String(x.kind||''),updatedAt:String(x.updated||''),url:String(x.url||'')});
  function emitSummary(stale=true){
    if(data&&!ownsData()||meta&&!ownsRead())return;
    const emittingData=data,emittingMeta=meta,run=generation,owner=data?dataContext:meta?readContext:context()||{userId:sessionUserId,generation},identity={userId:String(owner.userId||''),generation:Number(owner.generation)},s=data?.summary||{},active=(data?.records||[]).filter(x=>!x.terminal),preview=active.slice(0,4).map(x=>({...descriptor(x),status:x.status,stale:x.stale}));
    const mayEmit=()=>run===generation&&(typeof config?.getContext!=='function'||sameContext(owner,context()))&&(emittingData?data===emittingData&&sameContext(owner,dataContext)&&ownsData():emittingMeta?!data&&meta===emittingMeta&&sameContext(owner,readContext)&&ownsRead():!data&&!meta);
    if(!mayEmit())return;
    window.dispatchEvent(new CustomEvent('work:summary',{detail:{...s,preview,fetchedAt:meta?.fetchedAt,stale,...identity}}));
    if(!mayEmit())return;
    window.dispatchEvent(new CustomEvent('work:sources',{detail:{sources:active.map(descriptor),fetchedAt:meta?.fetchedAt,stale,...identity}}));
    if(!mayEmit())return;
    const snapshot=window.WorkDashboardSnapshotModel?.build(data,meta?{...meta,stale}:meta);
    window.dispatchEvent(new CustomEvent('work:dashboard-snapshot',{detail:{...identity,snapshot,readMetadata:hasReadMetadata(meta)?readMetadata(stale):null}}));
  }
  function clear(){generation++;controller?.abort();controller=null;busy=false;data=null;meta=null;dataContext=null;readContext=null;renderReadMetadata();$('#work-content').hidden=true;$('#work-list').replaceChildren();$('#work-metrics').replaceChildren();$('#work-result').textContent='';$('#work-refresh').disabled=false;status('로그인한 관리자만 진행 업무를 볼 수 있습니다.');emitSummary(true)}
  function when(value){if(!value)return'날짜 미입력';return new Date(value).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'})}
  function freshness(){if(!meta)return;if(data&&!ownsData()||!ownsRead()){clear();return}const time=meta.fetchedAt?new Date(meta.fetchedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false}):'없음',fresh=window.WorkDashboardSnapshotModel?.freshness(meta,Date.now())||{stale:true,expired:true};status(`${fresh.stale?'최신 조회 미확인':'노션 연결됨'} · 마지막 성공 ${time}${fresh.stale?' · 이전 확인본입니다.':' · 화면을 보는 동안 1분마다 확인'}`,fresh.stale);if(fresh.expired){$('#work-content').hidden=true;data=null;dataContext=null;if(!hasReadMetadata(meta)){meta=null;readContext=null}}renderReadMetadata();emitSummary(fresh.stale)}
  function matches(x,filter){if(filter==='all')return true;if(filter==='active')return !x.terminal;if(filter==='attention')return !x.terminal&&(x.attention||x.overdue);if(filter==='approval')return !x.terminal&&x.approval;if(filter==='blocked')return !x.terminal&&x.blocked;if(filter==='stale')return !x.terminal&&x.stale;return true}
  function render(){if(!data||!ownsData())return;
    renderReadMetadata();const duplicate=duplicateRecordIds();
    const q=norm($('#work-search').value),kind=$('#work-kind').value,filter=$('#work-filter').value,sort=$('#work-sort').value;
    const rows=data.records.filter(x=>(!kind||x.kind===kind)&&matches(x,filter)&&(!q||norm([x.title,x.status,x.priority,x.owner,x.next].join(' ')).includes(q)));
    rows.sort((a,b)=>sort==='updated'?Date.parse(b.updated||0)-Date.parse(a.updated||0):sort==='due'?(Date.parse(a.due)||Infinity)-(Date.parse(b.due)||Infinity):Number(b.attention||b.overdue)-Number(a.attention||a.overdue)||Number(b.blocked)-Number(a.blocked)||Date.parse(b.updated||0)-Date.parse(a.updated||0));
    $('#work-result').textContent=`${rows.length}개 표시 · 총 ${data.records.length}개 기록`;
    $('#work-list').innerHTML=rows.length?rows.map(x=>`<article class="work-card ${x.attention||x.overdue?'attention':''} ${x.terminal?'done':''}" data-work-id="${esc(x.id)}" tabindex="-1"><div class="work-card-top"><span class="work-kind">${esc(KIND[x.kind]||x.kind)}</span><div class="work-tags"><span class="work-tag status">${esc(x.status)}</span>${x.priority?`<span class="work-tag">${esc(x.priority)}</span>`:''}${x.overdue?'<span class="work-tag danger">기한 지남</span>':''}${x.stale?'<span class="work-tag old">오래됨</span>':''}</div></div><h2>${esc(x.title)}</h2><dl>${x.owner?`<div><dt>${x.kind==='rooms'?'최근 기록':'담당'}</dt><dd>${esc(x.owner)}</dd></div>`:''}${x.next?`<div><dt>다음 행동</dt><dd>${esc(x.next)}</dd></div>`:''}<div><dt>날짜</dt><dd>${x.due?'기한 '+when(x.due)+' · ':''}수정 ${when(x.updated)}</dd></div></dl>${sourceMetadata(x,duplicate(x))}<div class="work-card-actions">${x.url?`<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">노션 원본 열기 →</a>`:''}<button type="button" data-work-plan="${esc(x.id)}">개인 수집함에 담기</button></div></article>`).join(''):'<div class="work-empty"><strong>조건에 맞는 업무가 없어요.</strong><button type="button" id="work-empty-reset">조건 지우고 전체 보기</button></div>';
    all('[data-work-plan]').forEach(button=>button.onclick=()=>{const item=data.records.find(x=>String(x.id)===button.dataset.workPlan);if(!item||!ownsData())return;window.dispatchEvent(new CustomEvent('planner:import-source',{detail:descriptor(item)}));});
    $('#work-empty-reset')?.addEventListener('click',resetFilters);
  }
  function validate(next){if(!next||!Array.isArray(next.records)||!Array.isArray(next.coverage)||!next.summary)throw Error('INVALID_DATA')}
  function apply(next){
    validate(next);data=next;
    const s=data.summary,cards=[['진행 업무',s.active,'active'],['확인할 것',s.attention,'attention'],['승인할 것',s.approvals,'approval'],['막힌 것',s.blocked,'blocked'],['오래된 기록',s.stale,'stale']];
    $('#work-metrics').innerHTML=cards.map(([label,n,key])=>`<button class="work-metric ${['attention','approval','blocked'].includes(key)&&n?'bad':''}" data-work-metric="${key}" aria-pressed="false"><span>${label}</span><strong>${n}</strong></button>`).join('');
    all('[data-work-metric]').forEach(b=>b.onclick=()=>{$('#work-search').value='';$('#work-kind').value='';$('#work-filter').value=b.dataset.workMetric==='active'?'active':b.dataset.workMetric;all('[data-work-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()});
    $('#work-content').hidden=false;render();
  }
  async function refresh(){
    if(!config||busy||$('#appView').classList.contains('hidden'))return;
    let requestContext=context();if(typeof config.getContext==='function'&&!requestContext)return;
    busy=true;const run=generation;controller=new AbortController();const current=controller;const timeout=setTimeout(()=>current.abort(),45000);$('#work-refresh').disabled=true;
    try{
      const {data:auth,error}=await config.client.auth.getSession();if(!isCurrent(run,requestContext))return;
      if(error||!auth.session){clear();config.onDenied();return}
      const requestUserId=String(auth.session.user?.id||'');
      if(!requestContext)requestContext={userId:requestUserId,generation:run};
      if(!requestUserId||requestUserId!==requestContext.userId){clear();config.onDenied();return}
      sessionUserId=requestUserId;
      const res=await fetch(config.url+'/functions/v1/work-read',{method:'GET',headers:{Authorization:'Bearer '+auth.session.access_token,apikey:config.key},signal:current.signal,cache:'no-store'});
      if(!isCurrent(run,requestContext,requestUserId))return;if(res.status===401||res.status===403){clear();config.onDenied();return}
      const result=await res.json();if(!isCurrent(run,requestContext,requestUserId))return;
      const verified=await config.client.auth.getSession();if(!isCurrent(run,requestContext,requestUserId))return;
      if(verified.error||String(verified.data?.session?.user?.id||'')!==requestUserId){clear();config.onDenied();return}
      if(!res.ok&&!result.meta)throw Error('SERVICE_UNAVAILABLE');if(result.work)validate(result.work);meta=result.meta;readContext=meta?{...requestContext}:null;dataContext={...requestContext};if(result.work)apply(result.work);else{$('#work-content').hidden=true;data=null;dataContext=null}freshness();
      if(meta?.error==='SOURCE_NOT_CONFIGURED')status('노션 연결 설정 대기 · 읽기 전용 연결키와 원본 권한이 필요합니다.',true);
      if(meta?.error==='SOURCE_ACCESS_DENIED')status('노션 권한 확인 필요 · 연결된 원본 범위를 확인해 주세요.',true);
    }catch(e){
      if(!isCurrent(run,requestContext))return;
      if(meta){const usable=Boolean(data&&!window.WorkDashboardSnapshotModel?.freshness(meta,Date.now())?.expired);meta={...meta,stale:true,...(meta.read&&typeof meta.read==='object'&&!Array.isArray(meta.read)?{read:{...meta.read,state:usable?'stale':'failed',lastAttemptAt:null,errorCode:'CLIENT_READ_FAILED'}}:{})};freshness()}
      else{
        status('진행 업무를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.',true);
      }
    }
    finally{clearTimeout(timeout);if(run===generation&&controller===current){busy=false;$('#work-refresh').disabled=false;controller=null}}
  }
  function resetFilters(){if(!data)return;$('#work-search').value='';$('#work-kind').value='';$('#work-filter').value='active';$('#work-sort').value='attention';all('[data-work-metric]').forEach(x=>x.setAttribute('aria-pressed','false'));render();$('#work-search').focus()}
  function open(target){if(!data)return;$('#work-search').value='';$('#work-kind').value='';$('#work-filter').value=target==='active'?'active':target;all('[data-work-metric]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.workMetric===target)));render()}
  function focus(id){if(!data)return;$('#work-search').value='';$('#work-kind').value='';$('#work-filter').value='all';render();const card=all('[data-work-id]').find(x=>x.dataset.workId===id);card?.scrollIntoView({behavior:'smooth',block:'center'});card?.focus({preventScroll:true});card?.classList.add('focus');setTimeout(()=>card?.classList.remove('focus'),1800)}
  function init(c){config=c;$('#work-refresh').onclick=refresh;$('#work-reset').onclick=resetFilters;for(const id of ['work-search','work-kind','work-filter','work-sort'])$('#'+id).addEventListener(id==='work-search'?'input':'change',render);config.client.auth.onAuthStateChange((event,session)=>{const nextUserId=String(session?.user?.id||'');if(event==='SIGNED_OUT'){sessionUserId='';clear();return}if(event==='USER_UPDATED'||nextUserId&&(sessionUserId&&nextUserId!==sessionUserId||dataContext&&nextUserId!==dataContext.userId))clear();if(nextUserId)sessionUserId=nextUserId});setInterval(()=>{if(!document.hidden&&!$('#tab-work').classList.contains('hidden'))refresh()},60000);setInterval(freshness,15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#tab-work').classList.contains('hidden'))refresh()});window.addEventListener('pagehide',clear)}
  return {init,refresh,clear,open,focus};
})();
