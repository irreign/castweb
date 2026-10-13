export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}

async function request(method, path, body, opts = {}) {
  const init = { method, headers: { 'x-requested-with': 'nexus' }, credentials: 'same-origin' };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, init); }
  catch { throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.'); }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const e = data && data.error ? data.error : {};
    const err = new ApiError(res.status, e.code || 'error', e.message || `Request failed (${res.status})`, e.details);
    if (res.status === 401 && !opts.quiet401) window.dispatchEvent(new CustomEvent('nl:unauthorized'));
    throw err;
  }
  return data;
}

export const api = {
  get: (p, o) => request('GET', p, undefined, o),
  post: (p, b = {}, o) => request('POST', p, b, o),
  put: (p, b = {}) => request('PUT', p, b),
  patch: (p, b = {}) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  qs: (obj) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') q.set(k, v); const s = q.toString(); return s ? '?' + s : ''; },
  /** Multipart upload with progress (fetch cannot report upload progress). */
  upload(path, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('POST', '/api' + path);
      x.setRequestHeader('x-requested-with', 'nexus');
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onerror = () => reject(new ApiError(0, 'network', 'Upload failed. Check your connection and try again.'));
      x.onload = () => {
        let data = null; try { data = JSON.parse(x.responseText); } catch { /* ignore */ }
        if (x.status >= 200 && x.status < 300) resolve(data);
        else { const e = (data && data.error) || {}; reject(new ApiError(x.status, e.code || 'error', e.message || `Upload failed (${x.status})`, e.details)); }
      };
      x.send(formData);
    });
  },
};
