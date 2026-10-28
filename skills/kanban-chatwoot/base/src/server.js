// Kanban para o Chatwoot. Servido em /kanban no mesmo dominio do Chatwoot,
// para reaproveitar a sessao (cookie cw_d_session_info) sem login proprio.
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate, q, seedAccount, tx } from './db.js';
import * as cw from './chatwoot.js';
import { createCardForConversation, handleChatwootEvent } from './routing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = process.env.KANBAN_DATA_DIR || '/data';
const ATTACH_DIR = path.join(DATA_DIR, 'attachments');
const MAX_UPLOAD = 20 * 1024 * 1024;
const WEBHOOK_SECRET = process.env.KANBAN_WEBHOOK_SECRET || '';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' }, trustProxy: true });
await app.register(multipart, { limits: { fileSize: MAX_UPLOAD, files: 1 } });
await app.register(fastifyStatic, { root: path.join(__dirname, '..', 'public'), prefix: '/kanban/' });

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

// ---------- autenticacao ----------
async function auth(req) {
  const profile = await cw.profileFromSession({
    accessToken: req.headers['access-token'],
    client: req.headers.client,
    uid: req.headers.uid,
  });
  if (!profile) throw httpError(401, 'Sessão do Chatwoot inválida. Entre no Chatwoot novamente.');
  const accountId = Number(req.params.acc);
  const membership = (profile.accounts || []).find((a) => a.id === accountId);
  if (!membership) throw httpError(403, 'Você não tem acesso a esta conta.');
  req.user = { id: profile.id, name: profile.available_name || profile.name, role: membership.role };
  req.accountId = accountId;
}

const requireAdmin = (req) => {
  if (req.user.role !== 'administrator') throw httpError(403, 'Somente administradores podem alterar funis e regras.');
};

const accountScoped = { preHandler: auth };
const adminScoped = { preHandler: [auth, async (req) => requireAdmin(req)] };

// Garante que o registro pertence a conta da URL.
async function own(table, id, accountId) {
  const sql = {
    funnels: 'select * from kanban.funnels where id = $1 and account_id = $2',
    stages: 'select s.* from kanban.stages s join kanban.funnels f on f.id = s.funnel_id where s.id = $1 and f.account_id = $2',
    cards: 'select * from kanban.cards where id = $1 and account_id = $2',
    rules: 'select * from kanban.routing_rules where id = $1 and account_id = $2',
  }[table];
  const { rows } = await q(sql, [id, accountId]);
  if (!rows.length) throw httpError(404, 'Registro não encontrado.');
  return rows[0];
}

const logEvent = (cardId, req, type, data = {}) =>
  q(
    `insert into kanban.card_events (card_id, account_id, type, data, user_id, user_name) values ($1,$2,$3,$4,$5,$6)`,
    [cardId, req.accountId, type, data, req.user.id, req.user.name],
  );

// ---------- caches de dados do Chatwoot ----------
const inboxCache = new Map(); // accountId -> { at, map }
async function inboxNames(accountId) {
  const hit = inboxCache.get(accountId);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.map;
  const map = new Map((await cw.listInboxes(accountId)).map((i) => [i.id, i.name]));
  inboxCache.set(accountId, { at: Date.now(), map });
  return map;
}

// ---------- API ----------
const A = '/kanban/api/accounts/:acc';

app.get('/kanban/healthz', async () => {
  await q('select 1');
  return { ok: true };
});

app.get(`${A}/me`, accountScoped, async (req) => {
  await seedAccount(req.accountId);
  return { user: req.user, accountId: req.accountId };
});

const CARD_COLUMNS = `
  c.*,
  (select count(*) from kanban.card_tasks t where t.card_id = c.id)::int as tasks_total,
  (select count(*) from kanban.card_tasks t where t.card_id = c.id and t.done)::int as tasks_done,
  (select count(*) from kanban.card_attachments a where a.card_id = c.id)::int as attachments_count,
  (select count(*) from kanban.card_notes n where n.card_id = c.id)::int as notes_count`;

app.get(`${A}/board`, accountScoped, async (req) => {
  await seedAccount(req.accountId);
  const { rows: funnels } = await q('select * from kanban.funnels where account_id = $1 order by position, id', [req.accountId]);
  const funnelId = Number(req.query.funnel_id) || funnels[0]?.id;
  if (!funnelId) return { funnels, stages: [], cards: [] };
  if (!funnels.some((f) => f.id === funnelId)) throw httpError(404, 'Funil não encontrado.');
  const [{ rows: stages }, { rows: cards }] = await Promise.all([
    q('select * from kanban.stages where funnel_id = $1 order by position, id', [funnelId]),
    q(`select ${CARD_COLUMNS} from kanban.cards c where c.funnel_id = $1 and not c.archived order by c.position, c.id`, [funnelId]),
  ]);
  return { funnels, funnelId, stages, cards };
});

// Funis
app.post(`${A}/funnels`, adminScoped, async (req) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw httpError(400, 'Informe o nome do funil.');
  return tx(async (c) => {
    const { rows } = await c.query(
      `insert into kanban.funnels (account_id, name, position)
       values ($1, $2, (select coalesce(max(position), -1) + 1 from kanban.funnels where account_id = $1)) returning *`,
      [req.accountId, name],
    );
    const stageNames = Array.isArray(req.body?.stages) && req.body.stages.length ? req.body.stages : ['Entrada', 'Em andamento', 'Concluído'];
    for (const [i, s] of stageNames.entries()) {
      await c.query('insert into kanban.stages (funnel_id, name, position) values ($1, $2, $3)', [rows[0].id, String(s).trim() || `Etapa ${i + 1}`, i]);
    }
    return rows[0];
  });
});

app.patch(`${A}/funnels/:id`, adminScoped, async (req) => {
  await own('funnels', req.params.id, req.accountId);
  const name = String(req.body?.name || '').trim();
  if (!name) throw httpError(400, 'Informe o nome do funil.');
  const { rows } = await q('update kanban.funnels set name = $1 where id = $2 returning *', [name, req.params.id]);
  return rows[0];
});

app.delete(`${A}/funnels/:id`, adminScoped, async (req) => {
  await own('funnels', req.params.id, req.accountId);
  const { rows } = await q('select count(*)::int as n from kanban.cards where funnel_id = $1 and not archived', [req.params.id]);
  if (rows[0].n > 0) throw httpError(409, `O funil tem ${rows[0].n} card(s) ativo(s). Mova ou arquive antes de excluir.`);
  await q('delete from kanban.funnels where id = $1', [req.params.id]);
  return { ok: true };
});

// Etapas
app.post(`${A}/funnels/:id/stages`, adminScoped, async (req) => {
  await own('funnels', req.params.id, req.accountId);
  const name = String(req.body?.name || '').trim();
  if (!name) throw httpError(400, 'Informe o nome da etapa.');
  const { rows } = await q(
    `insert into kanban.stages (funnel_id, name, color, position)
     values ($1, $2, coalesce($3, '#64748b'), (select coalesce(max(position), -1) + 1 from kanban.stages where funnel_id = $1)) returning *`,
    [req.params.id, name, req.body?.color || null],
  );
  return rows[0];
});

app.patch(`${A}/stages/:id`, adminScoped, async (req) => {
  const st = await own('stages', req.params.id, req.accountId);
  const name = req.body?.name != null ? String(req.body.name).trim() : st.name;
  const color = /^#[0-9a-f]{6}$/i.test(req.body?.color || '') ? req.body.color : st.color;
  const { rows } = await q('update kanban.stages set name = $1, color = $2 where id = $3 returning *', [name || st.name, color, st.id]);
  return rows[0];
});

app.post(`${A}/funnels/:id/stages/reorder`, adminScoped, async (req) => {
  await own('funnels', req.params.id, req.accountId);
  const ids = (req.body?.ordered_ids || []).map(Number);
  await tx(async (c) => {
    for (const [i, id] of ids.entries()) {
      await c.query('update kanban.stages set position = $1 where id = $2 and funnel_id = $3', [i, id, req.params.id]);
    }
  });
  return { ok: true };
});

app.delete(`${A}/stages/:id`, adminScoped, async (req) => {
  const st = await own('stages', req.params.id, req.accountId);
  const { rows } = await q('select count(*)::int as n from kanban.cards where stage_id = $1', [st.id]);
  if (rows[0].n > 0) throw httpError(409, `A etapa tem ${rows[0].n} card(s) (inclui arquivados). Mova-os antes de excluir.`);
  await q('delete from kanban.stages where id = $1', [st.id]);
  return { ok: true };
});

// Cards
app.post(`${A}/cards`, accountScoped, async (req) => {
  const b = req.body || {};
  const stage = await own('stages', b.stage_id, req.accountId);
  if (b.conversation_id) {
    const conv = await cw.getConversation(req.accountId, b.conversation_id);
    const card = await createCardForConversation({
      accountId: req.accountId,
      funnelId: stage.funnel_id,
      stageId: stage.id,
      conversationId: conv.id,
      contactId: conv.meta?.sender?.id || null,
      title: String(b.title || '').trim() || conv.meta?.sender?.name || `Conversa #${conv.id}`,
      inboxName: (await inboxNames(req.accountId)).get(conv.inbox_id) || null,
      assignee: conv.meta?.assignee || null,
      user: req.user,
    });
    if (!card) throw httpError(409, 'Esta conversa já tem um card neste funil.');
    return card;
  }
  const title = String(b.title || '').trim();
  if (!title) throw httpError(400, 'Informe o título do card.');
  const { rows } = await q(
    `insert into kanban.cards (account_id, funnel_id, stage_id, position, title, description, value, created_by)
     values ($1, $2, $3, (select coalesce(min(position), 1000) - 1 from kanban.cards where stage_id = $3 and not archived), $4, $5, $6, $7)
     returning *`,
    [req.accountId, stage.funnel_id, stage.id, title, String(b.description || ''), b.value || null, req.user.id],
  );
  await logEvent(rows[0].id, req, 'created', { stage_id: stage.id, reason: 'manual' });
  return rows[0];
});

app.get(`${A}/cards/:id`, accountScoped, async (req) => {
  await own('cards', req.params.id, req.accountId);
  const id = req.params.id;
  const [card, tasks, notes, attachments, events] = await Promise.all([
    q(`select ${CARD_COLUMNS} from kanban.cards c where c.id = $1`, [id]),
    q('select * from kanban.card_tasks where card_id = $1 order by position, id', [id]),
    q('select * from kanban.card_notes where card_id = $1 order by created_at desc', [id]),
    q('select id, filename, mime, size, uploaded_by_name, created_at from kanban.card_attachments where card_id = $1 order by created_at desc', [id]),
    q('select * from kanban.card_events where card_id = $1 order by created_at desc limit 50', [id]),
  ]);
  return { card: card.rows[0], tasks: tasks.rows, notes: notes.rows, attachments: attachments.rows, events: events.rows };
});

app.patch(`${A}/cards/:id`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const b = req.body || {};
  const title = b.title != null ? String(b.title).trim() || card.title : card.title;
  const description = b.description != null ? String(b.description) : card.description;
  const value = b.value === '' || b.value === null ? null : b.value ?? card.value;
  const { rows } = await q(
    'update kanban.cards set title = $1, description = $2, value = $3, updated_at = now() where id = $4 returning *',
    [title, description, value, card.id],
  );
  return rows[0];
});

// Move o card para uma etapa (de qualquer funil da conta) e grava a nova ordem da coluna de destino.
app.post(`${A}/cards/:id/move`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const stage = await own('stages', req.body?.stage_id, req.accountId);
  const ordered = (req.body?.ordered_ids || []).map(Number);
  const moved = await tx(async (c) => {
    if (stage.funnel_id !== card.funnel_id && card.conversation_id) {
      const dup = await c.query(
        'select 1 from kanban.cards where funnel_id = $1 and conversation_id = $2 and not archived and id <> $3',
        [stage.funnel_id, card.conversation_id, card.id],
      );
      if (dup.rows.length) throw httpError(409, 'Esta conversa já tem um card no funil de destino.');
    }
    const changedStage = stage.id !== card.stage_id;
    const { rows } = await c.query(
      `update kanban.cards set stage_id = $1, funnel_id = $2, updated_at = now(),
              stage_entered_at = case when $3 then now() else stage_entered_at end
        where id = $4 returning *`,
      [stage.id, stage.funnel_id, changedStage, card.id],
    );
    for (const [i, id] of ordered.entries()) {
      await c.query('update kanban.cards set position = $1 where id = $2 and stage_id = $3', [i, id, stage.id]);
    }
    return { card: rows[0], changedStage };
  });
  if (moved.changedStage) {
    await logEvent(card.id, req, 'moved', { from_stage_id: card.stage_id, to_stage_id: stage.id });
  }
  return moved.card;
});

app.post(`${A}/cards/:id/archive`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  await q('update kanban.cards set archived = true, updated_at = now() where id = $1', [card.id]);
  await logEvent(card.id, req, 'archived');
  return { ok: true };
});

// Liga um card solto a uma conversa (pelo numero da conversa no Chatwoot).
app.post(`${A}/cards/:id/link`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const conv = await cw.getConversation(req.accountId, req.body?.conversation_id);
  const dup = await q('select 1 from kanban.cards where funnel_id = $1 and conversation_id = $2 and not archived and id <> $3', [
    card.funnel_id, conv.id, card.id,
  ]);
  if (dup.rows.length) throw httpError(409, 'Esta conversa já tem um card neste funil.');
  const { rows } = await q(
    `update kanban.cards set conversation_id = $1, contact_id = $2, inbox_name = $3, updated_at = now() where id = $4 returning *`,
    [conv.id, conv.meta?.sender?.id || null, (await inboxNames(req.accountId)).get(conv.inbox_id) || null, card.id],
  );
  await logEvent(card.id, req, 'linked', { conversation_id: conv.id });
  return rows[0];
});

// Tarefas
app.post(`${A}/cards/:id/tasks`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const text = String(req.body?.text || '').trim();
  if (!text) throw httpError(400, 'Descreva a tarefa.');
  const { rows } = await q(
    `insert into kanban.card_tasks (card_id, text, position)
     values ($1, $2, (select coalesce(max(position), -1) + 1 from kanban.card_tasks where card_id = $1)) returning *`,
    [card.id, text],
  );
  return rows[0];
});

app.patch(`${A}/cards/:id/tasks/:taskId`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const { rows } = await q(
    `update kanban.card_tasks set done = coalesce($1, done), text = coalesce(nullif($2, ''), text)
      where id = $3 and card_id = $4 returning *`,
    [typeof req.body?.done === 'boolean' ? req.body.done : null, req.body?.text ? String(req.body.text).trim() : null, req.params.taskId, card.id],
  );
  if (!rows.length) throw httpError(404, 'Tarefa não encontrada.');
  if (typeof req.body?.done === 'boolean') await logEvent(card.id, req, req.body.done ? 'task_done' : 'task_reopened', { task: rows[0].text });
  return rows[0];
});

app.delete(`${A}/cards/:id/tasks/:taskId`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  await q('delete from kanban.card_tasks where id = $1 and card_id = $2', [req.params.taskId, card.id]);
  return { ok: true };
});

// Notas
app.post(`${A}/cards/:id/notes`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const text = String(req.body?.text || '').trim();
  if (!text) throw httpError(400, 'Escreva a nota.');
  const { rows } = await q(
    'insert into kanban.card_notes (card_id, author_id, author_name, text) values ($1,$2,$3,$4) returning *',
    [card.id, req.user.id, req.user.name, text],
  );
  return rows[0];
});

app.delete(`${A}/cards/:id/notes/:noteId`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const { rows } = await q('select author_id from kanban.card_notes where id = $1 and card_id = $2', [req.params.noteId, card.id]);
  if (!rows.length) throw httpError(404, 'Nota não encontrada.');
  if (rows[0].author_id !== req.user.id && req.user.role !== 'administrator') throw httpError(403, 'Só o autor ou um administrador apaga a nota.');
  await q('delete from kanban.card_notes where id = $1', [req.params.noteId]);
  return { ok: true };
});

// Anexos (guardados no volume /data/attachments)
app.post(`${A}/cards/:id/attachments`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const file = await req.file();
  if (!file) throw httpError(400, 'Envie um arquivo.');
  const buf = await file.toBuffer();
  if (file.file.truncated) throw httpError(413, 'Arquivo maior que 20 MB.');
  const key = randomUUID();
  await mkdir(ATTACH_DIR, { recursive: true });
  await writeFile(path.join(ATTACH_DIR, key), buf);
  const { rows } = await q(
    `insert into kanban.card_attachments (card_id, filename, mime, size, storage_key, uploaded_by, uploaded_by_name)
     values ($1,$2,$3,$4,$5,$6,$7) returning id, filename, mime, size, uploaded_by_name, created_at`,
    [card.id, file.filename.slice(0, 200), file.mimetype || 'application/octet-stream', buf.length, key, req.user.id, req.user.name],
  );
  await logEvent(card.id, req, 'attachment_added', { filename: rows[0].filename });
  return rows[0];
});

app.get(`${A}/cards/:id/attachments/:attId`, accountScoped, async (req, reply) => {
  const card = await own('cards', req.params.id, req.accountId);
  const { rows } = await q('select * from kanban.card_attachments where id = $1 and card_id = $2', [req.params.attId, card.id]);
  if (!rows.length) throw httpError(404, 'Anexo não encontrado.');
  const a = rows[0];
  reply.header('Content-Type', a.mime);
  reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`);
  return reply.send(createReadStream(path.join(ATTACH_DIR, a.storage_key)));
});

app.delete(`${A}/cards/:id/attachments/:attId`, accountScoped, async (req) => {
  const card = await own('cards', req.params.id, req.accountId);
  const { rows } = await q('delete from kanban.card_attachments where id = $1 and card_id = $2 returning storage_key, filename', [
    req.params.attId, card.id,
  ]);
  if (!rows.length) throw httpError(404, 'Anexo não encontrado.');
  await unlink(path.join(ATTACH_DIR, rows[0].storage_key)).catch(() => {});
  await logEvent(card.id, req, 'attachment_removed', { filename: rows[0].filename });
  return { ok: true };
});

// Cards de uma conversa (aba dentro da conversa)
app.get(`${A}/conversations/:convId/cards`, accountScoped, async (req) => {
  const { rows } = await q(
    `select ${CARD_COLUMNS}, f.name as funnel_name, s.name as stage_name, s.color as stage_color
       from kanban.cards c join kanban.funnels f on f.id = c.funnel_id join kanban.stages s on s.id = c.stage_id
      where c.account_id = $1 and c.conversation_id = $2 and not c.archived order by f.position, f.id`,
    [req.accountId, req.params.convId],
  );
  const { rows: funnels } = await q(
    `select f.id, f.name, coalesce(json_agg(json_build_object('id', s.id, 'name', s.name, 'color', s.color) order by s.position, s.id)
       filter (where s.id is not null), '[]') as stages
       from kanban.funnels f left join kanban.stages s on s.funnel_id = f.id
      where f.account_id = $1 group by f.id order by f.position, f.id`,
    [req.accountId],
  );
  return { cards: rows, funnels };
});

// Regras de roteamento por etiqueta
app.get(`${A}/rules`, accountScoped, async (req) => {
  const [{ rows }, labels] = await Promise.all([
    q(
      `select r.*, f.name as funnel_name, s.name as stage_name from kanban.routing_rules r
         join kanban.funnels f on f.id = r.funnel_id join kanban.stages s on s.id = r.stage_id
        where r.account_id = $1 order by r.position, r.id`,
      [req.accountId],
    ),
    cw.listLabels(req.accountId).catch(() => []),
  ]);
  return { rules: rows, labels: labels.map((l) => ({ title: l.title, color: l.color })) };
});

app.post(`${A}/rules`, adminScoped, async (req) => {
  const label = String(req.body?.label || '').trim();
  if (!label) throw httpError(400, 'Escolha a etiqueta.');
  const stage = await own('stages', req.body?.stage_id, req.accountId);
  const { rows } = await q(
    `insert into kanban.routing_rules (account_id, label, funnel_id, stage_id, position)
     values ($1,$2,$3,$4,(select coalesce(max(position), -1) + 1 from kanban.routing_rules where account_id = $1)) returning *`,
    [req.accountId, label, stage.funnel_id, stage.id],
  );
  return rows[0];
});

app.delete(`${A}/rules/:id`, adminScoped, async (req) => {
  await own('rules', req.params.id, req.accountId);
  await q('delete from kanban.routing_rules where id = $1', [req.params.id]);
  return { ok: true };
});

// Relatorio de produtividade: cards por etapa e movimentacao por atendente.
app.get(`${A}/reports`, accountScoped, async (req) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const funnelId = Number(req.query.funnel_id) || null;
  const [byStage, byAgent, created] = await Promise.all([
    q(
      `select f.id as funnel_id, f.name as funnel_name, s.id as stage_id, s.name as stage_name, s.color,
              count(c.id)::int as cards, coalesce(sum(c.value), 0)::float as value
         from kanban.funnels f join kanban.stages s on s.funnel_id = f.id
         left join kanban.cards c on c.stage_id = s.id and not c.archived
        where f.account_id = $1 and ($2::int is null or f.id = $2)
        group by f.id, s.id order by f.position, f.id, s.position, s.id`,
      [req.accountId, funnelId],
    ),
    q(
      `select e.user_id, coalesce(max(e.user_name), 'Automação') as user_name,
              count(*) filter (where e.type = 'moved')::int as moves,
              count(*) filter (where e.type = 'created')::int as created,
              count(*) filter (where e.type = 'task_done')::int as tasks_done
         from kanban.card_events e join kanban.cards c on c.id = e.card_id
        where e.account_id = $1 and e.created_at > now() - make_interval(days => $2) and ($3::int is null or c.funnel_id = $3)
        group by e.user_id order by moves + created + tasks_done desc`,
      [req.accountId, days, funnelId],
    ),
    q(
      `select to_char(date_trunc('day', c.created_at), 'YYYY-MM-DD') as day, count(*)::int as cards
         from kanban.cards c
        where c.account_id = $1 and c.created_at > now() - make_interval(days => $2) and ($3::int is null or c.funnel_id = $3)
        group by 1 order by 1`,
      [req.accountId, days, funnelId],
    ),
  ]);
  return { days, byStage: byStage.rows, byAgent: byAgent.rows, createdPerDay: created.rows };
});

// Webhook do Chatwoot (segredo no caminho; o Chatwoot nao assina webhooks de conta)
app.post('/kanban/api/webhooks/chatwoot/:secret', async (req, reply) => {
  const given = Buffer.from(String(req.params.secret));
  const expected = Buffer.from(WEBHOOK_SECRET);
  if (!WEBHOOK_SECRET || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return reply.code(404).send();
  }
  const accountId = req.body?.account?.id;
  const names = accountId ? await inboxNames(accountId).catch(() => new Map()) : new Map();
  const result = await handleChatwootEvent(req.body, names);
  req.log.info({ event: req.body?.event, result }, 'webhook chatwoot');
  return { ok: true };
});

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode || 500;
  if (status >= 500) req.log.error(err);
  reply.code(status).send({ error: status >= 500 ? 'Erro interno no Kanban.' : err.message });
});

// Registra (uma vez) o webhook da conta no Chatwoot apontando para este servico.
async function ensureWebhook(accountId) {
  const url = process.env.KANBAN_PUBLIC_URL && WEBHOOK_SECRET
    ? `${process.env.KANBAN_PUBLIC_URL.replace(/\/$/, '')}/kanban/api/webhooks/chatwoot/${WEBHOOK_SECRET}`
    : null;
  if (!url) return;
  const hooks = await cw.listWebhooks(accountId);
  if (hooks.some((h) => h.url === url)) return;
  await cw.createWebhook(accountId, url, ['conversation_created', 'conversation_updated', 'message_created']);
  app.log.info(`webhook registrado no Chatwoot para a conta ${accountId}`);
}

await migrate();
for (const acc of String(process.env.KANBAN_ACCOUNT_IDS || '1').split(',').map(Number).filter(Boolean)) {
  await seedAccount(acc);
  await ensureWebhook(acc).catch((err) => app.log.error({ err: err.message }, 'falha ao registrar webhook'));
}
await app.listen({ port: PORT, host: '0.0.0.0' });
