/* 기존 강사 프로필 파일을 브라우저 안에서 읽고 강사 프로필 칸에 채운다. */
(() => {
'use strict';

const MAX_FILE = 20 * 1024 * 1024;
const MAX_FILES = 6;
const IMPORTER_VERSION = '2026.09.16.4';
const CDN = {
  zip:'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  pdf:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  pdfWorker:'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  ocr:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  cfb:'https://cdn.jsdelivr.net/npm/cfb@1.2.2/dist/cfb.min.js',
  pako:'https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js',
};
const loaded = new Map();
let input, panel, busy = false;

function loadScript(src, ready){
  if(ready()) return Promise.resolve();
  if(loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => ready() ? resolve() : reject(new Error('도구를 불러오지 못했어요'));
    s.onerror = () => reject(new Error('파일 읽기 도구를 불러오지 못했어요 · 인터넷 연결을 확인해 주세요'));
    document.head.appendChild(s);
  });
  loaded.set(src, p); return p;
}
const ext = file => (file.name.split('.').pop() || '').toLowerCase();
const status = (msg, warn=false) => {
  const el = panel && panel.querySelector('.profile-import-note');
  if(el){ el.textContent = msg; el.classList.toggle('warn', warn); }
};
function xmlText(xml, paragraphNames){
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if(doc.querySelector('parsererror')) return xml.replace(/<[^>]+>/g, ' ');
  const paras = [];
  const names = paragraphNames || ['p'];
  const nodes = [...doc.getElementsByTagName('*')].filter(n => names.includes(n.localName));
  nodes.forEach(p => {
    const text = [...p.getElementsByTagName('*')].filter(n => n.localName === 't').map(n => n.textContent || '').join('');
    if(text.trim()) paras.push(text.trim());
  });
  if(paras.length) return paras.join('\n');
  return [...doc.getElementsByTagName('*')].filter(n => n.localName === 't').map(n => n.textContent || '').join('\n');
}
async function readZipFile(file, kind){
  await loadScript(CDN.zip, () => !!window.JSZip);
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files).filter(name => {
    if(kind === 'docx') return /^word\/(document|header\d*|footer\d*)\.xml$/i.test(name);
    return /^Contents\/section\d+\.xml$/i.test(name);
  }).sort();
  if(!names.length) throw new Error(kind === 'docx' ? 'Word 문서에서 글을 찾지 못했어요' : 'HWPX 문서에서 본문을 찾지 못했어요');
  const parts = [];
  for(const name of names){
    const xml = await zip.file(name).async('string');
    parts.push(xmlText(xml, kind === 'docx' ? ['p'] : ['p','run']));
  }
  return parts.join('\n');
}
async function readPdf(file){
  await loadScript(CDN.pdf, () => !!window.pdfjsLib);
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
  const pdf = await window.pdfjsLib.getDocument({ data:new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for(let n=1; n<=pdf.numPages; n++){
    status(`${file.name} 읽는 중 · ${n}/${pdf.numPages}쪽`);
    const content = await (await pdf.getPage(n)).getTextContent();
    let line = '', lastY = null, lastEndX = null; const rows = [];
    content.items.forEach(item => {
      const y = item.transform && item.transform[5];
      const x = item.transform && item.transform[4];
      if(lastY != null && y != null && Math.abs(y-lastY) > 3){ if(line.trim()) rows.push(line.trim()); line = ''; lastEndX = null; }
      const gap = line && x != null && lastEndX != null ? x-lastEndX : 0;
      const space = line && gap > Math.max(1.5, Number(item.height || 10) * .12) ? ' ' : '';
      line += space + (item.str || ''); lastY = y;
      if(x != null) lastEndX = x + Number(item.width || 0);
    });
    if(line.trim()) rows.push(line.trim()); pages.push(rows.join('\n'));
  }
  return pages.join('\n');
}
function cfbEntries(cfb){
  const files = (cfb && cfb.FileIndex) || [];
  const paths = (cfb && cfb.FullPaths) || [];
  return files.map((file, index) => ({ file, path:String(paths[index] || file.name || '').replace(/\\/g,'/') }));
}
function findStream(cfb, suffix){
  const wanted = suffix.toLowerCase();
  return cfbEntries(cfb).find(x => x.path.toLowerCase().endsWith(wanted))?.file;
}
function hwpRecordText(bytes){
  const out = []; let pos = 0;
  while(pos + 4 <= bytes.length){
    const h = bytes[pos] | (bytes[pos+1]<<8) | (bytes[pos+2]<<16) | (bytes[pos+3]<<24); pos += 4;
    const tag = h & 0x3ff; let size = (h >>> 20) & 0xfff;
    if(size === 0xfff){ if(pos+4>bytes.length) break; size = bytes[pos] | (bytes[pos+1]<<8) | (bytes[pos+2]<<16) | (bytes[pos+3]<<24); pos += 4; }
    if(size < 0 || pos + size > bytes.length) break;
    if(tag === 67 && size){
      let text = new TextDecoder('utf-16le').decode(bytes.slice(pos, pos+size));
      text = text.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
      if(text) out.push(text);
    }
    pos += size;
  }
  return out.join('\n');
}
async function readHwp(file){
  await Promise.all([
    loadScript(CDN.cfb, () => !!window.CFB),
    loadScript(CDN.pako, () => !!window.pako),
  ]);
  const cfb = window.CFB.read(new Uint8Array(await file.arrayBuffer()), { type:'array' });
  const header = findStream(cfb, 'FileHeader');
  if(!header || !header.content) throw new Error('지원하는 HWP 5.x 문서가 아니에요');
  const head = new Uint8Array(header.content); const compressed = head.length > 36 && !!(head[36] & 1);
  const sections = cfbEntries(cfb)
    .filter(x => /BodyText[\/]Section\d+$/i.test(x.path))
    .sort((a,b) => a.path.localeCompare(b.path, undefined, {numeric:true}));
  const parts = sections.map(s => {
    let data = new Uint8Array(s.file.content || []);
    if(compressed) data = window.pako.inflateRaw(data);
    return hwpRecordText(data);
  }).filter(Boolean);
  if(!parts.length) throw new Error('HWP에서 본문 글자를 찾지 못했어요 · HWPX나 PDF로 저장해 다시 올려 주세요');
  return parts.join('\n');
}
async function readImage(file){
  await loadScript(CDN.ocr, () => !!window.Tesseract);
  const result = await window.Tesseract.recognize(file, 'kor+eng', {
    logger:m => { if(m.status === 'recognizing text') status(`${file.name} 글자 읽는 중 · ${Math.round((m.progress || 0)*100)}%`); }
  });
  return result.data && result.data.text || '';
}
async function readOne(file){
  if(file.size > MAX_FILE) throw new Error(`${file.name}: 20MB 이하 파일만 읽을 수 있어요`);
  const x = ext(file);
  if(['txt','md','csv','rtf'].includes(x)) return file.text();
  if(x === 'docx') return readZipFile(file, 'docx');
  if(x === 'hwpx') return readZipFile(file, 'hwpx');
  if(x === 'hwp') return readHwp(file);
  if(x === 'pdf') return readPdf(file);
  if(['png','jpg','jpeg','webp','bmp'].includes(x)) return readImage(file);
  throw new Error(`${file.name}: 지원하지 않는 형식이에요`);
}
function currentValues(){
  const keys = ['name','headline','intro','careers','works','lectures'];
  return Object.fromEntries(keys.map(k => [k, document.querySelector(`#view-kit [data-f="profile.${k}"]`)?.value.trim() || '']));
}
function fill(result){
  const missingDefault = ['careers','works','lectures'].some(k => result[k] && !document.querySelector(`#view-kit [data-f="profile.${k}"]`));
  if(missingDefault) document.querySelector('#view-kit #kitProfileDefaults')?.click();
  const existing = currentValues();
  if(Object.values(existing).some(Boolean) && !confirm('지금 강사 프로필 칸에 적힌 내용이 있어요. 올린 자료의 정리 결과로 바꿀까요?')) return false;
  let count = 0;
  ['name','headline','intro','careers','works','lectures'].forEach(k => {
    const el = document.querySelector(`#view-kit [data-f="profile.${k}"]`);
    if(!el || !result[k]) return;
    el.value = result[k];
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true})); count++;
  });
  return count;
}
async function importFiles(files){
  if(busy || !files.length) return;
  if(files.length > MAX_FILES){ status(`한 번에 ${MAX_FILES}개까지 올릴 수 있어요`, true); return; }
  busy = true; panel.querySelector('.profile-import-btn').disabled = true;
  const parts = [], errors = [];
  try{
    for(let i=0; i<files.length; i++){
      status(`${files[i].name} 읽는 중 · ${i+1}/${files.length}`);
      try{ const text = await readOne(files[i]); if(text.trim()) parts.push(text); else errors.push(`${files[i].name}: 글자를 찾지 못함`); }
      catch(e){ errors.push(e.message || `${files[i].name}: 읽기 실패`); }
    }
    if(!parts.length){ status(errors.join('\n') || '읽을 수 있는 글자가 없어요', true); return; }
    const result = window.ProfileImportModel.parseProfile(parts.join('\n\n'), files.map(f => f.name));
    if(result.blockedReason){
      status(`[판독기 ${IMPORTER_VERSION}] ${files.map(f => f.name).join(', ')}\n자동 정리를 멈췄어요. 기존 내용은 그대로예요.\n이유: ${result.blockedReason}\n다른 형식으로 다시 올리거나 내용을 직접 확인해 주세요.`, true);
      return;
    }
    const count = fill(result);
    if(count === false){ status('가져오기를 취소했어요. 기존 내용은 그대로예요.'); return; }
    const tail = [...result.warnings, ...errors];
    status(`[판독기 ${IMPORTER_VERSION}] ${count}개 항목을 정리해 채웠어요. 자동 분류 결과를 확인한 뒤 저장해 주세요.${tail.length ? '\n확인할 점: '+tail.join(' · ') : ''}`, tail.length>0);
  } finally {
    busy = false; panel.querySelector('.profile-import-btn').disabled = false;
  }
}
function install(){
  const form = document.querySelector('#view-kit [data-form="profile"]');
  if(!form || form.querySelector('.profile-import')) return;
  panel = document.createElement('div'); panel.className = 'card profile-import';
  panel.innerHTML = `<h3>기존 프로필에서 자동으로 채우기 <span class="hint">원본은 바꾸거나 저장하지 않아요</span></h3>
    <p class="hint">예전에 만든 프로필 파일을 올리면 이름·소개·경력·저서·출강 이력으로 나눠 칸을 채워요. 여러 파일을 함께 올려도 됩니다.</p>
    <div class="btns"><button type="button" class="btn-sm profile-import-btn">기존 프로필 파일 올리기</button></div>
    <p class="profile-import-types">HWP·HWPX · PDF · Word(DOCX) · 이미지 · TXT/MD · 파일당 20MB 이하</p>
    <div class="parse-note profile-import-note"></div>`;
  input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.hidden = true;
  input.accept = '.hwp,.hwpx,.pdf,.docx,.png,.jpg,.jpeg,.webp,.bmp,.txt,.md,.csv,.rtf'; panel.appendChild(input);
  panel.querySelector('.profile-import-btn').onclick = () => { input.value=''; input.click(); };
  input.onchange = () => importFiles([...input.files]);
  const saved = form.querySelector('.card'); saved.after(panel);
}
const style = document.createElement('style');
style.textContent = '.profile-import-types{font-size:11.5px;color:var(--muted);margin-top:8px}.profile-import-btn:disabled{opacity:.55;cursor:wait}.profile-import-note{line-height:1.55}';
document.head.appendChild(style);
window.addEventListener('DOMContentLoaded', install);
window.addEventListener('hashchange', () => setTimeout(install, 0));
document.addEventListener('click', e => {
  if(e.target.closest('.doc-tab,#kitSeg [data-sub]')) setTimeout(install, 0);
});
window.__profileImport = { readOne, importFiles, install };
})();
