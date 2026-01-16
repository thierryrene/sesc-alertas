const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Carrega o dotenv
require('dotenv').config();

let mainWindow;
let serverProcess;
let isRunning = false;
let lastExecution = null;
let executionLogs = [];
let availableUnits = [];
let selectedUnits = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'SESC Alertas',
    autoHideMenuBar: true
  });

  mainWindow.loadFile('electron-ui.html');

  // Abre DevTools em desenvolvimento
  mainWindow.webContents.openDevTools();

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (serverProcess) {
      serverProcess.kill();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Carregar configurações
ipcMain.handle('get-config', () => {
  return {
    telegramToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    urlPagina: process.env.URL_PAGINA || 'https://www.sescsp.org.br/editorial/emcartaz/',
    maxRounds: process.env.MAX_ROUNDS || '8',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview'
  };
});

// Salvar configurações
ipcMain.handle('save-config', (event, config) => {
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
  
  // Recarrega variáveis
  require('dotenv').config({ override: true });
  
  return { success: true, message: 'Configurações salvas com sucesso!' };
});

// Extrair unidades
ipcMain.handle('extract-units', async () => {
  try {
    const axios = require('axios');
    const cheerio = require('cheerio');
    const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
    
    // Busca PDF
    const urlPagina = process.env.URL_PAGINA || 'https://www.sescsp.org.br/editorial/emcartaz/';
    const { data } = await axios.get(urlPagina);
    const $ = cheerio.load(data);
    const element = $('a[href$=".pdf"]').first();
    const pdfLink = element.attr('href');
    const pdfUrl = new URL(pdfLink, urlPagina).href;
    
    // Baixa PDF
    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    const pdfBase64 = Buffer.from(response.data).toString('base64');
    
    // Extrai unidades
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
    
    return { success: true, units: availableUnits };
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// Salvar unidades selecionadas
ipcMain.handle('select-units', (event, units) => {
  selectedUnits = units;
  return { success: true, message: 'Unidades selecionadas salvas!' };
});

// Executar script
ipcMain.handle('execute-script', () => {
  if (isRunning) {
    return { success: false, message: 'Uma execução já está em andamento!' };
  }

  isRunning = true;
  executionLogs = [];
  const startTime = new Date();

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
    if (mainWindow) {
      mainWindow.webContents.send('log-update', executionLogs.slice(-50));
    }
  });

  child.stderr.on('data', (data) => {
    const log = data.toString();
    executionLogs.push({ time: new Date(), type: 'error', message: log });
    if (mainWindow) {
      mainWindow.webContents.send('log-update', executionLogs.slice(-50));
    }
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
    
    if (mainWindow) {
      mainWindow.webContents.send('execution-complete', { isRunning, lastExecution });
      mainWindow.webContents.send('log-update', executionLogs.slice(-50));
    }
  });

  return { success: true, message: 'Execução iniciada!' };
});

// Obter status
ipcMain.handle('get-status', () => {
  return {
    isRunning,
    lastExecution,
    logs: executionLogs.slice(-50),
    availableUnits,
    selectedUnits
  };
});

// Limpar logs
ipcMain.handle('clear-logs', () => {
  executionLogs = [];
  return { success: true, message: 'Logs limpos!' };
});
