# Integrações

Tudo que o Kanban usa do Chatwoot é público e documentado. Nada exige fork.

## API do Chatwoot (token de administrador, cabeçalho `api_access_token`)

| Uso | Chamada |
|---|---|
| Ler uma conversa | `GET /api/v1/accounts/{conta}/conversations/{id}` |
| Listar etiquetas | `GET /api/v1/accounts/{conta}/labels` |
| Listar caixas de entrada | `GET /api/v1/accounts/{conta}/inboxes` |
| Listar agentes | `GET /api/v1/accounts/{conta}/agents` |
| Listar e criar webhooks | `GET` e `POST /api/v1/accounts/{conta}/webhooks` |
| Aplicar etiquetas | `POST /api/v1/accounts/{conta}/conversations/{id}/labels` |

## Sessão do usuário

O navegador manda os cabeçalhos da sessão do Chatwoot (`access-token`, `client`, `uid`). O Kanban os repassa a `GET /api/v1/profile` com `token-type: Bearer`. Resposta 200 traz o perfil e as contas com o papel; 401 encerra o acesso. Guarde o resultado em cache curto para não consultar a cada clique.

## Webhook

Eventos assinados: `conversation_created`, `conversation_updated`, `message_created`. Campos usados do corpo:

- `event`, `account.id`, `inbox_id`
- conversas: `id` (número de exibição), `labels`, `meta.sender` (id, nome, telefone), `meta.assignee`
- mensagens: `conversation.id`

O endpoint é `POST /kanban/api/webhooks/chatwoot/{segredo}`. O serviço registra sozinho o webhook na subida.

## Dashboard Scripts e Dashboard Apps

- **Dashboard Scripts** (Super Admin): um `<script>` carregado em todo o painel. O `chatwoot-inject.js` usa o caminho da página (`/accounts/{id}/...`) para saber a conta, insere o item no menu lateral e abre o quadro num iframe em tela cheia. Ao clicar em "abrir conversa" no card, o quadro avisa a página por `postMessage` e ela navega pelo roteador do Chatwoot, sem recarregar.
- **Dashboard Apps**: um iframe na barra lateral da conversa. O Chatwoot envia o contexto (conversa, contato) por `postMessage` quando a página manda `chatwoot-dashboard-app:fetch-info`.

## EasyPanel (opcional)

Quando o Chatwoot roda como serviço de Compose no EasyPanel: variáveis na aba Environment, rota na aba Domains (domínio do Chatwoot + caminho `/kanban` → serviço `kanban`, porta 4000) e deploy pelo painel ou por `docker compose up --build -d kanban` no servidor.

## Backup

O schema `kanban` está no mesmo banco do Chatwoot, então o `pg_dump` do banco já o inclui. Os anexos ficam no volume `kanban_data` e precisam de cópia própria. Mantenha uma cópia fora do servidor.
