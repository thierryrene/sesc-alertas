---
description: Workflow Otimizado para Evolução do SESC Alertas com Antigravity
---

# Workflow de Evolução do SESC Alertas

Este documento descreve as etapas otimizadas para trabalharmos em conjunto (Antigravity + Usuário) na evolução da aplicação **SESC Alertas - Extrator de Eventos**. 

Sempre que formos iniciar uma nova funcionalidade, refatoração ou correção, seguiremos as etapas abaixo para manter a consistência e segurança do projeto.

## 1. Contextualização e Validação do Estado Atual
Antes de qualquer modificação:
**Ação do Agente**:
- Verificar se o banco de dados `sesc-bot.db` está íntegro usando consultas no `database.js`.
- Revisar as variáveis de ambiente baseadas no `.env.example`.
- Rodar a aplicação (`npm run gui`) internamente se for necessário simular a interface gráfica ou validar APIs Express em background.

## 2. Implementação Focada (Feature Driven)
Para cada pedido do usuário:
1. **Entender a Arquitetura**: 
   - `index.js`: Lógica core e integração Gemini/Telegram.
   - `server.js` + `views/`: Interface gráfica gerenciável e APIs (Dashboards).
   - `database.js`: Acesso ao banco.
2. **Alterar no Componente Correto**: Restringir a modificação modular para não introduzir "Side Effects".

## 3. Padronização Visual e Formatação
Sempre que criarmos novos scripts secundários (como CLIs, agendadores ou automações paralelas), devemos garantir que o padrão visual e de marcação das mensagens (Emojis, tags HTML, metadados como idade, categoria, preço, descrição) seja **uma cópia exata** do modelo de renderização consolidado no arquivo principal (`index.js`). A experiência do usuário ao ler os alertas deve ser rigorosamente a mesma.

## 4. Validação
Ao invés de testes automatizados, toda nova Feature ligada à IA e Prompts do Gemini será testada provendo um script iterativo de validação ou rodando a função de forma isolada, economizando chamadas da API de produção.

## 5. Atualização da Documentação Interna (GUIA e README)
**Ação do Agente**:
- Sempre que alterarmos esquemas no `.env` (ex: novas categorias de filtros) ou adicionarmos rotas no `server.js`, deveremos editar o `GUIA_V0.7.0.md` (ou atualizá-lo para a versão adequada) e refletir no `README.md`.

## 6. Passos Práticos Automatizáveis
Sempre que a funcionalidade for validada:
// turbo
1. Instalar possíveis bibliotecas novas utilizando sempre o **pnpm** (ex: `pnpm install <pacote>`).
2. Executar scripts sempre com **pnpm** (ex: `pnpm start`, `pnpm run gui`).
3. Validar o linting/sintaxe dos arquivos atualizados rodando validação via node.
