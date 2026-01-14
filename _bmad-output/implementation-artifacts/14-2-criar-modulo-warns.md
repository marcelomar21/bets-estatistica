# Story 14.2: Criar Módulo de Warns (jobWarn.js)

Status: ready-for-dev

## Story

As a sistema,
I want ter funções centralizadas para enviar warns,
so that todos os jobs possam reportar seus resultados de forma consistente.

## Acceptance Criteria

1. **Given** módulo `bot/jobs/jobWarn.js` criado
   **When** importado por outros jobs
   **Then** expõe funções:
   - `sendPostWarn(period, postedBets, upcomingBets, pendingActions)`
   - `sendScrapingWarn(updatedBets, failedBets, statusForNextPost)`
   - `sendAnalysisWarn(newBets)`

2. **Given** função `sendPostWarn` chamada
   **When** formatar mensagem
   **Then** segue formato definido com:
   - Header com período e status
   - Lista de apostas postadas
   - Jogos dos próximos 2 dias agrupados
   - Ações pendentes claras
   - Próximo horário de postagem

3. **Given** função `sendScrapingWarn` chamada
   **When** formatar mensagem
   **Then** mostra:
   - Odds atualizadas (ID, valor anterior → novo)
   - Apostas que falharam
   - Status para próxima postagem

4. **Given** função `sendAnalysisWarn` chamada
   **When** formatar mensagem
   **Then** mostra:
   - IDs das novas análises criadas
   - Total de apostas geradas

5. **Given** qualquer função de warn
   **When** enviar mensagem
   **Then** usa `sendToAdmin()` do telegram.js
   **And** logs são registrados via logger

## Tasks / Subtasks

- [ ] Task 1: Criar arquivo bot/jobs/jobWarn.js (AC: #1)
  - [ ] 1.1: Importar dependências (telegram.js, logger, config)
  - [ ] 1.2: Criar estrutura base do módulo
  - [ ] 1.3: Exportar funções sendPostWarn, sendScrapingWarn, sendAnalysisWarn

- [ ] Task 2: Implementar sendPostWarn (AC: #2)
  - [ ] 2.1: Definir parâmetros (period, postedBets, upcomingBets, pendingActions)
  - [ ] 2.2: Formatar header com período (MANHÃ/TARDE/NOITE)
  - [ ] 2.3: Listar apostas postadas com ID, jogo, mercado, odd
  - [ ] 2.4: Agrupar jogos próximos por dia (HOJE/AMANHÃ)
  - [ ] 2.5: Listar ações pendentes (sem link, sem odds)
  - [ ] 2.6: Calcular e mostrar próximo horário de postagem
  - [ ] 2.7: Chamar sendToAdmin() e logar

- [ ] Task 3: Implementar sendScrapingWarn (AC: #3)
  - [ ] 3.1: Definir parâmetros (updatedBets, failedBets, statusForNextPost)
  - [ ] 3.2: Formatar lista de odds atualizadas (old → new)
  - [ ] 3.3: Listar apostas que falharam
  - [ ] 3.4: Mostrar resumo para próxima postagem
  - [ ] 3.5: Chamar sendToAdmin() e logar

- [ ] Task 4: Implementar sendAnalysisWarn (AC: #4)
  - [ ] 4.1: Definir parâmetro (newBets)
  - [ ] 4.2: Formatar lista de IDs criados
  - [ ] 4.3: Mostrar total de apostas
  - [ ] 4.4: Chamar sendToAdmin() e logar

- [ ] Task 5: Criar helpers internos (AC: #2, #5)
  - [ ] 5.1: Helper formatBetListForWarn(bets) - formata lista de apostas
  - [ ] 5.2: Helper groupBetsByDay(bets) - agrupa por HOJE/AMANHÃ
  - [ ] 5.3: Helper getNextPostTime() - calcula próximo horário
  - [ ] 5.4: Helper getPeriodName(period) - retorna nome em português

## Dev Notes

### Padrão de Implementação

O módulo segue o mesmo padrão de `alertService.js`, mas é focado em warns pós-job com formatação mais rica.

### Interface das Funções

```javascript
/**
 * Send warn after posting job completes
 * @param {string} period - 'morning' | 'afternoon' | 'night'
 * @param {Array} postedBets - Bets that were posted
 * @param {Array} upcomingBets - Bets for next 2 days
 * @param {Array} pendingActions - Actions needed (sem link, sem odds)
 */
async function sendPostWarn(period, postedBets, upcomingBets, pendingActions)

/**
 * Send warn after scraping job completes (Epic 15)
 * @param {Array} updatedBets - [{id, oldOdds, newOdds}]
 * @param {Array} failedBets - [{id, error}]
 * @param {object} statusForNextPost - Summary for next posting
 */
async function sendScrapingWarn(updatedBets, failedBets, statusForNextPost)

/**
 * Send warn after analysis job creates new bets
 * @param {Array} newBets - Array of new bet IDs
 */
async function sendAnalysisWarn(newBets)
```

### Formato Warn Pós-Postagem

```
📤 *POSTAGEM MANHÃ CONCLUIDA* ✅

━━━━━━━━━━━━━━━━━━━━

*APOSTAS POSTADAS:*
✅ #45 Liverpool vs Arsenal - Over 2.5 @ 1.85
✅ #47 Real Madrid vs Barcelona - BTTS @ 1.72

━━━━━━━━━━━━━━━━━━━━

📊 *PROXIMOS 2 DIAS*

*HOJE - 14/01:*
⚽ #52 Man City vs Chelsea - 17:00
   🎯 Under 3.5 │ 📈 1.68 │ ✅ Pronta

⚽ #58 Bayern vs Dortmund - 19:30
   🎯 Over 2.5 │ 📈 1.75 │ ⚠️ Sem link

*AMANHA - 15/01:*
⚽ #61 PSG vs Marseille - 21:00
   🎯 BTTS │ 📈 1.82 │ ✅ Pronta

━━━━━━━━━━━━━━━━━━━━

⚠️ *ACOES PENDENTES:*
1. #58 precisa de link → /link 58 URL
2. #63 sem odds → /atualizar odds

💡 Proxima postagem: 15:00
```

### Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/jobs/jobWarn.js` | CRIAR | Novo módulo de warns |

### Dependências

```javascript
const { sendToAdmin } = require('../telegram');
const logger = require('../../lib/logger');
```

### Próximo Horário de Postagem

```javascript
function getNextPostTime() {
  const now = new Date();
  const hour = now.getHours();

  if (hour < 10) return '10:00';
  if (hour < 15) return '15:00';
  if (hour < 22) return '22:00';
  return '10:00 (amanhã)';
}
```

### Project Structure Notes

- Novo arquivo em `bot/jobs/` junto com outros jobs
- Segue convenção de camelCase para funções
- Usa `sendToAdmin()` de `telegram.js` (não alertAdmin)
- Pattern de response não necessário (void functions)

### References

- [Source: bot/services/alertService.js] - Padrão existente de alertas
- [Source: bot/jobs/postBets.js] - Job que usará sendPostWarn
- [Source: bot/telegram.js] - Função sendToAdmin
- [Source: _bmad-output/planning-artifacts/epics.md#story-14.2] - Definição original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/jobs/jobWarn.js (criar)
