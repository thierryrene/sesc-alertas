# 🎭 SESC Alertas - Extrator de Eventos

> **Versão:** Pre-Beta 0.7.1  
> **Status:** Em desenvolvimento ativo

Bot automatizado que monitora e extrai informações sobre shows e eventos culturais do SESC SP, processando PDFs da programação oficial e enviando notificações organizadas via Telegram com destaque para eventos da semana atual.

## 🎯 Funcionalidades

### Extração e Notificação
- ✅ Scraping automático da página oficial do SESC Em Cartaz
- ✅ Download e processamento de PDFs da programação mensal
- ✅ Análise inteligente com Google Gemini AI (modelo Flash)
- ✅ **Seleção personalizada de unidades SESC**
- ✅ Extração estruturada de eventos (nome, data, horário, local, preço, etc.)
- ✅ Deduplicação automática de eventos
- ✅ **Banco de dados SQLite para histórico** (Novo!)
- ✅ **Filtros avançados (categoria, preço, idade)** (Novo!)
- ✅ Envio de notificações formatadas para canal/grupo do Telegram
- ✅ Suporte para mensagens longas (split inteligente respeitando limites do Telegram)
- ✅ Sistema de retry e tratamento de rate limits

### Agendamento Automático (Novo!)
- ⏰ **Scheduler integrado (node-cron)**
- 🕐 Execução automática por expressão cron
- 📋 Presets prontos (diário, 2x ao dia, dias úteis, etc)
- ▶️ Controle via interface web (start/stop)
- 📊 Histórico de execuções no banco

### Interface de Gerenciamento
- 🎨 Interface web moderna e responsiva
- ⚙️ Configuração visual de todas as variáveis
- 🏢 Extração e seleção de unidades SESC
- 🔍 **Configuração de filtros avançados** (Novo!)
- 🕐 **Controles do agendamento automático** (Novo!)
- 💾 **Dashboard com estatísticas do banco** (Novo!)
- ▶️ Execução manual com um clique
- 📊 Status em tempo real
- 📋 Visualização de logs com auto-refresh

## 📋 Pré-requisitos

- Node.js 18+ (com suporte a ES Modules)
- Conta no Telegram e Bot Token
- API Key do Google Gemini (Generative AI)

## 🛠️ Instalação

```bash
# Clone o repositório
git clone https://github.com/SEU_USUARIO/sesc-alertas.git
cd sesc-alertas

# Instale as dependências
npm install
```

## ⚙️ Configuração

Edite o arquivo `index.js` e configure suas credenciais:

```javascript
const TELEGRAM_BOT_TOKEN = 'SEU_BOT_TOKEN_AQUI';
const TELEGRAM_CHAT_ID = 'SEU_CHAT_ID_AQUI';
const GEMINI_API_KEY = 'SUA_API_KEY_DO_GEMINI_AQUI';
```

### Como obter as credenciais:

1. **Telegram Bot Token:** Fale com [@BotFather](https://t.me/botfather) no Telegram
2. **Chat ID:** Use [@userinfobot](https://t.me/userinfobot) ou adicione o bot em um grupo
3. **Gemini API Key:** Acesse [Google AI Studio](https://makersuite.google.com/app/apikey)

## 🚀 Uso

### Modo GUI (Recomendado)

Execute a interface web de gerenciamento:

```bash
npm run gui
```

Acesse no navegador: **http://localhost:3000**

A interface permite:
- ⚙️ Configurar credenciais e parâmetros
- 🏢 Extrair e selecionar unidades SESC para monitoramento
- ▶️ Executar o script manualmente
- 📋 Visualizar logs em tempo real
- 📊 Acompanhar status das execuções

### Modo CLI (Linha de Comando)

Execute o bot diretamente:

```bash
npm start
```

O bot irá:
1. Buscar o PDF mais recente da programação
2. Processar o documento com IA
3. Extrair todos os shows da capital de SP
4. Enviar resumo organizado para o Telegram

## 📦 Dependências

```json
{
  "@google/generative-ai": "^0.24.1",
  "axios": "^1.13.2",
  "cheerio": "^1.1.2",
  "node-telegram-bot-api": "^0.63.0",
  "pdf-parse": "^2.4.5",
  "express": "^5.2.1",
  "ejs": "^4.0.1",
  "dotenv": "^17.2.3",
  "better-sqlite3": "^11.8.1",
  "node-cron": "^3.0.3"
}
```

## 🏗️ Arquitetura

- **Web Interface:** Express.js + EJS para painel de controle
- **Database:** SQLite (better-sqlite3) para histórico e deduplicação
- **Scheduler:** node-cron para agendamento automático
- **Scraping:** Axios + Cheerio para extrair link do PDF
- **IA:** Google Gemini Flash para análise semântica do PDF
- **Mensageria:** node-telegram-bot-api para notificações
- **Formato:** JSON estruturado com schema validado

## ⚠️ Limitações Conhecidas (Pre-Beta)

- Logs básicos (melhorias planejadas)
- Interface web pode ser aprimorada

## 🗺️ Roadmap

- [x] Sistema de agendamento interno (cron integrado) ✅
- [x] Banco de dados para histórico de eventos ✅
- [x] Filtros avançados (categoria, preço, idade) ✅
- [ ] Notificações por email
- [ ] API REST para integração externa
- [ ] Interface web aprimorada
- [ ] Testes automatizados
- [ ] Docker containerization

## 📝 Notas de Versão

### Pre-Beta 0.7.1 (Atual) - 🔧 Filtro de Datas Aprimorado
- 📅 **Melhor separação de períodos**
  - Bloco 1: Hoje até próximo sábado (semana atual)
  - Bloco 2: Após sábado até fim do mês vigente
  - Eventos passados totalmente excluídos
  - Eventos do próximo mês não são enviados
- 🎯 **Mensagens mais curtas e relevantes**
  - Apenas eventos do mês atual
  - Cabeçalhos mostram períodos exatos
  - Contagem de eventos por bloco
- 📊 **Logs detalhados**
  - Lista de eventos excluídos
  - Estatísticas de filtros aplicados
  - Períodos detalhados de cada bloco

### Pre-Beta 0.7.0 - ✨ Major Update
- 🗄️ **Banco de dados SQLite integrado**
  - Histórico completo de eventos
  - Deduplicação por fingerprint (hash único)
  - Rastreamento de execuções
  - Estatísticas e analytics
  - API para consulta de eventos históricos
- ⏰ **Agendamento automático (node-cron)**
  - Execução periódica configurável
  - 10+ presets prontos (diário, 2x/dia, dias úteis, etc)
  - Controle via interface web (start/stop)
  - Suporte a expressões cron personalizadas
- 🔍 **Filtros avançados**
  - Filtro por categoria de evento
  - Filtro por faixa de preço (mín/máx)
  - Filtro por classificação etária
  - Filtro por localização específica
  - Combinação de múltiplos filtros
- 📊 **Interface web aprimorada**
  - Dashboard com estatísticas do banco
  - Histórico de execuções
  - Controles do scheduler integrados
  - Configuração visual de filtros
- 🔧 Melhorias de performance e estabilidade

### Pre-Beta 0.6.0
- ✨ **Envio em blocos separados:** Notificações agora são enviadas em 2 blocos distintos
  - **Bloco 1:** ⭐ Destaques desta semana (eventos de hoje até sábado)
  - **Bloco 2:** 📅 Próximos eventos do mês (restante do mês vigente)
- 🔧 Cada bloco respeita limite de caracteres do Telegram (split automático)
- ⏱️ Pausa de 1 segundo entre blocos para evitar rate limiting
- 📦 Melhor organização das notificações

### Pre-Beta 0.5.1
- 🐛 **Corrigido filtro de datas:** Eventos passados agora são corretamente excluídos
- 🔍 Melhor parsing de períodos (ex: "15 a 20/01")
- 📊 Logs detalhados mostrando eventos excluídos por serem passados
- ✨ Função `isThisWeek()` agora considera apenas eventos futuros

### Pre-Beta 0.5.0
- 🔄 Removida dependência do Electron (foco na versão web)
- ✨ Filtragem automática de eventos por data
- ⭐ Seção "DESTAQUES DESTA SEMANA" no topo das notificações
- 📅 Ordenação cronológica automática de eventos
- 🗓️ Parser inteligente de datas em formato brasileiro
- 🚀 Interface web mantida (Express + EJS)

### Pre-Beta 0.4.0
- ✨ Tentativa de migração para Electron (revertida)
- ✨ Sistema de filtragem por data implementado

### Pre-Beta 0.3.0
- ✨ Sistema de seleção de unidades SESC
- ✨ Extração automática de todas as unidades do PDF
- ✨ Interface para selecionar quais unidades monitorar
- ✨ Filtragem de eventos por unidades selecionadas

### Pre-Beta 0.2.0
- ✨ Interface web de gerenciamento completa
- ✨ Configuração visual de credenciais e parâmetros
- ✨ Execução manual via GUI
- ✨ Dashboard com status em tempo real
- ✨ Visualização de logs com auto-refresh
- 🔒 Sistema de variáveis de ambiente implementado

### Pre-Beta 0.1.0
- Primeira versão funcional
- Extração básica de eventos com IA
- Notificações via Telegram operacionais
- Sistema de continuação multi-rodadas implementado

## 🤝 Contribuindo

Este projeto está em fase inicial. Contribuições são bem-vindas!

## 📄 Licença

ISC

## 👤 Autor

Thierry

---

**⚠️ AVISO DE SEGURANÇA:** Antes de fazer commit, remova as credenciais expostas no código e use variáveis de ambiente!
