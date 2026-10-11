import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSnapshot} from '../scripts/build-finance-dashboard-snapshot.mjs';

const metricIds=['share_total','team_money_already_received','outstanding_signed','team_money_held_by_member','member_personal_income','company_profit_loss','bank_cash_movement_reference_only','current_team_bank_balance'];
const sourceHash='a'.repeat(64);
const sources={read_only:true,sources:[{source_id:'final_settlement_xlsx',sha256:sourceHash,path:'/private/not-exported.xlsx'},{source_id:'account_view_xlsx',sha256:'b'.repeat(64),path:'/private/not-exported-2.xlsx'},{source_id:'moneypin_raw_2026_09',sha256:'c'.repeat(64),path:'/private/not-exported-3.xlsx'}]};
const validation={status:'passed',operational_sources_modified:false,source_hashes_unchanged:true,checks:{company_profit_loss_values_are_null:true,current_team_bank_balance_is_null:true}};
const month={settlement_status:'confirmed',payment_status:'not_paid_as_monthly_standalone',share_components:{basic_activity_pay:10000,work_and_program_share:20000},share_total:30000,team_money_already_received:12000,prior_settlement_received:0,prior_settlement_sent:0,outstanding_signed:18000,source_refs:['final_settlement_xlsx']};
const data={contract_version:'1.0.0',as_of:'2026-10-12',available_periods:['2026-09'],company:{months:[{month:'2026-09',company_profit_loss:{income:null,expense:null,net_profit_loss:null,status:'unconfirmed',reason:'합성 자료도 중복 제거 전에는 합산하지 않습니다.'},bank_cash_movement_reference_only:{row_count:2,inflow:80000,outflow:35000,net_change:45000,warning:'합성 은행행 참고값이며 손익·잔액이 아닙니다.'}}],current_team_bank_balance:{amount:null,status:'unconfirmed',reason:'합성 은행 잔액 근거가 없습니다.'}},members:['duru','jini','dasom'].map((id,index)=>({member_id:id,display_name:`가상${index+1}`,legal_name:`가상인물${index+1}`,months:{'2026-09':{...month}}})),actual_completed_transfers:[],recommended_transfers_not_sent:[],team_funds_held_by_members:[],personal_income_excluded_from_team:[]};
const definitions={version:'1.0.0',currency:'KRW',metrics:metricIds.map(metric_id=>({metric_id}))};
const removed=['description','account','vendor','representative','merchant'];
const record=(id,grain,direction,amount,row)=>({record_id:id,record_grain:grain,month:'2026-09',date:`2026-09-0${row}`,source_type:grain==='bank_transaction'?'은행계좌':grain==='card_activity'?'카드':'계산서',source_tag:'매출',amount,tax:0,direction,display_label:'합성 비민감 거래',cash_flow_role:grain==='bank_transaction'?(direction.startsWith('inflow')?'bank_inflow':'bank_outflow'):'not_bank_cash',profit_loss_role:'candidate_income',review_status:'needs_final_classification',reason:'합성 분류 확인',evidence_link_ids:[],duplicate_candidate_group_id:null,include_in_company_profit_loss:false,company_profit_loss_amount:null,include_in_bank_cash_reference:grain==='bank_transaction',source_row:row,source_record_hash:String(row).repeat(64).slice(0,64),source_ref:'moneypin_raw_2026_09',sensitive_fields_removed:removed});
const drilldown={contract_version:'1.0.0',records_by_grain:{bank_transactions:[record('row-1','bank_transaction','inflow_or_positive_document',80000,1),record('row-2','bank_transaction','outflow_or_negative_document',-35000,2)],card_activity:[record('row-3','card_activity','outflow_or_negative_document',-10000,3)],invoice_documents:[record('row-4','invoice_document','outflow_or_negative_document',-10000,4)]},month_profiles:[{month:'2026-09',source_row_count:4}],evidence_issues:[{issue_id:'mixed',severity:'high',status:'open',title:'합성 종류 혼합',evidence:'서로 다른 자료',dashboard_action:'나눠 보기'}],open_items:{confirmed_not_sent:[{open_item_id:'team_to_duru',type:'team_settlement_payable',from:'team_account',to:'duru',amount:18000}],payment_evidence_missing:[],allocation_pending_not_payable_yet:[]}};
const drilldownSchema={contract_version:'1.0.0'};
const drilldownValidation={status:'passed',source_hashes_unchanged:true,sensitive_fields_removed:true,company_profit_loss_kept_null:true,current_team_bank_balance_kept_null:true,personal_settlement_not_recounted:true,operational_sources_modified:false,published_record_count:4,record_count_by_grain:{bank_transactions:2,card_activity:1,invoice_documents:1,other_evidence:0}};
const args=()=>[data,definitions,sources,validation,drilldown,drilldownSchema,drilldownValidation];

test('검증 원천을 UI 계약으로 바꾸되 회사 손익·잔액은 추정하지 않고 455행형 상세를 분리한다',()=>{
  const payload=buildSnapshot(...args()),period=payload.periods[0],team=period.scopes.find(row=>row.key==='team');
  assert.equal(team.metrics.find(row=>row.key==='income').availability,'withheld');assert.equal(team.metrics.find(row=>row.key==='income').amount,null);assert.equal(period.teamAccountBalance.amount,null);
  assert.deepEqual(period.bankMovement,{availability:'verified',inflow:80000,outflow:35000,netChange:45000,rowCount:2,note:'합성 은행행 참고값이며 손익·잔액이 아닙니다.'});
  assert.equal(period.financeRecords.length,4);assert.equal(period.financeRecords.filter(row=>row.group==='bank').length,2);
  assert.deepEqual(period.coverage.pending,['거래 간 중복·연결 확정','회사 수입·지출 확정','최신 팀 계좌 잔액']);assert.match(payload.sourceScope,/455행 확인/);assert.equal(payload.openItems[0].amount,18000);assert.equal(payload.evidenceIssues[0].title,'합성 종류 혼합');
});

test('정산 계산 상태와 지급 상태를 합치지 않고 개인 몫·받은 팀 돈·남은 돈을 따로 만든다',()=>{
  const payload=buildSnapshot(...args()),person=payload.periods[0].scopes.find(row=>row.key==='duru'),byKey=Object.fromEntries(person.metrics.map(row=>[row.key,row]));
  assert.equal(byKey.share.amount,30000);assert.equal(byKey.received.amount,12000);assert.equal(byKey.settlement.amount,18000);assert.match(byKey.settlement.note,/계산 확정/);assert.match(byKey.settlement.note,/월별 지급 전/);assert.equal(byKey.expense.availability,'not_applicable');assert.equal(byKey.payable.amount,18000);assert.equal(byKey.receivable.amount,0);
  assert.equal(byKey.settlement.documentSelectors[0].subject,'가상1 본인 검토');
});

test('private snapshot에는 원천 경로·민감 원문을 내보내지 않고 공개 seed도 만들지 않는다',()=>{
  const payload=buildSnapshot(...args()),serialized=JSON.stringify(payload);assert.doesNotMatch(serialized,/\/private\/not-exported/);assert.doesNotMatch(serialized,/path/);assert.match(payload.periods[0].financeRecords[0].sourceRefHash,/^[0-9a-f]{64}$/);
});

test('회사 손익 또는 잔액이 검증 없이 채워지면 fail-closed 한다',()=>{
  const changedValidation={...validation,checks:{...validation.checks,company_profit_loss_values_are_null:false}};assert.throws(()=>buildSnapshot(data,definitions,sources,changedValidation,drilldown,drilldownSchema,drilldownValidation),/FINANCE_COMPANY_TOTAL_MUST_BE_NULL/);
  const changedData={...data,company:{...data.company,current_team_bank_balance:{amount:1,reason:'잘못된 합성값'}}};assert.throws(()=>buildSnapshot(changedData,definitions,sources,validation,drilldown,drilldownSchema,drilldownValidation),/FINANCE_BANK_BALANCE_NOT_VERIFIED/);
});

test('머니핀 세부 행은 월별 은행 합계와 정확히 맞아야 하며 민감 필드 제거가 빠지면 게시하지 않는다',()=>{
  const changed=structuredClone(drilldown);changed.records_by_grain.bank_transactions[0].amount=80001;assert.throws(()=>buildSnapshot(data,definitions,sources,validation,changed,drilldownSchema,drilldownValidation),/FINANCE_BANK_TRANSACTION_INFLOW_MISMATCH/);
  const unsafe=structuredClone(drilldown);unsafe.records_by_grain.card_activity[0].sensitive_fields_removed=['description'];assert.throws(()=>buildSnapshot(data,definitions,sources,validation,unsafe,drilldownSchema,drilldownValidation),/FINANCE_DRILLDOWN_SENSITIVE_FIELDS_PRESENT/);
});
