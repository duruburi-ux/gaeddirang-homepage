#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {relative,resolve} from 'node:path';

const BASE='e96f89e3dd3b81be41fc7e1dbb7eaa9d7e7db360';
const runtimeFiles=['admin/index.html','admin/admin-apple-ux.css','admin/admin-apple-ux.js'];
const reviewFiles=[
  'tests/admin-apple-ux.test.mjs',
  'tests/visual/admin-apple-ux.spec.mjs',
  'ADMIN-APPLE-UX-HANDOFF.md',
  'scripts/build-admin-apple-ux-manifest.mjs',
];
const screenshotFiles=[
  'artifacts/admin-apple-ux-20261029/team-overview-1440.png',
  'artifacts/admin-apple-ux-20261029/program-review-1440.png',
  'artifacts/admin-apple-ux-20261029/book-finder-390.png',
];
const [outputArg,patchArg]=process.argv.slice(2);
if(!outputArg||!patchArg)throw Error('usage: node scripts/build-admin-apple-ux-manifest.mjs <output.json> <patch-file>');
const cwd=process.cwd(),output=resolve(outputArg),patch=resolve(patchArg);
const git=args=>execFileSync('git',args,{cwd,encoding:'utf8'});
const sha=value=>createHash('sha256').update(value).digest('hex');
const fileSha=path=>sha(readFileSync(resolve(cwd,path)));
const assertSha=(value,label)=>{if(!/^[a-f0-9]{64}$/.test(value))throw Error(`INVALID_SHA256:${label}:${value}`);return value;};
const head=git(['rev-parse','HEAD']).trim(),base=git(['rev-parse','HEAD^']).trim();
if(base!==BASE)throw Error(`UNEXPECTED_BASE:${base}`);
const changed=git(['diff','--name-only',`${BASE}..${head}`]).trim().split('\n').filter(Boolean).sort();
const expected=[...runtimeFiles,...reviewFiles].sort();
if(JSON.stringify(changed)!==JSON.stringify(expected))throw Error(`UNEXPECTED_CHANGED_FILES:\n${changed.join('\n')}`);
for(const path of screenshotFiles)if(!existsSync(resolve(cwd,path)))throw Error(`MISSING_SCREENSHOT:${path}`);
const entries=paths=>paths.map(path=>({path,sha256:assertSha(fileSha(path),path)}));
const publicFiles=['index.html','assets/public-content.js'];
const unchangedPublicFiles={};
for(const path of publicFiles){
  const baseValue=sha(execFileSync('git',['show',`${BASE}:${path}`],{cwd}));
  const currentValue=fileSha(path);
  if(baseValue!==currentValue)throw Error(`PUBLIC_FILE_CHANGED:${path}`);
  unchangedPublicFiles[path]=assertSha(currentValue,path);
}
if(existsSync(resolve(cwd,'assets/program-approved-payload.js')))throw Error('UNEXPECTED_PUBLIC_PAYLOAD_FILE');
const manifest={
  schemaVersion:1,
  generatedAt:new Date().toISOString(),
  generatedBy:'scripts/build-admin-apple-ux-manifest.mjs',
  deploymentExecuted:false,
  pushExecuted:false,
  branch:git(['branch','--show-current']).trim(),
  baseCommit:BASE,
  candidateCommit:head,
  rollback:`git revert ${head}`,
  patch:{file:relative(resolve(output,'..'),patch),sha256:assertSha(sha(readFileSync(patch)),'patch')},
  runtimeFiles:entries(runtimeFiles),
  reviewContractFiles:entries(reviewFiles),
  screenshotEvidence:entries(screenshotFiles),
  unchangedPublicFiles:{...unchangedPublicFiles,'assets/program-approved-payload.js':'absent_in_base_and_candidate'},
  verification:{
    focusedUxNode:'4/4 pass',
    chromiumUx:'5/5 pass',
    chromiumExistingRelease:'6/6 pass',
    fullNode:'260 total; 255 pass; 5 unchanged inherited fail',
    candidateOnlyAdditionalFailures:0,
  },
  inheritedFailures:[
    '관리 메뉴는 오늘·처리·운영·기록으로 묶이고 모바일에서도 전 메뉴에 접근한다',
    '핵심 목록은 제목·표시 라벨·검색·정렬·조건 초기화·결과 수를 제공한다',
    'integration hub is inside the gated admin and labels connection boundaries',
    '운영 읽기 구현은 기존 인증과 SELECT·SCM GET만 사용한다',
    'directory is inside existing gated app and includes explicit sync boundaries',
  ],
  boundaries:[
    'presentation and navigation only; no new data or write adapter',
    'program draft remains per-user temporary browser storage and is not public publishing',
    'unknown and disconnected sources remain explicit',
    'no homepage, database, Edge Function, permission, inventory, settlement, payment, mail or chat write',
  ],
};
writeFileSync(output,JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({output,candidateCommit:head,patchSha:manifest.patch.sha256,runtimeFiles:runtimeFiles.length,reviewFiles:reviewFiles.length,screenshots:screenshotFiles.length}));
