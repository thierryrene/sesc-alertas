// Inicialização
let currentSelectedUnits = [];

document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();
  await loadStatus();
  setupEventListeners();
  setupRealtimeListeners();
});

// Carrega configurações
async function loadConfig() {
  const config = await window.electronAPI.getConfig();
  document.getElementById('telegramToken').value = config.telegramToken;
  document.getElementById('telegramChatId').value = config.telegramChatId;
  document.getElementById('geminiApiKey').value = config.geminiApiKey;
  document.getElementById('urlPagina').value = config.urlPagina;
  document.getElementById('maxRounds').value = config.maxRounds;
  document.getElementById('geminiModel').value = config.geminiModel;
}

// Carrega status
async function loadStatus() {
  const status = await window.electronAPI.getStatus();
  
  updateStatusDisplay(status.isRunning);
  
  if (status.lastExecution) {
    displayLastExecution(status.lastExecution);
  }
  
  if (status.availableUnits && status.availableUnits.length > 0) {
    renderUnits(status.availableUnits, status.selectedUnits);
  }
  
  if (status.selectedUnits && status.selectedUnits.length > 0) {
    currentSelectedUnits = status.selectedUnits;
    displaySelectedUnits(status.selectedUnits);
  }
  
  if (status.logs && status.logs.length > 0) {
    updateLogs(status.logs);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${tab}-tab`).classList.add('active');
    });
  });

  // Save config
  document.getElementById('config-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const config = Object.fromEntries(formData);
    
    const result = await window.electronAPI.saveConfig(config);
    showAlert(result.success ? 'success' : 'error', result.message);
  });

  // Extract units
  document.getElementById('extract-units-btn').addEventListener('click', extractUnits);

  // Execute script
  document.getElementById('execute-btn').addEventListener('click', executeScript);

  // Clear logs
  document.getElementById('clear-logs-btn').addEventListener('click', clearLogs);
}

// Setup realtime listeners
function setupRealtimeListeners() {
  window.electronAPI.onLogUpdate((logs) => {
    updateLogs(logs);
  });

  window.electronAPI.onExecutionComplete((data) => {
    updateStatusDisplay(data.isRunning);
    if (data.lastExecution) {
      displayLastExecution(data.lastExecution);
      const duration = Math.round(data.lastExecution.duration / 1000);
      const statusDiv = document.getElementById('execution-status');
      statusDiv.innerHTML = data.lastExecution.success 
        ? `✅ Execução concluída com sucesso em ${duration}s`
        : `❌ Execução falhou após ${duration}s`;
      statusDiv.className = 'execution-status ' + (data.lastExecution.success ? 'success' : 'error');
    }
    document.getElementById('execute-btn').disabled = false;
  });
}

// Extract units
async function extractUnits() {
  const btn = document.getElementById('extract-units-btn');
  const loading = document.getElementById('units-loading');
  const container = document.getElementById('units-container');
  
  btn.disabled = true;
  loading.style.display = 'block';
  container.innerHTML = '';
  
  const result = await window.electronAPI.extractUnits();
  
  loading.style.display = 'none';
  btn.disabled = false;
  
  if (result.success && result.units) {
    renderUnits(result.units, currentSelectedUnits);
  } else {
    container.innerHTML = '<p class="no-units">Erro ao extrair unidades. Tente novamente.</p>';
  }
}

// Render units checkboxes
function renderUnits(units, selected = []) {
  const container = document.getElementById('units-container');
  
  const grid = document.createElement('div');
  grid.className = 'units-grid';
  
  units.forEach(unit => {
    const label = document.createElement('label');
    label.className = 'unit-checkbox';
    const checked = selected.includes(unit) ? 'checked' : '';
    label.innerHTML = `
      <input type="checkbox" name="unit" value="${escapeHtml(unit)}" ${checked}>
      <span>${escapeHtml(unit)}</span>
    `;
    grid.appendChild(label);
  });
  
  const actions = document.createElement('div');
  actions.className = 'units-actions';
  actions.innerHTML = `
    <button id="select-all-btn" class="btn btn-small">✅ Selecionar Todas</button>
    <button id="deselect-all-btn" class="btn btn-small">❌ Desmarcar Todas</button>
    <button id="save-units-btn" class="btn btn-primary">💾 Salvar Seleção</button>
  `;
  
  container.innerHTML = '';
  container.appendChild(grid);
  container.appendChild(actions);
  
  // Add event listeners
  document.getElementById('select-all-btn').addEventListener('click', () => {
    document.querySelectorAll('.unit-checkbox input').forEach(cb => cb.checked = true);
  });
  
  document.getElementById('deselect-all-btn').addEventListener('click', () => {
    document.querySelectorAll('.unit-checkbox input').forEach(cb => cb.checked = false);
  });
  
  document.getElementById('save-units-btn').addEventListener('click', saveUnits);
}

// Save units selection
async function saveUnits() {
  const selected = Array.from(
    document.querySelectorAll('.unit-checkbox input:checked')
  ).map(cb => cb.value);
  
  const result = await window.electronAPI.selectUnits(selected);
  
  if (result.success) {
    currentSelectedUnits = selected;
    displaySelectedUnits(selected);
    showAlert('success', `${selected.length} unidade(s) selecionada(s)!`);
  } else {
    showAlert('error', result.message);
  }
}

// Execute script
async function executeScript() {
  const btn = document.getElementById('execute-btn');
  const statusDiv = document.getElementById('execution-status');
  
  btn.disabled = true;
  statusDiv.innerHTML = '🔄 Iniciando execução...';
  statusDiv.className = 'execution-status';
  
  const result = await window.electronAPI.executeScript();
  
  if (result.success) {
    statusDiv.innerHTML = '✅ ' + result.message;
    statusDiv.classList.add('success');
    updateStatusDisplay(true);
  } else {
    statusDiv.innerHTML = '❌ ' + result.message;
    statusDiv.classList.add('error');
    btn.disabled = false;
  }
}

// Clear logs
async function clearLogs() {
  await window.electronAPI.clearLogs();
  document.getElementById('logs-container').innerHTML = 
    '<p class="no-logs">Logs limpos. Execute o script para ver novos logs.</p>';
}

// Update status display
function updateStatusDisplay(isRunning) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = isRunning ? '🔄 Executando...' : '✅ Ocioso';
  statusEl.className = 'value ' + (isRunning ? 'running' : 'idle');
}

// Display last execution
function displayLastExecution(lastExecution) {
  const display = document.getElementById('last-execution-display');
  const text = document.getElementById('last-execution-text');
  
  const date = new Date(lastExecution.startTime).toLocaleString('pt-BR');
  const status = lastExecution.success ? '✅ Sucesso' : '❌ Falha';
  
  text.textContent = `${date} (${status})`;
  display.style.display = 'flex';
}

// Display selected units
function displaySelectedUnits(units) {
  if (units.length > 0) {
    document.getElementById('selected-units-info').style.display = 'block';
    document.getElementById('selected-units-list').textContent = units.join(', ');
  }
}

// Update logs
function updateLogs(logs) {
  const container = document.getElementById('logs-container');
  
  if (!logs || logs.length === 0) {
    container.innerHTML = '<p class="no-logs">Nenhum log disponível.</p>';
    return;
  }
  
  container.innerHTML = logs.map(log => `
    <div class="log-entry log-${log.type}">
      <span class="log-time">${new Date(log.time).toLocaleTimeString('pt-BR')}</span>
      <span class="log-message">${escapeHtml(log.message)}</span>
    </div>
  `).join('');
  
  container.scrollTop = container.scrollHeight;
}

// Show alert
function showAlert(type, message) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  
  const container = document.querySelector('.tab-content.active');
  container.insertBefore(alert, container.firstChild);
  
  setTimeout(() => alert.remove(), 5000);
}

// Toggle password visibility
function togglePassword(id) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
