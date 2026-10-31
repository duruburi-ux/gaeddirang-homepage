(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.WorkDashboardSnapshotModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TYPES={tasks:'team_task',decisions:'representative_decision'};
  const STALE_AFTER_MS=150000,EXPIRE_AFTER_MS=600000;
  const text=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
  const iso=value=>{const stamp=Date.parse(value);return Number.isFinite(stamp)?new Date(stamp).toISOString():''};
  const notionUrl=value=>{const raw=String(value??'').trim();if(!/^https:\/\/(?:www\.)?notion\.so\//.test(raw)&&!/^https:\/\/app\.notion\.com\//.test(raw))return'';try{const parsed=new URL(raw);return parsed.username||parsed.password?'':parsed.href}catch{return''}};
  function freshness(meta={},now=Date.now()){
    const stamp=Date.parse(meta.fetchedAt),age=Number.isFinite(stamp)?Math.max(0,now-stamp):Infinity;
    return {age,stale:meta.stale===true||age>=STALE_AFTER_MS,expired:age>=EXPIRE_AFTER_MS};
  }
  function build(work,meta={}){
    if(!work||!Array.isArray(work.records))return null;
    const fetchedAt=iso(meta.fetchedAt);if(!fetchedAt)return null;
    const records=work.records.filter(row=>TYPES[row?.kind]&&!row?.terminal).map(row=>({
      sourceId:text(row.id,160),sourceType:TYPES[row.kind],title:text(row.title,140)||'제목 없는 업무',status:text(row.status,80)||'상태 미확인',priority:text(row.priority,60),owner:text(row.owner,120),next:text(row.next,240),due:iso(row.due),updatedAt:iso(row.updated),sourceUrl:notionUrl(row.url),fetchedAt,
      attention:row.attention===true,approval:row.approval===true,blocked:row.blocked===true,overdue:row.overdue===true,stale:row.stale===true
    })).filter(row=>row.sourceId);
    return {fetchedAt,stale:meta.stale===true,records};
  }
  return {build,freshness,STALE_AFTER_MS,EXPIRE_AFTER_MS};
});
