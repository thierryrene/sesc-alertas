import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';

import database from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let isRunning = false;
let lastExecution = null;
let executionLogs = [];
let availableUnits = [];
let selectedUnits = [];

// Carrega configurações do .env
function getConfig() {
  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    urlPagina: process.env.URL_PAGINA || 'https://www.sescsp.org.br/editorial/emcartaz/',
    maxRounds: process.env.MAX_ROUNDS || '8',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',

    filterMinPrice: process.env.FILTER_MIN_PRICE || '0',
    filterMaxPrice: process.env.FILTER_MAX_PRICE || '999999',
    filterCategories: process.env.FILTER_CATEGORIES || '',
    filterMinAge: process.env.FILTER_MIN_AGE || '0',
    filterLocations: process.env.FILTER_LOCATIONS || '',
    
    evolutionApiUrl: process.env.EVOLUTION_API_URL || '',
    evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
    evolutionApiInstance: process.env.EVOLUTION_API_INSTANCE || '',
    whatsappNumber: process.env.WHATSAPP_NUMBER || ''
  };
}

// Salva configurações no .env
function saveConfig(config) {
  const envContent = `# Telegram Configuration
TELEGRAM_BOT_TOKEN=${config.telegramToken}
TELEGRAM_CHAT_ID=${config.telegramChatId}

# Google Gemini API
GEMINI_API_KEY=${config.geminiApiKey}

# SESC Configuration
URL_PAGINA=${config.urlPagina}
MAX_ROUNDS=${config.maxRounds}
GEMINI_MODEL=${config.geminiModel}

# Evolution API (WhatsApp)
EVOLUTION_API_URL=${config.evolutionApiUrl || ''}
EVOLUTION_API_KEY=${config.evolutionApiKey || ''}
EVOLUTION_API_INSTANCE=${config.evolutionApiInstance || ''}
WHATSAPP_NUMBER=${config.whatsappNumber || ''}

# Filters Configuration
FILTER_MIN_PRICE=${config.filterMinPrice || '0'}
FILTER_MAX_PRICE=${config.filterMaxPrice || '999999'}
FILTER_CATEGORIES=${config.filterCategories || ''}
FILTER_MIN_AGE=${config.filterMinAge || '0'}
FILTER_LOCATIONS=${config.filterLocations || ''}
`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);

  // Recarrega variáveis de ambiente
  dotenv.config({ override: true });
}

// Rota WhatsApp - QR Code (serve direto da Evolution API remota)
app.get('/whatsapp/qrcode', async (req, res) => {
  const cfg = getConfig();
  if (!cfg.evolutionApiUrl || !cfg.evolutionApiKey || !cfg.evolutionApiInstance) {
    return res.send(`<h2>⚠️ Configure primeiro as credenciais da Evolution API no painel de <a href="/">Configurações</a>.</h2>`);
  }
  try {
    const axios = (await import('axios')).default;
    const resp = await axios.get(
      `${cfg.evolutionApiUrl}/instance/connect/${cfg.evolutionApiInstance}`,
      { headers: { apikey: cfg.evolutionApiKey } }
    );
    const { base64 } = resp.data;
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="45">
  <title>Conectar WhatsApp - SESC Alertas</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #128c7e 0%, #075e54 100%);
           min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: white; border-radius: 20px; padding: 40px 50px; text-align: center;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3); max-width: 420px; width: 100%; }
    h2 { color: #128c7e; font-size: 22px; margin-bottom: 8px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
    ol { text-align: left; margin: 0 auto 24px; max-width: 280px; color: #444; font-size: 14px; line-height: 2; }
    ol li b { color: #128c7e; }
    img { width: 260px; height: 260px; border-radius: 8px; border: 3px solid #f0f0f0; }
    .badge { display: inline-block; margin-top: 16px; background: #e8f5f4; color: #128c7e;
             font-size: 12px; padding: 4px 12px; border-radius: 20px; }
    .timer { margin-top: 12px; font-size: 12px; color: #aaa; }
    .status-link { display: block; margin-top: 20px; color: #128c7e; font-size: 13px; text-decoration: none; }
    .status-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <h2>📱 Conectar WhatsApp</h2>
    <p class="subtitle">Instância: <strong>${cfg.evolutionApiInstance}</strong></p>
    <ol>
      <li>Abra o <b>WhatsApp</b> no celular</li>
      <li>Vá em <b>Aparelhos Conectados</b></li>
      <li>Toque em <b>Conectar dispositivo</b></li>
      <li>Mire a câmera no código abaixo</li>
    </ol>
    <img src="${base64}" alt="QR Code WhatsApp" />
    <span class="badge">⏱ Auto-refresh em 45 segundos</span>
    <p class="timer">QR Code atualizado em: ${new Date().toLocaleTimeString('pt-BR')}</p>
    <a class="status-link" href="/whatsapp/status">🔗 Verificar status da conexão</a>
  </div>
</body>
</html>`);
  } catch (err) {
    const msg = err.response?.data?.response?.message?.[0] || err.message;
    res.status(500).send(`<h2>❌ Erro ao buscar QR Code: ${msg}</h2><p><a href="/whatsapp/qrcode">Tentar novamente</a></p>`);
  }
});

// Rota WhatsApp - Status da conexão
app.get('/whatsapp/status', async (req, res) => {
  const cfg = getConfig();
  if (!cfg.evolutionApiUrl || !cfg.evolutionApiKey || !cfg.evolutionApiInstance) {
    return res.json({ error: 'Evolution API não configurada.' });
  }
  try {
    const axios = (await import('axios')).default;
    const resp = await axios.get(
      `${cfg.evolutionApiUrl}/instance/connectionState/${cfg.evolutionApiInstance}`,
      { headers: { apikey: cfg.evolutionApiKey } }
    );
    res.json(resp.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Rota principal
app.get('/', (req, res) => {
  const stats = database.getStats();


  res.render('index', {
    config: getConfig(),
    isRunning,
    lastExecution,
    logs: executionLogs,
    availableUnits,
    selectedUnits,
    stats
  });
});

// Salvar configurações
app.post('/config', (req, res) => {
  try {
    saveConfig(req.body);
    res.json({ success: true, message: 'Configurações salvas com sucesso!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Extrair unidades do PDF
app.post('/extract-units', async (req, res) => {
  try {
    // Importa as funções necessárias dinamicamente
    const indexModule = await import('./index.js');

    const axios = (await import('axios')).default;
    const cheerio = await import('cheerio');

    // Busca o PDF mais recente
    const urlPagina = process.env.URL_PAGINA || 'https://www.sescsp.org.br/editorial/emcartaz/';
    const { data } = await axios.get(urlPagina);
    const $ = cheerio.load(data);
    const element = $('a[href$=".pdf"]').first();
    const pdfLink = element.attr('href');
    const pdfUrl = new URL(pdfLink, urlPagina).href;

    // Baixa o PDF
    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    const pdfBase64 = Buffer.from(response.data).toString('base64');

    // Extrai unidades usando Gemini
    const { GoogleGenerativeAI, SchemaType } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            units: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }
            }
          }
        }
      }
    });

    const prompt = `Analise o PDF da programação do SESC e extraia TODAS as unidades/locais mencionados.

IMPORTANTE:
- Liste apenas os nomes das unidades SESC (ex: "Sesc Pompeia", "Sesc Ipiranga", etc)
- Não inclua outras informações, apenas os nomes das unidades
- Retorne em ordem alfabética
- Formato: array de strings com os nomes das unidades`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: pdfBase64,
          mimeType: "application/pdf",
        },
      },
      prompt,
    ]);

    const text = result.response.text();
    const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim());
    availableUnits = parsed?.units || [];

    res.json({ success: true, units: availableUnits });
  } catch (error) {
    console.error('Erro ao extrair unidades:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Salvar unidades selecionadas
app.post('/select-units', (req, res) => {
  try {
    selectedUnits = req.body.units || [];
    res.json({ success: true, message: 'Unidades selecionadas salvas!' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Executar script
app.post('/execute', (req, res) => {
  if (isRunning) {
    return res.json({ success: false, message: 'Uma execução já está em andamento!' });
  }

  isRunning = true;
  executionLogs = [];
  const startTime = new Date();

  // Passa as unidades selecionadas via variável de ambiente
  const env = {
    ...process.env,
    SELECTED_UNITS: selectedUnits.join(',')
  };

  const child = spawn('node', ['index.js'], {
    cwd: __dirname,
    env
  });

  child.stdout.on('data', (data) => {
    const log = data.toString();
    executionLogs.push({ time: new Date(), type: 'info', message: log });
  });

  child.stderr.on('data', (data) => {
    const log = data.toString();
    executionLogs.push({ time: new Date(), type: 'error', message: log });
  });

  child.on('close', (code) => {
    isRunning = false;
    lastExecution = {
      startTime,
      endTime: new Date(),
      duration: Date.now() - startTime.getTime(),
      success: code === 0,
      code
    };
    executionLogs.push({
      time: new Date(),
      type: code === 0 ? 'success' : 'error',
      message: `Processo finalizado com código ${code}`
    });
  });

  res.json({ success: true, message: 'Execução iniciada!' });
});

// Status da execução
app.get('/status', (req, res) => {
  res.json({
    isRunning,
    lastExecution,
    logs: executionLogs.slice(-50), // Últimas 50 linhas
    availableUnits,
    selectedUnits
  });
});

// Limpar logs
app.post('/clear-logs', (req, res) => {
  executionLogs = [];
  res.json({ success: true, message: 'Logs limpos!' });
});



// Rotas do Banco de Dados
app.get('/database/stats', (req, res) => {
  res.json(database.getStats());
});

app.get('/database/events', (req, res) => {
  const filters = {
    location: req.query.location,
    category: req.query.category,
    startDate: req.query.startDate,
    endDate: req.query.endDate
  };
  const events = database.getEvents(filters);
  res.json({ success: true, events });
});

app.get('/database/executions', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const executions = database.getRecentExecutions(limit);
  res.json({ success: true, executions });
});

app.post('/database/clean', (req, res) => {
  const daysOld = parseInt(req.body.daysOld) || 90;
  const deletedCount = database.cleanOldEvents(daysOld);
  res.json({ success: true, message: `${deletedCount} eventos antigos removidos`, deletedCount });
});



app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SESC Alertas GUI rodando em http://localhost:${PORT}`);
  console.log(`📊 Acesse o painel de controle pelo navegador`);
  console.log(`🌐 Também acessível via: http://127.0.0.1:${PORT}`);
  console.log(`💾 Banco de dados: ${database.getStats().totalEvents} eventos cadastrados`);
});
