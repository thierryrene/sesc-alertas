# 🎭 SESC Alertas

> **Versão:** 0.7.1
> **Status:** Em desenvolvimento ativo

Bot que monitora a programação cultural do SESC SP, extrai eventos a partir do PDF oficial, persiste em SQLite e envia alertas por Telegram e WhatsApp.

---

## 📖 Funcionamento

### 🔄 Fluxo de Funcionamento

O fluxo operacional real do projeto é:

1. Antes de qualquer análise via Gemini, `index.js` e `agenda.js sync` verificam se o banco já tem eventos do mês vigente.
2. Se já houver eventos do mês, a análise pesada é interrompida para poupar quota da Gemini API.
3. Se não houver dados do mês, o sistema busca o PDF mais recente no portal do SESC.
4. O resultado da análise pode ser reutilizado via `pdf_cache`, evitando reprocessamento do mesmo PDF.
5. Os eventos são persistidos com fingerprint único em `sesc-bot.db`.
6. Os comandos `daily` e `weekly` consultam o banco primeiro e só tentam sincronizar se a janela solicitada estiver vazia.

## 🛠️ Recursos

### Extração com IA
Usa Gemini para extrair eventos do PDF oficial quando necessário. O projeto evita reanálises desnecessárias combinando verificação prévia do mês vigente com cache por PDF.

### Persistência
SQLite com `better-sqlite3` mantém:
- eventos extraídos,
- histórico de execuções,
- filtros salvos,
- cache de PDFs processados.

### Filtros
Configuráveis via `.env`:
- `FILTER_MIN_PRICE`
- `FILTER_MAX_PRICE`
- `FILTER_CATEGORIES`
- `FILTER_MIN_AGE`
- `FILTER_LOCATIONS`
- `SELECTED_UNITS`

### Canais de envio
- Telegram com HTML básico.
- WhatsApp via Evolution API com conversão para Markdown.

---

## 🚀 Como Usar

### Instalação

```bash
git clone <repo>
cd sesc-alertas
pnpm install
```

### Configuração (.env)

Crie um arquivo `.env` com as credenciais e filtros desejados:

```ini
# Credenciais
TELEGRAM_BOT_TOKEN=seu_token
TELEGRAM_CHAT_ID=seu_chat_id
GEMINI_API_KEY=sua_api_key


# Filtros (opcionais)
FILTER_MIN_PRICE=0
FILTER_MAX_PRICE=40
FILTER_CATEGORIES=show,teatro
```

### Execução

**Alerta rápido / novidades**
```bash
npm start
```

**Painel administrativo**
```bash
npm run gui
```

**Sincronização completa**
```bash
node agenda.js sync
```

**Alertas programados**
```bash
node agenda.js daily
node agenda.js weekly
```

## 🤖 GitHub Actions

O agendamento automatizado agora pode ser feito via GitHub Actions usando o workflow `SESC Scheduler`.

- `daily`: roda todo dia às `10:00 UTC` (`07:00` em `America/Sao_Paulo`).
- `weekly`: roda toda segunda às `11:00 UTC` (`08:00` em `America/Sao_Paulo`).
- `sync`: fica disponível por disparo manual via `workflow_dispatch`.

O workflow restaura o `sesc-bot.db` do artifact mais recente, executa o comando escolhido e publica um novo artifact ao final da execução bem-sucedida.

Secrets esperados no repositório:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `GEMINI_API_KEY`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_API_INSTANCE`
- `WHATSAPP_NUMBER`

GitHub Variables recomendadas:
- `URL_PAGINA`
- `MAX_ROUNDS`
- `GEMINI_MODEL`
- `FILTER_MIN_PRICE`
- `FILTER_MAX_PRICE`
- `FILTER_CATEGORIES`
- `FILTER_MIN_AGE`
- `FILTER_LOCATIONS`
- `SELECTED_UNITS`

Limitação importante: como o banco fica em artifact, o scheduler precisa rodar sem concorrência. Se o painel web continuar em outro ambiente escrevendo em um banco diferente, o estado ficará divergente.

---

## 🏗️ Estrutura do Projeto

*   `index.js`: fluxo principal de alerta rápido.
*   `agenda.js`: CLI de sincronização e alertas agendados.
*   `database.js`: camada SQLite.
*   `server.js`: painel web e endpoints auxiliares.
*   `views/`: interface EJS.
*   `sesc-bot.db`: banco local gerado automaticamente.

## 📝 Licença
ISC
