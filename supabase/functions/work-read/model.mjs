// Fixed, read-only Notion sources. No task snapshots or credentials belong here.
export const SOURCES = [
  {key:'rooms',label:'업무 영역',id:'c93b8481-c706-4e41-b42b-a3e308b924f6'},
  {key:'tasks',label:'실행 업무',id:'801ece25-4cd7-4077-a713-c2fccd4575dc'},
  {key:'projects',label:'프로젝트',id:'39f83b63-87a4-4c9a-8eb7-cf83795540c1'},
  {key:'decisions',label:'결정할 일',id:'caa02ea2-9f9e-4293-9f2b-aa0f4ff90e91'},
];

const TERMINAL = new Set(['정리 완료','완료','폐기','중단','대체됨']);
const ATTENTION = new Set(['대표 승인 대기','대표 승인 필요','승인 대기','막힘','차단','검수 대기','검수 중']);
const APPROVAL = new Set(['대표 승인 대기','대표 승인 필요','승인 대기']);
const BLOCKED = new Set(['막힘','차단']);
const PRIORITY_SCORE = new Map([['최우선',4],['긴급',4],['높음',3],['보통',2],['중간',2],['낮음',1]]);

export function plainText(value){
  if(!Array.isArray(value))return '';
  return value.map(x=>x?.plain_text??x?.text?.content??'').join('').trim();
}
function prop(page,name){return page?.properties?.[name]||{}}
function text(page,name){const p=prop(page,name);return plainText(p.title||p.rich_text)}
function choice(page,name){const p=prop(page,name);return p.status?.name||p.select?.name||''}
function date(page,name){const p=prop(page,name);return p.date?.start||p.last_edited_time||p.created_time||''}
function clamp(value,max=240){const s=String(value||'').replace(/\s+/g,' ').trim();return s.length>max?s.slice(0,max-1)+'…':s}
function safeUrl(value){return /^https:\/\/(?:www\.)?notion\.so\//.test(value)||/^https:\/\/app\.notion\.com\//.test(value)?value:''}
function isoDay(value){if(!value)return '';const d=new Date(value);return Number.isNaN(d.valueOf())?'':d.toISOString()}

const CONFIG = {
  rooms:{title:'업무방',status:'상태',priority:null,owner:['고친 쪽'],next:'다음 행동',due:null,updated:'최종 업데이트'},
  tasks:{title:'업무명',status:'상태',priority:'우선순위',owner:['담당 팀','담당 에이전트'],next:'실행 지시',due:'마감일',updated:'최근 수정'},
  projects:{title:'프로젝트명',status:'상태',priority:'우선순위',owner:['책임 팀'],next:'다음 마일스톤',due:'목표일',updated:'최근 수정'},
  decisions:{title:'결정 제목',status:'상태',priority:'우선순위',owner:['실행 책임'],next:null,due:'시행일',updated:'최종 수정일'},
};

export function mapPage(sourceKey,page,now=Date.now()){
  const c=CONFIG[sourceKey];if(!c)throw Error('SCHEMA_CHANGED');
  const title=clamp(text(page,c.title),140);if(!title)return null;
  const status=choice(page,c.status)||'상태 미입력';
  const priority=c.priority?choice(page,c.priority):'';
  const owner=c.owner.map(k=>choice(page,k)||text(page,k)).filter(Boolean).join(' · ');
  const due=c.due?date(page,c.due):'';
  const updated=(c.updated?date(page,c.updated):'')||page.last_edited_time||'';
  const updatedMs=Date.parse(updated);const stale=!Number.isFinite(updatedMs)||now-updatedMs>21*86400000;
  const dueMs=Date.parse(due);const overdue=!TERMINAL.has(status)&&Number.isFinite(dueMs)&&dueMs<now-86400000;
  return {
    id:String(page.id||page.url||title),kind:sourceKey,title,status,priority,owner:clamp(owner,120),
    next:c.next?clamp(text(page,c.next),240):'',due:isoDay(due),updated:isoDay(updated),
    url:safeUrl(page.url||''),terminal:TERMINAL.has(status),attention:ATTENTION.has(status),
    approval:APPROVAL.has(status),blocked:BLOCKED.has(status),stale,overdue,
  };
}

export function buildWork(rawBySource,now=Date.now()){
  const records=[];const coverage=[];
  for(const source of SOURCES){
    const rows=rawBySource[source.key];if(!Array.isArray(rows))throw Error('SCHEMA_CHANGED');
    const mapped=rows.map(row=>mapPage(source.key,row,now)).filter(Boolean);
    records.push(...mapped);coverage.push({key:source.key,label:source.label,count:mapped.length});
  }
  records.sort((a,b)=>Number(a.terminal)-Number(b.terminal)||Number(b.attention)-Number(a.attention)||Number(b.overdue)-Number(a.overdue)||(PRIORITY_SCORE.get(b.priority)||0)-(PRIORITY_SCORE.get(a.priority)||0)||Date.parse(b.updated||0)-Date.parse(a.updated||0));
  const active=records.filter(x=>!x.terminal);
  return {records,coverage,summary:{active:active.length,attention:active.filter(x=>x.attention||x.overdue).length,blocked:active.filter(x=>x.blocked).length,approvals:active.filter(x=>x.approval).length,stale:active.filter(x=>x.stale).length,projects:active.filter(x=>x.kind==='projects').length}};
}
