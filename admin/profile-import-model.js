/* 강사 프로필 원문을 홈페이지 입력칸에 맞게 나누는 순수 모델. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.ProfileImportModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const PRIVATE_LABEL_RE = /(생년월일|주민등록|휴대폰|핸드폰|연락처|전화번호|전화|이메일|e-?mail|주소|계좌|은행|인스타(?:그램)?|sns|사진)/i;
  const PHONE_RE = /(?:^|\D)(?:\+?82[- .]?)?0(?:2|1[016789]|[3-6][1-5])[- .]?\d{3,4}[- .]?\d{4}(?:\D|$)/;
  const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
  const URL_RE = /(?:https?:\/\/|www\.|instagram\.com|facebook\.com|blog\.naver\.com)/i;
  const ROLE_RE = /(강사|작가|저자|기획자|연구자|교육가|교사|대표|디렉터|퍼실리테이터|상담사|예술가|활동가|기록가|크리에이터|글쓰기|창작)/;
  const LECTURE_RE = /(출강|강의|강연|특강|워크숍|워크샵|수업|교육|프로그램|도서관|학교|센터|문화재단|문화원|복지관|청소년|평생학습|기관)/;
  const WORK_RE = /(저서|출간|출판|작품|공저|단독|전자책|에세이|시집|소설|ISBN|《|〈|『|<[^>]+>)/i;
  const DATE_AT_START_RE = /^(?:19|20)\d{2}(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?/;
  const DATE_ONLY_RE = /^(?:19|20)\d{2}(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?\s*(?:(?:~|～|-|–|—)\s*(?:(?:19|20)?\d{2})?(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?\s*(?:현재)?)?$/;
  const BULLET_RE = /^\s*(?:(?:[-–—•·▪■□◆◇▶▷✓✔▣▢▰▮▯▌●○❖※*]+)|(?:\d{1,2}|[가-하])[.)])\s*/;
  const TABLE_NOISE_RE = /^(?:기간|내용|목록|활동|활동\s*내용|기관|주최|주관|진행|비고|연도|날짜|구분|직장\s*경력|대표\s*강연\s*이력|공공기관\s*및\s*교육청|학교\s*및\s*도서관|문화체육관광부.*주관|저서\s*목록|경력\s*내용|체험\s*부스.*외부\s*활동|방송\s*및\s*인터뷰|운영\s*가능한\s*강연.*프로그램)$/;

  const SECTION_ALIASES = [
    ['name', /^(?:성명|이름|강사명|프로필명)$/i],
    ['headline', /^(?:한\s*줄\s*소개|직함|타이틀|분야|전문\s*분야|강의\s*분야|활동\s*분야)$/i],
    ['intro', /^(?:소개|소개글|자기소개|강사\s*소개|프로필|profile|about)$/i],
    ['careers', /^(?:경력|직장\s*경력|주요\s*경력|활동\s*경력|이력|약력|프로필\s*이력)$/i],
    ['education', /^(?:학력|전공)$/i],
    ['certificates', /^(?:자격|기타\s*자격|자격증|수료|인증|수상\s*[/·ㆍ]?\s*자격\s*및\s*주요\s*프로젝트)$/i],
    ['works', /^(?:저서|저서\s*목록|저서\s*및\s*작품|저서[·ㆍ]\s*작품|작품|출간|출판|저작)$/i],
    ['lectures', /^(?:출강|강연\s*[/·ㆍ]\s*행사\s*[/·ㆍ]\s*모임|대표\s*(?:강연|강의)\s*이력|주요\s*출강(?:\s*이력)?|출강\s*이력|강의\s*경력|강의\s*이력|강연\s*이력|교육\s*이력)$/i],
  ];

  function cleanText(value){
    return String(value || '').replace(/^\uFEFF/, '').replace(/[\u0000\u200B\u200C\u200D\u2060]/g, '')
      .replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/[\t ]+/g, ' ')
      .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function plainLine(value){
    return String(value || '').replace(BULLET_RE, '')
      .replace(/^[^0-9A-Za-z가-힣\[【(<《〈『~～–—]+/u, '')
      .replace(/^[|｜]+|[|｜]+$/g, '').trim();
  }
  function normalizedHeading(value){
    return plainLine(value).replace(/^[\[\]【】()（）\s]+|[\[\]【】()（）\s:：·ㆍ\-–—_/]+$/g, '').trim();
  }
  function keyForHeading(value){
    const s = normalizedHeading(value).replace(/^\d+\s*[.)]\s*/, '').trim();
    if(s.length > 28) return '';
    const hit = SECTION_ALIASES.find(([, re]) => re.test(s));
    return hit ? hit[0] : '';
  }
  function isPrivate(line){
    const s = String(line || '');
    return PRIVATE_LABEL_RE.test(s) || PHONE_RE.test(s) || EMAIL_RE.test(s) || URL_RE.test(s);
  }
  function isNoise(line){
    const s = plainLine(line).replace(/[|｜:：]+/g, ' ').replace(/\s+/g, ' ').trim();
    if(!s || TABLE_NOISE_RE.test(s) || /^\d+\s*[-–—]\s*$/.test(s) || /^\d+[.)]\s*(?:지역서점|행사|문화센터)/.test(s)) return true;
    const words = s.split(' ');
    return words.length <= 6 && words.every(word => TABLE_NOISE_RE.test(word));
  }
  function unique(lines){
    const seen = new Set();
    return lines.map(plainLine).filter(Boolean).filter(line => {
      const k = line.replace(/\s+/g, '').toLowerCase();
      if(!k || seen.has(k)) return false;
      seen.add(k); return true;
    });
  }
  function dedupeAdjacent(lines){
    let previous = '';
    return lines.map(plainLine).filter(Boolean).filter(line => {
      const key = line.replace(/\s+/g, '').toLowerCase();
      if(key === previous) return false;
      previous = key;
      return true;
    });
  }
  function mergeOpenParentheses(lines){
    const out = [];
    (lines || []).forEach(raw => {
      const line = plainLine(raw);
      if(!line) return;
      const previous = out[out.length-1] || '';
      const opens = (previous.match(/\(/g) || []).length;
      const closes = (previous.match(/\)/g) || []).length;
      if(out.length && opens > closes) out[out.length-1] = `${previous} ${line}`.trim();
      else out.push(line);
    });
    return out;
  }
  function inlineField(line){
    const m = plainLine(line).match(/^([^:：]{1,22})\s*[:：]\s*(.+)$/);
    if(!m) return null;
    const key = keyForHeading(m[1]);
    return key ? { key, value:m[2].trim() } : null;
  }
  function headingWithValue(line){
    const s = plainLine(line);
    for(const [key, re] of SECTION_ALIASES){
      const m = s.match(/^(.{1,28}?)(?:\s*[:：]\s*|\s{2,})(.+)$/);
      if(m && re.test(normalizedHeading(m[1]))) return { key, value:m[2].trim() };
    }
    return null;
  }
  function splitSections(text){
    const sections = { loose:[] };
    let current = 'loose';
    cleanText(text).split('\n').forEach(raw => {
      const line = plainLine(raw);
      if(!line) return;
      const combinedLecture = line.match(/^(?:강연\s*[/·ㆍ]\s*행사\s*[/·ㆍ]\s*모임|대표\s*(?:강연|강의)\s*이력|주요\s*출강(?:\s*이력)?)\s+(.+)$/i);
      if(combinedLecture){ current = 'lectures'; (sections[current] ||= []).push(combinedLecture[1]); return; }
      const inline = inlineField(line) || headingWithValue(line);
      if(inline){ current = inline.key; (sections[current] ||= []).push(inline.value); return; }
      const heading = keyForHeading(line);
      if(heading){ current = heading; sections[current] ||= []; return; }
      (sections[current] ||= []).push(line);
    });
    Object.keys(sections).forEach(k => sections[k] = dedupeAdjacent(sections[k]));
    return sections;
  }
  function extractName(lines, explicit){
    const candidates = [...(explicit || []), ...lines.slice(0, 14)];
    for(const raw of candidates){
      const line = plainLine(raw);
      let m = line.match(/^([가-힣]{2,6})\s*[/|]\s*(?:필명\s*[:：]?\s*)?([가-힣]{2,8})$/);
      if(m) return m[2];
      m = line.match(/^(?:본명\s*[:：]?\s*)?([가-힣]{2,6}).*?필명\s*[:：]?\s*([가-힣]{2,8})/);
      if(m) return m[2];
      const simple = line.replace(/^(?:성명|이름|강사명)\s*[:：]?\s*/, '').replace(/\s*(?:강사|작가|저자|선생님)\s*$/, '').trim();
      if(/^[가-힣]{2,8}$/.test(simple) && !keyForHeading(simple) && !/^(프로필|강사소개|자기소개|주요경력|직장경력)$/.test(simple)) return simple;
    }
    return '';
  }
  function extractNameFromFilenames(filenames){
    for(const raw of Array.isArray(filenames) ? filenames : []){
      let base = String(raw || '').replace(/\.[^.]+$/, '').replace(/[\[【(（][^\]】)）]*[\]】)）]/g, ' ');
      base = base.replace(/(?:강사\s*)?프로필|이력서|경력|전체|총정리|최종|사본|복사본/gi, ' ').replace(/[\d_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      const names = base.match(/[가-힣]{2,8}/g) || [];
      const candidate = names.find(x => !/^(강사|프로필|이력|경력|전체|총정리|최종|대리림|도서관)$/.test(x));
      if(candidate) return candidate;
    }
    return '';
  }
  function extractBracketHeadline(lines){
    for(const raw of lines.slice(0, 18)){
      const m = String(raw).match(/[\[【]\s*([^\]】]{3,48})\s*[\]】]/) || String(raw).match(/<\s*([^>]{3,48})\s*>/);
      if(!m || PRIVATE_LABEL_RE.test(m[1])) continue;
      const value = m[1].replace(/\s*[,/|]\s*/g, ' · ').replace(/\s+/g, ' ').trim();
      if(ROLE_RE.test(value)) return value;
    }
    return '';
  }
  function safeLines(lines){ return (lines || []).map(plainLine).filter(line => line && !isPrivate(line) && !isNoise(line)); }
  function compactEntries(lines, maxTail=2, limit=0){
    const source = safeLines(lines);
    const out = [];
    for(let i=0; i<source.length; i++){
      let line = source[i];
      if(DATE_ONLY_RE.test(line)){
        if(/[~～–—-]\s*$/.test(line) && i+1 < source.length && /^(?:19|20)\d{2}/.test(source[i+1])) line += source[++i];
        if(i+1 < source.length && /^\s*(?:~|～|-|–|—)\s*(?:현재|(?:19|20)\d{2})/.test(source[i+1])) line += source[++i];
        if(i+1 < source.length && /^\((?:예정|진행|종료)\)$/.test(source[i+1])) line += ` ${source[++i]}`;
        const tail = [];
        while(i+1 < source.length && !DATE_ONLY_RE.test(source[i+1])){
          const next = source[++i];
          if(tail.length < maxTail) tail.push(next);
        }
        line = tail.length ? `${line} ${tail[0]}${tail.slice(1).map(x => ` · ${x}`).join('')}` : line;
      }
      out.push(line.replace(/\s+/g, ' ').trim());
      if(limit && out.length >= limit) break;
    }
    return unique(out);
  }
  function joinLines(lines){ return unique(lines).join('\n'); }
  function recentFirst(lines){
    return lines.map((line, index) => {
      const m = line.match(/^(\d{4})(?:\s*[.\-/]\s*(\d{1,2}))?/);
      return { line, index, key:Number(m?.[1] || 0) * 100 + Number(m?.[2] || 0) };
    })
      .sort((a,b) => b.key - a.key || a.index - b.index).map(x => x.line);
  }
  function takeIntro(sections, loose, identityLines, spillover=[]){
    const explicit = safeLines(sections.intro || []);
    if(explicit.length) return explicit.join('\n');
    const candidates = [
      ...loose.map(line => ({line, spillover:false})),
      ...spillover.map(line => ({line, spillover:true})),
    ];
    return safeLines(candidates.filter(({line, spillover:isSpillover}) =>
      !identityLines.includes(line) && line.length >= 18 && line.length <= 260 && !DATE_AT_START_RE.test(line) &&
      (isSpillover || !WORK_RE.test(line)) && !(LECTURE_RE.test(line) && /\d|회|년/.test(line))
    ).map(x => x.line)).slice(0, 3).join('\n');
  }
  function parseProfile(text, filenames){
    const cleaned = cleanText(text);
    const sections = splitSections(cleaned);
    const all = cleaned.split('\n').map(plainLine).filter(Boolean);
    const loose = safeLines(sections.loose || []);
    const name = extractName(all, sections.name) || extractNameFromFilenames(filenames);
    const bracketHeadline = extractBracketHeadline(all);
    const explicitHeadline = safeLines(sections.headline || [])[0] || '';
    const headline = explicitHeadline || bracketHeadline || loose.find(x => x.length <= 58 && ROLE_RE.test(x) && x !== name && !/[()（）]/.test(x)) || '';
    const identityLines = all.filter(x => (name && x.includes(name)) || (headline && x.includes(headline)));
    const educationSource = mergeOpenParentheses(safeLines(sections.education || []));
    const education = compactEntries(educationSource.filter(line => /학과|전공|학위|졸업|재학|수료|대학교|대학원/.test(line)), 1);
    const educationSpillover = educationSource.filter(line => !/학과|전공|학위|졸업|재학|수료|대학교|대학원/.test(line));
    const intro = takeIntro(sections, loose, identityLines, educationSpillover);

    const careers = compactEntries(sections.careers || [], 2, 4);
    const certificates = compactEntries(sections.certificates || [], 1, 3);
    if(education.length) careers.unshift(`[학력] ${education.join(' · ')}`);
    if(certificates.length) careers.push(...certificates.map(x => `[수상·자격] ${x}`));
    const works = compactEntries(sections.works || [], 1, 7);
    const lectures = recentFirst(compactEntries(sections.lectures || [], 3, 8));

    loose.forEach(line => {
      if(identityLines.includes(line) || intro.split('\n').includes(line) || isPrivate(line) || isNoise(line)) return;
      if(LECTURE_RE.test(line) && (DATE_AT_START_RE.test(line) || /\d+\s*회|기관|도서관|학교|센터|재단/.test(line))) lectures.push(line);
      else if(WORK_RE.test(line)) works.push(line);
      else if(DATE_AT_START_RE.test(line) || /재직|근무|운영|대표|수료|자격|전공|졸업|활동/.test(line)) careers.push(line);
    });

    const result = {
      name, headline, intro,
      careers:joinLines(safeLines(careers)), works:joinLines(safeLines(works)), lectures:joinLines(safeLines(lectures)),
      sourceFiles:Array.isArray(filenames) ? filenames.filter(Boolean) : [], warnings:[]
    };
    const output = [result.name,result.headline,result.intro,result.careers,result.works,result.lectures].join('\n');
    const blockers = [];
    if(!result.name || !/^[가-힣A-Za-z][가-힣A-Za-z\s]{1,19}$/.test(result.name) || /[/|:：]/.test(result.name)) blockers.push('이름을 확실히 구분하지 못했어요');
    if(isPrivate(output)) blockers.push('연락처나 주소 같은 개인정보가 결과에 섞여 있어요');
    if(/(?:저서|출간|출판|저작|작품)/.test(cleaned) && !result.works) result.warnings.push('저서·작품은 자동 구분하지 못했어요');
    if(/(?:대표\s*)?(?:강연|강의|출강)\s*(?:이력|경력)?/.test(cleaned) && !result.lectures) result.warnings.push('강연·출강은 자동 구분하지 못했어요');
    if(!result.intro) result.warnings.push('소개글을 찾지 못했어요');
    if(!result.careers && !result.works && !result.lectures) blockers.push('이력을 항목별로 나누지 못했어요');
    result.filled = ['name','headline','intro','careers','works','lectures'].filter(k => result[k]).length;
    if(result.filled < 3) blockers.push('자동으로 채울 수 있는 항목이 너무 적어요');
    result.blockedReason = unique(blockers).join(' · ');
    return result;
  }

  return { cleanText, splitSections, parseProfile };
});
