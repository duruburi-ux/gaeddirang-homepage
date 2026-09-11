/* ============ 서류실 · 명단·출석부 탭 ============
   기관 결과보고·지급 증빙용 참가자 명단과 출석부를 A4로 뽑는다.
   읽기 전용: applications·cohorts 를 읽기만 하고 DB에 아무것도 쓰지 않는다.
   미리보기(?preview)에서는 DB를 부르지 않고 가상의 예시 명단을 쓴다. */
(function(){
  if(typeof registerDocView !== 'function') return;

  const CANCEL = ['취소','환불'];
  const PAGE_H = (typeof A4_CONTENT_HEIGHT !== 'undefined') ? A4_CONTENT_HEIGHT : 1046;
  const R = {
    started:false, doc:'list', src:'apps',
    loaded:false, loading:false, error:'',
    apps:[], cohorts:[], prog:null, cohort:null,
    off:{}, counts:{}, sort:'created',
    dates:['','','',''], auto:{ org:'', period:'', date:'' },
  };

  /* ---------- 스타일 (roster- 로 시작) ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .roster-seg{display:flex;gap:3px;background:#f3ede6;border-radius:10px;padding:3px}
  .roster-seg button{flex:1;border:none;background:none;padding:8px 6px;border-radius:8px;font-size:13.5px;font-weight:700;color:var(--muted)}
  .roster-seg button.on{background:#fff;color:var(--orange);box-shadow:0 1px 3px rgba(60,40,20,.12)}
  .roster-sub{margin-top:10px}
  .roster-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
  .roster-bar .grow{flex:1}
  .roster-people{display:flex;flex-direction:column;gap:5px;margin-top:8px;max-height:380px;overflow:auto}
  .roster-p{display:flex;align-items:center;gap:6px;font-size:13px;background:#fffdfb;border:1px solid var(--line);border-radius:9px;padding:6px 9px}
  .roster-p.off{opacity:.5}
  .roster-p label{flex:1;display:flex;gap:8px;align-items:center;min-width:0;cursor:pointer}
  .roster-p .who{min-width:0;display:flex;flex-wrap:wrap;gap:2px 6px;align-items:center}
  .roster-p .meta{flex-basis:100%;font-size:11.5px;color:var(--muted)}
  .roster-p .in.sm{width:58px;text-align:right}
  .chip.roster-chip-off{background:#f7f3ef;color:#b3a99f}
  .chip.roster-chip-ok{background:#e6f5ee;color:var(--ok)}
  .roster-dates{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:0 8px}
  .roster-dates .in{padding:6px 8px;font-size:13px}
  .roster-off{display:none!important}

  /* 문서 */
  .qdoc.roster-doc h1.roster-mid{letter-spacing:.2em;padding-left:.2em}
  .qdoc.roster-doc h1.roster-long{letter-spacing:.02em;padding-left:0;font-size:24px;white-space:normal}
  .qdoc.roster-doc table{page-break-inside:auto}
  .qdoc.roster-doc thead{display:table-header-group}
  .qdoc.roster-doc tr{page-break-inside:avoid;break-inside:avoid}
  .qdoc.roster-doc .roster-keep{page-break-inside:avoid;break-inside:avoid}
  .qdoc.roster-doc thead th:first-child{text-align:center;padding-left:4px;padding-right:4px}
  .qdoc.roster-doc thead th.roster-l{text-align:left;padding-left:10px}
  .qdoc.roster-doc tbody td:last-child{font-weight:400;color:var(--ink);font-size:12px}
  .qdoc.roster-doc tbody td.roster-no{text-align:center;color:var(--muted);padding-left:4px;padding-right:4px}
  .qdoc.roster-doc tbody td.roster-c{text-align:center;white-space:nowrap}
  .qdoc.roster-doc tbody tr.roster-sum td{background:#f7f3ee;font-weight:800;border-bottom:none}
  .qdoc.roster-doc .roster-cnt{font-size:10.5px;color:var(--muted);font-weight:600;white-space:nowrap}
  .qdoc.roster-doc .roster-privacy{font-size:11px;color:var(--muted);margin-top:6px}
  .qdoc.roster-att tbody td{height:34px;padding-top:3px;padding-bottom:3px}
  .qdoc.roster-att.d1 tbody td{height:31px}
  .qdoc.roster-att.d2 tbody td{height:28px}
  .qdoc.roster-att thead th.roster-s{padding:6px 1px;font-size:11px;line-height:1.25;border-left:1px solid rgba(255,255,255,.2)}
  .qdoc.roster-att thead th.roster-s small{display:block;font-size:9.5px;font-weight:500;opacity:.85}
  .qdoc.roster-att tbody td.roster-t{border-left:1px solid var(--line);padding-left:0;padding-right:0}
  .qdoc.roster-att tbody td.roster-memo{border-left:1px solid var(--line)}
  .qdoc .roster-confirm .sig{width:170px}
  .qdoc .roster-confirm .memo{font-size:12px}
  `;
  document.head.appendChild(css);

  /* ---------- 화면 ---------- */
  const HTML = `
  <div class="layout">
    <div class="form-col">
      <div class="card">
        <h3>① 어떤 서류를 만들까요?</h3>
        <div class="roster-seg" id="roDocSeg"><button data-v="list" class="on">참가자 명단</button><button data-v="attendance">출석부</button></div>
        <div id="roListOpts" class="roster-sub">
          <label class="chk"><input type="checkbox" id="roFull"> 연락처 전체 표시 <span class="hint">(끄면 010-****-1234 처럼 가려져요)</span></label>
          <label class="chk"><input type="checkbox" id="roNoContact"> 연락처 칸 빼기</label>
        </div>
        <div id="roAttOpts" class="roster-sub hidden">
          <div class="row2">
            <div><label class="f" for="roSessions">회차 수 (1~12)</label><input class="in" id="roSessions" type="number" min="1" max="12" value="4"></div>
            <div><label class="f" for="roBlanks">빈 줄 <span class="hint">(현장 추가용)</span></label><input class="in" id="roBlanks" type="number" min="0" max="30" value="0"></div>
          </div>
          <label class="f">회차별 날짜 <span class="hint">(비워 둬도 돼요)</span></label>
          <div class="roster-dates" id="roDates"></div>
          <div class="btns"><button class="btn-sm" id="roWeekly">1회 날짜부터 매주로 채우기</button></div>
        </div>
      </div>

      <div class="card">
        <h3>② 누구를 넣을까요?</h3>
        <div class="roster-seg" id="roSrcSeg"><button data-v="apps" class="on">신청자 표에서</button><button data-v="direct">직접 입력</button></div>
        <div id="roAppsWrap" class="roster-sub">
          <div class="row2">
            <div><label class="f" for="roProg">프로그램</label><select class="in" id="roProg"></select></div>
            <div><label class="f" for="roCohort">기수</label><select class="in" id="roCohort"></select></div>
          </div>
          <label class="chk"><input type="checkbox" id="roIncCancel"> 취소·환불한 사람도 넣기</label>
          <div class="roster-bar">
            <button class="btn-link" id="roAll">모두 넣기</button><button class="btn-link" id="roNone">모두 빼기</button>
            <span class="grow"></span>
            <select class="in sm" id="roSort"><option value="created">신청한 순서</option><option value="name">이름 가나다순</option></select>
            <button class="btn-link hidden" id="roReload">다시 불러오기</button>
          </div>
          <div class="roster-people" id="roPeople"></div>
          <div class="parse-note" id="roAppsNote"></div>
        </div>
        <div id="roDirectWrap" class="roster-sub hidden">
          <p class="hint" style="margin-bottom:6px">한 줄에 한 명씩 적어요. 「이름, 인원, 연락처」처럼 쉼표나 탭으로 나누면 칸이 채워져요. 기관에서 받은 엑셀 표를 그대로 붙여넣어도 돼요.</p>
          <textarea class="in" id="roDirect" rows="8" placeholder="김하늘, 1, 010-1234-5678&#10;이바다, 2&#10;박새봄"></textarea>
          <div class="parse-note" id="roDirectNote"></div>
        </div>
      </div>

      <div class="card">
        <h3>③ 서류에 들어갈 정보</h3>
        <label class="f" for="roTitle">제목</label><input class="in" id="roTitle" placeholder="비우면 「참가자 명단」">
        <label class="f" for="roOrg">기관·프로그램명</label><input class="in" id="roOrg" placeholder="예: 대림도서관 감정카드 클래스">
        <div class="row2">
          <div><label class="f" for="roPeriod">기간·일시</label><input class="in" id="roPeriod" placeholder="예: 9/19~10/10 매주 토 2시"></div>
          <div><label class="f" for="roPlace">장소</label><input class="in" id="roPlace" placeholder="예: 도서관 2층 강의실"></div>
        </div>
        <div class="row2">
          <div><label class="f" for="roManager">개띠랑 담당자</label><input class="in" id="roManager" placeholder="담당자 이름"></div>
          <div><label class="f" for="roDate">작성일</label><input class="in" id="roDate" type="date"></div>
        </div>
      </div>
    </div>

    <div class="preview-col">
      <div class="preview-head">
        <span class="fit" id="roFit">미리보기</span>
        <label class="chk seal-chk hidden" id="roSealWrap"><input type="checkbox" class="sealToggle" checked> 도장</label>
        <button class="btn-primary" id="roPrint">PDF 저장</button>
      </div>
      <div class="preview-box" id="roBox"><div class="sheet" id="roSheet"></div></div>
      <p class="print-tip">「PDF 저장」을 누르면 인쇄 창이 떠요. 대상을 「PDF로 저장」으로 고르면 돼요. 사람이 많아 여러 장이 되면 장마다 표 제목줄이 다시 나와요. 이 탭은 신청자 표를 읽기만 하고 아무것도 바꾸지 않아요.</p>
    </div>
  </div>`;

  /* ---------- 도구 ---------- */
  function maskContact(raw, full){
    const s = String(raw==null ? '' : raw).trim();
    if(!s) return '';
    if(s.includes('@')){
      if(full) return s;
      const [u, dom] = s.split('@');
      return (u||'').slice(0,2) + '***@' + (dom||'');
    }
    const dg = s.replace(/\D/g,'');
    if(/^01\d/.test(dg) && (dg.length===10 || dg.length===11)){
      const mid = dg.slice(3, -4);
      return `${dg.slice(0,3)}-${full ? mid : '*'.repeat(mid.length)}-${dg.slice(-4)}`;
    }
    if(full) return s;
    const total = (s.match(/\d/g)||[]).length;
    if(!total) return s.slice(0,1) + '***';
    const keepHead = total > 8 ? 2 : 0;
    let i = -1;
    return s.replace(/\d/g, ch => { i++; return (i < keepHead || i >= total-4) ? ch : '*'; });
  }
  // participant_count 는 글자 칸이라 "2", "2명", "성인1 아동1" 이 섞여 있다 → 숫자를 더하고, 없으면 1
  function appCount(a){
    const nums = String(a.participant_count==null ? '' : a.participant_count).match(/\d+/g);
    if(!nums) return 1;
    const n = nums.reduce((s,x)=>s+parseInt(x,10), 0);
    return n > 0 ? n : 1;
  }
  const countOf = a => R.counts[a.id] || appCount(a);
  const progKey = a => a.program_name || '';
  function cohortOf(a){
    if(a.cohort_name) return a.cohort_name;
    const c = a.cohort_id ? R.cohorts.find(x=>x.id===a.cohort_id) : null;
    return c ? (c.cohort_name||'') : '';
  }
  const byNewest = (a,b) => String(b.created_at||'').localeCompare(String(a.created_at||''));
  const val = sel => $(sel).value.trim();
  const shortDate = s => { const [, m, d] = (s||'').split('-'); return m ? `${+m}/${+d}` : ''; };
  function sessionCount(){
    const n = parseInt($('#roSessions').value, 10);
    return isNaN(n) ? 4 : Math.min(12, Math.max(1, n));
  }
  function blankCount(){
    const n = parseInt($('#roBlanks').value, 10);
    return isNaN(n) ? 0 : Math.min(30, Math.max(0, n));
  }

  /* ---------- 직접 입력 읽기 ---------- */
  function parseDirect(text){
    const rows = []; let skipped = 0;
    String(text||'').split(/\r?\n/).forEach(raw=>{
      const parts = raw.split(/\t|,/).map(s=>s.trim());
      if(!parts.some(Boolean)) return;
      while(parts.length > 1 && !parts[0]) parts.shift();
      if(parts.length > 1 && /^\d{1,3}[.)]?$/.test(parts[0])) parts.shift();   // 엑셀 번호 칸
      const name = parts[0].replace(/^\d{1,3}[.)]\s+/, '');                     // "1. 김하늘"
      if(!name || /^(번호|no\.?|이름|성명|참가자|참가자명|명단)$/i.test(name)){ skipped++; return; }
      let count = null, contact = '';
      const notes = [];
      parts.slice(1).forEach(p=>{
        if(!p) return;
        if(count==null && /^\d{1,3}\s*명?$/.test(p)) count = parseInt(p, 10);
        else if(!contact && (/^[\d\s\-+().]{7,}$/.test(p) || /@/.test(p))) contact = p;
        else notes.push(p);
      });
      rows.push({ name, count: count || 1, contact, note: notes.join(' · ') });
    });
    return { rows, skipped };
  }
  function updateDirectNote(){
    const { rows, skipped } = parseDirect($('#roDirect').value);
    const total = rows.reduce((s,p)=>s+p.count, 0);
    const note = $('#roDirectNote');
    note.className = 'parse-note';
    note.textContent = rows.length ? `${rows.length}줄 읽었어요 · 총 인원 ${total}명${skipped?` · 제목줄 ${skipped}줄은 뺐어요`:''}` : '';
  }

  /* ---------- 신청자 표 ---------- */
  function groupApps(everyone){
    const inc = $('#roIncCancel').checked;
    let list = R.apps.filter(a => progKey(a)===R.prog && cohortOf(a)===R.cohort);
    if(!everyone && !inc) list = list.filter(a => !CANCEL.includes(a.status));
    list.sort(R.sort==='name'
      ? (a,b) => String(a.applicant_name||'').localeCompare(String(b.applicant_name||''), 'ko')
      : (a,b) => String(a.created_at||'').localeCompare(String(b.created_at||'')));
    return list;
  }
  function fillProgSelect(){
    const progs = [...new Set(R.apps.slice().sort(byNewest).map(progKey))];
    if(!progs.includes(R.prog)) R.prog = progs.length ? progs[0] : null;
    const sel = $('#roProg');
    sel.innerHTML = progs.length
      ? progs.map(p=>`<option value="${esc(p)}">${esc(p||'(프로그램 이름 없음)')} · ${R.apps.filter(a=>progKey(a)===p).length}건</option>`).join('')
      : '<option value="">신청자가 없어요</option>';
    sel.value = R.prog==null ? '' : R.prog;
    fillCohortSelect();
  }
  function fillCohortSelect(){
    const inProg = R.apps.filter(a=>progKey(a)===R.prog).sort(byNewest);
    const cos = [...new Set(inProg.map(cohortOf))];
    if(!cos.includes(R.cohort)) R.cohort = cos.length ? cos[0] : null;
    const sel = $('#roCohort');
    sel.innerHTML = cos.map(c=>`<option value="${esc(c)}">${esc(c||'기수 없음')} · ${inProg.filter(a=>cohortOf(a)===c).length}건</option>`).join('');
    sel.value = R.cohort==null ? '' : R.cohort;
    autofill();
  }
  function findCohort(){
    const ids = new Set(groupApps(true).map(a=>a.cohort_id).filter(Boolean));
    const byId = R.cohorts.find(c=>ids.has(c.id));
    if(byId) return byId;
    if(!R.cohort) return null;
    const same = R.cohorts.filter(c=>c.cohort_name===R.cohort);
    return same.length===1 ? same[0] : null;       // 이름이 겹치면 추측하지 않는다
  }
  // 기수를 고르면 기관·프로그램명, 기간, 1회 날짜를 채운다 (직접 고친 칸은 건드리지 않음)
  function setAuto(sel, key, v){
    const el = $(sel);
    if(!el.value.trim() || el.value===R.auto[key]){ el.value = v; R.auto[key] = v; }
  }
  function autofill(){
    if(R.src!=='apps' || R.prog==null) return;
    const co = findCohort();
    setAuto('#roOrg', 'org', [R.prog, R.cohort].filter(Boolean).join(' '));
    setAuto('#roPeriod', 'period', co ? (co.schedule_text || dotDate(co.start_date)) : '');
    const others = R.dates.slice(1).some(Boolean);
    if(!others && (!R.dates[0] || R.dates[0]===R.auto.date)){
      R.dates[0] = (co && co.start_date) || '';
      R.auto.date = R.dates[0];
      renderDates();
    }
  }
  function clearAuto(){
    [['#roOrg','org'],['#roPeriod','period']].forEach(([sel,key])=>{
      if(R.auto[key] && $(sel).value===R.auto[key]) $(sel).value = '';
      R.auto[key] = '';
    });
  }
  function updateAppsNote(){
    const note = $('#roAppsNote');
    const list = groupApps(false), on = list.filter(a=>!R.off[a.id]);
    const hiddenCancel = $('#roIncCancel').checked ? 0 : groupApps(true).length - list.length;
    const total = on.reduce((s,a)=>s+countOf(a), 0);
    note.className = 'parse-note' + (list.length ? '' : ' warn');
    note.textContent = (list.length ? `${list.length}건 중 ${on.length}건을 넣어요 · 총 인원 ${total}명` : '이 기수에는 넣을 사람이 없어요.')
      + (hiddenCancel ? ` · 취소·환불 ${hiddenCancel}건은 뺐어요` : '');
  }
  function renderPeopleList(){
    const host = $('#roPeople'), note = $('#roAppsNote');
    host.innerHTML = '';
    if(MODE==='db' && !R.loaded){
      note.className = 'parse-note' + (R.error ? ' warn' : '');
      note.textContent = R.error ? `신청자 표를 읽지 못했어요 (${R.error}). 「직접 입력」으로는 만들 수 있어요.` : '신청자 표를 불러오는 중이에요…';
      return;
    }
    if(!R.apps.length){
      note.className = 'parse-note warn';
      note.textContent = '아직 신청자가 없어요. 「직접 입력」으로 만들어 주세요.';
      return;
    }
    groupApps(false).forEach(a=>{
      const row = document.createElement('div');
      row.className = 'roster-p' + (R.off[a.id] ? ' off' : '');
      const raw = String(a.participant_count==null ? '' : a.participant_count).trim();
      const odd = raw && !/^\d+\s*명?$/.test(raw);
      const came = a.attended || a.status==='참석완료';
      row.innerHTML = `<label><input type="checkbox" ${R.off[a.id]?'':'checked'}><span class="who"><b>${esc(a.applicant_name||'(이름 없음)')}</b>${CANCEL.includes(a.status)?`<span class="chip roster-chip-off">${esc(a.status)}</span>`:''}${came?'<span class="chip roster-chip-ok">출석✓</span>':''}<span class="meta">${esc(maskContact(a.contact||a.email, false) || '연락처 없음')}${odd?` · 신청 인원 「${esc(raw)}」`:''}</span></span></label><input class="in sm" type="number" min="1" max="99" value="${countOf(a)}" title="인원"><span class="hint">명</span>`;
      row.querySelector('input[type=checkbox]').onchange = e => {
        if(e.target.checked) delete R.off[a.id]; else R.off[a.id] = true;
        row.classList.toggle('off', !e.target.checked);
        updateAppsNote(); render();
      };
      row.querySelector('input[type=number]').addEventListener('input', e => {
        const n = parseInt(e.target.value, 10);
        if(n > 0) R.counts[a.id] = Math.min(99, n); else delete R.counts[a.id];
        updateAppsNote(); render();
      });
      host.appendChild(row);
    });
    updateAppsNote();
  }
  async function load(){
    if(R.loading) return;
    R.loading = true; R.loaded = false; R.error = '';
    renderPeopleList(); render();
    try{
      const [ap, co] = await Promise.all([
        sb.from('applications').select('*').order('created_at', { ascending:true }),
        sb.from('cohorts').select('*'),
      ]);
      if(ap.error) throw ap.error;
      R.apps = ap.data || [];
      R.cohorts = co.error ? [] : (co.data || []);
      R.loaded = true;
    }catch(e){
      R.error = (e && e.message) || String(e);
    }
    R.loading = false;
    if(R.loaded) fillProgSelect();
    renderPeopleList(); render();
  }

  /* ---------- 미리보기용 가상 명단 (실제 사람 아님) ---------- */
  const SAMPLE_COHORTS = [
    { id:'sc1', program_slug:'example', cohort_name:'9월 1기', start_date:'2026-09-19', schedule_text:'2026. 9. 19. ~ 10. 10. 매주 토 오후 2시 (4회)', capacity:15 },
    { id:'sc2', program_slug:'example', cohort_name:'8월 1기', start_date:'2026-08-22', schedule_text:'2026. 8. 22. 토 오후 2시', capacity:10 },
  ];
  function sampleApps(n){
    const first = ['김하늘','이바다','박새봄','최여름','정가을','강겨울','조은별','윤달님','장햇살','임구름','한바람','오솔길'];
    const fam = '김이박최정강조윤장임한오서신권황안송류홍';
    const given = ['하늘','바다','새봄','여름','가을','겨울','은별','달님','햇살','구름','바람','솔길','다람','나무','노을','이슬','보라','단비','초롱','해솔'];
    const P1 = '예시 · 감정카드 클래스', P2 = '예시 · 그림책 모임';
    const count = Math.min(300, n || 12);
    const two = s => String(s).padStart(2,'0');
    const out = [];
    for(let i=0; i<count; i++){
      out.push({ id:'s'+i, program_name:P1, cohort_id:'sc1', cohort_name:'9월 1기',
        applicant_name: i < first.length ? first[i] : fam[i % fam.length] + given[(i*7) % given.length],
        contact:`010-0000-${String(i+1).padStart(4,'0')}`, email:'',
        participant_count: i===2 ? '2' : i===5 ? '성인1 아동1' : '1',
        status: i%4===0 ? '참석완료' : '확정', attended: i%4===0, channel:'홈페이지',
        created_at:`2026-09-${two(1+Math.floor(i/30))}T${two(9+Math.floor(i/60)%12)}:${two(i%60)}:00` });
    }
    out.push({ id:'sx1', program_name:P1, cohort_id:'sc1', cohort_name:'9월 1기', applicant_name:'서다람', contact:'010-0000-0099', email:'',
      participant_count:'1', status:'취소', attended:false, channel:'홈페이지', created_at:'2026-09-05T10:00:00' });
    out.push({ id:'sx2', program_name:P1, cohort_id:'sc2', cohort_name:'8월 1기', applicant_name:'신나무', contact:'010-0000-0098', email:'',
      participant_count:'1', status:'참석완료', attended:true, channel:'홈페이지', created_at:'2026-08-10T10:00:00' });
    out.push({ id:'sx3', program_name:P2, cohort_id:null, cohort_name:'', applicant_name:'권노을', contact:'', email:'example@example.com',
      participant_count:'1', status:'확정', attended:false, channel:'인스타그램', created_at:'2026-08-01T10:00:00' });
    return out;
  }
  const SAMPLE_DIRECT = ['번호\t이름\t인원\t연락처', '1\t김하늘\t1\t010-0000-0001', '2\t이바다\t2\t010-0000-0002', '3\t박새봄\t1\t010-0000-0003\t보호자 동반',
    '4\t최여름\t1\t010-0000-0004', '5\t정가을\t1', '6\t강겨울\t1\t010-0000-0006'].join('\n');

  /* ---------- 문서 그리기 ---------- */
  function build(){
    const doc = R.doc;
    const sessions = sessionCount();
    while(R.dates.length < sessions) R.dates.push('');
    let people = [];
    if(R.src==='direct') people = parseDirect($('#roDirect').value).rows;
    else if(MODE!=='db' || R.loaded){
      people = groupApps(false).filter(a=>!R.off[a.id]).map(a=>({
        name: a.applicant_name || '(이름 없음)', count: countOf(a), contact: a.contact || a.email || '',
        note: CANCEL.includes(a.status) ? a.status : '' }));
    }
    return {
      doc, src: R.src, title: val('#roTitle') || (doc==='attendance' ? '출석부' : '참가자 명단'),
      org: val('#roOrg'), period: val('#roPeriod'), place: val('#roPlace'), manager: val('#roManager'),
      date: $('#roDate').value || today(), people,
      fullContact: $('#roFull').checked, noContact: $('#roNoContact').checked,
      sessions, dates: R.dates.slice(0, sessions), blanks: doc==='attendance' ? blankCount() : 0,
    };
  }
  function topHtml(d, dense, kind, meta){
    const len = d.title.replace(/\s/g,'').length;
    const h1cls = len > 6 ? ' class="roster-long"' : len > 3 ? ' class="roster-mid"' : '';
    const row = (k, v) => `<div class="row"><span class="k">${k}</span><span class="v">${esc(v)}</span></div>`;
    return `<div class="qdoc roster-doc ${kind}${dense>=1?' d1':''}${dense>=2?' d2':''}"><div class="wrap">
    <div class="head">
      <div><h1${h1cls}>${esc(d.title)}</h1><div class="subtitle">${esc(d.org)}</div></div>
      <div class="head-meta">${meta}</div>
    </div>
    <hr class="rule">
    <div class="info-grid">
      <div class="box"><div class="box-head">프로그램</div><div class="box-body">${row('기관·프로그램', d.org)}${row('기간·일시', d.period)}${row('장소', d.place)}</div></div>
      <div class="box"><div class="box-head">진행</div><div class="box-body">${row('진행', SUPPLIER.상호)}${row('담당', d.manager)}${row('연락처', SUPPLIER.연락처)}</div></div>
    </div>`;
  }
  function listHtml(d, dense){
    const withC = !d.noContact;
    const n = d.people.length, total = d.people.reduce((s,p)=>s+p.count, 0);
    const unit = total===n ? '명' : '건';
    const cols = withC ? [7,25,10,26,32] : [8,36,12,44];
    const rows = n
      ? d.people.map((p,i)=>`<tr><td class="roster-no">${i+1}</td><td class="item-c"><span class="name">${esc(p.name)}</span></td><td class="roster-c">${p.count}</td>${withC?`<td class="roster-c">${esc(maskContact(p.contact, d.fullContact))}</td>`:''}<td class="roster-memo">${esc(p.note)}</td></tr>`).join('')
        + `<tr class="roster-sum"><td></td><td class="item-c">합계 ${n}${unit}</td><td class="roster-c">${total}명</td>${withC?'<td></td>':''}<td></td></tr>`
      : `<tr><td colspan="${cols.length}" style="text-align:center;color:#b3a99f;padding:18px">넣을 사람을 고르면 여기에 표시돼요</td></tr>`;
    return topHtml(d, dense, 'roster-list', `작성일 <b>${dotDate(d.date)}</b><br>인원 <b>총 ${total}명</b>`) + `
    <div class="total-bar"><div class="trow"><span>아래와 같이 참가자 명단을 제출합니다.${unit==='건'?(d.src==='direct'?` (명단 ${n}줄)`:` (신청 ${n}건)`):''}</span><span class="amt">총 ${total}명</span></div></div>
    <table>
      <colgroup>${cols.map(w=>`<col style="width:${w}%">`).join('')}</colgroup>
      <thead><tr><th>번호</th><th class="roster-l">이름</th><th>인원</th>${withC?'<th>연락처</th>':''}<th>비고</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="roster-privacy">개인정보는 제출 목적 외에 쓰지 않습니다.</div>
    <div class="roster-keep">
      <div class="sign">위와 같이 제출합니다. ${dotDate(d.date)}<br><span class="name">${esc(SUPPLIER.상호)} 대표 ${esc(SUPPLIER.대표자)} ${sealMark()}</span></div>
      <div class="foot">${esc(FOOTER())}</div>
    </div>
  </div></div>`;
  }
  function attHtml(d, dense){
    const s = d.sessions;
    const noW = 5.5, nameW = s > 8 ? 15 : s > 4 ? 19 : 24, memoW = s > 8 ? 10 : s > 4 ? 14 : 20;
    const sW = ((100 - noW - nameW - memoW) / s).toFixed(3);
    const lines = d.people.concat(Array.from({ length: d.blanks }, () => null));
    const total = d.people.reduce((a,p)=>a+p.count, 0);
    const heads = d.dates.map((dt,i)=>`<th class="roster-s">${i+1}회${dt?`<small>${shortDate(dt)}</small>`:''}</th>`).join('');
    const rows = lines.length
      ? lines.map((p,i)=>`<tr><td class="roster-no">${i+1}</td><td class="item-c">${p?`<span class="name">${esc(p.name)}</span>${p.count>1?` <span class="roster-cnt">${p.count}명</span>`:''}`:''}</td>${'<td class="roster-t"></td>'.repeat(s)}<td class="roster-memo">${p?esc(p.note):''}</td></tr>`).join('')
      : `<tr><td colspan="${s+3}" style="text-align:center;color:#b3a99f;padding:18px">넣을 사람을 고르면 여기에 표시돼요</td></tr>`;
    const period = d.dates.filter(Boolean);
    return topHtml(d, dense, 'roster-att', `작성일 <b>${dotDate(d.date)}</b><br>회차 <b>${s}회</b> · 명단 <b>${d.people.length}${total!==d.people.length?'건':'명'}</b>`) + `
    <div class="total-bar"><div class="trow"><span>회차마다 출석 칸에 표시해 주세요.${period.length?` (${shortDate(period[0])}${period.length>1?' ~ '+shortDate(period[period.length-1]):''})`:''}</span><span class="amt">총 ${total}명 · ${s}회</span></div></div>
    <table>
      <colgroup><col style="width:${noW}%"><col style="width:${nameW}%">${`<col style="width:${sW}%">`.repeat(s)}<col style="width:${memoW}%"></colgroup>
      <thead><tr><th>번호</th><th class="roster-l">이름</th>${heads}<th>비고</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="roster-keep">
      <div class="receive roster-confirm">
        <div class="memo"><span class="k">표시 방법</span>○ 출석 · △ 지각·조퇴 · × 결석</div>
        <div class="sig"><span class="k">강사 서명</span><div class="line">(서명)</div></div>
        <div class="sig"><span class="k">기관 확인</span><div class="line">(인)</div></div>
      </div>
      <div class="foot">${esc(FOOTER())}</div>
    </div>
  </div></div>`;
  }
  function render(){
    if(!R.started) return null;
    if(typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW !== 'roster') return null;
    const d = build();
    const sheet = $('#roSheet');
    const r = renderSheet(sheet, $('#roBox'), dense => d.doc==='attendance' ? attHtml(d, dense) : listHtml(d, dense), 0);
    const pages = Math.max(1, Math.ceil(sheet.scrollHeight / PAGE_H));
    const fit = $('#roFit');
    fit.textContent = r.over ? `A4 약 ${pages}장 · 넘어가는 장에도 표 제목줄이 다시 나와요` : `A4 한 장${r.dense?' (간격 줄임)':''}`;
    fit.classList.toggle('warn', r.over);
    r.data = d;
    return r;
  }
  function printRoster(){
    const r = render();
    if(!r) return;
    const d = r.data;
    if(!d.people.length && !d.blanks){ toast('넣을 사람을 먼저 골라 주세요'); return; }
    printHtml(r.html, [d.title, d.org, d.date].filter(Boolean).join('_'));
  }

  /* ---------- 칸 모양 ---------- */
  function renderDates(){
    const n = sessionCount();
    while(R.dates.length < n) R.dates.push('');
    $('#roDates').innerHTML = Array.from({ length:n }, (_, i) =>
      `<div><label class="f">${i+1}회</label><input class="in" type="date" data-i="${i}" value="${esc(R.dates[i]||'')}"></div>`).join('');
  }
  function syncUI(){
    document.querySelectorAll('#roDocSeg button').forEach(b=>b.classList.toggle('on', b.dataset.v===R.doc));
    document.querySelectorAll('#roSrcSeg button').forEach(b=>b.classList.toggle('on', b.dataset.v===R.src));
    $('#roListOpts').classList.toggle('hidden', R.doc!=='list');
    $('#roAttOpts').classList.toggle('hidden', R.doc!=='attendance');
    $('#roAppsWrap').classList.toggle('hidden', R.src!=='apps');
    $('#roDirectWrap').classList.toggle('hidden', R.src!=='direct');
    $('#roSealWrap').classList.toggle('roster-off', R.doc==='attendance');   // 출석부엔 대표 도장이 없다
    $('#roReload').classList.toggle('hidden', MODE!=='db');
    $('#roFull').disabled = $('#roNoContact').checked;
    $('#roTitle').placeholder = `비우면 「${R.doc==='attendance' ? '출석부' : '참가자 명단'}」`;
  }

  function start(){
    R.started = true;
    $('#roDate').value = today();
    const prefs = store('docs_roster_prefs');
    if(prefs && prefs.manager) $('#roManager').value = prefs.manager;
    if(MODE==='preview'){
      R.apps = sampleApps(12); R.cohorts = SAMPLE_COHORTS; R.loaded = true;
      $('#roDirect').value = SAMPLE_DIRECT;
      if(!$('#roPlace').value) $('#roPlace').value = '개띠랑 작업실 (예시)';
      if(!$('#roManager').value) $('#roManager').value = '예시 담당자';
      fillProgSelect(); renderPeopleList(); updateDirectNote();
    } else if(MODE==='db'){
      load();
    }
    renderDates(); syncUI();
  }

  function init(){
    document.querySelectorAll('#roDocSeg button').forEach(b => b.onclick = () => {
      R.doc = b.dataset.v; syncUI(); if(R.doc==='attendance') renderDates(); render();
    });
    document.querySelectorAll('#roSrcSeg button').forEach(b => b.onclick = () => {
      R.src = b.dataset.v;
      if(R.src==='direct'){ clearAuto(); updateDirectNote(); }
      else { renderPeopleList(); autofill(); }
      syncUI(); render();
    });
    $('#roProg').addEventListener('change', e => { R.prog = e.target.value; R.cohort = null; fillCohortSelect(); renderPeopleList(); render(); });
    $('#roCohort').addEventListener('change', e => { R.cohort = e.target.value; autofill(); renderPeopleList(); render(); });
    $('#roIncCancel').addEventListener('change', () => { renderPeopleList(); render(); });
    $('#roSort').addEventListener('change', e => { R.sort = e.target.value; renderPeopleList(); render(); });
    $('#roAll').onclick = () => { groupApps(false).forEach(a => delete R.off[a.id]); renderPeopleList(); render(); };
    $('#roNone').onclick = () => { groupApps(false).forEach(a => { R.off[a.id] = true; }); renderPeopleList(); render(); };
    $('#roReload').onclick = () => load();
    $('#roDirect').addEventListener('input', () => { updateDirectNote(); render(); });
    ['#roTitle','#roOrg','#roPeriod','#roPlace','#roManager'].forEach(s => $(s).addEventListener('input', render));
    $('#roManager').addEventListener('change', e => store('docs_roster_prefs', { manager: e.target.value.trim() }));
    $('#roDate').addEventListener('change', render);
    $('#roFull').addEventListener('change', render);
    $('#roNoContact').addEventListener('change', () => { syncUI(); render(); });
    $('#roSessions').addEventListener('input', () => { renderDates(); render(); });
    $('#roSessions').addEventListener('change', e => { e.target.value = sessionCount(); renderDates(); render(); });
    $('#roBlanks').addEventListener('input', render);
    $('#roBlanks').addEventListener('change', e => { e.target.value = blankCount(); render(); });
    $('#roDates').addEventListener('change', e => {
      const i = parseInt(e.target.dataset.i, 10);
      if(isNaN(i)) return;
      R.dates[i] = e.target.value;
      if(i===0) R.auto.date = '';
      render();
    });
    $('#roWeekly').onclick = () => {
      const first = R.dates[0];
      if(!first){ toast('1회 날짜를 먼저 넣어 주세요'); return; }
      const [y, m, d] = first.split('-').map(Number);
      for(let i=1; i<sessionCount(); i++) R.dates[i] = new Date(y, m-1, d + 7*i).toLocaleDateString('sv-SE');
      renderDates(); render();
    };
    $('#roPrint').onclick = printRoster;
    renderDates(); syncUI();
  }

  registerDocView('roster', {
    label: '명단·출석부',
    html: HTML,
    init,
    show(){ if(!R.started) start(); else syncUI(); render(); },
    render,
    // 확인용: ?preview&printtest=roster:list | roster:attendance
    //   &n=40 사람 수 · &s=12 회차 수 · &src=direct 직접 입력 예시 · &full=1 연락처 전체 · &nocontact=1 연락처 칸 빼기
    printTest(sub, params){
      if(!R.started) start();
      const has = k => !!(params && params.has && params.has(k));
      const get = k => (params && params.get) ? parseInt(params.get(k), 10) : NaN;
      const n = get('n');
      if(n > 0){ R.apps = sampleApps(n); R.off = {}; R.counts = {}; R.src = 'apps'; fillProgSelect(); renderPeopleList(); }
      if(params && params.get && params.get('src')==='direct'){ R.src = 'direct'; clearAuto(); $('#roOrg').value = '예시 · 도서관 기관 수업'; updateDirectNote(); }
      $('#roFull').checked = has('full');
      $('#roNoContact').checked = has('nocontact');
      R.doc = sub==='attendance' ? 'attendance' : 'list';
      if(R.doc==='attendance'){
        const s = get('s');
        $('#roSessions').value = s > 0 ? Math.min(12, s) : 4;
        const [y, m, d] = (R.dates[0] || '2026-09-19').split('-').map(Number);
        for(let i=0; i<sessionCount(); i++) R.dates[i] = new Date(y, m-1, d + 7*i).toLocaleDateString('sv-SE');
        renderDates();
      }
      syncUI();
      const r = render();
      return r ? r.html : '';
    },
  });
})();
