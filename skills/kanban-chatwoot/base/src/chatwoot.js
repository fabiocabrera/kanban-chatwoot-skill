// Cliente da API do Chatwoot.
// - Chamadas de sistema usam CHATWOOT_API_TOKEN (token de um administrador).
// - Login do usuario: os cabecalhos da sessao do Chatwoot (cookie cw_d_session_info) sao validados em /api/v1/profile.
const BASE = (process.env.CHATWOOT_INTERNAL_URL || 'http://rails:3030').replace(/\/$/, '');
const TOKEN = process.env.CHATWOOT_API_TOKEN;

// O Chatwoot roda com FORCE_SSL: na chamada interna (http) avisamos que a origem e https para nao receber redirect.
const BASE_HEADERS = { 'X-Forwarded-Proto': 'https', Accept: 'application/json' };

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...BASE_HEADERS, ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const err = new Error(`Chatwoot ${method} ${path} -> HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

const api = (path, opts = {}) => request(path, { ...opts, headers: { api_access_token: TOKEN, ...(opts.headers || {}) } });

// Cache curto das sessoes validadas, para nao bater no Chatwoot a cada requisicao.
const sessions = new Map();
const SESSION_TTL_MS = 5 * 60 * 1000;

export async function profileFromSession({ accessToken, client, uid }) {
  if (!accessToken || !client || !uid) return null;
  const key = `${uid}|${client}|${accessToken}`;
  const hit = sessions.get(key);
  if (hit && hit.expires > Date.now()) return hit.profile;
  try {
    const profile = await request('/api/v1/profile', {
      headers: { 'access-token': accessToken, client, uid, 'token-type': 'Bearer' },
    });
    sessions.set(key, { profile, expires: Date.now() + SESSION_TTL_MS });
    if (sessions.size > 500) sessions.delete(sessions.keys().next().value);
    return profile;
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
}

export const getConversation = (accountId, id) => api(`/api/v1/accounts/${accountId}/conversations/${id}`);
export const listLabels = (accountId) => api(`/api/v1/accounts/${accountId}/labels`).then((r) => r.payload || []);
export const listAgents = (accountId) => api(`/api/v1/accounts/${accountId}/agents`);
export const listInboxes = (accountId) => api(`/api/v1/accounts/${accountId}/inboxes`).then((r) => r.payload || []);
export const listWebhooks = (accountId) => api(`/api/v1/accounts/${accountId}/webhooks`).then((r) => r.payload?.webhooks || r.payload || []);
export const createWebhook = (accountId, url, subscriptions) =>
  api(`/api/v1/accounts/${accountId}/webhooks`, { method: 'POST', body: { url, subscriptions } });
export const addConversationLabels = (accountId, id, labels) =>
  api(`/api/v1/accounts/${accountId}/conversations/${id}/labels`, { method: 'POST', body: { labels } });
