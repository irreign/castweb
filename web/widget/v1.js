/* Nexus Logic website chat loader. Usage: <script src="https://YOUR-APP/widget/v1.js" data-agency="pk_..." async></script>
   The chat runs in an iframe served from the app origin; this script holds no credentials and reads nothing from the host page. */
(function () {
  'use strict';
  var s = document.currentScript || document.querySelector('script[data-agency][src*="widget/v1.js"]');
  if (!s || window.__nlWidget) return; window.__nlWidget = true;
  var key = s.getAttribute('data-agency'); if (!key) return;
  var origin = new URL(s.src, location.href).origin;
  var btn = document.createElement('button'); btn.type = 'button'; btn.setAttribute('aria-label', 'Open chat'); btn.setAttribute('aria-expanded', 'false');
  btn.style.cssText = 'position:fixed;right:18px;bottom:18px;width:58px;height:58px;border-radius:50%;border:0;background:#0f766e;color:#fff;font:700 24px system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:2147483000';
  btn.textContent = '💬';
  var frame = document.createElement('iframe'); frame.title = 'Chat'; frame.src = origin + '/widget/frame?k=' + encodeURIComponent(key); frame.setAttribute('loading', 'lazy');
  var open = false;
  function layout() { var small = window.innerWidth < 520; frame.style.cssText = 'position:fixed;z-index:2147483001;border:0;background:#fff;box-shadow:0 12px 40px rgba(0,0,0,.3);display:' + (open ? 'block' : 'none') + ';' + (small ? 'inset:0;width:100%;height:100%;border-radius:0' : 'right:18px;bottom:88px;width:380px;height:min(640px,calc(100vh - 110px));border-radius:14px'); }
  btn.addEventListener('click', function () { open = !open; btn.setAttribute('aria-expanded', String(open)); btn.textContent = open ? '✕' : '💬'; if (open && !frame.parentNode) document.body.appendChild(frame); layout(); });
  window.addEventListener('resize', layout);
  window.addEventListener('message', function (e) { if (e.origin === origin && e.data && e.data.type === 'nl-ready' && /^#[0-9a-fA-F]{6}$/.test(e.data.color)) btn.style.background = e.data.color; });
  function mount() { document.body.appendChild(btn); layout(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
