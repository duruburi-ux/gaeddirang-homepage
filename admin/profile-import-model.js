/* 강사 프로필 원문을 홈페이지 입력칸에 맞게 나누는 순수 모델. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.ProfileImportModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';

  const PRIVATE_LABEL_RE = /(생년월일|주민등록|휴대폰|핸드폰|연락처|전화번호|전화|이메일|e-?mail|주소|계좌|은행|인스타(?:그램)?|sns)/i;
  const PHOTO_LABEL_RE = /^(?:증명\s*)?사진\s*[:：]?$/;
  const PHONE_RE = /(?:^|\D)(?:\+?82[- .]?)?0(?:2|1[016789]|[3-6][1-5])[- .]?\d{3,4}[- .]?\d{4}(?:\D|$)/;
  const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
  const URL_RE = /(?:https?:\/\/|www\.|instagram\.com|facebook\.com|blog\.naver\.com)/i;
  const ROLE_RE = /(강사|작가|저자|기획자|연구자|교육가|교사|대표|디렉터|퍼실리테이터|상담사|예술가|활동가|기록가|크리에이터|글쓰기|창작)/;
  const LECTURE_RE = /(출강|강의|강연|특강|워크숍|워크샵|수업|교육|프로그램|도서관|학교|센터|문화재단|문화원|복지관|청소년|평생학습|기관)/;
  const WORK_RE = /(저서|출간|출판|작품|공저|단독|전자책|에세이|시집|소설|ISBN|《|〈|『|<[^>]+>)/i;
  const DATE_AT_START_RE = /^(?:19|20)\d{2}(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?/;
  const DATE_ONLY_RE = /^(?:19|20)\d{2}(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?\s*(?:(?:~|～|-|–|—)\s*(?:(?:19|20)?\d{2})?(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?\s*(?:현재)?)?$/;
  const BULLET_RE = /^\s*(?:(?:[-–—•·▪■□◆◇▶▷✓✔▣▢▰▮▯▌●○❖※*]+)|(?:\d{1,2}|[가-하])[.)])\s*/;
  const TABLE_NOISE_RE = /^(?:기간|내용|목록|활동|모임|강연|수업|교육|저서|작품|프로그램|활동\s*내용|기관|장소|주최|주관|진행|비고|연도|날짜|구분|직무\s*및\s*직급|취득일|자격증\s*[/·]?\s*면허증|등급|발행처|직장\s*경력|대표\s*강연\s*이력|공공기관\s*및\s*교육청|학교\s*및\s*도서관|문화체육관광부.*주관|저서\s*목록|경력\s*내용|체험\s*부스.*외부\s*활동|방송\s*및\s*인터뷰|운영\s*가능한\s*강연.*프로그램)$/;

  const SECTION_ALIASES = [
    ['name', /^(?:성명|이름|강사명|프로필명)$/i],
    ['headline', /^(?:한\s*줄\s*소개|직함|타이틀|분야|전문\s*분야|강의\s*분야|활동\s*분야)$/i],
    ['intro', /^(?:소개|소개글|자기소개|강사\s*소개|프로필|profile|about)$/i],
    ['careers', /^(?:경력|직장\s*경력|방송\s*작가\s*경력|방송\s*디자이너\s*경력|주요\s*경력|활동\s*경력|이력|약력|프로필\s*이력)$/i],
    ['education', /^(?:학력|전공)$/i],
    ['certificates', /^(?:자격|기타\s*자격|자격증|수료|인증|수상\s*[/·ㆍ]?\s*자격\s*및\s*주요\s*프로젝트)$/i],
    ['works', /^(?:저서|저서\s*목록|저서\s*및\s*작품|저서[·ㆍ]\s*작품|작품|출간|출판|저작)$/i],
    ['lectures', /^(?:출강|강연\s*(?:[/·ㆍ]\s*(?:행사\s*[/·ㆍ]\s*)?)?모임|강연\s*[/·ㆍ]\s*행사\s*[/·ㆍ]\s*모임|외부\s*활동|대표\s*(?:강연|강의)\s*이력|주요\s*출강(?:\s*이력)?|출강\s*이력|강의\s*경력|강의\s*이력|강연\s*이력|교육\s*이력)$/i],
    ['other', /^(?:북페어|인터뷰|방송\s*및\s*인터뷰|전시\s*[,·ㆍ/]?\s*팝업스토어|체험\s*부스\s*진행\s*및\s*외부\s*활동|사용\s*소프트웨어|기타(?:\s*\([^)]*\))?)$/i],
  ];

  function cleanText(value){
    return String(value || '').normalize('NFC').replace(/^\uFEFF/, '').replace(/[\u0000\u200B\u200C\u200D\u2060]/g, '')
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
    return PRIVATE_LABEL_RE.test(s) || PHOTO_LABEL_RE.test(plainLine(s)) || PHONE_RE.test(s) || EMAIL_RE.test(s) || URL_RE.test(s);
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
      let bracketed = line.match(/[\[【]\s*([가-힣]{2,8})\s*(?:작가|강사|저자|크리에이터)\s*[\]】]/);
      if(bracketed && !isNoise(bracketed[1])) return bracketed[1];
      let m = line.match(/^([가-힣]{2,6})\s*[/|]\s*(?:필명\s*[:：]?\s*)?([가-힣]{2,8})$/);
      if(m) return m[2];
      m = line.match(/^(?:본명\s*[:：]?\s*)?([가-힣]{2,6}).*?필명\s*[:：]?\s*([가-힣]{2,8})/);
      if(m) return m[2];
      const simple = line.replace(/^(?:성명|이름|강사명)\s*[:：]?\s*/, '').replace(/\s*(?:강사|작가|저자|선생님)\s*$/, '').trim();
      if(/^[가-힣]{2,8}$/.test(simple) && !keyForHeading(simple) && !isNoise(simple) && !ROLE_RE.test(simple) && !/^(프로필|강사소개|자기소개|주요경력|직장경력)$/.test(simple)) return simple;
    }
    return '';
  }
  function extractNameFromFilenames(filenames){
    for(const raw of Array.isArray(filenames) ? filenames : []){
      let base = String(raw || '').normalize('NFC').replace(/\.[^.]+$/, '').replace(/[\[【(（][^\]】)）]*[\]】)）]/g, ' ');
      base = base.replace(/(?:강사\s*)?프로필|이력서|경력|전체|총정리|최종|사본|복사본/gi, ' ').replace(/[\d_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      const names = base.match(/[가-힣]{2,8}/g) || [];
      const candidate = [...names].reverse().find(x => !ROLE_RE.test(x) && !/^(기존|작성본|강사|프로필|이력|경력|전체|총정리|최종|사본|복사본|대리림|도서관|포트폴리오)$/.test(x));
      if(candidate) return candidate;
    }
    return '';
  }
  function extractHeadlineFromFilenames(filenames, name){
    for(const raw of Array.isArray(filenames) ? filenames : []){
      let base = String(raw || '').normalize('NFC').replace(/\.[^.]+$/, '').replace(/[\[【(（][^\]】)）]*[\]】)）]/g, ' ');
      base = base.replace(/(?:강사\s*)?프로필|이력서|경력|전체|총정리|최종|사본|복사본/gi, ' ').replace(/[\d_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if(name) base = base.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), ' ').replace(/\s+/g, ' ').trim();
      const role = (base.match(/[가-힣A-Za-z ]{2,30}/g) || []).map(x => x.trim()).find(x => ROLE_RE.test(x));
      if(role && !/^(?:작가|강사|저자|크리에이터)$/.test(role)) return role.replace(/감정\s*기록가/g, '감정 기록가');
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
  function inferHeadline(lines, name){
    for(const raw of lines.slice(0, 100)){
      const line = plainLine(raw);
      if(!line || isPrivate(line) || (name && line === name)) continue;
      const quoted = line.match(/[<'‘'“"]\s*([^>'’'”"]{2,32}(?:기록가|작가|강사|디자이너|크리에이터))\s*[>'’'”"]/);
      if(quoted) return quoted[1].replace(/내\s+/g, '').replace(/감정\s*기록가/g, '감정 기록가').trim();
      if(/콘텐츠\s*크리에이터/.test(line)) return '콘텐츠 크리에이터';
      if(/빵\s*기록가/.test(line)) return '빵 기록가 · 콘텐츠 크리에이터';
      if(/방송\s*작가/.test(line) && !DATE_AT_START_RE.test(line)) return '방송작가 · 콘텐츠 크리에이터';
      if(/방송\s*디자이너/.test(line) && !DATE_AT_START_RE.test(line)) return '방송 디자이너 · 콘텐츠 크리에이터';
    }
    return '';
  }
  function safeLines(lines){ return (lines || []).map(plainLine).filter(line => line && !isPrivate(line) && !isNoise(line)); }
  function compactEntries(lines, maxTail=2, limit=0){
    const source = [];
    const rawSource = safeLines(lines);
    for(let i=0; i<rawSource.length; i++){
      const year = rawSource[i].match(/^((?:19|20)\d{2})\.?$/);
      const months = rawSource[i+1]?.match(/^(\d{1,2})월\s*(?:~|～|-|–|—)\s*(\d{1,2})월$/);
      if(year && months){ source.push(`${year[1]}.${months[1].padStart(2,'0')}~${year[1]}.${months[2].padStart(2,'0')}`); i++; }
      else source.push(rawSource[i]);
    }
    const dateAnchors = source.map((line, index) => DATE_AT_START_RE.test(line) ? index : -1).filter(index => index >= 0);
    if(dateAnchors.length >= 2 && dateAnchors[0] > 0){
      const groups = dateAnchors.map(() => []);
      source.forEach((line, index) => {
        let nearest = 0, distance = Infinity;
        dateAnchors.forEach((anchor, anchorIndex) => {
          const nextDistance = Math.abs(index-anchor);
          if(nextDistance < distance){ nearest = anchorIndex; distance = nextDistance; }
        });
        groups[nearest].push({ line, index });
      });
      const centered = groups.map((group, groupIndex) => {
        const anchorIndex = dateAnchors[groupIndex];
        const anchor = group.find(item => item.index === anchorIndex)?.line || '';
        const date = anchor.match(/^((?:19|20)\d{2}(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?(?:\s*(?:~|～|–|—)\s*(?:(?:19|20)?\d{2})?(?:\s*[.\-/년]\s*\d{1,2})?(?:\s*[.\-/월]\s*\d{1,2})?)?)(?:\s+|$)(.*)$/);
        const before = group.filter(item => item.index < anchorIndex).map(item => item.line);
        const after = group.filter(item => item.index > anchorIndex).map(item => item.line);
        const details = [...before, date?.[2] || '', ...after].filter(Boolean).slice(0, maxTail);
        return `${date?.[1] || anchor}${details.length ? ` ${details[0]}${details.slice(1).map(x => ` · ${x}`).join('')}` : ''}`.replace(/\s+/g, ' ').trim();
      });
      const repaired = unique(centered);
      return limit ? repaired.slice(0, limit) : repaired;
    }
    // 표가 열 단위로 풀리면 날짜가 전부 나온 뒤 활동 내용이 한꺼번에 나온다.
    // 연속 날짜 열과 같은 수의 내용 열이 보이면 같은 행끼리 다시 짝지어 준다.
    let dateColumnSize = 0;
    while(dateColumnSize < source.length && DATE_ONLY_RE.test(source[dateColumnSize])) dateColumnSize++;
    if(dateColumnSize >= 2){
      const details = source.slice(dateColumnSize).filter(line => !DATE_ONLY_RE.test(line));
      if(details.length >= dateColumnSize){
        const paired = source.slice(0, dateColumnSize).map((date, index) => `${date} ${details[index]}`.replace(/\s+/g, ' ').trim());
        const remainder = details.slice(dateColumnSize);
        const repaired = unique([...paired, ...remainder]);
        return limit ? repaired.slice(0, limit) : repaired;
      }
    }
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
      !identityLines.includes(line) && (line.length >= 18 || (line.length >= 10 && ROLE_RE.test(line) && /(활동|제작|진행|합니다|있습니다)/.test(line))) && line.length <= 260 && !DATE_AT_START_RE.test(line) &&
      (isSpillover || !WORK_RE.test(line) || /(활동|제작|진행|크리에이터|작가로|디자이너로)/.test(line)) &&
      !(LECTURE_RE.test(line) && /\d|회|년/.test(line))
    ).map(x => x.line)).slice(0, 3).join('\n');
  }
  function parseProfile(text, filenames){
    const cleaned = cleanText(text);
    const sections = splitSections(cleaned);
    const all = cleaned.split('\n').map(plainLine).filter(Boolean);
    const loose = safeLines(sections.loose || []);
    const filenameName = extractNameFromFilenames(filenames);
    const bodyName = extractName(all, sections.name);
    const name = filenameName || bodyName;
    let bracketHeadline = extractBracketHeadline(sections.loose || all);
    if(name && new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:작가|강사|저자)$`).test(bracketHeadline)) bracketHeadline = '';
    const explicitHeadline = safeLines(sections.headline || [])[0] || '';
    const filenameHeadline = extractHeadlineFromFilenames(filenames, name);
    const inferredHeadline = inferHeadline(all, name);
    const headline = explicitHeadline || bracketHeadline || filenameHeadline || inferredHeadline || loose.find(x => x.length <= 34 && ROLE_RE.test(x) && x !== name && !/[()（）]/.test(x) && !/(활동|진행|제작|개발|합니다|있습니다)/.test(x)) || '';
    const escapedName = name ? name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
    const nameHeader = escapedName ? new RegExp(`^(?:[\\[【(（]\\s*)?${escapedName}(?:\\s*\\([^)]*\\))?\\s*(?:작가|강사|저자)?(?:\\s*[\\]】)）])?(?:\\s*(?:이\\s*력\\s*서|프로필))?$`) : null;
    const identityLines = all.filter(x => (nameHeader && nameHeader.test(x)) || (headline && (normalizedHeading(x) === normalizedHeading(headline) || extractBracketHeadline([x]) === headline)));
    const educationSource = mergeOpenParentheses(safeLines(sections.education || []));
    const education = compactEntries(educationSource.filter(line => /학과|전공|학위|졸업|재학|수료|대학교|대학원/.test(line)), 1);
    const educationSpillover = educationSource.filter(line => !/학과|전공|학위|졸업|재학|수료|대학교|대학원/.test(line));
    const intro = takeIntro(sections, loose, identityLines, educationSpillover);

    const careers = compactEntries((sections.careers || []).filter(line => !identityLines.includes(line)), 2, 4);
    const certificates = compactEntries(sections.certificates || [], 1, 3);
    const careerLikeCertificates = certificates.filter(line => /(?:강사|작가|디자이너|크리에이터)\s*(?:활동|근무|재직|운영)|(?:근무|재직|운영)\s*(?:중|경력)?/.test(line));
    const actualCertificates = certificates.filter(line => !careerLikeCertificates.includes(line));
    careers.push(...careerLikeCertificates);
    if(education.length) careers.unshift(`[학력] ${education.join(' · ')}`);
    if(actualCertificates.length) careers.push(...actualCertificates.map(x => `[수상·자격] ${x}`));
    const works = recentFirst(compactEntries((sections.works || []).filter(line => !identityLines.includes(line)), 1, 7));
    const lectures = recentFirst(compactEntries((sections.lectures || []).filter(line => !identityLines.includes(line)), 3, 8));

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
    if(/\(예시\)|예시\)/.test(cleaned)) blockers.push('예시 문구가 들어 있는 빈 양식 파일이에요');
    const profileHeaders = all.filter(line => /^(?:개띠랑\s*(?:\(이진이\))?|이다솜|두루\s*\(장진호\))$/.test(line));
    if(new Set(profileHeaders).size >= 2) blockers.push('여러 사람의 프로필이 한 파일에 들어 있어요');
    if(isPrivate(output)) blockers.push('연락처나 주소 같은 개인정보가 결과에 섞여 있어요');
    const careerLines = result.careers.split('\n').filter(Boolean);
    if(careerLines.length >= 3 && careerLines.filter(line => DATE_ONLY_RE.test(line)).length / careerLines.length >= .5) blockers.push('경력의 날짜와 활동 내용을 서로 연결하지 못했어요');
    const workLines = result.works.split('\n').filter(Boolean);
    if(workLines.length >= 3 && workLines.filter(line => DATE_ONLY_RE.test(line)).length / workLines.length >= .5) blockers.push('저서·작품의 날짜와 제목을 서로 연결하지 못했어요');
    if(result.works.split('\n').filter(line => /^(?:KBS|MBC|MBN|SBS|EBS|tvN|JTBC|채널A|TV조선)/i.test(line)).length >= 2) blockers.push('방송 경력이 저서·작품에 섞였어요');
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
