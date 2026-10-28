# Instalação

Pré-requisitos: Chatwoot oficial (`chatwoot/chatwoot`, edição comunitária) rodando por Docker Compose com HTTPS, acesso à pasta onde o compose roda, um usuário administrador no Chatwoot e Postgres e Redis com volume.

## 1. Copiar o código para o servidor

Copie `base/` para uma pasta do servidor, por exemplo `/opt/chatwoot-kanban`. O compose vai construir a imagem a partir dela.

## 2. Variáveis de ambiente

Defina no painel (EasyPanel: aba Environment do serviço) ou em um `.env` que fica só no servidor. Nunca versione.

| Variável | Para quê |
|---|---|
| `KANBAN_DB_URL` | string de conexão do Postgres do Chatwoot, no formato padrão do Postgres com o usuário, a senha, o host (nome do serviço do banco no compose), a porta 5432 e o nome do banco do seu compose |
| `CHATWOOT_INTERNAL_URL` | endereço interno do Chatwoot na rede do compose, ex.: `http://rails:3030` |
| `CHATWOOT_API_TOKEN` | token de acesso de um administrador (Perfil › Token de acesso) |
| `KANBAN_WEBHOOK_SECRET` | texto longo e aleatório que vai no caminho do webhook |
| `KANBAN_PUBLIC_URL` | URL pública do Chatwoot, para registrar o webhook |
| `KANBAN_ACCOUNT_IDS` | ids das contas atendidas, separados por vírgula (padrão `1`) |
| `KANBAN_DATA_DIR` | pasta dos anexos (padrão `/data`) |

Gere o segredo do webhook com `openssl rand -hex 32`.

## 3. Serviço no compose do Chatwoot

Acrescente ao compose que já roda o Chatwoot (nomes de serviço e rede devem bater com os do seu):

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

Confirme que o Postgres e o Redis do Chatwoot usam volumes nomeados. Sem isso, recriar o contêiner apaga tudo.

## 4. Rota no domínio

No proxy (no EasyPanel, aba Domains do serviço do Chatwoot): domínio do Chatwoot, caminho `/kanban`, destino o serviço `kanban`, porta 4000, sem remover o prefixo do caminho. O resto do domínio continua indo para o Chatwoot.

## 5. Subir e conferir

```
docker compose up --build -d kanban
curl -s https://SEU_DOMINIO/kanban/healthz     # {"ok":true}
curl -s -o /dev/null -w "%{http_code}" https://SEU_DOMINIO/kanban/api/accounts/1/board   # 401 sem sessão
```

Na subida o serviço roda as migrations, cria o funil inicial e registra o webhook na conta, se ainda não existir.

## 6. Entradas dentro do Chatwoot

- **Item no menu:** Super Admin › Configurações › Dashboard Scripts. Cole `<script src="/kanban/chatwoot-inject.js" defer></script>`. O item "📋 Kanban" aparece no menu lateral.
- **Aba na conversa:** Configurações › Integrações › Dashboard Apps › Adicionar. Nome "Kanban", endpoint `https://SEU_DOMINIO/kanban/conversation.html`.

Peça ao usuário para recarregar o Chatwoot com Ctrl+F5.

## 7. Configurar e testar

1. Abra o Kanban, crie os funis e as etapas (como administrador).
2. Em Regras, ligue cada etiqueta do Chatwoot a uma etapa.
3. Use uma conversa de teste, aplique a etiqueta e confira se o card nasce na etapa certa. Não use cliente real para testar.

## Atualizar

Copie o código novo para a pasta do servidor e rode `docker compose up --build -d kanban`. As migrations novas rodam sozinhas.

## Problemas comuns

- **401 dentro do Kanban:** o domínio do Kanban não é o do Chatwoot, ou a sessão expirou. Entre no Chatwoot de novo.
- **Card não nasce:** confira se o webhook existe na conta (Configurações › Integrações › Webhooks), se o segredo bate e se a etiqueta tem regra.
- **Redirecionamento em loop na chamada interna:** o Chatwoot com `FORCE_SSL` exige o cabeçalho `X-Forwarded-Proto: https`; o código base já envia.
- **Menu sem o item:** confira o Dashboard Scripts e recarregue com Ctrl+F5. Em tela estreita o item vira um botão flutuante.
