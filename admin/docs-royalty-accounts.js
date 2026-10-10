/* 작가 정산 탭 안의 지급계좌 관리.
   - 정산서 HTML/PDF와 분리한다.
   - 목록은 마스킹 RPC만 사용하고, 전체 값은 관리자가 명시적으로 조회/복사할 때만 받는다.
   - 계좌번호·예금주는 localStorage, URL, 로그에 남기지 않는다. */
(function(){
  const M=window.RoyaltyAccountModel;
  const host=document.querySelector('#ryAccountHost');
  if(!M||!host)return;

  const SOURCE_LABEL={
    original_image:'원본 사진',
    bankbook_copy:'통장 사본',
    author_message:'작가가 보낸 메시지',
    manual_note:'수기 메모',
  };
  const ERRORS={
    ADMIN_REQUIRED:'관리자 권한을 다시 확인해 주세요.',
    ACCOUNT_NOT_FOUND:'저장된 계좌를 찾지 못했어요. 목록을 다시 불러와 주세요.',
    ACCOUNT_NOT_VERIFIED:'확인 완료된 계좌만 복사할 수 있어요.',
    ACCOUNT_VERIFICATION_INCOMPLETE:'예금주 확인과 원본 판독 확인을 모두 마쳐야 확인 완료로 저장할 수 있어요.',
    ACCOUNT_NUMBER_INVALID:'계좌번호 숫자 자릿수를 확인해 주세요.',
    AUTHOR_REQUIRED:'작가를 먼저 선택해 주세요.',
    BANK_REQUIRED:'은행을 입력해 주세요.',
    SOURCE_REQUIRED:'정보 출처를 선택해 주세요.',
    SOURCE_DATE_REQUIRED:'출처를 확인한 날짜를 입력해 주세요.',
  };
  const S={author:'',row:null,full:null,loading:false,saving:false,showForm:false,rev:0,timer:null};
  const e=v=>String(v==null?'':v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const date=v=>v?new Date(v).toLocaleString('ko-KR',{year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'없음';
  const isoToday=()=>new Date().toLocaleDateString('sv-SE');
  const status=row=>row?.verification_status==='verified'?'확인 완료':'재확인 필요';
  const modeReady=()=>typeof MODE!=='undefined'&&MODE==='db';

  function clearFull(){
    S.full=null;
    if(S.timer){clearTimeout(S.timer);S.timer=null;}
    host.querySelectorAll('[data-private-value]').forEach(el=>{el.textContent='';el.value='';});
  }

  function scheduleHide(){
    if(S.timer)clearTimeout(S.timer);
    S.timer=setTimeout(()=>{S.showForm=false;clearFull();render();},30000);
  }

  function sourceOptions(selected){
    return Object.entries(SOURCE_LABEL).map(([value,label])=>`<option value="${value}"${value===selected?' selected':''}>${label}</option>`).join('');
  }

  function summaryHtml(){
    if(!S.author)return '<div class="ry-account-summary"><span class="hint">작가·도서를 선택하면 지급계좌 확인 상태를 볼 수 있어요.</span></div>';
    if(!modeReady())return '<div class="ry-account-summary"><span class="hint">관리자 로그인 후에만 마스킹된 계좌 목록을 불러옵니다. 미리보기 모드에서는 계좌 저장소를 호출하지 않아요.</span></div>';
    if(S.loading)return '<div class="ry-account-summary"><span class="hint">마스킹된 계좌 정보를 불러오는 중…</span></div>';
    if(!S.row)return `<div class="ry-account-summary"><div class="top"><b>${e(S.author)}</b><span class="ry-account-status">등록 전</span></div><p class="meta">저장된 지급계좌가 없습니다.</p><div class="btns"><button class="btn-sm" id="ryAccountAdd">안전하게 등록</button><button class="btn-link" id="ryAccountReload">다시 불러오기</button></div></div>`;
    const r=S.row,verified=r.verification_status==='verified';
    const access=r.last_access_at?`${r.last_access_action==='copied'?'복사':'조회'} ${date(r.last_access_at)}`:'조회·복사 기록 없음';
    return `<div class="ry-account-summary">
      <div class="top"><b>${e(r.author_name)}</b><span class="ry-account-status${verified?' verified':''}">${status(r)}</span></div>
      <div class="ry-account-secret">${e(r.bank_name)} · ${e(r.masked_account)} · 예금주 ${e(r.masked_holder||'미확인')}</div>
      <p class="meta">출처 ${e(SOURCE_LABEL[r.source_type]||'확인 필요')} · 확인일 ${e(r.source_checked_on||'없음')}<br>수정 ${date(r.updated_at)} · ${e(r.updated_by||'기록 없음')}<br>최근 접근 ${e(access)}</p>
      <div class="btns"><button class="btn-sm" id="ryAccountReveal">전체 정보 보기</button><button class="btn-sm" id="ryAccountCopy"${verified?'':' disabled'}>확인 후 복사</button><button class="btn-link" id="ryAccountEdit">조회 후 수정</button><button class="btn-link" id="ryAccountReload">다시 불러오기</button></div>
      ${verified?'':'<p class="ry-account-warn">예금주나 원본 판독이 확인되지 않아 지급용으로 복사할 수 없습니다.</p>'}
      ${S.full?`<div class="ry-account-secret" data-private-value>${e(S.full.bank_name)} · ${e(S.full.account_number)} · ${e(S.full.holder_name||'예금주 미확인')}</div><p class="hint">30초 뒤 자동으로 가립니다.</p>`:''}
    </div>`;
  }

  function formHtml(){
    if(!S.showForm||!modeReady())return '';
    const r=S.row||{},f=S.full||{};
    return `<div class="ry-account-form">
      <label class="f" for="ryAccountBank">은행</label><input class="in" id="ryAccountBank" autocomplete="off" value="${e(f.bank_name||r.bank_name||'')}">
      <label class="f" for="ryAccountNumber">계좌번호</label><input class="in" id="ryAccountNumber" data-private-value type="password" inputmode="numeric" autocomplete="new-password" placeholder="숫자와 하이픈만" value="${e(f.account_number||'')}">
      <label class="f" for="ryAccountHolder">예금주</label><input class="in" id="ryAccountHolder" data-private-value autocomplete="off" value="${e(f.holder_name||'')}">
      <div class="row2">
        <div><label class="f" for="ryAccountSource">정보 출처</label><select class="in" id="ryAccountSource">${sourceOptions(r.source_type||'original_image')}</select></div>
        <div><label class="f" for="ryAccountSourceDate">출처 확인일</label><input class="in" id="ryAccountSourceDate" type="date" value="${e(r.source_checked_on||isoToday())}"></div>
      </div>
      <label class="chk"><input type="checkbox" id="ryAccountSourceClear"${r.source_clear?' checked':''}> 원본에서 은행과 계좌번호를 또렷하게 판독했습니다.</label>
      <label class="chk"><input type="checkbox" id="ryAccountHolderConfirmed"${r.holder_confirmed?' checked':''}> 예금주를 별도로 확인했습니다.</label>
      <label class="chk"><input type="checkbox" id="ryAccountVerified"${r.verification_status==='verified'?' checked':''}> 위 두 조건을 충족해 지급용 「확인 완료」로 저장합니다.</label>
      <div class="btns"><button class="btn-primary" id="ryAccountSave">암호화 저장</button><button class="btn-sm" id="ryAccountCancel">취소</button></div>
      <div class="parse-note" id="ryAccountNote"></div>
    </div>`;
  }

  function render(){
    host.innerHTML=`<div class="card" data-private-no-print><h3>④ 인세 지급계좌 관리</h3><p class="ry-account-safe">계좌번호·예금주는 정산서와 브라우저 임시저장에 넣지 않습니다. 목록은 마스킹하고, 전체 조회와 복사는 관리자 행동으로 기록합니다.</p>${summaryHtml()}${formHtml()}</div>`;
    host.querySelector('#ryAccountReload')?.addEventListener('click',reload);
    host.querySelector('#ryAccountAdd')?.addEventListener('click',()=>{S.showForm=true;render();});
    host.querySelector('#ryAccountReveal')?.addEventListener('click',()=>reveal('reveal'));
    host.querySelector('#ryAccountCopy')?.addEventListener('click',copyAccount);
    host.querySelector('#ryAccountEdit')?.addEventListener('click',editAccount);
    host.querySelector('#ryAccountCancel')?.addEventListener('click',()=>{S.showForm=false;clearFull();render();});
    host.querySelector('#ryAccountSave')?.addEventListener('click',save);
  }

  async function reload(){
    clearFull();S.showForm=false;
    if(!modeReady()||!S.author){S.row=null;render();return;}
    const rev=++S.rev;S.loading=true;render();
    const {data,error}=await sb.rpc('list_royalty_payment_accounts',{p_author_name:S.author});
    if(rev!==S.rev)return;
    S.loading=false;
    if(error){S.row=null;render();toast(ERRORS[error.message]||'지급계좌를 불러오지 못했어요',true);return;}
    S.row=Array.isArray(data)?data[0]||null:null;render();
  }

  async function reveal(action){
    if(!S.row||!confirm(action==='copy'?'확인 완료된 지급계좌를 복사할까요? 이 행동은 기록됩니다.':'지급계좌 전체 정보를 볼까요? 이 행동은 기록됩니다.'))return null;
    const {data,error}=await sb.rpc('reveal_royalty_payment_account',{p_id:S.row.id,p_action:action});
    if(error){toast(ERRORS[error.message]||'계좌 정보를 확인하지 못했어요',true);return null;}
    const full=Array.isArray(data)?data[0]||null:null;
    if(!full){toast('계좌 정보를 확인하지 못했어요',true);return null;}
    if(action==='reveal'){S.full=full;scheduleHide();render();}
    return full;
  }

  async function copyAccount(){
    const full=await reveal('copy');if(!full)return;
    const value=`${full.bank_name} ${full.account_number} ${full.holder_name}`.trim();
    try{await navigator.clipboard.writeText(value);toast('확인 완료 계좌를 복사했어요. 접근 기록도 남겼습니다.');}
    catch{toast('복사하지 못했어요. 브라우저 권한을 확인해 주세요',true);}
    await reload();
  }

  async function editAccount(){
    if(!S.row){S.showForm=true;render();return;}
    const full=S.full||await reveal('reveal');if(!full)return;
    S.full=full;S.showForm=true;scheduleHide();render();
  }

  function readDraft(){
    return {
      id:S.row?.id||null,
      authorName:S.author,
      bankName:host.querySelector('#ryAccountBank')?.value,
      accountNumber:host.querySelector('#ryAccountNumber')?.value,
      holderName:host.querySelector('#ryAccountHolder')?.value,
      sourceType:host.querySelector('#ryAccountSource')?.value,
      sourceCheckedOn:host.querySelector('#ryAccountSourceDate')?.value,
      holderConfirmed:host.querySelector('#ryAccountHolderConfirmed')?.checked,
      sourceClear:host.querySelector('#ryAccountSourceClear')?.checked,
      markVerified:host.querySelector('#ryAccountVerified')?.checked,
    };
  }

  async function save(){
    if(S.saving)return;
    const checked=M.validateDraft(readDraft()),note=host.querySelector('#ryAccountNote');
    if(!checked.ok){note.className='parse-note warn';note.textContent=checked.errors.join('\n');return;}
    const d=checked.draft;S.saving=true;host.querySelector('#ryAccountSave').disabled=true;
    const {error}=await sb.rpc('save_royalty_payment_account',{
      p_id:d.id,p_author_name:d.authorName,p_bank_name:d.bankName,p_account_number:d.accountNumber,
      p_holder_name:d.holderName,p_source_type:d.sourceType,p_source_checked_on:d.sourceCheckedOn,
      p_holder_confirmed:d.holderConfirmed,p_source_clear:d.sourceClear,p_mark_verified:d.markVerified,
    });
    S.saving=false;
    if(error){host.querySelector('#ryAccountSave').disabled=false;note.className='parse-note warn';note.textContent=ERRORS[error.message]||'계좌를 저장하지 못했어요';return;}
    S.showForm=false;clearFull();toast(d.markVerified?'확인 완료 계좌로 암호화 저장했어요':'재확인 필요 상태로 암호화 저장했어요');await reload();
  }

  function selectAuthor(author){
    const next=String(author||'').trim();
    if(next===S.author&&(S.row||S.loading))return;
    ++S.rev;S.author=next;S.row=null;S.loading=false;S.showForm=false;clearFull();render();
    if(modeReady()&&next)reload();
  }

  window.RoyaltyAccountUI={selectAuthor,reload,state:()=>({author:S.author,row:S.row,full:!!S.full})};
  render();
})();
