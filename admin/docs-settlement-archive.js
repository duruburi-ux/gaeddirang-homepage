(function(){
  const host=document.querySelector('#settlementArchiveHost');
  const M=window.SettlementDocumentModel;
  if(!host||!M)return;
  const BUCKET='settlement-documents';
  const S={rows:[],loaded:false,loading:false,error:'',uploading:false,showForm:false,category:'',status:'',query:''};
  const errorText={
    ADMIN_REQUIRED:'기존 관리자만 정산 자료실을 사용할 수 있어요.',
    DOCUMENT_FILE_NOT_FOUND:'업로드 파일을 확인하지 못했어요. 다시 선택해 주세요.',
    DOCUMENT_DUPLICATE_FILE:'동일한 파일이 이미 보관되어 있어 중복 등록하지 않았어요.',
    DOCUMENT_REPLACEMENT_MISMATCH:'같은 분류·대상·기간·제목의 문서만 이전 버전으로 연결할 수 있어요.',
    DOCUMENT_ALREADY_SUPERSEDED:'이미 대체된 문서는 다시 대체할 수 없어요.',
  };
  const e=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function filtered(){
    const q=S.query.toLowerCase();
    return S.rows.filter(row=>(!S.category||row.category===S.category)&&(!S.status||row.status===S.status)&&(!q||[row.subject,row.title,row.file_name,row.period_label].some(v=>String(v||'').toLowerCase().includes(q))));
  }
  function statusChip(status){return `<span class="archive-status ${e(status)}">${e(M.STATUSES[status]||status)}</span>`;}
  function rowHtml(row){
    const canConfirm=row.status==='review';
    const canSupersede=row.status!=='superseded';
    return `<article class="archive-row" data-id="${e(row.id)}">
      <div class="archive-row-main">
        <div class="archive-row-top">${statusChip(row.status)}<span class="archive-version">v${e(row.version_no)}</span><b>${e(row.title)}</b></div>
        <div class="archive-sub">${e(row.period_label)} · ${e(row.subject)} · ${e(row.file_name)}</div>
        <div class="archive-meta">${e(M.formatBytes(row.size_bytes))}${row.created_at?` · 등록 ${e(String(row.created_at).slice(0,10))}`:''}${row.notes?` · ${e(row.notes)}`:''}</div>
      </div>
      <div class="archive-actions"><button class="btn-sm archive-open"${MODE==='preview'?' disabled':''}>60초 링크로 열기</button>${canConfirm?'<button class="btn-link archive-confirm">확정 표시</button>':''}${canSupersede?'<button class="btn-link archive-supersede">대체됨 표시</button>':''}</div>
    </article>`;
  }
  function listHtml(){
    if(S.loading)return '<div class="empty">비공개 자료 목록을 불러오는 중…</div>';
    if(S.error&&!S.rows.length)return '<div class="empty"><b>정산자료 목록을 불러오지 못했어요.</b><br>빈 자료실이 아닙니다. 「새로고침」으로 다시 확인해 주세요.</div>';
    const groups=M.groupRows(filtered());
    const html=Object.entries(M.CATEGORIES).map(([key,label])=>{
      const rows=groups[key];
      return `<section class="archive-group"><h3>${e(label)} <span class="hint">${rows.length}개 버전</span></h3>${rows.length?rows.map(rowHtml).join(''):'<p class="archive-empty">조건에 맞는 문서가 없습니다.</p>'}</section>`;
    }).join('');
    return (S.error?'<div class="archive-safe">목록 새로고침에 실패해 마지막 확인본을 표시합니다.</div>':'')+(html||'<div class="empty">등록된 문서가 없습니다.</div>');
  }
  function replacementOptions(){
    const rows=S.rows.filter(row=>row.status!=='superseded');
    return '<option value="">새 문서 묶음으로 등록</option>'+rows.map(row=>`<option value="${e(row.id)}">${e(M.CATEGORIES[row.category])} · ${e(row.period_label)} · ${e(row.subject)} · ${e(row.title)} · v${e(row.version_no)}</option>`).join('');
  }
  function uploadFormHtml(){
    if(!S.showForm)return '';
    return `<div class="archive-upload" id="archiveUploadForm">
      <h3>새 버전 비공개 보관</h3>
      <p class="archive-safe">파일은 비공개 버킷에만 저장되고, 기존 관리자만 짧은 서명 링크를 만들 수 있습니다. 새 파일은 항상 「검토중」으로 시작합니다.</p>
      <div class="row2"><div><label class="f" for="archiveCategory">문서 구분</label><select class="in" id="archiveCategory">${Object.entries(M.CATEGORIES).map(([k,v])=>`<option value="${k}">${e(v)}</option>`).join('')}</select></div>
      <div><label class="f" for="archivePeriodLabel">기간 표시</label><input class="in" id="archivePeriodLabel" placeholder="예: 2026년 8~9월"></div></div>
      <div class="row2"><div><label class="f" for="archivePeriodStart">기간 시작 <span class="hint">(선택)</span></label><input class="in" id="archivePeriodStart" type="date"></div><div><label class="f" for="archivePeriodEnd">기간 종료 <span class="hint">(선택)</span></label><input class="in" id="archivePeriodEnd" type="date"></div></div>
      <label class="f" for="archiveSubject">대상</label><input class="in" id="archiveSubject" placeholder="예: 가상작가 또는 내부 팀">
      <label class="f" for="archiveTitle">문서 제목</label><input class="in" id="archiveTitle" placeholder="예: 3분기 인세 정산서">
      <label class="f" for="archiveSupersedes">이전 버전 연결</label><select class="in" id="archiveSupersedes">${replacementOptions()}</select>
      <label class="f" for="archiveFile">파일</label><input class="in" id="archiveFile" type="file" accept=".pdf,.docx,.xlsx,.json,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json,text/markdown">
      <label class="f" for="archiveNotes">메모 <span class="hint">(계좌번호 등 개인정보 입력 금지)</span></label><textarea class="in" id="archiveNotes" rows="2"></textarea>
      <div class="btns"><button class="btn-primary" id="archiveUpload">비공개 업로드</button><button class="btn-sm" id="archiveCancel">취소</button></div><div class="parse-note" id="archiveNote"></div>
    </div>`;
  }
  function render(){
    host.innerHTML=`<div class="card archive-toolbar">
      <div><h3>이번 달 정산자료</h3><p class="hint">파일명과 별개로 「검토중·확정·대체됨」을 표시하고 이전 버전을 지우지 않습니다. 「확정」은 문서 상태이며 지급 완료를 뜻하지 않습니다.</p></div>
      <div class="archive-filters"><select class="in sm" id="archiveCategoryFilter"><option value="">모든 구분</option>${Object.entries(M.CATEGORIES).map(([k,v])=>`<option value="${k}"${S.category===k?' selected':''}>${e(v)}</option>`).join('')}</select>
      <select class="in sm" id="archiveStatusFilter"><option value="">모든 상태</option>${Object.entries(M.STATUSES).map(([k,v])=>`<option value="${k}"${S.status===k?' selected':''}>${e(v)}</option>`).join('')}</select>
      <input class="in sm" id="archiveSearch" value="${e(S.query)}" placeholder="대상·제목 검색"><button class="btn-sm" id="archiveReload">새로고침</button>${MODE==='db'?'<button class="btn-primary" id="archiveAdd">파일 등록</button>':''}</div>
    </div>${uploadFormHtml()}<div id="archiveList">${listHtml()}</div>`;
    bind();
  }
  function bind(){
    host.querySelector('#archiveCategoryFilter')?.addEventListener('change',event=>{S.category=event.target.value;render();});
    host.querySelector('#archiveStatusFilter')?.addEventListener('change',event=>{S.status=event.target.value;render();});
    host.querySelector('#archiveSearch')?.addEventListener('input',event=>{S.query=event.target.value;host.querySelector('#archiveList').innerHTML=listHtml();bindRows();});
    host.querySelector('#archiveReload')?.addEventListener('click',()=>load(true));
    host.querySelector('#archiveAdd')?.addEventListener('click',()=>{S.showForm=true;render();});
    host.querySelector('#archiveCancel')?.addEventListener('click',()=>{S.showForm=false;render();});
    host.querySelector('#archiveUpload')?.addEventListener('click',upload);
    bindRows();
  }
  function bindRows(){
    host.querySelectorAll('.archive-row').forEach(el=>{
      const row=S.rows.find(item=>item.id===el.dataset.id);
      el.querySelector('.archive-open')?.addEventListener('click',()=>openDocument(row));
      el.querySelector('.archive-confirm')?.addEventListener('click',()=>confirmDocument(row));
      el.querySelector('.archive-supersede')?.addEventListener('click',()=>supersedeDocument(row));
    });
  }
  async function load(force=false){
    if(MODE==='preview'){
      S.rows=M.previewRows();S.loaded=true;S.loading=false;S.error='';render();return;
    }
    if(MODE!=='db'){S.rows=[];S.loaded=true;S.error='';render();return;}
    if(S.loading||(!force&&S.loaded))return;
    S.loading=true;render();
    const {data,error}=await sb.rpc('list_settlement_documents');
    S.loading=false;S.loaded=true;
    if(error){S.error=errorText[error.message]||'정산자료 목록을 불러오지 못했어요';render();toast(S.error,true);return;}
    S.error='';S.rows=(Array.isArray(data)?data:[]).map(M.normalizeRow);render();
  }
  async function sha256(file){
    const bytes=await file.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  }
  function readDraft(){
    return {
      category:host.querySelector('#archiveCategory')?.value,
      subject:host.querySelector('#archiveSubject')?.value,
      title:host.querySelector('#archiveTitle')?.value,
      periodStart:host.querySelector('#archivePeriodStart')?.value,
      periodEnd:host.querySelector('#archivePeriodEnd')?.value,
      periodLabel:host.querySelector('#archivePeriodLabel')?.value,
      supersedesId:host.querySelector('#archiveSupersedes')?.value||null,
      notes:host.querySelector('#archiveNotes')?.value,
    };
  }
  async function upload(){
    if(S.uploading)return;
    const file=host.querySelector('#archiveFile')?.files?.[0];
    const checked=M.validateDraft(readDraft(),file),note=host.querySelector('#archiveNote');
    if(!checked.ok){note.className='parse-note warn';note.textContent=checked.errors.join('\n');return;}
    const d=checked.draft,previous=d.supersedesId?S.rows.find(row=>row.id===d.supersedesId):null;
    if(previous&&!M.canReplace(previous,d)){note.className='parse-note warn';note.textContent='같은 구분·대상·기간·제목의 이전 문서만 대체 버전으로 연결할 수 있어요.';return;}
    if(previous&&!confirm(`v${previous.version_no}을(를) 「대체됨」으로 남기고 새 검토중 버전을 올릴까요?`))return;
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.user?.id){note.className='parse-note warn';note.textContent='로그인이 만료됐어요. 다시 로그인해 주세요.';return;}
    S.uploading=true;host.querySelector('#archiveUpload').disabled=true;note.className='parse-note';note.textContent='파일 무결성을 계산하는 중…';
    const path=`${session.user.id}/${crypto.randomUUID()}/${M.storageObjectName(d.fileName)}`;
    try{
      const hash=await sha256(file);
      note.textContent='비공개 저장소에 올리는 중…';
      const stored=await sb.storage.from(BUCKET).upload(path,file,{contentType:d.mimeType,upsert:false,cacheControl:'3600'});
      if(stored.error)throw stored.error;
      const saved=await sb.rpc('register_settlement_document',{
        p_category:d.category,p_subject:d.subject,p_title:d.title,p_period_start:d.periodStart||null,p_period_end:d.periodEnd||null,
        p_period_label:d.periodLabel,p_file_name:d.fileName,p_storage_path:path,p_mime_type:d.mimeType,p_size_bytes:d.sizeBytes,
        p_sha256:hash,p_notes:d.notes||null,p_supersedes_id:d.supersedesId,
      });
      if(saved.error){await sb.storage.from(BUCKET).remove([path]);throw saved.error;}
      S.showForm=false;S.loaded=false;toast('검토중 새 버전을 비공개 보관했어요.');await load(true);
    }catch(error){note.className='parse-note warn';note.textContent=errorText[error.message]||`업로드하지 못했어요. ${error.message||''}`;}
    finally{S.uploading=false;host.querySelector('#archiveUpload')?.removeAttribute('disabled');}
  }
  async function openDocument(row){
    if(!row||MODE!=='db')return;
    const audit=await sb.rpc('record_settlement_document_access',{p_id:row.id,p_action:'download'});
    if(audit.error){toast(errorText[audit.error.message]||'문서 접근 기록을 남기지 못해 열기를 중단했어요',true);return;}
    const {data,error}=await sb.storage.from(BUCKET).createSignedUrl(row.storage_path,60,{download:row.file_name});
    if(error||!data?.signedUrl){toast('짧은 다운로드 링크를 만들지 못했어요',true);return;}
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }
  async function confirmDocument(row){
    if(!row||row.status!=='review'||!confirm('검토가 끝난 문서만 「확정」으로 표시해야 합니다. 확정할까요?'))return;
    const {error}=await sb.rpc('set_settlement_document_status',{p_id:row.id,p_status:'confirmed'});
    if(error){toast(errorText[error.message]||'상태를 바꾸지 못했어요',true);return;}
    S.loaded=false;toast('확정 상태로 표시했어요.');await load(true);
  }
  async function supersedeDocument(row){
    if(!row||row.status==='superseded'||!confirm('오류·구버전 문서에만 「대체됨」을 표시해야 합니다. 이 상태는 자료를 지우지 않으며 되돌릴 수 없습니다. 계속할까요?'))return;
    const {error}=await sb.rpc('set_settlement_document_status',{p_id:row.id,p_status:'superseded'});
    if(error){toast(errorText[error.message]||'상태를 바꾸지 못했어요',true);return;}
    S.loaded=false;toast('이전 문서를 대체됨 상태로 남겼어요.');await load(true);
  }
  function openTemplate(kind){
    if(window.__docs?.openSettlementTemplate)window.__docs.openSettlementTemplate(kind);
  }
  document.querySelectorAll('[data-settlement-template]').forEach(button=>button.addEventListener('click',()=>openTemplate(button.dataset.settlementTemplate)));
  window.SettlementArchiveUI={show:()=>load(false),reload:()=>load(true),state:()=>({rows:S.rows.slice(),loaded:S.loaded,error:S.error})};
  render();
})();
