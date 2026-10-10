import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const Core=require('../admin/admin-core-model.js');

test('부분 조회 실패는 마지막 정상 데이터를 0건으로 덮어쓰지 않는다',()=>{
  const previous={applications:[{id:'app-old'}],cohorts:[],orders:[{id:'order-old'}],orderItems:[],inquiries:[],alerts:[]};
  const results={
    applications:{data:null,error:{message:'temporary'}},cohorts:{data:[],error:null},orders:{data:[{id:'order-new'}],error:null},
    orderItems:{data:[],error:null},inquiries:{data:[],error:null},alerts:{data:[],error:null},
  };
  const merged=Core.mergeCoreResults(previous,results,new Date('2026-10-10T00:00:00Z'));
  assert.deepEqual(merged.data.applications,previous.applications);
  assert.equal(merged.data.orders[0].id,'order-new');
  assert.equal(merged.sync.ok,false);
  assert.deepEqual(merged.sync.failed.map(x=>x.label),['신청']);
  assert.equal(merged.sync.failed[0].keptPrevious,true);
});

test('오늘 할 일은 환불규정 동의값을 입금값으로 오인하거나 중복 집계하지 않는다',()=>{
  const priorities=Core.derivePriorities({
    applications:[
      {id:'new',status:'신규',refund_confirmed:true},
      {id:'waiting',status:'입금대기',refund_confirmed:true},
      {id:'confirmed',status:'확정',refund_confirmed:false},
    ],
    orders:[{id:'o1',status:'신규'},{id:'o2',status:'발송준비'}],
    inquiries:[{id:'i1',status:'신규'}],
  });
  assert.deepEqual(priorities.newApplications.map(x=>x.id),['new']);
  assert.deepEqual(priorities.paymentWaiting.map(x=>x.id),['waiting']);
  assert.equal(priorities.total,5);
});

test('연락처 없는 동명이인은 합치지 않고 전화번호 표기 차이는 같은 고객으로 본다',()=>{
  assert.notEqual(Core.customerKey({id:'a',applicant_name:'가상 고객'},0),Core.customerKey({id:'b',applicant_name:'가상 고객'},1));
  assert.equal(Core.customerKey({contact:'010-0000-0000'}),Core.customerKey({contact:'01000000000'}));
});

test('같은 기수명은 프로그램이 다르면 섞어 세지 않는다',()=>{
  const applications=[
    {cohort_name:'1기',program_name:'가상 프로그램 A'},
    {cohort_name:'1기',program_name:'가상 프로그램 B'},
  ];
  assert.equal(Core.cohortApplicationCount({cohort_name:'1기',program_name:'가상 프로그램 A'},applications),1);
});

test('인증 만료와 권한 오류를 일반 빈 데이터 오류와 구분한다',()=>{
  assert.equal(Core.isAuthError({status:401}),true);
  assert.equal(Core.isAuthError({code:'PGRST301'}),true);
  assert.equal(Core.isAuthError({message:'JWT expired'}),true);
  assert.equal(Core.isAuthError({message:'network timeout'}),false);
});
