# Story 12.6: Implementar Comando /simular

Status: done

## Story

As a operador,
I want ver preview da próxima postagem antes de publicar,
so that possa verificar o copy e ajustar se necessário.

## Requisitos

**Comandos:**
- `/simular` - Preview das próximas apostas prontas
- `/simular novo` - Regenera copy (limpa cache)
- `/simular ID` - Preview de aposta específica

## Acceptance Criteria

1. **AC1:** `/simular` mostra preview com copy LLM das apostas prontas
2. **AC2:** Preview mostra mensagem completa como seria postada
3. **AC3:** Preview não altera estado das apostas
4. **AC4:** `/simular novo` regenera copy via LLM
5. **AC5:** `/simular ID` simula aposta específica

## Tasks / Subtasks

- [ ] Task 1: Adicionar imports necessários
  - [ ] 1.1 Importar generateBetCopy de copyService
  - [ ] 1.2 Importar getBetsReadyForPosting de betService
  - [ ] 1.3 Importar getSuccessRate de metricsService

- [ ] Task 2: Criar regex e handler
  - [ ] 2.1 Criar SIMULAR_PATTERN
  - [ ] 2.2 Criar handleSimularCommand
  - [ ] 2.3 Adicionar no dispatcher

- [ ] Task 3: Atualizar copyService para permitir regenerar
  - [ ] 3.1 Exportar função para limpar cache de bet específico

## Dev Notes

### Arquivos a Modificar

- `bot/handlers/adminGroup.js` - adicionar comando
- `bot/services/copyService.js` - exportar clearBetCache

### Regex

```javascript
// Regex to match "/simular [novo|ID]" command (Story 12.6)
const SIMULAR_PATTERN = /^\/simular(?:\s+(novo|\d+))?$/i;
```

### Fluxo

1. Buscar apostas prontas (getBetsReadyForPosting) ou ativas (getActiveBetsForRepost)
2. Para cada aposta, gerar copy com LLM
3. Formatar preview similar à postagem real
4. Enviar mensagem de preview

### Formato de Saída

```
📤 *PREVIEW - PRÓXIMA POSTAGEM*

━━━━━━━━━━━━━━━━━━━━
🔥 *APOSTAS DO DIA - NOITE*

⚽ *Liverpool x Arsenal*
🗓 15/01 às 17:00

📊 *Over 2.5 gols*: Over
💰 Odd: *1.85*

📝 _Os Reds em casa são máquina de gols..._

📈 Taxa de acerto: *72%*

🔗 [Apostar Agora](https://betano.com/...)
━━━━━━━━━━━━━━━━━━━━

⚠️ Este é apenas um preview.
💡 Use `/postar` para publicar ou `/simular novo` para regenerar copy.
```

### References

- [Source: prd-addendum-v3.md#FEAT-009]
- [Source: bot/services/copyService.js]
- [Source: bot/jobs/postBets.js#formatBetMessage]

## Dev Agent Record

### Agent Model Used

_Preencher após implementação_

### Completion Notes List

### File List

- `bot/handlers/adminGroup.js` (modificado)
- `bot/services/copyService.js` (modificado)
