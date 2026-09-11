/* ============ 서류실 · 기관 제출 서류 (강의계획서 · 강사 프로필 · 출강확인서 · 제출 체크리스트) ============
   docs.html 의 registerDocView 로 탭 하나를 붙인다. 전역에는 아무것도 남기지 않는다.
   저장: lecture_plans · instructor_profiles (관리자 로그인 때만). 출강확인서·체크리스트는 서버에 저장하지 않는다. */
(function(){
'use strict';
if(typeof registerDocView !== 'function') return;

/* ---------- 스타일 (kit- 로 시작) ---------- */
const CSS = `
.kit-seg{display:inline-flex;gap:3px;flex-wrap:wrap;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px;margin-bottom:12px}
.kit-seg button{background:none;border:none;padding:8px 14px;border-radius:9px;font-size:13.5px;font-weight:700;color:var(--muted)}
.kit-seg button.on{background:var(--orange);color:#fff}
.kit-off{display:none!important}
.kit-saved{display:flex;flex-direction:column;gap:6px;max-height:230px;overflow:auto}
.kit-sv{display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:7px 10px;background:#fffdfb}
.kit-sv.cur{border-color:var(--orange);background:#fff6f1}
.kit-sv-m{flex:1;min-width:0}
.kit-sv-t{font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kit-sv-s{font-size:11.5px;color:var(--muted)}
.kit-sv button{padding:5px 9px;font-size:12px}
.kit-cur{font-size:12.5px;color:var(--muted);margin-top:8px}
.kit-sess .item-top .s-no{width:92px;flex:none}
.kit-sess textarea{margin-bottom:6px}
.kit-ck-head{display:flex;align-items:baseline;gap:10px;margin:2px 2px 10px;font-size:14px}
.kit-ck-head span{font-size:13px;color:var(--muted)}
.kit-ck{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:11px 14px;margin-bottom:8px;display:flex;gap:11px;align-items:flex-start}
.kit-ck.done{background:#f4faf6;border-color:#cfe8da}
.kit-ck input[type=checkbox]{width:18px;height:18px;margin-top:2px;accent-color:var(--orange);flex:none;cursor:pointer}
.kit-ck-main{flex:1;min-width:0}
.kit-ck-t{font-weight:700;font-size:14.5px;cursor:pointer}
.kit-ck.done .kit-ck-t{color:var(--ok)}
.kit-ck-h{font-size:12.5px;color:var(--muted);margin-top:2px}
.kit-ck-links{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px;align-items:center}
.kit-ck-links a.kit-a{font-size:12.5px;font-weight:600;color:var(--blue);text-decoration:none;background:#eef4ff;border-radius:8px;padding:5px 9px}
.kit-ck-links a.kit-a:hover{text-decoration:underline}
.kit-ck-links .btn-sm{padding:5px 10px;font-size:12.5px;text-decoration:none}
.kit-ck-miss{font-size:12.5px;color:var(--orange-d)}
/* 문서 */
.qdoc table.kit-kv{border:1px solid var(--line);border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;margin:0 0 4px}
.qdoc table.kit-kv th{background:var(--wash);color:var(--accent-deep);font-weight:800;font-size:12px;text-align:left;padding:7px 12px;border-bottom:1px solid var(--line);vertical-align:middle;word-break:keep-all}
.qdoc table.kit-kv td{padding:7px 12px;border-bottom:1px solid var(--line);font-size:13px;font-weight:600;vertical-align:middle;color:var(--ink)}
.qdoc table.kit-kv tbody td:last-child{font-weight:600;color:var(--ink);font-size:13px}
.qdoc table.kit-kv tr:last-child th,.qdoc table.kit-kv tr:last-child td{border-bottom:none}
.qdoc table.kit-kv td.kit-lt{border-left:1px solid var(--line)}
.qdoc table.kit-kv th.kit-lt{border-left:1px solid var(--line)}
.qdoc .kit-sec{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:8px;padding:8px 14px;margin-top:10px}
.qdoc .kit-sec-h{font-weight:800;font-size:12.5px;margin-bottom:3px}
.qdoc .kit-sec-b{font-size:12.5px;line-height:1.6}
.qdoc h2.kit-h2{margin:14px 0 8px}
.qdoc table.kit-t thead th:first-child{text-align:center;padding-left:8px}
.qdoc table.kit-t tbody td{vertical-align:top;font-size:12px;padding:8px;line-height:1.5}
.qdoc table.kit-t tbody td:last-child{font-weight:400;color:var(--ink);font-size:12px}
.qdoc table.kit-t td.kit-no{text-align:center;font-weight:800;white-space:nowrap}
.qdoc table.kit-t td.kit-topic{font-weight:800}
.qdoc table.kit-t td.kit-empty{text-align:center;color:#b3a99f;padding:18px}
.qdoc .kit-ul{margin:0 0 4px;padding-left:18px;font-size:12px;line-height:1.55}
.qdoc .kit-hero{background:#f7f3ee;border-radius:10px;padding:14px 18px}
.qdoc .kit-hero-name{font-size:25px;font-weight:900;letter-spacing:.04em}
.qdoc .kit-hero-line{font-size:13.5px;font-weight:800;color:var(--accent-deep);margin-top:1px}
.qdoc .kit-hero-intro{font-size:12.5px;line-height:1.65;margin-top:8px}
.qdoc .kit-lh{font-size:14px;font-weight:800;margin:14px 0 4px;padding-left:9px;border-left:4px solid var(--accent);line-height:1.25}
.qdoc .kit-r{display:flex;gap:12px;padding:5px 2px;border-bottom:1px dashed var(--line);font-size:12.5px}
.qdoc .kit-rd{width:134px;flex:none;color:var(--muted);font-weight:700}
.qdoc .kit-rt{flex:1;min-width:0}
.qdoc .kit-fill{padding:4px 16px 10px}
.qdoc .kit-fl{display:flex;align-items:flex-end;gap:10px;padding:9px 0 0;font-size:13px}
.qdoc .kit-fl .k{color:var(--muted);white-space:nowrap;width:46px;flex:none}
.qdoc .kit-line{flex:1;border-bottom:1px solid var(--ink);min-height:24px;padding:0 2px 2px;font-weight:700}
.qdoc .kit-line.r{text-align:right;color:var(--muted);font-weight:600}
.qdoc .kit-intro{font-size:13.5px}
.qdoc.d1 .kit-sec{padding:6px 12px;margin-top:8px}
.qdoc.d1 table.kit-t tbody td{padding:5px 8px}
.qdoc.d1 .kit-r{padding:3px 2px}
.qdoc.d1 .kit-lh{margin:11px 0 3px}
.qdoc.d2 table.kit-kv th,.qdoc.d2 table.kit-kv td{padding:4px 10px}
.qdoc.d2 .kit-sec{padding:5px 12px;margin-top:6px}
.qdoc.d2 .kit-sec-b{font-size:11.5px;line-height:1.45}
.qdoc.d2 h2.kit-h2{margin:10px 0 6px}
.qdoc.d2 table.kit-t tbody td{padding:3px 6px;font-size:11.5px;line-height:1.4}
.qdoc.d2 table.kit-t tbody td:last-child{font-size:11.5px}
.qdoc.d2 .kit-hero{padding:9px 14px}
.qdoc.d2 .kit-hero-intro{font-size:11.5px;line-height:1.5;margin-top:5px}
.qdoc.d2 .kit-lh{margin:8px 0 2px;font-size:13px}
.qdoc.d2 .kit-r{padding:2px;font-size:11.5px}
.qdoc.d2 .kit-fl{padding-top:6px}
`;

/* ---------- 탭 화면 ---------- */
const HTML = `
<div class="kit-seg" id="kitSeg">
  <button data-sub="plan">강의계획서</button><button data-sub="profile">강사 프로필</button><button data-sub="confirm">출강확인서</button><button data-sub="checklist">제출 체크리스트</button>
</div>

<div class="layout" id="kitDocs">
  <div class="form-col">
    <!-- 강의계획서 -->
    <div data-form="plan">
      <div class="card"><h3>저장된 강의계획서</h3><div id="kitPlanSaved"></div></div>
      <div class="card"><h3>① 이번 제출처 <span class="hint">(기관마다 달라서 저장하지 않아요)</span></h3>
        <label class="f">제출처 (기관명)</label><input class="in" data-f="plan.org" placeholder="예: ○○도서관">
        <label class="f">기간·일시 <span class="hint">(여러 줄 가능)</span></label>
        <textarea class="in" rows="2" data-f="plan.period" placeholder="예: 2026. 10. 7.(수) ~ 10. 21.(수) 매주 수 16:00~17:30"></textarea>
        <div class="row2">
          <div><label class="f">장소</label><input class="in" data-f="plan.place" placeholder="예: 2층 강의실"></div>
          <div><label class="f">작성일</label><input class="in" type="date" data-f="plan.date"></div>
        </div>
      </div>
      <div class="card"><h3>② 강좌 정보</h3>
        <label class="f">강좌명</label><input class="in" data-f="plan.title" placeholder="예: 마음 날씨 기록 워크숍">
        <div class="row2">
          <div><label class="f">대상</label><input class="in" data-f="plan.target" placeholder="예: 초등 3~4학년"></div>
          <div><label class="f">인원</label><input class="in" data-f="plan.headcount" placeholder="예: 15명"></div>
        </div>
        <div class="row2">
          <div><label class="f">회당 시간</label><input class="in" data-f="plan.duration" placeholder="예: 90분"></div>
          <div><label class="f">강사</label><input class="in" data-f="plan.instructor" placeholder="예: 홍길동 작가"></div>
        </div>
      </div>
      <div class="card"><h3>③ 강의 개요·목표</h3>
        <label class="f">강의 개요</label>
        <textarea class="in" rows="4" data-f="plan.overview" placeholder="어떤 수업인지 서너 문장으로 적어 주세요."></textarea>
        <label class="f">강의 목표 <span class="hint">(한 줄에 하나 · 맨 앞 [제목]은 굵게 나와요)</span></label>
        <textarea class="in" rows="3" data-f="plan.goal" placeholder="예: [감정 알아차리기] 오늘 내 마음에 이름을 붙여 본다."></textarea>
      </div>
      <div class="card"><h3>④ 회차별 계획</h3>
        <div id="kitSess"></div>
        <button class="btn-sm wide" id="kitSessAdd">+ 회차 추가</button>
      </div>
      <div class="card"><h3>⑤ 준비물·기타 안내 <span class="hint">(한 줄에 하나)</span></h3>
        <label class="f">준비물</label><textarea class="in" rows="2" data-f="plan.materials" placeholder="예: 필기구 (활동지는 강사가 준비해요)"></textarea>
        <label class="f">기타 안내</label><textarea class="in" rows="2" data-f="plan.note" placeholder="예: 회차별 내용은 참여자에 맞춰 조정할 수 있어요."></textarea>
      </div>
    </div>

    <!-- 강사 프로필 -->
    <div data-form="profile" class="hidden">
      <div class="card"><h3>저장된 강사 프로필</h3><div id="kitProfileSaved"></div></div>
      <div class="card"><h3>① 기본 정보</h3>
        <div class="row2">
          <div><label class="f">이름</label><input class="in" data-f="profile.name" placeholder="예: 홍길동"></div>
          <div><label class="f">작성일</label><input class="in" type="date" data-f="profile.date"></div>
        </div>
        <label class="f">한 줄 소개</label><input class="in" data-f="profile.headline" placeholder="예: 감정 기록 글쓰기 강사">
        <label class="f">소개글</label>
        <textarea class="in" rows="4" data-f="profile.intro" placeholder="어떤 수업을 하는 사람인지 서너 문장으로 적어 주세요."></textarea>
      </div>
      <div class="card"><h3>② 이력 <span class="hint">(한 줄에 하나 · 앞에 「2025.06」처럼 날짜를 쓰면 왼쪽 칸에 따로 나와요)</span></h3>
        <label class="f">경력</label><textarea class="in" rows="4" data-f="profile.careers" placeholder="예: 2024.03 ~ 현재  개띠랑 감정 기록 강사"></textarea>
        <label class="f">저서·작품</label><textarea class="in" rows="3" data-f="profile.works" placeholder="예: 2025.06  《책 제목》 (에세이)"></textarea>
        <label class="f">주요 출강 이력</label><textarea class="in" rows="5" data-f="profile.lectures" placeholder="예: 2026.05  ○○도서관 · 감정 기록 워크숍 (3회)"></textarea>
      </div>
      <p class="hint" style="margin:0 4px 12px">사진은 넣지 않아요. 생년월일·개인 연락처처럼 꼭 필요하지 않은 정보는 적지 않는 게 좋아요.</p>
    </div>

    <!-- 출강확인서 -->
    <div data-form="confirm" class="hidden">
      <div class="card"><h3>① 강의계획서에서 가져오기 <span class="hint">(선택)</span></h3>
        <select class="in" id="kitCfSrc"></select>
        <div class="btns"><button class="btn-sm" id="kitCfImport">가져오기</button></div>
        <div class="parse-note" id="kitCfNote"></div>
      </div>
      <div class="card"><h3>② 출강 내용</h3>
        <div class="row2">
          <div><label class="f">강사명</label><input class="in" data-f="confirm.instructor" placeholder="예: 홍길동"></div>
          <div><label class="f">기관명</label><input class="in" data-f="confirm.org" placeholder="예: ○○도서관"></div>
        </div>
        <label class="f">강의명</label><input class="in" data-f="confirm.title" placeholder="예: 마음 날씨 기록 워크숍">
        <label class="f">일시 <span class="hint">(한 줄에 한 회차)</span></label>
        <textarea class="in" rows="4" data-f="confirm.dates" placeholder="예: 2026. 10. 7.(수) 16:00~17:30"></textarea>
        <div class="row2">
          <div><label class="f">장소</label><input class="in" data-f="confirm.place" placeholder="예: 2층 강의실"></div>
          <div><label class="f">참여 인원</label><input class="in" data-f="confirm.headcount" placeholder="예: 15명"></div>
        </div>
        <div class="row2">
          <div><label class="f">확인일</label><input class="in" type="date" data-f="confirm.date"></div>
          <div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="preview-col">
    <div class="preview-head">
      <span class="fit" id="kitFit">미리보기</span>
      <button class="btn-sm" id="kitNew">새로 쓰기</button>
      <label class="chk seal-chk hidden" id="kitSealChk"><input type="checkbox" class="sealToggle" checked> 도장</label>
      <button class="btn-sm" id="kitSave">저장</button>
      <button class="btn-primary" id="kitPrint">PDF 저장</button>
    </div>
    <div class="preview-box" id="kitBox"><div class="sheet" id="kitSheet"></div></div>
    <p class="print-tip" id="kitTip"></p>
  </div>
</div>

<div class="layout hidden" id="kitChecklist">
  <div class="form-col">
    <div class="card"><h3>제출처</h3>
      <input class="in" id="kitCkOrg" list="kitCkOrgs" placeholder="예: ○○도서관">
      <datalist id="kitCkOrgs"></datalist>
      <p class="hint" style="margin-top:6px">체크한 내용은 제출처 이름별로 이 컴퓨터(브라우저)에 남아요.</p>
    </div>
    <div class="card"><h3>메일로 보내기</h3>
      <p class="hint">체크한 서류를 첨부 목록으로 넣은 메일 문구를 만들어요.</p>
      <div class="btns">
        <button class="btn-primary" id="kitMailCopy">메일 첨부 안내 문구 복사</button>
        <button class="btn-sm" id="kitCkClear">체크 모두 지우기</button>
      </div>
      <textarea class="in hidden" id="kitMailOut" rows="13" readonly style="margin-top:10px"></textarea>
    </div>
  </div>
  <div>
    <div class="kit-ck-head"><b>챙길 서류</b><span id="kitCkCount"></span></div>
    <div id="kitCkList"></div>
    <p class="hint" id="kitCkNote" style="margin:4px 4px 0"></p>
  </div>
</div>
`;

/* ---------- 도구 ---------- */
const lines = t => String(t==null?'':t).split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
// 한 줄씩 esc 하고, 맨 앞 [제목] 은 굵게
const rich = t => lines(t).map(l => esc(l).replace(/^(\[[^\]]{1,40}\])/, '<b>$1</b>')).join('<br>');
const dcls = d => (d>=1?' d1':'') + (d>=2?' d2':'');
const safeUrl = u => /^https?:\/\//i.test(u||'') ? u : '';
const q = sel => document.querySelector('#view-kit ' + sel);

/* ---------- 상태 ---------- */
const PLAN_DB = ['title','target','headcount','duration','goal','overview','materials','instructor','note'];
const SUBS = ['plan','profile','confirm','checklist'];
const K = {
  sub: 'plan', started: false,
  plan: null, profile: null, confirm: null,
  lists: { plan:{ rows:[], loaded:false, loading:false, error:'' }, profile:{ rows:[], loaded:false, loading:false, error:'' } },
};
const blankSession = n => ({ no: n+'회', topic:'', content:'', materials:'' });
const blankPlan = () => ({ id:null, title:'', target:'', headcount:'', duration:'', goal:'', overview:'', materials:'', instructor:'', note:'',
  sessions:[blankSession(1)], org:'', period:'', place:'', date: today() });
const blankProfile = () => ({ id:null, name:'', headline:'', intro:'', careers:'', works:'', lectures:'', sort:0, date: today() });
const blankConfirm = () => ({ instructor:'', org:'', title:'', dates:'', place:'', headcount:'', date: today() });

function planFromRow(r){
  const p = blankPlan();
  PLAN_DB.forEach(k => p[k] = r[k] || '');
  p.id = r.id;
  const ss = Array.isArray(r.sessions) ? r.sessions : [];
  p.sessions = ss.length ? ss.map((s,i) => ({ no: s && s.no != null ? String(s.no) : (i+1)+'회', topic:(s&&s.topic)||'', content:(s&&s.content)||'', materials:(s&&s.materials)||'' })) : [blankSession(1)];
  return p;
}
function profileFromRow(r){
  const p = blankProfile();
  p.id = r.id; p.name = r.name||''; p.headline = r.headline||''; p.intro = r.intro||''; p.sort = r.sort||0;
  ['careers','works','lectures'].forEach(k => p[k] = (Array.isArray(r[k]) ? r[k] : []).join('\n'));
  return p;
}

// 미리보기 모드 확인용 예시 (실제 사람·기관 아님)
function samplePlan(){
  return { ...blankPlan(), title:'(예시) 마음 날씨 기록 워크숍', org:'(예시) 햇살마을도서관',
    period:'2026. 10. 7.(수) ~ 10. 21.(수) 매주 수요일\n16:00~17:30 (총 3회)', place:'도서관 2층 강의실', date: today(),
    target:'초등 3~4학년', headcount:'15명', duration:'90분', instructor:'(예시) 김하늘 작가',
    overview:'오늘 내 마음이 어떤 날씨인지 카드와 짧은 글로 기록해 보는 워크숍입니다. 감정 카드로 마음에 이름을 붙이고, 그 마음이 생긴 장면을 세 문장으로 적어 봅니다. 마지막 시간에는 세 번의 기록을 엮어 나만의 미니 책을 완성합니다.',
    goal:'[알아차리기] 감정 카드로 지금 내 마음에 이름을 붙여 본다.\n[표현하기] 마음이 생긴 장면을 짧은 글과 그림으로 남긴다.\n[완성하기] 기록을 엮은 미니 책을 끝까지 만들어 작은 성취를 느낀다.',
    sessions:[
      { no:'1회', topic:'[탐색] 오늘 내 마음의 날씨', content:'[도입] 인사와 수업 안내\n- 감정 카드 32장 함께 살펴보기\n[활동] 오늘의 마음 카드 고르기\n- 고른 카드와 비슷했던 장면 떠올려 말하기', materials:'감정 카드, 활동지' },
      { no:'2회', topic:'[기록] 마음이 생긴 장면 쓰기', content:'[도입] 지난 기록 나누기\n[활동] 장면 세 문장 쓰기\n- 언제·어디서·어떤 마음이었는지 적기\n- 짝과 바꿔 읽고 한 줄 응원 남기기', materials:'필기구, 활동지' },
      { no:'3회', topic:'[완성] 나만의 마음 날씨 책', content:'[활동] 아코디언 미니 책 만들기\n- 세 번의 기록을 골라 옮겨 적고 꾸미기\n[마무리] 한 쪽씩 소리 내어 읽고 소감 나누기', materials:'미니 책 재료, 색연필' },
    ],
    materials:'필기구와 색연필\n감정 카드·활동지·미니 책 재료는 강사가 준비해요',
    note:'회차별 내용은 참여자 연령과 반응에 맞춰 조정할 수 있어요.' };
}
function sampleProfile(){
  return { ...blankProfile(), name:'(예시) 김하늘', headline:'감정 기록 글쓰기 강사',
    intro:'감정 카드와 짧은 글쓰기로 내 마음을 알아차리고 표현하는 수업을 합니다. 어린이부터 성인까지 대상에 맞춰 1회 강연부터 연속 워크숍까지 운영합니다.',
    careers:'2024.03 ~ 현재  개띠랑 감정 기록 강사\n2021.01 ~ 2023.12  (예시) 어린이 글쓰기 교실 운영\n(예시) 시민강사 인증',
    works:'2025.06  《(예시) 마음 날씨 일기》 워크북\n2023.10  《(예시) 오늘의 감정 사전》 에세이',
    lectures:'2026.05  (예시) 햇살마을도서관 · 마음 날씨 기록 워크숍 (3회)\n2026.03  (예시) 푸른숲초등학교 · 감정 카드 만들기 (4학년 전체)\n2025.11  (예시) 별빛청소년센터 · 불편한 감정 다루기 강연\n2025.09  (예시) 바람골작은도서관 · 여름 감정 글쓰기 교실 (6회)', date: today() };
}
function sampleConfirm(){
  return { instructor:'(예시) 김하늘', org:'(예시) 햇살마을도서관', title:'(예시) 마음 날씨 기록 워크숍',
    dates:'2026. 10. 7.(수) 16:00~17:30\n2026. 10. 14.(수) 16:00~17:30\n2026. 10. 21.(수) 16:00~17:30',
    place:'도서관 2층 강의실', headcount:'15명', date: today() };
}

/* ---------- 문서: 강의계획서 ---------- */
function planHtml(p, dense){
  const ss = p.sessions.filter(s => s.topic.trim() || s.content.trim() || s.materials.trim());
  const rows = ss.length ? ss.map((s,i) => `<tr>
      <td class="kit-no">${esc(s.no.trim() || (i+1)+'회')}</td>
      <td class="kit-topic">${rich(s.topic)}</td>
      <td>${rich(s.content)}</td>
      <td>${rich(s.materials)}</td></tr>`).join('')
    : `<tr><td class="kit-empty" colspan="4">회차를 넣으면 여기에 표시됩니다</td></tr>`;
  const mats = lines(p.materials), notes = lines(p.note);
  const cell = v => v ? rich(v) : '';
  return `<div class="qdoc${dcls(dense)}"><div class="wrap">
    <div class="head">
      <div><h1>강의계획서</h1><div class="subtitle">${esc(p.title)}</div></div>
      <div class="head-meta">${p.org ? `제출처 <b>${esc(p.org)}</b><br>` : ''}작성일 <b>${dotDate(p.date)}</b></div>
    </div>
    <hr class="rule">
    <table class="kit-kv">
      <colgroup><col style="width:15%"><col style="width:35%"><col style="width:15%"><col style="width:35%"></colgroup>
      <tbody>
        <tr><th>강좌명</th><td colspan="3">${esc(p.title)}</td></tr>
        <tr><th>대상</th><td>${esc(p.target)}</td><th class="kit-lt">인원</th><td>${esc(p.headcount)}</td></tr>
        <tr><th>기간·일시</th><td colspan="3">${cell(p.period)}</td></tr>
        <tr><th>장소</th><td>${esc(p.place)}</td><th class="kit-lt">회당 시간</th><td>${esc(p.duration)}${ss.length ? ` · 총 ${ss.length}회` : ''}</td></tr>
        <tr><th>강사</th><td>${esc(p.instructor)}</td><th class="kit-lt">운영</th><td>${esc(SUPPLIER.상호)}</td></tr>
      </tbody>
    </table>
    ${p.overview.trim() ? `<div class="kit-sec"><div class="kit-sec-h">· 강의 개요</div><div class="kit-sec-b">${rich(p.overview)}</div></div>` : ''}
    ${p.goal.trim() ? `<div class="kit-sec"><div class="kit-sec-h">· 강의 목표</div><div class="kit-sec-b">${rich(p.goal)}</div></div>` : ''}
    <h2 class="kit-h2">회차별 계획</h2>
    <table class="kit-t">
      <colgroup><col style="width:10%"><col style="width:23%"><col style="width:48%"><col style="width:19%"></colgroup>
      <thead><tr><th>회차</th><th>주제</th><th>내용</th><th>준비물</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${mats.length || notes.length ? `<div class="notes">
      ${mats.length ? `<div class="h">· 준비물</div><ul class="kit-ul">${mats.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      ${notes.length ? `<div class="h">· 기타 안내</div><ul class="kit-ul">${notes.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    </div>` : ''}
    <div class="sign">위와 같이 강의계획서를 제출합니다. ${dotDate(p.date)}<br><span class="name">${p.instructor ? '강사 '+esc(p.instructor)+' · ' : ''}${esc(SUPPLIER.상호)}</span></div>
    <div class="foot">${esc(FOOTER())}</div>
  </div></div>`;
}

/* ---------- 문서: 강사 프로필 ---------- */
const DATE_HEAD = /^(\d{4}(?:\s*[.\-/]\s*\d{1,2})?(?:\s*[.\-/]\s*\d{1,2})?\.?(?:\s*~\s*(?:현재|\d{4}(?:\s*[.\-/]\s*\d{1,2})?|\d{1,2}))?)\s+(\S.*)$/;
function listRows(text){
  const rows = lines(text).map(l => { const m = l.match(DATE_HEAD); return m ? { d:m[1], t:m[2].trim() } : { d:'', t:l }; });
  const dated = rows.some(r => r.d);
  return rows.map(r => `<div class="kit-r">${dated ? `<span class="kit-rd">${esc(r.d)}</span>` : ''}<span class="kit-rt">${esc(r.t)}</span></div>`).join('');
}
function profileHtml(p, dense){
  const sec = (title, text) => lines(text).length ? `<div class="kit-lh">${title}</div>${listRows(text)}` : '';
  const body = sec('경력', p.careers) + sec('저서·작품', p.works) + sec('주요 출강 이력', p.lectures);
  return `<div class="qdoc${dcls(dense)}"><div class="wrap">
    <div class="head">
      <div><h1>강사 프로필</h1><div class="subtitle">${esc(SUPPLIER.상호)} · ${esc(SUPPLIER.소개)}</div></div>
      <div class="head-meta">작성일 <b>${dotDate(p.date)}</b></div>
    </div>
    <hr class="rule">
    <div class="kit-hero">
      <div class="kit-hero-name">${esc(p.name) || '&nbsp;'}</div>
      ${p.headline ? `<div class="kit-hero-line">${esc(p.headline)}</div>` : ''}
      ${p.intro.trim() ? `<div class="kit-hero-intro">${rich(p.intro)}</div>` : ''}
    </div>
    ${body || '<div class="kit-lh" style="color:#b3a99f;border-color:#e3ddd4">경력·저서·출강 이력을 넣으면 여기에 표시됩니다</div>'}
    <div class="foot" style="margin-top:16px">강의 문의 · ${esc(FOOTER())}</div>
  </div></div>`;
}

/* ---------- 문서: 출강확인서 ---------- */
function confirmHtml(c, dense){
  const ds = lines(c.dates);
  const rows = ds.length ? ds.map((d,i) => `<tr><td class="kit-no">${i+1}회</td><td>${esc(d)}</td><td></td></tr>`).join('')
    : `<tr><td class="kit-empty" colspan="3">일시를 한 줄에 한 회차씩 넣으면 여기에 표시됩니다</td></tr>`;
  return `<div class="qdoc${dcls(dense)}"><div class="wrap">
    <div class="head">
      <div><h1>출강확인서</h1><div class="subtitle">기관 제출용</div></div>
      <div class="head-meta">확인일 <b>${dotDate(c.date) || '&nbsp;'}</b></div>
    </div>
    <hr class="rule">
    <div class="total-bar" style="margin-top:0"><div class="trow"><span class="kit-intro">아래 강의에 강사가 출강하였음을 확인합니다.</span><span class="amt">총 ${ds.length}회</span></div></div>
    <table class="kit-kv">
      <colgroup><col style="width:15%"><col style="width:35%"><col style="width:15%"><col style="width:35%"></colgroup>
      <tbody>
        <tr><th>강사명</th><td>${esc(c.instructor)}</td><th class="kit-lt">참여 인원</th><td>${esc(c.headcount)}</td></tr>
        <tr><th>기관명</th><td colspan="3">${esc(c.org)}</td></tr>
        <tr><th>강의명</th><td colspan="3">${esc(c.title)}</td></tr>
        <tr><th>장소</th><td colspan="3">${esc(c.place)}</td></tr>
      </tbody>
    </table>
    <h2 class="kit-h2">출강 일시</h2>
    <table class="kit-t">
      <colgroup><col style="width:12%"><col style="width:58%"><col style="width:30%"></colgroup>
      <thead><tr><th>회차</th><th>일시</th><th>비고</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="info-grid" style="margin-top:16px">
      <div class="box"><div class="box-head">기관 확인</div><div class="box-body kit-fill">
        <div class="kit-fl"><span class="k">기관명</span><span class="kit-line">${esc(c.org)}</span></div>
        <div class="kit-fl"><span class="k">담당자</span><span class="kit-line"></span></div>
        <div class="kit-fl"><span class="k">확인일</span><span class="kit-line">${dotDate(c.date)}</span></div>
        <div class="kit-fl"><span class="k">서명</span><span class="kit-line r">(인)</span></div>
      </div></div>
      <div class="box"><div class="box-head">발급 요청</div><div class="box-body">${supplierRows(['상호','사업자번호','대표자','연락처','이메일'])}</div></div>
    </div>
    <div class="sign">위와 같이 출강 사실의 확인을 요청합니다. ${dotDate(c.date)}<br><span class="name">${esc(SUPPLIER.상호)} 대표 ${esc(SUPPLIER.대표자)} ${sealMark()}</span></div>
    <div class="foot">${esc(FOOTER())}</div>
  </div></div>`;
}

/* ---------- 초안 · 칸 채우기 ---------- */
const S = v => v==null ? '' : String(v);
function normPlan(o){
  const p = blankPlan();
  if(!o || typeof o!=='object') return p;
  [...PLAN_DB, 'org','period','place','date'].forEach(k => { if(o[k]!=null) p[k] = S(o[k]); });
  p.id = o.id || null;
  if(Array.isArray(o.sessions) && o.sessions.length) p.sessions = o.sessions.map((s,i) => ({ no: S(s&&s.no) || (i+1)+'회', topic:S(s&&s.topic), content:S(s&&s.content), materials:S(s&&s.materials) }));
  return p;
}
function normFlat(o, blank){
  const p = blank();
  if(!o || typeof o!=='object') return p;
  Object.keys(p).forEach(k => { if(k==='id') p.id = o.id || null; else if(k==='sort') p.sort = parseInt(o.sort,10)||0; else if(o[k]!=null) p[k] = S(o[k]); });
  return p;
}
function saveDraft(doc){ if(MODE==='db') store('kit_draft_'+doc, K[doc]); }
function fillForm(doc){
  document.querySelectorAll(`#view-kit [data-f^="${doc}."]`).forEach(el => {
    const k = el.dataset.f.split('.')[1];
    el.value = S(K[doc][k]);
  });
  if(doc==='plan') renderSessions();
}
function start(){
  if(K.started) return;
  K.started = true;
  if(MODE==='preview'){
    K.plan = samplePlan(); K.profile = sampleProfile(); K.confirm = sampleConfirm();
    q('#kitCkOrg').value = '(예시) 햇살마을도서관';
  } else {
    K.plan = normPlan(store('kit_draft_plan')); K.plan.date = today();
    K.profile = normFlat(store('kit_draft_profile'), blankProfile); K.profile.date = today();
    K.confirm = normFlat(store('kit_draft_confirm'), blankConfirm); if(!K.confirm.date) K.confirm.date = today();
    q('#kitCkOrg').value = S(store('kit_checklist_last'));
  }
  const s = store('kit_sub');
  if(SUBS.includes(s)) K.sub = s;
  ['plan','profile','confirm'].forEach(fillForm);
}
function changed(doc){
  saveDraft(doc);
  if(K.sub===doc) renderDoc();
}

/* ---------- 회차 입력 ---------- */
function renderSessions(){
  const host = q('#kitSess');
  host.innerHTML = '';
  K.plan.sessions.forEach((s, i) => {
    const box = document.createElement('div'); box.className = 'item kit-sess';
    box.innerHTML = `<div class="item-top"><input class="in s-no" placeholder="${i+1}회" value="${esc(s.no)}"><input class="in s-topic" placeholder="주제" value="${esc(s.topic)}"><button class="x" title="이 회차 빼기">×</button></div>
      <textarea class="in s-content" rows="3" placeholder="내용 (한 줄에 하나 · 맨 앞 [도입] 같은 제목은 굵게 나와요)">${esc(s.content)}</textarea>
      <input class="in s-mat" placeholder="이 회차 준비물" value="${esc(s.materials)}">`;
    const on = (sel, key) => box.querySelector(sel).addEventListener('input', e => { s[key] = e.target.value; changed('plan'); });
    on('.s-no','no'); on('.s-topic','topic'); on('.s-content','content'); on('.s-mat','materials');
    box.querySelector('.x').onclick = () => {
      if((s.topic+s.content+s.materials).trim() && !confirm(`${s.no.trim() || (i+1)+'회'} 계획을 뺄까요?`)) return;
      K.plan.sessions.splice(i, 1);
      renderSessions(); changed('plan');
    };
    host.appendChild(box);
  });
  if(!K.plan.sessions.length) host.innerHTML = '<p class="hint" style="margin-bottom:8px">회차가 없어요. 아래에서 추가해 주세요.</p>';
}

/* ---------- 미리보기 · 인쇄 ---------- */
function renderDoc(){
  if(!K.started || K.sub==='checklist') return null;
  const build = K.sub==='plan' ? d => planHtml(K.plan, d)
    : K.sub==='profile' ? d => profileHtml(K.profile, d)
    : d => confirmHtml(K.confirm, d);
  const r = renderSheet(q('#kitSheet'), q('#kitBox'), build, (K.sub==='plan' && K.plan.sessions.length > 4) ? 1 : 0);
  setFit(q('#kitFit'), r);
  return r;
}
function printDoc(){
  const r = renderDoc();
  if(!r) return;
  let parts;
  if(K.sub==='plan'){
    if(!K.plan.title.trim()){ toast('강좌명을 먼저 적어 주세요'); return; }
    parts = ['강의계획서', K.plan.title, K.plan.org];
  } else if(K.sub==='profile'){
    if(!K.profile.name.trim()){ toast('이름을 먼저 적어 주세요'); return; }
    parts = ['강사프로필', K.profile.name];
  } else {
    if(!K.confirm.instructor.trim() || !K.confirm.title.trim()){ toast('강사명과 강의명을 먼저 적어 주세요'); return; }
    parts = ['출강확인서', K.confirm.org, K.confirm.title];
  }
  if(r.over) toast('A4 한 장을 넘어요 · 내용을 조금 줄이면 한 장에 들어가요');
  printHtml(r.html, parts.map(x => S(x).trim()).filter(Boolean).join('_'));
}
function tipText(sub){
  const pdf = '「PDF 저장」을 누르면 인쇄 창이 떠요. 대상을 「PDF로 저장」으로 고르면 돼요.';
  const pv = '미리보기 모드라 저장은 안 되고 PDF만 확인할 수 있어요. ';
  if(sub==='plan') return (MODE==='db' ? '제출처·기간·장소·작성일은 기관마다 달라서 저장하지 않아요. 나머지는 「저장」해 두면 다음 기관에 다시 쓸 수 있어요. ' : pv) + pdf;
  if(sub==='profile') return (MODE==='db' ? '「저장」해 두면 다음 기관에도 그대로 꺼내 쓸 수 있어요. ' : pv) + pdf;
  return '기관 담당자가 「기관 확인」 칸에 서명해서 돌려주면 돼요. 출강확인서는 서버에 저장하지 않아요. ' + pdf;
}
function setSub(sub){
  if(!SUBS.includes(sub)) sub = 'plan';
  K.sub = sub;
  store('kit_sub', sub);
  document.querySelectorAll('#kitSeg button').forEach(b => b.classList.toggle('on', b.dataset.sub===sub));
  const isDoc = sub !== 'checklist';
  q('#kitDocs').classList.toggle('hidden', !isDoc);
  q('#kitChecklist').classList.toggle('hidden', isDoc);
  document.querySelectorAll('#view-kit [data-form]').forEach(el => el.classList.toggle('hidden', el.dataset.form!==sub));
  q('#kitSealChk').classList.toggle('kit-off', sub!=='confirm');
  q('#kitSave').classList.toggle('hidden', !(MODE==='db' && (sub==='plan' || sub==='profile')));
  q('#kitTip').textContent = isDoc ? tipText(sub) : '';
  if(sub==='confirm') fillCfSource();
  if(isDoc) renderDoc(); else renderChecklist();
}

/* ---------- 저장된 강의계획서 · 강사 프로필 (DB) ---------- */
const TABLE = { plan:'lecture_plans', profile:'instructor_profiles' };
const WORD = { plan:'강의계획서', profile:'강사 프로필' };
const WORD_OBJ = { plan:'강의계획서를', profile:'강사 프로필을' };
const WORD_SUBJ = { plan:'강의계획서가', profile:'강사 프로필이' };
const errMsg = e => S(e && e.message ? e.message : e);

async function loadList(doc, force){
  if(MODE!=='db') return;
  const L = K.lists[doc];
  if(L.loading || (L.loaded && !force)) return;
  L.loading = true; renderSaved(doc);
  try{
    const base = sb.from(TABLE[doc]).select('*');
    const { data, error } = doc==='plan'
      ? await base.order('updated_at', { ascending:false }).limit(300)
      : await base.order('sort').order('updated_at', { ascending:false }).limit(300);
    if(error) throw error;
    L.rows = data || []; L.loaded = true; L.error = '';
  }catch(e){
    L.error = errMsg(e);
    toast(`저장된 ${WORD_OBJ[doc]} 불러오지 못했어요`);
  }
  L.loading = false;
  renderSaved(doc);
  if(doc==='plan') fillCfSource();
}
function renderSaved(doc){
  const host = q(doc==='plan' ? '#kitPlanSaved' : '#kitProfileSaved');
  if(!host) return;
  if(MODE!=='db'){ host.innerHTML = '<p class="hint">미리보기 모드라 저장·불러오기는 로그인 후에 돼요. 지금 칸에 든 내용은 예시예요.</p>'; return; }
  const L = K.lists[doc], cur = K[doc];
  if(L.loading){ host.innerHTML = '<p class="hint">불러오는 중…</p>'; return; }
  if(L.error){
    host.innerHTML = `<p class="parse-note warn">불러오지 못했어요: ${esc(L.error)}</p><div class="btns"><button class="btn-sm kit-retry">다시 불러오기</button></div>`;
    host.querySelector('.kit-retry').onclick = () => loadList(doc, true);
    return;
  }
  const curNote = cur && cur.id && L.rows.some(r => r.id===cur.id)
    ? `<div class="kit-cur">저장된 ${esc(WORD_OBJ[doc])} 고치는 중이에요. 「저장」하면 덮어써요. <button class="btn-link kit-copy">따로 새로 저장</button></div>` : '';
  if(!L.rows.length){
    host.innerHTML = `<p class="hint">아직 저장된 ${esc(WORD_SUBJ[doc])} 없어요. 다 쓰고 오른쪽 위 「저장」을 누르면 여기에 쌓여요.</p>`;
  } else {
    host.innerHTML = '<div class="kit-saved"></div>' + curNote;
    const list = host.querySelector('.kit-saved');
    L.rows.forEach(r => {
      const el = document.createElement('div');
      el.className = 'kit-sv' + (cur && cur.id===r.id ? ' cur' : '');
      const title = doc==='plan' ? (r.title || '(강좌명 없음)') : (r.name || '(이름 없음)');
      const n = Array.isArray(r.sessions) ? r.sessions.length : 0;
      const info = doc==='plan' ? [r.target, n ? n+'회' : '', r.instructor] : [r.headline];
      const when = r.updated_at ? new Date(r.updated_at).toLocaleDateString('sv-SE') : '';
      info.push(when ? dotDate(when) : '', S(r.updated_by).split('@')[0]);
      el.innerHTML = `<div class="kit-sv-m"><div class="kit-sv-t">${esc(title)}</div><div class="kit-sv-s">${esc(info.filter(Boolean).join(' · '))}</div></div>
        <button class="btn-sm kit-open">열기</button><button class="btn-sm danger kit-del">삭제</button>`;
      el.querySelector('.kit-open').onclick = () => openRow(doc, r);
      el.querySelector('.kit-del').onclick = () => deleteRow(doc, r);
      list.appendChild(el);
    });
  }
  const copy = host.querySelector('.kit-copy');
  if(copy) copy.onclick = () => { K[doc].id = null; saveRow(doc); };
}
function openRow(doc, r){
  if(doc==='plan'){
    const keep = { org:K.plan.org, period:K.plan.period, place:K.plan.place, date:K.plan.date };   // 이번 제출처 칸은 그대로 둔다
    K.plan = { ...planFromRow(r), ...keep };
  } else {
    K.profile = { ...profileFromRow(r), date: K.profile.date || today() };
  }
  fillForm(doc); saveDraft(doc); renderSaved(doc);
  if(K.sub===doc) renderDoc();
  toast(`「${doc==='plan' ? (r.title||'강의계획서') : (r.name||'강사 프로필')}」 열었어요`);
}
async function saveRow(doc){
  if(MODE!=='db'){ toast('저장은 관리실에 로그인해야 할 수 있어요'); return; }
  const cur = K[doc];
  let row;
  if(doc==='plan'){
    if(!cur.title.trim()){ toast('강좌명을 먼저 적어 주세요'); return; }
    row = {};
    PLAN_DB.forEach(k => row[k] = S(cur[k]).trim());
    row.sessions = cur.sessions.filter(s => (s.topic+s.content+s.materials).trim())
      .map((s,i) => ({ no: s.no.trim() || (i+1)+'회', topic: s.topic.trim(), content: s.content.trim(), materials: s.materials.trim() }));
  } else {
    if(!cur.name.trim()){ toast('이름을 먼저 적어 주세요'); return; }
    row = { name: cur.name.trim(), headline: cur.headline.trim(), intro: cur.intro.trim(),
      careers: lines(cur.careers), works: lines(cur.works), lectures: lines(cur.lectures) };
  }
  const insertRow = () => {
    const ins = { ...row };
    if(doc==='profile') ins.sort = Math.max(0, ...K.lists.profile.rows.map(r => r.sort||0)) + 10;
    return sb.from(TABLE[doc]).insert(ins).select().single();
  };
  const btn = q('#kitSave'); btn.disabled = true;
  let res, isNew = !cur.id;
  try{
    res = cur.id ? await sb.from(TABLE[doc]).update(row).eq('id', cur.id).select().single() : await insertRow();
    if(!isNew && res.error && res.error.code==='PGRST116'){ isNew = true; res = await insertRow(); }   // 그사이 지워졌으면 새로 저장
  }catch(e){ res = { error: e }; }
  btn.disabled = false;
  if(res.error || !res.data){ toast('저장하지 못했어요: ' + errMsg(res.error || '응답 없음')); return; }
  cur.id = res.data.id;
  const L = K.lists[doc];
  L.rows = [res.data, ...L.rows.filter(x => x.id !== res.data.id)];
  if(doc==='profile') L.rows.sort((a,b) => (a.sort||0) - (b.sort||0));
  saveDraft(doc); renderSaved(doc);
  if(doc==='plan') fillCfSource();
  toast(`${WORD_OBJ[doc]} ${isNew ? '저장했어요' : '고쳤어요'}`);
}
async function deleteRow(doc, r){
  const title = doc==='plan' ? (r.title || '강좌명 없음') : (r.name || '이름 없음');
  if(!confirm(`「${title}」 ${WORD_OBJ[doc]} 지울까요? 되돌릴 수 없어요.`)) return;
  let data, error;
  try{ ({ data, error } = await sb.from(TABLE[doc]).delete().eq('id', r.id).select('id')); }catch(e){ error = e; }
  if(error){ toast('지우지 못했어요: ' + errMsg(error)); return; }
  if(!data || !data.length){ toast('지우지 못했어요 · 권한이 없거나 이미 지워졌어요'); loadList(doc, true); return; }
  const L = K.lists[doc];
  L.rows = L.rows.filter(x => x.id !== r.id);
  if(K[doc].id === r.id){ K[doc].id = null; saveDraft(doc); }
  renderSaved(doc);
  if(doc==='plan') fillCfSource();
  toast(`「${title}」 지웠어요`);
}
function resetDoc(){
  const sub = K.sub;
  if(sub==='checklist') return;
  if(!confirm('새로 쓸까요? 저장하지 않은 내용은 지워져요.')) return;
  if(sub==='plan') K.plan = blankPlan();
  else if(sub==='profile') K.profile = blankProfile();
  else { K.confirm = blankConfirm(); q('#kitCfNote').textContent = ''; }
  fillForm(sub); saveDraft(sub);
  if(sub!=='confirm') renderSaved(sub);
  renderDoc();
}

/* ---------- 출강확인서: 강의계획서에서 가져오기 ---------- */
function fillCfSource(){
  const sel = q('#kitCfSrc');
  if(!sel || !K.started) return;
  const keep = sel.value;
  const rows = K.lists.plan.rows;
  sel.innerHTML = `<option value="current">강의계획서 칸에 지금 쓰고 있는 것${K.plan.title.trim() ? ' ('+esc(K.plan.title.trim())+')' : ''}</option>` +
    (rows.length ? `<optgroup label="저장된 강의계획서">${rows.map(r => `<option value="${esc(r.id)}">${esc(r.title || '(강좌명 없음)')}${r.instructor ? ' · '+esc(r.instructor) : ''}</option>`).join('')}</optgroup>` : '');
  sel.value = [...sel.options].some(o => o.value===keep) ? keep : 'current';
}
function importPlan(){
  const id = q('#kitCfSrc').value || 'current';
  const isCur = id==='current';
  const row = isCur ? null : K.lists.plan.rows.find(r => r.id===id);
  const p = isCur ? K.plan : (row ? planFromRow(row) : null);
  const note = q('#kitCfNote');
  if(!p || !(p.title.trim() || p.instructor.trim())){
    note.className = 'parse-note warn'; note.textContent = '가져올 내용이 없어요. 강의계획서의 강좌명·강사부터 채워 주세요.'; return;
  }
  const c = K.confirm;
  const got = [];
  if(p.title.trim()){ c.title = p.title.trim(); got.push('강의명'); }
  if(p.instructor.trim()){ c.instructor = p.instructor.trim(); got.push('강사명'); }
  if(p.headcount.trim()){ c.headcount = p.headcount.trim(); got.push('인원'); }
  if(isCur && p.org.trim()){ c.org = p.org.trim(); got.push('기관명'); }
  if(isCur && p.place.trim()){ c.place = p.place.trim(); got.push('장소'); }
  const ss = p.sessions.filter(s => (s.topic+s.content+s.materials).trim());
  const period = isCur ? lines(p.period) : [];
  let warn = '';
  if(period.length && (period.length===ss.length || (ss.length<=1 && period.length===1))){
    c.dates = period.join('\n'); got.push('일시');
  } else if(ss.length){
    c.dates = ss.map((s,i) => `(${s.no.trim() || (i+1)+'회'} 날짜·시간)`).join('\n');
    warn = `회차 ${ss.length}개만큼 일시 줄을 만들었어요. 괄호 부분을 실제 날짜·시간으로 바꿔 주세요.`;
  }
  note.className = 'parse-note' + (warn ? ' warn' : '');
  const last = (got[got.length-1] || '').slice(-1);
  const obj = last && (last.charCodeAt(0) - 0xAC00) % 28 ? '을' : '를';   // 받침 있으면 을
  note.textContent = (got.length ? `${got.join('·')}${obj} 채웠어요.` : '') + (warn ? (got.length ? '\n' : '') + warn : '');
  fillForm('confirm'); saveDraft('confirm'); renderDoc();
}

/* ---------- 제출 체크리스트 ---------- */
const CK_ITEMS = [
  { key:'biz', title:'사업자등록증 사본', kw:/사업자/, file:true },
  { key:'bank', title:'통장 사본', kw:/통장|계좌/, file:true },
  { key:'consent', title:'강사카드·개인정보 수집·이용 동의서', kw:/강사\s*카드|개인정보|동의서/, file:true, hint:'기관 양식이 따로 오면 그 양식에 적어서 보내요.' },
  { key:'profile', title:'강사 프로필(이력)', kw:/프로필|이력/, sub:'profile', go:'강사 프로필 만들기' },
  { key:'plan', title:'강의계획서', kw:/강의\s*계획/, sub:'plan', go:'강의계획서 만들기' },
  { key:'quote', title:'견적서', view:'quote', go:'견적서 탭 열기', hint:'강사료·재료비가 있으면 함께 보내요.' },
  { key:'confirm', title:'출강확인서', sub:'confirm', go:'출강확인서 만들기', hint:'보통 강의가 끝나고 정산할 때 내요.' },
];
const NO_ORG = '(제출처 없음)';
function ckAll(){ const v = store('kit_checklist'); return v && typeof v==='object' && !Array.isArray(v) ? v : {}; }
function ckOrg(){ return q('#kitCkOrg').value.trim(); }
function ckState(){ const s = ckAll()[ckOrg() || NO_ORG]; return s && typeof s==='object' ? s : {}; }
function ckSet(key, on){
  const all = ckAll(), org = ckOrg() || NO_ORG;
  const s = { ...(all[org] || {}) };
  if(on) s[key] = true; else delete s[key];
  if(Object.keys(s).length) all[org] = s; else delete all[org];
  store('kit_checklist', all);
}
function renderChecklist(){
  const st = ckState();
  q('#kitCkOrgs').innerHTML = Object.keys(ckAll()).filter(o => o!==NO_ORG).map(o => `<option value="${esc(o)}">`).join('');
  const docLinks = MODE==='db' ? (Array.isArray(LINKS) ? LINKS : []).filter(l => l.category==='제출 서류' && safeUrl(l.url)) : [];
  const host = q('#kitCkList');
  host.innerHTML = '';
  let done = 0, missing = 0;
  CK_ITEMS.forEach(it => {
    const on = !!st[it.key];
    if(on) done++;
    const links = it.kw ? docLinks.filter(l => it.kw.test(S(l.title))) : [];
    let acts = links.map(l => `<a class="kit-a" href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">${esc(l.title)} ↗</a>`).join('');
    if(it.sub) acts += `<button class="btn-sm kit-go">${esc(it.go)}</button>`;
    if(it.view) acts += `<a class="btn-sm kit-view" href="#${it.view}">${esc(it.go)}</a>`;
    if(it.file && !links.length){
      missing++;
      acts += MODE==='db'
        ? '<span class="kit-ck-miss">링크가 아직 없어요 · 「링크 모음」에 분류 「제출 서류」로 추가해 주세요</span>'
        : '<span class="hint">로그인하면 「링크 모음」의 「제출 서류」 링크가 여기에 떠요</span>';
    }
    const el = document.createElement('div');
    el.className = 'kit-ck' + (on ? ' done' : '');
    el.innerHTML = `<input type="checkbox" id="kitCk_${it.key}"${on ? ' checked' : ''}>
      <div class="kit-ck-main"><label class="kit-ck-t" for="kitCk_${it.key}">${esc(it.title)}</label>
      ${it.hint ? `<div class="kit-ck-h">${esc(it.hint)}</div>` : ''}
      ${acts ? `<div class="kit-ck-links">${acts}</div>` : ''}</div>`;
    el.querySelector('input').onchange = e => { ckSet(it.key, e.target.checked); renderChecklist(); };
    const go = el.querySelector('.kit-go');
    if(go) go.onclick = () => { setSub(it.sub); window.scrollTo(0,0); };
    const vw = el.querySelector('.kit-view');
    if(vw) vw.onclick = e => { e.preventDefault(); switchView(it.view); };
    host.appendChild(el);
  });
  q('#kitCkCount').textContent = `${CK_ITEMS.length}개 중 ${done}개 챙김${ckOrg() ? ' · ' + ckOrg() : ''}`;
  const noteEl = q('#kitCkNote');
  noteEl.innerHTML = MODE==='db' && missing
    ? '사업자등록증·통장 사본 같은 파일은 구글 드라이브 등에 올린 뒤 <a href="#links" class="kit-golinks">링크 모음</a>에 분류 「제출 서류」로 추가하면 여기에 바로 떠요. 이름에 「사업자등록증」「통장」「강사카드」 같은 말을 넣어 주세요.'
    : '';
  const gl = noteEl.querySelector('.kit-golinks');
  if(gl) gl.onclick = e => { e.preventDefault(); switchView('links'); };
}
function mailText(){
  const st = ckState(), org = ckOrg();
  const picked = CK_ITEMS.filter(it => st[it.key]).map(it => it.title);
  if(!picked.length) return null;
  return [
    `안녕하세요, ${org ? org + ' ' : ''}담당자님.`, `${SUPPLIER.상호}입니다.`, '',
    '요청하신 서류를 첨부해 보내드립니다.', '',
    '[첨부 서류]', ...picked.map((t,i) => `${i+1}. ${t}`), '',
    '빠진 서류가 있거나 기관 양식으로 다시 써야 하는 서류가 있으면 편하게 말씀해 주세요.',
    '감사합니다.', '',
    `${SUPPLIER.상호} 드림`, `${SUPPLIER.이메일} · ${SUPPLIER.연락처}`,
  ].join('\n');
}
function copyMail(){
  const t = mailText(), out = q('#kitMailOut');
  if(!t){ toast('보낼 서류를 먼저 체크해 주세요'); return; }
  out.value = t; out.classList.remove('hidden');
  const fallback = () => { out.focus(); out.select(); toast('자동 복사가 안 돼서 문구를 골라 두었어요 · ⌘C로 복사해 주세요'); };
  try{
    navigator.clipboard.writeText(t).then(() => toast('메일 문구를 복사했어요')).catch(fallback);
  }catch(e){ fallback(); }
}
function clearChecks(){
  const org = ckOrg() || NO_ORG;
  if(!confirm(`「${org}」 체크를 모두 지울까요?`)) return;
  const all = ckAll(); delete all[org]; store('kit_checklist', all);
  q('#kitMailOut').classList.add('hidden');
  renderChecklist();
}

/* ---------- 등록 ---------- */
const style = document.createElement('style');
style.textContent = CSS;
document.head.appendChild(style);

registerDocView('kit', {
  label: '기관 제출 서류',
  html: HTML,
  init(){
    const sec = document.getElementById('view-kit');
    const onField = e => {
      const f = e.target && e.target.dataset ? e.target.dataset.f : '';
      if(!f || !K.started) return;
      const [doc, key] = f.split('.');
      if(!K[doc] || S(K[doc][key]) === e.target.value) return;
      K[doc][key] = e.target.value;
      changed(doc);
    };
    sec.addEventListener('input', onField);
    sec.addEventListener('change', onField);
    sec.querySelectorAll('#kitSeg button').forEach(b => b.onclick = () => setSub(b.dataset.sub));
    q('#kitSessAdd').onclick = () => {
      K.plan.sessions.push(blankSession(K.plan.sessions.length + 1));
      renderSessions(); changed('plan');
      const t = sec.querySelectorAll('#kitSess .s-topic'); if(t.length) t[t.length-1].focus();
    };
    q('#kitNew').onclick = resetDoc;
    q('#kitSave').onclick = () => saveRow(K.sub);
    q('#kitPrint').onclick = printDoc;
    q('#kitCfImport').onclick = importPlan;
    q('#kitCkOrg').addEventListener('input', () => { store('kit_checklist_last', ckOrg()); q('#kitMailOut').classList.add('hidden'); renderChecklist(); });
    q('#kitMailCopy').onclick = copyMail;
    q('#kitCkClear').onclick = clearChecks;
  },
  show(){
    start();
    if(MODE==='db'){ loadList('plan'); loadList('profile'); }
    renderSaved('plan'); renderSaved('profile');
    setSub(K.sub);
  },
  render(){ if(K.started && K.sub!=='checklist') renderDoc(); },
  // 로컬 확인용: ?preview&printtest=kit:plan | kit:profile | kit:confirm  (kit:checklist 는 화면만 연다)
  printTest(sub){
    start();
    K.plan = samplePlan(); K.profile = sampleProfile(); K.confirm = sampleConfirm();
    ['plan','profile','confirm'].forEach(fillForm);
    setSub(SUBS.includes(sub) ? sub : 'plan');
    const r = renderDoc();
    return r ? r.html : '';
  },
});
})();
