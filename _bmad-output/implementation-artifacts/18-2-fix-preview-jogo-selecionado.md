# Story 18.2: Fix Preview Usa o Jogo Selecionado

Status: done

## Story

As a operador de grupo,
I want que o Preview gere a copy do jogo que eu selecionei,
So that eu possa avaliar como ficará a mensagem antes de postar.

## Acceptance Criteria

1. **Given** operador seleciona um jogo específico na aba de apostas do admin panel
   **When** clica no botão de Preview
   **Then** o `betId` do jogo selecionado é enviado no request para `/api/preview`

2. **Given** endpoint `/api/preview` do bot recebe um `betId` no body
   **When** `generatePreview(groupId, betId)` é chamado
   **Then** `previewService.js` busca exatamente aquela bet pelo ID em vez de chamar `fetchSampleBets()`
   **And** a copy gerada é daquele jogo específico

3. **Given** endpoint `/api/preview` é chamado SEM `betId` (retrocompatibilidade)
   **When** `betId` é `null` ou `undefined`
   **Then** comportamento atual é mantido — busca sample bet aleatória

4. **Given** `betId` fornecido não existe no banco
   **When** query retorna vazio
   **Then** resposta retorna erro 404 com mensagem clara: "Aposta não encontrada"

## Tasks / Subtasks

- [x] Task 1: Atualizar `previewService.js` para aceitar `betId` (AC: #2, #3, #4)
  - [x] 1.1: Adicionar parâmetro opcional `betId` em `generatePreview(groupId, betId)`
  - [x] 1.2: Quando `betId` fornecido, buscar a bet específica por ID em vez de chamar `fetchSampleBets()`
  - [x] 1.3: Quando `betId` não fornecido, manter comportamento atual (retrocompatibilidade)
  - [x] 1.4: Retornar erro `{ success: false, error: { code: 'BET_NOT_FOUND', message: 'Aposta não encontrada' } }` quando betId não existe
  - [x] 1.5: `fetchBetById` retorna `{ data, error }` para distinguir DB_ERROR de BET_NOT_FOUND
- [x] Task 2: Atualizar endpoint `/api/preview` no bot (AC: #2)
  - [x] 2.1: Em `bot/server.js`, extrair `bet_id` do `req.body` (opcional)
  - [x] 2.2: Passar `betId` para `generatePreview(groupId, betId)`
  - [x] 2.3: Retornar status 404 quando previewService retorna BET_NOT_FOUND
- [x] Task 3: Atualizar admin panel API route (AC: #1)
  - [x] 3.1: Em `admin-panel/src/app/api/bets/post-now/preview/route.ts`, extrair `bet_id` do body
  - [x] 3.2: Passar `bet_id` no body do request para o bot
  - [x] 3.3: Corrigir tipo `botPayload` para `Record<string, string | number>`
- [x] Task 4: Atualizar frontend da postagem page (AC: #1)
  - [x] 4.1: Em `admin-panel/src/app/(auth)/postagem/page.tsx`, `handlePreparePreview(betId?)` aceita betId opcional
  - [x] 4.2: `handleRegeneratePreview` passa betId do preview atual
  - [x] 4.3: Adicionar `onPreview` prop ao PostingQueueTable para botão Preview por bet
- [x] Task 5: Testes unitários (AC: #2, #3, #4)
  - [x] 5.1: Teste: `generatePreview(groupId, betId)` com betId válido retorna preview daquela bet
  - [x] 5.2: Teste: `generatePreview(groupId)` sem betId mantém comportamento atual
  - [x] 5.3: Teste: `generatePreview(groupId, 9999)` retorna BET_NOT_FOUND
  - [x] 5.4: Teste: DB error retorna DB_ERROR (não mascara como BET_NOT_FOUND)
  - [x] 5.5: Teste: groupName incluído na resposta
  - [x] 5.6: Teste: betInfo incluído nos resultados

## Dev Notes

### Bug Root Cause

O `previewService.js` não aceita `betId`. O `generatePreview(groupId)` sempre chama `fetchSampleBets(groupId)` que busca qualquer bet do grupo.

### Implementation Approach

**previewService.js** (`generatePreview`):
```javascript
// ANTES:
async function generatePreview(groupId) {
  const rawBets = await fetchSampleBets(groupId);

// DEPOIS:
async function generatePreview(groupId, betId = null) {
  let rawBets;
  if (betId) {
    rawBets = await fetchBetById(groupId, betId);
    if (rawBets.length === 0) {
      return { success: false, error: { code: 'BET_NOT_FOUND', message: 'Aposta não encontrada' } };
    }
  } else {
    rawBets = await fetchSampleBets(groupId);
  }
```

Nova função `fetchBetById(groupId, betId)` — query simples:
```javascript
async function fetchBetById(groupId, betId) {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`id, bet_market, bet_pick, odds, deep_link, reasoning, promovida_manual,
      league_matches!inner ( home_team_name, away_team_name, kickoff_time )`)
    .eq('group_id', groupId)
    .eq('id', betId)
    .limit(1);
  if (error) {
    logger.error('[previewService] Failed to fetch bet by ID', { groupId, betId, error: error.message });
    return [];
  }
  return data || [];
}
```

**bot/server.js** (`/api/preview` endpoint):
```javascript
// Extrair bet_id opcional
const { group_id, bet_id } = req.body || {};
// ...
const result = await generatePreview(group_id, bet_id || null);
// Handle BET_NOT_FOUND → 404
if (!result.success && result.error?.code === 'BET_NOT_FOUND') {
  return res.status(404).json(result);
}
```

**admin-panel route** (`preview/route.ts`):
```typescript
// Extrair bet_id do body e repassar
const betId = body.bet_id;
body: JSON.stringify({ group_id: groupId, ...(betId ? { bet_id: betId } : {}) }),
```

**postagem page** — quando preview é chamado, se há um bet selecionado, enviar `bet_id`. A página já tem `previewBets` com `betId`. Para o `handlePreparePreview`, basta permitir passar um betId opcional.

### Key Files

| File | Action | Description |
|------|--------|-------------|
| `bot/services/previewService.js` | **MODIFY** | Aceitar `betId`, nova `fetchBetById()` |
| `bot/server.js` | **MODIFY** | Extrair `bet_id` do body, handle 404 |
| `admin-panel/src/app/api/bets/post-now/preview/route.ts` | **MODIFY** | Passar `bet_id` ao bot |
| `admin-panel/src/app/(auth)/postagem/page.tsx` | **MODIFY** | Enviar `bet_id` no request |

### Architecture Compliance

- Pattern `{ success, data/error }` — previewService já usa, manter
- Supabase: `lib/supabase.js` — já importado
- Multi-tenant: `fetchBetById` filtrar por `group_id` ✅
- Retrocompatibilidade: `betId = null` mantém comportamento atual

### References

- [Source: bot/services/previewService.js:46-83] — `fetchSampleBets()` atual
- [Source: bot/services/previewService.js:165] — `generatePreview(groupId)` sem betId
- [Source: bot/server.js:110-113] — endpoint só aceita `group_id`
- [Source: admin-panel/src/app/api/bets/post-now/preview/route.ts:50] — body só envia `group_id`
- [Source: admin-panel/src/app/(auth)/postagem/page.tsx:371-374] — `handlePreparePreview` sem betId

## Dev Agent Record

### Agent Model Used
claude-opus-4-6

### Completion Notes List
- Added `fetchBetById(groupId, betId)` to previewService — returns `{ data, error }` to properly distinguish DB errors from BET_NOT_FOUND
- Updated `generatePreview(groupId, betId = null)` to route between fetchBetById and fetchSampleBets
- Bot server.js extracts `bet_id` from request body, returns 404 for BET_NOT_FOUND
- Admin panel route passes `bet_id` through to bot API with correct type `Record<string, string | number>`
- Frontend: `handlePreparePreview(betId?)` accepts optional betId, `handleRegeneratePreview` passes current betId
- Added `onPreview` prop to PostingQueueTable with per-bet Preview button (purple styling)
- Code review found and fixed: fetchBetById was masking DB errors as BET_NOT_FOUND
- 8 unit tests covering all acceptance criteria + edge cases (DB_ERROR, groupName, betInfo)
- E2E validated: add link → add odds → promote → Preview button in queue → preview modal opens with formatted message

### File List
| File | Action |
|------|--------|
| `bot/services/previewService.js` | MODIFIED — added `fetchBetById()`, updated `generatePreview()` signature |
| `bot/server.js` | MODIFIED — extract `bet_id`, pass to generatePreview, handle 404 |
| `bot/services/__tests__/previewService.test.js` | CREATED — 8 tests for betId handling |
| `admin-panel/src/app/api/bets/post-now/preview/route.ts` | MODIFIED — pass bet_id, fix type |
| `admin-panel/src/app/(auth)/postagem/page.tsx` | MODIFIED — handlePreparePreview accepts betId, wired onPreview |
| `admin-panel/src/components/features/posting/PostingQueueTable.tsx` | MODIFIED — added onPreview prop + Preview button |
