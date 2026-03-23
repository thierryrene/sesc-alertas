# Orientações para Agentes e Workflow do Projeto

Este documento serve como guia para agentes de IA e desenvolvedores que atuam no projeto **sesc-alertas**.

## 🚨 REGRA ABSOLUTA (MANDATÓRIA)

**PROIBIDO** iniciar qualquer análise via Gemini API (`index.js` ou `agenda.js sync`) sem antes verificar se o banco de dados (`sesc-bot.db`) já contém eventos para o mês vigente.
- Esta regra visa proteger a quota da API e evitar custos desnecessários.
- Se houver dados do mês, o agente deve interromper a análise de IA, a menos que o usuário solicite explicitamente uma "limpeza de cache e re-sincronização".

## 🤖 Orientações para Agentes

1.  **Verificação Preventiva**: Sempre execute uma query de contagem de eventos do mês atual antes de sugerir ou realizar um teste de envio que envolva raspagem de PDF.
2.  **Uso de Tokens Gemini**: A extração via Gemini consome tokens significativos. Utilize o sistema de cache (`pdf_cache` no banco de dados) para evitar re-análise do mesmo PDF.
3.  **Formatação de Mensagens**: As mensagens para Telegram utilizam HTML básico. Para WhatsApp (via Evolution API), as mensagens são convertidas para Markdown. Mantenha a compatibilidade.
4.  **Tratamento de Datas**: O formato de data no SESC é inconsistente no PDF. Use os utilitários de normalização em `index.js` e `agenda.js`.

## 🔄 Workflow de Execução

O workflow ideal para garantir que o sistema esteja sempre atualizado é:

1.  **Verificação de Novo PDF**: Executar `npm start` ou `node agenda.js sync`.
    *   *Regra*: O script deve verificar se o banco de dados já possui informações do mês vigente antes de realizar uma sincronização pesada.
2.  **Sincronização (Sync)**: Se não houver dados do mês ou o PDF for novo, realiza a extração massiva.
3.  **Alertas Diários/Semanais**:
    *   `node agenda.js daily`: Deve rodar todas as manhãs (ex: 08:00).
    *   `node agenda.js weekly`: Deve rodar uma vez por semana (ex: Segunda-feira).
4.  **Resumo de Notícias**:
    *   `node hn_summary.js`: Opcional, para resumos de tecnologia.

## 🛠 Comandos de Desenvolvimento

- `npm start`: Alerta rápido (focado em novidades).
- `npm run gui`: Painel administrativo e configuração de WhatsApp.
- `node agenda.js sync`: Sincronização completa da base.
- GitHub Actions: `.github/workflows/scheduler.yml` agenda `daily` e `weekly`, e aceita `workflow_dispatch` para `sync`.

## 📦 Padrões de Commit

- Use mensagens claras (ex: `feat: adiciona verificação de mês vigente no sync`).
- Não inclua o arquivo `.env` ou o banco de dados `sesc-bot.db` nos commits, a menos que seja uma estrutura inicial.
- Ao trabalhar no workflow do GitHub Actions, trate o artifact do `sesc-bot.db` como estado serializado e evite qualquer proposta que introduza concorrência entre jobs.

---
*Atualizado em: 23 de Março de 2026*
