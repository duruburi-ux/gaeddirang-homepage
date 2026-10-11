(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.FinanceDashboardModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SCOPES={
    team:'팀 전체',
    duru:'두루',
    jini:'진이',
    dasom:'다솜',
  };
  const METRICS=[
    {key:'income',label:'수입',help:'내부 이체를 제외하고 거래 근거가 확인된 수입'},
    {key:'expense',label:'지출',help:'중복 제거 근거가 확인된 사업 지출'},
    {key:'receivable',label:'정산 미수금',help:'확정 정산 중 구성원이 팀에 돌려줄 금액'},
    {key:'payable',label:'정산 미지급금',help:'확정 정산 중 팀이 구성원에게 줄 금액'},
    {key:'settlement',label:'정산',help:'확정 문서의 계산액이며 지급 완료와 다름'},
    {key:'received',label:'실제 받은 돈',help:'입금 근거로 실제 수령이 확인된 금액'},
    {key:'held_unsettled',label:'개인 보관 중인 미정산금',help:'팀 귀속이지만 개인이 보관 중인 미정산금'},
    {key:'scheduled',label:'지급 예정',help:'지급할 대상으로 확인됐지만 아직 지급 완료가 아닌 금액'},
    {key:'share',label:'내 몫',help:'확정된 계산 규칙으로 산출한 개인 귀속액'},
  ];
  const PERIOD_STATES={confirmed:'확정',in_progress:'진행 중',review:'검토 중'};
  const AVAILABILITY={verified:'근거 확인',pending:'확인 필요',withheld:'집계 보류',not_applicable:'해당 없음'};
  const ID=/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/;
  const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
  const HASH=/^[0-9a-f]{64}$/;
  const DIRECTIONS=['inflow_or_positive_document','outflow_or_negative_document','zero'];
  const GROUPS=['bank','card','invoice','other'];
  const GRAINS=['bank_transaction','card_activity','invoice_document','tax_invoice_document','cash_evidence','cash_receipt_evidence','payroll_document'];
  const text=(value,max=240)=>String(value??'').trim().slice(0,max);
  const safeId=value=>ID.test(String(value||''))?String(value):'';
  const safeAmount=value=>Number.isSafeInteger(value)&&Math.abs(value)<=999999999999?value:null;
  const safeDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const safeStatus=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
  const unique=values=>[...new Set(values.filter(Boolean))];

  function emptyMetric(definition,periodKey,scope){
    return {...definition,periodKey,scope,amount:null,availability:'pending',status:'review',calculation:[],evidenceIds:[],documentIds:[],documentSelectors:[],note:'검증된 원천이 연결되지 않았습니다.'};
  }

  function normalizeMetric(row,periodKey,scope,definition){
    if(!row||row.key!==definition.key)return emptyMetric(definition,periodKey,scope);
    const availability=safeStatus(row.availability,Object.keys(AVAILABILITY),'pending');
    return {
      ...definition,periodKey,scope,
      amount:availability==='verified'?safeAmount(row.amount):null,
      availability,status:safeStatus(row.status,Object.keys(PERIOD_STATES),'review'),
      calculation:Array.isArray(row.calculation)?row.calculation.slice(0,20).map(item=>({label:text(item?.label,100),amount:safeAmount(item?.amount),operator:['+','-','='].includes(item?.operator)?item.operator:''})).filter(item=>item.label):[],
      evidenceIds:unique((Array.isArray(row.evidenceIds)?row.evidenceIds:[]).slice(0,100).map(safeId)),
      documentIds:unique((Array.isArray(row.documentIds)?row.documentIds:[]).slice(0,30).map(safeId)),
      documentSelectors:(Array.isArray(row.documentSelectors)?row.documentSelectors:[]).slice(0,20).map(item=>({
        periodKey:PERIOD.test(String(item?.periodKey||''))?String(item.periodKey):'',
        subject:text(item?.subject,120),
        category:safeStatus(item?.category,['external_author','internal_team','company_report'],'internal_team'),
        sha256:HASH.test(String(item?.sha256||''))?String(item.sha256):'',
      })).filter(item=>item.periodKey||item.subject||item.sha256),
      note:text(row.note,300)||(availability==='withheld'?'중복 제거 또는 귀속 근거가 부족해 합계를 보류했습니다.':availability==='pending'?'확인할 근거가 남아 있습니다.':''),
    };
  }

  function normalizeEvidence(row){
    const id=safeId(row?.id);if(!id)return null;
    return {
      id,date:safeDate(row.date),label:text(row.label,140)||'거래 근거',amount:safeAmount(row.amount),
      kind:safeStatus(row.kind,['income','expense','internal_transfer','settlement','received','held_unsettled','scheduled','share'],'income'),
      source:text(row.source,100)||'원천 미표시',status:safeStatus(row.status,['verified','pending','excluded'],'pending'),
      included:row.included===true,note:text(row.note,300),sourceRefHash:HASH.test(String(row.sourceRefHash||''))?String(row.sourceRefHash):'',
    };
  }

  function normalizeDocument(row){
    const id=safeId(row?.id);if(!id)return null;
    return {id,title:text(row.title,180)||'정산 문서',periodLabel:text(row.periodLabel,80),status:safeStatus(row.status,['review','confirmed','superseded'],'review'),versionNo:Number.isInteger(row.versionNo)&&row.versionNo>0?row.versionNo:null};
  }

  function normalizeFinanceRecord(row){
    const id=safeId(row?.id),date=safeDate(row?.date),direction=safeStatus(row?.direction,DIRECTIONS,''),group=safeStatus(row?.group,GROUPS,''),grain=safeStatus(row?.grain,GRAINS,'');
    const amount=safeAmount(row?.amount),tax=safeAmount(row?.tax),label=text(row?.label,160);
    if(!id||!date||!direction||!group||!grain||!Number.isSafeInteger(amount)||!Number.isSafeInteger(tax)||!label)return null;
    return {id,date,direction,amount,tax,label,group,grain,sourceType:text(row.sourceType,40),sourceTag:text(row.sourceTag,60),profitLossRole:text(row.profitLossRole,80),reviewStatus:text(row.reviewStatus,80),reason:text(row.reason,300),sourceRow:Number.isInteger(row.sourceRow)&&row.sourceRow>0?row.sourceRow:null,evidenceLinkIds:unique((Array.isArray(row.evidenceLinkIds)?row.evidenceLinkIds:[]).slice(0,10).map(safeId)),duplicateCandidateGroupId:safeId(row.duplicateCandidateGroupId),includeInBankCashReference:row.includeInBankCashReference===true,sourceRefHash:HASH.test(String(row.sourceRefHash||''))?String(row.sourceRefHash):'',sourceRecordHash:HASH.test(String(row.sourceRecordHash||''))?String(row.sourceRecordHash):''};
  }

  function normalizeOpenItem(row){
    const id=safeId(row?.id),amount=safeAmount(row?.amount);if(!id||!Number.isSafeInteger(amount))return null;
    return {id,kind:text(row.kind,80),severity:safeStatus(row.severity,['high','medium','low'],'medium'),title:text(row.title,160)||'확인할 항목',status:text(row.status,80),amount,note:text(row.note,300)};
  }

  function normalizeIssue(row){
    const id=safeId(row?.id);if(!id)return null;
    return {id,severity:safeStatus(row.severity,['high','medium','low'],'medium'),status:text(row.status,80),title:text(row.title,160)||'확인할 문제',evidence:text(row.evidence,300),action:text(row.action,300)};
  }

  function normalizePeriod(row){
    const key=PERIOD.test(String(row?.key||''))?String(row.key):'';if(!key)return null;
    const status=safeStatus(row.status,Object.keys(PERIOD_STATES),'review');
    const evidence=(Array.isArray(row.evidence)?row.evidence:[]).map(normalizeEvidence).filter(Boolean);
    const documents=(Array.isArray(row.documents)?row.documents:[]).map(normalizeDocument).filter(Boolean);
    const scopeRows=Array.isArray(row.scopes)?row.scopes:[];
    const scopes={};
    for(const scope of Object.keys(SCOPES)){
      const source=scopeRows.find(item=>item?.key===scope)||{};
      const metricRows=Array.isArray(source.metrics)?source.metrics:[];
      scopes[scope]={key:scope,label:SCOPES[scope],metrics:METRICS.map(def=>normalizeMetric(metricRows.find(item=>item?.key===def.key),key,scope,def))};
    }
    const balance=row.teamAccountBalance||{},movement=row.bankMovement||{},coverage=row.coverage||{};
    return {
      key,label:text(row.label,40)||`${Number(key.slice(5))}월`,status,statusLabel:PERIOD_STATES[status],
      sourceAsOf:text(row.sourceAsOf,40),scopes,evidence,documents,
      coverage:{included:(Array.isArray(coverage.included)?coverage.included:[]).slice(0,12).map(value=>text(value,120)).filter(Boolean),pending:(Array.isArray(coverage.pending)?coverage.pending:[]).slice(0,12).map(value=>text(value,120)).filter(Boolean)},
      teamAccountBalance:{amount:balance.availability==='verified'?safeAmount(balance.amount):null,availability:safeStatus(balance.availability,Object.keys(AVAILABILITY),'pending'),note:text(balance.note,300)||'은행 잔액 근거를 확인해야 합니다.'},
      bankMovement:movement.availability==='verified'?{availability:'verified',inflow:safeAmount(movement.inflow),outflow:safeAmount(movement.outflow),netChange:safeAmount(movement.netChange),rowCount:Number.isInteger(movement.rowCount)&&movement.rowCount>=0?movement.rowCount:null,note:text(movement.note,300)}:{availability:'pending',inflow:null,outflow:null,netChange:null,rowCount:null,note:text(movement.note,300)||'월별 은행계좌 행 참고값이 준비되지 않았습니다.'},
      financeRecords:(Array.isArray(row.financeRecords)?row.financeRecords:[]).map(normalizeFinanceRecord).filter(Boolean),
      warnings:(Array.isArray(row.warnings)?row.warnings:[]).slice(0,20).map(value=>text(value,300)).filter(Boolean),
    };
  }

  function normalizePayload(payload){
    if(!payload||typeof payload!=='object'||Number(payload.schemaVersion)!==1)throw Error('FINANCE_SCHEMA_UNSUPPORTED');
    const periods=(Array.isArray(payload.periods)?payload.periods:[]).map(normalizePeriod).filter(Boolean).sort((a,b)=>b.key.localeCompare(a.key));
    if(!periods.length)throw Error('FINANCE_PERIODS_EMPTY');
    return {schemaVersion:1,generatedAt:text(payload.generatedAt,40),sourceScope:text(payload.sourceScope,120),openItems:(Array.isArray(payload.openItems)?payload.openItems:[]).map(normalizeOpenItem).filter(Boolean),evidenceIssues:(Array.isArray(payload.evidenceIssues)?payload.evidenceIssues:[]).map(normalizeIssue).filter(Boolean),periods};
  }

  function period(model,key){return model.periods.find(item=>item.key===key)||model.periods[0]||null;}
  function metric(model,periodKey,scope,key){return period(model,periodKey)?.scopes?.[scope]?.metrics.find(item=>item.key===key)||null;}
  function details(model,periodKey,scope,key){
    const p=period(model,periodKey),m=metric(model,periodKey,scope,key);if(!p||!m)return {metric:m,evidence:[],documents:[]};
    const ids=new Set(m.evidenceIds),docIds=new Set(m.documentIds);
    return {metric:m,evidence:p.evidence.filter(item=>ids.has(item.id)),documents:p.documents.filter(item=>docIds.has(item.id))};
  }
  function formatWon(value){return Number.isSafeInteger(value)?`${new Intl.NumberFormat('ko-KR').format(value)}원`:'—';}

  return {SCOPES,METRICS,PERIOD_STATES,AVAILABILITY,normalizePayload,period,metric,details,formatWon};
});
