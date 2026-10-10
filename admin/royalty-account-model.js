(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RoyaltyAccountModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const SOURCE_TYPES=new Set(['original_image','bankbook_copy','author_message','manual_note']);

  function normalizeAccountNumber(value){
    return String(value||'').replace(/[^0-9]/g,'');
  }

  function maskAccountNumber(value){
    const digits=normalizeAccountNumber(value);
    return digits.length>=4?`•••• ${digits.slice(-4)}`:'••••';
  }

  function maskHolder(value){
    const text=String(value||'').trim();
    if(!text)return '';
    if(text.length===1)return '*';
    if(text.length===2)return `${text[0]}*`;
    return `${text[0]}${'*'.repeat(text.length-2)}${text.at(-1)}`;
  }

  function validateDraft(input){
    const draft={
      id:input.id||null,
      authorName:String(input.authorName||'').trim(),
      bankName:String(input.bankName||'').trim(),
      accountNumber:normalizeAccountNumber(input.accountNumber),
      holderName:String(input.holderName||'').trim(),
      sourceType:String(input.sourceType||''),
      sourceCheckedOn:String(input.sourceCheckedOn||''),
      holderConfirmed:!!input.holderConfirmed,
      sourceClear:!!input.sourceClear,
      markVerified:!!input.markVerified,
    };
    const errors=[];
    if(!draft.authorName)errors.push('작가를 먼저 선택해 주세요.');
    if(!draft.bankName)errors.push('은행을 입력해 주세요.');
    if(draft.accountNumber.length<8||draft.accountNumber.length>20)errors.push('계좌번호는 숫자 8~20자리인지 확인해 주세요.');
    if(!SOURCE_TYPES.has(draft.sourceType))errors.push('정보 출처를 선택해 주세요.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.sourceCheckedOn))errors.push('출처를 확인한 날짜를 입력해 주세요.');
    if(draft.markVerified&&(!draft.holderName||!draft.holderConfirmed||!draft.sourceClear)){
      errors.push('예금주 확인과 원본 판독 확인을 모두 마쳐야 확인 완료로 저장할 수 있어요.');
    }
    return {ok:errors.length===0,errors,draft};
  }

  return {SOURCE_TYPES,normalizeAccountNumber,maskAccountNumber,maskHolder,validateDraft};
});
