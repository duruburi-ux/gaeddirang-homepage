import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../admin/profile-import-model.js', import.meta.url), 'utf8');
const sandbox = { globalThis:{} };
vm.runInNewContext(source, sandbox);
const model = sandbox.globalThis.ProfileImportModel;

test('강사 프로필의 명시된 항목을 양식 필드로 나눈다', () => {
  const result = model.parseProfile(`
성명: 이진이
한 줄 소개: 그림책과 감정 기록을 잇는 글쓰기 강사

강사 소개
그림책과 질문을 통해 자신의 마음을 기록하도록 돕습니다.

주요 경력
2024.03 ~ 현재 개띠랑유니버스 대표
2022.01 시민강사 과정 수료

저서·작품
2025.06 《마음의 문고리》 공저

주요 출강 이력
2026.05 수원시립도서관 · 감정 기록 워크숍 (4회)
`, ['기존프로필.pdf']);
  assert.equal(result.name, '이진이');
  assert.match(result.headline, /글쓰기 강사/);
  assert.match(result.intro, /마음을 기록/);
  assert.match(result.careers, /개띠랑유니버스 대표/);
  assert.match(result.works, /마음의 문고리/);
  assert.match(result.lectures, /수원시립도서관/);
  assert.equal(result.filled, 6);
});

test('표제 없는 이력도 저서와 출강을 구분하고 개인정보를 제외한다', () => {
  const result = model.parseProfile(`
박하늘 작가
어린이의 이야기를 발견하는 그림책 강사
010-1234-5678
hello@example.com
2023.03 ~ 현재 어린이책 연구회 운영
2025.02 《우리의 작은 숲》 그림책 출간
2026.04 별빛도서관 그림책 만들기 워크숍 3회
`);
  assert.equal(result.name, '박하늘');
  assert.doesNotMatch(JSON.stringify(result), /010-1234|hello@example/);
  assert.match(result.works, /작은 숲/);
  assert.match(result.lectures, /별빛도서관/);
});

test('학력과 자격은 경력 칸에 알아보기 쉬운 말머리로 합친다', () => {
  const result = model.parseProfile(`
이름: 김바다
학력
한국대학교 국어국문학과 졸업
자격증
독서지도사 1급
경력
2024.01 ~ 현재 마음책방 운영
`);
  assert.match(result.careers, /\[학력\]/);
  assert.match(result.careers, /\[자격·수료\]/);
  assert.match(result.careers, /마음책방 운영/);
});
