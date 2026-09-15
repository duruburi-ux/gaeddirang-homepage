/* 서류실 작성 도우미
   현재 보이는 양식에서 질문지(.md)를 만들고, 답을 적은 파일을 다시 불러와 칸을 채운다.
   문서 내용은 브라우저 안에서만 처리하며 서버로 전송하지 않는다. */
(() => {
'use strict';

const HIDDEN_RE = /\bhidden\b/;
let helper = null;
let fileInput = null;

function activeView(){ return document.querySelector('.view:not(.hidden)'); }
function isShown(el){
  if(!el || el.disabled || el.readOnly || el.type==='file' || el.type==='button' || el.type==='submit') return false;
  for(let p=el; p && p!==document.body; p=p.parentElement){
    if(HIDDEN_RE.test(p.className||'') || p.hidden) return false;
  }
  return true;
}
function tidy(s){ return String(s||'').replace(/\([^)]*\)/g,'').replace(/[①-⑩]|^\s*\d+[.)]\s*/g,'').replace(/\s+/g,' ').trim(); }
function fieldLabel(el, i){
  let label = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
  if(!label) label = el.closest('label');
  if(!label){
    const box = el.parentElement;
    label = box && box.querySelector(':scope > label.f');
    if(!label && box?.previousElementSibling?.matches('label.f')) label = box.previousElementSibling;
  }
  return tidy(label && label.textContent) || tidy(el.placeholder) || `항목 ${i+1}`;
}
function fieldKey(el, i){
  const key = el.dataset.f ? `data:${el.dataset.f}` : el.id ? `id:${el.id}` : `auto:${i}`;
  el.dataset.assistKey = key;
  return key;
}
function fieldValue(el){
  if(el.type==='checkbox') return el.checked ? '예' : '아니오';
  if(el.tagName==='SELECT') return el.options[el.selectedIndex] ? el.options[el.selectedIndex].text.trim() : '';
  return el.value || '';
}
function collectFields(){
  const view = activeView();
  if(!view) return [];
  return [...view.querySelectorAll('input, textarea, select')]
    .filter(el => !el.closest('.doc-assistant') && isShown(el))
    .map((el, i) => ({ el, key:fieldKey(el,i), label:fieldLabel(el,i), value:fieldValue(el),
      group: tidy(el.closest('.card')?.querySelector('h3')?.textContent) || '기본 정보' }));
}
function docName(){
  const view = activeView();
  const tab = document.querySelector(`.doc-tab.active`);
  const sub = view && view.querySelector('.subtabs button.active, .kit-tabs button.active');
  return tidy(sub?.textContent || tab?.textContent || '서류');
}
function makeQuestionnaire(){
  const fields = collectFields();
  const groups = new Map();
  fields.forEach(f => { if(!groups.has(f.group)) groups.set(f.group, []); groups.get(f.group).push(f); });
  const lines = [`# ${docName()} 작성 질문지`, '', '콜론 뒤에 답을 적어 저장한 다음 관리실에 올려주세요. 모르는 항목은 비워두어도 됩니다.', ''];
  for(const [group, rows] of groups){
    lines.push(`## ${group}`, '');
    rows.forEach(f => {
      lines.push(`<!-- field:${encodeURIComponent(f.key)} -->`);
      if(f.el.tagName==='TEXTAREA' && /\n/.test(f.value)){
        lines.push(`${f.label}:`, ...f.value.split('\n').map(x=>`  ${x}`), '');
      } else lines.push(`${f.label}: ${f.value}`, '');
    });
  }
  lines.push('---', '작성한 파일은 관리실의 「작성 파일 올리기」로 불러오세요. 파일 내용은 브라우저 안에서만 처리됩니다.', '');
  return lines.join('\n');
}
function downloadBlob(name, body, type){
  const a=document.createElement('a');
  const blob = body instanceof Blob ? body : new Blob([body],{type});
  a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function downloadQuestionnaire(){
  downloadBlob(`${docName()}_작성질문지.md`, makeQuestionnaire(), 'text/markdown;charset=utf-8');
  note('질문지를 내려받았어요. 답을 적어 다시 올리면 됩니다.');
}
function parseAnswers(text){
  const lines=String(text||'').replace(/^\uFEFF/,'').split(/\r?\n/), out=[];
  let current=null;
  for(const line of lines){
    const marker=line.match(/^\s*<!--\s*field:([^ ]+)\s*-->\s*$/);
    if(marker){ if(current) out.push(current); current={key:decodeURIComponent(marker[1]), lines:[]}; continue; }
    if(!current) continue;
    if(/^\s*<!--\s*field:/.test(line)){ out.push(current); current=null; continue; }
    if(/^\s*---\s*$/.test(line)){ out.push(current); current=null; continue; }
    current.lines.push(line);
  }
  if(current) out.push(current);
  return out.map(x=>{
    const rows=x.lines.filter(l=>!/^\s*#/.test(l));
    const first=rows.findIndex(l=>l.includes(':') || l.includes('：'));
    if(first<0) return {...x,value:''};
    const head=rows[first].split(/[:：]/); const rest=rows.slice(first+1).map(l=>l.replace(/^\s{0,2}/,'')).filter(l=>l.trim());
    return {...x,value:[head.slice(1).join(':').trim(),...rest].filter(Boolean).join('\n').trim()};
  });
}
function setField(el, value){
  if(!value) return false;
  if(el.type==='checkbox') el.checked=/^(예|네|yes|y|true|1|체크)$/i.test(value.trim());
  else if(el.tagName==='SELECT'){
    const want=tidy(value).toLowerCase();
    const opt=[...el.options].find(o=>tidy(o.text).toLowerCase()===want || String(o.value).toLowerCase()===want);
    if(!opt) return false;
    el.value=opt.value;
  } else el.value=value;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
  return true;
}
function importQuestionnaire(text){
  const fields=collectFields(), byKey=new Map(fields.map(f=>[f.key,f.el]));
  const answers=parseAnswers(text); let filled=0, missing=0;
  answers.forEach(a=>{ const el=byKey.get(a.key); if(el && a.value){ if(setField(el,a.value)) filled++; } else if(el) missing++; });
  if(!answers.length){ note('이 파일에서 질문지 항목을 찾지 못했어요. 여기서 받은 질문지인지 확인해 주세요.',true); return; }
  note(`${filled}개 칸을 채웠어요${missing?` · 비워 둔 답 ${missing}개`:''}. 미리보기를 확인해 주세요.`, missing>0);
}
function readFile(file){
  if(!file) return;
  if(!/\.(md|txt)$/i.test(file.name)){ note('작성 파일은 .md 또는 .txt만 불러올 수 있어요.',true); return; }
  if(file.size>300000){ note('파일이 너무 커요. 300KB 이하 질문지만 올려 주세요.',true); return; }
  const reader=new FileReader();
  reader.onload=()=>importQuestionnaire(reader.result);
  reader.onerror=()=>note('파일을 읽지 못했어요. 다시 저장해 올려 주세요.',true);
  reader.readAsText(file,'utf-8');
}
const DOCX_INK='241D18', DOCX_MUTED='776D65', DOCX_LINE='DCD3C9', DOCX_ACCENT='76513A', DOCX_WASH='F1E8DC';
function compactText(el){ return String(el?.innerText||el?.textContent||'').replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim(); }
function docxText(text, opt={}){
  const d=window.docx;
  return new d.Paragraph({
    alignment:opt.align || d.AlignmentType.LEFT,
    spacing:{before:opt.before||0,after:opt.after==null?80:opt.after,line:276},
    heading:opt.heading,
    children:String(text||'').split('\n').flatMap((line,i)=>[
      ...(i?[new d.TextRun({break:1})]:[]),
      new d.TextRun({text:line,font:'Nanum Gothic',size:opt.size||20,bold:!!opt.bold,color:opt.color||DOCX_INK})
    ])
  });
}
function docxBorders(){
  const d=window.docx, b={style:d.BorderStyle.SINGLE,size:4,color:DOCX_LINE};
  return {top:b,bottom:b,left:b,right:b,insideHorizontal:b,insideVertical:b};
}
function htmlTableToDocx(table){
  const d=window.docx;
  const rows=[...table.rows].map((row,ri)=>new d.TableRow({
    tableHeader:ri===0,
    children:[...row.cells].map(cell=>new d.TableCell({
      columnSpan:cell.colSpan>1?cell.colSpan:undefined,
      rowSpan:cell.rowSpan>1?cell.rowSpan:undefined,
      verticalAlign:d.VerticalAlign.CENTER,
      shading:{fill:ri===0?DOCX_ACCENT:(cell.closest('tfoot')?DOCX_WASH:'FFFFFF'),type:d.ShadingType.CLEAR},
      margins:{top:90,bottom:90,left:110,right:110},
      children:[docxText(compactText(cell),{align:ri===0?d.AlignmentType.CENTER:(cell.classList.contains('num')?d.AlignmentType.RIGHT:d.AlignmentType.LEFT),size:ri===0?17:18,bold:ri===0||!!cell.closest('tfoot'),color:ri===0?'FFFFFF':DOCX_INK,after:0})]
    }))
  }));
  return new d.Table({rows,width:{size:100,type:d.WidthType.PERCENTAGE},borders:docxBorders(),layout:d.TableLayoutType.FIXED});
}
function infoGridToDocx(grid){
  const d=window.docx, boxes=[...grid.querySelectorAll(':scope > .box')], none={style:d.BorderStyle.NONE,size:0,color:'FFFFFF'};
  return new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},borders:docxBorders(),rows:[new d.TableRow({children:boxes.map(box=>{
    const title=compactText(box.querySelector('.box-head'));
    const rows=[...box.querySelectorAll('.row')].map(r=>new d.TableRow({children:[
      new d.TableCell({width:{size:36,type:d.WidthType.PERCENTAGE},borders:{top:none,bottom:none,left:none,right:none},margins:{top:35,bottom:35,left:0,right:40},children:[docxText(compactText(r.querySelector('.k')),{size:17,color:DOCX_MUTED,after:0})]}),
      new d.TableCell({width:{size:64,type:d.WidthType.PERCENTAGE},borders:{top:none,bottom:none,left:none,right:none},margins:{top:35,bottom:35,left:40,right:0},children:[docxText(compactText(r.querySelector('.v')),{size:/이메일/.test(compactText(r.querySelector('.k')))?14:16,bold:!/이메일/.test(compactText(r.querySelector('.k'))),align:d.AlignmentType.RIGHT,after:0})]})
    ]}));
    const inner=new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},borders:{top:none,bottom:none,left:none,right:none,insideHorizontal:none,insideVertical:none},rows});
    return new d.TableCell({margins:{top:110,bottom:110,left:150,right:150},shading:{fill:'FFFFFF',type:d.ShadingType.CLEAR},children:[docxText(title,{bold:true,color:DOCX_ACCENT,size:18}),inner,docxText('',{size:2,after:0})]});
  })})]});
}
async function imageRun(src,width,height){
  if(!src) return null;
  try{ const data=await fetch(src).then(r=>{if(!r.ok) throw new Error(); return r.arrayBuffer();}); return new window.docx.ImageRun({data,transformation:{width,height},type:'png'}); }
  catch(e){ return null; }
}
async function genericBlocks(root){
  const d=window.docx, out=[];
  for(const el of [...root.children]){
    if(el.matches('.head')){
      const title=compactText(el.querySelector('h1')), sub=compactText(el.querySelector('.subtitle')), meta=compactText(el.querySelector('.head-meta'));
      out.push(docxText(title,{align:d.AlignmentType.CENTER,size:34,bold:true,color:'000000',after:60}));
      if(sub) out.push(docxText(sub,{align:d.AlignmentType.CENTER,size:18,color:DOCX_MUTED,after:80}));
      if(meta) out.push(docxText(meta,{align:d.AlignmentType.RIGHT,size:17,color:DOCX_MUTED,after:100}));
    } else if(el.matches('.rule')) continue;
    else if(el.matches('.info-grid')) out.push(infoGridToDocx(el));
    else if(el.matches('.total-bar')) out.push(docxText(compactText(el),{bold:true,size:22,color:DOCX_ACCENT,before:120,after:120}));
    else if(el.matches('h1,h2,h3')) out.push(docxText(compactText(el),{bold:true,size:el.matches('h1')?30:22,color:'000000',before:120,after:80}));
    else if(el.matches('table')) out.push(htmlTableToDocx(el));
    else if(el.matches('.notes')){
      const h=compactText(el.querySelector('.h'))||'안내'; out.push(docxText(h,{bold:true,color:DOCX_ACCENT,before:120,after:50}));
      [...el.querySelectorAll('li')].forEach(li=>out.push(docxText('• '+compactText(li),{size:17,color:DOCX_MUTED,after:30})));
    } else if(el.matches('.sign')){
      const text=compactText(el), seal=await imageRun(el.querySelector('img')?.src,48,49), runs=[new d.TextRun({text,font:'Nanum Gothic',size:19,bold:true,color:DOCX_INK})];
      if(seal) runs.push(new d.TextRun({text:'  '}),seal);
      out.push(new d.Paragraph({alignment:d.AlignmentType.RIGHT,spacing:{before:180,after:100},children:runs}));
    } else if(el.matches('.foot')) out.push(docxText(compactText(el),{align:d.AlignmentType.CENTER,size:15,color:DOCX_MUTED,before:150,after:0}));
    else if(el.matches('.receive')){
      const cells=[...el.children].map(c=>new d.TableCell({margins:{top:100,bottom:100,left:120,right:120},children:[docxText(compactText(c),{size:18,after:0})]}));
      out.push(new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},borders:docxBorders(),rows:[new d.TableRow({children:cells})]}));
    } else if(el.querySelector(':scope > table')){
      const lead=[...el.children].filter(x=>!x.matches('table')).map(compactText).filter(Boolean).join('\n');
      if(lead) out.push(docxText(lead,{size:18}));
      out.push(...[...el.querySelectorAll(':scope > table')].map(htmlTableToDocx));
    } else {
      const text=compactText(el); if(text) out.push(docxText(text,{size:18}));
    }
  }
  return out;
}
async function buildDocxBlob(){
  const d=window.docx;
  if(!d) throw new Error('편집본 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  const view=activeView(), sheet=view && view.querySelector('.sheet'), root=sheet && sheet.querySelector('.qdoc .wrap');
  if(!root || !compactText(root)) throw new Error('미리보기를 먼저 채워 주세요.');
  const logo=await imageRun(new URL('../assets/images/brand/gaeddirang_wordmark.png',location.href).href,76,28);
  const children=[];
  if(logo) children.push(new d.Paragraph({spacing:{after:100},children:[logo]}));
  children.push(...await genericBlocks(root));
  const doc=new d.Document({
    creator:'개띠랑',title:docName(),description:'개띠랑 서류실 편집용 문서',
    styles:{default:{document:{run:{font:'Nanum Gothic',size:20,color:DOCX_INK},paragraph:{spacing:{after:80,line:276}}}}},
    sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:650,right:800,bottom:650,left:800}}},children}]
  });
  return d.Packer.toBlob(doc);
}
async function downloadWord(){
  try{
    downloadBlob(`${docName()}_편집본.docx`, await buildDocxBlob(), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    note('편집용 DOCX를 내려받았어요. 한글에서 열어 수정하거나 HWP로 저장할 수 있어요.');
  }catch(e){ note(e.message||'편집본을 만들지 못했어요.',true); }
}
function note(msg, warn=false){
  const el=helper && helper.querySelector('.doc-assist-note');
  if(el){ el.textContent=msg; el.classList.toggle('warn',warn); }
}
function install(){
  const form=activeView()?.querySelector('.form-col');
  if(!form) return;
  helper=document.createElement('div'); helper.className='card doc-assistant';
  helper.innerHTML=`<h3>작성 도우미 <span class="hint">질문에 답하면 칸이 자동으로 채워져요</span></h3>
    <p class="hint">홈페이지에서 바로 써도 되고, 질문지를 받아 편한 곳에서 작성한 뒤 다시 올려도 됩니다. 파일 내용은 서버에 저장하지 않아요.</p>
    <div class="btns"><button type="button" class="btn-sm doc-assist-down">질문지 받기 (.md)</button><button type="button" class="btn-sm doc-assist-up">작성 파일 올리기</button><button type="button" class="btn-sm doc-assist-word">편집용 Word (.docx)</button></div>
    <div class="parse-note doc-assist-note"></div>`;
  fileInput=document.createElement('input'); fileInput.type='file'; fileInput.accept='.md,.txt,text/markdown,text/plain'; fileInput.hidden=true; helper.appendChild(fileInput);
  helper.querySelector('.doc-assist-down').onclick=downloadQuestionnaire;
  helper.querySelector('.doc-assist-up').onclick=()=>{ fileInput.value=''; fileInput.click(); };
  helper.querySelector('.doc-assist-word').onclick=downloadWord;
  fileInput.onchange=()=>readFile(fileInput.files[0]);
  form.prepend(helper);
}
function moveHelper(){
  const form=activeView()?.querySelector('.form-col');
  if(!form) return;
  if(!helper) install(); else if(helper.parentElement!==form) form.prepend(helper);
  note('');
}
document.addEventListener('click', e=>{ if(e.target.closest('.doc-tab,[data-sub]')) setTimeout(moveHelper,0); });
window.addEventListener('DOMContentLoaded',()=>setTimeout(moveHelper,0));
window.__docsAssistant={makeQuestionnaire,parseAnswers,importQuestionnaire,buildDocxBlob,moveHelper};
})();
