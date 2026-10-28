// Aba "Kanban" dentro da conversa (Dashboard App do Chatwoot).
// O Chatwoot envia o contexto da conversa por postMessage (evento appContext).
import { el, makeApi, money, timeAgo, toast } from './common.js';
import { openCardModal } from './cardmodal.js';

const app = document.getElementById('app');
let ctx = null;

window.addEventListener('message', (ev) => {
  if (typeof ev.data !== 'string') return;
  let msg;
  try { msg = JSON.parse(ev.data); } catch { return; }
  if (msg?.event !== 'appContext' || !msg.data?.conversation) return;
  const conv = msg.data.conversation;
  if (ctx?.conversation?.id === conv.id && ctx?.conversation?.account_id === conv.account_id) return;
  ctx = msg.data;
  render();
});
window.parent.postMessage('chatwoot-dashboard-app:fetch-info', '*');

async function render() {
  const conv = ctx.conversation;
  const accountId = conv.account_id;
  const api = makeApi(accountId);
  let data;
  try {
    data = await api(`/conversations/${conv.id}/cards`);
  } catch (err) {
    app.replaceChildren(el('div', { class: 'muted' }, err.message));
    return;
  }
  const { cards, funnels } = data;
  const inFunnel = new Set(cards.map((c) => c.funnel_id));
  const allStages = funnels.flatMap((f) => f.stages.map((s) => ({ ...s, funnel_id: f.id, funnel: f.name })));

  const cardBlocks = cards.map((c) => {
    const funnel = funnels.find((f) => f.id === c.funnel_id);
    const sel = el('select', { onchange: async (e) => {
      try { await api(`/cards/${c.id}/move`, { method: 'POST', body: { stage_id: Number(e.target.value) } }); toast('Card movido'); render(); }
      catch (err) { toast(err.message, 'error'); render(); }
    } }, (funnel?.stages || []).map((s) => el('option', { value: s.id, selected: s.id === c.stage_id }, s.name)));
    return el('div', { class: 'card', style: { borderLeft: `4px solid ${c.stage_color}` } },
      el('div', { class: 'row' }, el('strong', { class: 'grow' }, c.funnel_name), el('span', { class: 'muted' }, `⏱ ${timeAgo(c.stage_entered_at)}`)),
      el('label', { class: 'muted' }, 'Etapa', sel),
      el('div', { class: 'meta', style: { marginTop: '6px' } },
        c.value != null ? el('span', {}, money(c.value)) : null,
        c.tasks_total ? el('span', { class: 'chip' }, `☑ ${c.tasks_done}/${c.tasks_total}`) : null,
        c.notes_count ? el('span', {}, `🗒 ${c.notes_count}`) : null,
        c.attachments_count ? el('span', {}, `📎 ${c.attachments_count}`) : null),
      el('button', { style: { marginTop: '8px' }, onclick: () => openCardModal({ api, accountId, cardId: c.id, stages: funnel?.stages || [], onChange: render }) },
        'Tarefas, notas e anexos'));
  });

  const options = allStages.filter((s) => !inFunnel.has(s.funnel_id));
  const addSel = el('select', {}, options.map((s) => el('option', { value: s.id }, `${s.funnel} › ${s.name}`)));
  const addBlock = options.length
    ? el('div', { class: 'card' }, el('strong', {}, cards.length ? 'Adicionar a outro funil' : 'Adicionar esta conversa ao Kanban'), addSel,
        el('button', { class: 'primary', style: { marginTop: '8px' }, onclick: async () => {
          try { await api('/cards', { method: 'POST', body: { stage_id: Number(addSel.value), conversation_id: conv.id } }); render(); }
          catch (err) { toast(err.message, 'error'); }
        } }, 'Criar card'))
    : null;

  app.replaceChildren(
    el('div', { class: 'row' }, el('strong', { class: 'grow' }, ctx.contact?.name || `Conversa #${conv.id}`),
      el('a', { href: `/kanban/?account=${accountId}`, target: '_blank', class: 'muted' }, 'abrir quadro')),
    cards.length ? null : el('div', { class: 'muted' }, 'Esta conversa ainda não está no Kanban.'),
    ...cardBlocks,
    addBlock,
  );
}
