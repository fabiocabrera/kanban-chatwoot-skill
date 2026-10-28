// Sessao do Chatwoot (mesmo dominio) + chamadas a API do Kanban.
export function chatwootSession() {
  const raw = document.cookie.split('; ').find((c) => c.startsWith('cw_d_session_info='));
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw.slice('cw_d_session_info='.length)));
  } catch {
    return null;
  }
}

export function accountFromUrl() {
  const fromQuery = new URLSearchParams(location.search).get('account');
  if (fromQuery) return Number(fromQuery);
  try {
    const m = window.top.location.pathname.match(/\/accounts\/(\d+)/);
    if (m) return Number(m[1]);
  } catch {
    /* sem acesso ao topo */
  }
  return 1;
}

export function makeApi(accountId) {
  const base = `/kanban/api/accounts/${accountId}`;
  return async function api(path, { method = 'GET', body, form } = {}) {
    const s = chatwootSession();
    if (!s) throw Object.assign(new Error('Entre no Chatwoot para usar o Kanban.'), { status: 401 });
    const headers = { 'access-token': s['access-token'], client: s.client, uid: s.uid };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(base + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    if (path.includes('/attachments/') && method === 'GET') return res;
    const data = res.status === 204 ? null : await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || `Erro ${res.status}`), { status: res.status });
    return data;
  };
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function toast(msg, kind = 'info') {
  const t = el('div', { class: `toast toast-${kind}` }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 4000);
}

export const money = (v) =>
  v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}

export const initials = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

// Abre a conversa no Chatwoot (na janela principal quando estiver dentro do Chatwoot).
export function openConversation(accountId, convId) {
  const url = `/app/accounts/${accountId}/conversations/${convId}`;
  try {
    window.top.postMessage({ type: 'kanban:open-conversation', url }, location.origin);
    if (window.top !== window) return;
  } catch {
    /* segue para abrir aqui */
  }
  window.open(url, '_blank');
}
