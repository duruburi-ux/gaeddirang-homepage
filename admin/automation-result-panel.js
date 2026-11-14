window.AutomationResultPanel=(()=>{
  'use strict';
  const $=selector=>document.querySelector(selector);
  let config=null,userId='',generation=0,snapshot=null,readState='unchecked',attemptedAt=null,initialized=false;
  const element=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node};
  function when(value){return value?.state==='known'?new Date(value.value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}):value?.state==='future'?'미래 시각 · 확인 필요':value?.state==='invalid'?'시각 형식 확인 필요':'미제공';}
  function current(){const context=config?.getContext?.();return Boolean(userId&&context?.userId===userId&&Number(context.generation)===generation)}
  function render(){
    const status=$('#automation-result-read-status'),list=$('#automation-result-read-list');if(!status||!list)return;
    list.replaceChildren();
    if(!current()){status.textContent='관리자 확인 후 기존 보고를 읽습니다.';return}
    if(!snapshot){status.textContent=readState==='unchecked'?'기존 서버 보고를 아직 확인하지 못했습니다. 빈 목록을 실행 0건으로 해석하지 않습니다.':'보고 읽기에 실패했습니다. 실제 실행 여부는 미확인입니다.';return}
    status.textContent=`${readState==='current'?'기존 보고 읽기':'이전 보고 유지'} · 보고 조회 ${when(snapshot.reportReadAt)}${readState!=='current'&&attemptedAt?` · 이번 조회 시도 ${when({state:'known',value:attemptedAt})}`:''}`;
    for(const row of snapshot.rows){
      const item=element('article','automation-result-row'),copy=element('div');
      copy.append(element('small','',`${row.statusLabel}${row.status==='completed'?(row.hasDatedEvidence?' · 확인 시각 기록 있음':' · 근거 확인 필요'):''}`),element('h4','',row.title));
      const times=element('dl');
      const proofTimes=row.evidenceVerifiedAt.length?row.evidenceVerifiedAt.map(value=>value.state==='known'?when(value):`미확인 · ${when(value)}`).join(' · '):row.hasUnconfirmedEvidence?'미확인 · 근거 미제공 또는 형식 확인 필요':'미제공';
      for(const [label,value] of [['원천 관측','미제공'],['원천 저장','미제공'],['상태 수정',when(row.recordUpdatedAt)],['근거 확인',proofTimes]]){const pair=element('div');pair.append(element('dt','',label),element('dd','',value));times.append(pair)}
      copy.append(times,element('p','',row.sourceId?'원천 ID 제공 · 다른 업무와의 관계는 별도 확인':'원천 ID 미제공 · 업무 관계 미확인'));
      if(row.hasUnconfirmedEvidence)copy.append(element('p','',`${row.evidenceState==='partial'?'일부 근거 미확인':'근거 미확인'} · 제공된 시각만 표시하며 결과나 실행 완료를 새로 판정하지 않습니다.`));
      const button=element('button','','기존 결과 보기');button.type='button';button.onclick=()=>{
        const target=document.querySelector(`[data-server-request="${row.requestId}"]`);if(!target)return;
        for(let node=target.parentElement;node;node=node.parentElement)if(node.tagName==='DETAILS')node.open=true;
        target.tabIndex=-1;target.focus({preventScroll:true});target.scrollIntoView({block:'center'});
      };
      item.append(copy,button);list.append(item);
    }
    if(!snapshot.rows.length)list.append(element('p','','보고 응답에는 기록이 없습니다. 정기 작업이 없거나 실행되지 않았다는 뜻은 아닙니다.'));
  }
  function receive(event){
    const detail=event.detail||{};
    if(!current()||detail.userId!==userId||Number(detail.generation)!==generation)return;
    const attempt=window.AutomationResultReadModel.time(detail.attemptedAt,Date.now());attemptedAt=attempt.state==='known'?attempt.value:null;
    if(detail.snapshot){try{snapshot=window.AutomationResultReadModel.build(detail.snapshot)}catch{readState=snapshot?'stale':'failed';render();return}}
    readState=['current','stale','failed','unchecked'].includes(detail.state)?detail.state:'failed';render();
  }
  function evidence(){
    const input=$('#workboard-evidence-input'),note=$('#workboard-evidence-status');if(!input||!note)return;
    const raw=input.value;let valid;
    try{valid=window.WorkboardEvidenceContract?.validateEvidence?.(raw)}catch{valid=null}
    const length=raw.length,ok=valid?.ok===true;
    const problem=valid?.code==='EVIDENCE_TOO_LONG'?'초과했습니다. 원문은 자르지 않았고 저장하지 않습니다.':valid?.code==='EVIDENCE_INVALID_UNICODE'?'문자 형식을 확인해 주세요. 원문은 보존했으며 저장하지 않습니다.':'입력 검증기를 확인하지 못했습니다. 원문은 보존했으며 저장하지 않습니다.';
    input.setAttribute('aria-invalid',String(!ok));input.setCustomValidity(ok?'':problem);
    note.textContent=`${length.toLocaleString('ko-KR')} / 1,500 · ${ok?'길이 검사만 합니다. 업무판 저장·공식 재조회 연결은 아직 없습니다.':problem}`;
    note.classList.toggle('bad',!ok);return valid;
  }
  function init(options){
    config=options;if(initialized)return;initialized=true;
    window.addEventListener('assistant:results-read',receive);
    $('#workboard-evidence-input')?.addEventListener('input',evidence);
    evidence();render();
  }
  function activate(id,authGeneration){userId=String(id||'');generation=Number(authGeneration);snapshot=null;readState='unchecked';attemptedAt=null;render()}
  function deactivate(){userId='';generation=0;snapshot=null;readState='unchecked';attemptedAt=null;const input=$('#workboard-evidence-input');if(input){input.value='';input.setCustomValidity('');input.removeAttribute('aria-invalid')}evidence();render()}
  return {init,activate,deactivate};
})();
