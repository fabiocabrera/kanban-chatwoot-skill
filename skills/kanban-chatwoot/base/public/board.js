// Quadro Kanban em tela cheia.
import { accountFromUrl, el, initials, makeApi, money, timeAgo, toast } from './common.js';
import { openCardModal } from './cardmodal.js';

const accountId = accountFromUrl();
const api = makeApi(accountId);
const app = document.getElementById('app');
const state = { user: null, funnels: [], funnelId: null, stages: [], cards: [], view: 'board', search: '' };
const savedFunnel = () => { try { return Number(localStorage.getItem('kanban:funnel')) || null; } catch { return null; } };

async function load(funnelId = state.funnelId || savedFunnel()) {
  const data = await api(`/board${funnelId ? `?funnel_id=${funnelId}` : ''}`).catch(async (err) => {
    if (err.status === 404 && funnelId) return api('/board');
    throw err;
  });
  Object.assign(state, { funnels: data.funnels, funnelId: data.funnelId, stages: data.stages, cards: data.cards });
  try { localStorage.setItem('kanban:funnel', String(data.funnelId)); } catch { /* opcional */ }
  render();
}

function render() {
  const isAdmin = state.user?.role === 'administrator';
  const search = el('input', { class: 'search', placeholder: 'Buscar card...', value: state.search, oninput: (e) => { state.search = e.target.value; renderBoard(); } });
  const top = el('div', { class: 'topbar' },
    el('div', { class: 'tabs' }, state.funnels.map((f) => el('button', {
      class: `tab ${state.view === 'board' && f.id === state.funnelId ? 'active' : ''}`,
      onclick: () => { state.view = 'board'; load(f.id); },
    }, f.name))),
    el('span', { class: 'grow' }),
    state.view === 'board' ? search : null,
    el('button', { class: `tab ${state.view === 'reports' ? 'active' : ''}`, onclick: () => { state.view = 'reports'; render(); } }, 'Relatórios'),
    isAdmin ? el('button', { onclick: openSettings }, '⚙ Funis e regras') : null,
  );
  const body = el('div', { id: 'body' });
  app.replaceChildren(top, body);
  if (state.view === 'reports') renderReports(body);
  else renderBoard();
}

function cardMatches(c) {
  const s = state.search.trim().toLowerCase();
  if (!s) return true;
  return [c.title, c.description, c.inbox_name, c.assignee_name, c.conversation_id && `#${c.conversation_id}`]
    .some((v) => v && String(v).toLowerCase().includes(s));
}

function cardNode(c) {
  return el('div', { class: 'card', 'data-id': c.id, onclick: () => openCardModal({ api, accountId, cardId: c.id, stages: state.stages, onChange: () => load() }) },
    el('div', { class: 'title' }, c.title),
    el('div', { class: 'meta' },
      c.conversation_id ? el('span', {}, `💬 #${c.conversation_id}`) : el('span', {}, '📝 solto'),
      c.inbox_name ? el('span', { class: 'chip' }, c.inbox_name) : null,
      c.value != null ? el('span', {}, money(c.value)) : null,
      c.tasks_total ? el('span', { class: `chip ${c.tasks_done === c.tasks_total ? 'ok' : ''}` }, `☑ ${c.tasks_done}/${c.tasks_total}`) : null,
      c.attachments_count ? el('span', {}, `📎 ${c.attachments_count}`) : null,
      el('span', { title: 'Tempo na etapa' }, `⏱ ${timeAgo(c.stage_entered_at)}`),
      c.assignee_name ? el('span', { class: 'avatar', title: c.assignee_name }, initials(c.assignee_name)) : null,
    ));
}

function renderBoard() {
  const body = document.getElementById('body');
  if (!body) return;
  if (!state.stages.length) {
    body.replaceChildren(el('div', { class: 'empty' }, 'Este funil não tem etapas. Um administrador pode criá-las em "Funis e regras".'));
    return;
  }
  const board = el('div', { class: 'board' });
  for (const st of state.stages) {
    const cards = state.cards.filter((c) => c.stage_id === st.id && cardMatches(c));
    const total = cards.reduce((sum, c) => sum + (Number(c.value) || 0), 0);
    const list = el('div', { class: 'cards', 'data-stage': st.id }, cards.map(cardNode));
    board.append(el('div', { class: 'column', style: { '--stage': st.color } },
      el('div', { class: 'column-head' }, el('strong', {}, st.name), el('span', { class: 'count' }, cards.length),
        total ? el('span', { class: 'sum' }, money(total)) : null),
      list,
      el('button', { class: 'add-card', onclick: () => newCard(st) }, '+ Novo card')));
    // eslint-disable-next-line no-undef
    Sortable.create(list, {
      group: 'cards', animation: 150, disabled: !!state.search.trim(),
      onEnd: async (ev) => {
        const toStage = Number(ev.to.dataset.stage);
        const ordered = [...ev.to.querySelectorAll('.card')].map((n) => Number(n.dataset.id));
        try {
          await api(`/cards/${ev.item.dataset.id}/move`, { method: 'POST', body: { stage_id: toStage, ordered_ids: ordered } });
          const card = state.cards.find((c) => c.id === Number(ev.item.dataset.id));
          if (card && card.stage_id !== toStage) { card.stage_id = toStage; card.stage_entered_at = new Date().toISOString(); }
          load();
        } catch (err) { toast(err.message, 'error'); load(); }
      },
    });
  }
  body.replaceChildren(board);
}

async function newCard(stage) {
  const title = prompt(`Novo card em "${stage.name}"\n\nTítulo (nome do cliente, tarefa...).\nPara ligar a uma conversa existente, digite # e o número (ex.: #123).`);
  if (!title || !title.trim()) return;
  const m = title.trim().match(/^#(\d+)$/);
  try {
    await api('/cards', { method: 'POST', body: m ? { stage_id: stage.id, conversation_id: Number(m[1]) } : { stage_id: stage.id, title: title.trim() } });
    load();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- configuracao (administradores) ----------
async function openSettings() {
  const overlay = el('div', { class: 'overlay', onclick: (e) => e.target === overlay && close() });
  const modal = el('div', { class: 'modal' });
  overlay.append(modal);
  document.body.append(overlay);
  const close = () => { overlay.remove(); load(); };

  async function draw() {
    const [{ funnels }, { rules, labels }] = await Promise.all([api(`/board?funnel_id=${state.funnelId}`), api('/rules')]);
    const funnelBlocks = [];
    const allStages = [];
    for (const f of funnels) {
      const { stages } = await api(`/board?funnel_id=${f.id}`);
      allStages.push(...stages.map((s) => ({ ...s, funnel: f.name })));
      const newStage = el('input', { placeholder: 'Nova etapa e Enter' });
      newStage.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter' || !newStage.value.trim()) return;
        await call(`/funnels/${f.id}/stages`, 'POST', { name: newStage.value });
      });
      funnelBlocks.push(el('div', { class: 'section' },
        el('div', { class: 'row' }, el('h3', { class: 'grow', style: { margin: 0 } }, f.name),
          el('button', { class: 'link', onclick: () => { const n = prompt('Novo nome do funil', f.name); if (n) call(`/funnels/${f.id}`, 'PATCH', { name: n }); } }, 'renomear'),
          el('button', { class: 'link danger', onclick: () => confirm(`Excluir o funil "${f.name}"?`) && call(`/funnels/${f.id}`, 'DELETE') }, 'excluir')),
        stages.map((s, i) => el('div', { class: 'list-item' },
          el('input', { type: 'color', value: s.color, style: { width: '36px', padding: '0' }, onchange: (e) => call(`/stages/${s.id}`, 'PATCH', { color: e.target.value }) }),
          el('span', { class: 'grow' }, s.name),
          el('button', { class: 'link', disabled: i === 0, onclick: () => reorder(f.id, stages, i, -1) }, '↑'),
          el('button', { class: 'link', disabled: i === stages.length - 1, onclick: () => reorder(f.id, stages, i, 1) }, '↓'),
          el('button', { class: 'link', onclick: () => { const n = prompt('Novo nome da etapa', s.name); if (n) call(`/stages/${s.id}`, 'PATCH', { name: n }); } }, 'renomear'),
          el('button', { class: 'link danger', onclick: () => call(`/stages/${s.id}`, 'DELETE') }, 'excluir'))),
        newStage));
    }

    const labelSel = el('select', {}, el('option', { value: '' }, 'Etiqueta...'), labels.map((l) => el('option', { value: l.title }, l.title)));
    const stageSel = el('select', {}, el('option', { value: '' }, 'Funil / etapa...'), allStages.map((s) => el('option', { value: s.id }, `${s.funnel} › ${s.name}`)));
    const ruleBlock = el('div', { class: 'section' },
      el('h3', {}, 'Roteamento por etiqueta'),
      el('div', { class: 'muted', style: { marginBottom: '8px' } },
        'Quando uma conversa recebe a etiqueta, um card é criado na etapa escolhida (um por conversa em cada funil). As etiquetas são criadas no Chatwoot, em Configurações › Etiquetas.'),
      rules.map((r) => el('div', { class: 'list-item' }, el('span', { class: 'chip' }, r.label), el('span', { class: 'grow' }, `→ ${r.funnel_name} › ${r.stage_name}`),
        el('button', { class: 'link danger', onclick: () => call(`/rules/${r.id}`, 'DELETE') }, 'remover'))),
      el('div', { class: 'row', style: { marginTop: '8px' } }, labelSel, stageSel,
        el('button', { class: 'primary', onclick: () => labelSel.value && stageSel.value && call('/rules', 'POST', { label: labelSel.value, stage_id: Number(stageSel.value) }) }, 'Adicionar')),
      labels.length ? null : el('div', { class: 'muted' }, 'Nenhuma etiqueta criada no Chatwoot ainda.'));

    modal.replaceChildren(
      el('div', { class: 'modal-head' }, el('h2', { class: 'grow' }, 'Funis e regras'), el('button', { onclick: close }, 'Fechar')),
      ...funnelBlocks,
      el('button', { onclick: () => { const n = prompt('Nome do novo funil (ex.: Suporte, Pós-venda)'); if (n) call('/funnels', 'POST', { name: n }); } }, '+ Novo funil'),
      ruleBlock,
    );
  }
  async function call(path, method, body) {
    try { await api(path, { method, body }); await draw(); } catch (err) { toast(err.message, 'error'); }
  }
  async function reorder(funnelId, stages, i, dir) {
    const ids = stages.map((s) => s.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    await call(`/funnels/${funnelId}/stages/reorder`, 'POST', { ordered_ids: ids });
  }
  await draw();
}

// ---------- relatorios ----------
async function renderReports(body) {
  body.replaceChildren(el('div', { class: 'empty' }, 'Carregando relatórios...'));
  const days = Number(sessionStorage.getItem('kanban:days')) || 30;
  const funnelSel = el('select', { style: { width: 'auto' } }, el('option', { value: '' }, 'Todos os funis'),
    state.funnels.map((f) => el('option', { value: f.id }, f.name)));
  const daysSel = el('select', { style: { width: 'auto' } }, [7, 30, 90].map((d) => el('option', { value: d, selected: d === days }, `Últimos ${d} dias`)));
  const draw = async () => {
    sessionStorage.setItem('kanban:days', daysSel.value);
    const r = await api(`/reports?days=${daysSel.value}${funnelSel.value ? `&funnel_id=${funnelSel.value}` : ''}`);
    const max = Math.max(1, ...r.byStage.map((s) => s.cards));
    const byFunnel = Map.groupBy ? Map.groupBy(r.byStage, (s) => s.funnel_name) : r.byStage.reduce((m, s) => m.set(s.funnel_name, [...(m.get(s.funnel_name) || []), s]), new Map());
    content.replaceChildren(
      el('div', { class: 'panel' }, el('h3', {}, 'Cards ativos por etapa'),
        [...byFunnel].map(([funnel, rows]) => el('div', { style: { marginTop: '12px' } }, el('strong', {}, funnel),
          rows.map((s) => el('div', { class: 'row', style: { margin: '6px 0' } },
            el('span', { style: { width: '160px' } }, s.stage_name),
            el('div', { class: 'grow' }, el('div', { class: 'bar', style: { width: `${(s.cards / max) * 100}%`, background: s.color, minWidth: s.cards ? '6px' : '0' } })),
            el('span', { style: { width: '120px', textAlign: 'right' } }, `${s.cards}${s.value ? ` · ${money(s.value)}` : ''}`)))))),
      el('div', { class: 'panel' }, el('h3', {}, 'Produtividade por atendente'),
        r.byAgent.length
          ? el('table', {}, el('tr', {}, el('th', {}, 'Atendente'), el('th', {}, 'Cards criados'), el('th', {}, 'Movimentações'), el('th', {}, 'Tarefas concluídas')),
              r.byAgent.map((a) => el('tr', {}, el('td', {}, a.user_name), el('td', {}, a.created), el('td', {}, a.moves), el('td', {}, a.tasks_done))))
          : el('div', { class: 'muted' }, 'Sem movimentação no período.')),
      el('div', { class: 'panel' }, el('h3', {}, 'Cards criados por dia'),
        r.createdPerDay.length
          ? el('table', {}, r.createdPerDay.map((d) => el('tr', {}, el('td', {}, new Date(`${d.day}T12:00:00`).toLocaleDateString('pt-BR')), el('td', {}, d.cards))))
          : el('div', { class: 'muted' }, 'Nenhum card criado no período.')),
    );
  };
  const content = el('div', { class: 'report' });
  funnelSel.onchange = draw;
  daysSel.onchange = draw;
  body.replaceChildren(el('div', { class: 'row', style: { padding: '16px 16px 0' } }, funnelSel, daysSel), content);
  await draw().catch((err) => toast(err.message, 'error'));
}

async function start() {
  try {
    const me = await api('/me');
    state.user = me.user;
    await load();
    setInterval(() => { if (state.view === 'board' && !document.querySelector('.overlay') && !document.querySelector('.sortable-chosen')) load(); }, 20000);
  } catch (err) {
    app.replaceChildren(el('div', { class: 'empty' }, err.message));
  }
}
start();
