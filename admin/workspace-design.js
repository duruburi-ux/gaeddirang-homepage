/* Presentation only. Existing readers, authentication and write handlers stay authoritative. */
window.WorkspaceDesign = (() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  let initialized = false;
  function ensureMobileNavigation() {
    const nav = $('.ux-mobile-nav');
    if (!nav) return;
    const source = [...document.querySelectorAll('.personal-plan-sidebar .workspace-main-nav button[data-area][data-nav-tab]')];
    const definitions = source.map(node => ({area: node.dataset.area, route: node.dataset.navTab, label: node.textContent.trim()}));
    const valid = definitions.length === 5 && new Set(definitions.map(row => row.area)).size === 5 && new Set(definitions.map(row => row.route)).size === 5 && definitions.every(row => /^[a-z][a-z0-9-]*$/.test(row.area) && /^[a-z][a-z0-9-]*$/.test(row.route) && row.label && document.getElementById('tab-' + row.route));
    if (!valid) return;
    const coherent = () => {
      const buttons = [...nav.querySelectorAll('[data-mobile-area]')];
      return buttons.length === definitions.length && !nav.querySelector('[data-ux-route],[data-ux-more]') && definitions.every(row => buttons.filter(button => button.dataset.mobileArea === row.area).length === 1);
    };
    const structure = window.AdminStructureUX;
    if (typeof structure?.activate === 'function' && (!coherent() || nav.dataset.workspaceFallback === 'true')) {
      delete nav.dataset.structureReady;
      try { structure.activate(); } catch { /* The visible degraded notice owns this fallback. */ }
    }
    let notice = $('#workspace-navigation-notice');
    if (typeof structure?.activate === 'function' && coherent() && nav.dataset.structureReady === 'true') {
      delete nav.dataset.workspaceFallback;
      if (notice) notice.hidden = true;
      return;
    }
    const legacy = nav.querySelectorAll('[data-ux-route]').length === 4 && nav.querySelectorAll('[data-ux-more]').length === 1;
    if (legacy) {
      const buttons = definitions.map(row => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mobileArea = row.area;
        const label = document.createElement('span');
        label.textContent = row.label;
        button.append(label);
        button.onclick = () => {
          if (typeof window.switchTab !== 'function') return;
          window.switchTab(row.route);
          sync();
        };
        return button;
      });
      nav.replaceChildren(...buttons);
      delete nav.dataset.structureReady;
      nav.dataset.workspaceFallback = 'true';
    }
    if (nav.dataset.workspaceFallback !== 'true' || !coherent()) return;
    if (!notice) {
      notice = document.createElement('p');
      notice.id = 'workspace-navigation-notice';
      notice.className = 'core-banner workspace-navigation-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.textContent = '메뉴 일부 초기화 미확인 · 기본 이동 제공';
      const banner = $('#coreBanner');
      if (banner) banner.after(notice); else $('#appView main')?.prepend(notice);
    }
    notice.hidden = false;
    const route = location.hash.slice(1);
    nav.querySelectorAll('[data-mobile-area]').forEach(button => {
      const definition = definitions.find(row => row.area === button.dataset.mobileArea);
      if (definition.route === route) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }
  function reveal(node) {
    if (!node) return;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    node.scrollIntoView({block: 'start', behavior: 'auto'});
    node.tabIndex = -1;
    node.focus({preventScroll: true});
  }
  function sync() {
    ensureMobileNavigation();
    const route = location.hash.slice(1) || 'home';
    document.body.dataset.workspaceRoute = route;
    const personal = $('.personal-plan-nav');
    if (personal) personal.hidden = route !== 'read';
  }
  function disclosure(node, title) {
    if (!node || node.closest('.workspace-disclosure')) return;
    const details = document.createElement('details');
    details.className = 'workspace-disclosure';
    const summary = document.createElement('summary');
    summary.textContent = title;
    node.before(details);
    details.append(summary, node);
  }
  function init() {
    if (initialized) { sync(); return; }
    initialized = true;
    const icons = {
      today: '<path d="m4 7 8-5 8 5v13H4zM9 20v-7h6v7"/>',
      books: '<path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15"/>',
      programs: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
      finance: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-6 4h6m-4 3h1"/>',
      content: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h4"/>'
    };
    document.querySelectorAll('[data-mobile-area] i').forEach(node => {
      node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[node.parentElement.dataset.mobileArea] || ''}</svg>`;
    });
    // The original header remains in the DOM for existing handler references,
    // but cannot become a second navigation via a legacy CSS priority change.
    const legacy = $('#appView > header');
    if (legacy) { legacy.hidden = true; legacy.inert = true; }
    // Older presentation modules wrapped the same Work filter twice.
    // Keep the live controls and their listeners inside one disclosure.
    const filters = $('#tab-work .work-filters')?.closest('.action-filter-details');
    const outer = filters?.parentElement.closest('.workflow-disclosure');
    if (outer && outer.querySelector('.work-filters') === filters.querySelector('.work-filters')) {
      outer.replaceWith(filters);
    }
    const form = $('#assistant-request-form');
    disclosure(form, '새 요청 준비하기');
    const source = $('#assistant-request-source');
    if (source && form) form.prepend(source);
    window.addEventListener('assistant-request:prefill', () => {
      requestAnimationFrame(() => {
        if (location.hash === '#integration' && form?.closest('details')) {
          form.closest('details').open = true;
        }
      });
    });
    const heading = $('#assistant-request-title-heading');
    if (heading) heading.textContent = '진행한 일과 결과';
    const copy = $('.assistant-request-head p:last-child');
    if (copy) copy.textContent = '접수·진행·완료 기록을 구분해 봅니다. 완료 근거와 원래 확인시각을 함께 확인하세요.';
    // Existing warnings and controls remain available in their relevant context.
    disclosure($('.source-dashboard-analysis'), '기간별 변화와 집계 보기');
    const capture = $('.workspace-capture');
    capture?.addEventListener('toggle', () => {
      if (capture.open) $('#home-quick-title')?.focus({preventScroll: true});
    });
    $('[data-workspace-refresh]')?.addEventListener('click', () => $('#reloadBtn')?.click());
    $('[data-workspace-results]')?.addEventListener('click', () => {
      if (window.switchTab?.('integration') === false) return;
      requestAnimationFrame(() => reveal($('#assistant-request-list')));
    });
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    sync();
  }
  function deactivate() {
    document.querySelectorAll('.workspace-capture,.workspace-disclosure').forEach(node => { node.open = false; });
  }
  init();
  return {init, sync, deactivate};
})();
