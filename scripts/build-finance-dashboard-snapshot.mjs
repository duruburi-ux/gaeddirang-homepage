import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const INPUTS=['finance_dashboard_data_2026-10-12.json','metric_definitions_2026-10-12.json','sources_2026-10-12.json','validation_2026-10-12.json','finance_dashboard_transactions_2026-10-12.json','finance_dashboard_transaction_schema_2026-10-12.json','finance_dashboard_drilldown_validation_2026-10-12.json'];
const SCOPES=['team','duru','jini','dasom'];
const COMPONENT_LABELS={basic_activity_pay:'기본 활동비',work_and_program_share:'업무·프로그램 몫',living_support:'생활 보완금',old_royalty:'기존 인세',new_book_royalty:'새 책 인세',personal_book_sale:'개인 책 판매',cost_reimbursement:'비용 돌려받기'};
const METRIC_KEYS=['income','expense','receivable','payable','settlement','received','held_unsettled','scheduled','share'];
const SETTLEMENT_LABELS={confirmed:'계산 확정',not_prepared:'계산 미작성'};
const PAYMENT_LABELS={completed:'지급 완료',not_paid:'지급 전',not_paid_as_monthly_standalone:'월별 지급 전',not_applicable:'지급 해당 없음'};
const PERIOD=/^\d{4}-(0[1-9]|1[0-2])$/;
const HASH=/^[0-9a-f]{64}$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const RECORD_GRAINS=['bank_transaction','card_activity','invoice_document','tax_invoice_document','cash_evidence','cash_receipt_evidence','payroll_document'];
const DIRECTIONS=['inflow_or_positive_document','outflow_or_negative_document','zero'];
const SAFE_REMOVED_FIELDS=['description','account','vendor','representative','merchant'];

const sha256=value=>createHash('sha256').update(value).digest('hex');
const sum=values=>values.reduce((total,value)=>total+Number(value||0),0);
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const metric=(key,amount,availability,status,note='',calculation=[],evidenceIds=[],documentSelectors=[])=>({key,amount,availability,status,note,calculation,evidenceIds,documentIds:[],documentSelectors});
const pending=(key,note,status='review')=>metric(key,null,'pending',status,note);
const selector=(periodKey,subject='')=>({periodKey,subject,category:'internal_team'});
const stateNote=row=>`${SETTLEMENT_LABELS[row.settlement_status]||'계산 상태 확인 필요'} · ${PAYMENT_LABELS[row.payment_status]||'지급 상태 확인 필요'}`;

function sourceHash(registry,refs=[]){
  const hashes=[...new Set(refs)].map(id=>registry.get(id)?.sha256).filter(Boolean).sort();
  return hashes.length?sha256(hashes.join(':')):'';
}
function sourceLabel(refs=[]){
  if(refs.some(id=>id.startsWith('moneypin')))return '머니핀 검증 원천';
  if(refs.includes('account_view_xlsx'))return '개인통장 검증본';
  if(refs.includes('final_settlement_xlsx'))return '최종 정산 검증본';
  return '검증 원천';
}
function evidence(id,date,label,amount,kind,refs,registry,{included=true,status='verified',note=''}={}){
  return {id,date,label,amount,kind,source:sourceLabel(refs),status,included,note,sourceRefHash:sourceHash(registry,refs)};
}
function memberName(id,members){return members.find(row=>row.member_id===id)?.display_name||(id==='team_account'?'팀 계좌':id)}

function recordGroup(grain){
  if(grain==='bank_transaction')return 'bank';
  if(grain==='card_activity')return 'card';
  if(['invoice_document','tax_invoice_document'].includes(grain))return 'invoice';
  return 'other';
}
function reviewItems(drilldown,members){
  const items=[];
  for(const row of drilldown.open_items?.confirmed_not_sent||[]){
    const team=row.type==='team_settlement_payable';
    items.push({id:`open:${row.open_item_id}`,kind:team?'team_payable':'member_transfer',severity:'high',title:team?'확정 정산 · 아직 안 보냄':'개인 간 정산 · 아직 안 보냄',status:'확정·미지급',amount:row.amount,note:`${memberName(row.from,members)} → ${memberName(row.to,members)} · 거래 455행 합계에 다시 더하지 않음`});
  }
  for(const row of drilldown.open_items?.payment_evidence_missing||[])items.push({id:`open:${row.open_item_id}`,kind:'payment_evidence_missing',severity:'high',title:`외부 작가 ${row.party_count||0}명 지급 후보`,status:'송금 증거 없음',amount:row.amount,note:'미지급 확정으로 단정하지 않으며 거래 455행 합계에 다시 더하지 않음'});
  for(const row of drilldown.open_items?.allocation_pending_not_payable_yet||[])items.push({id:`open:${row.open_item_id}`,kind:'allocation_pending',severity:'high',title:'분배 전 팀 보관금',status:'나누는 기준 확인 전',amount:row.amount,note:`${memberName(row.holder,members)} 보관 · 미지급금이나 개인 소득으로 합산하지 않음`});
  return items;
}

export function buildSnapshot(data,definitions,sources,validation,drilldown={contract_version:'1.0.0',records_by_grain:{},month_profiles:[],evidence_issues:[],open_items:{}},drilldownSchema={contract_version:'1.0.0'},drilldownValidation={status:'passed',published_record_count:0,record_count_by_grain:{}}){
  assert(data?.contract_version==='1.0.0','FINANCE_CONTRACT_UNSUPPORTED');
  assert(definitions?.version==='1.0.0'&&definitions.currency==='KRW','FINANCE_DEFINITIONS_UNSUPPORTED');
  assert(sources?.read_only===true,'FINANCE_SOURCES_NOT_READ_ONLY');
  assert(validation?.status==='passed'&&validation.operational_sources_modified===false&&validation.source_hashes_unchanged===true,'FINANCE_VALIDATION_FAILED');
  assert(validation.checks?.company_profit_loss_values_are_null===true,'FINANCE_COMPANY_TOTAL_MUST_BE_NULL');
  assert(validation.checks?.current_team_bank_balance_is_null===true,'FINANCE_BANK_BALANCE_MUST_BE_NULL');
  assert(data.company?.current_team_bank_balance?.amount==null,'FINANCE_BANK_BALANCE_NOT_VERIFIED');
  assert(Array.isArray(data.available_periods)&&data.available_periods.every(key=>PERIOD.test(key)),'FINANCE_PERIODS_INVALID');
  assert(Array.isArray(data.members)&&data.members.length===3,'FINANCE_MEMBERS_INVALID');
  assert(data.members.every(row=>SCOPES.includes(row.member_id)&&row.months&&data.available_periods.every(key=>row.months[key])),'FINANCE_MEMBER_MONTHS_INVALID');
  const defined=new Set((definitions.metrics||[]).map(row=>row.metric_id));
  for(const key of ['share_total','team_money_already_received','outstanding_signed','team_money_held_by_member','member_personal_income','company_profit_loss','bank_cash_movement_reference_only','current_team_bank_balance'])assert(defined.has(key),`FINANCE_METRIC_MISSING:${key}`);
  const registry=new Map((sources.sources||[]).map(row=>[row.source_id,row]));
  const refs=[];JSON.stringify(data,(key,value)=>{if(key==='source_refs'&&Array.isArray(value))refs.push(...value);return value});
  for(const ref of new Set(refs))assert(registry.has(ref)&&HASH.test(String(registry.get(ref).sha256||'')),`FINANCE_SOURCE_REF_MISSING:${ref}`);
  const memberMonths=new Map();
  for(const member of data.members)data.available_periods.forEach(periodKey=>memberMonths.set(`${member.member_id}:${periodKey}`,member.months[periodKey]));
  assert(drilldown?.contract_version==='1.0.0'&&drilldownSchema?.contract_version==='1.0.0','FINANCE_DRILLDOWN_UNSUPPORTED');
  assert(drilldownValidation?.status==='passed'&&drilldownValidation.source_hashes_unchanged===true&&drilldownValidation.sensitive_fields_removed===true&&drilldownValidation.company_profit_loss_kept_null===true&&drilldownValidation.current_team_bank_balance_kept_null===true&&drilldownValidation.personal_settlement_not_recounted===true&&drilldownValidation.operational_sources_modified===false,'FINANCE_DRILLDOWN_VALIDATION_FAILED');
  const flattened=Object.values(drilldown.records_by_grain||{}).flat();
  assert(flattened.length===drilldownValidation.published_record_count,'FINANCE_DRILLDOWN_COUNT_MISMATCH');
  const recordIds=new Set(),transactionPeriods=new Map();
  for(const row of flattened){
    assert(typeof row.record_id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(row.record_id)&&!recordIds.has(row.record_id),'FINANCE_DRILLDOWN_ID_INVALID');recordIds.add(row.record_id);
    assert(RECORD_GRAINS.includes(row.record_grain)&&PERIOD.test(row.month)&&DATE.test(row.date)&&row.date.startsWith(row.month),'FINANCE_DRILLDOWN_GRAIN_INVALID');
    assert(DIRECTIONS.includes(row.direction)&&Number.isSafeInteger(row.amount)&&Number.isSafeInteger(row.tax),'FINANCE_DRILLDOWN_AMOUNT_INVALID');
    assert(row.include_in_company_profit_loss===false&&row.company_profit_loss_amount==null,'FINANCE_DRILLDOWN_PROFIT_LOSS_MUST_BE_NULL');
    assert(SAFE_REMOVED_FIELDS.every(field=>row.sensitive_fields_removed?.includes(field)),'FINANCE_DRILLDOWN_SENSITIVE_FIELDS_PRESENT');
    const source=registry.get(row.source_ref);assert(source&&HASH.test(String(source.sha256||''))&&HASH.test(String(row.source_record_hash||'')),'FINANCE_DRILLDOWN_SOURCE_INVALID');
    assert(typeof row.display_label==='string'&&row.display_label.trim()&&row.display_label.length<=160,'FINANCE_DRILLDOWN_LABEL_INVALID');
    const safe={id:row.record_id,date:row.date,direction:row.direction,amount:row.amount,tax:row.tax,label:row.display_label.trim(),group:recordGroup(row.record_grain),grain:row.record_grain,sourceType:String(row.source_type||'').slice(0,40),sourceTag:String(row.source_tag||'').slice(0,60),profitLossRole:String(row.profit_loss_role||'').slice(0,80),reviewStatus:String(row.review_status||'').slice(0,80),reason:String(row.reason||'').slice(0,300),sourceRow:Number.isInteger(row.source_row)&&row.source_row>0?row.source_row:null,evidenceLinkIds:(Array.isArray(row.evidence_link_ids)?row.evidence_link_ids:[]).slice(0,10),duplicateCandidateGroupId:String(row.duplicate_candidate_group_id||'').slice(0,128),includeInBankCashReference:row.include_in_bank_cash_reference===true,sourceRefHash:source.sha256,sourceRecordHash:row.source_record_hash};
    if(!transactionPeriods.has(row.month))transactionPeriods.set(row.month,[]);transactionPeriods.get(row.month).push(safe);
  }
  const profileMap=new Map((drilldown.month_profiles||[]).map(row=>[row.month,row]));
  const issues=(drilldown.evidence_issues||[]).map(row=>({id:`issue:${row.issue_id}`,severity:['high','medium','low'].includes(row.severity)?row.severity:'medium',status:String(row.status||'open').slice(0,80),title:String(row.title||'확인할 문제').slice(0,160),evidence:String(row.evidence||'').slice(0,300),action:String(row.dashboard_action||'').slice(0,300)}));
  const openItems=reviewItems(drilldown,data.members);

  const scheduleEvidence=(data.recommended_transfers_not_sent||[]).map((row,index)=>evidence(`schedule:${index+1}`,data.as_of,`${memberName(row.from,data.members)} → ${memberName(row.to,data.members)} 권장 이체`,row.amount,'scheduled',['final_settlement_xlsx'],registry,{note:'8·9월 합산 지급 제안 · 아직 보내지 않음'}));
  const completedEvidence=(data.actual_completed_transfers||[]).map(row=>evidence(`transfer:${row.transfer_id}`,row.transfer_date,`${memberName(row.from_member_id,data.members)} → ${memberName(row.to_member_id,data.members)} 실제 완료 이체`,row.amount,'received',row.source_refs,registry,{note:`정산 ${row.settlement_status} · 지급 ${row.payment_status} · 한 번만 계산`}));
  const holdingEvidence=(data.team_funds_held_by_members||[]).flatMap(group=>(group.items||[]).map((row,index)=>evidence(`holding:${group.holding_id}:${index+1}`,row.received_date,row.institution_or_item,row.amount,'held_unsettled',row.source_refs||group.source_refs,registry,{note:'개인 수입 아님 · 8·9월 확정 정산 미포함'})));
  const personalIncomeEvidence=(data.personal_income_excluded_from_team||[]).flatMap(group=>(group.receipts||[]).map((row,index)=>evidence(`personal:${group.fund_id}:${index+1}`,row.received_date,'팀 계산에서 제외한 개인 수입',row.amount,'income',group.source_refs,registry,{note:'개인 100% · 팀 수입 및 보관금 제외'})));

  const periods=data.available_periods.map(periodKey=>{
    const company=data.company.months.find(row=>row.month===periodKey),status=data.members.every(member=>member.months[periodKey].settlement_status==='confirmed')?'confirmed':'in_progress';
    assert(company,`FINANCE_COMPANY_MONTH_MISSING:${periodKey}`);
    const evidenceRows=[],scopes=[];
    const memberRows=data.members.map(member=>({member,month:memberMonths.get(`${member.member_id}:${periodKey}`)}));
    const teamSettlementEvidence=memberRows.filter(row=>Number.isSafeInteger(row.month.outstanding_signed)).map(({member,month})=>evidence(`settlement:${periodKey}:${member.member_id}`,`${periodKey}-28`,`${member.display_name} 월 정산 잔액`,month.outstanding_signed,'settlement',month.source_refs,registry,{note:stateNote(month)}));
    const teamShareEvidence=memberRows.filter(row=>Number.isSafeInteger(row.month.share_total)).map(({member,month})=>evidence(`share:${periodKey}:${member.member_id}`,`${periodKey}-28`,`${member.display_name} 이번 달 몫`,month.share_total,'share',month.source_refs,registry,{note:stateNote(month)}));
    const monthCompleted=completedEvidence.filter(row=>(data.actual_completed_transfers||[]).find(item=>`transfer:${item.transfer_id}`===row.id)?.belongs_to_settlement_month===periodKey);
    const monthHoldings=holdingEvidence.filter(row=>row.date.startsWith(periodKey));
    evidenceRows.push(...teamSettlementEvidence,...teamShareEvidence,...monthCompleted,...monthHoldings,...scheduleEvidence);
    const allConfirmed=memberRows.every(row=>row.month.settlement_status==='confirmed');
    const receivableRows=memberRows.filter(row=>Number.isSafeInteger(row.month.outstanding_signed)&&row.month.outstanding_signed<0);
    const payableRows=memberRows.filter(row=>Number.isSafeInteger(row.month.outstanding_signed)&&row.month.outstanding_signed>0);
    const financeRecords=transactionPeriods.get(periodKey)||[];
    const teamMetrics=[
      metric('income',null,'withheld','review',company.company_profit_loss.reason),
      metric('expense',null,'withheld','review',company.company_profit_loss.reason),
      allConfirmed?metric('receivable',sum(receivableRows.map(row=>Math.abs(row.month.outstanding_signed))),'verified','confirmed','확정 정산 중 구성원이 팀에 돌려줄 금액만 합산했습니다. 회사 전체 미수금은 아닙니다.',receivableRows.map(row=>({label:`${row.member.display_name} 정산`,amount:Math.abs(row.month.outstanding_signed),operator:'+'})),teamSettlementEvidence.filter(row=>row.amount<0).map(row=>row.id),[selector(periodKey)]):pending('receivable','월 정산이 확정되지 않아 정산 미수금을 계산하지 않았습니다.'),
      allConfirmed?metric('payable',sum(payableRows.map(row=>row.month.outstanding_signed)),'verified','confirmed','확정 정산 중 팀이 구성원에게 줄 금액만 합산했습니다. 회사 전체 미지급금은 아닙니다.',payableRows.map(row=>({label:`${row.member.display_name} 정산`,amount:row.month.outstanding_signed,operator:'+'})),teamSettlementEvidence.filter(row=>row.amount>0).map(row=>row.id),[selector(periodKey)]):pending('payable','월 정산이 확정되지 않아 정산 미지급금을 계산하지 않았습니다.'),
      allConfirmed?metric('settlement',sum(memberRows.map(row=>row.month.outstanding_signed)),'verified','confirmed','구성원별 양수·음수를 합친 순액입니다. 양수는 팀이 줄 돈, 음수는 구성원이 돌려줄 돈입니다.',teamSettlementEvidence.map(row=>({label:row.label,amount:row.amount,operator:'+'})),teamSettlementEvidence.map(row=>row.id),[selector(periodKey)]):pending('settlement','월 정산을 아직 확정하지 않았습니다.'),
      metric('received',sum(monthCompleted.map(row=>row.amount)),'verified',allConfirmed?'confirmed':'review','실제 완료가 확인된 이체만 합산했습니다.',[],monthCompleted.map(row=>row.id)),
      metric('held_unsettled',sum(monthHoldings.map(row=>row.amount)),'verified',status,'개인이 보관 중이지만 아직 누구 몫인지 나누지 않은 팀 돈입니다.',[],monthHoldings.map(row=>row.id)),
      metric('scheduled',sum(scheduleEvidence.map(row=>row.amount)),'verified','review','8·9월을 합쳐 만든 현재 권장 이체 3건이며 선택한 한 달의 지급액이 아닙니다. 아직 보내지 않았습니다.',[],scheduleEvidence.map(row=>row.id),[selector('2026-08'),selector('2026-09')]),
      allConfirmed?metric('share',sum(memberRows.map(row=>row.month.share_total)),'verified','confirmed','구성원별 확정 몫의 합계이며 회사 이익이나 계좌 잔액이 아닙니다.',teamShareEvidence.map(row=>({label:row.label,amount:row.amount,operator:'+'})),teamShareEvidence.map(row=>row.id),[selector(periodKey)]):pending('share','10월 전체 몫 계산을 아직 만들지 않았습니다.'),
    ];
    scopes.push({key:'team',metrics:teamMetrics});

    for(const {member,month} of memberRows){
      const memberEvidence=[...teamSettlementEvidence.filter(row=>row.id.endsWith(`:${member.member_id}`)),...teamShareEvidence.filter(row=>row.id.endsWith(`:${member.member_id}`))];
      const memberHolding=monthHoldings.filter(row=>(data.team_funds_held_by_members||[]).some(group=>group.holder_member_id===member.member_id&&row.id.startsWith(`holding:${group.holding_id}:`)));
      const memberIncome=personalIncomeEvidence.filter(row=>(data.personal_income_excluded_from_team||[]).some(group=>group.owner_member_id===member.member_id&&row.id.startsWith(`personal:${group.fund_id}:`))&&row.date.startsWith(periodKey));
      const memberSchedule=scheduleEvidence.filter(row=>{const raw=data.recommended_transfers_not_sent[Number(row.id.split(':')[1])-1];return raw.from===member.member_id||raw.to===member.member_id});
      const scheduledSigned=sum(memberSchedule.map(row=>{const raw=data.recommended_transfers_not_sent[Number(row.id.split(':')[1])-1];return raw.to===member.member_id?row.amount:-row.amount}));
      const memberCompleted=monthCompleted.filter(row=>{const raw=data.actual_completed_transfers.find(item=>`transfer:${item.transfer_id}`===row.id);return raw.from_member_id===member.member_id||raw.to_member_id===member.member_id});
      const actualReceived=Number.isSafeInteger(month.team_money_already_received)?month.team_money_already_received+Number(month.prior_settlement_received||0):null;
      const memberDocs=[selector(periodKey,member.legal_name)];
      const metrics=[
        metric('income',sum(memberIncome.map(row=>row.amount)),'verified',status,'확인된 개인 100% 수입만 표시하며 팀 수입·보관금에서 제외합니다.',[],memberIncome.map(row=>row.id)),
        metric('expense',null,'not_applicable',status,'현재 원천은 개인 지출 장부를 제공하지 않습니다.'),
        Number.isSafeInteger(month.outstanding_signed)?metric('receivable',month.outstanding_signed<0?Math.abs(month.outstanding_signed):0,'verified','confirmed',month.outstanding_signed<0?'확정 정산 기준으로 구성원이 팀에 돌려줄 돈입니다.':'이 달 확정 정산에서 팀에 돌려줄 돈은 없습니다.',[],memberEvidence.filter(row=>row.id.startsWith('settlement:')).map(row=>row.id),memberDocs):pending('receivable',month.reason||'이 달 정산 미수금을 아직 확인하지 못했습니다.'),
        Number.isSafeInteger(month.outstanding_signed)?metric('payable',month.outstanding_signed>0?month.outstanding_signed:0,'verified','confirmed',month.outstanding_signed>0?'확정 정산 기준으로 팀에서 받을 돈입니다.':'이 달 확정 정산에서 팀에게 받을 돈은 없습니다.',[],memberEvidence.filter(row=>row.id.startsWith('settlement:')).map(row=>row.id),memberDocs):pending('payable',month.reason||'이 달 정산 미지급금을 아직 확인하지 못했습니다.'),
        Number.isSafeInteger(month.outstanding_signed)?metric('settlement',month.outstanding_signed,'verified','confirmed',`${stateNote(month)}입니다. 양수는 팀이 줄 돈, 음수는 구성원이 돌려줄 돈입니다.`,[],memberEvidence.filter(row=>row.id.startsWith('settlement:')).map(row=>row.id),memberDocs):pending('settlement',month.reason||'이 달 정산을 아직 만들지 않았습니다.'),
        actualReceived==null?pending('received',month.reason||'실제 수령 근거를 확인해야 합니다.'):metric('received',actualReceived,'verified','confirmed','개인 통장으로 이미 받은 팀 돈과 이전에 실제 받은 정산금을 합쳤습니다. 지급 완료 상태와 별도로 확인합니다.',[{label:'개인 통장으로 이미 받은 팀 돈',amount:month.team_money_already_received,operator:'+'},{label:'전에 실제 받은 정산금',amount:Number(month.prior_settlement_received||0),operator:'+'}],memberCompleted.map(row=>row.id),memberDocs),
        metric('held_unsettled',sum(memberHolding.map(row=>row.amount)),'verified',status,'개인 수입이 아니라 아직 배분하지 않은 팀 돈입니다.',[],memberHolding.map(row=>row.id)),
        metric('scheduled',scheduledSigned,'verified','review','8·9월 합산 권장 이체입니다. 양수는 받을 돈, 음수는 보낼 돈이며 아직 완료되지 않았습니다.',[],memberSchedule.map(row=>row.id),[selector('2026-08',member.legal_name),selector('2026-09',member.legal_name)]),
        Number.isSafeInteger(month.share_total)?metric('share',month.share_total,'verified','confirmed','활동비·프로그램 몫·인세·개인 책 판매·비용 돌려받기의 합계이며 현재 통장 잔액이 아닙니다.',Object.entries(month.share_components||{}).map(([key,amount])=>({label:COMPONENT_LABELS[key]||key,amount,operator:'+'})),memberEvidence.filter(row=>row.id.startsWith('share:')).map(row=>row.id),memberDocs):pending('share',month.reason||'이 달 개인 몫을 아직 계산하지 않았습니다.'),
      ];
      assert(metrics.map(row=>row.key).every(key=>METRIC_KEYS.includes(key)),'FINANCE_METRIC_KEY_INVALID');
      scopes.push({key:member.member_id,metrics});evidenceRows.push(...memberEvidence,...memberHolding,...memberIncome,...memberSchedule,...memberCompleted);
    }
    const movement=company.bank_cash_movement_reference_only,profile=profileMap.get(periodKey),bankRows=financeRecords.filter(row=>row.grain==='bank_transaction');
    if(movement){assert(profile&&financeRecords.length===profile.source_row_count,'FINANCE_RECORD_COUNT_MISMATCH');assert(bankRows.length===movement.row_count&&bankRows.every(row=>row.includeInBankCashReference),'FINANCE_BANK_TRANSACTION_COUNT_MISMATCH');assert(sum(bankRows.filter(row=>row.direction==='inflow_or_positive_document').map(row=>Math.abs(row.amount)))===movement.inflow,'FINANCE_BANK_TRANSACTION_INFLOW_MISMATCH');assert(sum(bankRows.filter(row=>row.direction==='outflow_or_negative_document').map(row=>Math.abs(row.amount)))===movement.outflow,'FINANCE_BANK_TRANSACTION_OUTFLOW_MISMATCH');}
    else assert(financeRecords.length===0,'FINANCE_RECORDS_WITHOUT_MONTH_SOURCE');
    const warnings=[company.company_profit_loss.reason,movement?.warning,status==='in_progress'?'이 달 전체 정산은 진행 중입니다. 확인된 별도 보관금·개인 수입만 따로 표시합니다.':'확정 정산과 실제 지급 완료를 한 상태로 합치지 않습니다.'];
    if(periodKey==='2026-10')warnings.push('개인 100% 수입은 팀 수입과 팀 보관금에서 제외합니다.');
    const coverage=movement?{included:['확정 정산 계산','확인된 실제 입금',`머니핀 월별 거래·증빙 ${financeRecords.length}행`],pending:['거래 간 중복·연결 확정','회사 수입·지출 확정','최신 팀 계좌 잔액']}:{included:['확인된 별도 보관금','확인된 개인 100% 수입'],pending:[`${Number(periodKey.slice(5))}월 머니핀 월별 거래내역`,'전체 월 정산','거래 간 중복·연결 확정','회사 수입·지출 확정','최신 팀 계좌 잔액']};
    return {key:periodKey,label:`${periodKey.slice(0,4)}년 ${Number(periodKey.slice(5))}월`,status,sourceAsOf:data.as_of,coverage,teamAccountBalance:{amount:null,availability:'pending',note:data.company.current_team_bank_balance.reason},bankMovement:movement?{availability:'verified',inflow:movement.inflow,outflow:movement.outflow,netChange:movement.net_change,rowCount:movement.row_count,note:movement.warning}:{availability:'pending',note:'이 달 월별 은행계좌 참고값이 준비되지 않았습니다.'},financeRecords,warnings:[...new Set(warnings.filter(Boolean))],scopes,evidence:[...new Map(evidenceRows.map(row=>[row.id,row])).values()],documents:[]};
  });
  return {schemaVersion:1,generatedAt:`${data.as_of}T00:00:00+09:00`,sourceScope:'머니핀 8~9월 455행 확인, 그 밖 기간 미확인',openItems,evidenceIssues:issues,periods};
}

export function loadBundle(directory){
  const buffers=INPUTS.map(name=>{const path=join(directory,name);assert(existsSync(path),`FINANCE_INPUT_MISSING:${name}`);return [name,readFileSync(path)]});
  const parsed=Object.fromEntries(buffers.map(([name,buffer])=>[name,JSON.parse(buffer.toString('utf8'))]));
  const sourceFile=parsed['sources_2026-10-12.json'];
  for(const row of sourceFile.sources||[]){assert(existsSync(row.path),`FINANCE_ORIGINAL_SOURCE_MISSING:${row.source_id}`);assert(sha256(readFileSync(row.path))===row.sha256,`FINANCE_ORIGINAL_SOURCE_CHANGED:${row.source_id}`)}
  const payload=buildSnapshot(parsed['finance_dashboard_data_2026-10-12.json'],parsed['metric_definitions_2026-10-12.json'],sourceFile,parsed['validation_2026-10-12.json'],parsed['finance_dashboard_transactions_2026-10-12.json'],parsed['finance_dashboard_transaction_schema_2026-10-12.json'],parsed['finance_dashboard_drilldown_validation_2026-10-12.json']);
  const bundleHash=sha256(Buffer.concat(buffers.flatMap(([name,buffer])=>[Buffer.from(name),buffer])));
  return {sourceAsOf:parsed['finance_dashboard_data_2026-10-12.json'].as_of,sourceSha256:bundleHash,validationStatus:parsed['validation_2026-10-12.json'].status,payload};
}

const invoked=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(invoked){
  const directory=process.argv[2],outIndex=process.argv.indexOf('--out'),outPath=outIndex>=0?process.argv[outIndex+1]:'';
  if(!directory)throw Error('usage: node scripts/build-finance-dashboard-snapshot.mjs SOURCE_DIR [--out PRIVATE_OUTPUT.json]');
  const bundle=loadBundle(directory);
  if(outPath){assert(!existsSync(outPath),'FINANCE_OUTPUT_EXISTS');writeFileSync(outPath,JSON.stringify(bundle,null,2)+'\n',{mode:0o600,flag:'wx'});}
  console.log(`finance snapshot valid: periods=${bundle.payload.periods.length} scopes=${SCOPES.length} validation=${bundle.validationStatus} source=${bundle.sourceSha256.slice(0,12)}`);
}
