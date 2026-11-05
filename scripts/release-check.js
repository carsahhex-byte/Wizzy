/* Hosted-only bootstrap. The builder inserts this before the game module. */
(() => {
  const current = document.querySelector('meta[name="wizzy-build"]')?.content;
  if (!/^[a-f0-9]{12}$/.test(current || '') || !['http:', 'https:'].includes(location.protocol)) return;

  let interacted = false;
  let checking = false;
  let notice = null;
  const noteInteraction = () => { interacted = true; };
  document.addEventListener('pointerdown', noteInteraction, { capture: true, once: true });
  document.addEventListener('keydown', noteInteraction, { capture: true, once: true });

  function offerUpdate(target) {
    if (notice) return;
    notice = document.createElement('aside');
    notice.id = 'wizzy-release-update';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    Object.assign(notice.style, {
      position: 'fixed', top: '8px', left: '8px', right: '8px', zIndex: '2147483647',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
      gap: '10px', padding: '12px', border: '2px solid #d9c5ff',
      background: '#181d35', color: '#fff4d8', font: '14px Arial, sans-serif',
      boxShadow: '0 4px 18px #0009',
    });
    const message = document.createElement('span');
    message.textContent = 'A newer Wizzy update is ready.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Load latest game';
    Object.assign(button.style, {
      minHeight: '36px', padding: '7px 12px', border: '1px solid #e6d2ff',
      background: '#5e4388', color: '#fff', font: 'bold 14px Arial, sans-serif',
      cursor: 'pointer',
    });
    button.addEventListener('click', () => location.replace(target.href));
    notice.append(message, button);
    const attach = () => { if (!document.getElementById(notice.id)) document.body.append(notice); };
    if (document.body) attach();
    else document.addEventListener('DOMContentLoaded', attach, { once: true });
  }

  async function checkRelease() {
    if (checking) return;
    checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const manifest = new URL('./build-info.json', document.baseURI);
      manifest.searchParams.set('check', String(Date.now()));
      const response = await fetch(manifest.href, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
      if (!response.ok) return;
      const latest = await response.json();
      if (!/^[a-f0-9]{12}$/.test(latest?.id || '') || latest.id === current
        || latest.launch !== `./wizzy-${latest.id}.html`) return;
      const target = new URL(latest.launch, document.baseURI);
      if (target.origin !== location.origin) return;
      target.hash = location.hash || '#title';
      if (interacted) offerUpdate(target);
      else location.replace(target.href);
    } catch { /* Offline, old servers, and unavailable metadata must not block play. */ }
    finally { clearTimeout(timeout); checking = false; }
  }

  checkRelease();
  window.addEventListener('pageshow', event => { if (event.persisted) checkRelease(); });
})();
