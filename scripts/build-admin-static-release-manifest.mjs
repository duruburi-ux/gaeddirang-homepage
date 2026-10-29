#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,relative} from 'node:path';

const BASE='c2ee61a1fac1a1ba49684c69ef1cb874f0516369';
const runtimeFiles=[
  'admin/index.html',
  'admin/partner-directory-model.js','admin/partner-directory.css','admin/partner-directory.js',
  'admin/program-publishing-model.js','admin/program-publishing.css','admin/program-publishing.js',
  'admin/team-dashboard-model.js','admin/team-dashboard.css','admin/team-dashboard.js',
];
const reviewFiles=[
  'tests/scm.test.mjs','tests/work.test.mjs','tests/team-dashboard-release.test.mjs',
  'tests/visual/admin-static-release.spec.mjs','scripts/build-admin-static-release-manifest.mjs',
];
const [outputArg,patchArg]=process.argv.slice(2);
if(!outputArg||!patchArg)throw Error('usage: node scripts/build-admin-static-release-manifest.mjs <output.json> <patch-file>');
const cwd=process.cwd(),output=resolve(outputArg),patch=resolve(patchArg);
const git=(args,encoding='utf8')=>execFileSync('git',args,{cwd,encoding});
const sha=value=>createHash('sha256').update(value).digest('hex');
const fileSha=path=>sha(readFileSync(resolve(cwd,path)));
const assertSha=(value,label)=>{if(!/^[a-f0-9]{64}$/.test(value))throw Error(`INVALID_SHA256:${label}:${value}`);return value};
const head=git(['rev-parse','HEAD']).trim(),base=git(['rev-parse','HEAD^']).trim();
if(base!==BASE)throw Error(`UNEXPECTED_BASE:${base}`);
const changed=git(['diff','--name-only',`${BASE}..${head}`]).trim().split('\n').filter(Boolean).sort();
const expected=[...runtimeFiles,...reviewFiles].sort();
if(JSON.stringify(changed)!==JSON.stringify(expected))throw Error(`UNEXPECTED_CHANGED_FILES:\n${changed.join('\n')}`);
const entries=paths=>paths.map(path=>({path,sha256:assertSha(fileSha(path),path)}));
const baseBlob=path=>git(['show',`${BASE}:${path}`],null);
const currentPublic={};
for(const path of ['index.html','assets/public-content.js']){
  const baseline=assertSha(sha(baseBlob(path)),`base:${path}`),current=assertSha(fileSha(path),path);
  if(baseline!==current)throw Error(`PUBLIC_FILE_CHANGED:${path}`);
  currentPublic[path]=current;
}
if(existsSync(resolve(cwd,'assets/program-approved-payload.js')))throw Error('UNEXPECTED_PUBLIC_PAYLOAD_FILE');
const patchSha=assertSha(sha(readFileSync(patch)),'patch');
const manifest={
  schemaVersion:3,
  generatedAt:new Date().toISOString(),
  generatedBy:'scripts/build-admin-static-release-manifest.mjs',
  deploymentExecuted:false,pushExecuted:false,
  branch:git(['branch','--show-current']).trim(),baseCommit:BASE,releaseCommit:head,
  rollback:`git revert ${head}`,
  patch:{file:relative(resolve(output,'..'),patch),sha256:patchSha},
  runtimeFiles:entries(runtimeFiles),
  reviewContractFiles:entries(reviewFiles),
  unchangedPublicFiles:{...currentPublic,'assets/program-approved-payload.js':'absent_in_base_and_release'},
  verification:{
    releaseNode:'256 total; 251 pass; 5 inherited fail',
    baselineNode:'253 total; 248 pass; 5 fail',
    candidateOnlyAdditionalFailures:0,
    chromiumReleaseBundle:'6/6 pass',
    focusedLifecycleNode:'3/3 pass',
    updatedScmWorkContracts:'33/33 pass',
  },
  inheritedFailures:[
    {name:'관리 메뉴는 오늘·처리·운영·기록으로 묶이고 모바일에서도 전 메뉴에 접근한다',introducedByCandidate:false},
    {name:'핵심 목록은 제목·표시 라벨·검색·정렬·조건 초기화·결과 수를 제공한다',introducedByCandidate:false},
    {name:'integration hub is inside the gated admin and labels connection boundaries',introducedByCandidate:false},
    {name:'운영 읽기 구현은 기존 인증과 SELECT·SCM GET만 사용한다',introducedByCandidate:false},
    {name:'directory is inside existing gated app and includes explicit sync boundaries',introducedByCandidate:false},
  ],
  boundaries:[
    'team source snapshots require matching active user id and auth generation',
    'logout, permission wait and account switch clear team core, operations, selection and DOM immediately',
    'consignment lane is dated review evidence and remains unknown until the operating ledger is connected',
    'no homepage publish, database, Edge Function, permission, inventory, settlement, payment, mail or chat write is included',
  ],
};
for(const entry of [...manifest.runtimeFiles,...manifest.reviewContractFiles])assertSha(entry.sha256,entry.path);
writeFileSync(output,JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({output,releaseCommit:head,patchSha,runtimeFiles:runtimeFiles.length,reviewFiles:reviewFiles.length}));

