import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../admin/admin-ux.css',import.meta.url),'utf8');
const docs=readFileSync(new URL('../admin/docs.html',import.meta.url),'utf8');

test('관리 메뉴는 오늘·처리·운영·기록으로 묶이고 모바일에서도 전 메뉴에 접근한다',()=>{
  for(const group of ['오늘','처리','운영','기록'])assert.match(html,new RegExp(`(?:nav-label|optgroup label=")${group}`));
  for(const tab of ['home','work','orders','apps','inquiries','scm','integration','cohorts','members','alerts','operations']){
    assert.match(html,new RegExp(`<option value="${tab}"`));
  }
  assert.match(html,/id="mobileNav"[\s\S]+addEventListener\('change'/);
  assert.ok(css.includes('@media(max-width:700px)'));
  assert.ok(css.includes('.tabs{display:none}.mobile-nav-wrap{display:block}'));
});

test('핵심 목록은 제목·표시 라벨·검색·정렬·조건 초기화·결과 수를 제공한다',()=>{
  for(const id of ['oSort','fSort','mSort','iSort','alSort'])assert.match(html,new RegExp(`id="${id}"`));
  for(const scope of ['orders','apps','members','inquiries','alerts'])assert.match(html,new RegExp(`data-filter-reset="${scope}"`));
  for(const heading of ['주문 처리','수업 신청','고객 이력','기관 문의','출간 알림'])assert.match(html,new RegExp(`<h1>${heading}</h1>`));
  assert.match(html,/function showEmpty[\s\S]+조건 지우고 전체 보기/);
  assert.match(html,/전체 \$\{total\}\$\{unit\} 중/);
});

test('상세 패널은 키보드 초점·Escape·브라우저 뒤로가기를 지원한다',()=>{
  assert.match(html,/aria-modal','true'/);
  assert.match(html,/if\(e\.key==='Escape'\)/);
  assert.match(html,/history\.pushState\([\s\S]+panel:true/);
  assert.match(html,/popstate[\s\S]+clearPanel/);
  assert.match(html,/ArrowRight[\s\S]+ArrowLeft[\s\S]+Home[\s\S]+End/);
});

test('직접 입력 폼은 필수·선택, 계산 의미, 화면 안 오류와 재시도를 안내한다',()=>{
  for(const id of ['naFormError','paFormError','naTotalPreview','naNote','paNote'])assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html,/실제 입금 여부는 상태에서 별도 확인/);
  assert.match(html,/입력 내용을 유지했으니 잠시 후 다시 시도해 주세요/);
  assert.match(html,/aria-invalid/);
});

test('별도 감사 중인 정산 PDF와 계산 문구는 UI 배포에서 바꾸지 않는다',()=>{
  assert.match(docs,/공제 전 \$\{amountName\}/);
  assert.match(docs,/실제 지급액은 기지급 내역과 공제 사항 확인 후 확정됩니다/);
  assert.doesNotMatch(docs,/이번 정산 계산액/);
});
