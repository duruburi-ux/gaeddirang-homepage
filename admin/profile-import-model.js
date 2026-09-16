/* 강사 프로필 원문을 홈페이지 입력칸에 맞게 나누는 순수 모델. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.ProfileImportModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const PRIVATE_RE = /(생년월일|주민등록|휴대폰|핸드폰|연락처|전화|이메일|e-?mail|주소|계좌|은행|사진)/i;
  const ROLE_RE = /(강사|작가|저자|기획자|연구자|교육가|교사|대표|디렉터|퍼실리테이터|상담사|예술가|활동가)/;
  const LECTURE_RE = /(출강|강의|강연|특강|워크숍|워크샵|수업|교육|프로그램|도서관|학교|센터|문화재단|문화원|복지관|청소년|평생학습|기관)/;
  const WORK_RE = /(저서|출간|출판|작품|공저|전자책|에세이|시집|소설|ISBN|《|〈|『)/i;
  const DATE_RE = /^(?:19|20)\d{2}(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?/;
  const BULLET_RE = /^\s*(?:[-–—•·▪■□◆◇▶▷✓✔]|\d{1,2}[.)](?!\d)|[가-하][.)])\s*/;

  const SECTION_ALIASES = [
    ['name', /^(?:성명|이름|강사명|프로필명)$/i],
    ['headline', /^(?:한\s*줄\s*소개|직함|타이틀|분야|전문\s*분야|강의\s*분야|활동\s*분야)$/i],
    ['intro', /^(?:소개|소개글|자기소개|강사\s*소개|프로필|profile|about)$/i],
    ['careers', /^(?:경력|주요\s*경력|활동\s*경력|이력|약력|프로필\s*이력)$/i],
    ['education', /^(?:학력|교육|전공)$/i],
    ['certificates', /^(?:자격|자격증|수료|인증)$/i],
    ['works', /^(?:저서|저서\s*및\s*작품|저서·작품|작품|출간|출판|저작)$/i],
    ['lectures', /^(?:출강|주요\s*출강(?:\s*이력)?|출강\s*이력|강의\s*경력|강의\s*이력|강연\s*이력|교육\s*이력)$/i],
  ];

  function cleanText(value){
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .replace(/[\u0000\u200B\u200C\u200D\u2060]/g, '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n?/g, '\n')
      .replace(/[\t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function plainLine(value){
    return String(value || '').replace(BULLET_RE, '').replace(/^[|｜]+|[|｜]+$/g, '').trim();
  }
  function keyForHeading(value){
    const s = plainLine(value).replace(/[\s:：·ㆍ\-–—_/]+$/g, '').replace(/^\d+\s*[.)]\s*/, '').trim();
    if(s.length > 28) return '';
    const hit = SECTION_ALIASES.find(([, re]) => re.test(s));
    return hit ? hit[0] : '';
  }
  function unique(lines){
    const seen = new Set();
    return lines.map(plainLine).filter(Boolean).filter(line => {
      const k = line.replace(/\s+/g, '').toLowerCase();
      if(!k || seen.has(k)) return false;
      seen.add(k); return true;
    });
  }
  function inlineField(line){
    const m = plainLine(line).match(/^([^:：]{1,22})\s*[:：]\s*(.+)$/);
    if(!m) return null;
    const key = keyForHeading(m[1]);
    return key ? { key, value:m[2].trim() } : null;
  }
  function splitSections(text){
    const sections = { loose:[] };
    let current = 'loose';
    cleanText(text).split('\n').forEach(raw => {
      const line = plainLine(raw);
      if(!line) return;
      const inline = inlineField(line);
      if(inline){ (sections[inline.key] ||= []).push(inline.value); current = inline.key; return; }
      const heading = keyForHeading(line);
      if(heading){ current = heading; sections[current] ||= []; return; }
      (sections[current] ||= []).push(line);
    });
    Object.keys(sections).forEach(k => sections[k] = unique(sections[k]));
    return sections;
  }
  function likelyName(lines){
    for(const raw of lines.slice(0, 14)){
      const line = plainLine(raw).replace(/\s*(?:강사|작가|저자|선생님)\s*$/, '').trim();
      if(/^[가-힣]{2,5}$/.test(line) && !/^(프로필|강사소개|자기소개|주요경력)$/.test(line)) return line;
    }
    return '';
  }
  function joinLines(lines){ return unique(lines).join('\n'); }
  function takeIntro(sections, loose){
    const explicit = unique(sections.intro || []);
    if(explicit.length) return explicit.join('\n');
    return unique(loose.filter(line =>
      line.length >= 18 && line.length <= 260 && !DATE_RE.test(line) && !PRIVATE_RE.test(line) &&
      !WORK_RE.test(line) && !(LECTURE_RE.test(line) && /\d|회|년/.test(line))
    )).slice(0, 3).join('\n');
  }
  function parseProfile(text, filenames){
    const cleaned = cleanText(text);
    const sections = splitSections(cleaned);
    const all = cleaned.split('\n').map(plainLine).filter(Boolean);
    const loose = unique(sections.loose || []).filter(x => !PRIVATE_RE.test(x));

    const name = plainLine((sections.name || [])[0] || likelyName(all));
    const explicitHeadline = plainLine((sections.headline || [])[0] || '');
    const simpleRole = name ? new RegExp(`^${name}\\s*(?:강사|작가|저자|선생님)?$`) : /^$/;
    const headline = explicitHeadline || loose.find(x => x.length <= 48 && ROLE_RE.test(x) && x !== name && !simpleRole.test(x)) || '';
    const intro = takeIntro(sections, loose.filter(x => x !== name && x !== headline));

    const careers = [...(sections.careers || [])];
    (sections.education || []).forEach(x => careers.push(`[학력] ${x}`));
    (sections.certificates || []).forEach(x => careers.push(`[자격·수료] ${x}`));
    const works = [...(sections.works || [])];
    const lectures = [...(sections.lectures || [])];

    loose.forEach(line => {
      if(line === name || line === headline || intro.split('\n').includes(line) || PRIVATE_RE.test(line)) return;
      if(LECTURE_RE.test(line) && (DATE_RE.test(line) || /\d+\s*회|기관|도서관|학교|센터|재단/.test(line))) lectures.push(line);
      else if(WORK_RE.test(line)) works.push(line);
      else if(DATE_RE.test(line) || /재직|근무|운영|대표|수료|자격|전공|졸업|활동/.test(line)) careers.push(line);
    });

    const result = {
      name, headline, intro,
      careers:joinLines(careers), works:joinLines(works), lectures:joinLines(lectures),
      sourceFiles:Array.isArray(filenames) ? filenames.filter(Boolean) : [], warnings:[]
    };
    if(!result.name) result.warnings.push('이름을 찾지 못했어요');
    if(!result.intro) result.warnings.push('소개글을 찾지 못했어요');
    if(!result.careers && !result.works && !result.lectures) result.warnings.push('이력을 항목별로 나누지 못했어요');
    result.filled = ['name','headline','intro','careers','works','lectures'].filter(k => result[k]).length;
    return result;
  }

  return { cleanText, splitSections, parseProfile };
});
