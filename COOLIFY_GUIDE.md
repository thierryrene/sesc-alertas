# 🚀 Guia de Deploy no Coolify - SESC Alertas

Este guia explica como colocar a sua aplicação para rodar no seu servidor **Coolify** utilizando o **Dockerfile** que já criamos e está no projeto.

---

###  1. Criar novo Recurso (Application)
1. No painel do seu Coolify, clique em **Project** > **Environment**.
2. Clique em **+ New Resource** (Novo Recurso) e escolha **Application** (Aplicação).
3. Conecte ao seu repositório Git (GitHub/GitLab) e selecione o branch correto.

---

### 📥 2. Configurações Básicas da Aplicação
Quando o Coolify ler o seu repositório, ele vai detectar o `Dockerfile` que acabamos de criar.

*   **Build Pack:** Certifique-se de que está como `Dockerfile`.
*   **Ports:** Adicione a porta `3000` (porta padrão do painel Express).
*   **Health Check:** Pode deixar habilitado apontando para `/` se o seu painel abrir ali.

---

### 🔑 3. Variáveis de Ambiente (.env)
Vá na aba **Environment Variables** (Variáveis de Ambiente) na sua aplicação no Coolify e cole **todas** as variáveis existentes no seu arquivo `.env` local:

*   `GEMINI_API_KEY`
*   `TELEGRAM_BOT_TOKEN`
*   `TELEGRAM_CHAT_ID`
*   `EVOLUTION_API_URL`
*   `EVOLUTION_API_KEY`
*   `EVOLUTION_API_INSTANCE`
*   `WHATSAPP_NUMBER`
*   *(Demais variáveis que você use em `.env`)*

---

### 💾 4. Persistência de Dados (Banco de Dados)
Como o SQLite salva os eventos em um arquivo estático (`sesc-bot.db`), se o container reiniciar sem persistência, os dados serão zerados.

1. No Coolify, vá na aba **Storage** (Armazenamento) ou **Volumes**.
2. Clique em **+ Add Volume** (ou File Mount).
3. Configure da seguinte forma:
   *   **Destination Path (No Container):** `/app/sesc-bot.db`
   *   **Type:** `File` (Arquivo)
   *   *(Isso mapeará o arquivo do banco no disco do seu servidor, impedindo que ele se apague).*

---

### ⏰ 5. Agendador (CRON Jobs)
O seu painel já executa o script e dispara. Para garantir que o **Envio Diário** ou **Semanal** rode de madrugada ou no seu horário configurado diretamente pelo Coolify:

1. Vá na aba **Tasks** ou **Advanced** no Coolify.
2. Crie uma nova tarefa **Periodic / Cron**:
   *   **Comando:** `node agenda.js daily`
   *   **Frequência:** `0 7 * * *` (Todos os dias às 07:00 da manhã, por exemplo).
3. Crie outra para o semanal (se desejar):
   *   **Comando:** `node agenda.js weekly`
   *   **Frequência:** `0 8 * * 1` (Toda segunda-feira às 08:00).

---

Feito isso, clique em **Deploy** no topo do painel do Coolify. O servidor vai montar a imagem Node.js e disponibilizar o seu painel web no subdomínio configurado! 🌐
