// SCM 「거래처」 탭을 그대로 옮긴다. 쓰기 없음. 원본 수정은 시트에서 한다.
export const SETTING_KEY='scm_sheet_id';
export const RANGES={partners:"'거래처'!A:P"};
const REQUIRED=['책방명','거래유형'];
const text=v=>v==null?'':String(v).trim();

export function build(raw){
  const v=(raw.partners?.values||[]).map(r=>r.map(text));
  const hi=v.findIndex(r=>REQUIRED.every(h=>r.includes(h)));
  if(hi<0)throw Error('SCHEMA_CHANGED');
  const header=v[hi];
  const partners=v.slice(hi+1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((h,i)=>[h||`칸${i+1}`,r[i]||''])));
  return {header,partners};
}
