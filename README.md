# 🎭 SESC Alertas - Extrator de Eventos

> **Versão:** 0.7.1
> **Status:** Em desenvolvimento ativo

Bot automatizado que monitora, extrai e organiza a programação cultural do SESC SP. Utiliza Inteligência Artificial para interpretar PDFs oficiais, armazena histórico em banco de dados e envia notificações inteligentes via Telegram, priorizando eventos da semana atual.

---

## 📖 Wiki do Projeto: Funcionamento e Recursos

### 🔄 Fluxo de Funcionamento

O sistema opera em um ciclo contínuo de monitoramento e notificação:

1.  **Scraping & Download**: O bot acessa o portal do SESC SP, localiza o PDF da programação do mês vigente ("Em Cartaz") e realiza o download.
2.  **Extração via IA (Gemini)**: O PDF é enviado para a API do Google Gemini (modelos Flash), que extrai estruturadamente os eventos (nome, data, local, preço, categoria).
3.  **Filtragem & Deduplicação**:
    *   **Deduplicação**: Cada evento gera um "fingerprint" único. Se já existir no banco de dados, é ignorado.
    *   **Filtros de Usuário**: Aplica regras definidas no `.env` (preço máximo, categorias, idade mínima, unidades específicas).
    *   **Filtros de Data**: Ignora eventos passados ou de meses seguintes.
4.  **Persistência**: Eventos válidos e logs de execução são salvos em banco SQLite local (`sesc-bot.db`).
5.  **Notificação Telegram**: Os eventos são formatados e enviados em dois blocos distintos para melhor experiência do usuário:
    *   ⭐ **Bloco 1 (Destaques da Semana)**: Eventos de hoje até o próximo sábado.
    *   📅 **Bloco 2 (Restante do Mês)**: Eventos a partir de domingo até o fim do mês.

### 🛠️ Recursos Principais

#### 1. 🧠 Extração Inteligente com IA
Utiliza LLMs (Large Language Models) para compreender layouts complexos de PDFs, extraindo datas em diversos formatos ("15 e 16/01", "Sextas às 20h") e normalizando as informações.

#### 2. 🗄️ Banco de Dados (Persistência)
Sistema integrado com SQLite (`better-sqlite3`) que garante:
*   **Histórico**: Registro de todos os eventos já processados.
*   **Integridade**: Evita envio de notificações duplicadas.
*   **Auditoria**: Log de todas as execuções do agendador.

#### 3. ⏰ Agendamento Automático (Scheduler)
Integrado com `node-cron`, permite que o bot rode autonomamente em intervalos definidos.
*   **Presets**: Configurações rápidas (diário, horário comercial, a cada hora).
*   **Controle**: Start/Stop/Run-Now via API ou Interface Web.
*   **Resiliência**: Recupera-se automaticamente em caso de falhas na API do Gemini.

#### 4. 🔍 Filtros Avançados
Configuráveis via arquivo `.env` para personalizar as notificações:
*   `FILTER_MAX_PRICE`: Define teto de preço (ex: 30 para eventos até R0).
*   `FILTER_CATEGORIES`: Filtra tipos (ex: "show,teatro,cinema").
*   `FILTER_MIN_AGE`: Classificação indicativa (ex: 0 para livre, 18 para adultos).
*   `FILTER_LOCATIONS`: Restringe a unidades específicas (ex: "Pompeia,Sesc Avenida Paulista").

#### 5. 📊 Interface Web & API
Dashboard acessível em `http://localhost:3000` para:
*   Visualizar logs em tempo real.
*   Gerenciar configurações e agendamentos.
*   Consultar estatísticas do banco de dados.
*   Endpoints REST disponíveis para integrações (`/scheduler/*`, `/database/*`).

---

## 🚀 Como Usar

### Instalação

```bash
git clone https://github.com/seu-usuario/sesc-bot.git
cd sesc-bot
npm install
```

### Configuração (.env)

Crie um arquivo `.env` baseado no `.env.example`:

```ini
# Credenciais
TELEGRAM_BOT_TOKEN=seu_token
TELEGRAM_CHAT_ID=seu_chat_id
GEMINI_API_KEY=sua_api_key

# Agendamento
SCHEDULER_ENABLED=true
CRON_SCHEDULE=0 8 * * *  # Todo dia às 08:00

# Filtros (Opcionais)
FILTER_MAX_PRICE=40
FILTER_CATEGORIES=show,teatro
```

### Execução

**Modo Interface Gráfica (Recomendado):**
```bash
npm run gui
# Acesse http://localhost:3000
```

**Modo Terminal:**
```bash
npm start
```

---

## 🏗️ Estrutura do Projeto

*   `index.js`: Core da aplicação (Orquestrador).
*   `database.js`: Camada de acesso a dados (SQLite).
*   `scheduler.js`: Gerenciador de tarefas cron.
*   `server.js`: Servidor Web (Express) e API.
*   `views/`: Templates EJS para a interface.
*   `sesc-bot.db`: Arquivo do banco de dados (gerado automaticamente).

## 📝 Licença
ISC
