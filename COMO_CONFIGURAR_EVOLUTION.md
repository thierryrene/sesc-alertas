# 🚀 Guia de Configuração - Evolution API

Como você nunca utilizou a **Evolution API**, a forma mais rápida e segura de rodar localmente (ou no seu servidor) é utilizando **Docker Compose**. 

Ela necessita de um banco **PostgreSQL** e **Redis** para alta performance.

---

## 🛠️ Passo 1: Subir a API via Docker

Crie uma pasta para a API e adicione os arquivos abaixo:

### 1. `docker-compose.yml`

```yaml
version: '3.8'

services:
  evolution-redis:
    image: redis:6-alpine
    container_name: evolution_redis
    restart: always
    volumes:
      - redis_data:/data

  evolution-db:
    image: postgres:15-alpine
    container_name: evolution_db
    restart: always
    environment:
      POSTGRES_DB: evolution
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password123
    volumes:
      - postgres_data:/var/lib/postgresql/data

  evolution-api:
    image: atendte/evolution-api:latest
    container_name: evolution_api
    restart: always
    ports:
      - "8080:8080"
    environment:
      # Chave de segurança para acessar a API (Mude se for para produção)
      - API_KEY=sua_chave_global_secreta
      
      # Conexão Banco de Dados
      - DATABASE_ENABLED=true
      - DATABASE_CONNECTION_CLIENT=pg
      - DATABASE_CONNECTION_HOST=evolution-db
      - DATABASE_CONNECTION_PORT=5432
      - DATABASE_CONNECTION_DATABASE=evolution
      - DATABASE_CONNECTION_USER=admin
      - DATABASE_CONNECTION_PASSWORD=password123
      
      # Conexão Redis
      - REDIS_ENABLED=true
      - REDIS_HOST=evolution-redis
      - REDIS_PORT=6379
      
      # Configurações de Instância
      - INSTANCE_AUTO_RECONNECT=true
      - INSTANCE_AUTO_READ=true
      
    depends_on:
      - evolution-redis
      - evolution-db

volumes:
  redis_data:
  postgres_data:
```

### 2. Executar
Rode o comando no terminal dentro da pasta:
```bash
docker compose up -d
```
Aguarde alguns segundos. A API estará rodando em `http://localhost:8080`.

---

## 🔑 Passo 2: Criar uma Instância (Conectar WhatsApp)

A Evolution API funciona por **Instâncias**. Cada instância é um número de WhatsApp conectado.

### 1. Criar a Instância
Abra o seu terminal e rode o comando `curl` para criar uma instância chamada `agenda_sesc`:

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: sua_chave_global_secreta" \
  -H "Content-Type: application/json" \
  -d '{
    "instanceName": "agenda_sesc",
    "token": "token_opcional_da_instancia",
    "number": "5511999999999",
    "qrcode": true
  }'
```
*(Você receberá uma resposta com o token e informações).*

---

## 📸 Passo 3: Escanear o QR Code

Para conectar o seu celular:

1.  Acesse no seu navegador a rota de QR Code (substitua pelo nome da sua instância):
    `http://localhost:8080/instance/qrcode/agenda_sesc`
2.  Vai aparecer um QR Code na tela.
3.  No seu celular (WhatsApp), vá em **Dispositivos Conectados > Conectar um dispositivo**.
4.  Escaneie o QR Code.

Pronto! Seu WhatsApp agora está "espelhado" na API.

---

## ⚙️ Passo 4: Configurar no Painel SESC Alertas

Agora que você tem os dados, vá na aba **Configurações** do dashboard do SESC Alertas e preencha:

-   **URL da API:** `http://localhost:8080` (Se estiver rodando na mesma máquina)
-   **API Key:** `sua_chave_global_secreta`
-   **Instância:** `agenda_sesc`
-   **Número Destino:** O número para onde quer mandar os alertas (Ex: `5511988887777`).

💡 **Dica:** Para mandar para um **Grupo**, você precisará do ID do grupo (JID). Você consegue listar seus chats usando a API `/chat/findChats` para descobrir o ID @g.us do grupo.
