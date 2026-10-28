# Security and operations

## Secrets

- The administrator token, the database password and the webhook secret go only in the server's environment variables. Never in the repository, in a versioned compose file, in logs or in screenshots.
- The administrator token gives full access to the Chatwoot account. Create an administrator user just for the Kanban so you can revoke it without affecting people.
- Rotate any secret that showed up in a chat, ticket or screenshot.

## Access

- The Kanban only accepts requests with a valid Chatwoot session and checks that the person belongs to the account in the URL.
- Funnels, stages and rules require the administrator role. Notes respect authorship: only the author or an administrator deletes a note.
- The webhook endpoint answers 404 without the right secret and compares in constant time.
- Do not expose port 4000 on the host. Access goes through the domain, behind the HTTPS proxy.

## Data

- Use named volumes for Postgres, Redis and attachments, and `restart: unless-stopped`.
- Take a daily database dump with retention and copy it off the server. Test restoring it.
- Attachments are not virus-scanned; the limit is 20 MB per file. If your team receives files from outside, consider antivirus.
- Automatic Docker image cleanup can delete locally built images. Restrict it to old images (for example, older than 7 days) so it does not take down services that depend on `build`.

## Operations

- Pin Chatwoot's version (`chatwoot/chatwoot:v4.x.x-ce`); upgrade on purpose, with a backup.
- Test changes with a test conversation. Do not send real messages to customers to test.
- Monitor `/kanban/healthz` and Chatwoot itself, with an alert to a person when it goes down.

## Privacy

A card stores the contact's name and phone (copied from the conversation), value, notes and attachments. Treat it as personal data: minimum access, defined retention and handling of deletion requests, as required by LGPD, GDPR or the applicable law.
