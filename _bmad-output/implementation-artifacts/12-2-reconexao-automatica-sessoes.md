# Story 12.2: Reconexão Automática de Sessões

Status: done

## Story

As a super admin,
I want que o sistema reconecte automaticamente todas as sessões WhatsApp após restart do serviço,
So that os números permaneçam conectados 24/7 sem re-escanear QR code.

## Acceptance Criteria

1. **Given** serviço WhatsApp reinicia (deploy ou crash)
   **When** o processo inicia
   **Then** todas as sessões com auth state válido em `whatsapp_sessions` são reconectadas automaticamente
   **And** reconexão completa em menos de 60 segundos por número (NFR4)

2. **Given** múltiplos números conectados (ex: 10+)
   **When** serviço está rodando
   **Then** cada número mantém sua própria conexão WebSocket independente (FR43)
   **And** reconexão usa backoff exponencial (max 5 tentativas) (NFR10)

3. **Given** serviço recebe SIGTERM
   **When** shutdown é iniciado
   **Then** auth state de todas as sessões é salvo antes de fechar WebSockets (graceful shutdown)

## Tasks / Subtasks

- [ ] Task 1: Add max reconnect attempts to BaileyClient (AC: #2)
  - [ ] 1.1: Add `maxReconnectAttempts` config (default 5, from NFR10)
  - [ ] 1.2: Stop reconnecting after max attempts, log error with alert
  - [ ] 1.3: Update `_handleConnectionUpdate` to check attempt limit
  - [ ] 1.4: Update unit tests for max reconnect behavior

- [ ] Task 2: Parallel reconnection in server.js startup (AC: #1)
  - [ ] 2.1: Change `initClients` to use `Promise.allSettled` for parallel connect
  - [ ] 2.2: Only reconnect numbers with valid auth state (creds exist in whatsapp_sessions)
  - [ ] 2.3: Skip numbers in 'banned' status during startup
  - [ ] 2.4: Log reconnection timing per number (NFR4: <60s)
  - [ ] 2.5: Update unit tests for parallel init and filtering

- [ ] Task 3: Improve graceful shutdown (AC: #3)
  - [ ] 3.1: Ensure `saveCreds` is called before disconnect in BaileyClient
  - [ ] 3.2: Add shutdown timeout (30s max wait) to prevent hanging
  - [ ] 3.3: Update unit tests for shutdown flow

- [ ] Task 4: Add connection health tracking (AC: #1, #2)
  - [ ] 4.1: Update `last_heartbeat` in whatsapp_numbers on successful reconnect
  - [ ] 4.2: Add `reconnect_count` tracking to BaileyClient
  - [ ] 4.3: Expose reconnect stats in health endpoint

- [ ] Task 5: Validation
  - [ ] 5.1: All Jest tests pass
  - [ ] 5.2: ESLint passes
  - [ ] 5.3: Verify reconnection behavior with mocked Baileys

## Dev Notes

### Architecture Patterns (MUST FOLLOW)

**Service Response Pattern** — ALL functions return:
```javascript
return { success: true, data: { ... } };
return { success: false, error: { code: 'ERROR_CODE', message: 'Human message' } };
```

**Imports** — ALWAYS use shared libs:
```javascript
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
```

### What Already Exists (from Story 12-1)

Story 12-1 already implemented the foundation:
- `BaileyClient` class with `connect()`, `disconnect()`, reconnect backoff
- `authStateStore` with `useDatabaseAuthState()` that loads creds/keys from Supabase
- `server.js` with `initClients()`, `shutdown()`, SIGTERM/SIGINT handlers
- `encryptionHelper` for AES-256-GCM encryption
- Rate limiter (token bucket, 10 msg/min)

### Gaps to Fill (This Story)

1. **Max reconnect attempts**: Current BaileyClient reconnects indefinitely. Need max 5 attempts (NFR10) then stop and alert.
2. **Parallel startup**: Current `initClients` connects sequentially in a for loop. Need `Promise.allSettled` for parallel.
3. **Auth state filtering**: Current startup tries to connect ALL non-banned numbers. Should only reconnect numbers with valid creds (skip numbers that never completed QR scan).
4. **Timing metrics**: No timing of reconnection for NFR4 (<60s) compliance.
5. **Heartbeat updates**: `last_heartbeat` is set at insert time but never updated on reconnect.
6. **Shutdown timeout**: No max wait on graceful shutdown — could hang if disconnect fails.

### Config Values

From `lib/config.js` whatsapp section:
```javascript
whatsapp: {
  reconnectBackoffMs: [1000, 5000, 15000, 30000, 60000],
  // Need to add:
  maxReconnectAttempts: 5,
  shutdownTimeoutMs: 30000,
}
```

### NFRs Covered

| NFR | Requirement | Implementation |
|-----|-------------|----------------|
| NFR4 | Reconnect < 60s per number | Timing metric in initClients |
| NFR6 | 24/7 service | Reconnect keeps numbers alive |
| NFR8 | Sessions survive restarts | authStateStore loads from Supabase |
| NFR10 | Max 5 reconnect attempts with backoff | BaileyClient maxReconnectAttempts |
| NFR11 | WhatsApp isolated from Telegram | Separate whatsapp/ directory |

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Baileys Client Lifecycle]
- [Source: _bmad-output/planning-artifacts/prd.md — FR42, FR43, NFR4, NFR6, NFR8, NFR10]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2]
- [Source: whatsapp/client/baileyClient.js — Current reconnect implementation]
- [Source: whatsapp/server.js — Current startup/shutdown implementation]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
