import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';

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
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview'
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
`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  
  // Recarrega variáveis de ambiente
  dotenv.config({ override: true });
}

// Rota principal
app.get('/', (req, res) => {
  res.render('index', {
    config: getConfig(),
    isRunning,
    lastExecution,
    logs: executionLogs,
    availableUnits,
    selectedUnits
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

app.listen(PORT, () => {
  console.log(`🚀 SESC Alertas GUI rodando em http://localhost:${PORT}`);
  console.log(`📊 Acesse o painel de controle pelo navegador`);
});
