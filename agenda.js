import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import database from './database.js';
import { fileURLToPath } from 'url';
import evolution from './evolution.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const URL_PAGINA = process.env.URL_PAGINA || 'https://www.sescsp.org.br/editorial/emcartaz/';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Utilitários de texto e delay
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function normalizeText(value) { return String(value ?? '').replace(/\s+/g, ' ').trim(); }

async function findLatestPDF() {
  const { data } = await axios.get(URL_PAGINA);
  const $ = cheerio.load(data);
  const element = $('a[href$=".pdf"]').first();
  const pdfLink = element.attr('href');
  const text = element.text().trim();
  return { url: new URL(pdfLink, URL_PAGINA).href, text, filename: path.basename(pdfLink) };
}

async function downloadOrGetPDF(url, filename) {
  if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  const localPath = path.join(DOWNLOADS_DIR, filename);

  if (!fs.existsSync(localPath)) {
    console.log(`Baixando PDF localmente para: ${localPath}...`);
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(localPath, response.data);
    console.log('Download concluído!');
  } else {
    console.log(`PDF já existe localmente: ${localPath}`);
  }

  const fileData = fs.readFileSync(localPath);
  return Buffer.from(fileData).toString('base64');
}

// Utilitário para extrair JSON da resposta do Gemini
function extractJson(text) {
  const unfenced = String(text ?? '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(unfenced); } catch { return null; }
}

async function analyzeAllWithGemini(pdfBase64, maxRounds = 12) {
  const aggregated = { events: [] };
  let cursor = '';
  let rounds = 0;

  console.log('Iniciando análise completa da programação SESC (Isso pode demorar bastante, pois avaliará o PDF inteiro)...');

  while (rounds < maxRounds) {
    rounds++;
    console.log(`Rodada Gemini ${rounds}/${maxRounds}${cursor ? ` (Cursor: ${cursor})` : ''}...`);

    const already = aggregated.events.slice(-40).map(ev => ({
      name: ev.name, unit: ev.unit, date: ev.date
    }));

    const continuationHint = cursor
      ? `\nCONTINUAÇÃO: Continue de onde parou (${cursor}). Não repita os seguintes eventos: ${JSON.stringify(already)}`
      : '';

    const prompt = `Analise o PDF da programação do SESC. 
Extraia TODOS os eventos de TODAS as categorias: Shows, Teatro, Dança, Exposições, Palestras, Esportes, Oficinas, Cursos e Atividades Infantis.
Não filtre nada por unidade. Quero a programação integral.

REGRAS:
- Responda estritamente no formato JSON fornecido no seu schema.
- Avalie rigorosamente as datas e se houver muitos eventos extratos, extraia parte, marque "has_more": true e preencha "cursor".${continuationHint}`;

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            has_more: { type: SchemaType.BOOLEAN },
            cursor: { type: SchemaType.STRING },
            events: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  unit: { type: SchemaType.STRING },
                  category: { type: SchemaType.STRING },
                  name: { type: SchemaType.STRING },
                  date: { type: SchemaType.STRING },
                  time: { type: SchemaType.STRING },
                  price: { type: SchemaType.STRING },
                  description: { type: SchemaType.STRING }
                }
              }
            }
          }
        }
      }
    });

    try {
      const result = await model.generateContent([{ inlineData: { data: pdfBase64, mimeType: "application/pdf" } }, prompt]);
      const parsed = extractJson(result.response.text());

      if (!parsed || !parsed.events) {
        console.log('Aviso: Falha ao interpretar JSON ou vazio. Abortando loop.');
        break;
      }

      const incoming = parsed.events.map(ev => ({
        unit: normalizeText(ev.unit),
        name: normalizeText(ev.name),
        date: normalizeText(ev.date),
        time: normalizeText(ev.time),
        category: normalizeText(ev.category),
        price: normalizeText(ev.price),
        description: normalizeText(ev.description)
      })).filter(ev => ev.name && ev.unit);

      // Deduplicação em memória local
      const existingKeys = new Set(aggregated.events.map(e => `${e.unit}|${e.name}|${e.date}`));
      let added = 0;
      for (const ev of incoming) {
        if (!existingKeys.has(`${ev.unit}|${ev.name}|${ev.date}`)) {
          aggregated.events.push(ev);
          added++;
        }
      }

      console.log(`Eventos na rodada: ${incoming.length} | Novos: ${added} | Total Acumulado: ${aggregated.events.length}`);

      if (!parsed.has_more || !parsed.cursor || parsed.cursor === cursor) {
        console.log('Sem mais eventos na leitura da IA (Fim do PDF ou loop estagnado).');
        break;
      }
      cursor = parsed.cursor;
      await sleep(2500); // Pausa para evitar rate-limit

    } catch (err) {
      console.error(`Erro na rodada ${rounds}:`, err.message);
      break;
    }
  }

  return aggregated.events;
}

// Tenta extrair qualquer data e normalizar para range
function getEventsInRange(events, startDate, endDate) {
  const currentYear = new Date().getFullYear();
  return events.filter(ev => {
    if (!ev.date) return false;

    // Tenta formato DD/MM (ex: 15/01)
    const match = ev.date.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (!match) return false;

    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const d = new Date(currentYear, month, day);

    // Zera os horários das datas base para comparação correta
    d.setHours(0, 0, 0, 0);
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(23, 59, 59, 999);

    return d >= start && d <= end;
  });
}

function getEventEmoji(ev) {
  const cat = (ev.category || '').toLowerCase();
  const desc = (ev.description || '').toLowerCase();
  const name = (ev.name || '').toLowerCase();
  const classification = (ev.classification || ev.age || '').toLowerCase();

  const combined = `${cat} ${desc} ${name} ${classification}`;

  if (combined.includes('idoso') || combined.includes('terceira idade') || combined.includes('60+') || combined.includes('aposentado')) return '👴';
  if (combined.includes('infantil') || combined.includes('criança') || combined.includes('bebê') || classification === 'livre') return '👶';
  if (combined.includes('oficina') || combined.includes('curso') || combined.includes('workshop')) return '🛠️';
  if (combined.includes('teatro') || combined.includes('espetáculo') || combined.includes('cênicas')) return '🎭';
  if (combined.includes('esporte') || combined.includes('ginástica') || combined.includes('recreação') || combined.includes('torneio')) return '⚽';
  if (combined.includes('dança') || combined.includes('ballet')) return '💃';
  if (combined.includes('exposição') || combined.includes('artes visuais') || combined.includes('galeria')) return '🖼️';
  if (combined.includes('cinema') || combined.includes('filme') || combined.includes('exibição')) return '🎬';
  if (combined.includes('show') || combined.includes('música') || combined.includes('concerto')) return '🎤';
  if (combined.includes('literatura') || combined.includes('livro') || combined.includes('leitura') || combined.includes('palestra')) return '📚';
  return '🎫'; // Default
}

function generateGoogleCalendarUrl(ev) {
  const name = encodeURIComponent(ev.name || 'Evento SESC');
  const details = encodeURIComponent(ev.description ? `${ev.description}\n\nVia SESC Alertas` : 'Evento SESC');
  const location = encodeURIComponent(ev.location || ev.unit || 'SESC');
  
  if (!ev.date) return null;

  const dateParts = ev.date.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dateParts) return null;

  const [_, d, m, y] = dateParts;
  let startStr = '';
  let endStr = '';

  const timeParts = ev.time ? ev.time.match(/(\d{1,2})[h:](\d{2})?/) : null;

  if (timeParts) {
     const h = timeParts[1].padStart(2, '0');
     const min = timeParts[2] || '00';
     startStr = `${y}${m}${d}T${h}${min}00`;
     const hEnd = String((parseInt(h) + 1) % 24).padStart(2, '0');
     endStr = `${y}${m}${d}T${hEnd}${min}00`;
  } else {
     const startDate = new Date(y, m - 1, d);
     const endDate = new Date(startDate);
     endDate.setDate(endDate.getDate() + 1);
     const startStrYMD = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}${String(startDate.getDate()).padStart(2, '0')}`;
     const endStrYMD = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}${String(endDate.getDate()).padStart(2, '0')}`;
     return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${name}&dates=${startStrYMD}/${endStrYMD}&details=${details}&location=${location}`;
  }

  return (startStr && endStr) ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${name}&dates=${startStr}/${endStr}&details=${details}&location=${location}` : null;
}

// Renderizador p/ Telegram
async function sendTelegramSegments(title, eventsList) {
  if (!eventsList || eventsList.length === 0) {
    console.log(`Nenhum evento detectado no banco de dados para a condição [${title}]`);
    await bot.sendMessage(TELEGRAM_CHAT_ID, `<b>${title}</b>\nNenhum evento agendado neste recorte.`, { parse_mode: 'HTML' });
    return;
  }

  const byUnit = {};
  for (const ev of eventsList) {
    const unit = ev.location || ev.unit;
    if (!byUnit[unit]) byUnit[unit] = [];
    byUnit[unit].push(ev);
  }

  let fullMsg = `<b>${title}</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (const unit of Object.keys(byUnit).sort()) {
    fullMsg += `\n🏛️ <b>${unit}</b>\n\n`;
    for (const ev of byUnit[unit]) {
      const icon = getEventEmoji(ev);
      const header = `• ${icon} ${ev.name}`;
      const when = [
        ev.date ? `🗓️ ${ev.date}` : null,
        ev.time ? `⏰ ${ev.time}` : null
      ].filter(Boolean).join(' · ');

      const tags = [
        ev.category ? `🏷️ ${ev.category}` : null,
        ev.price ? `💳 ${ev.price}` : null,
        ev.classification ? `🔞 ${ev.classification}` : null
      ].filter(Boolean).join(' · ');

      fullMsg += `${header}\n`;
      if (when) fullMsg += `  ${when}\n`;
      if (tags) fullMsg += `  ${tags}\n`;
      if (ev.description) fullMsg += `  📝 ${ev.description}\n`;
      const calUrl = generateGoogleCalendarUrl(ev);
      if (calUrl) {
        fullMsg += `  🗓️ <a href="${calUrl}">Adicionar ao Google Agenda</a>\n`;
      }
      fullMsg += '\n';
    }
  }

  // Telegram suporta blocos de ~4000 caracteres. Cortamos em segurança não quebrando tags HTML (separando por linha)
  const chunks = [];
  const lines = fullMsg.split('\n');
  let currentChunk = '';

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > 3800) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  for (let i = 0; i < chunks.length; i++) {
    await bot.sendMessage(TELEGRAM_CHAT_ID, chunks[i], { parse_mode: 'HTML' });
    await sleep(600); // Flood delay
  }
  
  // Envia também para o WhatsApp via Evolution API
  await evolution.sendMessage(fullMsg);

  console.log(`📌 Alerta enviado:  ${title}`);
}

// -----------------------------------------------------
// FUNÇÕES DE AÇÃO PRINCIPAL DA CLI
// -----------------------------------------------------

async function runSync() {
  console.log('🔄 Iniciando Sincronização Quinzenal do SESC SP');
  const pdfInfo = await findLatestPDF();
  const pdfUrl = pdfInfo.url;

  // Verifica se o hash deste PDF já consta na tabela cache (marca "ALL" pois raspa do PDF bruto)
  const stmt = database.db.prepare("SELECT id FROM pdf_cache WHERE pdf_url = ? AND units_hash = 'ALL_UNITS'");
  const existing = stmt.get(pdfUrl);

  if (existing) {
    console.log('✅ Este último mês já foi baixado, documentado e armazenado. Nenhuma ação necessária.');
    return;
  }

  console.log(`📄 Novo PDF detectado: ${pdfInfo.filename}. Processando extração total...`);
  // Baixa o arquivo para o disco e retorna convertido em payload Gemini
  const base64 = await downloadOrGetPDF(pdfInfo.url, pdfInfo.filename);

  // Como é o arquivo total, 15 rounds devem cobrir as páginas vitais
  const allEvents = await analyzeAllWithGemini(base64, 15);

  if (allEvents.length === 0) {
    console.log('❌ Falha ou nenhum evento obtido pela extração.');
    return;
  }

  // Salva massivamente no banco SQLite do projeto
  let novos = 0;
  for (const ev of allEvents) {
    const res = database.saveEvent({
      name: ev.name,
      date: ev.date,
      time: ev.time,
      location: ev.unit,
      price: ev.price,
      classification: ev.age,
      category: ev.category,
      description: ev.description
    });
    if (res.isNew) novos++;
  }

  // Salva no cache com flag universal para assinar como PDF LIDO
  const insertCache = database.db.prepare("INSERT INTO pdf_cache (pdf_url, units_hash, parsed_data) VALUES (?, 'ALL_UNITS', '{}')");
  insertCache.run(pdfUrl);

  console.log(`🎉 Base de Dados atualizada! Total de eventos extraídos: ${allEvents.length} (${novos} novos persistidos).`);
}

async function runWeekly() {
  console.log('📅 Iniciando disparo da Agenda Semanal...');
  let allEvents = database.getEvents();
  
  const today = new Date();
  const endOfWeek = new Date();
  endOfWeek.setDate(today.getDate() + 7);
  
  let events = getEventsInRange(allEvents, today, endOfWeek);

  if (!events || events.length === 0) {
    console.log('⚠️ Nenhuma programação encontrada para esta janela de tempo. Verificando atualizações no site do SESC...');
    await runSync();
    allEvents = database.getEvents();
    events = getEventsInRange(allEvents, today, endOfWeek);
  }
  const dataRef = `${today.toLocaleDateString('pt-BR')} a ${endOfWeek.toLocaleDateString('pt-BR')}`;

  await sendTelegramSegments(`🌟 PROGRAMAÇÃO SESC - PRÓXIMOS 7 DIAS\n(${dataRef})`, events);
}

async function runDaily() {
  console.log('☀️ Iniciando disparo da Agenda do Dia...');
  let allEvents = database.getEvents();
  const today = new Date();
  
  let events = getEventsInRange(allEvents, today, today);

  if (!events || events.length === 0) {
    console.log('⚠️ Nenhuma programação encontrada para hoje. Verificando atualizações no site do SESC...');
    await runSync();
    allEvents = database.getEvents();
    events = getEventsInRange(allEvents, today, today);
  }
  const dataRef = today.toLocaleDateString('pt-BR');

  await sendTelegramSegments(`🔥 HOJE NO SESC - ATIVIDADES DO DIA\n(${dataRef})`, events);
}

// -----------------------------------------------------
// ROTEDOR DE COMANDOS DA CLI
// -----------------------------------------------------

const action = process.argv[2];

(async () => {
  try {
    if (!TELEGRAM_BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN não preenchido no .env");

    if (action === 'sync') await runSync();
    else if (action === 'weekly') await runWeekly();
    else if (action === 'daily') await runDaily();
    else {
      console.log(`
🎭 SESC Agenda - CLI do Agendador (CRON Native)

Uso: node agenda.js <comando>

Comandos disponíveis:
  sync      - [15/15 Dias] Detecta se há atualização, baixa o PDF à pasta ./downloads/, 
              lê a infraestrutura massiva de categorias pelo Gemini e insere persistente no TXT/SQLite.
  weekly    - [Semanal] Realiza select SQL de 7 dias e envia a compilação por telegram.
  daily     - [Diário] Solicita o bloco estrito de hoje e envia alert call no Telegram.
      `);
    }
  } catch (error) {
    console.error('❌ Erro no Script da Agenda CLI:', error.message);
  } finally {
    process.exit(0);
  }
})();
