# Architecture

## Goal

Give the official Chatwoot image a Kanban board with no fork, no paid plugin and no changes to Chatwoot's code. The Kanban is a separate service that reads and writes Chatwoot only through its API and webhooks, and keeps its own data in a separate schema of the same Postgres.

## Main flow

```
Browser (logged in to Chatwoot)
   │  cw_d_session_info cookie (same domain)
   ▼
https://YOUR_DOMAIN/            → Chatwoot (rails)
https://YOUR_DOMAIN/kanban/...  → Kanban (Node, port 4000)
                                     │ validates the session at  GET /api/v1/profile
                                     │ system calls use an administrator token
                                     ▼
                                  Chatwoot (rails, internal network)

Chatwoot ── webhook (conversation_created / conversation_updated / message_created) ──► Kanban
Kanban ──► Chatwoot's Postgres, schema "kanban"
```

## Design decisions

1. **Same domain, `/kanban` path.** The browser already sends the Chatwoot session cookie. The Kanban reads the `access-token`, `client` and `uid` headers from that session and checks them at `/api/v1/profile`. There are no separate logins or users. The answer is cached for 5 minutes.
2. **Roles come from Chatwoot.** The profile carries the person's role in each account. Administrators edit funnels, stages and rules; agents use the board. Every record is filtered by the `account_id` in the URL, and the server checks the record belongs to that account before any change.
3. **`kanban` schema in Chatwoot's Postgres.** The existing database backup already covers the Kanban. Migrations are numbered and idempotent and run at startup; never edit one that was already applied, create the next one.
4. **One card per conversation per funnel.** Enforced by a partial unique index (`funnel_id, conversation_id` where not archived). A repeated webhook cannot create a duplicate.
5. **Routing only creates.** A label with a rule creates the card in the rule's stage. A new label on a conversation that already has a card in that funnel does not move it; moving is the agent's decision.
6. **Webhook secret in the path.** Chatwoot does not sign account webhooks, so the secret goes in the URL and is compared in constant time. With no secret configured the endpoint answers 404.
7. **Attachments in a volume.** The file goes to `/data/attachments` under a random name; the database keeps name, type and size.
8. **Two entry points inside Chatwoot.** A dashboard script (Dashboard Scripts) adds the "Kanban" item to the side menu and opens the board full screen. A Dashboard App shows the open conversation's cards in a tab.

## Data model (`kanban` schema)

`funnels` → `stages` → `cards`, and per card: `card_tasks`, `card_notes`, `card_attachments`, `card_events` (history and the basis of reports). `routing_rules` links a label to a stage. `migrations` records what has been applied.

## Stack

Node 22, Fastify 5, `pg`, `@fastify/multipart`, `@fastify/static`, SortableJS for drag and drop. The interface is plain HTML and JavaScript, no build step.

## Layout of `base/`

- `src/server.js`: API routes, authentication, webhook and automatic webhook registration.
- `src/db.js`: pool, migrations and the starter funnel.
- `src/chatwoot.js`: Chatwoot API client and session validation.
- `src/routing.js`: webhook → cards.
- `public/`: board, card modal, conversation page and `chatwoot-inject.js` (menu item).
- `Dockerfile`: slim image, unprivileged user, healthcheck at `/kanban/healthz`.
