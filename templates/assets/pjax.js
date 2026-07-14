(() => {
  if (window.__earthPjaxStarted) return;
  window.__earthPjaxStarted = true;

  const boundary = '[data-pjax-content]';
  const linkSelector = 'a[href]';
  const style = document.createElement('style');
  style.textContent = `
    html.is-pjax-loading::before {
      content: "";
      position: fixed;
      inset: 0 auto auto 0;
      z-index: 9999;
      width: 35%;
      height: 2px;
      background: #2563eb;
      animation: earth-pjax-progress 900ms ease-out infinite;
    }
    @keyframes earth-pjax-progress {
      from { transform: translateX(-100%); }
      to { transform: translateX(300%); }
    }
  `;
  document.head.appendChild(style);

  let navigating = false;

  function isInternalLink(link, event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.target && link.target !== '_self') return false;
    if (link.hasAttribute('download') || link.dataset.noPjax !== undefined) return false;
    const url = new URL(link.href, window.location.href);
    return url.origin === window.location.origin && url.protocol === window.location.protocol;
  }

  function syncHead(doc) {
    document.title = doc.title;
    const current = new Set([...document.head.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"]')].map((node) => node.href));
    doc.head.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"]').forEach((node) => {
      if (!current.has(node.href)) document.head.appendChild(node.cloneNode(true));
    });
  }

  async function runPageModule(doc, url) {
    const script = doc.querySelector('script[type="module"][src]');
    if (!script) return;
    const src = new URL(script.src, url).href;
    await import(`${src}${src.includes('?') ? '&' : '?'}pjax=${Date.now()}`);
  }

  async function navigate(url, replace = false) {
    if (navigating) return;
    navigating = true;
    document.documentElement.classList.add('is-pjax-loading');
    try {
      const response = await fetch(url.href, { headers: { 'X-Requested-With': 'PJAX' } });
      if (!response.ok) throw new Error(`PJAX request failed: ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const currentContent = document.querySelector(boundary);
      const nextContent = doc.querySelector(boundary);
      if (!currentContent || !nextContent) throw new Error('PJAX boundary not found');
      document.dispatchEvent(new CustomEvent('earth:pjax:before', { detail: { url: url.href } }));
      currentContent.replaceWith(nextContent);
      if (window.Alpine?.initTree) window.Alpine.initTree(nextContent);
      syncHead(doc);
      if (replace) history.replaceState({}, '', url.href);
      else history.pushState({}, '', url.href);
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      await runPageModule(doc, url.href);
      document.dispatchEvent(new CustomEvent('earth:pjax:success', { detail: { url: url.href } }));
    } catch (error) {
      window.location.href = url.href;
    } finally {
      navigating = false;
      document.documentElement.classList.remove('is-pjax-loading');
    }
  }

  window.earthPjaxNavigate = navigate;

  document.addEventListener('click', (event) => {
    const link = event.target.closest(linkSelector);
    if (!link || !isInternalLink(link, event)) return;
    const url = new URL(link.href, window.location.href);
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    event.preventDefault();
    navigate(url);
  });

  document.addEventListener('change', (event) => {
    const select = event.target.closest('#pagination');
    if (!select || !select.value) return;
    const base = select.closest('[data-pjax-content]')?.querySelector('a[href]')?.href || window.location.href;
    const url = new URL(base, window.location.href);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/page/${select.value}`;
    navigate(url);
  });

  window.addEventListener('popstate', () => navigate(new URL(window.location.href), true));
})();
