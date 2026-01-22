# Story 12.3: Ajustar Health Check

Status: done

## Story

As a operador,
I want receber alertas apenas quando há problemas reais,
so that não seja bombardeado com falsos positivos.

## Contexto do Problema

**Sintoma:** Health check está "apitando direto" - enviando alertas frequentes mesmo quando o sistema funciona normalmente.

**Thresholds atuais (muito agressivos):**
```javascript
const THRESHOLDS = {
  DB_TIMEOUT_MS: 5000,           // OK
  PENDING_LINK_MAX_HOURS: 4,     // ❌ Muito curto para operação manual
  READY_NOT_POSTED_HOURS: 2,     // ❌ Muito curto - postagem é 3x/dia
  POSTED_NO_RESULT_HOURS: 6,     // OK
  POST_SCHEDULE_GRACE_MIN: 10,   // ❌ Pode ser curto para atrasos
};
```

**Problemas identificados:**
1. `PENDING_LINK_MAX_HOURS: 4` - Se operador pedir link às 8h e só responder às 13h, já alerta
2. `READY_NOT_POSTED_HOURS: 2` - Se aposta fica ready às 11h, já alerta às 13h (mas postagem é só às 15h)
3. Health check roda a cada 5 min → pode gerar muitos alertas repetidos

## Acceptance Criteria

1. **AC1:** Threshold `PENDING_LINK_MAX_HOURS` aumentado para 8 horas
2. **AC2:** Threshold `READY_NOT_POSTED_HOURS` aumentado para 6 horas
3. **AC3:** Threshold `POST_SCHEDULE_GRACE_MIN` aumentado para 15 minutos
4. **AC4:** Sistema não envia alertas duplicados do mesmo tipo em menos de 1 hora
5. **AC5:** Logs indicam claramente quando alerta foi suprimido por debounce

## Tasks / Subtasks

- [ ] Task 1: Ajustar thresholds (AC: 1, 2, 3)
  - [ ] 1.1 Alterar `PENDING_LINK_MAX_HOURS` de 4 para 8
  - [ ] 1.2 Alterar `READY_NOT_POSTED_HOURS` de 2 para 6
  - [ ] 1.3 Alterar `POST_SCHEDULE_GRACE_MIN` de 10 para 15

- [ ] Task 2: Implementar debounce de alertas (AC: 4, 5)
  - [ ] 2.1 Criar cache em memória para último alerta por tipo
  - [ ] 2.2 Verificar se alerta do mesmo tipo foi enviado na última hora
  - [ ] 2.3 Se sim, logar "alerta suprimido" e não enviar
  - [ ] 2.4 Se não, enviar alerta e atualizar cache

## Dev Notes

### Arquivo Principal

`bot/jobs/healthCheck.js`

### Código a Modificar

**Thresholds (linha 21-28):**

```javascript
// ANTES
const THRESHOLDS = {
  DB_TIMEOUT_MS: 5000,
  PENDING_LINK_MAX_HOURS: 4,     // Muito curto
  READY_NOT_POSTED_HOURS: 2,     // Muito curto
  POSTED_NO_RESULT_HOURS: 6,
  POST_SCHEDULE_GRACE_MIN: 10,   // Curto
};

// DEPOIS
const THRESHOLDS = {
  DB_TIMEOUT_MS: 5000,
  PENDING_LINK_MAX_HOURS: 8,     // Operador tem dia inteiro
  READY_NOT_POSTED_HOURS: 6,     // Intervalo entre postagens
  POSTED_NO_RESULT_HOURS: 6,
  POST_SCHEDULE_GRACE_MIN: 15,   // Grace maior
  ALERT_DEBOUNCE_MINUTES: 60,    // Novo: debounce
};
```

### Implementação do Debounce

```javascript
// Cache de alertas enviados (em memória)
const alertCache = new Map();

/**
 * Verifica se alerta pode ser enviado (debounce)
 * @param {string} alertType - Tipo do alerta (ex: 'stuck_pending_link')
 * @returns {boolean} - true se pode enviar
 */
function canSendAlert(alertType) {
  const lastSent = alertCache.get(alertType);
  const now = Date.now();
  const debounceMs = THRESHOLDS.ALERT_DEBOUNCE_MINUTES * 60 * 1000;
  
  if (lastSent && (now - lastSent) < debounceMs) {
    logger.debug('Alert debounced', { 
      alertType, 
      lastSentAgo: Math.round((now - lastSent) / 60000) + 'min' 
    });
    return false;
  }
  
  alertCache.set(alertType, now);
  return true;
}
```

### Uso na Função de Alertas

Modificar `runHealthCheck()` para usar debounce antes de enviar:

```javascript
// Antes de enviar cada alerta
if (canSendAlert(alert.check)) {
  // enviar alerta
} else {
  logger.info('Alert suppressed (debounce)', { check: alert.check });
}
```

### Considerações

- Cache em memória é resetado quando bot reinicia (OK para este caso)
- Se precisar persistência, usar Redis ou tabela no BD (overkill para MVP)
- Debounce por tipo de alerta, não global

### References

- [Source: prd-addendum-v3.md#BUG-005]
- [Source: prd-addendum-v3.md#TECH-005]
- [Source: bot/jobs/healthCheck.js]

## Dev Agent Record

### Agent Model Used

_Preencher após implementação_

### Completion Notes List

### File List

- `bot/jobs/healthCheck.js` (modificado)
