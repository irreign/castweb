import { api } from '../api.js';
import { h, mount, loading, errorState, empty, badge, fmtDateTime, select, input, textarea, field, modal, toast, toastError, confirmDialog, showFieldErrors } from '../ui.js';

const TYPES = [['faq', 'FAQ'], ['service', 'Service description'], ['fees', 'Fee schedule / approved fee explanation'], ['policy', 'Agency policy'], ['procedure', 'Consultation procedure'], ['hours', 'Office hours & contact'], ['document', 'Document'], ['website', 'Website content'], ['other', 'Other']];
const typeLabel = (t) => (TYPES.find((x) => x[0] === t) || [, t])[1];

export default async function knowledge(root) {
  const host = h('div', {}); const testHost = h('div', {});
  mount(root, h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Knowledge Base'), h('p', {}, 'The only information the assistant is allowed to answer from. Review, test, then publish.')),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn', onclick: addFaq }, '+ FAQ'), h('button', { class: 'btn', onclick: addText }, '+ Text'), h('button', { class: 'btn', onclick: addFile }, '+ Upload file'), h('button', { class: 'btn', onclick: addUrl }, '+ Web page'))),
    h('div', { class: 'grid two' }, h('div', { class: 'card' }, host), testPanel()));

  async function load() {
    mount(host, loading());
    try {
      const { items } = await api.get('/app/knowledge');
      if (!items.length) return mount(host, empty('Nothing here yet', 'Start with your most common questions: fees you are happy to share, office hours, how consultations work.', h('button', { class: 'btn primary', onclick: addFaq }, 'Add your first FAQ')));
      mount(host, h('div', { class: 'table-wrap' }, h('table', { class: 't' }, h('thead', {}, h('tr', {}, ['Source', 'Type', 'Status', 'Live', 'Updated', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, items.map((s) => h('tr', {}, h('td', {}, h('strong', {}, s.title), s.status === 'failed' && h('div', { class: 'small', style: { color: 'var(--bad)' } }, s.error), s.original_name && h('div', { class: 'small muted' }, `${s.original_name} · v${s.version}`), !s.original_name && h('div', { class: 'small muted' }, `v${s.version}${s.source_url ? ' · ' + s.source_url : ''}`)),
          h('td', {}, typeLabel(s.type)), h('td', {}, badge(s.status, s.status === 'ready' ? 'Ready' : s.status === 'failed' ? 'Failed' : 'Processing'), s.status === 'ready' && h('div', { class: 'small faint' }, `${s.chunk_count} passage${s.chunk_count === 1 ? '' : 's'}`)),
          h('td', {}, s.published ? badge('ready', 'Published') : badge('closed', 'Not published')), h('td', { class: 'small nowrap' }, fmtDateTime(s.updated_at)),
          h('td', { class: 'nowrap' }, s.status === 'ready' && h('button', { class: 'btn sm', onclick: async () => { try { await api.patch(`/app/knowledge/${s.id}`, { published: !s.published }); toast(s.published ? 'Unpublished' : 'Published — the assistant can now use it', 'ok'); load(); } catch (e) { toastError(e); } } }, s.published ? 'Unpublish' : 'Publish'), ' ',
            s.status === 'failed' && [h('button', { class: 'btn sm', onclick: async () => { try { const r = await api.post(`/app/knowledge/${s.id}/reprocess`); toast(r.status === 'ready' ? 'Processed' : 'Still failing: ' + (r.error || ''), r.status === 'ready' ? 'ok' : 'bad'); load(); } catch (e) { toastError(e); } } }, 'Retry'), ' '],
            h('button', { class: 'btn sm', onclick: () => edit(s.id) }, 'Edit'), ' ', h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmDialog({ title: 'Delete this source?', text: `“${s.title}” will stop being used immediately and its text is removed.`, confirmLabel: 'Delete', danger: true })) { try { await api.del(`/app/knowledge/${s.id}`); toast('Deleted', 'ok'); load(); } catch (e) { toastError(e); } } } }, 'Delete'))))))));
    } catch (e) { mount(host, errorState(e, load)); }
  }

  function testPanel() {
    const q = textarea({ placeholder: 'e.g. What are your office hours? How much is the placement fee?', rows: 3, 'aria-label': 'Test question' });
    const inc = h('input', { type: 'checkbox', checked: true });
    return h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', {}, 'Test before you publish')), h('div', { class: 'card-pad stack' },
      h('p', { class: 'muted small' }, 'Ask a typical customer question and see which approved passages the assistant would use. If nothing matches, it will say it doesn’t know and offer a person.'), q,
      h('label', { class: 'check' }, inc, h('span', {}, 'Include sources that are not published yet')),
      h('button', { class: 'btn primary', style: { alignSelf: 'flex-start' }, onclick: async () => {
        if (q.value.trim().length < 2) return toast('Type a question first', 'bad'); mount(testHost, loading('Checking…'));
        try { const r = await api.post('/app/knowledge-test', { question: q.value.trim(), includeUnpublished: inc.checked });
          mount(testHost, h('div', { class: `alert ${r.answerable ? 'ok' : 'warn'}` }, r.message), r.hits.map((x) => h('div', { class: 'card card-pad', style: { marginTop: '8px' } }, h('div', { class: 'row spread' }, h('strong', {}, x.title), h('span', { class: 'small muted' }, `${x.coverage}% of your words matched`)), h('p', { class: 'small', style: { whiteSpace: 'pre-wrap', margin: '6px 0 0' } }, x.snippet)))); } catch (e) { mount(testHost, errorState(e)); }
      } }, 'Test question'), testHost));
  }

  const formModal = (title, fields, submit, extra) => {
    const m = modal({ title, wide: true, body: h('div', { class: 'stack' }, ...Object.values(fields), extra), actions: [{ label: 'Cancel', close: true }, { label: 'Save', kind: 'primary', run: async (mm) => { try { await submit(mm); } catch (e) { if (!showFieldErrors(e, fields)) toastError(e); } } }] });
    return m;
  };
  const val = (f) => f.querySelector('input,textarea,select').value.trim();
  const note = h('p', { class: 'small muted' }, 'New and edited content is saved as not published. Test it, then publish it.');
  function addFaq() {
    const f = { question: field('Customer question', input({ maxlength: 300 })), answer: field('Approved answer', textarea({ rows: 6, maxlength: 3000 }), 'Write exactly what you are happy for the assistant to say. Avoid promises about availability or outcomes.') };
    formModal('Add FAQ', f, async (m) => { await api.post('/app/knowledge/faq', { question: val(f.question), answer: val(f.answer) }); toast('FAQ saved', 'ok'); m.close(); load(); }, note);
  }
  function addText() {
    const f = { title: field('Title', input({ maxlength: 160 })), type: field('Type', select(TYPES.filter((t) => t[0] !== 'faq'), 'service')), content: field('Content', textarea({ rows: 10, maxlength: 200000 }), 'Paste approved text: service descriptions, fee explanations, policies, procedures, office hours.') };
    formModal('Add text', f, async (m) => { await api.post('/app/knowledge/text', { title: val(f.title), type: val(f.type), content: val(f.content) }); toast('Saved', 'ok'); m.close(); load(); }, note);
  }
  function addUrl() {
    const f = { url: field('Page address', input({ type: 'url', placeholder: 'https://youragency.sg/services' }), 'One public https page. We fetch the visible text once; re-import to refresh.'), title: field('Title (optional)', input({ maxlength: 160 })) };
    formModal('Import a web page', f, async (m) => { const r = await api.post('/app/knowledge/url', { url: val(f.url), title: val(f.title) || undefined }); toast(r.status === 'ready' ? 'Imported' : 'Import failed — see the error in the list', r.status === 'ready' ? 'ok' : 'bad'); m.close(); load(); }, note);
  }
  function addFile() {
    const file = h('input', { type: 'file', accept: '.txt,.md,.csv,.html,.htm', class: 'input' });
    const f = { file: field('File', file, 'Supported: .txt, .md, .csv, .html (max 1 MB). For PDFs or Word files, copy the text into “+ Text” for now.'), title: field('Title (optional)', input({ maxlength: 160 })), type: field('Type', select(TYPES.filter((t) => t[0] !== 'faq'), 'document')) };
    const bar = h('progress', { max: 1, value: 0, class: 'hidden', style: { width: '100%' } });
    formModal('Upload a document', f, async (m) => {
      if (!file.files[0]) return toast('Choose a file first', 'bad');
      const fd = new FormData(); fd.append('file', file.files[0]); fd.append('type', val(f.type)); if (val(f.title)) fd.append('title', val(f.title));
      bar.classList.remove('hidden');
      try { const r = await api.upload('/app/knowledge/upload', fd, (p) => { bar.value = p; }); toast(r.status === 'ready' ? 'Uploaded and processed' : 'Uploaded, but processing failed: ' + r.error, r.status === 'ready' ? 'ok' : 'bad'); m.close(); load(); }
      finally { bar.classList.add('hidden'); }
    }, h('div', {}, bar, note));
  }
  async function edit(id) {
    let s; try { s = await api.get(`/app/knowledge/${id}`); } catch (e) { return toastError(e); }
    if (s.type === 'website') { toast('Web page sources are refreshed with Retry or by deleting and re-importing.'); }
    const f = { title: field('Title', input({ value: s.title, maxlength: 160 })) };
    if (s.type === 'faq') f.question = field('Question', input({ value: s.question || '', maxlength: 300 }));
    f.content = field(s.type === 'faq' ? 'Answer' : 'Content', textarea({ rows: 10, value: s.content_text || '' }), 'Saving a change creates a new version and takes the source off “Published” until you re-publish it.');
    formModal(`Edit — v${s.version}`, f, async (m) => {
      const patch = { title: val(f.title), content: val(f.content) }; if (f.question) patch.question = val(f.question);
      await api.patch(`/app/knowledge/${id}`, patch); toast('Saved as a new version (not published)', 'ok'); m.close(); load();
    });
  }
  load();
}
