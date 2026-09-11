// 인세시트 원본을 그대로 옮긴다. 계산·쓰기 없음. 인세 계산은 서류실 화면이 원장 숫자로 다시 한다.
export const RANGES={ledger:"'인세 원장(DB)'!A:M",dashboard:"'대시보드'!A1:F60"};
const REQUIRED=['채널','판매권수','인세액'];
const text=v=>v==null?'':String(v).trim();
const number=v=>{const n=Number(text(v).replaceAll(',',''));return text(v)!==''&&Number.isFinite(n)?n:null};

export function buildRoyalty(raw){
  const ledger=(raw.ledger?.values||[]).map(r=>r.map(text));
  const hi=ledger.findIndex(r=>REQUIRED.every(h=>r.includes(h)));
  if(hi<0)throw Error('SCHEMA_CHANGED');
  const header=ledger[hi];
  const rows=ledger.slice(hi+1).filter(r=>r.some(Boolean));
  const dash=(raw.dashboard?.values||[]).map(r=>r.map(text));
  const pick=label=>number(dash.find(r=>r[0]===label)?.[1]);
  // 인세 면제 200부 표: 「누적 사용」 칸의 마지막 숫자가 지금까지 쓴 부수
  let exemptUsed=null;
  const eh=dash.findIndex(r=>r[0]==='용도'&&r.includes('누적 사용'));
  if(eh>=0){
    const col=dash[eh].indexOf('누적 사용');
    for(const r of dash.slice(eh+1)){if(!r[0])break;const n=number(r[col]);if(n!=null)exemptUsed=n}
  }
  return {header,rows,exemptUsed,dashboard:{totalQty:pick('누적 판매권수(인세대상)'),totalRoyalty:pick('누적 인세(정가30%)'),paid:pick('지급 완료'),unpaid:pick('미지급(지급 예정)')}};
}
