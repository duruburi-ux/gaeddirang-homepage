/* ============ 사례비 지급 명세 (admin/docs.html 추가 탭) ============
   - 지원사업 강사·보조강사·자문 사례비를 사람별로 적으면 원천세(docs.html 의 withholding)를 계산해
     「사례비 지급 명세서」 A4 한 장과 원천세 신고용 요약을 만든다.
   - 저장은 관리자 로그인(db 모드)에서만 public.fee_sheets 에 한다. 미리보기 모드는 DB를 전혀 부르지 않는다.
   - 주민등록번호·계좌번호는 받지 않는다. 그렇게 보이는 숫자가 있으면 붙여넣기에서 버리고 저장·PDF를 막는다. */
(function(){
  if(typeof registerDocView !== 'function') return;

  const KIND_ORDER = ['biz', 'etc', 'none'];
  const KIND_NAME = { biz:'사업소득', etc:'기타소득', none:'원천징수 없음' };
  const KIND_OPTION = { biz:'사업소득 3.3%', etc:'기타소득 8.8%', none:'원천징수 없음' };
  const KIND_CELL = { biz:'사업소득', etc:'기타소득', none:'징수 없음' };
  // 경기문화재단 「원천세 온라인 신고 납부 가이드」의 홈택스 입력 칸
  const HOMETAX_CELL = { biz:'매월징수 (A25)', etc:'그 외 (A42)', none:'—' };
  const DRAFT_KEY = 'docs_fees_draft';

  const S = { ready:false, rows:[], current:null, dirty:false, belongTouched:false,
    list:[], loaded:false, loading:false, loadError:'' };

  /* ---------- 도구 ---------- */
  const blankRow = () => ({ name:'', role:'', kind:'biz', gross:null, note:'' });
  const hasAmount = r => r.gross != null && !Number.isNaN(r.gross) && r.gross > 0;
  const validRow = r => !!(r.name||'').trim() && hasAmount(r);
  const blankish = r => !(r.name||'').trim() && !(r.role||'').trim() && !(r.note||'').trim() && r.gross == null;
  const partialRow = r => !blankish(r) && !validRow(r);
  const lines = text => String(text||'').split('\n').map(x=>x.trim()).filter(Boolean);

  function normMonth(text){
    const m = String(text||'').match(/^\s*(\d{4})\s*(?:[-./]|년)?\s*(\d{1,2})\s*월?\s*\.?\s*$/);
    if(!m) return '';
    const mm = parseInt(m[2], 10);
    return mm >= 1 && mm <= 12 ? `${m[1]}-${String(mm).padStart(2,'0')}` : '';
  }
  const monthLabel = ym => { const [y, m] = (ym||'').split('-'); return y && m ? `${y}년 ${parseInt(m,10)}월` : ''; };
  function dueDate(payDate){  // 지급한 달의 다음 달 10일 (가이드 기준, 휴일 연장은 따지지 않음)
    const [y, m] = (payDate||'').split('-').map(Number);
    return y && m ? new Date(y, m, 10).toLocaleDateString('sv-SE') : '';
  }
  // 주민등록번호(6-7자리)나 계좌번호처럼 숫자가 10개 넘게 이어진 조각
  function looksSensitive(text){
    const t = String(text||'');
    if(/\d{6}\s*-\s*[1-8]\d{6}/.test(t)) return true;
    return (t.match(/\d[\d-]*\d/g)||[]).some(m => m.replace(/\D/g,'').length >= 10);
  }
  const isAmount = c => { const v = parseWon(c); return v != null && !Number.isNaN(v) && v >= 1000; };
  function kindOf(text){
    const t = String(text||'').replace(/\s/g,'');
    if(/^(사업|사업소득|사업소득3\.3%?|3\.3%?)$/.test(t)) return 'biz';
    if(/^(기타|기타소득|기타소득8\.8%?|8\.8%?)$/.test(t)) return 'etc';
    if(/^(없음|원천징수없음|징수없음|미징수)$/.test(t)) return 'none';
    return null;
  }

  function calcRow(r){
    const kind = KIND_NAME[r.kind] ? r.kind : 'biz';
    const gross = hasAmount(r) ? r.gross : 0;
    const w = withholding(gross, kind);
    return { name:(r.name||'').trim(), role:(r.role||'').trim(), note:(r.note||'').trim(), kind, gross,
      tax:w.tax, local:w.local, net: gross - w.tax - w.local, underMin: kind==='etc' && gross > 0 && w.tax === 0 };
  }

  /* ---------- 붙여넣기: 이름 <탭/쉼표> 역할 <탭/쉼표> 금액 ---------- */
  function splitLine(line){
    if(line.includes('\t')) return line.split('\t').map(c=>c.trim());
    if(line.includes(',')){
      const out = [];
      line.split(',').forEach(raw => {
        const c = raw.trim();
        // 300,000 처럼 천 단위 쉼표로 쪼개진 금액은 다시 붙인다
        if(out.length && /^\d{3}(원)?$/.test(c) && /^\d{1,3}(,\d{3})*$/.test(out[out.length-1])) out[out.length-1] += ','+c;
        else out.push(c);
      });
      return out;
    }
    return line.split(/\s+/);
  }
  function parsePaste(text, defKind){
    const rows = []; let skipped = 0, dropped = 0;
    for(const raw of String(text||'').split(/\r?\n/)){
      if(!raw.trim()) continue;
      let cells = splitLine(raw.trim()).filter(c => {
        if(looksSensitive(c)){ dropped++; return false; }
        return true;
      });
      if(cells.length && /^\d{1,3}[.)]?$/.test(cells[0])) cells = cells.slice(1);   // 앞에 붙은 번호
      const ai = cells.findIndex((c, i) => i > 0 && isAmount(c));
      const name = (cells[0]||'').trim();
      if(!name || ai < 0 || isAmount(name) || kindOf(name)){ skipped++; continue; }
      let kind = null;
      const role = [], note = [];
      cells.forEach((c, i) => {
        if(i === 0 || i === ai || !c) return;
        const k = kindOf(c);
        if(k && !kind){ kind = k; return; }
        (i < ai ? role : note).push(c);
      });
      rows.push({ name, role: role.join(' '), kind: kind || defKind || 'biz', gross: parseWon(cells[ai]), note: note.join(' / ') });
    }
    return { rows, skipped, dropped };
  }

  /* ---------- 화면 ---------- */
  const kindOptions = sel => KIND_ORDER.map(k=>`<option value="${k}"${k===sel?' selected':''}>${KIND_OPTION[k]}</option>`).join('');

  const HTML = `
    <div class="layout">
      <div class="form-col">
        <div class="saved-bar" id="feSavedBar"></div>

        <div class="card">
          <h3>① 지급 정보</h3>
          <label class="f" for="feTitle">사업명</label>
          <input class="in" id="feTitle" placeholder="예: 2026 가을 인문학 워크숍">
          <div class="row2">
            <div><label class="f" for="fePayDate">지급일</label><input class="in" id="fePayDate" type="date"></div>
            <div><label class="f" for="feBelong">귀속월</label><input class="in" id="feBelong" placeholder="2026-09" inputmode="numeric"></div>
          </div>
          <p class="hint fees-mt">귀속월은 지급일의 달로 채워져요. 다른 달 사례비면 직접 고쳐 주세요.</p>
          <label class="f" for="feNote">비고 <span class="hint">(한 줄에 하나)</span></label>
          <textarea class="in" id="feNote" rows="2" placeholder="예: 1~4회차 강사비와 기획회의 2회분"></textarea>
        </div>

        <div class="card">
          <h3>② 명단 붙여넣기 <span class="hint">(선택)</span></h3>
          <p class="hint" style="margin-bottom:6px">한 줄에 한 사람씩 「이름, 역할, 금액」으로 적거나 엑셀에서 칸째 복사해 붙여넣으세요. 소득 구분 칸(사업·기타·없음)이 있으면 그걸 따라요.</p>
          <textarea class="in" id="fePaste" rows="3" placeholder="김하늘, 주강사, 300,000&#10;박바다&#9;보조강사&#9;150000"></textarea>
          <div class="btns">
            <select class="in sm" id="fePasteKind">${kindOptions('biz')}</select>
            <button class="btn-sm" id="fePasteBtn">칸 채우기</button>
          </div>
          <div class="parse-note" id="fePasteNote"></div>
        </div>

        <div class="card">
          <h3>③ 받는 사람</h3>
          <p class="fees-safe">주민등록번호·계좌번호는 이 화면에 적거나 저장하지 않아요</p>
          <div id="feRows"></div>
          <button class="btn-sm wide" id="feAddRow">+ 사람 추가</button>
          <div class="budget">소득 구분(사업소득·기타소득)과 소액부징수·과세최저한 같은 예외는 세무사에게 꼭 확인해 주세요. 여기서는 3.3%·8.8% 기본 계산만 해요.</div>
        </div>

        <div class="card">
          <h3>저장된 명세서</h3>
          <div id="feList"></div>
        </div>
      </div>

      <div class="preview-col">
        <div class="preview-head">
          <span class="fit" id="feFit">미리보기</span>
          <button class="btn-sm" id="feResetBtn">새로 쓰기</button>
          <label class="chk seal-chk hidden"><input type="checkbox" class="sealToggle" checked> 도장</label>
          <button class="btn-sm hidden" id="feSaveBtn">저장</button>
          <button class="btn-primary" id="fePrintBtn">PDF 저장</button>
        </div>
        <div class="preview-box" id="feBox"><div class="sheet" id="feSheet"></div></div>
        <p class="print-tip" id="feTip"></p>
      </div>
    </div>`;

  const CSS = `
    .fees-safe{font-size:12.5px;font-weight:600;color:#3b8f63;background:#eef7f1;border-radius:8px;padding:7px 10px;margin-bottom:8px}
    .fees-mt{margin-top:6px}
    .fees-top .in{flex:1 1 0;min-width:0}
    .fees-top .r-role{flex:1.4 1 0}
    .fees-no{align-self:center;min-width:18px;text-align:center;font-size:12px;font-weight:700;color:var(--muted)}
    .fees-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:6px}
    .fees-grid label.f{margin-top:2px}
    .fees-warn{color:#d9583c}
    .fees-list .rec{padding:9px 11px;gap:8px}
    .fees-list .rec-main{min-width:170px}

    .qdoc.fees-doc h1{font-size:28px;letter-spacing:.14em;padding-left:0}
    .qdoc.fees-doc .ph{color:#b3a99f}
    .qdoc.fees-doc h2 .fees-unit{font-size:11px;color:var(--muted);font-weight:600;margin-left:6px}
    .qdoc.fees-doc table{font-size:12.5px}
    .qdoc.fees-doc thead th{padding:8px 5px;font-size:11.5px}
    .qdoc.fees-doc thead th:first-child{padding-left:8px}
    .qdoc.fees-doc tbody td{padding:8px 5px}
    .qdoc.fees-doc tbody td.item-c{padding-left:8px}
    .qdoc.fees-doc tbody td:last-child{font-size:12.5px}
    .qdoc.fees-doc tfoot td{padding:8px 5px}
    .qdoc.fees-doc tfoot td:first-child{padding-left:8px}
    .qdoc.fees-doc thead th{white-space:nowrap}
    .qdoc.fees-doc .fees-note{display:block;font-size:11px;color:var(--muted);margin-top:1px}
    .qdoc.fees-doc.d2 .fees-note{display:inline;font-size:10.5px;margin:0 0 0 3px}
    .qdoc.fees-doc.d2 .fees-note:not(.only)::before{content:'· '}
    .qdoc.fees-doc .fees-r{text-align:right;white-space:nowrap}
    .qdoc.fees-doc .fees-wrap{white-space:normal}
    .qdoc.fees-doc .fees-trow2{margin-top:6px;font-size:12.5px;color:var(--muted)}
    .qdoc.fees-doc .fees-trow2 b{color:var(--ink);font-weight:900;font-size:14px}
    .qdoc.fees-doc .fees-sum{margin-top:12px}
    .qdoc.fees-doc .fees-sum .box-head{display:flex;justify-content:space-between;gap:10px}
    .qdoc.fees-doc .fees-sum .box-head span{color:var(--muted);font-weight:600}
    .qdoc.fees-doc .fees-sum thead th{background:#f7f3ee;color:var(--muted);padding:6px 5px}
    .qdoc.fees-doc .fees-sum tbody td{padding:6px 5px}
    .qdoc.fees-doc .fees-sum tbody td:last-child{font-weight:700;color:var(--ink)}
    .qdoc.fees-doc .fees-sum tfoot td{background:var(--wash);color:var(--accent-deep)}
    .qdoc.fees-doc .fees-sum-foot{padding:7px 12px;font-size:11.5px;color:var(--muted);border-top:1px solid var(--line);line-height:1.6}
    .qdoc.fees-doc .fees-sum-foot b{color:var(--ink)}
    .qdoc.fees-doc .fees-rules{margin-top:2px;line-height:1.5}
    .qdoc.fees-doc .fees-rules b{color:var(--muted);font-weight:800}
    .qdoc.fees-doc.d1 tbody td{padding:5px 5px}
    .qdoc.fees-doc.d1 .fees-sum tbody td{padding:4px 5px}
    .qdoc.fees-doc.d2 h1{font-size:25px}
    .qdoc.fees-doc.d2 .head-meta{line-height:1.6}
    .qdoc.fees-doc.d2 table{font-size:12px}
    .qdoc.fees-doc.d2 tbody td{line-height:1.3}
    .qdoc.fees-doc.d2 tbody td:last-child{font-size:12px}
    .qdoc.fees-doc.d2 .sub{font-size:10.5px;margin-top:0}
    .qdoc.fees-doc.d2 thead th{padding:5px 5px}
    .qdoc.fees-doc.d2 tbody td{padding:3px 5px}
    .qdoc.fees-doc.d2 tfoot td{padding:5px 5px}
    .qdoc.fees-doc.d2 .fees-sum{margin-top:9px}
    .qdoc.fees-doc.d2 .fees-sum thead th{padding:4px 5px}
    .qdoc.fees-doc.d2 .fees-sum tbody td{padding:3px 5px}
    .qdoc.fees-doc.d2 .fees-sum-foot{padding:5px 12px}
    .qdoc.fees-doc.d2 .total-bar{margin:8px 0 10px}
    .qdoc.fees-doc.d2 .fees-trow2{margin-top:2px}
    .qdoc.fees-doc.d2 .fees-sum .box-head{padding:4px 12px}
    .qdoc.fees-doc.d2 .notes{display:flex;gap:10px;align-items:baseline;margin-top:8px}
    .qdoc.fees-doc.d2 .notes .h{margin:0;white-space:nowrap}
    .qdoc.fees-doc.d2 .notes ol{flex:1}
    .qdoc.fees-doc.d2 .sign br{display:none}
    .qdoc.fees-doc.d2 .sign .name{margin-left:10px}
    .qdoc.fees-doc.d2 h2{margin-bottom:6px}`;

  /* ---------- 폼 읽기·채우기 ---------- */
  function readForm(){
    return { title: $('#feTitle').value.trim(), payDate: $('#fePayDate').value, belong: $('#feBelong').value.trim(),
      note: $('#feNote').value, rows: S.rows.map(r=>({ name:r.name, role:r.role, kind:r.kind, gross:r.gross, note:r.note })) };
  }
  function loadData(d){
    $('#feTitle').value = d.title || '';
    $('#fePayDate').value = d.payDate || today();
    const payMonth = ($('#fePayDate').value||'').slice(0,7);
    $('#feBelong').value = normMonth(d.belong) || payMonth;
    S.belongTouched = !!normMonth(d.belong) && normMonth(d.belong) !== payMonth;
    $('#feNote').value = d.note || '';
    const rows = (d.rows||[]).map(r=>({ name: r.name||'', role: r.role||'', kind: KIND_NAME[r.kind] ? r.kind : 'biz',
      gross: r.gross == null || r.gross === '' ? null : Number(r.gross), note: r.note||'' }));
    S.rows = rows.length ? rows : [blankRow()];
    $('#fePasteNote').textContent = '';
    renderRows(); renderSavedBar(); renderSheet_();
  }
  function sampleData(){  // 미리보기 확인용 가상 인물·금액 (실제 사람·사업 아님)
    const pay = today();
    return { title:'예시 · 가을 인문학 워크숍 1~4회차', payDate: pay, belong: pay.slice(0,7),
      note:'예시 자료입니다. 실제 지급 내역이 아닙니다.',
      rows:[
        { name:'김하늘', role:'주강사', kind:'biz', gross:600000, note:'150,000원×4회' },
        { name:'박바다', role:'보조강사', kind:'biz', gross:250000, note:'' },
        { name:'최들판', role:'자문', kind:'etc', gross:300000, note:'자문회의 2회' },
        { name:'정숲길', role:'특강 게스트', kind:'etc', gross:100000, note:'' },
        { name:'한구름', role:'기획 보조', kind:'none', gross:200000, note:'' },
      ] };
  }
  function manyData(){  // A4 한 장 확인용 15명 (가상)
    const names = ['김하늘','박바다','최들판','정숲길','한구름','윤새벽','오솔길','서강물','임노을','강바람','조별빛','문이슬','배달래','신나무','류시내'];
    const roles = ['주강사','보조강사','자문','특강 게스트','기획 보조'];
    const kinds = ['biz','biz','etc','etc','none'];
    const d = sampleData();
    d.title = '예시 · 15명 지급 한 장 확인용 긴 사업명 가을 인문학 워크숍 전 회차';
    d.note = '예시 자료입니다. 실제 지급 내역이 아닙니다.\n회차별 출강 확인서는 따로 보관합니다.';
    d.rows = names.map((name, i)=>({ name, role: roles[i%5], kind: kinds[i%5], gross: [600000,250000,300000,100000,200000][i%5] + i*10000,
      note: i%3===0 ? '150,000원×4회 · 회의 1회 포함' : '' }));
    return d;
  }

  /* ---------- 받는 사람 칸 ---------- */
  function renderRows(){
    const host = $('#feRows'); host.innerHTML = '';
    S.rows.forEach((r, i)=>{
      const box = document.createElement('div'); box.className = 'item';
      box.innerHTML = `
        <div class="item-top fees-top"><span class="fees-no">${i+1}</span>
          <input class="in r-name" placeholder="성명" value="${esc(r.name)}">
          <input class="in r-role" placeholder="역할 (주강사·보조강사·자문)" value="${esc(r.role)}">
          <button class="x" title="이 사람 빼기">×</button></div>
        <div class="fees-grid">
          <div><label class="f">소득 구분</label><select class="in r-kind">${kindOptions(r.kind)}</select></div>
          <div><label class="f">세전 지급액</label><input class="in r-gross" inputmode="numeric" placeholder="300,000" value="${r.gross!=null&&!Number.isNaN(r.gross)?won(r.gross):''}"></div>
        </div>
        <input class="in r-note fees-mt" placeholder="비고 (예: 150,000원×4회)" value="${esc(r.note)}">
        <div class="it-note"></div>`;
      const q = sel => box.querySelector(sel);
      const changed = () => { S.dirty = true; renderSheet_(); };
      q('.x').onclick = () => { S.rows.splice(i, 1); if(!S.rows.length) S.rows.push(blankRow()); renderRows(); changed(); };
      q('.r-name').addEventListener('input', e=>{ r.name = e.target.value; changed(); });
      q('.r-role').addEventListener('input', e=>{ r.role = e.target.value; changed(); });
      q('.r-note').addEventListener('input', e=>{ r.note = e.target.value; changed(); });
      q('.r-kind').addEventListener('change', e=>{ r.kind = e.target.value; changed(); });
      q('.r-gross').addEventListener('input', e=>{ r.gross = parseWon(e.target.value); changed(); });
      q('.r-gross').addEventListener('blur', e=>{ if(hasAmount(r)) e.target.value = won(r.gross); });
      host.appendChild(box);
    });
  }
  function updateRowNotes(){
    document.querySelectorAll('#feRows .item').forEach((box, i)=>{
      const r = S.rows[i], note = box.querySelector('.it-note');
      if(!r || !note) return;
      const parts = [];
      if(looksSensitive(r.name) || looksSensitive(r.role) || looksSensitive(r.note)) parts.push('<span class="fees-warn">주민등록번호·계좌번호처럼 보이는 숫자가 있어요. 지워 주세요</span>');
      if(r.gross != null && Number.isNaN(r.gross)) parts.push('<span class="fees-warn">금액을 숫자로 적어 주세요 (예: 300000, 30만)</span>');
      else if(hasAmount(r)){
        const c = calcRow(r);
        parts.push(c.kind==='none' ? `원천징수 없음 · 실지급 <b>${won(c.net)}원</b>`
          : c.underMin ? `기타소득금액 5만 원 이하라 원천세 0원 · 실지급 <b>${won(c.net)}원</b>`
          : `소득세 ${won(c.tax)} · 지방소득세 ${won(c.local)} · 실지급 <b>${won(c.net)}원</b>`);
        if(!(r.name||'').trim()) parts.push('<span class="fees-warn">성명을 적어 주세요</span>');
      }
      note.innerHTML = parts.join(' · ');
    });
  }

  /* ---------- 계산 ---------- */
  function buildFees(){
    const d = readForm();
    const ls = S.rows.filter(validRow).map(calcRow);
    const sum = (arr, k) => arr.reduce((a, l)=>a + l[k], 0);
    const groups = KIND_ORDER.map(kind => {
      const g = ls.filter(l=>l.kind===kind);
      return g.length ? { kind, count:g.length, gross:sum(g,'gross'), tax:sum(g,'tax'), local:sum(g,'local'), zero:g.filter(l=>l.underMin).length } : null;
    }).filter(Boolean);
    const wh = groups.filter(g=>g.kind!=='none');
    return { ...d, belongOk: !d.belong || !!normMonth(d.belong), belong: normMonth(d.belong) || (d.payDate||'').slice(0,7),
      lines: ls, groups, gross: sum(ls,'gross'), tax: sum(ls,'tax'), local: sum(ls,'local'), net: sum(ls,'net'),
      whCount: sum(wh,'count'), whGross: sum(wh,'gross'), notes: lines(d.note),
      partial: S.rows.filter(partialRow).length, badAmount: S.rows.some(r=>r.gross!=null && Number.isNaN(r.gross)),
      sensitive: [d.title, d.note, ...S.rows.flatMap(r=>[r.name, r.role, r.note])].some(looksSensitive) };
  }

  function feesHtml(s, dense){
    const n = s.lines.length;
    const kindCell = l => `${KIND_CELL[l.kind]}${l.underMin?'<div class="sub">과세최저한</div>':''}`;
    const rows = n ? s.lines.map((l, i)=>`<tr>
        <td class="item-c">${i+1}</td>
        <td class="fees-wrap"><span class="name">${esc(l.name)}</span></td>
        <td class="fees-wrap">${esc(l.role)}${l.note?`<span class="fees-note${l.role?'':' only'}">${esc(l.note)}</span>`:''}</td>
        <td class="num">${kindCell(l)}</td>
        <td class="fees-r">${won(l.gross)}</td>
        <td class="fees-r">${won(l.tax)}</td>
        <td class="fees-r">${won(l.local)}</td>
        <td class="fees-r">${won(l.net)}</td></tr>`).join('')
      : `<tr><td colspan="8" style="text-align:center;color:#b3a99f;padding:18px">받는 사람의 성명과 세전 지급액을 넣으면 여기에 표시됩니다</td></tr>`;

    const sumRows = s.groups.length ? s.groups.map(g=>`<tr>
        <td class="item-c"><b>${KIND_NAME[g.kind]}</b></td>
        <td class="num">${HOMETAX_CELL[g.kind]}</td>
        <td class="num">${g.count}명</td>
        <td class="fees-r">${won(g.gross)}</td>
        <td class="fees-r">${won(g.tax)}</td>
        <td class="fees-r">${won(g.local)}</td></tr>`).join('')
      : `<tr><td colspan="6" style="text-align:center;color:#b3a99f;padding:10px">지급 내역이 없습니다</td></tr>`;

    const has = k => s.groups.some(g=>g.kind===k);
    const zero = s.groups.filter(g=>g.zero).reduce((a, g)=>a + g.zero, 0);
    const rules = [];
    if(has('biz')) rules.push('<b>사업소득</b> 세전×3% 소득세 + 소득세×10% 지방소득세');
    if(has('etc')) rules.push('<b>기타소득</b> 세전에서 필요경비 60%를 뺀 금액×20% 소득세 + 소득세×10% 지방소득세 (그 금액이 5만 원 이하면 0원)');
    if(has('none')) rules.push('<b>원천징수 없음</b> 세전 그대로 지급');
    const notes = s.notes.map(esc);

    return `<div class="qdoc fees-doc${dense>=1?' d1':''}${dense>=2?' d2':''}"><div class="wrap">
      <div class="head">
        <div><h1>사례비 지급 명세서</h1><div class="subtitle">${s.title ? esc(s.title) : '<span class="ph">사업명</span>'}</div></div>
        <div class="head-meta">지급일 <b>${dotDate(s.payDate)}</b><br>귀속월 <b>${esc(monthLabel(s.belong))}</b><br>지급 인원 <b>${n}명</b></div>
      </div>
      <hr class="rule">
      <div class="total-bar">
        <div class="trow"><span>세전 지급 총액 (${n}명)</span><span class="amt">${won(s.gross)}원</span></div>
        <div class="trow fees-trow2"><span>원천징수 ${won(s.tax + s.local)}원 차감 (소득세 ${won(s.tax)} · 지방소득세 ${won(s.local)})</span><span>실지급 합계 <b>${won(s.net)}원</b></span></div>
      </div>
      <h2>지급 내역<span class="fees-unit">(단위: 원)</span></h2>
      <table>
        <colgroup><col style="width:6%"><col style="width:11%"><col style="width:22%"><col style="width:11%"><col style="width:13%"><col style="width:11%"><col style="width:12%"><col style="width:14%"></colgroup>
        <thead><tr><th>번호</th><th>성명</th><th>역할</th><th>소득 구분</th><th>세전</th><th>소득세</th><th>지방소득세</th><th>실지급</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">합계 (${n}명)</td><td class="fees-r">${won(s.gross)}</td><td class="fees-r">${won(s.tax)}</td><td class="fees-r">${won(s.local)}</td><td class="fees-r">${won(s.net)}</td></tr></tfoot>
      </table>
      <div class="box fees-sum">
        <div class="box-head">원천세 신고용 요약 <span>소득세 홈택스 · 지방소득세 위택스</span></div>
        <table>
          <colgroup><col style="width:19%"><col style="width:20%"><col style="width:15%"><col style="width:17%"><col style="width:14%"><col style="width:15%"></colgroup>
          <thead><tr><th>소득 구분</th><th>홈택스 입력 칸</th><th>인원</th><th>총지급액</th><th>소득세</th><th>지방소득세</th></tr></thead>
          <tbody>${sumRows}</tbody>
          <tfoot><tr><td>원천징수 합계</td><td></td><td>${s.whCount}명</td><td class="fees-r">${won(s.whGross)}</td><td class="fees-r">${won(s.tax)}</td><td class="fees-r">${won(s.local)}</td></tr></tfoot>
        </table>
        <div class="fees-sum-foot">귀속연월 <b>${esc(s.belong)}</b> · 지급연월 <b>${esc((s.payDate||'').slice(0,7))}</b> · 신고·납부 기한 <b>${dotDate(dueDate(s.payDate))}</b>(다음 달 10일) · 납부할 원천세 <b>${won(s.tax + s.local)}원</b>${zero ? ` · 세액 0원(과세최저한) ${zero}명 포함` : ''}
          ${rules.length ? `<div class="fees-rules">계산 기준 · ${rules.join(' · ')} · 10원 미만 버림</div>` : ''}</div>
      </div>
      ${notes.length ? `<div class="notes"><div class="h">· 비고</div><ol>${notes.map(x=>`<li>${x}</li>`).join('')}</ol></div>` : ''}
      <div class="sign">위와 같이 사례비를 지급합니다. ${dotDate(s.payDate)}<br><span class="name">${esc(SUPPLIER.상호)} 대표 ${esc(SUPPLIER.대표자)} ${sealMark()}</span></div>
      <div class="foot">${esc(FOOTER())}</div>
    </div></div>`;
  }

  // docs.html 의 renderSheet 를 쓴다 (이름이 겹치지 않게 뒤에 _)
  function renderSheet_(){
    const s = buildFees();
    const r = renderSheet($('#feSheet'), $('#feBox'), dense => feesHtml(s, dense), s.lines.length > 8 ? 1 : 0);
    setFit($('#feFit'), r);
    updateRowNotes();
    if(MODE==='db' && !S.current && S.ready) store(DRAFT_KEY, readForm());
    s.html = r.html;
    return s;
  }

  function renderSavedBar(){
    const bar = $('#feSavedBar');
    if(S.current){
      bar.innerHTML = `<b>${esc(S.current.title||'(사업명 없음)')}</b><span class="grow" style="color:var(--muted)">저장된 명세서를 고치는 중 · 지급일 ${dotDate(S.current.pay_date)}</span>`;
    } else {
      bar.innerHTML = `<b>새 명세서</b><span class="grow" style="color:var(--muted)">${MODE==='db'?'아직 저장 안 됨':'미리보기 모드 · 저장은 로그인 후'}</span>`;
    }
  }
  function refreshButtons(){
    $('#feSaveBtn').classList.toggle('hidden', MODE!=='db');
    $('#fePrintBtn').textContent = MODE==='db' ? '저장하고 PDF' : 'PDF 저장';
    $('#feTip').textContent = MODE==='db'
      ? '「저장하고 PDF」를 누르면 왼쪽 목록에 저장되고 인쇄 창이 떠요. 대상을 「PDF로 저장」으로 고르세요. 원천세 신고·납부 뒤에는 원천징수이행상황신고서와 납부확인서를 챙겨 두세요.'
      : '미리보기 모드라 저장은 안 되고 PDF만 뽑혀요. 인쇄 창에서 「PDF로 저장」을 고르세요. 원천세 신고·납부 뒤에는 원천징수이행상황신고서와 납부확인서를 챙겨 두세요.';
  }

  /* ---------- 저장·목록 (db 모드만) ---------- */
  function checkReady(s){
    if(s.sensitive){ toast('주민등록번호·계좌번호처럼 보이는 숫자가 있어요. 지우고 다시 해 주세요'); return false; }
    if(s.badAmount){ toast('금액을 숫자로 적어 주세요 (예: 300000, 30만)'); return false; }
    if(s.partial){ toast(`성명이나 금액이 빠진 줄이 ${s.partial}개 있어요. 채우거나 빼 주세요`); return false; }
    if(!s.lines.length){ toast('받는 사람의 성명과 세전 지급액을 넣어 주세요'); return false; }
    if(!s.title){ toast('사업명을 적어 주세요'); $('#feTitle').focus(); return false; }
    if(!s.payDate){ toast('지급일을 넣어 주세요'); return false; }
    if(!s.belongOk){ toast('귀속월을 2026-09 처럼 적어 주세요'); $('#feBelong').focus(); return false; }
    return true;
  }
  async function saveSheet(){
    if(MODE!=='db'){ toast('저장은 관리실에 로그인해야 할 수 있어요'); return null; }
    const s = renderSheet_();
    if(!checkReady(s)) return null;
    const btns = [$('#feSaveBtn'), $('#fePrintBtn')];
    btns.forEach(b=>b.disabled = true);
    try{
      const { data:{ session } } = await sb.auth.getSession();
      const row = { title: s.title, pay_date: s.payDate, belong_month: s.belong,
        rows: s.lines.map(l=>({ name:l.name, role:l.role, kind:l.kind, gross:l.gross, tax:l.tax, local:l.local, net:l.net, note:l.note })),
        total_gross: s.gross, note: $('#feNote').value.trim(),
        updated_at: new Date().toISOString(), updated_by: (session && session.user && session.user.email) || null };
      const res = S.current
        ? await sb.from('fee_sheets').update(row).eq('id', S.current.id).select().single()
        : await sb.from('fee_sheets').insert(row).select().single();
      if(res.error){ toast('저장하지 못했어요: ' + res.error.message); return null; }
      const isNew = !S.current;
      S.current = res.data; S.dirty = false;
      S.list = [res.data, ...S.list.filter(x=>x.id!==res.data.id)];
      if(isNew) store(DRAFT_KEY, null);
      renderSavedBar(); renderList();
      toast(`「${res.data.title}」 ${isNew?'저장했어요':'고쳤어요'}`);
      return res.data;
    }catch(e){
      toast('저장하지 못했어요: ' + (e && e.message || e));
      return null;
    }finally{
      btns.forEach(b=>b.disabled = false);
    }
  }
  async function loadList(){
    if(MODE!=='db' || S.loading) return;
    S.loading = true; S.loadError = ''; renderList();
    try{
      const { data, error } = await sb.from('fee_sheets').select('*').order('pay_date', { ascending:false }).order('updated_at', { ascending:false }).limit(300);
      if(error){ S.loadError = error.message; toast('저장된 명세서를 읽지 못했어요: ' + error.message); }
      else { S.list = data || []; S.loaded = true; }
    }catch(e){
      S.loadError = String(e && e.message || e); toast('저장된 명세서를 읽지 못했어요');
    }finally{
      S.loading = false; renderList();
    }
  }
  function renderList(){
    const host = $('#feList');
    if(MODE!=='db'){ host.innerHTML = '<p class="hint">관리실에 로그인하면 저장한 명세서가 여기에 쌓여요.</p>'; return; }
    if(S.loading){ host.innerHTML = '<p class="hint">불러오는 중이에요…</p>'; return; }
    if(S.loadError){
      host.innerHTML = `<div class="parse-note warn" style="margin-top:0">목록을 읽지 못했어요 (${esc(S.loadError)})</div><div class="btns"><button class="btn-sm" id="feReload">다시 불러오기</button></div>`;
      $('#feReload').onclick = loadList; return;
    }
    if(!S.list.length){ host.innerHTML = '<p class="hint">아직 저장한 명세서가 없어요.</p>'; return; }
    host.innerHTML = '<div class="recs fees-list"></div>';
    const wrap = host.firstChild;
    S.list.forEach(row=>{
      const el = document.createElement('div'); el.className = 'rec';
      const people = Array.isArray(row.rows) ? row.rows.length : 0;
      el.innerHTML = `<div class="rec-main">
          <div class="rec-name" style="margin-top:0">${esc(row.title||'(사업명 없음)')}${S.current && S.current.id===row.id ? ' <span class="chip kind">여는 중</span>' : ''}</div>
          <div class="rec-sub">지급일 ${dotDate(row.pay_date)} · 합계 ${won(Number(row.total_gross)||0)}원 · ${people}명 · ${esc((row.updated_by||'').split('@')[0])}</div>
        </div>
        <div class="rec-actions"><button class="btn-sm f-open">열기</button><button class="btn-sm danger f-del">삭제</button></div>`;
      el.querySelector('.f-open').onclick = () => openSheet(row);
      el.querySelector('.f-del').onclick = () => removeSheet(row);
      wrap.appendChild(el);
    });
  }
  function openSheet(row){
    if(S.dirty && !confirm('지금 쓰던 내용은 저장하지 않으면 사라져요. 이 명세서를 열까요?')) return;
    S.current = row;
    loadData({ title:row.title, payDate:row.pay_date, belong:row.belong_month, note:row.note, rows:row.rows });
    S.dirty = false;
    renderList();
    window.scrollTo(0, 0);
    toast(`「${row.title||'명세서'}」를 열었어요`);
  }
  async function removeSheet(row){
    if(!confirm(`「${row.title||'(사업명 없음)'}」 명세서를 지울까요? 되돌릴 수 없어요.`)) return;
    try{
      const { data, error } = await sb.from('fee_sheets').delete().eq('id', row.id).select();
      if(error){ toast('지우지 못했어요: ' + error.message); return; }
      if(!data || !data.length){ toast('지우지 못했어요 (권한을 확인해 주세요)'); return; }
    }catch(e){ toast('지우지 못했어요: ' + (e && e.message || e)); return; }
    S.list = S.list.filter(x=>x.id!==row.id);
    if(S.current && S.current.id===row.id){ S.current = null; S.dirty = true; renderSavedBar(); }
    renderList();
    toast('명세서를 지웠어요');
  }

  /* ---------- 붙여넣기·새로 쓰기·PDF ---------- */
  function applyPaste(){
    const note = $('#fePasteNote');
    const res = parsePaste($('#fePaste').value, $('#fePasteKind').value);
    const warn = res.dropped ? ` 주민등록번호·계좌번호처럼 보이는 칸 ${res.dropped}개는 버렸어요.` : '';
    if(!res.rows.length){
      note.className = 'parse-note warn';
      note.textContent = `이름과 금액이 있는 줄을 찾지 못했어요. 「이름, 역할, 금액」처럼 한 줄에 한 사람씩 적어 주세요.${warn}`;
      return;
    }
    if(S.rows.every(blankish)) S.rows = res.rows; else S.rows.push(...res.rows);
    S.dirty = true;
    note.className = 'parse-note' + (res.dropped ? ' warn' : '');
    note.textContent = `${res.rows.length}명을 채웠어요.${res.skipped ? ` 읽지 못한 줄 ${res.skipped}개(제목줄 등)는 건너뛰었어요.` : ''}${warn} 소득 구분을 한 번씩 확인해 주세요.`;
    $('#fePaste').value = '';
    renderRows(); renderSheet_();
  }
  function resetSheet(){
    if(S.dirty && !confirm('새로 쓸까요? 저장하지 않은 내용은 지워져요.')) return;
    S.current = null;
    store(DRAFT_KEY, null);
    loadData({ payDate: today() });
    S.dirty = false;
    renderList();
  }
  async function printSheet(){
    let s = renderSheet_();
    if(!checkReady(s)) return;
    if(MODE==='db'){
      if(!await saveSheet()) return;
      s = renderSheet_();
    }
    printHtml(s.html, ['사례비지급명세서', s.title, s.payDate].filter(Boolean).join('_'));
  }

  /* ---------- 탭 등록 ---------- */
  registerDocView('fees', {
    label: '사례비 지급 명세',
    html: HTML,
    init(){
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      const changed = () => { S.dirty = true; renderSheet_(); };
      $('#feTitle').addEventListener('input', changed);
      $('#feNote').addEventListener('input', changed);
      $('#fePayDate').addEventListener('change', () => {
        if(!S.belongTouched && $('#fePayDate').value) $('#feBelong').value = $('#fePayDate').value.slice(0,7);
        changed();
      });
      $('#feBelong').addEventListener('input', () => { S.belongTouched = true; changed(); });
      $('#feBelong').addEventListener('blur', e => {
        const v = normMonth(e.target.value);
        if(v) e.target.value = v;
        else if(!e.target.value.trim()){ S.belongTouched = false; e.target.value = ($('#fePayDate').value||'').slice(0,7); renderSheet_(); }
      });
      $('#fePasteBtn').onclick = applyPaste;
      $('#feAddRow').onclick = () => {
        S.rows.push(blankRow()); renderRows(); renderSheet_();
        const names = document.querySelectorAll('#feRows .r-name'); names[names.length-1].focus();
      };
      $('#feResetBtn').onclick = resetSheet;
      $('#feSaveBtn').onclick = () => saveSheet();
      $('#fePrintBtn').onclick = printSheet;
    },
    show(){
      refreshButtons();
      if(!S.ready){
        let data = { payDate: today() };
        if(MODE==='preview') data = sampleData();
        else if(MODE==='db'){
          const draft = store(DRAFT_KEY);
          if(draft && Array.isArray(draft.rows) && draft.rows.some(r=>r && (r.name||'').trim())){ data = draft; S.dirty = true; }
        }
        loadData(data);
        S.ready = true;
      } else {
        renderSavedBar(); renderSheet_();
      }
      renderList();
      if(MODE==='db' && !S.loaded && !S.loading) loadList();
    },
    render(){ if(S.ready) renderSheet_(); },
    printTest(sub){
      if(sub==='many') loadData(manyData());
      else loadData(sampleData());
      S.ready = true; S.dirty = false;
      return renderSheet_().html;
    },
  });

  window.__docsFees = { parsePaste, calcRow, normMonth, looksSensitive, buildFees };
})();
