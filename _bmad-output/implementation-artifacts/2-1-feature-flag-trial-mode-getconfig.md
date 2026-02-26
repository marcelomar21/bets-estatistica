# Story 2.1: Feature Flag TRIAL_MODE e Helper getConfig

Status: done

## Story

As a **Super Admin**,
I want controlar o modo de trial via feature flag sem precisar de redeploy,
So that eu possa ativar o trial interno com segurança e fazer rollback instantâneo se necessário.

## Acceptance Criteria

1. **Given** a tabela `system_config` já existe no banco
   **When** a migration é executada
   **Then** insere registro `TRIAL_MODE` com valor `mercadopago` (fluxo atual mantido como default)

2. **Given** o helper `getConfig()` é chamado com uma key existente
   **When** a key existe em `system_config`
   **Then** retorna o valor correspondente
   **And** o resultado é cacheado em memória para evitar queries repetidas (P2)

3. **Given** o helper `getConfig()` é chamado com uma key inexistente
   **When** a key não existe
   **Then** retorna o valor default passado como segundo parâmetro

4. **Given** o bot inicia ou executa health check
   **When** o cache de config é recarregado
   **Then** lê valores atualizados de `system_config`
   **And** mudança de `TRIAL_MODE` de `mercadopago` para `internal` (ou vice-versa) entra em vigor sem restart

5. **Given** `TRIAL_MODE = 'mercadopago'` (default)
   **When** qualquer fluxo existente é executado
   **Then** o sistema se comporta exatamente como antes — zero regressão

## Tasks / Subtasks

- [x] Task 1: Criar migration para inserir TRIAL_MODE no system_config (AC: #1)
  - [x] 1.1 Criar `sql/migrations/034_trial_mode_flag.sql`
  - [x] 1.2 INSERT `TRIAL_MODE` = `mercadopago` com ON CONFLICT DO NOTHING (idempotente)
  - [x] 1.3 Aplicar migration via Supabase Management API

- [x] Task 2: Criar helper genérico `getConfig()` no bot (AC: #2, #3)
  - [x] 2.1 Criar `bot/lib/configHelper.js` com função `getConfig(key, defaultValue)`
  - [x] 2.2 Implementar cache em memória (Map) com TTL configurável
  - [x] 2.3 Retornar valor do cache se presente e não expirado
  - [x] 2.4 Retornar `defaultValue` se key não encontrada no DB
  - [x] 2.5 Logging via `lib/logger.js` para cache hits/misses (debug level)

- [x] Task 3: Implementar recarga do cache (AC: #4)
  - [x] 3.1 Exportar função `reloadConfig()` que invalida todo o cache
  - [x] 3.2 Chamar `reloadConfig()` no startup do bot (bot/index.js ou similar)
  - [x] 3.3 Chamar `reloadConfig()` no health check job (se existir)

- [x] Task 4: Refatorar `getTrialDays()` para usar `getConfig()` (AC: #5)
  - [x] 4.1 Atualizar `bot/services/memberService.js:getTrialDays()` para usar `getConfig('TRIAL_DAYS', '7')`
  - [x] 4.2 Manter a interface pública idêntica (retorno `{ success, data: { days, source } }`)
  - [x] 4.3 Verificar que todos os callers de `getTrialDays()` continuam funcionando

- [x] Task 5: Escrever testes unitários (AC: #2, #3, #4, #5)
  - [x] 5.1 Testar `getConfig()`: retorno de valor existente, cache hit, default para key inexistente
  - [x] 5.2 Testar `reloadConfig()`: cache é invalidado, próxima chamada busca do DB
  - [x] 5.3 Testar `getTrialDays()` refatorado: funciona igual ao anterior
  - [x] 5.4 Testar cache TTL: valor expirado é rebuscado do DB

- [x] Task 6: Validação completa
  - [x] 6.1 `npm test` no admin-panel — todos os testes passam (nenhum regrediu)
  - [x] 6.2 `npm run build` no admin-panel — TypeScript strict build OK
  - [x] 6.3 Testes do bot (se existirem) passam
  - [x] 6.4 Verificar que `TRIAL_MODE` está no system_config via query

## Dev Notes

### Tabela system_config (já existe — migration 006)

```sql
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by TEXT
);
```

Atualmente só tem `TRIAL_DAYS = '7'`. Story 2-1 adiciona `TRIAL_MODE = 'mercadopago'`.

### getTrialDays() existente (bot/services/memberService.js:1519-1546)

Implementação específica para TRIAL_DAYS com fallback para env var. Será refatorada para usar o helper genérico `getConfig()`.

### Callers de getTrialDays()

- `bot/handlers/startCommand.js` (linhas 480, 533) — usa para calcular trial_end
- `bot/jobs/membership/trial-reminders.js` (linha 42) — usa para calcular dias restantes

### Architecture Pattern P2: getConfig com Cache

```javascript
// ✅ SEMPRE ler via helper centralizado
const { getConfig } = require('../lib/configHelper');
const trialMode = await getConfig('TRIAL_MODE', 'mercadopago');
```

- Cache em memória (Map) com TTL (ex: 5 minutos)
- Reload no startup + health check
- NUNCA ler system_config direto em cada request

### Estratégia de Cache

Usar uma abordagem simples:
- `Map<string, { value: string, expiresAt: number }>` em memória
- TTL padrão: 5 minutos (300_000 ms)
- `reloadConfig()` limpa o Map inteiro
- Thread-safe porque Node.js é single-threaded

### Compatibilidade Zero Regressão (AC #5)

Com `TRIAL_MODE = 'mercadopago'` como default, nenhum fluxo existente é alterado. A feature flag só será lida nas Stories 2-2 a 2-4. Esta story apenas estabelece a infraestrutura.

### Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `sql/migrations/034_trial_mode_flag.sql` | CRIAR |
| `bot/lib/configHelper.js` | CRIAR |
| `bot/services/memberService.js` | MODIFICAR (getTrialDays refactor) |
| `bot/lib/configHelper.test.js` | CRIAR |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#D1] — Feature Flag decision
- [Source: _bmad-output/planning-artifacts/architecture.md#P2] — getConfig pattern
- [Source: sql/migrations/006_system_config.sql] — existing table
- [Source: bot/services/memberService.js#getTrialDays] — existing implementation to refactor

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
