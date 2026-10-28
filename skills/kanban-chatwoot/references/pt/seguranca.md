# Segurança e operação

## Segredos

- Token de administrador, senha do banco e segredo do webhook entram só como variáveis de ambiente do servidor. Nunca no repositório, no compose versionado, em log ou em captura de tela.
- O token de administrador dá acesso total à conta do Chatwoot. Crie um usuário administrador só para o Kanban, para poder revogar sem afetar pessoas.
- Troque qualquer segredo que apareceu em conversa, chamado ou print.

## Acesso

- O Kanban só aceita requisições com sessão válida do Chatwoot e confere se a pessoa pertence à conta da URL.
- Funis, etapas e regras exigem papel de administrador. Anexos e notas respeitam autoria: só o autor ou um administrador apaga uma nota.
- O endpoint do webhook responde 404 sem o segredo certo e compara em tempo constante.
- Não exponha a porta 4000 no host. O acesso é pelo domínio, atrás do proxy com HTTPS.

## Dados

- Use volumes nomeados no Postgres, no Redis e nos anexos, e `restart: unless-stopped`.
- Faça dump diário do banco, com retenção, e copie para fora do servidor. Teste a restauração.
- Os anexos são arquivos sem varredura de vírus; o limite é 20 MB por arquivo. Se a equipe receber arquivos de fora, avalie antivírus.
- Limpeza automática de imagens do Docker pode apagar imagens construídas localmente. Limite a limpeza a imagens antigas (por exemplo, mais de 7 dias) para não derrubar serviços que dependem de `build`.

## Operação

- Fixe a versão do Chatwoot (`chatwoot/chatwoot:v4.x.x-ce`); atualize de propósito, com backup.
- Teste mudanças com conversa de teste. Não mande mensagem real a cliente para testar.
- Monitore `/kanban/healthz` e o próprio Chatwoot, com aviso para uma pessoa quando cair.

## Privacidade

O card guarda nome e telefone do contato (copiados da conversa), valor, notas e anexos. Trate como dado pessoal: acesso mínimo, retenção definida e atendimento a pedido de exclusão, conforme a LGPD ou a lei aplicável.
