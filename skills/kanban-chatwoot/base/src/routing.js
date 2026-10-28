// Webhook do Chatwoot -> cards.
// - conversation_created/updated: se a conversa tem uma etiqueta com regra, cria o card no funil/etapa da regra
//   (um card por conversa por funil). Etiqueta nova em conversa que ja tem card no funil nao move o card:
//   o movimento entre etapas e decisao do atendente.
// - message_created/conversation_updated: atualiza nome, caixa, responsavel e ultima atividade dos cards existentes.
import { q, tx } from './db.js';

export async function handleChatwootEvent(payload, inboxNames) {
  const event = payload?.event;
  if (!event) return { ignored: 'sem evento' };

  if (event === 'message_created') {
    const conv = payload.conversation;
    const accountId = payload.account?.id;
    if (!conv?.id || !accountId) return { ignored: 'mensagem sem conversa' };
    await q(
      `update kanban.cards set last_activity_at = now() where account_id = $1 and conversation_id = $2 and not archived`,
      [accountId, conv.id],
    );
    return { ok: true };
  }

  if (event !== 'conversation_created' && event !== 'conversation_updated') return { ignored: event };

  const accountId = payload.account?.id;
  const convId = payload.id;
  if (!accountId || !convId) return { ignored: 'conversa sem id' };

  const sender = payload.meta?.sender || {};
  const assignee = payload.meta?.assignee || null;
  const inboxName = inboxNames.get(payload.inbox_id) || null;

  await q(
    `update kanban.cards
        set inbox_name = coalesce($3, inbox_name),
            contact_id = coalesce($4, contact_id),
            assignee_id = $5, assignee_name = $6,
            last_activity_at = now(), updated_at = now()
      where account_id = $1 and conversation_id = $2 and not archived`,
    [accountId, convId, inboxName, sender.id || null, assignee?.id || null, assignee?.name || null],
  );

  const labels = payload.labels || [];
  if (!labels.length) return { ok: true, created: 0 };

  const { rows: rules } = await q(
    `select r.funnel_id, r.stage_id, r.label from kanban.routing_rules r
      where r.account_id = $1 and r.label = any($2::text[])
      order by r.position, r.id`,
    [accountId, labels],
  );
  let created = 0;
  const seenFunnels = new Set();
  for (const rule of rules) {
    if (seenFunnels.has(rule.funnel_id)) continue;
    seenFunnels.add(rule.funnel_id);
    const made = await createCardForConversation({
      accountId,
      funnelId: rule.funnel_id,
      stageId: rule.stage_id,
      conversationId: convId,
      contactId: sender.id || null,
      title: sender.name || sender.phone_number || `Conversa #${convId}`,
      inboxName,
      assignee,
      reason: `etiqueta "${rule.label}"`,
    });
    if (made) created += 1;
  }
  return { ok: true, created };
}

// Cria o card se ainda nao existir card ativo dessa conversa no funil. Retorna o card criado ou null.
export async function createCardForConversation({
  accountId, funnelId, stageId, conversationId, contactId, title, inboxName, assignee, reason, user,
}) {
  return tx(async (c) => {
    const exists = await c.query(
      `select id from kanban.cards where funnel_id = $1 and conversation_id = $2 and not archived for update`,
      [funnelId, conversationId],
    );
    if (exists.rows.length) return null;
    const pos = await c.query(
      `select coalesce(min(position), 1000) - 1 as p from kanban.cards where stage_id = $1 and not archived`,
      [stageId],
    );
    const { rows } = await c.query(
      `insert into kanban.cards
         (account_id, funnel_id, stage_id, position, title, conversation_id, contact_id, inbox_name,
          assignee_id, assignee_name, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict do nothing
       returning *`,
      [accountId, funnelId, stageId, pos.rows[0].p, title, conversationId, contactId, inboxName,
        assignee?.id || null, assignee?.name || null, user?.id || null],
    );
    if (!rows.length) return null;
    await c.query(
      `insert into kanban.card_events (card_id, account_id, type, data, user_id, user_name)
       values ($1, $2, 'created', $3, $4, $5)`,
      [rows[0].id, accountId, { stage_id: stageId, reason: reason || 'manual' }, user?.id || null, user?.name || null],
    );
    return rows[0];
  });
}
