// Tiny DOM toolkit. Everything user-supplied goes in via textContent / properties, never innerHTML, so stored customer text cannot inject markup.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const mount = (el, ...children) => { clear(el); append(el, children); return el; };

// ---------- Formatting ----------
let TZ = 'Asia/Singapore';
export const setTimezone = (tz) => { TZ = tz || TZ; };
export const tz = () => TZ;
const fmt = (opts) => new Intl.DateTimeFormat('en-SG', { timeZone: TZ, ...opts });
export const fmtDateTime = (iso) => iso ? fmt({ day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)) : '—';
export const fmtDate = (iso) => iso ? fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—';
export const fmtTime = (iso) => fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
export const fmtDayLong = (iso) => fmt({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
export const dayKey = (iso) => fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)).split('/').reverse().join('-');
export function fmtRelative(iso) {
  if (!iso) return '—';
  const diff = Date.now() - Date.parse(iso); const abs = Math.abs(diff); const m = Math.round(abs / 60000);
  const fut = diff < 0; let t;
  if (m < 1) return 'just now';
  if (m < 60) t = `${m}m`; else if (m < 1440) t = `${Math.round(m / 60)}h`; else t = `${Math.round(m / 1440)}d`;
  return fut ? `in ${t}` : `${t} ago`;
}
/** datetime-local value (agency timezone wall clock) -> ISO UTC. */
export function localInputToIso(value) {
  const [d, t] = value.split('T'); const [y, mo, da] = d.split('-').map(Number); const [hh, mm] = t.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, da, hh, mm);
  const offsetOf = (ms) => { const p = Object.fromEntries(fmt({ hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000; };
  let ms = naive - offsetOf(naive) * 60000; ms = naive - offsetOf(ms) * 60000;
  return new Date(ms).toISOString();
}
export function isoToLocalInput(iso) {
  const p = Object.fromEntries(fmt({ hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const STATUS_LABEL = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', consultation_booked: 'Consultation booked', follow_up_required: 'Follow-up required', converted: 'Converted', closed: 'Closed / not proceeding' };
export const label = (s) => STATUS_LABEL[s] || String(s).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const badge = (s, text) => h('span', { class: `badge ${s}` }, text ?? label(s));
export const phoneFmt = (p) => p ? (p.startsWith('65') && p.length === 10 ? `+65 ${p.slice(2, 6)} ${p.slice(6)}` : '+' + p) : '';

// ---------- States ----------
export const loading = (text = 'Loading…') => h('div', { class: 'state', role: 'status' }, h('div', { class: 'spinner' }), text);
export const empty = (title, text, action) => h('div', { class: 'state' }, h('h3', {}, title), text && h('p', {}, text), action);
export function errorState(err, retry) {
  return h('div', { class: 'state', role: 'alert' }, h('h3', {}, err && err.status === 403 ? 'You don’t have access to this' : 'Something went wrong'), h('p', {}, err?.message || 'Please try again.'),
    retry && err?.status !== 403 && h('button', { class: 'btn', onclick: retry }, 'Try again'));
}

// ---------- Toasts, modals, drawers ----------
let toastHost;
export function toast(message, kind = '') {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const t = h('div', { class: `toast ${kind}` }, message); toastHost.append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
}
export const toastError = (e) => toast(e?.message || 'Something went wrong', 'bad');

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const overlay = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === overlay) close(); } });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  const foot = h('div', { class: 'modal-foot' });
  const box = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'btn ghost sm', 'aria-label': 'Close', onclick: close }, '✕')),
    h('div', { class: 'modal-body' }, body), actions.length ? foot : null);
  const api = { close, overlay, setBusy(b) { foot.querySelectorAll('button').forEach((x) => (x.disabled = b)); } };
  for (const a of actions) foot.append(h('button', { class: `btn ${a.kind || ''}`, onclick: async (e) => { if (a.close) return close(); api.setBusy(true); try { await a.run(api); } finally { api.setBusy(false); } } }, a.label));
  overlay.append(box); document.body.append(overlay);
  const first = box.querySelector('input,select,textarea'); if (first) first.focus();
  return api;
}
export function confirmDialog({ title, text, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    modal({ title, body: h('p', {}, text), onClose: () => finish(false), actions: [
      { label: 'Cancel', close: true },
      { label: confirmLabel, kind: danger ? 'danger' : 'primary', run: async (m) => { finish(true); m.close(); } }] });
  });
}
export function drawer({ title, subtitle, body, onClose }) {
  const overlay = h('div', { class: 'drawer-overlay', onmousedown: (e) => { if (e.target === overlay) close(); } });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape' && !document.querySelector('.overlay')) close(); };
  document.addEventListener('keydown', esc);
  const titleEl = h('div', {}, h('h2', {}, title), subtitle && h('div', { class: 'muted small' }, subtitle));
  const content = h('div', { class: 'drawer-body' }, body);
  overlay.append(h('aside', { class: 'drawer', role: 'dialog', 'aria-label': title }, h('div', { class: 'drawer-head' }, titleEl, h('button', { class: 'btn ghost sm', 'aria-label': 'Close', onclick: close }, '✕')), content));
  document.body.append(overlay);
  return { close, content, setTitle: (t, s) => mount(titleEl, h('h2', {}, t), s && h('div', { class: 'muted small' }, s)) };
}

// ---------- Forms ----------
export function field(labelText, control, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8); control.id = id;
  const err = h('div', { class: 'err', role: 'alert' });
  const el = h('div', { class: 'field' }, h('label', { for: id }, labelText), control, hint && h('div', { class: 'hint' }, hint), err);
  el.setError = (m) => { err.textContent = m || ''; control.setAttribute('aria-invalid', m ? 'true' : 'false'); };
  return el;
}
export const input = (props = {}) => h('input', { class: 'input', ...props });
export const textarea = (props = {}) => h('textarea', { class: 'textarea', ...props });
export function select(options, value, props = {}) {
  const s = h('select', { class: 'select', ...props }, options.map((o) => { const [v, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(value) }, t); }));
  return s;
}
/** Maps server validation details onto form fields. Returns true if anything was mapped. */
export function showFieldErrors(err, fields) {
  for (const f of Object.values(fields)) f.setError && f.setError('');
  let any = false;
  for (const d of err?.details || []) { const f = fields[d.field] || fields[d.field.split('.')[0]]; if (f) { f.setError(d.message); any = true; } }
  return any;
}
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const copyText = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied', 'ok'); } catch { toast('Copy failed — select the text and copy it manually', 'bad'); } };
