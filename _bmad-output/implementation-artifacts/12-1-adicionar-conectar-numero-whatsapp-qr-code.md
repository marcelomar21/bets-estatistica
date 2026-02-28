# Story 12.1: Adicionar e Conectar Número WhatsApp via QR Code

Status: done

## Story

As a super admin,
I want adicionar um número telefônico e conectá-lo ao WhatsApp escaneando QR code,
So that a plataforma tenha um número WhatsApp conectado e pronto para uso.

## Acceptance Criteria

1. **Given** super admin insere um número E.164 válido no sistema
   **When** o serviço WhatsApp inicia conexão Baileys para esse número
   **Then** um QR code é gerado e gravado em `whatsapp_sessions.qr_code`
   **And** admin panel pode exibir o QR code para escaneamento

2. **Given** super admin escaneia o QR code com o celular
   **When** Baileys confirma autenticação (connection.update → open)
   **Then** auth state (creds) é persistido como JSONB em `whatsapp_sessions` (encrypted AES-256-GCM)
   **And** Signal keys são criptografadas (AES-256-GCM) e salvas em `whatsapp_keys`
   **And** status do número muda para `available` em `whatsapp_numbers`

3. **Given** número conectado e ativo
   **When** sistema envia mensagens
   **Then** rate limit de 10 msg/min por número é respeitado (NFR3)

## Tasks / Subtasks

- [ ] Task 1: Create SQL migrations (AC: #1, #2)
  - [ ] 1.1: `042_whatsapp_numbers.sql` — Pool table with status enum, indexes, RLS
  - [ ] 1.2: `043_whatsapp_sessions.sql` — Credentials + QR code storage, RLS
  - [ ] 1.3: `044_whatsapp_keys.sql` — Signal keys granular table with composite unique, RLS
  - [ ] 1.4: Apply migrations via Supabase Management API
  - [ ] 1.5: Verify tables and RLS policies exist

- [ ] Task 2: Create encryption helper (AC: #2)
  - [ ] 2.1: `whatsapp/store/encryptionHelper.js` — AES-256-GCM encrypt/decrypt
  - [ ] 2.2: Format: `version:iv_hex:authTag_hex:ciphertext_hex` (consistent with mtproto_sessions pattern)
  - [ ] 2.3: Unit tests: `whatsapp/__tests__/encryptionHelper.test.js`

- [ ] Task 3: Create auth state store (AC: #2)
  - [ ] 3.1: `whatsapp/store/authStateStore.js` — load/saveCreds/saveKey with encryption
  - [ ] 3.2: Implements Baileys `AuthenticationState` interface via `useDatabaseAuthState(numberId)`
  - [ ] 3.3: Granular key upsert (NOT full blob replacement)
  - [ ] 3.4: Unit tests: `whatsapp/__tests__/authStateStore.test.js`

- [ ] Task 4: Create phone utils (AC: #1)
  - [ ] 4.1: `lib/phoneUtils.js` — validateE164, phoneToJid, jidToPhone
  - [ ] 4.2: Unit tests: `whatsapp/__tests__/phoneUtils.test.js`

- [ ] Task 5: Create BaileyClient wrapper (AC: #1, #2)
  - [ ] 5.1: `whatsapp/client/baileyClient.js` — connect, disconnect, event handlers
  - [ ] 5.2: QR code handling: on `connection.update` with `qr` field → save to whatsapp_sessions.qr_code
  - [ ] 5.3: Auth events: `creds.update` → saveCreds, Baileys key events → saveKey
  - [ ] 5.4: Connection open: update whatsapp_numbers.status → 'available'
  - [ ] 5.5: Unit tests: `whatsapp/__tests__/baileyClient.test.js`

- [ ] Task 6: Create rate limiter (AC: #3)
  - [ ] 6.1: `whatsapp/services/rateLimiter.js` — token bucket, 10 msg/min per number
  - [ ] 6.2: `waitForSlot()` method that awaits when no tokens available
  - [ ] 6.3: Unit tests: `whatsapp/__tests__/rateLimiter.test.js`

- [ ] Task 7: Create number pool service (AC: #1)
  - [ ] 7.1: `whatsapp/pool/numberPoolService.js` — addNumber, listNumbers, getNumberById
  - [ ] 7.2: Status validations (only valid transitions)
  - [ ] 7.3: Unit tests: `whatsapp/__tests__/numberPoolService.test.js`

- [ ] Task 8: Create WhatsApp server entry point (AC: #1, #2)
  - [ ] 8.1: `whatsapp/server.js` — Express health check + Baileys lifecycle
  - [ ] 8.2: Startup: load numbers from DB, init BaileyClient per number
  - [ ] 8.3: Graceful shutdown: SIGTERM handler saves auth state, closes WebSockets

- [ ] Task 9: Update lib/config.js (AC: #3)
  - [ ] 9.1: Add `whatsapp` section with rateLimitMsgsPerMin, healthCheckIntervalMs, etc.
  - [ ] 9.2: Add `WHATSAPP_ENCRYPTION_KEY` to validateConfig

- [ ] Task 10: Validation
  - [ ] 10.1: All Jest tests pass
  - [ ] 10.2: ESLint passes
  - [ ] 10.3: Verify migrations applied correctly

## Dev Notes

### Architecture Patterns (MUST FOLLOW)

**Service Response Pattern** — ALL functions return:
```javascript
return { success: true, data: { ... } };
return { success: false, error: { code: 'ERROR_CODE', message: 'Human message' } };
```

**Imports** — ALWAYS use shared libs:
```javascript
const { supabase } = require('../../lib/supabase');  // NEVER createClient directly
const logger = require('../../lib/logger');            // NEVER console.log
const { config } = require('../../lib/config');        // NEVER hardcode values
```

**Module Exports** — CommonJS named exports:
```javascript
module.exports = { func1, func2, func3 };
```

**Anti-patterns (NEVER do):**
- NEVER instantiate Baileys directly — always via BaileyClient wrapper
- NEVER save auth state to filesystem — use authStateStore (Supabase)
- NEVER log credentials, tokens, or Signal keys
- NEVER use `console.log` — use `lib/logger.js`

### Database Schema Details

**Migration 042: `whatsapp_numbers`**
```sql
CREATE TABLE whatsapp_numbers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,         -- E.164 format (+5511999887766)
  jid TEXT UNIQUE,                            -- Baileys JID (5511999887766@s.whatsapp.net)
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','active','backup','banned','cooldown','connecting')),
  group_id UUID REFERENCES groups(id),        -- NULL if available
  role TEXT DEFAULT NULL
    CHECK (role IS NULL OR role IN ('active','backup')),
  last_heartbeat TIMESTAMPTZ DEFAULT now(),
  banned_at TIMESTAMPTZ,
  allocated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: super admin full access via get_my_role() = 'super_admin'
-- RLS: group admin SELECT only their group's numbers
```

**Migration 043: `whatsapp_sessions`**
```sql
CREATE TABLE whatsapp_sessions (
  number_id UUID PRIMARY KEY REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  creds TEXT,                                 -- AES-256-GCM encrypted JSONB credentials
  qr_code TEXT,                               -- base64 PNG for admin panel display
  connection_state TEXT DEFAULT 'disconnected'
    CHECK (connection_state IN ('disconnected','connecting','open','closed','banned')),
  last_qr_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
-- RLS: super admin full access
```

**Migration 044: `whatsapp_keys`**
```sql
CREATE TABLE whatsapp_keys (
  id BIGSERIAL PRIMARY KEY,
  number_id UUID NOT NULL REFERENCES whatsapp_numbers(id) ON DELETE CASCADE,
  key_type TEXT NOT NULL,                     -- Signal key type (pre-key, sender-key, etc.)
  key_id TEXT NOT NULL,                       -- Unique ID within key type
  key_data TEXT NOT NULL,                     -- AES-256-GCM encrypted key data
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(number_id, key_type, key_id)        -- granular upsert support
);
-- RLS: super admin full access
```

### Encryption Pattern

Follow existing `mtproto_sessions` pattern: `version:iv:authTag:ciphertext`

```javascript
// whatsapp/store/encryptionHelper.js
const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';
const VERSION = 1;

function encrypt(data, keyHex) {
  const key = Buffer.from(keyHex, 'hex');      // 32 bytes
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const jsonStr = JSON.stringify(data);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${VERSION}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(ciphertext, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const [_version, ivHex, authTagHex, encryptedHex] = ciphertext.split(':');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return JSON.parse(decrypted);
}
```

### Baileys Integration

**Library:** `@whiskeysockets/baileys@6.7.0` (latest stable v6)
**Node.js:** 20+ required (existing project uses 20+)

**Key Baileys APIs:**
```javascript
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');

// Connection creation
const sock = makeWASocket({
  auth: { creds, keys },         // from authStateStore
  printQRInTerminal: false,       // we save QR to DB instead
  logger: pinoLogger,             // pino logger compatible
});

// Event: QR code generated (needs scanning)
sock.ev.on('connection.update', (update) => {
  if (update.qr) {
    // Save QR to whatsapp_sessions.qr_code
  }
  if (update.connection === 'open') {
    // Connected successfully — update status to 'available'
  }
  if (update.connection === 'close') {
    const reason = update.lastDisconnect?.error?.output?.statusCode;
    if (reason === DisconnectReason.loggedOut) {
      // 401 → banned/logged out
    } else {
      // Reconnect with backoff
    }
  }
});

// Event: credentials updated
sock.ev.on('creds.update', saveCreds);
```

**Custom Auth State (NOT useMultiFileAuthState):**
Baileys' built-in `useMultiFileAuthState` saves to filesystem. We need a custom implementation that saves to Supabase. The `authStateStore` must return an object compatible with Baileys' `AuthenticationState`:
```javascript
// Returns { state: { creds, keys }, saveCreds }
async function useDatabaseAuthState(numberId) {
  // Load from Supabase
  const creds = await loadCreds(numberId);
  const keys = await loadKeys(numberId);

  return {
    state: {
      creds: creds || initAuthCreds(),
      keys: {
        get: async (type, ids) => { /* load specific keys from whatsapp_keys */ },
        set: async (data) => { /* upsert keys to whatsapp_keys */ },
      },
    },
    saveCreds: async () => {
      await saveCredsToDb(numberId, creds);
    },
  };
}
```

### Rate Limiter Design

Token bucket algorithm, 10 tokens/minute per number:
```javascript
class RateLimiter {
  constructor(maxTokens = 10, windowMs = 60000) {
    this.maxTokens = maxTokens;
    this.windowMs = windowMs;
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async waitForSlot() {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    const waitMs = this.windowMs - (Date.now() - this.lastRefill);
    await new Promise(resolve => setTimeout(resolve, waitMs));
    this.refill();
    this.tokens--;
  }

  refill() {
    const now = Date.now();
    if (now - this.lastRefill >= this.windowMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }
}
```

### File Structure (New Files)

```
whatsapp/
├── server.js                    # Entry point (Express + lifecycle)
├── client/
│   └── baileyClient.js          # BaileyClient wrapper class
├── store/
│   ├── authStateStore.js        # Supabase creds+keys persistence
│   └── encryptionHelper.js      # AES-256-GCM encrypt/decrypt
├── pool/
│   └── numberPoolService.js     # Pool CRUD + status management
├── services/
│   └── rateLimiter.js           # Token bucket rate limiter
└── __tests__/
    ├── encryptionHelper.test.js
    ├── authStateStore.test.js
    ├── phoneUtils.test.js
    ├── baileyClient.test.js
    ├── rateLimiter.test.js
    └── numberPoolService.test.js

lib/
└── phoneUtils.js                # E.164 ↔ JID conversions
```

### Config Extension

Add to `lib/config.js`:
```javascript
whatsapp: {
  enabled: process.env.WHATSAPP_ENABLED === 'true',
  encryptionKey: process.env.WHATSAPP_ENCRYPTION_KEY,
  rateLimitMsgsPerMin: parseInt(process.env.WHATSAPP_RATE_LIMIT || '10', 10),
  healthCheckIntervalMs: 60000,
  qrCodeExpireMs: 60000,
  reconnectBackoffMs: [1000, 5000, 15000, 30000, 60000],
  maxNumbersPerGroup: 3,
  poolWarnThreshold: 5,
},
```

### Testing Requirements

- **Jest** for all whatsapp/ modules — mock Supabase and Baileys
- Test files in `whatsapp/__tests__/` following existing `__tests__/**/*.test.js` pattern
- Mock pattern (from jest.setup.js): mock `../../lib/supabase` and `../../lib/logger`
- Run: `npm test` from project root (jest.config.js already matches `**/__tests__/**/*.test.js`)

### NFRs Covered

| NFR | Requirement | Implementation |
|-----|-------------|----------------|
| NFR3 | 10 msgs/min rate limit | rateLimiter.js token bucket |
| NFR8 | Sessions survive restarts | authStateStore Supabase persistence |
| NFR9 | Auth state synced before confirm | saveCreds/saveKey before Baileys callback |
| NFR11 | WhatsApp isolated from Telegram | Separate whatsapp/ directory and server |
| NFR12 | Signal keys encrypted | AES-256-GCM via encryptionHelper |
| NFR14 | Pool super-admin only | RLS policy get_my_role() = 'super_admin' |
| NFR15 | Credentials never logged | Logger sanitization in authStateStore |
| NFR16 | RLS on all new tables | Migrations 042-044 include RLS |
| NFR21 | Baileys v6+ compatible | @whiskeysockets/baileys@6.7.0 |

### Project Structure Notes

- `whatsapp/` is a NEW top-level directory (sibling to `bot/`, `agent/`, `scripts/`)
- Shared libs remain in `lib/` (phoneUtils.js, config.js additions)
- Admin panel components for Story 1.4 (NOT this story)
- WhatsApp server runs as SEPARATE Render service (not in bets-bot-unified)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Sections 5, 6, 7, 8]
- [Source: _bmad-output/planning-artifacts/prd.md — FR1, FR40, FR41, FR44, NFR3, NFR8-16]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.1]
- [Source: sql/migrations/023_mtproto_sessions.sql — Encryption pattern reference]
- [Source: lib/supabase.js, lib/logger.js, lib/config.js — Shared lib patterns]
- [Source: bot/services/betService.js — Service response pattern reference]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Baileys v6 is ESM-only — created `whatsapp/baileys.js` CJS shim with dynamic import
- Buffer serialization required custom `jsonDeepTransform` because `Buffer.toJSON()` returns `{ type: 'Buffer', data: [byte_array] }` not base64
- jest.mock hoisting requires `mock` prefix for out-of-scope variables

### Completion Notes List
- All 10 tasks implemented and verified
- 110 unit tests pass (6 test suites)
- 0 ESLint errors/warnings
- 3 SQL migrations applied to production DB (042, 043, 044)
- 4 RLS policies verified

### File List
- `sql/migrations/042_whatsapp_numbers.sql` — Pool table, indexes, RLS
- `sql/migrations/043_whatsapp_sessions.sql` — Session/QR/creds, RLS
- `sql/migrations/044_whatsapp_keys.sql` — Signal keys granular, RLS
- `whatsapp/baileys.js` — ESM-to-CJS bridge for Baileys v6
- `whatsapp/store/encryptionHelper.js` — AES-256-GCM encrypt/decrypt
- `whatsapp/store/authStateStore.js` — Supabase auth state for Baileys
- `whatsapp/client/baileyClient.js` — BaileyClient wrapper class
- `whatsapp/pool/numberPoolService.js` — Pool CRUD + status transitions
- `whatsapp/services/rateLimiter.js` — Token bucket rate limiter
- `whatsapp/server.js` — Express entry point + lifecycle
- `lib/phoneUtils.js` — E.164 validation, JID conversions
- `lib/config.js` — Added whatsapp section + WHATSAPP_ENCRYPTION_KEY validation
- `whatsapp/__tests__/encryptionHelper.test.js` — 16 tests
- `whatsapp/__tests__/authStateStore.test.js` — 17 tests
- `whatsapp/__tests__/phoneUtils.test.js` — 15 tests
- `whatsapp/__tests__/baileyClient.test.js` — 14 tests
- `whatsapp/__tests__/rateLimiter.test.js` — 13 tests
- `whatsapp/__tests__/numberPoolService.test.js` — 35 tests
