window.TeamDashboard=(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
  const M=window.TeamDashboardModel;
  const emptyCore=()=>({applications:[],cohorts:[],orders:[],inquiries:[],alerts:[]});
  let config={},core=emptyCore(),coreKnown=false,operations=null,workSnapshot=null,workReadMetadata=null,selected=new Set(),operationId='',activeUserId='',authGeneration=0,initialized=false;
  function result(){return M.build({core,coreKnown,operations,workSnapshot})}
  function fmt(value){if(!value)return'성공 시각 없음';const stamp=Date.parse(value);return Number.isFinite(stamp)?new Date(stamp).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'성공 시각 미확인'}
  function renderLanes(data){
    const host=$('#team-lanes-grid');if(!host)return;
    host.innerHTML=data.lanes.map(lane=>`<button type="button" class="team-lane ${esc(lane.tone)}" data-team-route="${esc(lane.route)}"><span>${esc(lane.label)}</span><strong>${lane.value==null?'—':esc(lane.value)}</strong><small>${esc(lane.note)}</small>${lane.evidence?`<em>${esc(lane.evidence)}</em>`:''}</button>`).join('');
    host.querySelectorAll('[data-team-route]').forEach(button=>button.onclick=()=>config.navigate?.(button.dataset.teamRoute));
    const state=$('#team-lanes-status'),bad=data.summary.failed;state.textContent=operations?(bad?`연결 확인 ${bad}개`:'연결 원천 정상'):'원천 확인 전';state.classList.toggle('bad',Boolean(!operations||bad));
  }
  function visible(tasks){
    const query=String($('#team-work-search')?.value||'').trim().toLowerCase(),assignee=$('#team-work-assignee')?.value||'',status=$('#team-work-status')?.value||'';
    return tasks.filter(row=>{const people=[...row.assignees,...row.collaborators],hay=[row.title,row.status,row.definition,row.assigneeRole,row.nextAction,...people].join(' ').toLowerCase();if(query&&!hay.includes(query))return false;if(assignee==='__unassigned'&&people.length)return false;if(assignee&&assignee!=='__unassigned'&&!people.includes(assignee))return false;if(status&&!row.status.includes(status))return false;return true});
  }
  function descriptor(row){return {id:row.id,title:row.title,kindLabel:'팀 공동 업무',updatedAt:row.updatedAt,teamDue:row.due,status:row.status}}
  function reviewRank(row){const status=String(row.status||''),terminal=/완료|종료|취소|반려/.test(status);if(row.kind==='representative_decision')return 0;if(!terminal&&(row.approval||row.blocked||row.attention||row.overdue||/확인|승인|결정|검토|막힘|보류/.test(status)))return 1;return 2}
  function reviewFirst(rows){return rows.map((row,index)=>({row,index})).sort((left,right)=>reviewRank(left.row)-reviewRank(right.row)||Number(right.row.blocked)-Number(left.row.blocked)||Number(right.row.overdue)-Number(left.row.overdue)||Date.parse(right.row.updatedAt||0)-Date.parse(left.row.updatedAt||0)||left.index-right.index).map(item=>item.row)}
  function updateBulk(rows){const ids=rows.map(row=>row.id),count=selected.size,all=$('#team-work-select-all');$('#team-work-selected').textContent=`${count}개 선택`;all.checked=Boolean(ids.length&&ids.every(id=>selected.has(id)));all.indeterminate=Boolean(ids.some(id=>selected.has(id))&&!all.checked);for(const id of ['team-work-to-plan','team-work-request','team-work-clear'])$('#'+id).disabled=!count}
  function taskMetadata(row){
    const value=row.readMetadata,identity=value?.identity,relation=value?.relation,observation=value?.observation;
    return `<details class="source-team-detail work-read-metadata team-work-metadata"><summary>원본 신원·관측 정보</summary><div class="work-read-metadata-body"><p class="team-work-identity">원본 신원 · ${esc(identity?.label||'원본 신원 메타 미제공')}${identity?.state==='identified'&&identity.id?`<br>원본 ID · ${esc(identity.id)}`:''}</p><p class="team-work-relation">대응 업무 관계 · ${esc(relation?.label||'관계 메타 미제공')}</p><p class="team-work-observation">원래 관측시각 · ${esc(observation?.label||'원래 관측시각 미확인')}</p><p class="team-work-storage">원천 저장시각 · 미제공</p><small>서버 조회 성공은 원래 관측시각이나 업무 완료를 뜻하지 않습니다.</small></div></details>`;
  }
  function readTimestamp(stamp){return stamp?.state==='known'?fmt(stamp.value):stamp?.state==='future'?'미래 시각 · 확인 필요':stamp?.state==='invalid'?'시각 형식 확인 필요':'미제공'}
  function readMetadata(value){
    if(!value)return '<small class="team-work-read-state">서버 조회 메타 미제공</small>';
    return `<small class="team-work-read-state">서버 조회 · ${esc(value.label)}</small><small class="team-work-read-success">마지막 성공 조회 · ${esc(readTimestamp(value.success))}</small><small class="team-work-read-attempt">최근 조회 시도 · ${esc(readTimestamp(value.attempt))}</small>${value.errorLabel?`<small class="team-work-read-error">조회 오류 · ${esc(value.errorLabel)}</small>`:''}`;
  }
  function teamSupplement(row){
    const extra=row.teamReadSupplement;if(!extra||row.kind!=='team_task')return'';
    const reasons={no_match:'명시적인 팀 원천 연결 미확인',duplicate_work_id:'업무 원본 ID 중복 · 연결 확인 필요',duplicate_source_id:'팀 원본 ID 중복 · 연결 확인 필요',invalid_work_id:'업무 원본 ID 형식 확인 필요',invalid_source_id:'팀 원본 ID 형식 확인 필요',work_expired:'업무 조회 유효시간 지남 · 추가 정보 연결 해제',source_expired:'팀 원천 조회 유효시간 지남 · 추가 정보 연결 해제',invalid_time:'조회 시각 형식 확인 필요',future_time:'미래 조회 시각 · 확인 필요',source_unavailable:'팀 원천 정보 확인 필요',unresolved_reference:'대응 원본 관계 미해결 · 추가 정보 합류 미확인'};
    const state=extra.state==='current'?'같은 원본 ID 확인':extra.state==='stale'?'오래됨 · 이전 팀 정보':'미합류 · '+(reasons[extra.reason]||'연결 확인 필요');
    const stamp=value=>value?Number.isFinite(Date.parse(value))?fmt(value):'시각 형식 확인 필요':'미제공',times=`<small class="team-work-supplement-times">팀 원천 마지막 성공 조회 · ${esc(stamp(extra.lastSuccessAt))}<br>팀 원천 최근 조회 시도 · ${esc(stamp(extra.lastAttemptAt))}<br>팀 원본 수정 · ${esc(stamp(extra.sourceEditedAt))}<br>업무 조회 · ${esc(stamp(extra.workFetchedAt))}</small>`;
    let content='';const fields=extra.fields;
    if(fields){
      const fieldLabel=state=>M.readFieldStateLabel[state]||'형식 확인 필요',role=fields.assigneeRoleState==='provided'?fields.assigneeRole:fieldLabel(fields.assigneeRoleState),action=['provided','legacy'].includes(fields.nextActionState)?fields.nextAction+(fields.nextActionState==='legacy'?' · 구형 응답의 완료 기준에서 발췌':''):fieldLabel(fields.nextActionState),link=fields.sourceUrlState==='provided'?`<a class="team-work-supplement-link" href="${esc(fields.sourceUrl)}" target="_blank" rel="noopener noreferrer">팀 자료 열기 ↗</a>`:esc(fieldLabel(fields.sourceUrlState));
      content=`<p class="team-work-supplement-role">팀 담당 역할 · ${esc(role)}</p><p class="team-work-supplement-next">팀의 별도 다음 행동 · ${esc(action)}</p><p class="team-work-supplement-source">팀 자료 링크 · ${link}</p>`;
      if(extra.difference?.nextAction==='different')content+='<p class="team-work-supplement-difference">다음 행동 값이 다릅니다. 업무 요약의 길이 제한이나 표현 차이일 수 있으니 출처를 확인해 주세요. 위의 업무 다음 행동은 그대로 유지합니다.</p>';
    }
    return `<details class="source-team-detail team-work-supplement" data-team-supplement-state="${esc(extra.state)}"><summary>팀 추가 정보 연결 상태</summary><div><p class="team-work-supplement-state">${esc(state)}</p>${content}${times}</div></details>`;
  }
  function renderTasks(data){
    const host=$('#team-workboard-list');if(!host)return;const rows=reviewFirst(visible(data.tasks)),toolsOpen=Boolean($('.team-workboard-tools')?.open),actionable=rows.filter(row=>reviewRank(row)<2),displayRows=toolsOpen?rows:actionable,visibleIds=new Set(displayRows.map(row=>row.id));selected=new Set([...selected].filter(id=>visibleIds.has(id)));
    const source=data.sources.find(row=>row.key==='work')||data.sources.find(row=>row.key==='team');
    const shown=toolsOpen?`${rows.length}개 전체 표시`:actionable.length?`${actionable.length}개 확인 필요 · 전체 ${rows.length}개`:`확인 필요한 일 없음 · 전체 ${rows.length}개`;
    const coverage=data.teamReadCoverage,joinStatus=source?.key==='work'&&coverage?` · 검증된 원천 관계 ${coverage.matched}/${coverage.total}${coverage.stale?`(이전 정보 ${coverage.stale}개)`:''}`:'';
    $('#team-workboard-status').textContent=(!source?'팀 원천 확인 전입니다.':source.bad?`${shown} · ${source.stateLabel} · ${source.errorCode||'이전 성공본을 유지합니다.'}`:`${shown} · ${fmt(source.lastSuccessAt)} 조회`)+joinStatus;
    $('#team-workboard-status').classList.toggle('bad',Boolean(!source||source.bad));
    const empty=!source?'팀 업무를 아직 확인하지 못했습니다.':source.bad?'최근 조회에 실패했습니다. 빈 목록으로 바꾸지 않고 이전 성공 상태를 확인하세요.':'지금 대표가 확인할 일은 없습니다. 전체 업무는 검색·필터에서 볼 수 있습니다.';
    host.innerHTML=displayRows.length?displayRows.map(row=>{
      const readFields=row.readFields===true,people=row.assignees.length?'담당 '+row.assignees.join(' · '):readFields?'담당 정보 확인 필요 · 현재 응답에 담당자 정보 없음':'담당 미지정',updated=row.updatedAt?fmt(row.updatedAt):'수정 시각 미확인',badges=[row.kindLabel,row.status,row.priority,row.blocked?'막힘':'',row.overdue?'기한 지남':'',row.stale?'오래됨':''].filter(Boolean),open=row.sourceUrl?`<a class="team-work-source" href="${esc(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">${readFields?'자료 열기':'원본 보기'}</a>`:`<button type="button" data-team-work-open="${esc(row.id)}">업무 화면</button>`;
      let detail=row.definition?`<p>${esc(row.definition)}</p>`:'';
      if(readFields){
        const longAction=row.nextActionState==='provided'&&row.nextAction.length>140,actionValue=longAction?row.nextAction.slice(0,140)+'…':row.nextAction;
        const role=row.assigneeRoleState==='provided'?row.assigneeRole:M.readFieldStateLabel[row.assigneeRoleState],action=['provided','legacy'].includes(row.nextActionState)?actionValue+(row.nextActionState==='legacy'?' · 구형 응답의 완료 기준에서 발췌':''):row.nextActionState==='unavailable'?'확인 필요 · '+M.readFieldStateLabel[row.nextActionState]:M.readFieldStateLabel[row.nextActionState],actionDetail=longAction?`<details class="source-team-detail team-work-action-detail"><summary>다음 행동 전체 보기</summary><p>${esc(row.nextAction)}</p></details>`:'';
        detail=`<small class="team-work-role">담당 역할 · ${esc(role)}</small><p class="team-work-next">다음 행동 · ${esc(action)}</p>${actionDetail}${row.definition?`<details class="team-work-criteria"><summary>완료 기준 전체 보기</summary><p>${esc(row.definition)}</p></details>`:''}${row.sourceUrlState==='provided'?'':`<small class="team-work-source-state">자료 링크 · ${esc(M.readFieldStateLabel[row.sourceUrlState])}</small>`}`;
      }
      return `<article class="team-work-row${row.teamReadSupplement?' has-team-supplement':''}${selected.has(row.id)?' selected':''}${row.blocked||row.overdue?' is-urgent':''}" data-team-work-id="${esc(row.id)}"><label><input type="checkbox" data-team-work-check="${esc(row.id)}"${selected.has(row.id)?' checked':''}><span class="sr-only">${esc(row.title)} 선택</span></label><div><span>${badges.map(esc).join(' · ')}${row.due?` · ${esc(row.due)}`:''}</span><strong>${esc(row.title)}</strong>${detail}<small>${esc(people)} · 수정 ${esc(updated)}</small>${taskMetadata(row)}${teamSupplement(row)}</div>${open}</article>`;
    }).join(''):`<p class="team-work-empty">${esc(empty)}</p>`;
    host.querySelectorAll('[data-team-work-check]').forEach(input=>input.onchange=()=>{if(input.checked)selected.add(input.dataset.teamWorkCheck);else selected.delete(input.dataset.teamWorkCheck);renderTasks(data)});host.querySelectorAll('[data-team-work-open]').forEach(button=>button.onclick=()=>config.navigate?.('work'));updateBulk(rows);
  }
  function renderFreshness(data){const host=$('#team-freshness-grid');if(!host)return;const staticRows=[{label:'홈페이지 프로그램',stateLabel:'고정 자료 사용 중',lastSuccessAt:'2026-10-11',bad:true,errorCode:'자동 공개 미연결'},{label:'지원사업',stateLabel:'로컬 원천 없음',lastSuccessAt:'',bad:true,errorCode:'프로토타입 별도 환경'},{label:'Google Chat 후보함',stateLabel:'로컬 검수 PASS',lastSuccessAt:'',bad:true,errorCode:'DB·Edge·UI 미배포'}];host.innerHTML=[...data.sources,...staticRows].map(row=>`<article class="${row.bad?'bad':'ok'}"><span>${esc(row.label)}</span><strong>${esc(row.stateLabel)}</strong><small>${esc(fmt(row.lastSuccessAt))}${row.errorCode?` · ${esc(row.errorCode)}`:''}</small>${row.key==='work'?readMetadata(row.readMetadata):''}</article>`).join('')+(workReadMetadata&&!data.sources.some(row=>row.key==='work')?`<article class="bad team-work-read-only"><span>업무 API 조회</span>${readMetadata(workReadMetadata)}<small>조회 상태이며 업무의 처리 결과가 아닙니다.</small></article>`:'')}
  function render(){if(!activeUserId){clearDom();return}const data=result();renderLanes(data);renderTasks(data);renderFreshness(data)}
  function resetState(){core=emptyCore();coreKnown=false;operations=null;workSnapshot=null;workReadMetadata=null;selected=new Set();operationId=''}
  function clearDom(){
    for(const id of ['team-lanes-grid','team-workboard-list','team-freshness-grid'])$('#'+id)?.replaceChildren();
    const tools=$('.team-workboard-tools');if(tools)tools.open=false;$('#tab-home')?.classList.remove('team-bulk-mode');
    const laneStatus=$('#team-lanes-status');if(laneStatus){laneStatus.textContent='관리자 확인 전';laneStatus.classList.add('bad')}
    const workStatus=$('#team-workboard-status');if(workStatus){workStatus.textContent='관리자 확인 후 팀 원천을 표시합니다.';workStatus.classList.add('bad')}
    for(const id of ['team-work-search','team-work-assignee','team-work-status','team-work-request-owner'])if($('#'+id))$('#'+id).value='';
    const all=$('#team-work-select-all');if(all){all.checked=false;all.indeterminate=false}
    if($('#team-work-selected'))$('#team-work-selected').textContent='0개 선택';
    for(const id of ['team-work-to-plan','team-work-request','team-work-clear'])if($('#'+id))$('#'+id).disabled=true;
  }
  function batchPlan(){const rows=result().tasks.filter(row=>selected.has(row.id));if(!rows.length)return;operationId=crypto.randomUUID?.()||`plan-${Date.now()}`;window.dispatchEvent(new CustomEvent('planner:batch-import-sources',{detail:{operationId,sources:rows.map(descriptor)}}));$('#team-workboard-status').textContent=`${rows.length}개를 개인 일정에 연결하고 있습니다. 공동 원본은 바꾸지 않습니다.`}
  function requestOwner(){const owner=$('#team-work-request-owner').value,rows=result().tasks.filter(row=>selected.has(row.id));if(!owner){$('#team-workboard-status').textContent='요청할 담당을 먼저 선택해 주세요.';$('#team-workboard-status').classList.add('bad');return}if(!rows.length)return;window.dispatchEvent(new CustomEvent('assistant-request:prefill',{detail:{id:`team-owner-${Date.now()}`,version:new Date().toISOString(),title:`공동 업무 ${rows.length}개 담당 변경 검토 · ${owner}`,body:`Notion 원본은 읽기 전용입니다. 아래 업무의 담당을 ${owner}(으)로 바꿀지 검토해 주세요.\n${rows.map(row=>`- ${row.title} [${row.id}]`).join('\n')}`}}));config.navigate?.('integration');selected.clear();render();setTimeout(()=>$('#assistant-request-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
  function init(options={}){if(initialized)return;initialized=true;config=options;['team-work-search','team-work-assignee','team-work-status'].forEach(id=>$('#'+id)?.addEventListener(id==='team-work-search'?'input':'change',render));const tools=$('.team-workboard-tools');tools?.addEventListener('toggle',()=>{if(!tools.open)selected.clear();$('#tab-home')?.classList.toggle('team-bulk-mode',tools.open);render()});$('#team-work-select-all').onchange=event=>{const rows=visible(result().tasks);if(event.target.checked)rows.forEach(row=>selected.add(row.id));else rows.forEach(row=>selected.delete(row.id));render()};$('#team-work-to-plan').onclick=batchPlan;$('#team-work-request').onclick=requestOwner;$('#team-work-clear').onclick=()=>{selected.clear();render()};window.addEventListener('operations:sources-snapshot',event=>{const detail=event.detail||{};if(!activeUserId||String(detail.userId||'')!==activeUserId||Number(detail.generation)!==authGeneration)return;operations=detail.snapshot||null;render()});window.addEventListener('work:dashboard-snapshot',event=>{const detail=event.detail||{};if(!activeUserId||String(detail.userId||'')!==activeUserId||Number(detail.generation)!==authGeneration)return;workSnapshot=detail.snapshot||null;workReadMetadata=Object.hasOwn(detail,'readMetadata')?detail.readMetadata:workSnapshot?.readMetadata||null;selected.clear();render()});window.addEventListener('planner:batch-result',event=>{if(!activeUserId||!operationId||event.detail?.operationId!==operationId)return;operationId='';$('#team-workboard-status').textContent=event.detail.message||'일괄 일정 연결 결과를 확인했습니다.';if(['success','noop','undone'].includes(event.detail.outcome))selected.clear();render()});clearDom()}
  function activate(id,generation){const next=String(id||''),nextGeneration=Number(generation);resetState();activeUserId=next;authGeneration=Number.isSafeInteger(nextGeneration)?nextGeneration:authGeneration+1;if(!activeUserId){clearDom();return false}render();return true}
  function deactivate(){activeUserId='';authGeneration++;resetState();clearDom()}
  function clear(){deactivate()}
  function setCore(next,known,context={}){if(!activeUserId||String(context.userId||'')!==activeUserId||Number(context.generation)!==authGeneration)return false;core=next||emptyCore();coreKnown=known!==false;render();return true}
  return {init,activate,deactivate,clear,setCore};
})();
