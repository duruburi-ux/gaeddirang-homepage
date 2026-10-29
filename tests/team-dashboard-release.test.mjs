import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const model=require('../admin/team-dashboard-model.js');

test('dated consignment evidence remains unknown until an operating ledger is connected',()=>{
  const result=model.build({coreKnown:false});
  const lane=result.lanes.find(row=>row.key==='consignment');
  assert.equal(lane.value,null);
  assert.match(lane.note,/2026-10-29/);
  assert.match(lane.note,/운영 원장 미연결/);
  assert.match(lane.evidence,/신규 문의 9종\(미입고\)/);
});

test('team dashboard exposes explicit account lifecycle methods and requires identity plus generation',()=>{
  const source=fs.readFileSync(new URL('../admin/team-dashboard.js',import.meta.url),'utf8');
  assert.match(source,/return \{init,activate,deactivate,clear,setCore\}/);
  assert.match(source,/String\(detail\.userId\|\|''\)!==activeUserId/);
  assert.match(source,/Number\(detail\.generation\)!==authGeneration/);
  assert.match(source,/String\(context\.userId\|\|''\)!==activeUserId/);
  assert.match(source,/Number\(context\.generation\)!==authGeneration/);
  assert.doesNotMatch(source,/\.from\(|\.rpc\(|fetch\(|method:\s*['"]POST/);
});

test('admin auth lifecycle clears and activates the team dashboard with the same verification generation',()=>{
  const html=fs.readFileSync(new URL('../admin/index.html',import.meta.url),'utf8');
  assert.match(html,/TeamDashboard\?\.deactivate\(\)/);
  assert.match(html,/TeamDashboard\?\.activate\(userId,run\)/);
  assert.match(html,/TeamDashboard\?\.setCore\([\s\S]*\{userId:ACTIVE_USER_ID,generation:AUTH_GENERATION\}\)/);
});

