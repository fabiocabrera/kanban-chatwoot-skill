# Integrations

Everything the Kanban uses from Chatwoot is public and documented. Nothing requires a fork.

## Chatwoot API (administrator token, `api_access_token` header)

| Use | Call |
|---|---|
| Read a conversation | `GET /api/v1/accounts/{account}/conversations/{id}` |
| List labels | `GET /api/v1/accounts/{account}/labels` |
| List inboxes | `GET /api/v1/accounts/{account}/inboxes` |
| List agents | `GET /api/v1/accounts/{account}/agents` |
| List and create webhooks | `GET` and `POST /api/v1/accounts/{account}/webhooks` |
| Apply labels | `POST /api/v1/accounts/{account}/conversations/{id}/labels` |

## User session

The browser sends Chatwoot's session headers (`access-token`, `client`, `uid`). The Kanban forwards them to `GET /api/v1/profile` with `token-type: Bearer`. A 200 returns the profile and the accounts with the role; a 401 ends access. Cache the result briefly so you do not call on every click.

## Webhook

Subscribed events: `conversation_created`, `conversation_updated`, `message_created`. Body fields used:

- `event`, `account.id`, `inbox_id`
- conversations: `id` (display number), `labels`, `meta.sender` (id, name, phone), `meta.assignee`
- messages: `conversation.id`

The endpoint is `POST /kanban/api/webhooks/chatwoot/{secret}`. The service registers the webhook itself at startup.

## Dashboard Scripts and Dashboard Apps

- **Dashboard Scripts** (Super Admin): a `<script>` loaded across the whole panel. `chatwoot-inject.js` reads the page path (`/accounts/{id}/...`) to learn the account, inserts the item in the side menu and opens the board in a full-screen iframe. When a card's "open conversation" is clicked, the board tells the page through `postMessage` and the page navigates through Chatwoot's router without reloading.
- **Dashboard Apps**: an iframe in the conversation sidebar. Chatwoot sends the context (conversation, contact) through `postMessage` when the page sends `chatwoot-dashboard-app:fetch-info`.

## EasyPanel (optional)

When Chatwoot runs as a Compose service in EasyPanel: variables in the Environment tab, route in the Domains tab (Chatwoot's domain + path `/kanban` → `kanban` service, port 4000), and deploy from the panel or with `docker compose up --build -d kanban` on the server.

## Backup

The `kanban` schema is in Chatwoot's database, so its `pg_dump` already includes it. Attachments live in the `kanban_data` volume and need their own copy. Keep a copy off the server.
