/* 서류실 · 거래처 탭
   - 책방·유통: SCM 「거래처」 탭을 partners-read 함수로 읽기만 한다 (고치기는 시트에서)
   - 기관·학교: 견적 기록(quotes)의 받는 곳을 모은다
   - 견적서·거래명세서 「받는 곳」 칸 자동완성 */
(function(){
  const SCM_URL = 'https://docs.google.com/spreadsheets/d/1ZeH4pa5s1QS8BlC_gbHWLLp0dhezISXfYTXXxiE0NKw/edit';  // admin/index.html에 이미 있는 주소
  const style = document.createElement('style');
  style.textContent = `
    .pt-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
    .pt-head .grow{flex:1}
    .pt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}
    .pt-card{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:12px 14px;display:flex;flex-direction:column;gap:5px}
    .pt-card .nm{font-weight:800;font-size:15px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .pt-line{font-size:13px;display:flex;gap:8px;align-items:flex-start}
    .pt-line .k{color:var(--muted);font-size:11.5px;font-weight:700;min-width:30px;padding-top:1px;white-space:nowrap}
    .pt-line a{color:var(--ink)}
    .pt-memo{font-size:12.5px;color:var(--muted);background:#faf6f1;border-radius:8px;padding:6px 9px;white-space:pre-wrap}
    .pt-memo.ship{color:#8a5a12;background:#fdf3e0}
    .pt-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
    .pt-acts .btn-sm{padding:5px 9px;font-size:12px;text-decoration:none;display:inline-block}
    .pt-sec{font-size:13px;color:var(--muted);font-weight:700;margin:18px 2px 8px}
    .chip.pt-t{background:#f1ede9;color:var(--ink)}
    .chip.pt-r{background:#eef4ff;color:var(--blue)}
  `;
  document.head.appendChild(style);

  const SAMPLE = [  // 미리보기용 가짜 거래처
    { name:'예시책방 바다점', type:'위탁', rate:'70%', cycle:'분기', contact:'010-0000-0001', memo:'평일 11~19시 수령 · 택배는 오후 도착 희망', zip:'00001', addr:'예시도 예시시 바닷길 1', addr2:'1층 예시책방' },
    { name:'예시서림', type:'매입', rate:'60%', cycle:'', contact:'책방지기 김예시 yesi@example.com', memo:'', zip:'', addr:'', addr2:'' },
    { name:'예시 북스토어', type:'위탁', rate:'65%', cycle:'건별', contact:'', memo:'섬 지역 · 우체국택배만 가능', zip:'00002(확인요)', addr:'예시도 예시군 섬길 2', addr2:'' },
  ];
  const SAMPLE_ORGS = [{ name:'예시초등학교', manager:'김담당 / 031-000-0000', biz:'000-00-00000', count:2, won:1, last:'2026-09-01' }];
  const ERRORS = {
    SHEET_NOT_SHARED:'SCM 시트가 서버 계정에 공유되어 있지 않아요.',
    SOURCE_NOT_CONFIGURED:'서버에 SCM 시트 연결 설정이 없어요.',
    SOURCE_AUTH_FAILED:'서버의 구글 계정 인증이 실패했어요.',
    SCHEMA_CHANGED:'SCM 「거래처」 탭의 제목줄이 바뀌어 읽지 못했어요.',
    LOGIN_REQUIRED:'로그인이 만료됐어요. 관리실에서 다시 로그인해 주세요.',
    ADMIN_REQUIRED:'관리자만 볼 수 있어요.',
  };
  let ROWS = [], LOADED = false, LOADING = null;

  const norm = p => ({ name:p['책방명']||'', type:p['거래유형']||'', rate:p['공급률']||'', cycle:p['정산주기']||'', contact:p['담당/연락처']||'',
    memo:p['비고']||'', zip:p['우편번호']||'', addr:p['주소(도로명)']||'', addr2:p['상세주소']||'' });
  const phoneOf = s => (String(s||'').match(/0\d{1,3}-?\d{3,4}-?\d{4}/)||[''])[0];
  const emailOf = s => (String(s||'').match(/[\w.+-]+@[\w-]+\.[\w.]+/)||[''])[0];
  const fullAddr = p => [p.zip ? `(${p.zip})` : '', p.addr, p.addr2].filter(Boolean).join(' ');
  const managerOf = p => [phoneOf(p.contact), emailOf(p.contact)].filter(Boolean).join(' / ') || p.contact;
  const isShipMemo = s => /택배|배송|발송|우체국|수령|도착/.test(s||'');
  const copy = (text, msg) => navigator.clipboard.writeText(text).then(()=>toast(msg)).catch(()=>toast('복사하지 못했어요'));

  async function load(force){
    if(MODE !== 'db'){ ROWS = SAMPLE.slice(); LOADED = true; fillDatalist(); return; }
    if(LOADING) return LOADING;
    if(LOADED && !force) return;
    const note = document.getElementById('ptNote');
    if(note){ note.className = 'parse-note'; note.textContent = 'SCM 「거래처」 탭을 불러오는 중…'; }
    LOADING = (async () => {
      try{
        const { data:{ session } } = await sb.auth.getSession();
        if(!session) throw new Error('LOGIN_REQUIRED');
        const res = await fetch(SUPABASE_URL + '/functions/v1/partners-read', { headers:{ Authorization:'Bearer ' + session.access_token, apikey:SUPABASE_ANON_KEY }, cache:'no-store' });
        const d = await res.json().catch(()=>({}));
        if(!Array.isArray(d.partners)) throw Object.assign(new Error(d.error || ('HTTP ' + res.status)), { meta:d.meta });
        ROWS = d.partners.map(norm).filter(p => p.name);
        LOADED = true;
        const at = d.meta && d.meta.fetchedAt ? new Date(d.meta.fetchedAt).toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }) : '';
        if(note){ note.className = 'parse-note' + (d.meta && d.meta.stale ? ' warn' : ''); note.textContent = `SCM 「거래처」 탭에서 ${ROWS.length}곳을 불러왔어요${at ? ` (${at} 기준)` : ''}. 주소·연락처를 고칠 때는 시트에서 고치면 여기에도 바로 반영돼요.`; }
      }catch(e){
        const extra = e.meta && e.meta.serviceAccount ? ` (${e.meta.serviceAccount} 계정에 보기 권한 공유 필요)` : '';
        if(note){ note.className = 'parse-note warn'; note.textContent = (ERRORS[e.message] || `거래처를 불러오지 못했어요 (${e.message}).`) + extra; }
      }finally{
        LOADING = null;
        fillDatalist();
      }
    })();
    return LOADING;
  }

  function institutions(){
    if(MODE !== 'db') return SAMPLE_ORGS;
    const shops = new Set(ROWS.map(p => p.name));
    const map = new Map();
    QUOTES.slice().sort((a,b) => String(b.statement_date||b.quote_date).localeCompare(String(a.statement_date||a.quote_date))).forEach(r => {
      const name = (r.to_name||'').trim();
      if(!name || shops.has(name)) return;
      let o = map.get(name);
      if(!o){ o = { name, manager:'', biz:'', count:0, won:0, last:r.statement_date||r.quote_date }; map.set(name, o); }
      o.count++; if(r.status === '수주') o.won++;
      if(!o.manager && r.to_manager) o.manager = r.to_manager;
      if(!o.biz && r.to_biz) o.biz = r.to_biz;
    });
    return [...map.values()];
  }

  function lookup(name){
    const p = ROWS.find(x => x.name === name);
    if(p) return { manager:managerOf(p), biz:'' };
    const o = institutions().find(x => x.name === name);
    return o ? { manager:o.manager, biz:o.biz } : null;
  }
  function fillDatalist(){
    let dl = document.getElementById('partnerList');
    if(!dl){ dl = document.createElement('datalist'); dl.id = 'partnerList'; document.body.appendChild(dl); }
    const names = [...new Set([...ROWS.map(p => p.name), ...institutions().map(o => o.name)])];
    dl.innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
  }
  function wireAutocomplete(){
    [['#toName','#toManager','#toBiz', () => update()], ['#tsToName','#tsToManager','#tsToBiz', () => renderStatement()]].forEach(([n, m, b, redraw]) => {
      const el = $(n); if(!el) return;
      el.setAttribute('list', 'partnerList');
      el.addEventListener('change', () => {
        const f = lookup(el.value.trim()); if(!f) return;
        if(!$(m).value && f.manager) $(m).value = f.manager;
        if(!$(b).value && f.biz) $(b).value = f.biz;
        redraw();
      });
    });
  }

  function contactHtml(s){
    if(!s) return '<span style="color:#b3a99f">없음</span>';
    let h = esc(s);
    const ph = phoneOf(s), em = emailOf(s);
    if(ph) h = h.replace(esc(ph), `<a href="tel:${ph.replace(/-/g,'')}">${esc(ph)}</a>`);
    if(em) h = h.replace(esc(em), `<a href="mailto:${esc(em)}">${esc(em)}</a>`);
    return h;
  }
  function toStatement(name, manager, biz){
    switchView('statement'); selectStatementSource('direct');
    $('#tsToName').value = name; $('#tsToManager').value = manager || ''; $('#tsToBiz').value = biz || '';
    renderStatement();
  }
  function shopCard(p){
    const addr = fullAddr(p), ship = isShipMemo(p.memo), check = /확인/.test(p.zip + ' ' + p.memo);
    const el = document.createElement('div'); el.className = 'pt-card';
    el.innerHTML = `<div class="nm">${esc(p.name)}${p.type?`<span class="chip pt-t">${esc(p.type)}</span>`:''}${p.rate?`<span class="chip pt-r">공급률 ${esc(p.rate)}</span>`:''}${!p.addr?'<span class="chip warn">주소 없음</span>':''}${check?'<span class="chip warn">확인 필요</span>':''}</div>
      ${p.cycle?`<div class="pt-line"><span class="k">정산</span><span>${esc(p.cycle)}</span></div>`:''}
      <div class="pt-line"><span class="k">연락</span><span>${contactHtml(p.contact)}</span></div>
      <div class="pt-line"><span class="k">주소</span><span>${addr ? esc(addr) : '<span style="color:#b3a99f">없음</span>'}</span></div>
      ${p.memo?`<div class="pt-memo${ship?' ship':''}">${ship?'📦 ':''}${esc(p.memo)}</div>`:''}
      <div class="pt-acts">
        ${p.addr?'<button class="btn-sm a-addr">주소 복사</button><button class="btn-sm a-ship">배송 정보 복사</button>':''}
        ${p.addr?`<a class="btn-sm" href="https://map.naver.com/p/search/${encodeURIComponent(p.addr)}" target="_blank" rel="noopener noreferrer">지도 ↗</a>`:''}
        <button class="btn-sm a-ts">거래명세서</button>
      </div>`;
    const q = s => el.querySelector(s);
    if(q('.a-addr')) q('.a-addr').onclick = () => copy([p.zip, p.addr, p.addr2].filter(Boolean).join(' '), '주소를 복사했어요');
    if(q('.a-ship')) q('.a-ship').onclick = () => copy([`받는 곳: ${p.name}`, `연락처: ${phoneOf(p.contact) || p.contact || ''}`, `주소: ${addr}`, ship ? `메모: ${p.memo}` : ''].filter(Boolean).join('\n'), '배송 정보를 복사했어요');
    q('.a-ts').onclick = () => toStatement(p.name, managerOf(p), '');
    return el;
  }
  function orgCard(o){
    const el = document.createElement('div'); el.className = 'pt-card';
    el.innerHTML = `<div class="nm">${esc(o.name)}<span class="chip pt-t">기관</span><span class="chip pt-r">견적 ${o.count} · 수주 ${o.won}</span></div>
      <div class="pt-line"><span class="k">담당</span><span>${o.manager ? contactHtml(o.manager) : '<span style="color:#b3a99f">없음</span>'}</span></div>
      ${o.biz?`<div class="pt-line"><span class="k">사업자</span><span>${esc(o.biz)}</span></div>`:''}
      <div class="pt-line"><span class="k">최근</span><span>${dotDate(o.last)}</span></div>
      <div class="pt-acts"><button class="btn-sm a-q">새 견적</button><button class="btn-sm a-ts">거래명세서</button>
        <button class="btn-sm a-rec">기록 보기</button></div>`;
    el.querySelector('.a-q').onclick = () => { resetForm(); switchView('quote'); $('#toName').value = o.name; $('#toManager').value = o.manager; $('#toBiz').value = o.biz; update(); };
    el.querySelector('.a-ts').onclick = () => toStatement(o.name, o.manager, o.biz);
    el.querySelector('.a-rec').onclick = () => { switchView('records'); $('#rSearch').value = o.name; renderRecords(); };
    return el;
  }
  function render(){
    const host = $('#ptHost'); if(!host) return;
    const q = $('#ptSearch').value.trim().toLowerCase(), t = $('#ptType').value, gaps = $('#ptGaps').checked;
    const hit = o => !q || Object.values(o).join(' ').toLowerCase().includes(q);
    const shops = t === '기관' ? [] : ROWS.filter(p => (!t || p.type === t) && (!gaps || !p.addr || !p.contact) && hit(p));
    const orgs = (!t || t === '기관') ? institutions().filter(o => (!gaps || !o.manager) && hit(o)) : [];
    host.innerHTML = '';
    const section = (title, list, card) => {
      if(!list.length) return;
      const h = document.createElement('div'); h.className = 'pt-sec'; h.textContent = title; host.appendChild(h);
      const g = document.createElement('div'); g.className = 'pt-grid'; list.forEach(x => g.appendChild(card(x))); host.appendChild(g);
    };
    section(`책방·유통 ${shops.length}곳 · SCM 「거래처」 탭`, shops, shopCard);
    section(`기관·학교 ${orgs.length}곳 · 견적 기록에서 모음`, orgs, orgCard);
    if(!shops.length && !orgs.length) host.innerHTML = `<div class="empty">${LOADED || MODE!=='db' ? '조건에 맞는 거래처가 없어요.' : '거래처를 불러오는 중이에요.'}</div>`;
  }

  registerDocView('partners', {
    label: '거래처',
    html: `
      <div class="pt-head">
        <input class="in" id="ptSearch" placeholder="이름 · 지역 · 연락처 검색" style="max-width:280px">
        <select class="in" id="ptType" style="width:auto"><option value="">전체</option><option>위탁</option><option>매입</option><option>직판</option><option value="기관">기관·학교</option></select>
        <label class="chk" style="margin:0"><input type="checkbox" id="ptGaps"> 주소·연락처 빈 곳만</label>
        <span class="grow"></span>
        <button class="btn-sm" id="ptReload">↻ 다시 불러오기</button>
        <a class="btn-sm" href="${SCM_URL}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">SCM 거래처 탭에서 고치기 ↗</a>
      </div>
      <div class="parse-note" id="ptNote"></div>
      <div id="ptHost"></div>`,
    init(){
      $('#ptSearch').addEventListener('input', render);
      $('#ptType').addEventListener('change', render);
      $('#ptGaps').addEventListener('change', render);
      $('#ptReload').onclick = () => load(true).then(render);
      wireAutocomplete();
    },
    load(){ return load(); },
    show(){
      if(MODE !== 'db'){
        const note = $('#ptNote'); note.className = 'parse-note warn';
        note.textContent = '미리보기 예시예요. 관리실에 로그인하면 SCM 「거래처」 탭의 실제 책방 정보가 나와요.';
      }
      render();
      load().then(render);
    },
  });
})();
