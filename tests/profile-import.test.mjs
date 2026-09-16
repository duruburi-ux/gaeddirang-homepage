import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../admin/profile-import-model.js', import.meta.url), 'utf8');
const browserImporterSource = fs.readFileSync(new URL('../admin/docs-profile-import.js', import.meta.url), 'utf8');
const sandbox = { globalThis:{} };
vm.runInNewContext(source, sandbox);
const model = sandbox.globalThis.ProfileImportModel;

test('HWP CFB의 전체 경로에서 BodyText 섹션을 찾는다', () => {
  assert.match(browserImporterSource, /cfb\.FullPaths/);
  assert.match(browserImporterSource, /BodyText\[\\\/\]Section/);
  assert.match(browserImporterSource, /s\.file\.content/);
});

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
  assert.match(result.careers, /\[수상·자격\]/);
  assert.match(result.careers, /마음책방 운영/);
});

test('실제 HWP처럼 표가 풀려도 필명·경력·저서·강연을 나누고 개인정보를 버린다', () => {
  const result = model.parseProfile(`
장진호 / 필명 : 장두루
[ 감정 기록 글쓰기 / 창작 ] 장두루 (장진호)
두루 잘 살고 싶은 사람 ‘두루’라는 필명으로 활동하며,
마음 기록과 글쓰기 중심으로 창작 활동을 이어가고 있습니다.
학력
금오공과대학교 전자공학부 졸업 (2009~2017 년도)
연락처 : 010-4004-8396
인스타그램 https://www.instagram.com/from.duru
■ 직장 경력
기간 내용
2017.12~2023.05
삼성전자
연구원
■ 저서
2025.10 (공저) 에세이 <가족이어서 할 수 없는 이야기> - 가가77 페이지 출판사
2025.05 (단독) 에세이 <불안과 밤 산책> - 개띠랑 출판사
■ 대표 강연 이력
공공기관 및 교육청
기간 활동 내용 주최 주관 진행
2026.05~10
경기도화재단 경기상상캠퍼스 숲숲학교 숲인문학 프로그램 진행
`, ['장두루_강사프로필.hwp']);
  assert.equal(result.blockedReason, '');
  assert.equal(result.name, '장두루');
  assert.equal(result.headline, '감정 기록 글쓰기 · 창작');
  assert.match(result.intro, /마음 기록과 글쓰기/);
  assert.match(result.careers, /2017\.12~2023\.05 삼성전자 · 연구원/);
  assert.match(result.works, /가족이어서 할 수 없는 이야기/);
  assert.match(result.lectures, /경기상상캠퍼스/);
  assert.doesNotMatch(`${result.careers}\n${result.works}\n${result.lectures}`, /\[학력\].*\[학력\]/s);
  assert.doesNotMatch(JSON.stringify(result), /010-4004|instagram\.com/);
  assert.doesNotMatch(result.careers, /에세이/);
  assert.doesNotMatch(result.works, /\[학력\]/);
  assert.doesNotMatch(result.lectures, /기간 활동 내용/);
});

test('한글 HWP 전용 체크표시와 반복 날짜가 있는 실제 이력서 구조를 정리한다', () => {
  const result = model.parseProfile(`
捤獥 汤捯 湰灧 [감정 기록, 글쓰기, 창작] 장두루 (장진호)
두루 잘 살고 싶은 사람 ‘두루’라는 필명으로 활동하며,
마음 기록과 글쓰기 중심으로 창작 활동을 이어가고 있습니다.
▶ 이름: 장진호 / 필명: 장두루
▶ 학력 : 금오공과대학교 전자공학부 졸업 (2009~2017년도)
▶ 연락처 : 010-4004-8396
▶ 인스타그램 https://www.instagram.com/from.duru
 직장 경력
기간
내용
2017.12~2023.05
■ 삼성전자
▶ 연구원
 저서
2025.10
(공저) 에세이 <가족이어서 할 수 없는 이야기> - 가가77페이지 출판사
2025.05
(단독) 에세이 <불안과 밤 산책> - 개띠랑 출판사
 수상 / 자격 및 주요 프로젝트
2026.02
화성시민강사 취득
2025.12
기회소득 예술인 수기공모전 우수상
2025.12
심리분석사 2급
 대표 강연 이력
공공기관 및 교육청
기간
활동 내용
주최
주관
진행
2026.05~10
경기문화재단 경기상상캠퍼스 숲숲학교 숲인문학 프로그램 진행
<숲의 문장들, 봄>
경기문화재단 경기상상캠퍼스
2026.06
(예정)
마음을 글로 표현하는 감정 기록 워크숍
화성 송린이음터도서관
`);
  assert.equal(result.blockedReason, '');
  assert.equal(result.name, '장두루');
  assert.equal(result.headline, '감정 기록 · 글쓰기 · 창작');
  assert.match(result.works, /2025\.10 \(공저\) 에세이/);
  assert.equal((result.careers.match(/2025\.12/g) || []).length, 2);
  assert.match(result.lectures, /2026\.06 \(예정\) 마음을 글로 표현하는 감정 기록 워크숍/);
  assert.doesNotMatch(JSON.stringify(result), /010-4004|instagram\.com|捤獥/);
});

test('PDF 표의 강연·행사·모임과 기타 자격 머리말을 구분한다', () => {
  const result = model.parseProfile(`
이다솜
▶ 느껴온 감정을 기록하고 표현하는 <감정 기록가>
▶ 학력 : 한국대학교 문예창작학과 졸업
▶ 연락처 : 010-0000-0000
▶ 출판을 비롯한 다양한 콘텐츠를 제작하는 종합 콘텐츠 크리에이터로 활동
▶ 감정 기록 관련 도구(모든 감정 카드·불편 감정
카드 등)를 개발·활용하며 강연과 워크숍을 진행합니다.
 경력
기간 활동 내용
2020.01~2022.01
방송 프로그램 구성작가
 저서
2025.06
에세이 <이러나저러나 불편한 거야 불편한 건>
 강연 / 행사 / 모임
기간 활동 내용 주최 주관 진행
2026.01
감정을 다채롭게 표현하는 <내 마음을 톡! 감정 표현 교실> 강연
화성 다원이음터도서관
2025.11~12
사진을 보고 글로 기록하는 <포토북 글쓰기> 강연
화성 양감초등학교 & 양감작은도서관
 기타 자격
2025.03
화성시 시민강사 자격 인증
`);
  assert.equal(result.blockedReason, '');
  assert.equal(result.name, '이다솜');
  assert.equal(result.headline, '감정 기록가');
  assert.match(result.intro, /종합 콘텐츠 크리에이터/);
  assert.match(result.intro, /불편 감정 카드 등\)를 개발/);
  assert.match(result.works, /이러나저러나 불편한 거야/);
  assert.doesNotMatch(result.works, /감정 기록가/);
  assert.match(result.lectures, /다원이음터도서관/);
  assert.match(result.lectures, /양감초등학교/);
  assert.doesNotMatch(result.lectures, /시민강사 자격/);
  assert.match(result.careers, /\[수상·자격\].*시민강사 자격/);
  assert.doesNotMatch(JSON.stringify(result), /010-0000-0000/);
});

test('맥북처럼 이름과 강연 표제가 한 줄로 합쳐져도 파일명과 표제 앞부분으로 복구한다', () => {
  const result = model.parseProfile(`
느껴온 감정을 기록하고 표현하는 감정 기록가
경력
2020.01~2022.01 방송 프로그램 구성작가
저서
2025.06 에세이 <감정 기록의 시작>
강연 / 행사 / 모임 기간 활동 내용 주최 주관 진행
2026.01 감정 표현 교실 강연 화성 다원이음터도서관
`, ['이다솜 이력서 (260205).pdf']);
  assert.equal(result.blockedReason, '');
  assert.equal(result.name, '이다솜');
  assert.match(result.lectures, /다원이음터도서관/);
});

test('분류가 무너지면 자동 채움을 막는다', () => {
  const result = model.parseProfile(`
장진호 / 필명 : 장두루
학력
연락처 010-4004-8396
저서
대표 강연 이력
`);
  assert.match(result.blockedReason, /저서·작품|강연·출강|항목/);
});
