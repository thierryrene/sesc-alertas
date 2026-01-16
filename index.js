import axios from 'axios';
import * as cheerio from 'cheerio';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

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
  
  // Tenta vários formatos de data
  const patterns = [
    // DD/MM/YYYY ou DD/MM/YY
    /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
    // DD de MÊS
    /(\d{1,2})\s+de\s+(\w+)/i,
    // MÊS DD
    /(\w+)\s+(\d{1,2})/i
  ];
  
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
  
  for (const pattern of patterns) {
    const match = dateStr.match(pattern);
    if (match) {
      if (pattern.source.includes('\\/')) {
        // Formato DD/MM/YYYY
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1;
        let year = parseInt(match[3]);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
      } else if (pattern.source.includes('de')) {
        // Formato "DD de MÊS"
        const day = parseInt(match[1]);
        const monthName = match[2].toLowerCase();
        const month = months[monthName];
        if (month !== undefined) {
          const now = new Date();
          return new Date(now.getFullYear(), month, day);
        }
      } else {
        // Formato "MÊS DD"
        const monthName = match[1].toLowerCase();
        const day = parseInt(match[2]);
        const month = months[monthName];
        if (month !== undefined) {
          const now = new Date();
          return new Date(now.getFullYear(), month, day);
        }
      }
    }
  }
  
  return null;
}

// Verifica se o evento está na semana atual
function isThisWeek(eventDate) {
  if (!eventDate) return false;
  
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Domingo
  startOfWeek.setHours(0, 0, 0, 0);
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // Sábado
  endOfWeek.setHours(23, 59, 59, 999);
  
  return eventDate >= startOfWeek && eventDate <= endOfWeek;
}

// Filtra e ordena eventos por data
function filterAndSortEvents(events) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  
  // Adiciona data parseada aos eventos
  const eventsWithDate = events.map(ev => ({
    ...ev,
    parsedDate: parseEventDate(ev.date)
  }));
  
  // Filtra eventos futuros ou sem data definida
  const futureEvents = eventsWithDate.filter(ev => {
    if (!ev.parsedDate) return true; // Mantém eventos sem data
    return ev.parsedDate >= now;
  });
  
  // Separa em semana atual e posteriores
  const thisWeek = futureEvents.filter(ev => ev.parsedDate && isThisWeek(ev.parsedDate));
  const afterThisWeek = futureEvents.filter(ev => !ev.parsedDate || !isThisWeek(ev.parsedDate));
  
  // Ordena cada grupo por data
  const sortByDate = (a, b) => {
    if (!a.parsedDate && !b.parsedDate) return 0;
    if (!a.parsedDate) return 1;
    if (!b.parsedDate) return -1;
    return a.parsedDate - b.parsedDate;
  };
  
  thisWeek.sort(sortByDate);
  afterThisWeek.sort(sortByDate);
  
  return { thisWeek, afterThisWeek, all: [...thisWeek, ...afterThisWeek] };
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
      description: normalizeText(ev.description)
    }))
    .filter((ev) => ev.unit && ev.name && (ev.date || ev.time));

  // Filtra e ordena eventos
  const { thisWeek, afterThisWeek } = filterAndSortEvents(onlyValid);
  
  const today = new Date();
  const formattedToday = today.toLocaleDateString('pt-BR');

  const lines = [];
  lines.push('🎤 Shows e eventos SESC');
  if (meta?.month) lines.push(`📅 Referência: ${normalizeText(meta.month)}`);
  lines.push(`📆 Consultado em: ${formattedToday}`);
  if (pdfUrl) lines.push(`🔗 PDF: ${pdfUrl}`);
  lines.push('');

  if (thisWeek.length === 0 && afterThisWeek.length === 0) {
    lines.push('⚠️ Não há eventos futuros agendados no momento.');
    return lines.join('\n');
  }

  // Seção: DESTAQUES DA SEMANA
  if (thisWeek.length > 0) {
    lines.push('⭐ DESTAQUES DESTA SEMANA ⭐');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    // Agrupa eventos da semana por unidade
    const byUnitThisWeek = new Map();
    for (const ev of thisWeek) {
      const key = ev.unit;
      if (!byUnitThisWeek.has(key)) byUnitThisWeek.set(key, []);
      byUnitThisWeek.get(key).push(ev);
    }

    const unitsThisWeek = Array.from(byUnitThisWeek.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    for (const unit of unitsThisWeek) {
      lines.push(`🏛️ ${unit}`);
      const list = byUnitThisWeek.get(unit);
      for (const ev of list) {
        const header = `• 🎫 ${ev.name}`;
        const when = [ev.date ? `🗓️ ${ev.date}` : null, ev.time ? `⏰ ${ev.time}` : null].filter(Boolean).join(' · ');
        const tags = [
          ev.category ? `🏷️ ${ev.category}` : null,
          ev.price ? `💳 ${ev.price}` : null,
          ev.age ? `🔞 ${ev.age}` : null
        ].filter(Boolean).join(' · ');

        lines.push(header);
        if (when) lines.push(`  ${when}`);
        if (tags) lines.push(`  ${tags}`);
        if (ev.description) lines.push(`  📝 ${ev.description}`);
        lines.push('');
      }
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }

  // Seção: PRÓXIMOS EVENTOS
  if (afterThisWeek.length > 0) {
    lines.push('📅 PRÓXIMOS EVENTOS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');

    // Agrupa eventos futuros por unidade
    const byUnitAfter = new Map();
    for (const ev of afterThisWeek) {
      const key = ev.unit;
      if (!byUnitAfter.has(key)) byUnitAfter.set(key, []);
      byUnitAfter.get(key).push(ev);
    }

    const unitsAfter = Array.from(byUnitAfter.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    for (const unit of unitsAfter) {
      lines.push(`🏛️ ${unit}`);
      const list = byUnitAfter.get(unit);
      for (const ev of list) {
        const header = `• 🎫 ${ev.name}`;
        const when = [ev.date ? `🗓️ ${ev.date}` : null, ev.time ? `⏰ ${ev.time}` : null].filter(Boolean).join(' · ');
        const tags = [
          ev.category ? `🏷️ ${ev.category}` : null,
          ev.price ? `💳 ${ev.price}` : null,
          ev.age ? `🔞 ${ev.age}` : null
        ].filter(Boolean).join(' · ');

        lines.push(header);
        if (when) lines.push(`  ${when}`);
        if (tags) lines.push(`  ${tags}`);
        if (ev.description) lines.push(`  📝 ${ev.description}`);
        lines.push('');
      }
    }
  }

  // Normaliza espaços/linhas
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function sendTelegramLongText({ botInstance, chatId, text }) {
  const chunks = splitForTelegram(text, TELEGRAM_SAFE_CHUNK_LEN);
  if (chunks.length === 0) return;

  console.log(`📦 Conteúdo preparado: ${text.length} caracteres`);
  console.log(`✉️  Envio em ${chunks.length} mensagem(ns) (limite ~${TELEGRAM_SAFE_CHUNK_LEN} chars)`);

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
        await botInstance.sendMessage(chatId, payload);
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
            await botInstance.sendMessage(chatId, smaller[s]);
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

    console.log('Analisando o PDF com Gemini API...');
    const result = await analyzeAllWithGemini(pdfUrl, { 
      maxRounds: 8,
      selectedUnits 
    });
    console.log('Organizando conteúdo...');

    // Filtra e ordena eventos
    const { thisWeek, afterThisWeek, all } = filterAndSortEvents(result.payload.events);
    
    console.log(`🧾 Total de eventos extraídos: ${result.payload.events.length}`);
    console.log(`⭐ Eventos desta semana: ${thisWeek.length}`);
    console.log(`📅 Eventos futuros: ${afterThisWeek.length}`);
    
    // Atualiza payload com eventos filtrados
    result.payload.events = all;

    let fullMessage;

    const header = [
      '🎭 Resumo de Eventos SESC',
      pdfName ? `📄 Guia: ${pdfName}` : null,
      `📅 Consulta: ${new Date().toLocaleString('pt-BR')}`
    ]
      .filter(Boolean)
      .join('\n');

    if (result.ok) {
      const body = renderEventsTelegramFromJson(result.payload, pdfUrl);
      fullMessage = `${header}\n\n${body}`.trim();
    } else {
      console.log('⚠️ Falha no modo JSON/continuação. Enviando fallback formatado do texto retornado.');
      const body = formatSummaryForTelegram(result.raw);
      fullMessage = `${header}\n\n🔗 PDF: ${pdfUrl}\n\n${body}`.trim();
    }

    console.log('Enviando para o Telegram...');

    await sendTelegramLongText({ botInstance: bot, chatId: TELEGRAM_CHAT_ID, text: fullMessage });

    console.log('Processo concluído com sucesso!');
  } catch (error) {
    console.error('Erro no script:', error);
    await bot.sendMessage(TELEGRAM_CHAT_ID, `❌ O script falhou: ${error.message}`);
  }
}

main();
