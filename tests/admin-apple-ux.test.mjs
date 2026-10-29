import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../admin/admin-apple-ux.css',import.meta.url),'utf8');
const personalPlanCss=readFileSync(new URL('../admin/personal-plan.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../admin/admin-apple-ux.js',import.meta.url),'utf8');
const teamModel=readFileSync(new URL('../admin/team-dashboard-model.js',import.meta.url),'utf8');

test('Apple-inspired UX assets are isolated additions on the gated admin page',()=>{
  assert.match(html,/admin-apple-ux\.css\?v=20261029-2/);
  assert.match(html,/admin-apple-ux\.js\?v=20261029-2/);
  assert.doesNotMatch(js,/fetch\(|\.from\(|\.update\(|\.insert\(|localStorage|sessionStorage/);
});

test('command palette provides keyboard, touch and the three representative routes',()=>{
  for(const tab of ['home','finder','publishing'])assert.match(js,new RegExp(`tab:'${tab}'`));
  assert.match(js,/metaKey\|\|event\.ctrlKey/);
  assert.match(js,/event\.key==='\/'/);
  assert.match(js,/data-ux-more/);
  assert.match(css,/min-height:54px/);
  assert.match(css,/@media\(max-width:390px\)/);
  assert.match(js,/function deactivate\(\)\{close\(false\);activeIndex=0/);
  assert.match(html,/window\.AdminAppleUX\?\.deactivate\(\)/);
});

test('hidden toast and desktop drawer controls cannot intercept primary navigation',()=>{
  assert.match(html,/\.toast\{[^}]*pointer-events:none/);
  assert.match(css,/\.personal-plan-drawer-close\{display:none\}/);
  assert.match(personalPlanCss,/mobile-menu-open \.personal-plan-drawer-close[\s\S]*display:flex/);
});

test('bulk and program actions remain explicit, reversible and above the mobile navigation',()=>{
  assert.match(css,/\.team-workboard-bulk\{position:sticky/);
  assert.match(css,/\.program-actions\{position:sticky/);
  assert.match(css,/bottom:74px/);
  assert.match(html,/id="team-work-clear"[^>]*>선택 해제/);
  assert.match(html,/id="program-rollback"[^>]*>이전 승인본으로 롤백/);
});

test('unknown and disconnected data boundaries are not visually converted into success',()=>{
  assert.match(teamModel,/운영 원장 미연결/);
  assert.match(html,/자동 게시 스케줄은 연결하지 않습니다/);
  assert.match(html,/현재 목록이 비어 있어도 0건으로 확정하지 않습니다/);
  assert.doesNotMatch(js,/connected\s*=\s*true|live_connected\s*=\s*true/);
});
