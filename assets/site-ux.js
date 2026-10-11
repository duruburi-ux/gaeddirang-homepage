/* UI only: no requests, authentication, order writes or analytics. */
(() => {
  'use strict';
  let toastTimer;
  window.announceUX = message => {
    const status = document.getElementById('uxStatus');
    status.textContent = message;status.classList.add('visible');
    clearTimeout(toastTimer);toastTimer = setTimeout(() => status.classList.remove('visible'), 4500);
  };
  // Keep the existing opt-in handler and fields; move them out of the cover feature.
  const newsletter = document.getElementById('mgAlert');
  if (newsletter) {
    const strip = document.createElement('section');strip.dataset.cat='home';strip.className='newsletter-strip';strip.setAttribute('aria-label','개띠랑 소식 구독');
    while (newsletter.firstChild) strip.append(newsletter.firstChild);
    strip.prepend(document.getElementById('mgAlertHoneypot'));
    document.querySelector('.sec-notice-search').after(strip);newsletter.remove();
    strip.id='mgAlert';
    strip.style.display=document.querySelector('.sec-home').style.display==='none'?'none':'';
  }
  const dialogs = [...document.querySelectorAll('.overlay-bg, #noticeModal')];
  const menu = document.getElementById('mobileNavPanel');
  const returns = new Map(), originals = new Map();
  let stack=[],lastInteraction=null,menuWasOpen=false;
  const visible = el => !!el && el.isConnected && el.getClientRects().length>0;
  const isOpen = el => el.id==='noticeModal'?el.style.display==='flex':el.classList.contains('active');
  const controls = scope => [...scope.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(el=>visible(el)&&!el.closest('[inert]'));
  dialogs.forEach((dialog,i)=>{
    dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
    if(!dialog.hasAttribute('aria-labelledby')&&!dialog.hasAttribute('aria-label')){
      const title=dialog.querySelector('h2,h3,.em-title');
      if(title){title.id=title.id||`uxDialogTitle${i}`;dialog.setAttribute('aria-labelledby',title.id);}else dialog.setAttribute('aria-label','개띠랑 안내');
    }
    dialog.tabIndex=-1;
    dialog.addEventListener('click',event=>{if(event.target===dialog)closeDialog(dialog);});
  });
  function closeDialog(dialog){
    if(dialog.id==='noticeModal')window.closeNoticeModal();
    else if(dialog.id==='projectModal')window.closeProjectDetail();
    else window.closeOverlay(dialog.id);
  }
  function sync(){
    const opened=dialogs.filter(isOpen),closed=stack.filter(el=>!opened.includes(el));
    stack=stack.filter(el=>opened.includes(el));
    opened.forEach(el=>{if(!stack.includes(el)){returns.set(el,lastInteraction||document.activeElement);stack.push(el);}});
    const top=stack.at(-1),scope=top||(menu.classList.contains('active')?menu:null);
    // Inert background controls cannot be focused or activated while a dialog is open.
    for(const child of document.body.children){
      if(['SCRIPT','STYLE','LINK'].includes(child.tagName)||child.id==='uxStatus')continue;
      if(scope){
        if(!originals.has(child))originals.set(child,child.inert);
        child.inert=child!==scope && child.id!=='mobileNavOverlay';
      }else if(originals.has(child)){child.inert=originals.get(child);originals.delete(child);}
    }
    dialogs.forEach(el=>{el.setAttribute('aria-hidden',String(el!==top));if(el===top)el.inert=false;});
    stack.forEach((el,i)=>{const z=String(400000+i);if(el.style.zIndex!==z)el.style.zIndex=z;});
    menu.inert=!menu.classList.contains('active')||!!top;
    document.body.style.overflow=scope?'hidden':'';
    if(scope&&!scope.contains(document.activeElement)){
      const returned=closed.length?returns.get(closed.at(-1)):null;
      if(returned&&scope.contains(returned)&&visible(returned))returned.focus();
      else (controls(scope)[0]||scope).focus();
    }else if(!scope&&closed.length){
      let returned=returns.get(closed.at(-1));
      if(returned?.dataset?.program&&!returned.isConnected)returned=[...document.querySelectorAll('.prog-card')].find(el=>el.dataset.program===returned.dataset.program);
      if(returned?.dataset?.bookTitle&&!returned.isConnected)returned=[...document.querySelectorAll('.book-card')].find(el=>el.dataset.bookTitle===returned.dataset.bookTitle);
      if(!visible(returned)&&closed.at(-1).id==='detailModal')returned=[...document.querySelectorAll('.book-card')].find(el=>el.dataset.bookTitle===document.getElementById('nmTitle').textContent);
      if(!visible(returned)&&closed.at(-1).id==='programModal'){
        const title=document.getElementById('pmTitle').innerText.replace(/\s+/g,' ').trim();
        returned=[...document.querySelectorAll('.prog-card')].find(el=>el.getAttribute('aria-label')?.includes(title));
      }
      if(visible(returned)&&!returned.closest('[inert]')&&(!visible(document.activeElement)||closed.some(el=>el.contains(document.activeElement))||document.activeElement===document.body))returned.focus();
    }
    closed.forEach(el=>returns.delete(el));
    if(menuWasOpen&&!menu.classList.contains('active')&&!top)document.querySelector('.hamburger-btn').focus();
    menuWasOpen=menu.classList.contains('active');
  }
  document.addEventListener('pointerdown',event=>lastInteraction=event.target.closest('button,a,input,summary,[role=button]')||event.target,true);
  document.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' ')lastInteraction=document.activeElement;
    const top=stack.at(-1),scope=top||(menu.classList.contains('active')?menu:null);
    if(event.key==='Escape'&&scope){event.preventDefault();event.stopImmediatePropagation();if(top)closeDialog(top);else window.toggleMobileNav();return;}
    if(event.key==='Escape'&&document.querySelector('.nav-more[open]')){document.querySelector('.nav-more').removeAttribute('open');document.querySelector('.nav-more summary').focus();}
    if(event.key==='Tab'&&scope){const items=controls(scope),first=items[0],last=items.at(-1);if(!first){event.preventDefault();scope.focus();return;}if(event.shiftKey&&(document.activeElement===first||!scope.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!scope.contains(document.activeElement))){event.preventDefault();first.focus();}}
  },true);
  const observer=new MutationObserver(sync);
  dialogs.forEach(el=>observer.observe(el,{attributes:true,attributeFilter:['class','style']}));
  observer.observe(menu,{attributes:true,attributeFilter:['class']});
  // New stacking values only trigger one additional observer pass.
  sync();
  document.addEventListener('click',event=>{const more=document.querySelector('.nav-more');if(more&&!more.contains(event.target))more.removeAttribute('open');});
  window.addEventListener('resize',()=>{if(innerWidth>900&&menu.classList.contains('active'))window.toggleMobileNav();});
})();
