(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  var KEY = params.get('k') || ''; var PREVIEW = params.get('preview') === '1';
  var API = '/api/public/' + encodeURIComponent(KEY);
  var root = document.getElementById('w');
  var cfg = null, conv = null, seen = {}, cursor = '', pollTimer = null, busy = false;
  var store = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage unavailable: chat still works for this page view */ } } };

  function h(tag, props) {
    var el = document.createElement(tag);
    for (var k in props || {}) { var v = props[k]; if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v); else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v; else el.setAttribute(k, v); }
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; if (Array.isArray(c)) c.forEach(function (x) { el.append(x); }); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); }
    return el;
  }
  function req(method, path, body) {
    var headers = {}; if (body !== undefined) headers['content-type'] = 'application/json'; if (conv) headers['x-conversation-token'] = conv.token;
    return fetch(API + path, { method: method, headers: headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error((j.error && j.error.message) || 'Something went wrong'); e.status = r.status; e.code = j.error && j.error.code; e.details = j.error && j.error.details; throw e; } return j; });
    }, function () { var e = new Error('Can’t reach the server. Check your connection and try again.'); e.status = 0; throw e; });
  }

  var msgs, panelHost, chips, input, sendBtn;

  function build() {
    document.documentElement.style.setProperty('--c', cfg.primaryColor);
    document.title = cfg.agencyName + ' chat';
    msgs = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite' });
    panelHost = h('div'); chips = h('div', { class: 'chips' });
    input = h('input', { type: 'text', placeholder: 'Type your question…', maxlength: '1000', 'aria-label': 'Your message', autocomplete: 'off' });
    sendBtn = h('button', { class: 'btn', type: 'submit' }, 'Send');
    var form = h('form', { class: 'in', onsubmit: function (e) { e.preventDefault(); var t = input.value.trim(); if (t) { input.value = ''; send(t); } } }, input, sendBtn);
    [
      h('header', {}, h('div', { class: 't' }, cfg.agencyName, h('small', {}, cfg.openNow ? 'Online now' : 'Office closed — we’ll reply during office hours')),
        h('button', { type: 'button', onclick: askHuman }, 'Talk to a person'), h('button', { type: 'button', onclick: showSlots }, 'Book')),
      PREVIEW ? h('div', { class: 'banner' }, 'Preview — test chat. Not counted in reports; booking is disabled.') : null,
      h('div', { class: 'disclosure' }, cfg.disclosure),
      msgs, chips, panelHost, form].forEach(function (n) { if (n) root.append(n); });
    bubble('bot', cfg.welcome);
    (cfg.suggestedPrompts || []).forEach(function (p) { chips.append(h('button', { class: 'chip', type: 'button', onclick: function () { send(p); } }, p)); });
    parent.postMessage({ type: 'nl-ready', color: cfg.primaryColor }, '*');
  }

  function bubble(kind, text, extra) {
    var el = h('div', { class: 'm ' + kind }, text);
    if (extra && extra.citations && extra.citations.length) el.append(h('div', { class: 'src' }, 'Source: ' + extra.citations.map(function (c) { return c.title; }).join('; ')));
    msgs.append(el); msgs.scrollTop = msgs.scrollHeight; return el;
  }
  function addServer(m) {
    if (m.id && seen[m.id]) return; if (m.id) seen[m.id] = 1;
    if (m.createdAt && m.createdAt > cursor && m.createdAt.length > 20) cursor = m.createdAt;
    bubble(m.from === 'staff' ? 'staff' : m.from === 'system' ? 'sys' : 'bot', m.text, { citations: m.citations });
  }

  function ensureConversation() {
    if (conv) return Promise.resolve();
    return req('POST', '/conversations', PREVIEW ? { preview: true } : {}).then(function (r) {
      conv = { id: r.conversationId, token: r.token }; store.set('nl:' + KEY + (PREVIEW ? ':p' : ''), JSON.stringify(conv)); startPolling();
    });
  }

  function send(text, existingEl, existingId) {
    if (busy) return; busy = true; sendBtn.disabled = true; chips.replaceChildren();
    var id = existingId || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
    var el = existingEl || bubble('me', text); el.classList.remove('failed'); var old = el.querySelector('.retry'); if (old) old.remove();
    ensureConversation().then(function () { return req('POST', '/conversations/' + conv.id + '/messages', { text: text, clientMessageId: id }); }).then(function (r) {
      (r.replies || []).forEach(addServer); handleUi(r.ui);
      if (r.humanHandling) bubble('sys', 'A consultant has this conversation and will reply here.');
    }).catch(function (e) {
      el.classList.add('failed'); el.append(h('button', { class: 'retry', type: 'button', onclick: function () { send(text, el, id); } }, e.status === 503 || e.status === 429 ? e.message + ' Tap to retry.' : 'Not sent — tap to retry'));
    }).then(function () { busy = false; sendBtn.disabled = false; input.focus(); });
  }

  function handleUi(ui) {
    if (!ui) return;
    if (ui.action === 'request_contact') showContact(ui.reason);
    else if (ui.action === 'show_slots') showSlots();
    else if (ui.action === 'offer_handoff') showOffer();
    else if (ui.action === 'handoff_done') bubble('sys', 'A consultant will follow up with you.');
  }
  function clearPanel() { panelHost.replaceChildren(); }
  function panel(title) { clearPanel(); var p = h('div', { class: 'panel' }, h('h3', {}, title)); panelHost.append(p); p.scrollIntoView({ block: 'nearest' }); return p; }

  function showOffer() {
    var p = panel('Would you like a person to follow up?');
    p.append(h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: askHuman }, 'Yes, ask a consultant'), h('button', { class: 'btn alt', type: 'button', onclick: clearPanel }, 'No thanks')));
  }

  function askHuman() {
    ensureConversation().then(function () { return req('POST', '/conversations/' + conv.id + '/handoff', {}); }).then(function (r) { addServer(r.reply); clearPanel(); handleUi(r.ui); })
      .catch(function (e) { bubble('sys', e.message); });
  }

  var contactDone = !!store.get('nl:' + KEY + ':contact' + (PREVIEW ? ':p' : ''));
  function showContact(reason) {
    var name = h('input', { type: 'text', autocomplete: 'name', maxlength: '120', id: 'cn' }), phone = h('input', { type: 'tel', autocomplete: 'tel', id: 'cp', placeholder: '9123 4567' }), email = h('input', { type: 'email', autocomplete: 'email', id: 'ce' });
    var consent = h('input', { type: 'checkbox', id: 'cc' }); var err = h('div', { class: 'err', role: 'alert' }); var btn = h('button', { class: 'btn', type: 'submit' }, 'Continue');
    var p = panel(reason === 'handoff' ? 'How can a consultant reach you?' : 'Your contact details');
    p.append(h('form', { novalidate: 'novalidate', onsubmit: function (e) {
      e.preventDefault(); err.textContent = '';
      if (!name.value.trim()) { err.textContent = 'Please enter your name.'; return; }
      if (!phone.value.trim() && !email.value.trim()) { err.textContent = 'Please enter a phone number or email.'; return; }
      if (!consent.checked) { err.textContent = 'Please tick the box to agree so we can contact you.'; return; }
      btn.disabled = true;
      ensureConversation().then(function () { return req('POST', '/conversations/' + conv.id + '/contact', { name: name.value.trim(), phone: phone.value.trim() || undefined, email: email.value.trim() || undefined, consent: true }); })
        .then(function (r) { store.set('nl:' + KEY + ':contact' + (PREVIEW ? ':p' : ''), '1'); contactDone = true; addServer(r.reply); clearPanel(); if (reason === 'consultation') showSlots(); else handleUi(r.ui); })
        .catch(function (ex) { btn.disabled = false; err.textContent = (ex.details && ex.details[0] && ex.details[0].message) || ex.message; });
    } },
      h('label', { for: 'cn' }, 'Name'), name, h('label', { for: 'cp' }, 'Mobile number'), phone, h('label', { for: 'ce' }, 'Email (optional if you gave a number)'), email,
      h('label', { class: 'chk', for: 'cc' }, consent, h('span', {}, cfg.consentNotice, cfg.privacyUrl ? [' ', h('a', { href: cfg.privacyUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Privacy policy')] : null)),
      err, h('div', { class: 'row' }, btn, h('button', { class: 'btn alt', type: 'button', onclick: clearPanel }, 'Not now'))));
  }

  function showSlots() {
    ensureConversation().then(function () {
      if (!contactDone && !PREVIEW) { return showContact('consultation'); }
      var p = panel('Choose a consultation time'); p.append(h('div', {}, 'Finding available times…'));
      req('GET', '/slots?days=10').then(function (r) {
        p.replaceChildren(h('h3', {}, 'Choose a consultation time'));
        if (!r.slots.length) { p.append(h('div', {}, 'There are no free times in the next few days. Please ask for a consultant to contact you.'), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: askHuman }, 'Ask a consultant'))); return; }
        var selected = null; var confirmBtn = h('button', { class: 'btn', type: 'button', disabled: true }, 'Confirm this time'); var err = h('div', { class: 'err', role: 'alert' });
        var day = ''; var wrap = h('div');
        r.slots.forEach(function (s) {
          var d = s.label.split(',').slice(0, 2).join(','); var t = s.label.split(',').pop().replace(/^\s*\d{4},?\s*/, '').trim();
          if (d !== day) { day = d; wrap.append(h('div', { class: 'day' }, d)); wrap.append(h('div', { class: 'slots' })); }
          var b = h('button', { class: 'slot', type: 'button', onclick: function () { wrap.querySelectorAll('.slot.sel').forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); selected = s; confirmBtn.disabled = false; } }, t || s.label);
          wrap.lastChild.append(b);
        });
        var key = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        confirmBtn.addEventListener('click', function () {
          if (!selected) return; confirmBtn.disabled = true; err.textContent = '';
          req('POST', '/conversations/' + conv.id + '/book', { start: selected.start, idempotencyKey: key }).then(function (b) {
            p.replaceChildren(h('div', { class: 'ok' }, 'Your consultation is confirmed: ' + b.booking.label + ' (' + b.booking.timezone + ').'));
            poll();
          }).catch(function (e) {
            err.textContent = e.code === 'slot_unavailable' ? 'Sorry, that time was just taken. Please choose another.' : e.message;
            if (e.code === 'slot_unavailable') setTimeout(showSlots, 1200); else confirmBtn.disabled = false;
          });
        });
        p.append(wrap, err, h('div', { class: 'row' }, confirmBtn, h('button', { class: 'btn alt', type: 'button', onclick: clearPanel }, 'Close')));
      }).catch(function (e) { p.replaceChildren(h('h3', {}, 'Choose a consultation time'), h('div', { class: 'err' }, e.message), h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: showSlots }, 'Try again'))); });
    }).catch(function (e) { bubble('sys', e.message); });
  }

  function poll() {
    if (!conv) return Promise.resolve();
    return req('GET', '/conversations/' + conv.id + '/messages?after=' + encodeURIComponent(cursor)).then(function (r) {
      (r.messages || []).forEach(function (m) { if (m.from !== 'customer') addServer(m); else if (m.createdAt > cursor) cursor = m.createdAt; });
    }).catch(function () { /* transient; next tick retries */ });
  }
  function startPolling() { if (!pollTimer) pollTimer = setInterval(function () { if (!document.hidden) poll(); }, 6000); }

  function init() {
    req('GET', '/config').then(function (c) {
      cfg = c; build();
      var saved = store.get('nl:' + KEY + (PREVIEW ? ':p' : ''));
      if (saved) { try { conv = JSON.parse(saved); startPolling(); poll(); } catch (e) { conv = null; } }
    }).catch(function (e) { root.append(h('div', { class: 'panel' }, h('h3', {}, 'Chat unavailable'), h('div', { class: 'err' }, e.status === 404 ? 'This chat is not available.' : e.message), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: function () { location.reload(); } }, 'Retry')))); });
  }
  init();
})();
