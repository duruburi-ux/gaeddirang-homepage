import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  calculate,
  classifyLine,
  defaultBasis,
  defaultInclude,
  identity,
} = require('../admin/settlement-statement-model.js');

const royaltyBook = { key:'가상A::가상 인세도서', author:'가상A', title:'가상 인세도서', price:19000, rate:.20, isRoyalty:true };
const consignmentBook = { key:'가상B::가상 위탁도서', author:'가상B', title:'가상 위탁도서', price:14500, rate:.65, isRoyalty:false };

test('확정 판매와 인세 적용 이벤트를 구분해 공제 전 금액을 계산한다', () => {
  const rows = [
    { bookKey:royaltyBook.key, channel:'가상 온라인몰', qty:7, price:19000, period:true, include:true },
    { bookKey:royaltyBook.key, channel:'가상 독립책방 위탁판매', qty:5, price:19000, period:true, include:true },
    { bookKey:royaltyBook.key, channel:'홍보 이벤트', memo:'인세 적용', qty:2, price:19000, period:true, include:true },
  ];
  const result = calculate(royaltyBook, rows);
  assert.equal(result.salesQty, 12);
  assert.equal(result.eventQty, 2);
  assert.equal(result.totalQty, 14);
  assert.equal(result.grossAmount, 53200);
  assert.equal(result.groups.find(group => group.kind === 'event').amount, 7600);
});

test('이벤트 인세 제외와 0권을 안전하게 처리한다', () => {
  const event = { channel:'홍보 이벤트', memo:'인세 적용', qty:2, price:19000, period:true, sheetRoyalty:7600 };
  assert.equal(classifyLine(event), 'event');
  assert.equal(defaultInclude(royaltyBook, event), true);
  const result = calculate(royaltyBook, [
    { bookKey:royaltyBook.key, channel:'가상 온라인몰', qty:0, price:19000, period:true, include:true },
    { bookKey:royaltyBook.key, ...event, include:false },
  ]);
  assert.equal(result.totalQty, 0);
  assert.equal(result.grossAmount, 0);
});

test('위탁 입고·출고 성격의 이벤트와 다른 작가 행을 합산하지 않는다', () => {
  const rows = [
    { bookKey:consignmentBook.key, channel:'가상 온라인몰', qty:23, price:14500, period:true, include:true },
    { bookKey:consignmentBook.key, channel:'홍보 이벤트', memo:'증정', qty:3, price:14500, period:true, include:true },
    { bookKey:'가상C::다른 도서', channel:'가상 온라인몰', qty:99, price:50000, period:true, include:true },
  ];
  const result = calculate(consignmentBook, rows);
  assert.equal(result.salesQty, 23);
  assert.equal(result.eventQty, 0);
  assert.equal(result.grossAmount, 216775);
});

test('위탁 판매대금, 행 단위 반올림, 작가별 초안 식별을 재사용 가능하게 계산한다', () => {
  const first = calculate({ ...consignmentBook, price:16500, rate:.60 }, [
    { bookKey:consignmentBook.key, channel:'가상 독립책방', qty:9, price:16500, include:true },
  ]);
  assert.equal(first.grossAmount, 89100);

  const rounded = calculate({ ...royaltyBook, price:19900, rate:.333 }, [
    { bookKey:royaltyBook.key, channel:'가상 판매처', qty:3, price:19900, include:true },
  ]);
  assert.equal(rounded.grossAmount, 19880);
  assert.notEqual(identity(royaltyBook), identity(consignmentBook));
});

test('유형별 기준 문구는 종료일로 만들어지고 하드코딩된 분기에 묶이지 않는다', () => {
  assert.match(defaultBasis(royaltyBook, '2027-06-30'), /온라인 판매는 구매확정일 기준/);
  assert.match(defaultBasis(royaltyBook, '2027-06-30'), /6월30일까지 결제·출고 완료분/);
  assert.match(defaultBasis(consignmentBook, '2027-12-31'), /12월31일까지 결제·출고 완료분/);
  assert.match(defaultBasis(consignmentBook, '2027-12-31'), /위탁 입고·이동·반품·현재고는 판매수량에 포함하지 않습니다/);
});
