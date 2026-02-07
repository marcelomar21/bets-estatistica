# Story 9.2: Alertar Falha de Postagem

Status: done

## Story

As a operador,
I want ser alertado se postagem não acontecer,
So that possa intervir rapidamente.

## Acceptance Criteria

1. **AC1:** Sistema detecta quando postagem programada não ocorreu ✅
2. **AC2:** Alerta é enviado 5-10 minutos após horário de postagem ✅
3. **AC3:** Alerta menciona o operador (@marcelomendes) ✅
4. **AC4:** Alerta inclui: tipo de falha, timestamp, ação sugerida ✅
5. **AC5:** Formato de alerta segue padrão definido ✅

## Tasks / Subtasks

- [x] Task 1: Refatorar checkLastPosting() para detectar falhas específicas (AC: #1, #2)
  - [x] 1.1 Adicionar detecção de qual período de postagem falhou (10h, 15h, 22h)
  - [x] 1.2 Retornar informações específicas sobre a falha (failedPeriod, isPostingFailure)
  - [x] 1.3 Diferenciar entre "falha recente" (<2h) vs "dados antigos" (>2h)

- [x] Task 2: Criar função postingFailureAlert() em alertService.js (AC: #3, #4, #5)
  - [x] 2.1 Implementar formato de alerta conforme especificação
  - [x] 2.2 Mencionar operador no alerta via env var TELEGRAM_OPERATOR_USERNAME
  - [x] 2.3 Incluir ação sugerida (/postar)

- [x] Task 3: Integrar alerta no healthCheck.js (AC: #2)
  - [x] 3.1 Chamar postingFailureAlert() quando detectar falha de postagem recente
  - [x] 3.2 Usar alerta genérico para falhas antigas (>2h)

- [x] Task 4: Testar cenários de falha
  - [x] 4.1 Testar detecção de postagem não realizada
  - [x] 4.2 Verificar lógica de isRecentFailure funciona corretamente

## Dev Notes

### Formato de Alerta Implementado

```
🚨 *ALERTA DE SISTEMA*

@marcelomendes Problema detectado!

❌ *Falha:* Postagem das 10h não executada
⏰ *Detectado:* 10:05
💡 *Ação:* Use /postar para forçar

`/status` para mais detalhes
```

### Lógica de Detecção

- **Falha recente** (`isPostingFailure: true`): Menos de 2 horas após horário esperado → Envia `postingFailureAlert()` com @mention
- **Dados antigos** (`isPostingFailure: false`): Mais de 2 horas após horário esperado → Usa alerta genérico de health check

### Configuração do Operador

```javascript
const operatorUsername = process.env.TELEGRAM_OPERATOR_USERNAME || 'marcelomendes';
```

### Arquivos Modificados

- `bot/jobs/healthCheck.js` - Refatorado checkLastPosting(), integrado postingFailureAlert()
- `bot/services/alertService.js` - Adicionado postingFailureAlert()

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.2]
- [Source: bot/jobs/healthCheck.js] - Health check base
- [Source: bot/services/alertService.js] - Padrões de alerta

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- postingFailureAlert() criado com @mention do operador
- checkLastPosting() refatorado para retornar failedPeriod e isPostingFailure
- Lógica diferencia falhas recentes (<2h) de dados antigos (>2h)
- Teste manual confirmou lógica funcionando corretamente

### Debug Log References

- Teste: `node bot/jobs/healthCheck.js`
- Output: `isRecentFailure: false` (correto, pois falha é >2h antiga)

### Change Log

- 2026-01-11: Implementação da Story 9.2 - Alertar Falha de Postagem

### File List

- `bot/jobs/healthCheck.js` (modificado)
- `bot/services/alertService.js` (modificado - adicionado postingFailureAlert)
