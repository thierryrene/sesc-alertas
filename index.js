import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import dotenv from 'dotenv';
import database from './database.js';
import evolution from './evolution.js';
import telegram from './telegram.js';

// Corrigir erro AggregateError no Node 20+ (preferir IPv4)
import dns from 'node:dns';
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Load environment variables
dotenv.config({ override: true });

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const URL_PAGINA = process.env.URL_PAGINA || 'https://www.sescsp.org.br/editorial/emcartaz/';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
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
  const location = encodeURIComponent(ev.unit || 'SESC');
  
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

function extractJson(text) {
  const unfenced = String(text ?? '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(unfenced); } catch { return null; }
}

function parseEventDate(dateStr) {
  if (!dateStr) return null;
  const months = { 'janeiro': 0, 'jan': 0, 'fevereiro': 1, 'fev': 1, 'março': 2, 'mar': 2, 'abril': 3, 'abr': 3, 'maio': 4, 'mai': 4, 'junho': 5, 'jun': 5, 'julho': 6, 'jul': 6, 'agosto': 7, 'ago': 7, 'setembro': 8, 'set': 8, 'outubro': 9, 'out': 9, 'novembro': 10, 'nov': 10, 'dezembro': 11, 'dez': 11 };
  const now = new Date();
  const currentYear = now.getFullYear();

  const parseSingleDate = (str) => {
    let match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      let year = parseInt(match[3]);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }
    match = str.match(/(\d{1,2})\/(\d{1,2})$/);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      return new Date(currentYear, month, day);
    }
    return null;
  };

  const allMatches = [...dateStr.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g), ...dateStr.matchAll(/(\d{1,2})\/(\d{1,2})(?!\/)/g)];
  const dates = [];
  for (const match of allMatches) {
    const date = parseSingleDate(match[0]);
    if (date && !dates.some(d => d.getTime() === date.getTime())) dates.push(date);
  }
  return dates.length > 0 ? dates[0] : null;
}

function applyAdvancedFilters(events) {
  const filters = {
    minPrice: parseFloat(process.env.FILTER_MIN_PRICE || 0),
    maxPrice: parseFloat(process.env.FILTER_MAX_PRICE || 999999),
    categories: (process.env.FILTER_CATEGORIES || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean),
    minAge: parseInt(process.env.FILTER_MIN_AGE || 0),
    locations: (process.env.FILTER_LOCATIONS || '').split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
  };

  return events.filter(ev => {
    if (ev.price) {
      const priceMatch = ev.price.match(/\d+/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[0]);
        if (price < filters.minPrice || price > filters.maxPrice) return false;
      }
    }
    if (filters.categories.length > 0 && ev.category) {
      const evCategory = ev.category.toLowerCase();
      if (!filters.categories.some(cat => evCategory.includes(cat))) return false;
    }
    if (ev.age) {
      const ageMatch = ev.age.match(/\d+/);
      if (ageMatch) {
        const age = parseInt(ageMatch[0]);
        if (age < filters.minAge) return false;
      }
    }
    if (filters.locations.length > 0 && ev.unit) {
      const evLocation = ev.unit.toLowerCase();
      if (!filters.locations.some(loc => evLocation.includes(loc))) return false;
    }
    return true;
  });
}

function filterAndSortEvents(events) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const filtered = applyAdvancedFilters(events);
  const eventsWithDate = filtered.map(ev => ({ ...ev, parsedDate: parseEventDate(ev.date) }));
  
  const futureEvents = eventsWithDate.filter(ev => !ev.parsedDate || ev.parsedDate >= now);

  const thisWeek = [];
  const afterThisWeek = [];

  const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + daysUntilSaturday);
  endOfWeek.setHours(23, 59, 59, 999);

  for (const ev of futureEvents) {
    if (ev.parsedDate && ev.parsedDate <= endOfWeek) thisWeek.push(ev);
    else afterThisWeek.push(ev);
  }

  const sortByDate = (a, b) => (a.parsedDate || 0) - (b.parsedDate || 0);
  thisWeek.sort(sortByDate);
  afterThisWeek.sort(sortByDate);

  return { thisWeek, afterThisWeek, all: [...thisWeek, ...afterThisWeek] };
}

function mergeUniqueEvents(existingEvents, newEvents) {
  const out = Array.isArray(existingEvents) ? [...existingEvents] : [];
  const seen = new Set(out.map(ev => [ev.unit, ev.name, ev.date, ev.time].join('|').toLowerCase()));
  let added = 0;
  for (const ev of newEvents) {
    const key = [ev.unit, ev.name, ev.date, ev.time].join('|').toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(ev); added++; }
  }
  return { merged: out, added };
}

async function sendFormattedSegments(title, eventsList) {
  if (!eventsList || eventsList.length === 0) return;

  const byUnit = {};
  for (const ev of eventsList) {
    const unit = ev.unit;
    if (!byUnit[unit]) byUnit[unit] = [];
    byUnit[unit].push(ev);
  }

  let fullMsg = `<b>${title}</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (const unit of Object.keys(byUnit).sort()) {
    fullMsg += `\n🏛️ <b>${unit}</b>\n\n`;
    for (const ev of byUnit[unit]) {
      const icon = getEventEmoji(ev);
      const isNewTag = ev.isNew ? '🔥 <b>NOVO:</b> ' : '';
      const header = `• ${isNewTag}${icon} ${ev.name}`;
      
      let dateStr = ev.date;
      if (ev.parsedDate) {
        const weekday = ev.parsedDate.toLocaleDateString('pt-BR', { weekday: 'long' });
        dateStr += ` (${weekday})`;
      }

      const when = [dateStr ? `🗓️ ${dateStr}` : null, ev.time ? `⏰ ${ev.time}` : null].filter(Boolean).join(' · ');
      const tags = [ev.category ? `🏷️ ${ev.category}` : null, ev.price ? `💳 ${ev.price}` : null, ev.age ? `🔞 ${ev.age}` : null].filter(Boolean).join(' · ');

      fullMsg += `${header}\n`;
      if (when) fullMsg += `  ${when}\n`;
      if (tags) fullMsg += `  ${tags}\n`;
      if (ev.description) fullMsg += `  📝 ${ev.description}\n`;
      const calUrl = generateGoogleCalendarUrl(ev);
      if (calUrl) fullMsg += `  🗓️ <a href="${calUrl}">Adicionar ao Google Agenda</a>\n`;
      fullMsg += '\n';
    }
  }

  const chunks = [];
  const lines = fullMsg.split('\n');
  let currentChunk = '';
  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > 3800) { chunks.push(currentChunk); currentChunk = line; }
    else { currentChunk += (currentChunk ? '\n' : '') + line; }
  }
  if (currentChunk) chunks.push(currentChunk);

  for (const chunk of chunks) {
    try {
      await telegram.sendMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, chunk, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
    } catch (err) {
      console.error('❌ Erro no envio Telegram:', err.message);
    }
    await sleep(600);
  }
  
  await evolution.sendMessage(fullMsg);
}

async function findLatestPDF() {
  const { data } = await axios.get(URL_PAGINA);
  const $ = cheerio.load(data);
  const element = $('a[href$=".pdf"]').first();
  const pdfLink = element.attr('href');
  return { url: new URL(pdfLink, URL_PAGINA).href, text: element.text().trim() };
}

async function downloadPdfAsBase64(url) {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data).toString('base64');
}

async function analyzeWithGemini(pdfBase64, { extraInstructions = '', selectedUnits = [] } = {}) {
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
                age: { type: SchemaType.STRING },
                description: { type: SchemaType.STRING }
              }
            }
          }
        }
      }
    }
  });

  const unitFilter = selectedUnits.length > 0 ? `\nAPENAS UNIDADES: ${selectedUnits.join(', ')}` : '';
  const prompt = `Extraia os eventos do PDF do SESC. 
- Responda apenas o JSON.
- Extraia em lotes (max 30), use "has_more": true e preencha "cursor" para continuar.${unitFilter}${extraInstructions ? `\n${extraInstructions}` : ''}`;

  const result = await model.generateContent([{ inlineData: { data: pdfBase64, mimeType: "application/pdf" } }, prompt]);
  return result.response.text();
}

async function analyzeAllWithGemini(pdfUrl, selectedUnits = []) {
  const aggregated = { events: [] };
  const pdfBase64 = await downloadPdfAsBase64(pdfUrl);
  let cursor = '';
  let rounds = 0;
  const maxRounds = parseInt(process.env.MAX_ROUNDS || '8');

  while (rounds < maxRounds) {
    rounds++;
    console.log(`🤖 Gemini: Análise ${rounds}/${maxRounds}${cursor ? ` [Cursor: ${cursor}]` : ''}`);

    const continuationHint = cursor ? `CONTINUAÇÃO: Continue de onde parou (${cursor}).` : '';
    const raw = await analyzeWithGemini(pdfBase64, { extraInstructions: continuationHint, selectedUnits });
    const parsed = extractJson(raw);

    if (!parsed || !parsed.events) break;

    const incoming = parsed.events.map(ev => ({
      unit: normalizeText(ev.unit),
      name: normalizeText(ev.name),
      date: normalizeText(ev.date),
      time: normalizeText(ev.time),
      category: normalizeText(ev.category),
      price: normalizeText(ev.price),
      age: normalizeText(ev.age),
      description: normalizeText(ev.description)
    })).filter(ev => ev.unit && ev.name);

    const { merged, added } = mergeUniqueEvents(aggregated.events, incoming);
    aggregated.events = merged;
    console.log(`✨ Rodada ${rounds}: +${added} novos eventos (Total: ${aggregated.events.length})`);

    if (!parsed.has_more || !parsed.cursor || parsed.cursor === cursor) break;
    cursor = parsed.cursor;
    await sleep(2000);
  }
  return aggregated;
}

async function main() {
  const executionId = database.startExecution();
  const stats = { status: 'completed', eventsFound: 0, eventsNew: 0 };

  try {
    const selectedUnits = (process.env.SELECTED_UNITS || '').split(',').map(u => u.trim()).filter(Boolean);

    // 🚨 REGRA ABSOLUTA: Verifica se já tem informações do mês vigente
    const now = new Date();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentYear = now.getFullYear();
    const monthPattern = `%/${currentMonth}/${currentYear}%`;

    const checkEvents = database.db.prepare("SELECT COUNT(*) as count FROM events WHERE date LIKE ?");
    const eventCount = checkEvents.get(monthPattern).count;

    if (eventCount > 0) {
      console.log(`✅ Base de dados já contém ${eventCount} eventos para o mês vigente (${currentMonth}/${currentYear}).`);
      console.log('ℹ️ Para poupar a quota da Gemini API, a nova análise de IA foi ignorada. Use os scripts de Agenda para reenviar se necessário.');
      
      // Carrega os eventos existentes para disparar apenas se houver algo futuro
      const existingEvents = database.getEvents();
      const { all } = filterAndSortEvents(existingEvents);

      if (all.length > 0) {
        console.log(`📌 ${all.length} eventos futuros encontrados no banco. Nenhuma análise nova necessária.`);
        database.finishExecution(executionId, { status: 'skipped', eventsFound: all.length, eventsNew: 0 });
        return;
      }
    }

    console.log('🔍 Buscando PDF mais recente...');
    const { url: pdfUrl, text: pdfName } = await findLatestPDF();
    console.log(`📄 PDF: ${pdfName}\n🔗 Link: ${pdfUrl}`);

    let result;
    const cachedData = database.getPdfCache(pdfUrl, selectedUnits);
    if (cachedData) {
      console.log('✅ Carregando dados do Cache...');
      result = { events: cachedData.events };
    } else {
      console.log('🤖 Iniciando análise via Gemini...');
      result = await analyzeAllWithGemini(pdfUrl, selectedUnits);
      if (result.events.length > 0) database.savePdfCache(pdfUrl, result, selectedUnits);
    }

    const { thisWeek, afterThisWeek, all } = filterAndSortEvents(result.events);
    console.log(`📊 Processamento: ${result.events.length} total | ${all.length} futuros`);

    let newEventsCount = 0;
    for (const ev of all) {
      const res = database.saveEvent({
        name: ev.name, date: ev.date, time: ev.time, location: ev.unit,
        price: ev.price, classification: ev.age, category: ev.category, description: ev.description
      });
      ev.isNew = res.isNew;
      if (res.isNew) newEventsCount++;
    }

    console.log(`💾 Banco: ${all.length} processados | ${newEventsCount} novidades`);
    stats.eventsFound = all.length;
    stats.eventsNew = newEventsCount;

    if (newEventsCount > 0) {
      console.log('📤 Enviando alertas...');
      const onlyNew = all.filter(ev => ev.isNew);
      const { thisWeek: newThisWeek, afterThisWeek: newAfterThisWeek } = filterAndSortEvents(onlyNew);

      if (newThisWeek.length > 0) {
        await sendFormattedSegments('⭐ NOVOS EVENTOS - ESTA SEMANA', newThisWeek);
      }
      if (newAfterThisWeek.length > 0) {
        await sendFormattedSegments('📅 NOVOS EVENTOS - RESTANTE DO MÊS', newAfterThisWeek);
      }
    } else {
      console.log('✅ Nenhuma novidade para disparar alertas.');
    }

    database.finishExecution(executionId, stats);
    console.log('🏁 Processo finalizado!');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    stats.status = 'failed';
    stats.errorMessage = error.message;
    database.finishExecution(executionId, stats);
    await bot.sendMessage(TELEGRAM_CHAT_ID, `❌ Erro no Script: ${error.message}`);
  }
}

main();
