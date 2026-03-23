import Database from 'better-sqlite3';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, 'sesc-bot.db');
const db = new Database(DB_PATH);

// Schema do banco de dados
function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      date TEXT,
      time TEXT,
      location TEXT,
      price TEXT,
      classification TEXT,
      category TEXT,
      description TEXT,
      raw_data TEXT,
      first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      times_found INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      status TEXT,
      events_found INTEGER,
      events_new INTEGER,
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filter_type TEXT NOT NULL,
      filter_value TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pdf_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pdf_url TEXT NOT NULL,
      units_hash TEXT NOT NULL,
      parsed_data TEXT NOT NULL,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(pdf_url, units_hash)
    );

    CREATE INDEX IF NOT EXISTS idx_events_fingerprint ON events(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(date);
    CREATE INDEX IF NOT EXISTS idx_events_location ON events(location);
    CREATE INDEX IF NOT EXISTS idx_executions_started ON executions(started_at);
    CREATE INDEX IF NOT EXISTS idx_pdf_cache_url ON pdf_cache(pdf_url);
  `);
}

// Gera fingerprint único para um evento
function generateFingerprint(event) {
  const data = [
    (event.name || '').toLowerCase().trim(),
    (event.date || '').trim(),
    (event.time || '').trim(),
    (event.location || '').toLowerCase().trim()
  ].join('|');
  
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Salva ou atualiza evento no banco
function saveEvent(event) {
  const fingerprint = generateFingerprint(event);
  const existing = db.prepare('SELECT id FROM events WHERE fingerprint = ?').get(fingerprint);

  const stmt = db.prepare(`
    INSERT INTO events (
      fingerprint, name, date, time, location, price, 
      classification, category, description, raw_data
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fingerprint) DO UPDATE SET
      last_seen = CURRENT_TIMESTAMP,
      times_found = times_found + 1
  `);

  stmt.run(
    fingerprint,
    event.name || '',
    event.date || '',
    event.time || '',
    event.location || '',
    event.price || '',
    event.classification || '',
    event.category || '',
    event.description || '',
    JSON.stringify(event)
  );

  return { fingerprint, isNew: !existing };
}

// Verifica se evento já existe
function eventExists(event) {
  const fingerprint = generateFingerprint(event);
  const stmt = db.prepare('SELECT fingerprint FROM events WHERE fingerprint = ?');
  const result = stmt.get(fingerprint);
  return result !== undefined;
}

// Busca eventos por filtros
function getEvents(filters = {}) {
  let query = 'SELECT * FROM events WHERE 1=1';
  const params = [];

  if (filters.location) {
    query += ' AND location LIKE ?';
    params.push(`%${filters.location}%`);
  }

  if (filters.category) {
    query += ' AND category LIKE ?';
    params.push(`%${filters.category}%`);
  }

  if (filters.startDate) {
    query += ' AND date >= ?';
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    query += ' AND date <= ?';
    params.push(filters.endDate);
  }

  query += ' ORDER BY date ASC, time ASC';

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

// Registra início de execução
function startExecution() {
  const stmt = db.prepare(`
    INSERT INTO executions (status) VALUES ('running')
  `);
  const result = stmt.run();
  return result.lastInsertRowid;
}

// Registra fim de execução
function finishExecution(executionId, stats) {
  const stmt = db.prepare(`
    UPDATE executions 
    SET finished_at = CURRENT_TIMESTAMP,
        status = ?,
        events_found = ?,
        events_new = ?,
        error_message = ?
    WHERE id = ?
  `);
  
  stmt.run(
    stats.status || 'completed',
    stats.eventsFound || 0,
    stats.eventsNew || 0,
    stats.errorMessage || null,
    executionId
  );
}

// Busca últimas execuções
function getRecentExecutions(limit = 10) {
  const stmt = db.prepare(`
    SELECT * FROM executions 
    ORDER BY started_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit);
}

// Salva filtro
function saveFilter(filter) {
  const stmt = db.prepare(`
    INSERT INTO filters (name, filter_type, filter_value, enabled)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    filter.name,
    filter.type,
    filter.value,
    filter.enabled ? 1 : 0
  );
  return result.lastInsertRowid;
}

// Busca filtros ativos
function getActiveFilters() {
  const stmt = db.prepare('SELECT * FROM filters WHERE enabled = 1');
  return stmt.all();
}

// Limpa eventos antigos (mais de X dias)
function cleanOldEvents(daysOld = 90) {
  const stmt = db.prepare(`
    DELETE FROM events 
    WHERE last_seen < datetime('now', '-' || ? || ' days')
  `);
  const result = stmt.run(daysOld);
  return result.changes;
}

// Estatísticas gerais
function getStats() {
  const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
  const totalExecutions = db.prepare('SELECT COUNT(*) as count FROM executions').get().count;
  const lastExecution = db.prepare('SELECT * FROM executions ORDER BY started_at DESC LIMIT 1').get();
  
  return {
    totalEvents,
    totalExecutions,
    lastExecution
  };
}

// Busca versão em cache do PDF
function getPdfCache(pdfUrl, units = []) {
  const unitsHash = crypto.createHash('md5').update(units.slice().sort().join(',')).digest('hex');
  const stmt = db.prepare('SELECT parsed_data FROM pdf_cache WHERE pdf_url = ? AND units_hash = ?');
  const result = stmt.get(pdfUrl, unitsHash);
  if (result) {
    try {
      return JSON.parse(result.parsed_data);
    } catch {
      return null;
    }
  }
  return null;
}

// Salva versão em cache do PDF
function savePdfCache(pdfUrl, parsedData, units = []) {
  const unitsHash = crypto.createHash('md5').update(units.slice().sort().join(',')).digest('hex');
  const stmt = db.prepare(`
    INSERT INTO pdf_cache (pdf_url, units_hash, parsed_data) 
    VALUES (?, ?, ?)
    ON CONFLICT(pdf_url, units_hash) DO UPDATE SET
      parsed_data = excluded.parsed_data,
      processed_at = CURRENT_TIMESTAMP
  `);
  stmt.run(pdfUrl, unitsHash, JSON.stringify(parsedData));
}

// Inicializa o banco ao carregar o módulo
initDatabase();

export default {
  db,
  generateFingerprint,
  saveEvent,
  eventExists,
  getEvents,
  startExecution,
  finishExecution,
  getRecentExecutions,
  saveFilter,
  getActiveFilters,
  cleanOldEvents,
  getStats,
  initDatabase,
  getPdfCache,
  savePdfCache
};
