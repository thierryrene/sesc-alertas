import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';
import scheduler from './scheduler.js';
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
    cronSchedule: process.env.CRON_SCHEDULE || '0 8 * * *',
    schedulerEnabled: process.env.SCHEDULER_ENABLED === 'true',
    filterMinPrice: process.env.FILTER_MIN_PRICE || '0',
    filterMaxPrice: process.env.FILTER_MAX_PRICE || '999999',
    filterCategories: process.env.FILTER_CATEGORIES || '',
    filterMinAge: process.env.FILTER_MIN_AGE || '0',
    filterLocations: process.env.FILTER_LOCATIONS || ''
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

# Scheduler Configuration
CRON_SCHEDULE=${config.cronSchedule || '0 8 * * *'}
SCHEDULER_ENABLED=${config.schedulerEnabled || 'false'}

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

// Rota principal
app.get('/', (req, res) => {
  const stats = database.getStats();
  const schedulerStatus = scheduler.getStatus();
  
  res.render('index', {
    config: getConfig(),
    isRunning,
    lastExecution,
    logs: executionLogs,
    availableUnits,
    selectedUnits,
    stats,
    schedulerStatus,
    schedulerPresets: scheduler.listPresets()
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

// Rotas do Scheduler
app.post('/scheduler/start', (req, res) => {
  const cronExpression = req.body.cronExpression || process.env.CRON_SCHEDULE;
  const result = scheduler.start(cronExpression);
  
  if (result.success) {
    // Atualiza .env
    const config = getConfig();
    config.schedulerEnabled = 'true';
    config.cronSchedule = cronExpression;
    saveConfig(config);
  }
  
  res.json(result);
});

app.post('/scheduler/stop', (req, res) => {
  const result = scheduler.stop();
  
  if (result.success) {
    // Atualiza .env
    const config = getConfig();
    config.schedulerEnabled = 'false';
    saveConfig(config);
  }
  
  res.json(result);
});

app.get('/scheduler/status', (req, res) => {
  res.json(scheduler.getStatus());
});

app.post('/scheduler/run-now', async (req, res) => {
  try {
    const result = await scheduler.runNow();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
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

// Inicia o scheduler se estiver habilitado no .env
if (process.env.SCHEDULER_ENABLED === 'true') {
  console.log('🕐 Iniciando agendamento automático...');
  const result = scheduler.start();
  if (result.success) {
    console.log(`✅ Scheduler iniciado: ${result.schedule}`);
    console.log(`📅 Próxima execução: ${result.nextExecution?.toLocaleString('pt-BR')}`);
  } else {
    console.error(`❌ Erro ao iniciar scheduler: ${result.message}`);
  }
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SESC Alertas GUI rodando em http://localhost:${PORT}`);
  console.log(`📊 Acesse o painel de controle pelo navegador`);
  console.log(`🌐 Também acessível via: http://127.0.0.1:${PORT}`);
  console.log(`💾 Banco de dados: ${database.getStats().totalEvents} eventos cadastrados`);
});
