# Installation

Prerequisites: official Chatwoot (`chatwoot/chatwoot`, community edition) running under Docker Compose with HTTPS, access to the folder where the compose file runs, an administrator user in Chatwoot, and Postgres and Redis with volumes.

## 1. Copy the code to the server

Copy `base/` to a server folder, for example `/opt/chatwoot-kanban`. The compose file will build the image from it.

## 2. Environment variables

Set them in the panel (EasyPanel: the service's Environment tab) or in an `.env` that stays on the server only. Never commit them.

| Variable | Purpose |
|---|---|
| `KANBAN_DB_URL` | Chatwoot's Postgres connection string, in the standard Postgres format, with the user, password, host (the database service name in your compose), port 5432 and database name from your compose |
| `CHATWOOT_INTERNAL_URL` | Chatwoot's internal address on the compose network, e.g. `http://rails:3030` |
| `CHATWOOT_API_TOKEN` | an administrator's access token (Profile › Access token) |
| `KANBAN_WEBHOOK_SECRET` | a long random string that goes in the webhook path |
| `KANBAN_PUBLIC_URL` | Chatwoot's public URL, used to register the webhook |
| `KANBAN_ACCOUNT_IDS` | served account ids, comma separated (default `1`) |
| `KANBAN_DATA_DIR` | attachments folder (default `/data`) |

Generate the webhook secret with `openssl rand -hex 32`.

## 3. Service in Chatwoot's compose file

Add to the compose file that already runs Chatwoot (service and network names must match yours):

```yaml
  kanban:
    build: /opt/chatwoot-kanban
    image: chatwoot-kanban:local
    restart: unless-stopped
    environment:
      KANBAN_DB_URL: ${KANBAN_DB_URL}
      CHATWOOT_INTERNAL_URL: http://rails:3030
      CHATWOOT_API_TOKEN: ${KANBAN_CHATWOOT_TOKEN}
      KANBAN_WEBHOOK_SECRET: ${KANBAN_WEBHOOK_SECRET}
      KANBAN_PUBLIC_URL: ${FRONTEND_URL}
      KANBAN_ACCOUNT_IDS: "1"
    volumes:
      - kanban_data:/data
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  kanban_data:
```

Make sure Chatwoot's Postgres and Redis use named volumes. Without them, recreating the container wipes everything.

## 4. Route on the domain

In the proxy (EasyPanel: the Chatwoot service's Domains tab): Chatwoot's domain, path `/kanban`, target the `kanban` service, port 4000, without stripping the path prefix. The rest of the domain keeps going to Chatwoot.

## 5. Start and check

```
docker compose up --build -d kanban
curl -s https://YOUR_DOMAIN/kanban/healthz     # {"ok":true}
curl -s -o /dev/null -w "%{http_code}" https://YOUR_DOMAIN/kanban/api/accounts/1/board   # 401 without a session
```

On startup the service runs migrations, creates the starter funnel and registers the webhook on the account if it does not exist yet.

## 6. Entry points inside Chatwoot

- **Menu item:** Super Admin › Settings › Dashboard Scripts. Paste `<script src="/kanban/chatwoot-inject.js" defer></script>`. The "📋 Kanban" item appears in the side menu.
- **Conversation tab:** Settings › Integrations › Dashboard Apps › Add. Name "Kanban", endpoint `https://YOUR_DOMAIN/kanban/conversation.html`.

Ask the user to reload Chatwoot with Ctrl+F5.

## 7. Configure and test

1. Open the Kanban and create funnels and stages (as an administrator).
2. Under Rules, link each Chatwoot label to a stage.
3. Use a test conversation, apply the label and check the card appears in the right stage. Do not use a real customer to test.

## Updating

Copy the new code to the server folder and run `docker compose up --build -d kanban`. New migrations run by themselves.

## Common problems

- **401 inside the Kanban:** the Kanban's domain is not Chatwoot's, or the session expired. Log in to Chatwoot again.
- **Card is not created:** check that the webhook exists on the account (Settings › Integrations › Webhooks), that the secret matches and that the label has a rule.
- **Redirect loop on the internal call:** Chatwoot with `FORCE_SSL` requires the `X-Forwarded-Proto: https` header; the base code already sends it.
- **Menu without the item:** check Dashboard Scripts and reload with Ctrl+F5. On narrow screens the item becomes a floating button.
