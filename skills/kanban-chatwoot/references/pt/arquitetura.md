# Arquitetura

## Objetivo

Dar ao Chatwoot da imagem oficial um quadro Kanban sem fork, sem plugin pago e sem mexer no código do Chatwoot. O Kanban é um serviço à parte que lê e escreve no Chatwoot só por API e webhook, e guarda os próprios dados em um schema separado do mesmo Postgres.

## Fluxo principal

```
Navegador (logado no Chatwoot)
   │  cookie cw_d_session_info (mesmo domínio)
   ▼
https://SEU_DOMINIO/            → Chatwoot (rails)
https://SEU_DOMINIO/kanban/...  → Kanban (Node, porta 4000)
                                     │ valida a sessão em  GET /api/v1/profile
                                     │ chamadas de sistema com o token de administrador
                                     ▼
                                  Chatwoot (rails, rede interna)

Chatwoot ── webhook (conversation_created / conversation_updated / message_created) ──► Kanban
Kanban ──► Postgres do Chatwoot, schema "kanban"
```

## Decisões de projeto

1. **Mesmo domínio, caminho `/kanban`.** O navegador já manda o cookie de sessão do Chatwoot. O Kanban lê os cabeçalhos `access-token`, `client` e `uid` dessa sessão e confere em `/api/v1/profile`. Não há login nem usuário próprios. A resposta fica em cache por 5 minutos.
2. **Papéis vêm do Chatwoot.** O perfil traz o papel da pessoa em cada conta. Administrador edita funis, etapas e regras; agente usa o quadro. Todo registro é filtrado pelo `account_id` da URL, e o servidor confere se o registro pertence à conta antes de qualquer alteração.
3. **Schema `kanban` no Postgres do Chatwoot.** O backup do banco já cobre o Kanban. As migrations são numeradas e idempotentes e rodam na subida; nunca edite uma já aplicada, crie a próxima.
4. **Um card por conversa em cada funil.** Garantido por índice único parcial (`funnel_id, conversation_id` onde não arquivado). O webhook pode chegar repetido sem criar duplicata.
5. **Roteamento só cria.** Etiqueta com regra cria o card na etapa da regra. Etiqueta nova em conversa que já tem card no funil não move o card; mover é decisão do atendente.
6. **Webhook com segredo no caminho.** O Chatwoot não assina webhooks de conta, então o segredo vai na URL e é comparado em tempo constante. Sem segredo configurado, o endpoint responde 404.
7. **Anexos em volume.** O arquivo vai para `/data/attachments` com nome aleatório; o banco guarda nome, tipo e tamanho.
8. **Duas entradas dentro do Chatwoot.** Um script de painel (Dashboard Scripts) coloca o item "Kanban" no menu lateral e abre o quadro em tela cheia. Um Dashboard App mostra os cards da conversa aberta, numa aba.

## Modelo de dados (schema `kanban`)

`funnels` → `stages` → `cards`, e por card: `card_tasks`, `card_notes`, `card_attachments`, `card_events` (histórico e base dos relatórios). `routing_rules` liga uma etiqueta a uma etapa. `migrations` registra o que já foi aplicado.

## Stack

Node 22, Fastify 5, `pg`, `@fastify/multipart`, `@fastify/static`, SortableJS para arrastar e soltar. A interface é HTML e JavaScript puros, sem build.

## Estrutura de `base/`

- `src/server.js`: rotas da API, autenticação, webhook e registro automático do webhook.
- `src/db.js`: pool, migrations e funil inicial.
- `src/chatwoot.js`: cliente da API do Chatwoot e validação de sessão.
- `src/routing.js`: webhook → cards.
- `public/`: quadro, modal do card, página da conversa e `chatwoot-inject.js` (item no menu).
- `Dockerfile`: imagem enxuta, usuário sem privilégio, healthcheck em `/kanban/healthz`.
