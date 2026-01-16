import cron from 'node-cron';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let scheduledTask = null;
let isSchedulerRunning = false;
let lastExecutionTime = null;
let nextExecutionTime = null;
let executionCount = 0;

// Executa o script principal
function executeScript() {
  return new Promise((resolve, reject) => {
    console.log(`[Scheduler] Executando script às ${new Date().toLocaleString('pt-BR')}...`);
    
    const scriptPath = path.join(__dirname, 'index.js');
    const child = spawn('node', [scriptPath], {
      cwd: __dirname,
      env: process.env,
      stdio: 'pipe'
    });

    let output = '';
    let errorOutput = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log('[Script]', text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
      console.error('[Script Error]', text);
    });

    child.on('close', (code) => {
      lastExecutionTime = new Date();
      executionCount++;
      
      if (code === 0) {
        console.log(`[Scheduler] Execução concluída com sucesso (${executionCount})`);
        resolve({ success: true, output, executionCount });
      } else {
        console.error(`[Scheduler] Execução falhou com código ${code}`);
        reject({ success: false, code, error: errorOutput, executionCount });
      }
    });

    child.on('error', (err) => {
      console.error('[Scheduler] Erro ao executar:', err);
      reject({ success: false, error: err.message, executionCount });
    });
  });
}

// Inicia o agendamento
function start(cronExpression = null) {
  if (isSchedulerRunning) {
    console.log('[Scheduler] Agendador já está rodando');
    return { success: false, message: 'Agendador já está rodando' };
  }

  // Usa expressão do .env se não for fornecida
  const schedule = cronExpression || process.env.CRON_SCHEDULE || '0 8 * * *'; // Padrão: 8h da manhã todo dia

  // Valida expressão cron
  if (!cron.validate(schedule)) {
    console.error('[Scheduler] Expressão cron inválida:', schedule);
    return { success: false, message: 'Expressão cron inválida' };
  }

  try {
    scheduledTask = cron.schedule(schedule, async () => {
      console.log('[Scheduler] Disparando execução agendada...');
      try {
        await executeScript();
      } catch (error) {
        console.error('[Scheduler] Erro na execução:', error);
      }
    });

    isSchedulerRunning = true;
    
    // Calcula próxima execução
    updateNextExecutionTime(schedule);
    
    console.log(`[Scheduler] Iniciado com sucesso! Expressão: ${schedule}`);
    console.log(`[Scheduler] Próxima execução: ${nextExecutionTime?.toLocaleString('pt-BR')}`);
    
    return {
      success: true,
      message: 'Agendador iniciado com sucesso',
      schedule,
      nextExecution: nextExecutionTime
    };
  } catch (error) {
    console.error('[Scheduler] Erro ao iniciar:', error);
    return { success: false, message: error.message };
  }
}

// Para o agendamento
function stop() {
  if (!isSchedulerRunning) {
    return { success: false, message: 'Agendador não está rodando' };
  }

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  isSchedulerRunning = false;
  nextExecutionTime = null;

  console.log('[Scheduler] Parado com sucesso');
  return { success: true, message: 'Agendador parado com sucesso' };
}

// Reinicia o agendamento
function restart(cronExpression = null) {
  stop();
  return start(cronExpression);
}

// Calcula próxima execução (aproximado)
function updateNextExecutionTime(cronExpression) {
  try {
    // Parse simples da expressão cron para estimar próxima execução
    const parts = cronExpression.split(' ');
    if (parts.length >= 5) {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
      
      const now = new Date();
      const next = new Date(now);
      
      // Se tem hora específica
      if (hour !== '*') {
        next.setHours(parseInt(hour));
        next.setMinutes(minute !== '*' ? parseInt(minute) : 0);
        next.setSeconds(0);
        
        // Se já passou hoje, vai para amanhã
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
      }
      
      nextExecutionTime = next;
    }
  } catch (error) {
    console.error('[Scheduler] Erro ao calcular próxima execução:', error);
    nextExecutionTime = null;
  }
}

// Retorna status do scheduler
function getStatus() {
  return {
    isRunning: isSchedulerRunning,
    schedule: process.env.CRON_SCHEDULE || '0 8 * * *',
    lastExecution: lastExecutionTime,
    nextExecution: nextExecutionTime,
    executionCount
  };
}

// Executa imediatamente (manual)
async function runNow() {
  console.log('[Scheduler] Execução manual solicitada...');
  try {
    const result = await executeScript();
    return result;
  } catch (error) {
    return error;
  }
}

// Expressões cron pré-definidas
const PRESETS = {
  'every-hour': '0 * * * *',
  'every-3-hours': '0 */3 * * *',
  'every-6-hours': '0 */6 * * *',
  'daily-8am': '0 8 * * *',
  'daily-noon': '0 12 * * *',
  'daily-6pm': '0 18 * * *',
  'twice-daily': '0 8,20 * * *', // 8h e 20h
  'weekdays-9am': '0 9 * * 1-5', // Segunda a sexta às 9h
  'monday-9am': '0 9 * * 1', // Toda segunda às 9h
  'first-day-month': '0 9 1 * *' // Dia 1 de cada mês às 9h
};

// Obtém preset
function getPreset(name) {
  return PRESETS[name] || null;
}

// Lista todos os presets
function listPresets() {
  return Object.keys(PRESETS).map(key => ({
    name: key,
    expression: PRESETS[key],
    description: getPresetDescription(key)
  }));
}

function getPresetDescription(name) {
  const descriptions = {
    'every-hour': 'A cada hora',
    'every-3-hours': 'A cada 3 horas',
    'every-6-hours': 'A cada 6 horas',
    'daily-8am': 'Todo dia às 8h',
    'daily-noon': 'Todo dia às 12h',
    'daily-6pm': 'Todo dia às 18h',
    'twice-daily': 'Duas vezes ao dia (8h e 20h)',
    'weekdays-9am': 'Dias úteis às 9h',
    'monday-9am': 'Toda segunda às 9h',
    'first-day-month': 'Primeiro dia do mês às 9h'
  };
  return descriptions[name] || name;
}

export default {
  start,
  stop,
  restart,
  getStatus,
  runNow,
  getPreset,
  listPresets,
  PRESETS
};
