// 통합 인세시트 읽기 전용 모델. 계산 결과를 시트에 쓰거나 원본 값을 수정하지 않는다.
export const RANGES={
  ledger:"'인세 원장(DB)'!A:M",
  dashboard:"'대시보드'!A1:F60",
  basis:"'기준정보'!A1:N200",
  inventory:"'위탁재고'!A1:K1000",
  settlements:"'작가정산'!A1:M500",
};
const LEDGER_REQUIRED=['채널','판매권수','인세액'];
const BASIS_REQUIRED=['작가','도서','관리 구분','정가','작가율'];
const INVENTORY_REQUIRED=['일자','작가','도서','구분','입고','판매/유출'];
// 작가정산 탭의 금액 열 이름은 시트에서 `작가금액`을 쓴다. 이 화면은 지급상태만 읽으므로
// 금액 열 이름에 결합하지 않고 실제 사용 열만 계약으로 삼는다.
const SETTLEMENT_REQUIRED=['작가','도서','지급상태'];
const text=v=>v==null?'':String(v).trim();
const number=v=>{const s=text(v).replaceAll(',','').replace(/[원권부]/g,'').replace('%','');const n=Number(s);return s!==''&&Number.isFinite(n)?n:null};
const ratio=v=>{const n=number(v);return n==null?null:(String(v).includes('%')||n>1?n/100:n)};
const rowsOf=range=>(range?.values||[]).map(r=>r.map(text));
const table=(range,required)=>{
  const rows=rowsOf(range),hi=rows.findIndex(r=>required.every(h=>r.includes(h)));
  if(hi<0)throw Error('SCHEMA_CHANGED');
  const header=rows[hi],get=(r,name)=>{const i=header.indexOf(name);return i>=0?text(r[i]):''};
  return {header,rows:rows.slice(hi+1).filter(r=>r.some(Boolean)),get};
};
const keyOf=(author,title)=>`${text(author)}::${text(title)}`;
const compact=s=>text(s).replace(/\s+/g,' ');
const matchBook=(r,get,b)=>compact(get(r,'작가'))===compact(b.author)&&compact(get(r,'도서'))===compact(b.title);

function legacyDashboard(dash,scmDash=[]){
  const pick=label=>number(dash.find(r=>r[0]===label)?.[1]);
  let exemptUsed=null,nonSaleRows=[];
  const eh=dash.findIndex(r=>r[0]==='용도'&&r.includes('누적 사용'));
  if(eh>=0){
    const qtyCol=dash[eh].indexOf('부수'),usedCol=dash[eh].indexOf('누적 사용'),noteCol=dash[eh].indexOf('비고');
    for(const r of dash.slice(eh+1)){
      if(!r[0])break;
      const qty=number(r[qtyCol]),used=number(r[usedCol]);
      if(used!=null)exemptUsed=used;
      if(qty!=null&&qty>0)nonSaleRows.push({purpose:r[0],qty,note:noteCol>=0?r[noteCol]:''});
    }
  }
  // SCM 현황이 있으면 판매외 부수는 SCM 입출고원장의 실시간 집계를 우선한다.
  const scmPick=label=>number(scmDash.find(r=>text(r[0])===label)?.[1]);
  const scmExempt=scmPick('면제 사용 합계');
  const scmRows=[
    ['납본','대한출판문화협회'],
    ['책방/증정 샘플','SCM 입출고원장 증정 자동집계'],
    ['서평단 배포','서평 목적 배포'],
  ].map(([purpose,note])=>({purpose,qty:scmPick(purpose),note})).filter(r=>r.qty!=null&&r.qty>0);
  if(scmRows.length){nonSaleRows=scmRows;if(scmExempt!=null)exemptUsed=scmExempt;}
  return {exemptUsed,nonSaleRows,dashboard:{totalQty:pick('누적 판매권수(인세대상)'),totalRoyalty:pick('누적 인세(정가30%)'),paid:pick('지급 완료'),unpaid:pick('미지급(지급 예정)')}};
}

function ledgerSales(ledger,b){
  const {header,rows,get}=ledger;
  const hasBookColumns=header.includes('작가')&&header.includes('도서');
  if(!hasBookColumns&&b.title!=='문고리')return [];
  return rows.filter(r=>!hasBookColumns||matchBook(r,get,b)).map(r=>({
    month:get(r,'정산월'),date:get(r,'판매일'),channel:get(r,'채널'),partner:get(r,'거래처'),
    price:number(get(r,'정가'))??b.price,qty:number(get(r,'판매권수'))??0,
    sheetRoyalty:number(get(r,'인세액')),status:get(r,'지급상태'),memo:get(r,'비고'),
  })).filter(r=>r.qty>0&&r.channel);
}

function consignmentSales(inventory,b){
  const {rows,get}=inventory;
  return rows.filter(r=>matchBook(r,get,b)&&get(r,'구분')==='판매'&&(number(get(r,'판매/유출'))??0)>0).map(r=>({
    month:'',date:get(r,'일자'),channel:get(r,'채널')||'판매',partner:'',price:b.price,
    qty:number(get(r,'판매/유출'))??0,sheetRoyalty:null,status:get(r,'확인 상태'),memo:get(r,'비고')||get(r,'근거'),
  }));
}

function consignmentOperations(inventory,b){
  const {rows,get}=inventory,matched=rows.filter(r=>matchBook(r,get,b));
  const operations=[];
  const inbound=matched.reduce((sum,r)=>sum+(number(get(r,'입고'))??0),0);
  if(inbound>0)operations.push({label:'누적 입고',qty:inbound,note:'위탁재고 입고 기록 합계'});
  let samples=0;
  for(const r of matched){
    const note=[get(r,'근거'),get(r,'비고')].join(' '),m=note.match(/샘플\s*(\d+)\s*권/);
    if(m)samples+=Number(m[1]);
  }
  if(samples>0)operations.push({label:'샘플 제공',qty:samples,note:'판매용 재고와 별도 표기된 수량'});
  const other=new Map();
  for(const r of matched){
    const kind=get(r,'구분'),out=number(get(r,'판매/유출'))??0;
    if(out<=0||kind==='판매')continue;
    const prev=other.get(kind)||{label:kind||'기타 유출',qty:0,note:[]};prev.qty+=out;
    const n=get(r,'비고')||get(r,'근거');if(n)prev.note.push(n);other.set(kind,prev);
  }
  for(const x of other.values())operations.push({label:x.label,qty:x.qty,note:[...new Set(x.note)].join(' · ')});
  if(b.currentStock!=null)operations.push({label:'현재 재고',qty:b.currentStock,note:b.checkedAt?`${b.checkedAt} 확인`:'기준정보 확인'});
  return operations;
}

function payoutStatus(settlements,b){
  const {rows,get}=settlements,matched=rows.filter(r=>matchBook(r,get,b));
  const statuses=[...new Set(matched.map(r=>get(r,'지급상태')).filter(Boolean))];
  return statuses.join(' · ');
}

export function buildRoyalty(raw){
  const ledger=table(raw.ledger,LEDGER_REQUIRED),basis=table(raw.basis,BASIS_REQUIRED);
  const inventory=table(raw.inventory,INVENTORY_REQUIRED),settlements=table(raw.settlements,SETTLEMENT_REQUIRED);
  const legacy=legacyDashboard(rowsOf(raw.dashboard),rowsOf(raw.scmStatus));
  const books=basis.rows.map(r=>{
    const b={
      author:basis.get(r,'작가'),title:basis.get(r,'도서'),type:basis.get(r,'관리 구분')||'작가 정산',
      price:number(basis.get(r,'정가'))??0,rate:ratio(basis.get(r,'작가율'))??0,
      isbn:basis.get(r,'ISBN'),settlementCycle:basis.get(r,'정산 주기'),nextPay:basis.get(r,'다음 정산일'),
      baseline:number(basis.get(r,'기준재고')),currentStock:number(basis.get(r,'현재고')),
      checkedAt:basis.get(r,'확인일'),note:basis.get(r,'근거·주의사항'),
    };
    b.key=keyOf(b.author,b.title);b.isRoyalty=/인세|자체출판/.test(b.type);
    b.sales=b.isRoyalty?ledgerSales(ledger,b):consignmentSales(inventory,b);
    b.operations=b.isRoyalty?legacy.nonSaleRows.map(x=>({label:x.purpose,qty:x.qty,note:x.note})):consignmentOperations(inventory,b);
    b.exemptLimit=b.isRoyalty&&b.title==='문고리'?200:null;
    b.exemptUsed=b.exemptLimit?legacy.exemptUsed:null;
    b.payoutStatus=payoutStatus(settlements,b);
    return b;
  }).filter(b=>b.author&&b.title&&b.price>0&&b.rate>0);
  if(!books.length)throw Error('SCHEMA_CHANGED');
  return {header:ledger.header,rows:ledger.rows,exemptUsed:legacy.exemptUsed,nonSaleRows:legacy.nonSaleRows,dashboard:legacy.dashboard,books};
}
