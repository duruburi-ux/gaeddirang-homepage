/* Navigation metadata only. Never embed private records, credentials, or copied task states here. */
(() => {
  'use strict';
  const notion = id => `https://app.notion.com/p/${id}`;
  const areas = [
    {id:'orders',name:'주문·배송',description:'채널별 주문, 입금 확인, 발송 상태와 배송지를 처리합니다.',tags:'주문 판매 결제 입금 포장 택배 발송 고객',tab:'orders',links:[]},
    {id:'counter',name:'매장 판매가능',description:'손님 문의에 답할 때 예약·입고예정과 분리된 즉시 판매가능 수량을 확인합니다.',tags:'책공방 현장 판매 가능 재고 예약 입고예정',tab:'finder',links:[]},
    {id:'stock',name:'전체 상품 원장·블라인드북',description:'도서와 굿즈의 가격·소유·장부 수량과 상품 기준을 확인합니다.',tags:'scm SKU 바코드 페이히어 매입 위탁 반품 장부',tab:'scm',links:[['SCM 업무 원본','3b0251c556d081ce9d08ce8e71ef0b90']]},
    {id:'store',name:'스마트스토어',description:'상품 등록과 온라인 판매 관련 업무.',tags:'네이버 판매 배송 상세페이지 온라인',links:[['스마트스토어 업무방','3ba251c556d081158bd4c0fdf459927e']]},
    {id:'program',name:'수업·프로그램·기관',description:'프로그램 준비, 신청자와 기관 요청 확인.',tags:'숲숲학교 강의 워크숍 교육 신청 수강생',tab:'apps',links:[['프로그램 업무방','3ba251c556d08115854fd1602ec56868'],['외부 출강','311251c556d080a29e51e657dea2fb79']]},
    {id:'publishing',name:'출판·제작',description:'원고부터 제작, 새로운 상품 출시까지.',tags:'책 저자 작가 인쇄 신간 출간',links:[['출판 업무방','3ba251c556d08121b119ef51f7d05db0'],['상품 출시 센터','3a0251c556d081d599c4f38ec2d2a819']]},
    {id:'content',name:'콘텐츠·디자인·홍보',description:'콘텐츠 제작과 채널 운영의 원본.',tags:'SNS 인스타그램 마케팅 AEO 홍보물',links:[['콘텐츠 업무방','3ba251c556d08120acd3fbe976abaaf8'],['SNS 운영','315251c556d0806988f4d0bc1bcd0c74']]},
    {id:'finance',name:'재무·정산',description:'확정·입금·지급·보관금을 구분해 보고 관련 서류로 이동합니다.',tags:'입금 비용 회계 세금 매출 원가 정산',tab:'finance',links:[['재무 업무방','3ba251c556d081b2902dcd3449f8bdfc']]},
    {id:'website',name:'홈페이지·디지털 운영',description:'홈페이지 개선과 디지털 운영 작업.',tags:'개발 관리자 웹 사이트 로그인 연동',links:[['홈페이지 업무방','3ba251c556d08146a133fc3bd2fd00f8']]},
    {id:'requests',name:'메일·외부 요청·지원사업',description:'접수된 요청과 지원사업 관련 원본.',tags:'네이버 이메일 슬랙 공모 지원금 문의',tab:'inquiries',links:[['메일 업무방','3ba251c556d08186960dff748a97554b'],['요청 접수','3c4251c556d081a1909cdb9aacd34de5'],['지원사업','30e251c556d08172b7a1f1cbd9a677ff']]},
    {id:'habitus',name:'하비투스',description:'별도로 진행 중인 개발본과 입력 도구.',tags:'Habitus 교육 개발 실험',links:[['하비투스 개발본','3d1251c556d08171abdbce95d676d950'],['입력 도구','3d2251c556d08103a49bc70f869412df']]}
  ];
  const normalize = value => String(value).normalize('NFC').toLocaleLowerCase('ko').replace(/\s+/g,'');
  function search(query){const q=normalize(query);return areas.filter(a=>normalize([a.name,a.description,a.tags,...a.links.map(l=>l[0])].join(' ')).includes(q));}
  function element(tag,className,text){const el=document.createElement(tag);el.className=className;if(text)el.textContent=text;return el;}
  let renderCurrent,inputCurrent;
  function init({navigate}){
    const host=document.getElementById('ops-areas');
    const input=document.getElementById('ops-search');
    if(!host||!input)return;
    function render(){
      const found=search(input.value);host.replaceChildren();
      document.getElementById('ops-count').textContent=`${found.length}개 업무 영역 · 관리실 기능과 원본 연결 목록`;
      for(const area of found){
        const card=element('article','ops-card');
        card.append(element('span','ops-label',area.links.length?'관리실 · 노션 원본 연결':'관리실에서 바로 처리'),element('h3','',area.name),element('p','',area.description));
        const links=element('div','ops-links');
        for(const [title,id] of area.links){const a=element('a','',`${title} ↗`);a.href=notion(id);a.target='_blank';a.rel='noopener noreferrer';links.append(a);}
        if(area.tab){const button=element('button','ops-internal','관리실에서 확인 →');button.type='button';button.addEventListener('click',()=>navigate(area.tab));links.append(button);}
        if(area.id==='finance'){
          for(const [title,hash] of [['월별 정산자료','settlements'],['작가 정산서 작성','royalty']]){
            const link=element('a','ops-internal',title+' →');link.href='docs.html#'+hash;links.append(link);
          }
        }
        card.append(links);host.append(card);
      }
      if(!found.length){
        const empty=element('p','ops-empty','찾는 업무가 없어요. 검색어를 지우고 전체 업무를 확인해 보세요.');
        const reset=element('button','','검색 지우고 전체 보기');reset.type='button';reset.addEventListener('click',()=>{input.value='';render();input.focus();});empty.append(reset);host.append(empty);
      }
    }
    input.addEventListener('input',render);
    document.querySelectorAll('[data-ops-tab]').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.opsTab)));
    renderCurrent=render;inputCurrent=input;render();
  }
  function setQuery(query){if(!inputCurrent)return;inputCurrent.value=query||'';renderCurrent();inputCurrent.focus()}
  window.Operations={init,search,setQuery};
})();
