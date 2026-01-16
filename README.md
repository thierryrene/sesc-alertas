# 🎭 SESC Alertas - Extrator de Eventos

> **Versão:** Pre-Beta 0.5.1  
> **Status:** Em desenvolvimento ativo

Bot automatizado que monitora e extrai informações sobre shows e eventos culturais do SESC SP, processando PDFs da programação oficial e enviando notificações organizadas via Telegram com destaque para eventos da semana atual.

## 🎯 Funcionalidades

### Extração e Notificação
- ✅ Scraping automático da página oficial do SESC Em Cartaz
- ✅ Download e processamento de PDFs da programação mensal
- ✅ Análise inteligente com Google Gemini AI (modelo Flash)
- ✅ **Seleção personalizada de unidades SESC** (Novo!)
- ✅ Extração estruturada de eventos (nome, data, horário, local, preço, etc.)
- ✅ Deduplicação automática de eventos
- ✅ Envio de notificações formatadas para canal/grupo do Telegram
- ✅ Suporte para mensagens longas (split inteligente respeitando limites do Telegram)
- ✅ Sistema de retry e tratamento de rate limits

### Interface de Gerenciamento
- 🎨 Interface web moderna e responsiva
- ⚙️ Configuração visual de todas as variáveis
- 🏢 **Extração e seleção de unidades SESC** (Novo!)
- ✅ Seleção múltipla de unidades para monitoramento
- ▶️ Execução manual com um clique
- 📊 Dashboard com status em tempo real
- 📋 Visualização de logs com auto-refresh
- 💾 Salvamento automático de configurações

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
  "express": "^4.18.2",
  "ejs": "^3.1.9",
  "dotenv": "^16.4.1"
}
```

## 🏗️ Arquitetura

- **Web Interface:** Express.js + EJS para painel de controle
- **Scraping:** Axios + Cheerio para extrair link do PDF
- **IA:** Google Gemini Flash para análise semântica do PDF
- **Mensageria:** node-telegram-bot-api para notificações
- **Formato:** JSON estruturado com schema validado

## ⚠️ Limitações Conhecidas (Pre-Beta)

- Sem agendamento automático integrado (requer cron externo ou execução manual)
- Logs básicos (melhorias planejadas)

## 🗺️ Roadmap

- [ ] Sistema de agendamento interno (cron integrado)
- [ ] Notificações por email
- [ ] API REST para integração externa
- [ ] Filtros avançados (categoria, preço, idade)
- [ ] Banco de dados para histórico de eventos
- [ ] Testes automatizados
- [ ] Docker containerization

## 📝 Notas de Versão

### Pre-Beta 0.5.1 (Atual)
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
