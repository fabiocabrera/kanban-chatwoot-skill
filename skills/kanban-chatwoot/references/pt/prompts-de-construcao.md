# Prompts de construção

Use em sequência, uma etapa por vez, validando antes de seguir. Substitua o que está em maiúsculas.

## 1. Diagnóstico do ambiente

> Leia o compose do meu Chatwoot em CAMINHO. Diga a versão da imagem, se Postgres e Redis têm volume nomeado, como o domínio chega ao serviço `rails` e qual é a rede interna. Não altere nada. Liste o que falta para instalar o Kanban de `base/`.

## 2. Instalação

> Instale o Kanban de `base/` seguindo `references/pt/instalacao.md`. Gere o segredo do webhook, monte o serviço no compose sem escrever nenhum valor secreto no arquivo, crie a rota `/kanban` no domínio e confira `/kanban/healthz`. Faça backup do compose antes de editar.

## 3. Entradas no Chatwoot

> Mostre como configurar o Dashboard Script e o Dashboard App, e confira que o item "Kanban" aparece no menu e que a aba aparece numa conversa de teste.

## 4. Funis e regras

> Com estas etiquetas do meu Chatwoot: LISTA, e estas etapas por funil: LISTA. Proponha os funis e as regras de etiqueta. Espere minha aprovação antes de criar.

## 5. Teste ponta a ponta

> Crie uma conversa de teste, aplique a etiqueta X e confirme que o card nasce na etapa certa, uma única vez. Aplique de novo e confirme que não duplica. Não envie mensagem real a nenhum contato.

## 6. Adaptação

> Quero mudar COISA no Kanban (ex.: nomes das etapas iniciais, limite de anexo, novo campo no card). Leia `src/` e proponha a menor mudança. Se mexer no banco, crie uma migration nova em `src/db.js`; nunca edite uma já aplicada. Mostre o diff antes de aplicar.

## 7. Backup e monitoramento

> Configure dump diário do banco com retenção de 14 dias, cópia para fora do servidor e um alerta quando `/kanban/healthz` ou o Chatwoot saírem do ar. Teste uma restauração em um banco descartável.
