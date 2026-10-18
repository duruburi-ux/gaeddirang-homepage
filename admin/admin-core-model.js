(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AdminCoreModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const SOURCES={
    applications:'신청',cohorts:'프로그램',orders:'주문',orderItems:'주문항목',
    inquiries:'문의',alerts:'출간알림',
  };
  const PAGE_SIZE=1000,MAX_ROWS=50000;

  async function readAll(client,table,columns='*',{order=[],pageSize=PAGE_SIZE,maxRows=MAX_ROWS}={}){
    if(!client?.from||!table||!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>1000||!Number.isSafeInteger(maxRows)||maxRows<pageSize)return {data:null,error:{code:'ADMIN_READ_INVALID',message:'Invalid paged read configuration'},count:null};
    const rows=[];let expected=null;
    for(let from=0;from<maxRows;from+=pageSize){
      let query=client.from(table).select(columns,{count:'exact'});
      for(const [column,options] of order)query=query.order(column,options);
      const result=await query.range(from,from+pageSize-1);
      if(result.error)return {data:null,error:result.error,count:Number.isSafeInteger(result.count)?result.count:expected};
      if(!Array.isArray(result.data)||!Number.isSafeInteger(result.count)||result.count<0)return {data:null,error:{code:'ADMIN_READ_INCOMPLETE',message:'Exact row count unavailable'},count:null};
      if(expected===null)expected=result.count;
      if(result.count!==expected)return {data:null,error:{code:'ADMIN_READ_CHANGED',message:'Row count changed while reading'},count:result.count};
      rows.push(...result.data);
      if(rows.length>=expected)break;
      if(result.data.length!==pageSize)return {data:null,error:{code:'ADMIN_READ_INCOMPLETE',message:'Paged read ended before exact count'},count:expected};
    }
    if(expected===null||expected>maxRows||rows.length!==expected)return {data:null,error:{code:'ADMIN_READ_INCOMPLETE',message:'Paged read did not reach exact count'},count:expected};
    const ids=rows.map(row=>row?.id).filter(value=>value!=null).map(String);
    if(ids.length!==rows.length)return {data:null,error:{code:'ADMIN_READ_ID_MISSING',message:'Paged read cannot verify rows without IDs'},count:expected};
    if(new Set(ids).size!==ids.length)return {data:null,error:{code:'ADMIN_READ_DUPLICATE',message:'Paged read returned duplicate rows'},count:expected};
    return {data:rows,error:null,count:expected};
  }

  function koreanDayKey(value=new Date()){
    const date=value instanceof Date?value:new Date(value);
    if(!Number.isFinite(date.valueOf()))return '';
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(part=>[part.type,part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function isSameKoreanDay(a,b=new Date()){const left=koreanDayKey(a),right=koreanDayKey(b);return Boolean(left&&right&&left===right)}

  function mergeCoreResults(previous={},results={},at=new Date()){
    const data={...previous},failed=[],succeeded=[];
    for(const [key,label] of Object.entries(SOURCES)){
      const result=results[key]||{};
      if(result.error){
        failed.push({key,label,error:result.error,keptPrevious:Array.isArray(previous[key])});
        if(!Array.isArray(data[key]))data[key]=[];
      }else{
        data[key]=Array.isArray(result.data)?result.data:[];
        succeeded.push(key);
      }
    }
    return {data,sync:{ok:failed.length===0,at,failed,succeeded}};
  }

  function derivePriorities({applications=[],orders=[],inquiries=[]}={}){
    const newOrders=orders.filter(o=>(o.status||'신규')==='신규');
    const toShip=orders.filter(o=>o.status==='발송준비'||o.status==='입금확인');
    const newApplications=applications.filter(a=>(a.status||'신규')==='신규');
    const paymentWaiting=applications.filter(a=>a.status==='입금대기');
    const newInquiries=inquiries.filter(i=>!i.status||i.status==='신규');
    return {
      newOrders,toShip,newApplications,paymentWaiting,newInquiries,
      total:newOrders.length+toShip.length+newApplications.length+paymentWaiting.length+newInquiries.length,
    };
  }

  function customerKey(application,index=0){
    const phone=String(application?.contact||'').replace(/[^0-9]/g,'');
    if(phone.length>=7)return `phone:${phone}`;
    const email=String(application?.email||'').trim().toLowerCase();
    if(email)return `email:${email}`;
    return `record:${application?.id||index}`;
  }

  function cohortApplicationCount(cohort,applications=[]){
    return applications.filter(a=>{
      if(cohort?.id&&a.cohort_id)return a.cohort_id===cohort.id;
      if(!cohort?.cohort_name||a.cohort_name!==cohort.cohort_name)return false;
      if(cohort.program_slug&&a.program_slug)return a.program_slug===cohort.program_slug;
      if(cohort.program_name&&a.program_name)return a.program_name===cohort.program_name;
      return !cohort.program_slug&&!cohort.program_name;
    }).length;
  }

  function isAuthError(error){
    const status=Number(error?.status||error?.statusCode||0);
    const code=String(error?.code||'').toUpperCase();
    const message=String(error?.message||'').toLowerCase();
    return status===401||status===403||code==='PGRST301'||/jwt|token.*expired|not authenticated|permission denied/.test(message);
  }

  return {SOURCES,readAll,koreanDayKey,isSameKoreanDay,mergeCoreResults,derivePriorities,customerKey,cohortApplicationCount,isAuthError};
});
