import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../admin/book-finder-model.js',import.meta.url),'utf8');
const sandbox={};vm.runInNewContext(source,sandbox);const M=sandbox.BookFinderModel;

const inventory=[
  {sku:'BOOK-A-1',kind:'도서',name:'가상 마음 산책',author:'가상 작가',isbn:'978-0-00-000001-1',category:'에세이',owner:'매입',stock:3,skuStock:2,status:'1~3개 보유'},
  {sku:'BOOK-A-2',kind:'도서',name:'가상 마음 산책',author:'가상 작가',isbn:'9780000000028',category:'에세이',owner:'위탁',stock:0,skuStock:0,status:'품절'},
  {sku:'BOOK-B',kind:'도서',name:'공백 없는책',author:'다른 작가',isbn:'9780000000035',category:'소설',owner:'미확인',stock:null,skuStock:null,status:'수량 미확인'},
  {sku:'GOODS-A',kind:'굿즈',name:'가상 카드',author:'',isbn:'',category:'굿즈',owner:'자체',stock:9,skuStock:9,status:'재고 있음'},
];
const counts=[
  {sku:'BOOK-A-1',name:'가상 마음 산책',date:'2026-10-10',scope:'책공방 앞 책장',count:3,current:3},
  {sku:'BOOK-A-1',name:'가상 마음 산책',date:'2026-09-01',scope:'이전 위치',count:4,current:3},
];
const bookshop={
  items:[{sku:'BOOK-A-1',ledgerCount:3,reserved:1,pendingInbound:2,payhereCount:2,smartstoreCount:2,smartstoreCandidateCount:null,physicalCount:null,sellableConfirmed:null,physicalCheck:'미확인',hasEvidence:true,review:'가상 실사 필요',scopeNote:'매장 기준'}],
  purchaseCandidates:[{isbn:'9780000000011',quantity:1}],
};

test('제목·저자 검색은 공백을 정규화하고 굿즈를 책 결과에 섞지 않는다',()=>{
  assert.deepEqual(M.searchBooks({inventory,counts,query:'가상마음 산책'}).items.map(row=>row.sku),['BOOK-A-1','BOOK-A-2']);
  assert.deepEqual(M.searchBooks({inventory,counts,query:'가상 작가'}).items.map(row=>row.sku),['BOOK-A-1','BOOK-A-2']);
  assert.equal(M.searchBooks({inventory,counts,query:'가상 카드'}).items.length,0);
});

test('정확한 ISBN은 하이픈·공백을 제거해 우선하고 동명 판본을 SKU와 함께 구분한다',()=>{
  const result=M.searchBooks({inventory,counts,query:'978 0 00 000001 1'});
  assert.equal(result.exactIsbn,true);assert.equal(result.items.length,1);assert.equal(result.items[0].sku,'BOOK-A-1');
  assert.equal(result.items[0].sameTitleCount,2);assert.match(result.items[0].edition,/ISBN과 SKU/);
});

test('양수도 실재고 있음으로 확정하지 않고 두 원본 수량 충돌을 표시한다',()=>{
  const row=M.searchBooks({inventory,counts,query:'BOOK-A-1'}).items[0];
  assert.match(row.stockLabel,/장부상 3권/);assert.match(row.stockLabel,/실물 확인 필요/);assert.doesNotMatch(row.stockLabel,/재고 있음/);
  assert.equal(row.hasConflict,true);assert.ok(row.conflicts.includes('원본 수량 불일치'));
});

test('통합 재고는 SKU·ISBN으로만 연결하고 미확정 실물값을 만들지 않는다',()=>{
  const row=M.searchBooks({inventory,counts,bookshop,query:'BOOK-A-1',fetchedAt:'2026-10-11T08:00:00Z'}).items[0];
  assert.equal(row.countAt,'2026-10-10');assert.equal(row.countScope,'책공방 앞 책장');assert.equal(row.countQuantity,3);
  assert.equal(row.reserved,1);assert.equal(row.incoming,2);assert.equal(row.calculatedAvailable,2);assert.equal(row.purchaseCandidate,1);
  assert.equal(row.payhereCount,2);assert.equal(row.smartstoreCount,2);assert.equal(row.sellableConfirmed,null);assert.match(row.sellableLabel,/확인 필요/);
  assert.equal(row.shelf,'미등록');assert.equal(row.bookshopLinked,true);
});

test('판매 가능 0은 실물수량·실사 상태·근거가 모두 있을 때만 확정한다',()=>{
  const base={sku:'BOOK-A-2',ledgerCount:0,reserved:0,physicalCount:null,sellableConfirmed:0,physicalCheck:'미확인',hasEvidence:false};
  const unknown=M.searchBooks({inventory,counts,bookshop:{items:[base],purchaseCandidates:[]},query:'BOOK-A-2'}).items[0];
  assert.equal(unknown.sellableConfirmed,null);assert.equal(unknown.hasPhysicalEvidence,false);assert.match(unknown.sellableLabel,/확인 필요/);assert.doesNotMatch(unknown.sellableLabel,/확정 0권/);
  const confirmed=M.searchBooks({inventory,counts,bookshop:{items:[{...base,physicalCount:0,physicalCheck:'확인',hasEvidence:true}],purchaseCandidates:[]},query:'BOOK-A-2'}).items[0];
  assert.equal(confirmed.sellableConfirmed,0);assert.equal(confirmed.hasPhysicalEvidence,true);assert.match(confirmed.sellableLabel,/확정 0권/);
});

test('공개 페이지에서 ISBN으로 검증된 표지만 연결하고 나머지는 비워 둔다',()=>{
  const rows=M.bookRows([{sku:'PUBLIC',kind:'도서',name:'가상 공개책',isbn:'9791199271524'},{sku:'OTHER',kind:'도서',name:'가상 다른책',isbn:'9790000000999'}],[],'');
  assert.equal(rows[0].coverUrl,'../assets/moongori/cover.png');assert.equal(rows[1].coverUrl,'');
});

test('없는 검색 결과는 빈 배열이며 0권 결과와 구분된다',()=>{
  assert.equal(M.searchBooks({inventory,counts,query:'존재하지 않는 제목'}).items.length,0);
  const zero=M.searchBooks({inventory,counts,query:'9780000000028'}).items[0];assert.equal(zero.recordedStock,0);assert.match(zero.stockLabel,/장부상 0권/);
});

test('작가·위치·실사 정보가 없으면 미등록을 유지한다',()=>{
  const rows=M.bookRows([{sku:'BOOK-C',kind:'도서',name:'가상 무명',stock:null,skuStock:null}],[],'');
  assert.equal(rows[0].author,'미등록');assert.equal(rows[0].shelf,'미등록');assert.equal(rows[0].countAt,'미등록');assert.equal(rows[0].sourceCheckedAt,'');assert.equal(rows[0].reserved,null);assert.equal(rows[0].purchaseCandidate,null);
});
