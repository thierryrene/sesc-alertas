# Guia de Scripts - SESC Alertas

Este documento descreve os scripts disponíveis no projeto **sesc-alertas**, suas finalidades e como executá-los.

## 🚨 Regra de Segurança (Quota da API)

Antes de rodar `npm start` ou `node agenda.js sync`, o sistema verificará se já existem eventos para o mês atual. **Se houver dados, a análise de IA será ignorada para poupar sua cota do Gemini.**

Para forçar uma nova análise em caso de erro nos dados, você deve limpar o cache do PDF no banco de dados primeiro.

## 🚀 Scripts Principais (package.json)

### 1. `npm start`
*   **Comando:** `node index.js`
*   **Finalidade:** Executa o fluxo principal de alerta do SESC.
*   **O que faz:** 
    *   Busca o PDF "Em Cartaz" mais recente no site do SESC.
    *   Analisa o conteúdo usando a API do Google Gemini (IA).
    *   Identifica novos eventos e os salva no banco de dados local (`sesc-bot.db`).
    *   Envia notificações formatadas para o Telegram e WhatsApp (via Evolution API).
*   **Uso ideal:** Execução automatizada (ex: via Cron) ou verificação rápida de novidades.

### 2. `npm run gui`
*   **Comando:** `node server.js`
*   **Finalidade:** Inicia a interface gráfica de gerenciamento.
*   **O que faz:**
    *   Sobe um servidor web na porta `3000` (ou definida no `.env`).
    *   Permite configurar as APIs (Gemini, Telegram, WhatsApp) pelo navegador.
    *   Exibe o QR Code para conectar o WhatsApp.
    *   Permite escolher unidades específicas do SESC para monitorar.
    *   Mostra logs de execução em tempo real.
*   **Uso ideal:** Configuração inicial, monitoramento e execuções manuais por usuários que preferem interface visual.

---

## 📅 Scripts de Agendamento (CLI Agenda)

O arquivo `agenda.js` funciona como um utilitário de linha de comando para tarefas específicas que podem ser agendadas no sistema (crontab).

### 3. `node agenda.js sync`
*   **Finalidade:** Sincronização profunda da base de dados.
*   **Diferencial:** Tenta extrair o máximo de eventos possível do PDF (até 15 rodadas de IA) para garantir que o banco de dados local esteja completo, sem filtros de unidade.

### 4. `node agenda.js weekly`
*   **Finalidade:** Relatório Semanal.
*   **O que faz:** Busca no banco de dados todos os eventos agendados para os próximos 7 dias e envia um resumo consolidado para os canais de alerta.

### 5. `node agenda.js daily`
*   **Finalidade:** Relatório Diário ("Hoje no SESC").
*   **O que faz:** Envia apenas os eventos que acontecem na data atual.

---

## 📰 Scripts Utilitários

### 6. `node hn_summary.js`
*   **Finalidade:** Resumo Hacker News.
*   **O que faz:** Coleta os posts mais populares do Hacker News (score > 50), utiliza o Gemini para criar um resumo em português de cada notícia e envia para o Telegram/WhatsApp.
*   **Uso ideal:** Manter-se atualizado com notícias tech de forma resumida uma vez ao dia.

---

## 🛠 Configuração Necessária

Para que os scripts funcionem corretamente, o arquivo `.env` deve estar configurado com:
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`
- `GEMINI_API_KEY`
- Credenciais da `EVOLUTION_API` (para WhatsApp)

## 🗄 Banco de Dados
O projeto utiliza **SQLite** (`sesc-bot.db`). Os scripts de agenda dependem que os dados tenham sido previamente coletados pelo `index.js` ou pelo comando `sync`.

---
*Gerado em: 19 de Março de 2026*
