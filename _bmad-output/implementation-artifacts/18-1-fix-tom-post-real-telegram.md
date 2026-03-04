# Story 18.1: Fix TOM Aplicado no Post Real do Telegram

Status: done

## Story

As a operador de grupo,
I want que o tom de voz configurado seja aplicado nas postagens reais do Telegram,
So that as mensagens enviadas reflitam a identidade e persona do meu grupo.

## Acceptance Criteria

1. **Given** um grupo tem `copy_tone_config` configurado no banco (tabela `groups`, coluna JSONB)
   **When** o job de postagem (`post-bets`) é executado pelo scheduler
   **Then** o `toneConfig` é carregado do banco via query (assim como o `previewService.js` faz)
   **And** o `toneConfig` é passado para `formatBetMessage()` em cada bet

2. **Given** `toneConfig` contém campos como `tone`, `persona`, `examplePost`, `customRules`
   **When** `formatBetMessage()` recebe o `toneConfig`
   **Then** a chamada ao LLM (`generateBetCopy()`) inclui o tom no prompt
   **And** a copy gerada reflete o tom configurado

3. **Given** um grupo NÃO tem `copy_tone_config` configurado
   **When** o job de postagem executa
   **Then** comportamento atual é mantido (template padrão sem LLM) — sem regressão

4. **Given** a copy é gerada com tom e enviada ao Telegram
   **When** comparada com o resultado do Preview para o mesmo jogo
   **Then** o tom é consistente entre Preview e post real

## Tasks / Subtasks

- [x] Task 1: Carregar toneConfig do banco em `runPostBets()` (AC: #1)
  - [x] 1.1: Em `bot/jobs/postBets.js`, no início de `runPostBets()`, adicionar query ao banco para carregar `copy_tone_config` quando `toneConfig` do `botCtx` é null
  - [x] 1.2: Reutilizar o mesmo padrão de `previewService.js:loadToneConfig()` — query à tabela `groups` filtrando por `groupId`
- [x] Task 2: Garantir que `toneConfig` é passado para `formatBetMessage()` (AC: #2)
  - [x] 2.1: Verificar que `formatBetMessage()` já recebe e usa `toneConfig` corretamente (já funciona — o problema é que chega null)
- [x] Task 3: Testes unitários (AC: #3, #4)
  - [x] 3.1: Teste: grupo COM `copy_tone_config` → `toneConfig` carregado e passado para `formatBetMessage`
  - [x] 3.2: Teste: grupo SEM `copy_tone_config` → comportamento padrão mantido (toneConfig = null)
  - [x] 3.3: Teste: `botCtx` com `groupConfig.copyToneConfig` já presente → NÃO faz query extra (multi-tenant path mantido)

## Dev Notes

### Bug Root Cause

O singleton scheduler (`server.scheduler.js`) chama `runPostBets()` **sem** `botCtx`:

```javascript
// server.scheduler.js:218 — scheduled posting (BROKEN)
await withExecutionLogging('post-bets', () => runPostBets(true, { postTimes: currentSchedule?.times, currentPostTime: time }));

// server.scheduler.js:305 — manual post-now (BROKEN)
await withExecutionLogging('post-bets-manual', () => runPostBets(true, { postTimes: currentSchedule?.times }));
```

Em `postBets.js:501`, o toneConfig fica null:
```javascript
const toneConfig = botCtx?.groupConfig?.copyToneConfig || null;
```

O factory scheduler (multi-tenant) funciona corretamente porque passa `botCtx`:
```javascript
// server.scheduler.js:400 — factory scheduler (WORKS)
await withExecutionLogging('post-bets', () => runPostBets(true, { ..., botCtx: botCtx || { groupId } }));
```

### Fix Strategy — Carregar do Banco (Padrão Preview)

**NÃO** alterar o scheduler para passar botCtx — isso seria um workaround frágil. Em vez disso, fazer `runPostBets()` carregar o toneConfig diretamente do banco quando não vier via `botCtx`, **exatamente como `previewService.js` faz**.

Referência de implementação correta (`previewService.js:26-39`):
```javascript
async function loadToneConfig(groupId) {
  const { data, error } = await supabase
    .from('groups')
    .select('copy_tone_config')
    .eq('id', groupId)
    .single();
  if (error) {
    logger.warn('[previewService] Failed to load tone config', { groupId, error: error.message });
    return null;
  }
  return data?.copy_tone_config || null;
}
```

### Implementation Approach

Em `bot/jobs/postBets.js`, na função `runPostBets()` (linha ~496-501):

**Antes:**
```javascript
const toneConfig = botCtx?.groupConfig?.copyToneConfig || null;
```

**Depois:**
```javascript
let toneConfig = botCtx?.groupConfig?.copyToneConfig || null;
if (!toneConfig && groupId) {
  // Load from DB like previewService does — ensures tone is always applied
  const { data, error } = await supabase
    .from('groups')
    .select('copy_tone_config')
    .eq('id', groupId)
    .single();
  if (!error && data?.copy_tone_config) {
    toneConfig = data.copy_tone_config;
    logger.info('[postBets] Loaded toneConfig from DB', { groupId });
  }
}
```

### Key Files

| File | Action | Lines |
|------|--------|-------|
| `bot/jobs/postBets.js` | **MODIFY** — add DB fallback for toneConfig in `runPostBets()` | ~496-501 |
| `bot/services/previewService.js` | **REFERENCE ONLY** — pattern for loading toneConfig from DB | 26-39 |
| `bot/server.scheduler.js` | **NO CHANGE** — the fix is in postBets.js | — |

### Architecture Compliance

- Pattern: `{ success, data/error }` — não se aplica nesta mudança (query simples ao banco)
- Supabase: usar `lib/supabase.js` (já importado em postBets.js)
- Logging: usar `lib/logger.js` (já importado em postBets.js)
- Multi-tenant: query filtrada por `groupId` ✅
- Não criar funções novas desnecessárias — a query é inline e simples

### Testing Strategy

- Vitest/Jest mocks de `supabase.from('groups').select().eq().single()`
- Mock de `generateBetCopy` para verificar que recebe toneConfig
- Cobrir 3 cenários: com botCtx.toneConfig, sem botCtx mas com DB config, sem nenhum config

### References

- [Source: bot/jobs/postBets.js:496-501] — onde toneConfig é lido
- [Source: bot/jobs/postBets.js:182] — onde toneConfig é usado no gate do LLM
- [Source: bot/services/previewService.js:26-39] — pattern correto de carregar do DB
- [Source: bot/server.scheduler.js:218,305] — chamadas sem botCtx (singleton)
- [Source: bot/server.scheduler.js:400,441] — chamadas com botCtx (factory)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Completion Notes List

- Added DB fallback for toneConfig in `runPostBets()` — when `botCtx.groupConfig.copyToneConfig` is null, loads `copy_tone_config` from `groups` table (same pattern as `previewService.js`)
- Updated supabase mock in tests to support field-specific responses
- Added 3 new tests covering: DB load, botCtx precedence, null config fallback
- All 690 admin-panel tests + 27 postBets tests pass
- Build passes with no TypeScript errors

### File List

- `bot/jobs/postBets.js` — MODIFIED: added DB fallback for toneConfig loading in runPostBets()
- `bot/jobs/__tests__/postBets.test.js` — MODIFIED: upgraded supabase mock + added 3 toneConfig tests
