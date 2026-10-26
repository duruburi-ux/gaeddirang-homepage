(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.OperationsSourcesDashboardModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const DAY=86400000;
  const text=value=>String(value??'').trim();
  const dateValue=value=>{const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null};
  const seoulDay=value=>{
    const parsed=dateValue(value);if(parsed===null)return'';
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(parsed)).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const inRange=(value,days,now)=>{
    if(days==='all')return dateValue(value)!==null;
    const parsed=dateValue(value);if(parsed===null)return false;
    return parsed>=now-Number(days)*DAY&&parsed<=now;
  };
  const tally=(rows,key)=>{
    const result=new Map();
    for(const row of rows){const label=text(key(row))||'미확인';result.set(label,(result.get(label)||0)+1)}
    return [...result].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label,'ko'));
  };
  const sum=(rows,key)=>rows.reduce((total,row)=>total+(Number.isFinite(key(row))?key(row):0),0);
  function orders(dataset={},days=30,now=Date.now()){
    const raw=Array.isArray(dataset.orders)?dataset.orders:[],seen=new Set(),duplicateIds=new Set(),unique=[];
    for(const row of raw){const id=text(row?.sourceId);if(!id)continue;if(seen.has(id)){duplicateIds.add(id);continue}seen.add(id);unique.push(row)}
    const validDate=unique.filter(row=>dateValue(row.orderedAt)!==null),missingDate=unique.length-validDate.length;
    const filtered=validDate.filter(row=>inRange(row.orderedAt,days,now));
    const daily=tally(filtered,row=>seoulDay(row.orderedAt)).sort((a,b)=>a.label.localeCompare(b.label));
    const statuses=tally(filtered,row=>text(row.processingStatus)||text(row.orderStatus)||'미확인');
    const missingQuantity=filtered.filter(row=>!Number.isSafeInteger(row.quantity)).length;
    return {kind:'orders',range:days,total:filtered.length,daily,statuses,records:filtered,excluded:{missingDate,missingQuantity,duplicateIds:duplicateIds.size,upstreamUnkeyed:Number(dataset.summary?.unkeyed)||0},knownQuantity:sum(filtered,row=>Number.isSafeInteger(row.quantity)?row.quantity:NaN),needsReview:filtered.filter(row=>!text(row.processingStatus)||!/완료|처리됨/.test(text(row.processingStatus))).length};
  }
  function inventory(scm={},days=30,now=Date.now()){
    const books=Array.isArray(scm.books)?scm.books:[],known=books.filter(row=>Number.isSafeInteger(row.stock)),unknownStock=books.length-known.length;
    const byOwner=new Map();for(const row of known){const label=text(row.ownership)||'소유 미확인',current=byOwner.get(label)||{label,value:0,records:0};current.value+=row.stock;current.records++;byOwner.set(label,current)}
    const movements=(Array.isArray(scm.movements)?scm.movements:[]).filter(row=>inRange(row.date,days,now));
    const movementTypes=new Map();for(const row of movements){const label=text(row.type)||'유형 미확인',current=movementTypes.get(label)||{label,value:0,transactions:0};current.value+=Number.isFinite(row.quantity)?row.quantity:0;current.transactions+=Number(row.transactions)||0;movementTypes.set(label,current)}
    return {kind:'inventory',range:days,totalBooks:books.length,knownBooks:known.length,unknownStock,stockByOwner:[...byOwner.values()].sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label,'ko')),movementTypes:[...movementTypes.values()].sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)||a.label.localeCompare(b.label,'ko')),movements,excluded:{unkeyed:Number(scm.summary?.unkeyedTransactions)||0,invalidMovement:Number(scm.summary?.invalidMovementRows)||0},transactions:Number(scm.summary?.transactions)||0};
  }
  function team(dataset={},days=30,now=Date.now()){
    const tasks=Array.isArray(dataset.tasks)?dataset.tasks:[],statuses=tally(tasks,row=>text(row.status)||'상태 미확인'),dated=tasks.filter(row=>dateValue(row.teamDue)!==null),missingDue=tasks.length-dated.length;
    const today=seoulDay(new Date(now).toISOString()),due={overdue:[],soon:[],later:[]};
    for(const row of dated){const key=seoulDay(row.teamDue),diff=(Date.parse(key+'T00:00:00+09:00')-Date.parse(today+'T00:00:00+09:00'))/DAY;if(diff<0)due.overdue.push(row);else if(days==='all'||diff<=Number(days))due.soon.push(row);else due.later.push(row)}
    return {kind:'team',range:days,total:tasks.length,statuses,tasks,due,missingDue,meetings:Array.isArray(dataset.meetings)?dataset.meetings:[]};
  }
  return {orders,inventory,team,seoulDay,inRange};
});
