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
  const hasMetadata=row=>Boolean(row&&['sourceReference','teamReference','observation'].some(key=>Object.hasOwn(row,key)));
  function metadataModel(){if(globalThis.ReadMetadataModel)return globalThis.ReadMetadataModel;if(typeof require==='function'){try{return require('./read-metadata-model.js')}catch{}}return null}
  function taskMetadata(row,duplicate){
    if(!hasMetadata(row))return {};
    const api=metadataModel(),value=api?.task?.(row,{sourceKey:'work.'+row.kind,id:row.id,relationKey:'teamReference',duplicate,now:Date.now()});
    return {readMetadata:value||{identity:{state:'unavailable',label:'원본 신원 확인 필요',id:null},relation:{state:'unresolved',label:'대응 원본 확인 필요',reason:'METADATA_TOOL_UNAVAILABLE'},observation:{state:'unknown',label:'원천 관측 시각 미확인',value:null}}};
  }
  function readMetadata(meta){
    if(!meta||!['read','observation'].some(key=>Object.hasOwn(meta,key)))return {};
    return {readMetadata:metadataModel()?.read?.(meta,{now:Date.now()})||{state:'unavailable',label:'서버 조회 정보 미제공',attempt:{state:'missing',value:null},success:{state:'missing',value:null},errorLabel:''}};
  }
  function freshness(meta={},now=Date.now()){
    const parsed=metadataModel()?.timestamp?.(meta.fetchedAt,now),stamp=parsed?(parsed.state==='known'?Date.parse(parsed.value):NaN):Date.parse(meta.fetchedAt);
    const valid=typeof meta.fetchedAt==='string'&&meta.fetchedAt.trim()===meta.fetchedAt&&Number.isFinite(stamp)&&Number.isFinite(now)&&stamp<=now;
    const age=valid?now-stamp:Infinity;
    return {age,stale:meta.stale===true||age>=STALE_AFTER_MS,expired:age>=EXPIRE_AFTER_MS};
  }
  function build(work,meta={}){
    if(!work||!Array.isArray(work.records))return null;
    const fetchedAt=iso(meta.fetchedAt);if(!fetchedAt)return null;
    const api=metadataModel(),counts=new Map(),key=row=>{const id=api?.canonicalId?.(row?.id);return id?'work.'+row.kind+':'+id:''};
    for(const row of work.records){const id=key(row);if(id)counts.set(id,(counts.get(id)||0)+1)}
    const records=work.records.filter(row=>TYPES[row?.kind]&&!row?.terminal).map(row=>({
      sourceId:text(row.id,160),sourceType:TYPES[row.kind],title:text(row.title,140)||'제목 없는 업무',status:text(row.status,80)||'상태 미확인',priority:text(row.priority,60),owner:text(row.owner,120),next:text(row.next,240),due:iso(row.due),updatedAt:iso(row.updated),sourceUrl:notionUrl(row.url),fetchedAt,
      attention:row.attention===true,approval:row.approval===true,blocked:row.blocked===true,overdue:row.overdue===true,stale:row.stale===true,...taskMetadata(row,(counts.get(key(row))||0)>1)
    })).filter(row=>row.sourceId);
    return {fetchedAt,stale:meta.stale===true,records,...readMetadata(meta)};
  }
  return {build,freshness,STALE_AFTER_MS,EXPIRE_AFTER_MS};
});
