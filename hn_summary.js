import axios from 'axios';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import TelegramBot from 'node-telegram-bot-api';
import evolution from './evolution.js';
import * as cheerio from 'cheerio';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';

if (!GEMINI_API_KEY) {
  console.error("❌ Erro: GEMINI_API_KEY não encontrada no arquivo .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const bot = TELEGRAM_BOT_TOKEN ? new TelegramBot(TELEGRAM_BOT_TOKEN) : null;

async function fetchLinkContent(url) {
  if (!url) return '';
  try {
    const res = await axios.get(url, {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const $ = cheerio.load(res.data);
    $('script, style, iframe, nav, header, footer').remove();
    const text = $('p').map((i, el) => $(el).text()).get().join(' ');
    // Fallback se não houver tag p
    if (!text.trim()) return $('body').text().substring(0, 1500).replace(/\s+/g, ' ');
    return text.substring(0, 1500).replace(/\s+/g, ' ');
  } catch (err) {
    return '';
  }
}

async function getHackerNewsTop() {
  try {
    // Busca os Top Stories (IDs)
    const res = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
    const ids = res.data.slice(0, 30); // Avalia os 30 primeiros para garantir rapidez
    const items = [];

    for (const id of ids) {
      const resp = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      const item = resp.data;
      if (item && item.score > 50 && item.title) {
        items.push(item);
      }
      if (items.length >= 8) break; // Limita em 8 posts para não ficar muito longo
    }
    return items;
  } catch (err) {
    console.error("Erro ao carregar Hacker News:", err.message);
    return [];
  }
}

async function summarizeAllWithGemini(posts) {
  try {
    const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    let prompt = `Você é um sumarizador especialista de notícias tech. Recebi posts do Hacker News com o título e um trecho do seu conteúdo original. 
Faça um resumo rico e detalhado em português de 2 a 4 frases para cada um deles, explicando as ideias centrais da matéria.

Sua resposta DEVE conter EXATAMENTE uma linha por post, no formato:
1. [Resumo detalhado do post 1]
2. [Resumo detalhado do post 2]
...

Posts:\n`;

    posts.forEach((post, index) => {
      prompt += `\n[Post ${index + 1}]
Título: ${post.title}
URL: ${post.url || 'N/A'}
Conteúdo extraído: ${post.fetchedText || post.text || 'Apenas o título está disponível.'}\n`;
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim();
    
    const summaries = responseText.split('\n')
      .map(l => l.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(l => l.length > 5);

    return summaries;
  } catch (err) {
    console.error(`❌ Erro no Gemini ao resumir os posts:`, err.message);
    return [];
  }
}

(async () => {
  console.log("📊 Buscando melhores posts do Hacker News...");
  const posts = await getHackerNewsTop();

  if (posts.length === 0) {
    console.log("Nenhum post recente com score > 50 encontrado.");
    return;
  }

  console.log(`📝 Extraindo conteúdo de ${posts.length} links...`);
  for (const post of posts) {
    if (post.url && !post.url.includes('news.ycombinator.com/item')) {
      console.log(`- Lendo: ${post.title}`);
      post.fetchedText = await fetchLinkContent(post.url);
    }
  }

  console.log(`📝 Enviando para resumo em lote no Gemini...`);
  const summaries = await summarizeAllWithGemini(posts);

  let fullMsg = `<b>🔥 HACKER NEWS - TOP STORIES (>50 pts)</b>\n━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const summary = summaries[i] || "Não foi possível gerar um resumo detalhado.";
    
    fullMsg += `• <b>${post.title}</b> (${post.score} pts)\n`;
    if (post.url) fullMsg += `  🔗 <a href="${post.url}">Ver link</a>\n`;
    fullMsg += `  📝 ${summary}\n\n`;
  }

  if (bot && TELEGRAM_CHAT_ID) {
    const blocks = fullMsg.split('\n\n');
    let currentChunk = '';
    const chunks = [];

    for (const block of blocks) {
      if (currentChunk.length + block.length + 2 > 3900) {
        chunks.push(currentChunk);
        currentChunk = block;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + block;
      }
    }
    if (currentChunk) chunks.push(currentChunk);

    for (const chunk of chunks) {
      await bot.sendMessage(TELEGRAM_CHAT_ID, chunk, { parse_mode: 'HTML', disable_web_page_preview: true });
      await new Promise(resolve => setTimeout(resolve, 500)); // Flood limit delay
    }
    console.log("✅ Resumo enviado para o Telegram!");
  }

  await evolution.sendMessage(fullMsg);
  console.log("✅ Resumo enviado para o WhatsApp!");

})();
