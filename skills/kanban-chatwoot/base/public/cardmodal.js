// Janela de detalhes do card: dados, tarefas, notas, anexos e historico.
import { el, money, openConversation, toast } from './common.js';

const EVENT_TEXT = {
  created: (d) => `criou o card${d.reason && d.reason !== 'manual' ? ` (${d.reason})` : ''}`,
  moved: () => 'moveu de etapa',
  archived: () => 'arquivou o card',
  linked: (d) => `ligou à conversa #${d.conversation_id}`,
  task_done: (d) => `concluiu a tarefa "${d.task}"`,
  task_reopened: (d) => `reabriu a tarefa "${d.task}"`,
  attachment_added: (d) => `anexou ${d.filename}`,
  attachment_removed: (d) => `removeu o anexo ${d.filename}`,
};

export async function openCardModal({ api, accountId, cardId, stages = [], onChange = () => {} }) {
  const overlay = el('div', { class: 'overlay', onclick: (e) => e.target === overlay && close() });
  const modal = el('div', { class: 'modal' }, el('div', { class: 'muted' }, 'Carregando...'));
  overlay.append(modal);
  document.body.append(overlay);
  let changed = false;
  function close() {
    overlay.remove();
    if (changed) onChange();
  }
  const mark = () => { changed = true; };

  async function render() {
    let data;
    try {
      data = await api(`/cards/${cardId}`);
    } catch (err) {
      toast(err.message, 'error');
      return close();
    }
    const { card, tasks, notes, attachments, events } = data;
    const stageName = (id) => stages.find((s) => s.id === id)?.name;

    const title = el('input', { value: card.title });
    const value = el('input', { type: 'number', step: '0.01', min: '0', value: card.value ?? '', placeholder: 'R$ 0,00' });
    const desc = el('textarea', { placeholder: 'Descrição, dados do cliente, observações...' }, card.description);
    const save = async () => {
      try {
        await api(`/cards/${card.id}`, { method: 'PATCH', body: { title: title.value, description: desc.value, value: value.value } });
        mark();
        toast('Card salvo');
      } catch (err) { toast(err.message, 'error'); }
    };

    const linkInput = el('input', { placeholder: 'Nº da conversa no Chatwoot' });
    const conversationBox = card.conversation_id
      ? el('div', { class: 'row' },
          el('span', {}, `Conversa #${card.conversation_id}${card.inbox_name ? ` · ${card.inbox_name}` : ''}`),
          el('button', { class: 'link', onclick: () => openConversation(accountId, card.conversation_id) }, 'abrir conversa'))
      : el('div', { class: 'row' }, el('span', { class: 'muted' }, 'Card solto (sem conversa).'), linkInput,
          el('button', { onclick: async () => {
            try { await api(`/cards/${card.id}/link`, { method: 'POST', body: { conversation_id: Number(linkInput.value) } }); mark(); render(); }
            catch (err) { toast(err.message, 'error'); }
          } }, 'Ligar'));

    const newTask = el('input', { placeholder: 'Nova tarefa e Enter' });
    newTask.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || !newTask.value.trim()) return;
      try { await api(`/cards/${card.id}/tasks`, { method: 'POST', body: { text: newTask.value } }); mark(); render(); }
      catch (err) { toast(err.message, 'error'); }
    });
    const taskList = tasks.map((t) => el('div', { class: `list-item task ${t.done ? 'done' : ''}` },
      el('input', { type: 'checkbox', checked: t.done, style: { width: 'auto' }, onchange: async (e) => {
        await api(`/cards/${card.id}/tasks/${t.id}`, { method: 'PATCH', body: { done: e.target.checked } }); mark(); render();
      } }),
      el('span', { class: 'grow' }, t.text),
      el('button', { class: 'link danger', onclick: async () => { await api(`/cards/${card.id}/tasks/${t.id}`, { method: 'DELETE' }); mark(); render(); } }, 'remover')));

    const newNote = el('textarea', { placeholder: 'Escreva uma nota interna...' });
    const noteList = notes.map((n) => el('div', { class: 'note' }, n.text,
      el('small', {}, `${n.author_name || 'Alguém'} · ${new Date(n.created_at).toLocaleString('pt-BR')} `,
        el('button', { class: 'link danger', onclick: async () => {
          try { await api(`/cards/${card.id}/notes/${n.id}`, { method: 'DELETE' }); render(); } catch (err) { toast(err.message, 'error'); }
        } }, 'apagar'))));

    const fileInput = el('input', { type: 'file', style: { display: 'none' }, onchange: async () => {
      const f = fileInput.files[0];
      if (!f) return;
      const form = new FormData();
      form.append('file', f);
      try { await api(`/cards/${card.id}/attachments`, { method: 'POST', form }); mark(); render(); }
      catch (err) { toast(err.message, 'error'); }
    } });
    const attList = attachments.map((a) => el('div', { class: 'list-item' },
      el('span', { class: 'grow' }, `📎 ${a.filename}`, el('span', { class: 'muted' }, ` · ${(a.size / 1024).toFixed(0)} KB · ${a.uploaded_by_name || ''}`)),
      el('button', { class: 'link', onclick: async () => {
        const res = await api(`/cards/${card.id}/attachments/${a.id}`);
        const url = URL.createObjectURL(await res.blob());
        Object.assign(document.createElement('a'), { href: url, download: a.filename }).click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } }, 'baixar'),
      el('button', { class: 'link danger', onclick: async () => { await api(`/cards/${card.id}/attachments/${a.id}`, { method: 'DELETE' }); mark(); render(); } }, 'remover')));

    const history = events.map((e) => {
      const txt = e.type === 'moved'
        ? `moveu de "${stageName(e.data.from_stage_id) || 'outra etapa'}" para "${stageName(e.data.to_stage_id) || 'outra etapa'}"`
        : (EVENT_TEXT[e.type] || (() => e.type))(e.data || {});
      return el('div', { class: 'list-item muted' }, `${new Date(e.created_at).toLocaleString('pt-BR')} · ${e.user_name || 'Automação'} ${txt}`);
    });

    modal.replaceChildren(
      el('div', { class: 'modal-head' }, el('h2', { class: 'grow' }, card.title),
        card.value != null ? el('span', { class: 'chip' }, money(card.value)) : null,
        el('button', { onclick: close }, 'Fechar')),
      el('div', { class: 'section' }, el('h3', {}, 'Conversa'), conversationBox),
      el('div', { class: 'section' }, el('h3', {}, 'Dados'),
        el('div', { class: 'grid2' }, el('label', {}, 'Título', title), el('label', {}, 'Valor (R$)', value)),
        el('label', {}, 'Descrição', desc),
        el('div', { class: 'row', style: { marginTop: '8px' } }, el('button', { class: 'primary', onclick: save }, 'Salvar'),
          el('span', { class: 'grow' }),
          el('button', { class: 'danger', onclick: async () => {
            if (!confirm('Arquivar este card? Ele sai do quadro, mas o histórico fica guardado.')) return;
            await api(`/cards/${card.id}/archive`, { method: 'POST' }); changed = true; close();
          } }, 'Arquivar'))),
      el('div', { class: 'section' }, el('h3', {}, `Tarefas (${tasks.filter((t) => t.done).length}/${tasks.length})`), taskList, newTask),
      el('div', { class: 'section' }, el('h3', {}, 'Notas'), newNote,
        el('button', { style: { marginTop: '6px' }, onclick: async () => {
          if (!newNote.value.trim()) return;
          try { await api(`/cards/${card.id}/notes`, { method: 'POST', body: { text: newNote.value } }); mark(); render(); }
          catch (err) { toast(err.message, 'error'); }
        } }, 'Adicionar nota'), el('div', { style: { marginTop: '8px' } }, noteList)),
      el('div', { class: 'section' }, el('h3', {}, 'Anexos'), attList, fileInput,
        el('button', { onclick: () => fileInput.click() }, 'Anexar arquivo (até 20 MB)')),
      el('div', { class: 'section' }, el('h3', {}, 'Histórico'), history.length ? history : el('div', { class: 'muted' }, 'Sem eventos.')),
    );
  }
  await render();
}
