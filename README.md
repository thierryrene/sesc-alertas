# 🎭 SESC Bot - Extrator de Eventos

> **Versão:** Pre-Beta 0.1.0  
> **Status:** Em desenvolvimento ativo

Bot automatizado que monitora e extrai informações sobre shows e eventos culturais do SESC SP (capital), processando PDFs da programação oficial e enviando notificações organizadas via Telegram.

## 🎯 Funcionalidades

- ✅ Scraping automático da página oficial do SESC Em Cartaz
- ✅ Download e processamento de PDFs da programação mensal
- ✅ Análise inteligente com Google Gemini AI (modelo Flash)
- ✅ Extração estruturada de eventos (nome, data, horário, local, preço, etc.)
- ✅ Deduplicação automática de eventos
- ✅ Envio de notificações formatadas para canal/grupo do Telegram
- ✅ Suporte para mensagens longas (split inteligente respeitando limites do Telegram)
- ✅ Sistema de retry e tratamento de rate limits

## 📋 Pré-requisitos

- Node.js 18+ (com suporte a ES Modules)
- Conta no Telegram e Bot Token
- API Key do Google Gemini (Generative AI)

## 🛠️ Instalação

```bash
# Clone o repositório
git clone https://github.com/SEU_USUARIO/sesc-bot.git
cd sesc-bot

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

Execute o bot manualmente:

```bash
node index.js
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
  "pdf-parse": "^2.4.5"
}
```

## 🏗️ Arquitetura

- **Scraping:** Axios + Cheerio para extrair link do PDF
- **IA:** Google Gemini Flash para análise semântica do PDF
- **Mensageria:** node-telegram-bot-api para notificações
- **Formato:** JSON estruturado com schema validado

## ⚠️ Limitações Conhecidas (Pre-Beta)

- Credenciais hardcoded no código (será movido para .env)
- Sem agendamento automático (requer cron externo)
- Logs básicos (melhorias planejadas)
- Suporte apenas para eventos da Capital SP

## 🗺️ Roadmap

- [ ] Migrar configurações para variáveis de ambiente (.env)
- [ ] Adicionar sistema de agendamento interno
- [ ] Suporte para outras regiões do SESC
- [ ] Interface web para configuração
- [ ] Banco de dados para histórico de eventos
- [ ] Testes automatizados
- [ ] Docker containerization

## 📝 Notas de Versão

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
