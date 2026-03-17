import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import database from './database.js';
import evolution from './evolution.js';

// Load environment variables
dotenv.config();

// Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const URL_PAGINA = process.env.URL_PAGINA || 'https://www.sescsp.org.br/editorial/emcartaz/';

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const TELEGRAM_SAFE_CHUNK_LEN = 3600;
const GEMINI_MODEL = 'gemini-3-flash-preview'; // Modelo Flash (mais rápido)

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatSummaryForTelegram(summary) {
  const text = String(summary ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = text.split('\n');
  const formattedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return '';

    // Normaliza títulos/categorias comuns
    if (/^(shows?|show\b|agenda\b)/i.test(trimmed)) return `🎤 ${trimmed}`;
    if (/^(hip\s*hop|rap\b|cultura\s+urbana)/i.test(trimmed)) return `🧢 ${trimmed}`;
    if (/^(tecnologia|tech\b|inova[cç][aã]o|games?\b)/i.test(trimmed)) return `💻 ${trimmed}`;

    // Normaliza campos (quando a IA retornar formato "Campo: valor")
    return trimmed
      .replace(/^\s*(nome|evento|artista)\s*:\s*/i, '🎫 Nome: ')
      .replace(/^\s*(data)\s*:\s*/i, '🗓️ Data: ')
      .replace(/^\s*(hor[aá]rio|hora)\s*:\s*/i, '⏰ Horário: ')
      .replace(/^\s*(local|unidade)\s*:\s*/i, '📍 Local: ')
      .replace(/^\s*(descri[cç][aã]o|sinopse)\s*:\s*/i, '📝 Descrição: ')
      .replace(/^\s*(valor|pre[cç]o|ingresso)\s*:\s*/i, '💳 Ingresso: ')
      .replace(/^\s*(classifica[cç][aã]o|idade)\s*:\s*/i, '🔞 Classificação: ');
  });

  // Reforça separação visual entre itens
  return formattedLines
    .join('\n')
    .replace(/\n\s*[-•]\s*/g, '\n• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

function splitForTelegram(text, maxLen = 3900) {
  const fullText = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!fullText) return [];

  const parts = [];
  const paragraphs = fullText.split(/\n\n+/);

  let current = '';
  const pushCurrent = () => {
    const value = current.trim();
    if (value) parts.push(value);
    current = '';
  };

  for (const paragraph of paragraphs) {
    const p = paragraph.trim();
    if (!p) continue;

    const candidate = current ? `${current}\n\n${p}` : p;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }

    // Se o parágrafo não cabe, envia o que já acumulou e quebra o parágrafo
    pushCurrent();

    if (p.length <= maxLen) {
      current = p;
      continue;
    }

    // Quebra por linhas; se ainda assim não couber, quebra por caracteres
    const lines = p.split('\n');
    let lineBlock = '';
    for (const line of lines) {
      const l = line.trimEnd();
      const next = lineBlock ? `${lineBlock}\n${l}` : l;
      if (next.length <= maxLen) {
        lineBlock = next;
        continue;
      }

      if (lineBlock) {
        parts.push(lineBlock.trim());
        lineBlock = '';
      }

      if (l.length <= maxLen) {
        lineBlock = l;
        continue;
      }

      const chars = Array.from(l);
      for (let i = 0; i < chars.length; i += maxLen) {
        parts.push(chars.slice(i, i + maxLen).join('').trim());
      }
    }
    if (lineBlock.trim()) parts.push(lineBlock.trim());
  }

  pushCurrent();
  return parts;
}

function stripMarkdownFences(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function findFirstBalancedJsonSubstring(text) {
  const s = stripMarkdownFences(text);
  if (!s) return null;

  const tryScan = (openChar, closeChar) => {
    const start = s.indexOf(openChar);
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < s.length; i += 1) {
      const ch = s[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === openChar) depth += 1;
      if (ch === closeChar) depth -= 1;

      if (depth === 0 && i > start) {
        return s.slice(start, i + 1);
      }
    }

    return null;
  };

  // Prefere objeto; se não houver, tenta array
  return tryScan('{', '}') ?? tryScan('[', ']');
}

function extractJson(text) {
  const unfenced = stripMarkdownFences(text);
  if (!unfenced) return null;

  // 1) tenta parse do texto inteiro
  try {
    return JSON.parse(unfenced);
  } catch {
    // ignore
  }

  // 2) tenta achar primeiro bloco JSON balanceado
  const candidate = findFirstBalancedJsonSubstring(unfenced);
  if (!candidate) return null;

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// Função para parsear data em formato brasileiro
function parseEventDate(dateStr) {
  if (!dateStr) return null;

  const months = {
    'janeiro': 0, 'jan': 0,
    'fevereiro': 1, 'fev': 1,
    'março': 2, 'mar': 2,
    'abril': 3, 'abr': 3,
    'maio': 4, 'mai': 4,
    'junho': 5, 'jun': 5,
    'julho': 6, 'jul': 6,
    'agosto': 7, 'ago': 7,
    'setembro': 8, 'set': 8,
    'outubro': 9, 'out': 9,
    'novembro': 10, 'nov': 10,
    'dezembro': 11, 'dez': 11
  };

  const now = new Date();
  const currentYear = now.getFullYear();

  const parseSingleDate = (str) => {
    // Formato DD/MM/YYYY ou DD/MM/YY
    let match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      let year = parseInt(match[3]);
      if (year < 100) year += 2000;
      return new Date(year, month, day);
    }

    // Formato DD/MM (assume ano atual)
    match = str.match(/(\d{1,2})\/(\d{1,2})$/);
    if (match) {
      const day = parseInt(match[1]);
      const month = parseInt(match[2]) - 1;
      return new Date(currentYear, month, day);
    }

    // Formato "DD de MÊS"
    match = str.match(/(\d{1,2})\s+de\s+(\w+)/i);
    if (match) {
      const day = parseInt(match[1]);
      const monthName = match[2].toLowerCase();
      const month = months[monthName];
      if (month !== undefined) {
        const now = new Date();
        return new Date(now.getFullYear(), month, day);
      }
    }

    // Formato "MÊS DD"
    match = str.match(/(\w+)\s+(\d{1,2})/i);
    if (match) {
      const monthName = match[1].toLowerCase();
      const day = parseInt(match[2]);
      const month = months[monthName];
      if (month !== undefined) {
        const now = new Date();
        return new Date(now.getFullYear(), month, day);
      }
    }

    return null;
  };

  // Extrai todas as datas possíveis da string, incluindo intervalos
  const allMatches = [
    ...dateStr.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/g), // 15/01/2026
    ...dateStr.matchAll(/(\d{1,2})\/(\d{1,2})(?!\/)/g),        // 15/01
    ...dateStr.matchAll(/(\d{1,2})\s+de\s+(\w+)/gi),           // 15 de janeiro
    ...dateStr.matchAll(/(\w+)\s+(\d{1,2})/gi)                 // janeiro 15
  ];

  // Intervalos do tipo "15 a 20/01" ou "15-20/01"
  const rangeDayMonth = [
    ...dateStr.matchAll(/(\d{1,2})\s*[aà-]\s*(\d{1,2})\/(\d{1,2})/gi)
  ];

  // Intervalos do tipo "15 a 20 de janeiro"
  const rangeDayMonthName = [
    ...dateStr.matchAll(/(\d{1,2})\s*[aà-]\s*(\d{1,2})\s+de\s+(\w+)/gi)
  ];

  const dates = [];
  for (const match of allMatches) {
    const date = parseSingleDate(match[0]);
    if (date && !dates.some(d => d.getTime() === date.getTime())) {
      dates.push(date);
    }
  }

  for (const match of rangeDayMonth) {
    const startDay = parseInt(match[1]);
    const month = parseInt(match[3]) - 1;
    const date = new Date(currentYear, month, startDay);
    if (!dates.some(d => d.getTime() === date.getTime())) {
      dates.push(date);
    }
  }

  for (const match of rangeDayMonthName) {
    const startDay = parseInt(match[1]);
    const monthName = match[3].toLowerCase();
    const month = months[monthName];
    if (month !== undefined) {
      const date = new Date(currentYear, month, startDay);
      if (!dates.some(d => d.getTime() === date.getTime())) {
        dates.push(date);
      }
    }
  }

  // Retorna a primeira data encontrada (mais conservador para filtro)
  return dates.length > 0 ? dates[0] : null;
}

// Verifica se o evento está na semana atual (de hoje até próximo sábado)
function isThisWeek(eventDate) {
  if (!eventDate) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0); // Início do dia atual

  // Próximo sábado a partir de hoje
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7; // 0 se já é sábado
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + daysUntilSaturday);
  endOfWeek.setHours(23, 59, 59, 999);

  // Evento deve ser de hoje até próximo sábado
  return eventDate >= now && eventDate <= endOfWeek;
}

// Verifica se o evento está no mês atual (após a semana)
function isThisMonthAfterWeek(eventDate) {
  if (!eventDate) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Próximo sábado
  const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
  const endOfWeek = new Date(now);
  endOfWeek.setDate(now.getDate() + daysUntilSaturday);
  endOfWeek.setHours(23, 59, 59, 999);

  // Último dia do mês atual
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  endOfMonth.setHours(23, 59, 59, 999);

  // Evento deve estar após a semana E dentro do mês atual
  return eventDate > endOfWeek && eventDate <= endOfMonth;
}

// Aplica filtros avançados nos eventos
function applyAdvancedFilters(events) {
  const filters = {
    minPrice: parseFloat(process.env.FILTER_MIN_PRICE || 0),
    maxPrice: parseFloat(process.env.FILTER_MAX_PRICE || 999999),
    categories: (process.env.FILTER_CATEGORIES || '').split(',').map(c => c.trim().toLowerCase()).filter(Boolean),
    minAge: parseInt(process.env.FILTER_MIN_AGE || 0),
    locations: (process.env.FILTER_LOCATIONS || '').split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
  };

  return events.filter(ev => {
    // Filtro de preço
    if (ev.price) {
      const priceMatch = ev.price.match(/\d+/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[0]);
        if (price < filters.minPrice || price > filters.maxPrice) return false;
      }
    }

    // Filtro de categoria
    if (filters.categories.length > 0 && ev.category) {
      const evCategory = ev.category.toLowerCase();
      if (!filters.categories.some(cat => evCategory.includes(cat))) return false;
    }

    // Filtro de idade
    if (ev.age) {
      const ageMatch = ev.age.match(/\d+/);
      if (ageMatch) {
        const age = parseInt(ageMatch[0]);
        if (age < filters.minAge) return false;
      }
    }

    // Filtro de localização
    if (filters.locations.length > 0 && ev.unit) {
      const evLocation = ev.unit.toLowerCase();
      if (!filters.locations.some(loc => evLocation.includes(loc))) return false;
    }

    return true;
  });
}

// Filtra e ordena eventos por data
function filterAndSortEvents(events) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // Aplica filtros avançados primeiro
  const filtered = applyAdvancedFilters(events);
  console.log(`🔍 Filtros aplicados: ${events.length} eventos → ${filtered.length} após filtros`);

  // Adiciona data parseada aos eventos
  const eventsWithDate = filtered.map(ev => ({
    ...ev,
    parsedDate: parseEventDate(ev.date)
  }));

  // Filtra apenas eventos de hoje em diante (exclui passados)
  const passedEvents = [];
  const futureEvents = eventsWithDate.filter(ev => {
    if (!ev.parsedDate) return true; // Mantém eventos sem data (vão para "afterThisWeek")
    const isFuture = ev.parsedDate >= now;
    if (!isFuture) {
      passedEvents.push({ name: ev.name, date: ev.date, parsed: ev.parsedDate.toLocaleDateString('pt-BR') });
    }
    return isFuture; // >= hoje às 00:00 (inclui hoje)
  });

  // Separa em 3 categorias:
  // 1. Esta semana (hoje até próximo sábado)
  // 2. Restante do mês (após sábado até fim do mês)
  // 3. Próximo mês ou sem data (descartados da notificação)

  const thisWeek = [];
  const thisMonthAfterWeek = [];
  const nextMonthOrNoDate = [];

  for (const ev of futureEvents) {
    if (!ev.parsedDate) {
      nextMonthOrNoDate.push(ev); // Sem data = não envia
      continue;
    }

    if (isThisWeek(ev.parsedDate)) {
      thisWeek.push(ev);
    } else if (isThisMonthAfterWeek(ev.parsedDate)) {
      thisMonthAfterWeek.push(ev);
    } else {
      nextMonthOrNoDate.push(ev); // Próximo mês = não envia
    }
  }

  // Ordena cada grupo por data
  const sortByDate = (a, b) => {
    if (!a.parsedDate && !b.parsedDate) return 0;
    if (!a.parsedDate) return 1;
    if (!b.parsedDate) return -1;
    return a.parsedDate - b.parsedDate;
  };

  thisWeek.sort(sortByDate);
  thisMonthAfterWeek.sort(sortByDate);

  // Log de debug para verificar filtro
  const todayStr = now.toLocaleDateString('pt-BR');
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const endOfMonthStr = endOfMonth.toLocaleDateString('pt-BR');

  console.log(`\n📊 Filtro de datas (hoje: ${todayStr} | fim do mês: ${endOfMonthStr}):`);
  console.log(`   📥 Total de eventos recebidos: ${events.length}`);
  console.log(`   🔍 Após filtros avançados: ${filtered.length}`);
  console.log(`   ⏮️  Eventos passados (excluídos): ${passedEvents.length}`);
  console.log(`   ⭐ Esta semana (hoje→sábado): ${thisWeek.length}`);
  console.log(`   📅 Restante do mês (após sábado): ${thisMonthAfterWeek.length}`);
  console.log(`   🚫 Próximo mês ou sem data (excluídos): ${nextMonthOrNoDate.length}`);

  if (passedEvents.length > 0 && passedEvents.length <= 10) {
    console.log(`\n   ⏮️  Eventos passados excluídos:`);
    passedEvents.forEach(ev => {
      console.log(`      • ${ev.name} - ${ev.date} (${ev.parsed})`);
    });
  } else if (passedEvents.length > 10) {
    console.log(`\n   ⏮️  ${passedEvents.length} eventos passados excluídos (mostrando primeiros 5):`);
    passedEvents.slice(0, 5).forEach(ev => {
      console.log(`      • ${ev.name} - ${ev.date} (${ev.parsed})`);
    });
  }

  if (thisWeek.length > 0) {
    const firstDate = thisWeek[0].parsedDate?.toLocaleDateString('pt-BR');
    const lastDate = thisWeek[thisWeek.length - 1].parsedDate?.toLocaleDateString('pt-BR');
    console.log(`\n   ⭐ Período desta semana: ${firstDate} até ${lastDate}`);
  }

  if (thisMonthAfterWeek.length > 0) {
    const firstDate = thisMonthAfterWeek[0].parsedDate?.toLocaleDateString('pt-BR');
    const lastDate = thisMonthAfterWeek[thisMonthAfterWeek.length - 1].parsedDate?.toLocaleDateString('pt-BR');
    console.log(`   📅 Período restante do mês: ${firstDate} até ${lastDate}`);
  }

  console.log(`\n   📤 Total a ser enviado: ${thisWeek.length + thisMonthAfterWeek.length} eventos\n`);

  return {
    thisWeek,
    afterThisWeek: thisMonthAfterWeek,
    all: [...thisWeek, ...thisMonthAfterWeek]
  };
}

function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((ev) => ({
      unit: normalizeText(ev.unit),
      name: normalizeText(ev.name),
      date: normalizeText(ev.date),
      time: normalizeText(ev.time),
      category: normalizeText(ev.category),
      price: normalizeText(ev.price),
      age: normalizeText(ev.age),
      description: normalizeText(ev.description)
    }))
    .filter((ev) => ev.unit && ev.name);
}

function eventKey(ev) {
  // chave tolerante para deduplicação
  return [ev.unit, ev.name, ev.date, ev.time].join('|').toLowerCase();
}

function mergeUniqueEvents(existingEvents, newEvents) {
  const out = Array.isArray(existingEvents) ? [...existingEvents] : [];
  const seen = new Set(out.map(eventKey));
  let added = 0;

  for (const ev of newEvents) {
    const key = eventKey(ev);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev);
    added += 1;
  }

  return { merged: out, added };
}

function renderEventsTelegramFromJson(payload, pdfUrl) {
  const meta = payload?.meta ?? {};
  const events = Array.isArray(payload?.events) ? payload.events : [];

  const onlyValid = events
    .map((ev) => ({
      unit: normalizeText(ev.unit),
      name: normalizeText(ev.name),
      date: normalizeText(ev.date),
      time: normalizeText(ev.time),
      category: normalizeText(ev.category),
      price: normalizeText(ev.price),
      age: normalizeText(ev.age),
      description: normalizeText(ev.description),
      isNew: ev.isNew
    }))
    .filter((ev) => ev.unit && ev.name && (ev.date || ev.time));

  // Opcional: só enviar notificação do que é "novo" para evitar spam
  // (Pode ser configurável futuramente, aqui deixaremos apenas os novos)
  const onlyNew = onlyValid.filter((ev) => ev.isNew);

  // Filtra e ordena eventos (sobre a lista de novos)
  const { thisWeek, afterThisWeek } = filterAndSortEvents(onlyNew);

  const today = new Date();
  const formattedToday = today.toLocaleDateString('pt-BR');

  // Função auxiliar para renderizar lista de eventos por unidade
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

  const renderEventsList = (eventsList) => {
    const lines = [];
    const byUnit = new Map();

    for (const ev of eventsList) {
      const key = ev.unit;
      if (!byUnit.has(key)) byUnit.set(key, []);
      byUnit.get(key).push(ev);
    }

    const units = Array.from(byUnit.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    for (const unit of units) {
      lines.push(''); // Afasta a unidade dos eventos de cima
      lines.push(`🏛️ <b>${unit}</b>`);
      lines.push(''); // Afasta a leitura dos eventos novos de baixo
      const list = byUnit.get(unit);
      for (const ev of list) {
        const icon = getEventEmoji(ev);
        const header = `• <b>🔥 NOVIDADE:</b> ${icon} ${ev.name}`;
        let dateStr = ev.date;
        if (ev.parsedDate) {
          const weekday = ev.parsedDate.toLocaleDateString('pt-BR', { weekday: 'long' });
          dateStr += ` (${weekday})`;
        }
        const when = [dateStr ? `🗓️ ${dateStr}` : null, ev.time ? `⏰ ${ev.time}` : null].filter(Boolean).join(' · ');
        const tags = [
          ev.category ? `🏷️ ${ev.category}` : null,
          ev.price ? `💳 ${ev.price}` : null,
          ev.age ? `🔞 ${ev.age}` : null
        ].filter(Boolean).join(' · ');

        lines.push(header);
        if (when) lines.push(`  ${when}`);
        if (tags) lines.push(`  ${tags}`);
        if (ev.description) lines.push(`  📝 ${ev.description}`);
        
        const calUrl = generateGoogleCalendarUrl(ev);
        if (calUrl) {
          lines.push(`  🗓️ <a href="${calUrl}">Adicionar ao Google Agenda</a>`);
        }
        lines.push('');
      }
    }

    return lines;
  };

  // Bloco 1: Destaques da Semana (Hoje até próximo Sábado)
  const thisWeekBlock = [];
  if (thisWeek.length > 0) {
    // Calcula período da semana
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + daysUntilSaturday);

    const periodStart = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const periodEnd = endOfWeek.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    thisWeekBlock.push('<b>⭐ DESTAQUES DESTA SEMANA (NOVOS) ⭐</b>');
    thisWeekBlock.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    thisWeekBlock.push('');
    thisWeekBlock.push(`🗓️ <b>Período:</b> ${periodStart} a ${periodEnd}`);
    thisWeekBlock.push(`📆 <b>Total Novos:</b> ${thisWeek.length} evento(s)`);
    thisWeekBlock.push('');
    thisWeekBlock.push(...renderEventsList(thisWeek));
    thisWeekBlock.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // Bloco 2: Restante do Mês (Após sábado até fim do mês)
  // Bloco 2: Restante do Mês (Após sábado até fim do mês)
  const afterThisWeekBlock = [];
  if (afterThisWeek.length > 0) {
    // Calcula período restante do mês
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const daysUntilSaturday = (6 - now.getDay() + 7) % 7;
    const afterSaturday = new Date(now);
    afterSaturday.setDate(now.getDate() + daysUntilSaturday + 1); // Domingo após o sábado

    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const periodStart = afterSaturday.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const periodEnd = endOfMonth.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

    afterThisWeekBlock.push('<b>📅 RESTANTE DO MÊS (NOVOS)</b>');
    afterThisWeekBlock.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    afterThisWeekBlock.push('');
    afterThisWeekBlock.push(`🗓️ <b>Período:</b> ${periodStart} a ${periodEnd}`);
    afterThisWeekBlock.push(`📆 <b>Total Novos:</b> ${afterThisWeek.length} evento(s)`);
    afterThisWeekBlock.push('');
    afterThisWeekBlock.push(...renderEventsList(afterThisWeek));
  }

  // Retorna objeto com os dois blocos
  return {
    thisWeek: thisWeekBlock.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    afterThisWeek: afterThisWeekBlock.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    hasThisWeek: thisWeek.length > 0,
    hasAfterThisWeek: afterThisWeek.length > 0
  };
}

async function sendTelegramLongText({ botInstance, chatId, text }) {
  const chunks = splitForTelegram(text, TELEGRAM_SAFE_CHUNK_LEN);
  if (chunks.length === 0) return;

  console.log(`📦 Conteúdo preparado: ${text.length} caracteres`);
  console.log(`✉️  Envio em ${chunks.length} mensagem(ns) (limite ~${TELEGRAM_SAFE_CHUNK_LEN} chars)`);

  // Envia também para o WhatsApp via Evolution API
  await evolution.sendMessage(text);

  for (let i = 0; i < chunks.length; i += 1) {
    const part = chunks[i];
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n` : '';
    const payload = prefix + part;

    let attempt = 0;
    // retries por parte
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt += 1;
      try {
        console.log(`📨 Enviando ${i + 1}/${chunks.length} (${payload.length} chars)...`);
        await botInstance.sendMessage(chatId, payload, { parse_mode: 'HTML' });
        break;
      } catch (err) {
        const description = err?.response?.body?.description || err?.message || '';
        const retryAfter = err?.response?.body?.parameters?.retry_after;

        if (/message is too long/i.test(description)) {
          // fallback: reduz o tamanho e re-splita a parte atual
          console.log('⚠️ Telegram informou "message is too long". Requebrando em partes menores...');
          const smaller = splitForTelegram(payload, 2500);
          // envia as subpartes e segue
          for (let s = 0; s < smaller.length; s += 1) {
            console.log(`📨 Subenvio ${i + 1}.${s + 1}/${i + 1}.${smaller.length} (${smaller[s].length} chars)...`);
            await botInstance.sendMessage(chatId, smaller[s], { parse_mode: 'HTML' });
            await sleep(350);
          }
          break;
        }

        if (Number.isFinite(retryAfter) || /Too Many Requests/i.test(description)) {
          const waitSec = Number.isFinite(retryAfter) ? retryAfter : 5;
          console.log(`⏳ Rate limit do Telegram. Aguardando ${waitSec}s e tentando novamente...`);
          await sleep((waitSec + 1) * 1000);
          continue;
        }

        if (attempt < 3) {
          console.log(`⚠️ Falha ao enviar parte ${i + 1}/${chunks.length}. Tentativa ${attempt}/3. Motivo: ${description}`);
          await sleep(1200);
          continue;
        }

        throw err;
      }
    }

    // pequena pausa para evitar rate limit
    await sleep(350);
  }
}

async function findLatestPDF() {
  const { data } = await axios.get(URL_PAGINA);
  const $ = cheerio.load(data);
  const element = $('a[href$=".pdf"]').first();
  const pdfLink = element.attr('href');
  const text = element.text().trim();
  return { url: new URL(pdfLink, URL_PAGINA).href, text };
}

async function downloadPdfAsBase64(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data).toString('base64');
  } catch (error) {
    console.error('Erro ao baixar PDF:', error);
    throw error;
  }
}

async function extractUnitsFromPDF(pdfBase64) {
  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
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

    const parsed = extractJson(result.response.text());
    return parsed?.units || [];
  } catch (error) {
    console.error('Erro ao extrair unidades:', error);
    return [];
  }
}

async function analyzeWithGemini(pdfBase64, { extraInstructions = '', selectedUnits = [] } = {}) {
  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            meta: {
              type: SchemaType.OBJECT,
              properties: {
                city: { type: SchemaType.STRING },
                scope: { type: SchemaType.STRING },
                source: { type: SchemaType.STRING },
                month: { type: SchemaType.STRING }
              }
            },
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

    const unitFilter = selectedUnits.length > 0
      ? `\nAPENAS EXTRAIA EVENTOS DAS SEGUINTES UNIDADES:\n${selectedUnits.map(u => `- ${u}`).join('\n')}`
      : '';

    const prompt = `Me liste todos os shows presentes na programação do pdf em anexo.
${unitFilter}

REGRAS TÉCNICAS (MANTENHA O FORMATO):
- Responda estritamente com o JSON definido no schema.
- Se houver muitos eventos, extraia uma parte (max 30), marque "has_more": true e preencha o "cursor" para continuar.
${extraInstructions ? `\nINSTRUÇÕES EXTRAS:\n${extraInstructions}` : ''}`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: pdfBase64,
          mimeType: "application/pdf",
        },
      },
      prompt,
    ]);

    return result.response.text();
  } catch (error) {
    console.error('Erro na análise com Gemini:', error);
    throw error;
  }
}

async function analyzeAllWithGemini(pdfUrl, { maxRounds = 8, selectedUnits = [] } = {}) {
  const aggregated = {
    meta: { city: 'São Paulo', scope: 'Capital', source: 'Sesc Em Cartaz', month: '' },
    events: []
  };

  console.log('⬇️ Baixando PDF para envio ao Gemini...');
  const pdfBase64 = await downloadPdfAsBase64(pdfUrl);
  console.log(`📦 PDF baixado (${(pdfBase64.length / 1024 / 1024).toFixed(2)} MB base64)`);

  let cursor = '';
  let rounds = 0;

  while (rounds < maxRounds) {
    rounds += 1;
    console.log(`gemini: análise ${rounds}/${maxRounds}${cursor ? ` (cursor: ${cursor})` : ''}...`);

    const already = aggregated.events.slice(-40).map((ev) => ({
      unit: ev.unit,
      name: ev.name,
      date: ev.date,
      time: ev.time
    }));

    const continuationHint = cursor
      ? `CONTINUAÇÃO
- Continue a extração a partir do cursor a seguir (não repita eventos):
  cursor: ${cursor}
- Eventos já extraídos (não repita): ${JSON.stringify(already)}`
      : '';

    const t0 = Date.now();
    let raw;

    // Indicador de progresso visual
    const progressInterval = setInterval(() => {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      process.stdout.write(`\r⏳ Aguardando resposta do Gemini... ${elapsed}s`);
    }, 1000);

    try {
      raw = await analyzeWithGemini(pdfBase64, {
        extraInstructions: continuationHint,
        selectedUnits
      });
    } catch (err) {
      clearInterval(progressInterval);
      process.stdout.write('\n'); // Quebra linha
      console.error(`❌ Erro na rodada ${rounds}:`, err.message);
      console.log('⚠️ Encerrando extração e retornando eventos coletados até agora.');
      return { ok: true, payload: aggregated };
    }

    clearInterval(progressInterval);
    process.stdout.write('\n'); // Quebra linha
    console.log(`✅ Gemini respondeu em ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const parsed = extractJson(raw);
    if (!parsed || typeof parsed !== 'object') {
      console.log('⚠️ Resposta não veio como JSON interpretável. Encerrando continuação e retornando o que já foi coletado.');
      return { ok: true, payload: aggregated };
    }

    if (parsed?.meta && typeof parsed.meta === 'object') {
      aggregated.meta = { ...aggregated.meta, ...parsed.meta };
    }

    const incomingEvents = normalizeEvents(parsed.events);
    const { merged, added } = mergeUniqueEvents(aggregated.events, incomingEvents);
    aggregated.events = merged;

    console.log(`🧩 Eventos nesta resposta: ${incomingEvents.length} | Novos adicionados: ${added} | Total acumulado: ${aggregated.events.length}`);

    const hasMore = Boolean(parsed.has_more);
    const nextCursor = normalizeText(parsed.cursor);

    if (!hasMore) {
      console.log('🏁 Gemini indicou que não há mais itens.');
      return { ok: true, payload: aggregated };
    }

    if (!nextCursor || nextCursor === cursor) {
      console.log('⚠️ "has_more" veio true, mas cursor ausente/inalterado. Encerrando para evitar loop.');
      return { ok: true, payload: aggregated };
    }

    cursor = nextCursor;
    await sleep(2000); // Pausa para evitar rate limit
  }

  console.log('⚠️ Atingiu o número máximo de análises.');
  return { ok: true, payload: aggregated };
}

async function main() {
  const executionId = database.startExecution();
  const stats = { status: 'completed', eventsFound: 0, eventsNew: 0, errorMessage: null };

  try {
    // Validate environment variables
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !GEMINI_API_KEY) {
      throw new Error('Variáveis de ambiente faltando! Verifique o arquivo .env');
    }

    // Carrega unidades selecionadas da variável de ambiente (se existir)
    const selectedUnitsEnv = process.env.SELECTED_UNITS || '';
    const selectedUnits = selectedUnitsEnv ? selectedUnitsEnv.split(',').map(u => u.trim()).filter(Boolean) : [];

    if (selectedUnits.length > 0) {
      console.log(`🎯 Filtrando apenas as unidades: ${selectedUnits.join(', ')}`);
    }

    console.log('Buscando o PDF mais recente...');
    const { url: pdfUrl, text: pdfName } = await findLatestPDF();

    console.log(`\n📄 PDF Encontrado: ${pdfName}`);
    console.log(`🔗 Link: ${pdfUrl}`);
    console.log(`📅 Data da consulta: ${new Date().toLocaleString('pt-BR')}\n`);

    console.log('Verificando cache do PDF no banco de dados...');
    let result;
    const cachedData = database.getPdfCache(pdfUrl, selectedUnits);

    if (cachedData) {
      console.log('✅ PDF já processado anteriormente! Carregando do cache...');
      result = { ok: true, payload: cachedData };
    } else {
      console.log('Analisando novo PDF com Gemini API...');
      result = await analyzeAllWithGemini(pdfUrl, {
        maxRounds: parseInt(process.env.MAX_ROUNDS || '8'),
        selectedUnits
      });

      // Salva no banco de dados se houver sucesso
      if (result.ok && result.payload?.events?.length > 0) {
        console.log('💾 Salvando análise do PDF no cache...');
        database.savePdfCache(pdfUrl, result.payload, selectedUnits);
      }
    }
    console.log('Organizando conteúdo...');

    // Filtra e ordena eventos
    const { thisWeek, afterThisWeek, all } = filterAndSortEvents(result.payload.events);

    console.log(`🧾 Total de eventos extraídos: ${result.payload.events.length}`);
    console.log(`⭐ Esta semana (hoje→sábado): ${thisWeek.length}`);
    console.log(`📅 Restante do mês: ${afterThisWeek.length}`);
    console.log(`📤 Total a enviar: ${all.length}`);

    // Salva eventos no banco de dados
    let newEventsCount = 0;
    for (const event of all) {
      const eventData = {
        name: event.name,
        date: event.date,
        time: event.time,
        location: event.unit,
        price: event.price,
        classification: event.age,
        category: event.category,
        description: event.description
      };
      const result = database.saveEvent(eventData);
      event.isNew = result.isNew;
      if (result.isNew) newEventsCount++;
    }

    console.log(`💾 Salvos no banco: ${all.length} eventos (${newEventsCount} novos)`);

    stats.eventsFound = all.length;
    stats.eventsNew = newEventsCount;

    // Atualiza payload com eventos filtrados
    result.payload.events = all;

    console.log('Enviando para o Telegram...');

    if (result.ok) {
      const blocks = renderEventsTelegramFromJson(result.payload, pdfUrl);

      // Envia bloco 1: Destaques da Semana (Hoje até Sábado)
      if (blocks.hasThisWeek) {
        console.log('📤 Enviando bloco 1: Destaques da Semana (hoje → sábado)...');
        await sendTelegramLongText({
          botInstance: bot,
          chatId: TELEGRAM_CHAT_ID,
          text: blocks.thisWeek
        });
        await sleep(1000); // Pausa entre blocos
      }

      // Envia bloco 2: Restante do Mês (Após Sábado até fim do mês)
      if (blocks.hasAfterThisWeek) {
        console.log('📤 Enviando bloco 2: Restante do Mês (após sábado → fim do mês)...');
        await sendTelegramLongText({
          botInstance: bot,
          chatId: TELEGRAM_CHAT_ID,
          text: blocks.afterThisWeek
        });
      }

      if (!blocks.hasThisWeek && !blocks.hasAfterThisWeek) {
        console.log('⚠️ Nenhum evento futuro para enviar.');
        await bot.sendMessage(TELEGRAM_CHAT_ID, '⚠️ Não há eventos futuros agendados no momento.');
      }
    } else {
      console.log('⚠️ Falha no modo JSON/continuação. Enviando fallback formatado do texto retornado.');
      const header = [
        '🎭 Resumo de Eventos SESC',
        pdfName ? `📄 Guia: ${pdfName}` : null,
        `📅 Consulta: ${new Date().toLocaleString('pt-BR')}`
      ]
        .filter(Boolean)
        .join('\n');
      const body = formatSummaryForTelegram(result.raw);
      const fullMessage = `${header}\n\n🔗 PDF: ${pdfUrl}\n\n${body}`.trim();
      await sendTelegramLongText({ botInstance: bot, chatId: TELEGRAM_CHAT_ID, text: fullMessage });
    }

    console.log('Processo concluído com sucesso!');
    database.finishExecution(executionId, stats);
  } catch (error) {
    console.error('Erro no script:', error);
    stats.status = 'failed';
    stats.errorMessage = error.message;
    database.finishExecution(executionId, stats);

    try {
      await bot.sendMessage(TELEGRAM_CHAT_ID, `❌ O script falhou: ${error.message}`);
    } catch (telegramError) {
      console.error('Erro ao enviar mensagem de erro para Telegram:', telegramError);
    }
  }
}

main();
