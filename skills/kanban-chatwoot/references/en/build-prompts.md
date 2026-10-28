# Build prompts

Use them in order, one step at a time, checking before moving on. Replace the uppercase parts.

## 1. Environment diagnosis

> Read my Chatwoot compose file at PATH. Tell me the image version, whether Postgres and Redis have named volumes, how the domain reaches the `rails` service and what the internal network is. Change nothing. List what is missing to install the Kanban from `base/`.

## 2. Installation

> Install the Kanban from `base/` following `references/en/installation.md`. Generate the webhook secret, add the service to the compose file without writing any secret value into it, create the `/kanban` route on the domain and check `/kanban/healthz`. Back up the compose file before editing.

## 3. Entry points in Chatwoot

> Show how to set up the Dashboard Script and the Dashboard App, and check that the "Kanban" menu item appears and that the tab shows up on a test conversation.

## 4. Funnels and rules

> With these labels from my Chatwoot: LIST, and these stages per funnel: LIST. Propose the funnels and the label rules. Wait for my approval before creating anything.

## 5. End-to-end test

> Create a test conversation, apply label X and confirm the card appears in the right stage, exactly once. Apply it again and confirm it does not duplicate. Do not send a real message to any contact.

## 6. Customization

> I want to change THING in the Kanban (e.g. starter stage names, attachment limit, a new card field). Read `src/` and propose the smallest change. If it touches the database, add a new migration in `src/db.js`; never edit one already applied. Show the diff before applying.

## 7. Backup and monitoring

> Set up a daily database dump kept for 14 days, a copy off the server and an alert when `/kanban/healthz` or Chatwoot goes down. Test a restore into a throwaway database.
