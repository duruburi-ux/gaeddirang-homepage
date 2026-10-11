import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../admin/book-finder.js',import.meta.url),'utf8');
const model=readFileSync(new URL('../admin/book-finder-model.js',import.meta.url),'utf8');

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

test('빈 결과·오류·오래된 값과 0권을 서로 다른 문구로 표시한다',()=>{
  assert.match(js,/검색 결과 없음은 품절을 뜻하지 않습니다/);
  assert.match(js,/0권으로 판단하지 말고 다시 확인/);
  assert.match(js,/10분 이내 이전 확인본을 표시합니다/);
  assert.match(js,/10분 넘게 갱신되지 않아 수량을 숨겼습니다/);
  assert.match(model,/장부상 0권 · 실물 확인 필요/);
});

test('예약·입고·구매 후보는 연결되지 않은 원본을 꾸며내지 않는다',()=>{
  assert.match(js,/예약·입고 예정','미등록','책별 원본 미연결/);
  assert.match(js,/YES24 구매 후보','미등록','구매 실행 없음/);
  assert.match(js,/예약 제외 가용 수량 미등록/);
});

test('60초·탭 복귀 갱신과 로그아웃 캐시 삭제를 갖는다',()=>{
  assert.match(js,/setInterval\(\(\)=>\{[^}]*tab-finder[^}]*refresh\(\)[^}]*\},60000\)/);
  assert.match(js,/visibilitychange[^\n]*tab-finder[^\n]*refresh\(\)/);
  assert.match(js,/SIGNED_OUT[^\n]*clear\(\)/);
  assert.match(js,/data=null;meta=null/);
});
