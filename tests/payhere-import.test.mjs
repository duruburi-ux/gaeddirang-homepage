import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {googleRows,movementRows,parseSheetData,reconcileRows,validatePayload} from '../supabase/functions/scm-sales-import/model.mjs';

const source=fs.readFileSync(new URL('../admin/payhere-import.js',import.meta.url),'utf8'),sandbox={};vm.runInNewContext(source,sandbox);const M=sandbox.PayhereImportModel;
const sheets={
  '매출 내역':[
    ['매출내역'],[],[],['2026-08-06~2026-09-06'],['개띠랑'],[],[],['총 매출','실 매출','결제 건수','건 단가','총 환불','환불 건수'],[153000,151700,2,75850,0,0],[],
    ['결제일','결제시간','결제 내역','합계','상품별 할인','결제 할인'],['전체합계','29','29',153000,1300,0],['2026-09-03','09:23:19','감정엽서키트',125000,0,0],['2026-08-31','15:02:49','불편한거야 불편한건 외 1건',28000,1300,0]
  ],
  '상품별':[
    ['상품별 매출 내역'],[],[],['2026-08-06~2026-09-06'],['개띠랑'],[],[],['No.','카테고리','상품명','상품별 단가','수량','수량 점유비','총매출','총 매출 점유비','할인, 포인트, 선불권 사용','실매출'],
    ['전체 합계','전체 합계','29',0,27,'100%',153000,'100%',1300,151700],['분할 결제 부분 매출'],['카테고리별 합계'],['카테고리별 합계 : 강연/워크숍'],
    ['1','강연/워크숍','감정엽서키트',5000,25,'92.59%',125000,'81.70%',0,125000],['카테고리별 합계 : 도서'],['3','도서','불편한거야 불편한건',15000,1,'3.70%',15000,'9.80%',0,15000],['4','도서','우울의바깥을향하며',13000,1,'3.70%',13000,'8.50%',1300,11700]
  ]
};

test('Payhere export becomes two stock candidates and one non-stock payment',()=>{
  const report=M.parseSheets(sheets,'payhere.xlsx'),plan=M.planImport(report,{inventory:[{sku:'GDR-B-0027',name:'불편한거야불편한건 이다솜',price:15000},{sku:'GDR-B-0025',name:'우울의바깥을향하며 두루',price:13000}]});
  assert.equal(report.gross,153000);assert.equal(report.net,151700);assert.equal(report.period.start,'2026-08-06');assert.equal(report.period.end,'2026-09-06');
  assert.equal(plan.ready.length,2);assert.equal(plan.excluded.length,1);assert.equal(plan.blocked.length,0);
  assert.deepEqual(plan.ready.map(x=>x.mapped.sku).sort(),['GDR-B-0025','GDR-B-0027']);
  assert.ok(plan.ready.every(x=>x.occurredAt==='2026-08-31T15:02:49+09:00'));
  assert.equal(plan.ready[0].externalEventId,M.eventId(plan.ready[0]));
});

test('ambiguous aggregate report is blocked before any write',()=>{
  const report={products:[{name:'불편한거야 불편한건',category:'도서',quantity:2,unitPrice:15000,gross:30000,net:30000,discount:0}],transactions:[{date:'2026-09-01',time:'10:00:00',label:'도서 외 1건',gross:15000},{date:'2026-09-02',time:'11:00:00',label:'도서 외 1건',gross:15000}],period:{start:'2026-09-01',end:'2026-09-02'},gross:30000,net:30000};
  const plan=M.planImport(report);assert.equal(plan.ready.length,0);assert.equal(plan.blocked[0].state,'ambiguous');
});

const payload={dryRun:true,report:{hash:'a'.repeat(64),fileName:'payhere.xlsx',period:{start:'2026-08-06',end:'2026-09-06'}},rows:[{canonicalSku:'GDR-B-0027',productName:'이러나저러나 불편한 거야 불편한 건',payhereName:'불편한거야 불편한건',quantity:1,unitAmount:15000,grossAmount:15000,occurredAt:'2026-08-31T15:02:49+09:00',externalEventId:'2026-08-31T15:02:49+09:00::불편한거야불편한건::1::15000'}]};

test('server model validates, reconciles, and generates matching ledgers',()=>{
  const valid=validatePayload(payload),sheet=parseSheetData([{values:[['SKU','내부표준상품명','정가','현재고'],['GDR-B-0027','이러나저러나 불편한 거야 불편한 건',15000,69]]},{values:[['날짜','transaction_id','source_id','SKU']]}]),results=reconcileRows(valid.rows,{...sheet,dbEvents:new Set(),productMappings:new Map([['불편한거야불편한건','GDR-B-0027']])});
  assert.equal(results[0].status,'applicable');assert.equal(results[0].afterStock,68);
  const google=googleRows(results,valid.report),movements=movementRows(results,valid.report);
  assert.equal(google[0][3],'직판');assert.equal(google[0][9],payload.rows[0].externalEventId);assert.equal(movements[0].quantity_delta,-1);assert.equal(movements[0].movement_type,'sale');
});

test('server model detects duplicates and unsafe stock',()=>{
  const valid=validatePayload(payload),catalog=new Map([['GDR-B-0027',{price:15000,stock:0}]]),id=valid.rows[0].externalEventId;
  assert.equal(reconcileRows(valid.rows,{catalog,ledgerEvents:new Set([id]),dbEvents:new Set([id])})[0].status,'duplicate');
  assert.equal(reconcileRows(valid.rows,{catalog,ledgerEvents:new Set(),dbEvents:new Set(),productMappings:new Map([['불편한거야불편한건','GDR-B-0027']])})[0].status,'blocked');
});

test('server model rejects a tampered event id or product mapping',()=>{
  assert.throws(()=>validatePayload({...payload,rows:[{...payload.rows[0],externalEventId:'forged'}]}),/INVALID_PAYLOAD/);
  const valid=validatePayload(payload),catalog=new Map([['GDR-B-0027',{price:15000,stock:4}]]);
  const result=reconcileRows(valid.rows,{catalog,ledgerEvents:new Set(),dbEvents:new Set(),productMappings:new Map([['불편한거야불편한건','GDR-B-9999']])});
  assert.equal(result[0].status,'blocked');assert.match(result[0].message,/서버 상품 연결표/);
});

test('a Google-only prior write is marked for control-ledger repair without a second stock write',()=>{
  const valid=validatePayload(payload),id=valid.rows[0].externalEventId,result=reconcileRows(valid.rows,{catalog:new Map(),ledgerEvents:new Set([id]),dbEvents:new Set()});
  assert.equal(result[0].status,'duplicate');assert.equal(result[0].repairControl,true);
});
