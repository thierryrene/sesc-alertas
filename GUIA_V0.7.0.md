# 🚀 Guia de Uso - v0.7.0

## ✨ Novidades da Versão 0.7.0

Esta versão traz 3 grandes funcionalidades:
1. **Banco de Dados SQLite** - Histórico e deduplicação de eventos
2. **Agendamento Automático** - Execução periódica com node-cron
3. **Filtros Avançados** - Filtre por categoria, preço, idade e local

---

## 🗄️ Banco de Dados

### O que faz?
- Armazena todos os eventos extraídos
- Evita duplicatas usando fingerprint único (hash)
- Mantém histórico de execuções
- Permite consultas e estatísticas

### Como usar?
O banco é criado automaticamente em `sesc-bot.db` na primeira execução.

### API do Banco (via interface web)

**Estatísticas gerais:**
```
GET /database/stats
Retorna: total de eventos, execuções, última execução
```

**Buscar eventos:**
```
GET /database/events?location=Pompeia&category=Show
Parâmetros opcionais:
- location: nome da unidade
- category: categoria do evento
- startDate: data inicial (YYYY-MM-DD)
- endDate: data final (YYYY-MM-DD)
```

**Histórico de execuções:**
```
GET /database/executions?limit=20
Retorna últimas N execuções
```

**Limpar eventos antigos:**
```
POST /database/clean
Body: { "daysOld": 90 }
Remove eventos não vistos há X dias
```

---

## ⏰ Agendamento Automático

### Configuração no .env

```env
# Habilitar agendamento
SCHEDULER_ENABLED=true

# Expressão cron (quando executar)
CRON_SCHEDULE=0 8 * * *
```

### Expressões Cron

Formato: `minuto hora dia mês dia-da-semana`

**Exemplos:**
- `0 8 * * *` - Todo dia às 8h
- `0 */6 * * *` - A cada 6 horas
- `0 8,20 * * *` - Às 8h e 20h
- `0 9 * * 1-5` - Dias úteis às 9h
- `0 9 * * 1` - Toda segunda às 9h
- `0 9 1 * *` - Dia 1 de cada mês às 9h

### Presets Disponíveis

O scheduler vem com 10 presets prontos:
- `every-hour` - A cada hora
- `every-3-hours` - A cada 3 horas
- `every-6-hours` - A cada 6 horas
- `daily-8am` - Todo dia às 8h
- `daily-noon` - Todo dia às 12h
- `daily-6pm` - Todo dia às 18h
- `twice-daily` - 2x ao dia (8h e 20h)
- `weekdays-9am` - Dias úteis às 9h
- `monday-9am` - Toda segunda às 9h
- `first-day-month` - Dia 1 do mês às 9h

### API do Scheduler (via interface web)

**Iniciar agendamento:**
```
POST /scheduler/start
Body: { "cronExpression": "0 8 * * *" } (opcional)
```

**Parar agendamento:**
```
POST /scheduler/stop
```

**Status do agendamento:**
```
GET /scheduler/status
Retorna: isRunning, schedule, lastExecution, nextExecution, executionCount
```

**Executar agora (manual):**
```
POST /scheduler/run-now
```

---

## 🔍 Filtros Avançados

### Configuração no .env

```env
# Filtro de preço
FILTER_MIN_PRICE=0
FILTER_MAX_PRICE=50

# Filtro de categorias (separadas por vírgula)
FILTER_CATEGORIES=show,música,teatro

# Filtro de idade mínima
FILTER_MIN_AGE=0

# Filtro de locais (separados por vírgula)
FILTER_LOCATIONS=Pompeia,Ipiranga,Santana
```

### Como funcionam?

Os filtros são aplicados **antes** de enviar para o Telegram:

1. **Preço**: Eventos fora da faixa são removidos
2. **Categorias**: Apenas eventos das categorias listadas
3. **Idade**: Apenas eventos com classificação >= mínima
4. **Locais**: Apenas eventos dos locais listados

**Exemplo de uso combinado:**
```env
FILTER_MIN_PRICE=0
FILTER_MAX_PRICE=30
FILTER_CATEGORIES=show,música
FILTER_LOCATIONS=Pompeia,Vila Mariana
```

Resultado: Apenas shows e música em Pompeia ou Vila Mariana, com preço até R$ 30.

---

## 🎨 Interface Web

Acesse: **http://localhost:3000**

### Novas funcionalidades:

1. **Dashboard**
   - Total de eventos no banco
   - Estatísticas de execuções
   - Status do scheduler

2. **Controles do Scheduler**
   - Iniciar/Parar agendamento
   - Ver próxima execução
   - Histórico de execuções

3. **Configuração de Filtros**
   - Formulário visual para configurar filtros
   - Salva direto no .env

4. **Histórico de Eventos**
   - Consulta eventos passados
   - Filtros por local, data, categoria

---

## 📊 Exemplos de Uso

### Caso 1: Monitoramento diário de eventos gratuitos

```env
SCHEDULER_ENABLED=true
CRON_SCHEDULE=0 8 * * *
FILTER_MIN_PRICE=0
FILTER_MAX_PRICE=0
SELECTED_UNITS=Sesc Pompeia,Sesc Vila Mariana
```

### Caso 2: Alertas de shows 2x ao dia

```env
SCHEDULER_ENABLED=true
CRON_SCHEDULE=0 8,20 * * *
FILTER_CATEGORIES=show,música
FILTER_MIN_PRICE=0
FILTER_MAX_PRICE=100
```

### Caso 3: Eventos para crianças apenas dias úteis

```env
SCHEDULER_ENABLED=true
CRON_SCHEDULE=0 9 * * 1-5
FILTER_MIN_AGE=0
FILTER_MAX_PRICE=50
FILTER_CATEGORIES=infantil,teatro,oficina
```

---

## 🔧 Solução de Problemas

### Banco de dados corrompido?
```bash
rm sesc-bot.db
npm start
# Banco será recriado automaticamente
```

### Scheduler não inicia?
1. Verifique a expressão cron: https://crontab.guru
2. Confira os logs na interface web
3. Verifique se `SCHEDULER_ENABLED=true`

### Filtros não funcionam?
1. Certifique-se de que os valores no .env estão corretos
2. Os filtros usam "includes", então seja específico
3. Categorias e locais são case-insensitive

### Como fazer backup do banco?
```bash
cp sesc-bot.db sesc-bot-backup-$(date +%Y%m%d).db
```

---

## 📝 Logs e Debugging

### Ver logs do banco:
Os logs mostram quantos eventos foram salvos e quantos são novos:
```
💾 Salvos no banco: 45 eventos (12 novos)
```

### Ver logs dos filtros:
```
🔍 Filtros aplicados: 45 eventos → 23 após filtros
```

### Ver status do scheduler:
```
[Scheduler] Iniciado com sucesso! Expressão: 0 8 * * *
[Scheduler] Próxima execução: 17/01/2026 08:00:00
```

---

## 🎯 Dicas de Performance

1. **Limpeza periódica do banco:**
   Execute mensalmente via API:
   ```bash
   curl -X POST http://localhost:3000/database/clean -H "Content-Type: application/json" -d '{"daysOld": 90}'
   ```

2. **Filtros eficientes:**
   Use filtros específicos para reduzir processamento e envios desnecessários

3. **Agendamento inteligente:**
   PDFs geralmente são atualizados no início do mês
   Use `0 9 1 * *` (dia 1 de cada mês)

---

## 📚 Próximos Passos

- [ ] Implementar notificações por email
- [ ] Criar API REST pública
- [ ] Melhorar interface web com gráficos
- [ ] Adicionar testes automatizados
- [ ] Docker para fácil deploy

---

**Desenvolvido com ❤️ por Thierry**
