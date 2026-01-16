// Tab navigation
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    // Remove active class from all tabs and buttons
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    // Add active class to clicked tab
    btn.classList.add('active');
    document.getElementById(`${tab}-tab`).classList.add('active');
  });
});

// Toggle password visibility
function togglePassword(id) {
  const input = document.getElementById(id);
  input.type = input.type === 'password' ? 'text' : 'password';
}

// Save configuration
document.getElementById('config-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const config = Object.fromEntries(formData);
  
  try {
    const response = await fetch('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showAlert('success', result.message);
    } else {
      showAlert('error', result.message);
    }
  } catch (error) {
    showAlert('error', 'Erro ao salvar configurações: ' + error.message);
  }
});

// Execute script
document.getElementById('execute-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('execute-btn');
  const statusDiv = document.getElementById('execution-status');
  
  btn.disabled = true;
  statusDiv.innerHTML = '🔄 Iniciando execução...';
  statusDiv.className = 'execution-status';
  
  try {
    const response = await fetch('/execute', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      statusDiv.innerHTML = '✅ ' + result.message;
      statusDiv.classList.add('success');
      
      // Start polling for status
      startStatusPolling();
    } else {
      statusDiv.innerHTML = '❌ ' + result.message;
      statusDiv.classList.add('error');
      btn.disabled = false;
    }
  } catch (error) {
    statusDiv.innerHTML = '❌ Erro: ' + error.message;
    statusDiv.classList.add('error');
    btn.disabled = false;
  }
});

// Clear logs
document.getElementById('clear-logs-btn')?.addEventListener('click', async () => {
  try {
    const response = await fetch('/clear-logs', { method: 'POST' });
    const result = await response.json();
    
    if (result.success) {
      document.getElementById('logs-container').innerHTML = 
        '<p class="no-logs">Logs limpos. Execute o script para ver novos logs.</p>';
    }
  } catch (error) {
    showAlert('error', 'Erro ao limpar logs: ' + error.message);
  }
});

// Status polling
let statusInterval = null;

function startStatusPolling() {
  if (statusInterval) return;
  
  statusInterval = setInterval(async () => {
    try {
      const response = await fetch('/status');
      const status = await response.json();
      
      // Update status indicator
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.textContent = status.isRunning ? '🔄 Executando...' : '✅ Ocioso';
        statusEl.className = 'value ' + (status.isRunning ? 'running' : 'idle');
      }
      
      // Update execute button
      const executeBtn = document.getElementById('execute-btn');
      if (executeBtn) {
        executeBtn.disabled = status.isRunning;
      }
      
      // Update logs
      if (status.logs && status.logs.length > 0) {
        updateLogs(status.logs);
      }
      
      // Stop polling if not running
      if (!status.isRunning && statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
        
        // Show completion message
        const statusDiv = document.getElementById('execution-status');
        if (statusDiv && status.lastExecution) {
          const duration = Math.round(status.lastExecution.duration / 1000);
          statusDiv.innerHTML = status.lastExecution.success 
            ? `✅ Execução concluída com sucesso em ${duration}s`
            : `❌ Execução falhou após ${duration}s`;
          statusDiv.className = 'execution-status ' + 
            (status.lastExecution.success ? 'success' : 'error');
        }
      }
    } catch (error) {
      console.error('Erro ao buscar status:', error);
    }
  }, 2000);
}

function updateLogs(logs) {
  const container = document.getElementById('logs-container');
  if (!container) return;
  
  container.innerHTML = logs.map(log => `
    <div class="log-entry log-${log.type}">
      <span class="log-time">${new Date(log.time).toLocaleTimeString('pt-BR')}</span>
      <span class="log-message">${escapeHtml(log.message)}</span>
    </div>
  `).join('');
  
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function showAlert(type, message) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  
  const container = document.querySelector('.tab-content.active');
  container.insertBefore(alert, container.firstChild);
  
  setTimeout(() => alert.remove(), 5000);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Start polling if already running
window.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  if (statusEl && statusEl.classList.contains('running')) {
    startStatusPolling();
  }
});

// Extract units from PDF
document.getElementById('extract-units-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('extract-units-btn');
  const loading = document.getElementById('units-loading');
  const container = document.getElementById('units-container');
  
  btn.disabled = true;
  loading.style.display = 'block';
  container.innerHTML = '';
  
  try {
    const response = await fetch('/extract-units', { method: 'POST' });
    const result = await response.json();
    
    if (result.success && result.units) {
      // Render units checkboxes
      const grid = document.createElement('div');
      grid.className = 'units-grid';
      
      result.units.forEach(unit => {
        const label = document.createElement('label');
        label.className = 'unit-checkbox';
        label.innerHTML = `
          <input type="checkbox" name="unit" value="${escapeHtml(unit)}">
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
      
      container.appendChild(grid);
      container.appendChild(actions);
      
      // Add event listeners
      setupUnitActions();
    } else {
      container.innerHTML = '<p class="no-units">Erro ao extrair unidades. Tente novamente.</p>';
    }
  } catch (error) {
    container.innerHTML = `<p class="no-units">Erro: ${escapeHtml(error.message)}</p>`;
  } finally {
    loading.style.display = 'none';
    btn.disabled = false;
  }
});

function setupUnitActions() {
  // Select all
  document.getElementById('select-all-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.unit-checkbox input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
    });
  });
  
  // Deselect all
  document.getElementById('deselect-all-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.unit-checkbox input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
  });
  
  // Save selection
  document.getElementById('save-units-btn')?.addEventListener('click', async () => {
    const selected = Array.from(
      document.querySelectorAll('.unit-checkbox input[type="checkbox"]:checked')
    ).map(cb => cb.value);
    
    try {
      const response = await fetch('/select-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ units: selected })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showAlert('success', `${selected.length} unidade(s) selecionada(s)!`);
        
        // Refresh page to update execution panel
        setTimeout(() => location.reload(), 1500);
      } else {
        showAlert('error', result.message);
      }
    } catch (error) {
      showAlert('error', 'Erro ao salvar seleção: ' + error.message);
    }
  });
}
