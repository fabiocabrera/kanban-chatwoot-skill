// Banco: schema `kanban` dentro do Postgres do Chatwoot (entra no backup diario do banco).
// Migrations idempotentes, rodadas no start.
import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.KANBAN_DB_URL,
  max: 10,
});

export const q = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

const MIGRATIONS = [
  `create schema if not exists kanban`,
  `create table if not exists kanban.migrations (id int primary key, applied_at timestamptz not null default now())`,
];

// Cada item: [id, sql]. Nunca editar um item ja aplicado; criar um novo.
const VERSIONED = [
  [1, `
    create table kanban.funnels (
      id serial primary key,
      account_id int not null,
      name text not null,
      position int not null default 0,
      created_at timestamptz not null default now()
    );
    create table kanban.stages (
      id serial primary key,
      funnel_id int not null references kanban.funnels(id) on delete cascade,
      name text not null,
      color text not null default '#64748b',
      position int not null default 0
    );
    create table kanban.cards (
      id serial primary key,
      account_id int not null,
      funnel_id int not null references kanban.funnels(id) on delete cascade,
      stage_id int not null references kanban.stages(id) on delete restrict,
      position double precision not null default 0,
      title text not null,
      description text not null default '',
      conversation_id int,
      contact_id int,
      inbox_name text,
      value numeric(14,2),
      assignee_id int,
      assignee_name text,
      created_by int,
      archived boolean not null default false,
      stage_entered_at timestamptz not null default now(),
      last_activity_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index cards_board_idx on kanban.cards (funnel_id, stage_id, position) where not archived;
    create index cards_conversation_idx on kanban.cards (conversation_id);
    create unique index cards_one_per_conv_funnel on kanban.cards (funnel_id, conversation_id)
      where conversation_id is not null and not archived;
    create table kanban.card_tasks (
      id serial primary key,
      card_id int not null references kanban.cards(id) on delete cascade,
      text text not null,
      done boolean not null default false,
      position int not null default 0,
      created_at timestamptz not null default now()
    );
    create table kanban.card_notes (
      id serial primary key,
      card_id int not null references kanban.cards(id) on delete cascade,
      author_id int,
      author_name text,
      text text not null,
      created_at timestamptz not null default now()
    );
    create table kanban.card_attachments (
      id serial primary key,
      card_id int not null references kanban.cards(id) on delete cascade,
      filename text not null,
      mime text not null,
      size int not null,
      storage_key text not null,
      uploaded_by int,
      uploaded_by_name text,
      created_at timestamptz not null default now()
    );
    create table kanban.card_events (
      id bigserial primary key,
      card_id int not null references kanban.cards(id) on delete cascade,
      account_id int not null,
      type text not null,
      data jsonb not null default '{}',
      user_id int,
      user_name text,
      created_at timestamptz not null default now()
    );
    create index card_events_report_idx on kanban.card_events (account_id, created_at);
    create table kanban.routing_rules (
      id serial primary key,
      account_id int not null,
      label text not null,
      funnel_id int not null references kanban.funnels(id) on delete cascade,
      stage_id int not null references kanban.stages(id) on delete cascade,
      position int not null default 0,
      created_at timestamptz not null default now()
    );
  `],
];

export async function migrate() {
  for (const sql of MIGRATIONS) await q(sql);
  const { rows } = await q('select id from kanban.migrations');
  const applied = new Set(rows.map((r) => r.id));
  for (const [id, sql] of VERSIONED) {
    if (applied.has(id)) continue;
    await tx(async (c) => {
      await c.query(sql);
      await c.query('insert into kanban.migrations (id) values ($1)', [id]);
    });
    console.log(`[db] migration ${id} aplicada`);
  }
}

// Funil inicial para a conta, se ainda nao houver nenhum.
export async function seedAccount(accountId) {
  const { rows } = await q('select 1 from kanban.funnels where account_id = $1 limit 1', [accountId]);
  if (rows.length) return;
  await tx(async (c) => {
    const f = await c.query(
      `insert into kanban.funnels (account_id, name, position) values ($1, 'Vendas', 0) returning id`,
      [accountId],
    );
    const stages = [
      ['Novo lead', '#3b82f6'],
      ['Em atendimento', '#f59e0b'],
      ['Proposta enviada', '#8b5cf6'],
      ['Fechado', '#10b981'],
      ['Perdido', '#ef4444'],
    ];
    for (const [i, [name, color]] of stages.entries()) {
      await c.query('insert into kanban.stages (funnel_id, name, color, position) values ($1, $2, $3, $4)', [
        f.rows[0].id, name, color, i,
      ]);
    }
  });
  console.log(`[db] funil inicial criado para a conta ${accountId}`);
}
