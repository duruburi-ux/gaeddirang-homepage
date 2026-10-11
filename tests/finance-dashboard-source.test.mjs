import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSnapshot} from '../scripts/build-finance-dashboard-snapshot.mjs';

const metricIds=['share_total','team_money_already_received','outstanding_signed','team_money_held_by_member','member_personal_income','company_profit_loss','bank_cash_movement_reference_only','current_team_bank_balance'];
const sourceHash='a'.repeat(64);
const sources={read_only:true,sources:[{source_id:'final_settlement_xlsx',sha256:sourceHash,path:'/private/not-exported.xlsx'},{source_id:'account_view_xlsx',sha256:'b'.repeat(64),path:'/private/not-exported-2.xlsx'}]};
const validation={status:'passed',operational_sources_modified:false,source_hashes_unchanged:true,checks:{company_profit_loss_values_are_null:true,current_team_bank_balance_is_null:true}};
const month={settlement_status:'confirmed',payment_status:'not_paid_as_monthly_standalone',share_components:{basic_activity_pay:10000,work_and_program_share:20000},share_total:30000,team_money_already_received:12000,prior_settlement_received:0,prior_settlement_sent:0,outstanding_signed:18000,source_refs:['final_settlement_xlsx']};
const data={contract_version:'1.0.0',as_of:'2026-10-12',available_periods:['2026-09'],company:{months:[{month:'2026-09',company_profit_loss:{income:null,expense:null,net_profit_loss:null,status:'unconfirmed',reason:'합성 자료도 중복 제거 전에는 합산하지 않습니다.'},bank_cash_movement_reference_only:{row_count:4,inflow:80000,outflow:35000,net_change:45000,warning:'합성 은행행 참고값이며 손익·잔액이 아닙니다.'}}],current_team_bank_balance:{amount:null,status:'unconfirmed',reason:'합성 은행 잔액 근거가 없습니다.'}},members:['duru','jini','dasom'].map((id,index)=>({member_id:id,display_name:`가상${index+1}`,legal_name:`가상인물${index+1}`,months:{'2026-09':{...month}}})),actual_completed_transfers:[],recommended_transfers_not_sent:[],team_funds_held_by_members:[],personal_income_excluded_from_team:[]};
const definitions={version:'1.0.0',currency:'KRW',metrics:metricIds.map(metric_id=>({metric_id}))};

test('검증 원천을 UI 계약으로 바꾸되 회사 손익·잔액은 추정하지 않고 은행행 참고값만 분리한다',()=>{
  const payload=buildSnapshot(data,definitions,sources,validation),period=payload.periods[0],team=period.scopes.find(row=>row.key==='team');
  assert.equal(team.metrics.find(row=>row.key==='income').availability,'withheld');
  assert.equal(team.metrics.find(row=>row.key==='income').amount,null);
  assert.equal(team.metrics.find(row=>row.key==='expense').amount,null);
  assert.equal(period.teamAccountBalance.amount,null);
  assert.deepEqual(period.bankMovement,{availability:'verified',inflow:80000,outflow:35000,netChange:45000,rowCount:4,note:'합성 은행행 참고값이며 손익·잔액이 아닙니다.'});
});

test('정산 계산 상태와 지급 상태를 합치지 않고 개인 몫·받은 팀 돈·남은 돈을 따로 만든다',()=>{
  const payload=buildSnapshot(data,definitions,sources,validation),person=payload.periods[0].scopes.find(row=>row.key==='duru'),byKey=Object.fromEntries(person.metrics.map(row=>[row.key,row]));
  assert.equal(byKey.share.amount,30000);
  assert.equal(byKey.received.amount,12000);
  assert.equal(byKey.settlement.amount,18000);
  assert.match(byKey.settlement.note,/계산 확정/);
  assert.match(byKey.settlement.note,/월별 지급 전/);
  assert.equal(byKey.expense.availability,'not_applicable');
});

test('private snapshot에는 원천 경로를 내보내지 않고 공개 코드용 실제 데이터 seed도 만들지 않는다',()=>{
  const payload=buildSnapshot(data,definitions,sources,validation),serialized=JSON.stringify(payload);
  assert.doesNotMatch(serialized,/\/private\/not-exported/);
  assert.doesNotMatch(serialized,/path/);
  assert.match(payload.periods[0].evidence[0].sourceRefHash,/^[0-9a-f]{64}$/);
});

test('회사 손익 또는 잔액이 검증 없이 채워지면 fail-closed 한다',()=>{
  assert.throws(()=>buildSnapshot(data,definitions,sources,{...validation,checks:{...validation.checks,company_profit_loss_values_are_null:false}}),/FINANCE_COMPANY_TOTAL_MUST_BE_NULL/);
  assert.throws(()=>buildSnapshot({...data,company:{...data.company,current_team_bank_balance:{amount:1,reason:'잘못된 합성값'}}},definitions,sources,validation),/FINANCE_BANK_BALANCE_NOT_VERIFIED/);
});
