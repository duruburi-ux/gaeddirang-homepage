// Pure source mapping. No snapshots, credentials, or writes.
export const RANGES={products:"'상품SKU마스터'!A:M",books:"'도서마스터'!A:P",goods:"'굿즈마스터'!A:M",blind:"'블라인드북매핑'!A:K",counts:"'재고실사_기준'!A:H",ledger:"'입출고원장'!A:N"};
const REQUIRED={products:['SKU','상품군','재고SKU','현재고','정가'],books:['SKU','현재고','정가'],goods:['SKU','총재고'],blind:['블라인드SKU','구성도서SKU','도서정가','블라인드판매가','현재고'],counts:['SKU','확정수량'],ledger:['날짜','유형','SKU']};
export function num(v){if(v==null||v===''||typeof v==='boolean')return null;const n=Number(String(v).replaceAll(',',''));return Number.isSafeInteger(n)?n:null}
function records(raw,key){const v=raw[key]?.values;if(!v?.length||!REQUIRED[key].every(h=>v[0].includes(h)))throw Error('SCHEMA_CHANGED');return v.slice(1).filter(r=>r.some(x=>x!=null&&x!=='')).map(r=>Object.fromEntries(v[0].map((h,i)=>[h,r[i]??null])))}
function indexed(rows,key){const m=new Map();for(const r of rows){if(!r[key])continue;if(m.has(String(r[key])))throw Error('DUPLICATE_SKU');m.set(String(r[key]),r)}return m}
export function buildData(raw){
  const t=Object.fromEntries(Object.keys(RANGES).map(k=>[k,records(raw,k)]));
  const books=indexed(t.books,'SKU'),goods=indexed(t.goods,'SKU'),products=indexed(t.products,'SKU');
  const inventory=[];const actions=[];
  const warn=(title,detail)=>actions.push({title,detail});
  for(const [sku,p]of products){
    if(!['도서','굿즈','블라인드북'].includes(p['상품군']))continue;
    const kind=p['상품군'],source=(kind==='도서'?books:goods).get(String(p['재고SKU']));
    const stock=kind==='블라인드북'?num(p['현재고']):num(source?.[kind==='도서'?'현재고':'총재고']);
    const skuStock=num(p['현재고']);
    const returned=String(p['활성상태']).includes('반품');
    const status=stock==null?'수량 미확인':returned?(stock===0?'반품 완료':'반품·재고 확인'):stock<0?'실사 필요':stock===0?'품절':stock<=3?'1~3개 보유':'재고 있음';
    const x={sku,kind,name:p['페이히어상품명']||p['내부표준상품명']||sku,category:p['페이히어카테고리']||'미분류',price:num(p['정가']),cost:num(p['원가']),stock,skuStock,status,barcode:String(p['바코드번호']||''),owner:p['재고소유']||'미확인'};
    inventory.push(x);
    if(stock==null||stock<0)warn(x.name+' 실사 필요','장부 '+(stock??'미확인')+' · 장소와 기준일을 함께 확인하세요.');
    if(returned&&stock!==0)warn(x.name+' 반품 후 재고 이상','반품 상품에 수량이 남았습니다. 판매 가능으로 판단하지 마세요.');
    if(stock!==skuStock)warn(x.name+' 마스터 수량 차이',`원본 ${stock??'미확인'} / 상품SKU마스터 ${skuStock??'미확인'}`);
  }
  const inv=new Map(inventory.map(x=>[x.sku,x]));
  const blind=[...indexed(t.blind,'블라인드SKU')].map(([sku,r])=>{
    const base=num(books.get(String(r['구성도서SKU']))?.['정가']),p=products.get(sku),price=num(p?.['정가']),stock=inv.get(sku)?.stock??null;
    const checks=[];
    if(base==null||price==null)checks.push('정가/상품 연결 미확인');else if(price!==base+3000)checks.push('정가+3,000원 불일치');
    if(num(r['도서정가'])!==base||num(r['블라인드판매가'])!==price)checks.push('구성표 가격 차이');
    if(num(r['현재고'])!==stock)checks.push('구성표 수량 차이');
    if(checks.length)warn((r['키워드']||sku)+' 블라인드북 확인',checks.join(' · '));
    return {sku,type:r['유형']||'미분류',keyword:r['키워드']||sku,book:r['구성도서']||'연결 미확인',base,price,stock,check:checks.join(' · ')};
  });
  const counts=t.counts.filter(r=>r.SKU).map(r=>({name:r['상품명'],date:r['실사·등록일'],scope:r['재고 범위'],count:num(r['확정수량']),current:inv.get(String(r.SKU))?.stock??null}));
  const flagged=t.ledger.filter(r=>r['원장주의']);
  if(flagged.length)warn('원장 주의 표시',`${flagged.length}개 행에 경고가 있습니다. 행 수는 중복 사건 수와 다릅니다.`);
  const missing=t.ledger.filter(r=>r['도서']&&!r.SKU);
  if(missing.length)warn('원장 SKU 누락',`${missing.length}개 행의 상품 연결을 확인하세요.`);
  const orphans=[...goods.keys()].filter(k=>!products.has(k));
  if(orphans.length)warn('굿즈 관리용 연결 확인',`${orphans.length}개 SKU가 상품SKU마스터에 없습니다.`);
  return {inventory,blind,counts,actions};
}
