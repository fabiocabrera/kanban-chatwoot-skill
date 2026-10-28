# Kanban para Chatwoot / Kanban for Chatwoot

## Português

Uma skill pública para Claude Code que instala e adapta um Kanban próprio dentro do Chatwoot self-hosted, para quem usa a imagem oficial e não quer fork nem licença de terceiros. Serve a equipes de atendimento e vendas que já atendem pelo Chatwoot e querem organizar as conversas em funis.

Ela traz o código base (`base/`: servidor Node, interface e Dockerfile) e guias de arquitetura, instalação, integrações, segurança e prompts de construção. O Kanban tem funis, etapas, cards ligados a conversas, tarefas, notas, anexos, relatórios e roteamento por etiqueta. Ainda não tem motor de automação, campos personalizados nem follow-up com IA. Não contém credenciais nem dados de uma operação real.

### Instalação em 3 passos

1. Baixe o repositório (`git clone`) e copie a pasta `skills/kanban-chatwoot` para `~/.claude/skills/` (Windows: `C:\Users\SEU_USUARIO\.claude\skills\`). Para usar só em um projeto, copie para `.claude/skills/` dentro dele.
2. Reinicie a sessão ou recarregue as skills do ambiente.
3. Peça ao Claude para usar `kanban-chatwoot` ao instalar ou adaptar o Kanban no seu Chatwoot.

### Aviso legal

Este material é educacional e não substitui assessoria profissional. Quem usa deve respeitar as leis de proteção de dados aplicáveis (como a LGPD), as regras do Chatwoot e das plataformas de mensagem conectadas, e tratar os dados dos contatos com acesso mínimo. Não há promessa de resultado.

## English

A public Claude Code skill that installs and adapts your own Kanban inside a self-hosted Chatwoot, for people running the official image who want no fork and no third-party license. It suits support and sales teams that already work in Chatwoot and want to organize conversations into funnels.

It ships the base code (`base/`: Node server, interface and Dockerfile) and guides on architecture, installation, integrations, security and build prompts. The Kanban has funnels, stages, cards linked to conversations, tasks, notes, attachments, reports and label-based routing. It does not have an automation engine, custom fields or AI follow-up yet. It contains no credentials or real operational data.

### Installation in 3 steps

1. Download the repository (`git clone`) and copy the `skills/kanban-chatwoot` folder into `~/.claude/skills/` (Windows: `C:\Users\YOUR_USER\.claude\skills\`). To use it in a single project, copy it to `.claude/skills/` inside that project.
2. Restart the session or reload the environment's skills.
3. Ask Claude to use `kanban-chatwoot` when installing or adapting the Kanban in your Chatwoot.

### Legal notice

This material is educational and is not professional advice. Users must comply with applicable data protection laws (such as LGPD or GDPR), the rules of Chatwoot and of any connected messaging platforms, and handle contact data with minimum access. It makes no promise of results.
