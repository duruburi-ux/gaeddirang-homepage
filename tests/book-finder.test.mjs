import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../admin/book-finder.js',import.meta.url),'utf8');
const model=readFileSync(new URL('../admin/book-finder-model.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../admin/book-finder.css',import.meta.url),'utf8');

test('책 찾기는 기존 관리자 경계 안의 별도 모바일 메뉴다',()=>{
  assert.ok(html.indexOf('id="appView"')<html.indexOf('id="tab-finder"'));
  assert.match(html,/data-tab="finder">책공방/);assert.match(html,/<option value="finder">책공방/);
  assert.match(html,/window\.BookFinder\?\.init/);assert.match(html,/window\.BookFinder\?\.clear\(\)/);
  assert.match(html,/const TABS=\[[^\]]*'finder'/);
});

test('책 찾기 브라우저 코드는 읽기 전용 SCM GET만 사용하고 저장소·비밀값을 남기지 않는다',()=>{
  new vm.Script(js);new vm.Script(model);
  assert.match(js,/functions\/v1\/scm-read/);assert.match(js,/method:'GET'/);assert.match(js,/cache:'no-store'/);
  assert.doesNotMatch(js,/method:'POST'|\.insert\(|\.update\(|\.delete\(|localStorage|sessionStorage|SERVICE_ROLE|PRIVATE KEY/i);
  assert.doesNotMatch(html,/SERVICE_ROLE|BEGIN PRIVATE KEY|SCM_GOOGLE_SERVICE_ACCOUNT/);
});

test('빈 결과·오류·지난 조회 기록과 0권을 서로 다른 문구로 표시한다',()=>{
  assert.match(js,/검색 결과 없음은 품절을 뜻하지 않습니다/);
  assert.match(js,/0권으로 판단하지 말고 다시 확인/);
  assert.match(js,/지난 조회 기록을 표시합니다/);
  assert.match(js,/36시간을 넘어 수량을 숨겼습니다/);
  assert.match(model,/장부상 0권 · 실물 확인 필요/);
});

test('예약·입고·구매 후보는 통합 원본을 표시하되 주문·입고·실물 확정으로 바꾸지 않는다',()=>{
  assert.match(js,/예약 근거/);assert.match(js,/입고 예정/);assert.match(js,/YES24 구매 후보/);
  assert.match(js,/구매 미실행/);assert.match(js,/실입고 전 재고 미반영/);assert.match(model,/매장 판매 가능 · 확인 필요/);
  assert.match(js,/비공개 원본 설정 대기/);assert.match(js,/SmartStore 매핑 후보/);
});

test('현장 검색을 먼저 보여 주고 경고 상세와 버튼 줄바꿈을 제어한다',()=>{
  assert.ok(html.indexOf('id="book-finder-query"')<html.indexOf('class="finder-trust"'));
  assert.match(html,/<details class="finder-trust"><summary>판매 가능 수량은 실사 확정값만 안내합니다/);
  assert.match(css,/finder-search-row button[^}]*white-space:nowrap/);
  assert.match(css,/@media\(max-width:520px\)[^\n]*finder-results\{grid-template-columns:1fr/);
});

test('카드는 실물 근거 없는 0을 확정하지 않고 시스템 장부를 매장 실물과 구분한다',()=>{
  assert.match(js,/row\.hasPhysicalEvidence\?'<span class="finder-badge">매장 실사 근거 확인/);
  assert.match(js,/시스템 장부/);assert.match(js,/매장 실물 합계 아님/);
  assert.doesNotMatch(js,/실사 정보 미등록/);
});

test('60초·탭 복귀 갱신과 로그아웃 캐시 삭제를 갖는다',()=>{
  assert.match(js,/setInterval\(\(\)=>\{[^}]*tab-finder[^}]*refresh\(\)[^}]*\},60000\)/);
  assert.match(js,/visibilitychange[^\n]*tab-finder[^\n]*refresh\(\)/);
  assert.match(js,/SIGNED_OUT[^\n]*clear\(\)/);
  assert.match(js,/data=null;meta=null/);
});
