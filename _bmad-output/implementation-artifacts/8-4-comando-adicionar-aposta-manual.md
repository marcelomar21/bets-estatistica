# Story 8.4: Comando /adicionar - Aposta Manual

Status: done

## Story

As a operador,
I want adicionar uma aposta manualmente,
So that possa incluir apostas que o sistema não gerou.

## Acceptance Criteria

1. **Given** operador envia `/adicionar` no grupo admin
   **When** bot processa comando
   **Then** inicia fluxo conversacional

2. **Given** fluxo iniciado
   **When** bot pergunta informações
   **Then** coleta: times, mercado, odd, link (opcional)

3. **Given** todas informações coletadas
   **When** bot cria aposta
   **Then** cria com `source: 'manual'`
   **And** status inicial: 'ready' (se tem link) ou 'pending_link'

4. **Given** aposta criada
   **When** confirmar
   **Then** exibe detalhes da aposta criada

## Tasks / Subtasks

- [ ] **Task 1: Criar função de criação manual de aposta** (AC: #3)
  - [ ] 1.1 Adicionar `createManualBet()` em betService.js
  - [ ] 1.2 Campos: home_team, away_team, bet_market, odds, deep_link, source='manual'

- [ ] **Task 2: Implementar comando /adicionar simplificado** (AC: #1, #2, #4)
  - [ ] 2.1 Formato: `/adicionar "Time A vs Time B" "Over 2.5" 1.85 [link]`
  - [ ] 2.2 Parser de argumentos
  - [ ] 2.3 Validações básicas
  - [ ] 2.4 Resposta de confirmação

## Dev Notes

### Formato Simplificado (MVP)

Em vez de fluxo conversacional complexo, usar formato inline:

```
/adicionar "Liverpool vs Arsenal" "Over 2.5 gols" 1.85
/adicionar "Liverpool vs Arsenal" "Over 2.5 gols" 1.85 https://betano.com/...
```

### Regex Pattern

```javascript
const ADICIONAR_PATTERN = /^\/adicionar\s+"([^"]+)"\s+"([^"]+)"\s+([\d.,]+)(?:\s+(https?:\/\/\S+))?$/i;
```

### Campos da Aposta Manual

```javascript
{
  home_team_name: 'Liverpool',  // Extraído do primeiro argumento
  away_team_name: 'Arsenal',
  bet_market: 'Over 2.5 gols',
  odds: 1.85,
  deep_link: 'https://...' || null,
  bet_status: deep_link ? 'ready' : 'pending_link',
  source: 'manual',
  eligible: true,
  bet_category: 'SAFE',
  kickoff_time: null,  // Manual não tem match_id
  match_id: null,
}
```

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/betService.js` | Adicionar `createManualBet()` |
| `bot/handlers/adminGroup.js` | Handler para `/adicionar` |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (2026-01-11)

### Completion Notes List

1. ✅ Criada função `createManualBet()` em betService.js
2. ✅ Campos extras: `source='manual'`, `manual_home_team`, `manual_away_team`
3. ✅ Handler `/adicionar` com parser de argumentos
4. ✅ `/adicionar` sem args mostra help
5. ✅ Validação de odds e link
6. ✅ Status automático: `ready` (com link) ou `pending_link` (sem link)

### File List

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/betService.js` | +75 linhas - `createManualBet()` |
| `bot/handlers/adminGroup.js` | +100 linhas - handler e help |
