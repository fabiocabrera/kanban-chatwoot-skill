---
name: kanban-chatwoot
description: "Use quando a pessoa quiser instalar, entender ou adaptar um Kanban próprio dentro do Chatwoot self-hosted (imagem oficial, sem fork e sem licença de terceiros), com funis, cards ligados a conversas e roteamento por etiqueta."
---

# Kanban para Chatwoot

Detecte o idioma do usuário. Para português, leia apenas os arquivos necessários em `references/pt/`. Para inglês, use os equivalentes em `references/en/`. Responda no idioma detectado.

Esta skill traz o código base de um Kanban (`base/`) que roda ao lado da imagem oficial do Chatwoot e conversa com ele só pela API e por webhooks. Quem está logado no Chatwoot já está logado no Kanban.

## O que o Kanban faz hoje (versão 0.1)

- Vários funis, etapas com cor, arrastar e soltar.
- Cards ligados a uma conversa ou soltos (dá para ligar depois), com valor, descrição, tarefas com checklist, notas e anexos (20 MB).
- Histórico de cada card, busca e relatórios por etapa e por atendente.
- Roteamento por etiqueta: uma etiqueta com regra cria o card na etapa certa, uma vez por conversa em cada funil.
- Botão "Kanban" no menu lateral do Chatwoot e aba "Kanban" dentro da conversa.
- Administradores do Chatwoot editam funis, etapas e regras; agentes usam o quadro.

## O que ainda não existe

Não prometa nada disto como se estivesse pronto: motor de automação com gatilhos e ações, campos personalizados, follow-up com IA, envio de templates. O movimento do card entre etapas é decisão do atendente.

## Fluxo

1. Entender o ambiente: Chatwoot oficial self-hosted (Docker, por exemplo no EasyPanel), domínio com HTTPS, acesso ao compose e ao Postgres do Chatwoot.
2. Preparar o Chatwoot: token de um administrador, segredo do webhook, lista das contas atendidas.
3. Subir o serviço `kanban` no mesmo compose, a partir de `base/`, atrás do mesmo domínio no caminho `/kanban`.
4. Ligar ao Chatwoot: item no menu (Dashboard Scripts) e aba na conversa (Dashboard App).
5. Configurar funis, etapas e regras de etiqueta e testar com uma conversa de verdade.
6. Cuidar de backup, atualização e segurança.

## Ordem de construção

Banco e migrations primeiro, depois autenticação pela sessão do Chatwoot, depois a API de funis e cards, depois o webhook e as regras, por último a interface e as duas entradas dentro do Chatwoot. Se a pessoa só quer instalar, siga `references/pt/instalacao.md` e não reescreva o código.

## Regras

- Rode o Kanban no mesmo domínio do Chatwoot, em `/kanban`. Sem isso o cookie de sessão não chega ao serviço.
- Guarde dados no schema `kanban` do Postgres do Chatwoot, para que o backup que já existe cubra o Kanban.
- Nunca ponha segredo em arquivo versionado: token, senha do banco e segredo do webhook entram só como variáveis de ambiente do painel.
- Use volumes nomeados no Postgres, no Redis e nos anexos. Sem volume, recriar o contêiner apaga os dados.
- Fixe a versão da imagem do Chatwoot; não use `latest`.
- Teste em uma conversa de teste antes de ligar para a equipe. Não envie mensagens reais para clientes para testar.
- Não prometa resultado comercial nem funções que a versão 0.1 não tem.

## Referências

- Português: `references/pt/arquitetura.md`, `instalacao.md`, `integracoes.md`, `seguranca.md`, `prompts-de-construcao.md`.
- English: `references/en/architecture.md`, `installation.md`, `integrations.md`, `security.md`, `build-prompts.md`.
- Código base: `base/` (servidor Node + Fastify, interface sem framework, Dockerfile).
