(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.SettlementDocumentModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const CATEGORIES={
    external_author:'작가별 외부 정산',
    internal_team:'내부 팀 정산',
    company_report:'회사 보고서',
  };
  const STATUSES={review:'검토중',confirmed:'확정',superseded:'대체됨'};
  const MIME_BY_EXT={
    pdf:'application/pdf',
    docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    json:'application/json',
    md:'text/markdown',
  };
  const MAX_FILE_BYTES=20*1024*1024;

  function safeFileName(value){
    const name=String(value||'').normalize('NFC').replace(/[\\/\0\r\n]/g,'_').replace(/\s+/g,' ').trim();
    return name.slice(0,180);
  }
  function fileExtension(value){
    const hit=safeFileName(value).toLowerCase().match(/\.([a-z0-9]+)$/);
    return hit?hit[1]:'';
  }
  function storageObjectName(value){
    const ext=fileExtension(value);
    return ext?`document.${ext}`:'document';
  }
  function formatBytes(value){
    const bytes=Number(value)||0;
    if(bytes<1024)return `${bytes} B`;
    if(bytes<1024*1024)return `${Math.round(bytes/1024)} KB`;
    return `${(bytes/1024/1024).toFixed(1)} MB`;
  }
  function normalizeRow(row){
    return {
      ...row,
      version_no:Number(row.version_no)||1,
      size_bytes:Number(row.size_bytes)||0,
      period_start:row.period_start||null,
      period_end:row.period_end||null,
      notes:String(row.notes||''),
    };
  }
  function validateDraft(input,file){
    const draft={
      category:String(input.category||''),
      subject:String(input.subject||'').trim(),
      title:String(input.title||'').trim(),
      periodStart:String(input.periodStart||''),
      periodEnd:String(input.periodEnd||''),
      periodLabel:String(input.periodLabel||'').trim(),
      notes:String(input.notes||'').trim(),
      supersedesId:input.supersedesId||null,
    };
    const errors=[];
    if(!CATEGORIES[draft.category])errors.push('문서 분류를 선택해 주세요.');
    if(!draft.subject)errors.push('정산 대상 또는 보고 대상을 입력해 주세요.');
    if(!draft.title)errors.push('문서 제목을 입력해 주세요.');
    if(!draft.periodLabel)errors.push('기간 표시를 입력해 주세요.');
    if((draft.periodStart&&!/^\d{4}-\d{2}-\d{2}$/.test(draft.periodStart))||(draft.periodEnd&&!/^\d{4}-\d{2}-\d{2}$/.test(draft.periodEnd)))errors.push('기간 날짜 형식을 확인해 주세요.');
    if(draft.periodStart&&draft.periodEnd&&draft.periodStart>draft.periodEnd)errors.push('기간 종료일은 시작일보다 빠를 수 없습니다.');
    if(!file)errors.push('보관할 PDF·DOCX·XLSX·JSON·MD 파일을 선택해 주세요.');
    else {
      const ext=fileExtension(file.name);
      if(!MIME_BY_EXT[ext])errors.push('PDF·DOCX·XLSX·JSON·MD 파일만 보관할 수 있습니다.');
      if(!Number(file.size)||file.size>MAX_FILE_BYTES)errors.push('파일은 20MB 이하인지 확인해 주세요.');
      draft.fileName=safeFileName(file.name);
      draft.mimeType=MIME_BY_EXT[ext]||String(file.type||'application/octet-stream');
      draft.sizeBytes=Number(file.size)||0;
    }
    if(draft.notes.length>1000)errors.push('메모는 1,000자 이하로 입력해 주세요.');
    return {ok:errors.length===0,errors,draft};
  }
  function canReplace(previous,next){
    if(!previous)return true;
    return previous.category===next.category
      &&String(previous.subject||'').trim()===next.subject
      &&String(previous.period_label||'').trim()===next.periodLabel
      &&String(previous.title||'').trim()===next.title;
  }
  function groupRows(rows){
    const out={external_author:[],internal_team:[],company_report:[]};
    (rows||[]).map(normalizeRow).forEach(row=>{if(out[row.category])out[row.category].push(row);});
    const chronology=row=>String(row.period_end||row.period_start||row.created_at||'');
    Object.values(out).forEach(group=>group.sort((a,b)=>chronology(b).localeCompare(chronology(a))||String(b.period_label).localeCompare(String(a.period_label),'ko')||String(a.subject).localeCompare(String(b.subject),'ko')||b.version_no-a.version_no));
    return out;
  }
  function previewRows(){
    return [
      {id:'preview-author-v2',series_id:'preview-author-series',version_no:2,category:'external_author',period_label:'2026년 3분기',subject:'가상작가 가',title:'가상도서 인세 정산서',status:'confirmed',file_name:'2026Q3_가상작가가_인세정산서.pdf',mime_type:MIME_BY_EXT.pdf,size_bytes:84231,created_at:'2026-10-10T09:00:00Z'},
      {id:'preview-author-v1',series_id:'preview-author-series',version_no:1,category:'external_author',period_label:'2026년 3분기',subject:'가상작가 가',title:'가상도서 인세 정산서',status:'superseded',file_name:'2026Q3_가상작가가_인세정산서_초안.pdf',mime_type:MIME_BY_EXT.pdf,size_bytes:81024,created_at:'2026-10-09T09:00:00Z'},
      {id:'preview-team-v1',series_id:'preview-team-series',version_no:1,category:'internal_team',period_label:'2026년 8~9월',subject:'가상 팀',title:'월간 내부 정산 상세',status:'review',file_name:'가상팀_8·9월_내부정산_상세.pdf',mime_type:MIME_BY_EXT.pdf,size_bytes:120412,created_at:'2026-10-10T08:00:00Z'},
      {id:'preview-company-v1',series_id:'preview-company-series',version_no:1,category:'company_report',period_label:'2026년 8~9월',subject:'가상 회사',title:'운영 자금 보고서',status:'review',file_name:'가상회사_운영자금보고서.pdf',mime_type:MIME_BY_EXT.pdf,size_bytes:153901,created_at:'2026-10-10T07:00:00Z'},
    ];
  }

  return {CATEGORIES,STATUSES,MIME_BY_EXT,MAX_FILE_BYTES,safeFileName,fileExtension,storageObjectName,formatBytes,normalizeRow,validateDraft,canReplace,groupRows,previewRows};
});
