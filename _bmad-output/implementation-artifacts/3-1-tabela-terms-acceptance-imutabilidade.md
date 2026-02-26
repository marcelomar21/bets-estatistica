# Story 3.1: Tabela terms_acceptance com Imutabilidade

Status: review

## Story

As a **sistema**,
I want armazenar aceites de termo de forma imutável e auditável,
So that exista registro legal de que cada membro concordou com os termos antes de entrar.

## Acceptance Criteria

1. **Given** a migration 035 é executada
   **When** aplicada no banco
   **Then** cria tabela `terms_acceptance` com colunas: id (UUID PK default gen_random_uuid()), telegram_id (BIGINT NOT NULL), group_id (UUID FK references groups(id)), terms_version (VARCHAR NOT NULL), terms_url (TEXT NOT NULL), accepted_at (TIMESTAMPTZ NOT NULL DEFAULT NOW()), ip_metadata (JSONB)
   **And** cria índice em `(telegram_id, group_id)` para consultas rápidas

2. **Given** a tabela `terms_acceptance` existe
   **When** uma tentativa de UPDATE é feita (via qualquer client, inclusive service_role)
   **Then** o trigger `BEFORE UPDATE` rejeita com `RAISE EXCEPTION` (D2)
   **And** a RLS policy com `USING (false)` para UPDATE bloqueia na camada RLS também

3. **Given** a tabela `terms_acceptance` existe
   **When** uma tentativa de DELETE é feita
   **Then** o trigger `BEFORE DELETE` rejeita com `RAISE EXCEPTION` (D2, NFR-S1)
   **And** a RLS policy com `USING (false)` para DELETE bloqueia na camada RLS também

4. **Given** o `termsService.js` é chamado para registrar aceite
   **When** recebe telegram_id, group_id, terms_version e terms_url
   **Then** faz INSERT na tabela `terms_acceptance` com `accepted_at = NOW()` (P4)
   **And** retorna `{ success: true, data: { id, accepted_at } }`

5. **Given** o `termsService.js` é chamado para verificar se membro já aceitou
   **When** consulta por telegram_id + group_id
   **Then** retorna o registro mais recente de aceite (ou null se nunca aceitou)

## Tasks / Subtasks

- [x] Task 1: Criar migration 035_terms_acceptance.sql (AC: #1, #2, #3)
  - [x] 1.1 Criar arquivo `sql/migrations/035_terms_acceptance.sql`
  - [x] 1.2 CREATE TABLE `terms_acceptance` com todas as colunas (id UUID PK, telegram_id BIGINT NOT NULL, group_id UUID FK, terms_version VARCHAR NOT NULL, terms_url TEXT NOT NULL, accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ip_metadata JSONB DEFAULT '{}')
  - [x] 1.3 CREATE INDEX `idx_terms_acceptance_telegram_group` ON terms_acceptance(telegram_id, group_id)
  - [x] 1.4 ALTER TABLE terms_acceptance ENABLE ROW LEVEL SECURITY
  - [x] 1.5 RLS policies: super_admin SELECT ALL, group_admin SELECT own group_id, authenticated INSERT, UPDATE/DELETE `USING (false)` for all roles
  - [x] 1.6 CREATE FUNCTION `fn_terms_acceptance_immutable()` — RETURNS TRIGGER, RAISE EXCEPTION 'terms_acceptance records are immutable — UPDATE and DELETE are not allowed'
  - [x] 1.7 CREATE TRIGGER `trg_terms_acceptance_no_update` BEFORE UPDATE ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION fn_terms_acceptance_immutable()
  - [x] 1.8 CREATE TRIGGER `trg_terms_acceptance_no_delete` BEFORE DELETE ON terms_acceptance FOR EACH ROW EXECUTE FUNCTION fn_terms_acceptance_immutable()

- [x] Task 2: Aplicar migration no Supabase (AC: #1, #2, #3)
  - [x] 2.1 Aplicar migration 035 via Supabase Management API (curl)
  - [x] 2.2 Verificar tabela criada: consultar terms_acceptance via API — 7 columns confirmed
  - [x] 2.3 Verificar imutabilidade: tentar UPDATE via API e confirmar rejeição — RAISE EXCEPTION confirmed
  - [x] 2.4 Verificar imutabilidade: tentar DELETE via API e confirmar rejeição — RAISE EXCEPTION confirmed

- [x] Task 3: Criar termsService.js (AC: #4, #5)
  - [x] 3.1 Criar `bot/services/termsService.js`
  - [x] 3.2 Implementar `acceptTerms(telegramId, groupId, termsVersion, termsUrl, ipMetadata)` — INSERT + retorna `{ success: true, data: { id, accepted_at } }`
  - [x] 3.3 Implementar `getLatestAcceptance(telegramId, groupId)` — SELECT mais recente por telegram_id + group_id, retorna `{ success: true, data: record | null }`
  - [x] 3.4 Implementar `hasAcceptedVersion(telegramId, groupId, termsVersion)` — verifica se aceitou versão específica, retorna `{ success: true, data: { accepted: boolean, acceptance?: record } }`
  - [x] 3.5 Usar `resolveGroupId()` pattern para multi-tenancy (mesma lógica de memberService)
  - [x] 3.6 Exportar todas as funções via module.exports

- [x] Task 4: Escrever testes unitários para termsService (AC: #4, #5)
  - [x] 4.1 Criar `__tests__/services/termsService.test.js`
  - [x] 4.2 Testar `acceptTerms` — insere registro e retorna id + accepted_at
  - [x] 4.3 Testar `acceptTerms` — falha no DB retorna `{ success: false, error }`
  - [x] 4.4 Testar `getLatestAcceptance` — retorna registro mais recente
  - [x] 4.5 Testar `getLatestAcceptance` — retorna null quando não existe aceite
  - [x] 4.6 Testar `hasAcceptedVersion` — retorna accepted: true quando versão existe
  - [x] 4.7 Testar `hasAcceptedVersion` — retorna accepted: false quando versão não existe
  - [x] 4.8 Testar `resolveGroupId` — usa config.membership.groupId como fallback

- [x] Task 5: Validação completa
  - [x] 5.1 `npm test` no bot — 924 testes passam (45 suites)
  - [x] 5.2 `cd admin-panel && npm test` — 578 testes passam (53 suites)
  - [x] 5.3 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Decisão Arquitetural D2: Imutabilidade em Profundidade

A tabela `terms_acceptance` é append-only por exigência legal (NFR-S1). Duas camadas de proteção:

1. **RLS**: Policies com `USING (false)` para UPDATE/DELETE — bloqueia chamadas via `authenticated` key (admin panel)
2. **Trigger**: `BEFORE UPDATE/DELETE` que faz `RAISE EXCEPTION` — bloqueia inclusive service_role (bot backend)

O trigger é essencial porque o bot usa `service_role` key que bypassa RLS.

### Migration — Numeração

A última migration é **034** (`trial_mode_flag.sql`). Esta story cria migration **035**.

Migrations existentes de referência para patterns:
- `019_multi_tenant.sql` — CREATE TABLE + RLS com get_my_role()/get_my_group_id()
- `021_audit_log.sql` — Append-only audit table
- `001_initial_schema.sql` — Triggers com BEFORE UPDATE

### Service Pattern

Seguir exatamente o pattern de `memberService.js`:

```javascript
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');

function resolveGroupId(groupId) {
  const configuredGroupId = config.membership?.groupId || null;
  if (groupId === undefined) return configuredGroupId;
  if (groupId === null || groupId === '') return null;
  return groupId;
}

async function acceptTerms(telegramId, groupId, termsVersion, termsUrl, ipMetadata = {}) {
  try {
    const effectiveGroupId = resolveGroupId(groupId);
    const { data, error } = await supabase
      .from('terms_acceptance')
      .insert([{
        telegram_id: telegramId,
        group_id: effectiveGroupId,
        terms_version: termsVersion,
        terms_url: termsUrl,
        ip_metadata: ipMetadata
      }])
      .select('id, accepted_at');

    if (error) throw error;
    return { success: true, data: data[0] };
  } catch (err) {
    logger.error('[terms] acceptTerms failed', { telegramId, error: err.message });
    return { success: false, error: { code: 'DB_ERROR', message: err.message } };
  }
}
```

### RLS Policies — Detalhamento

```sql
-- Super admin: pode consultar todos os aceites (auditoria)
CREATE POLICY "terms_acceptance_super_admin_select" ON terms_acceptance
  FOR SELECT USING (public.get_my_role() = 'super_admin');

-- Group admin: pode consultar aceites do seu grupo
CREATE POLICY "terms_acceptance_group_admin_select" ON terms_acceptance
  FOR SELECT USING (group_id = public.get_my_group_id());

-- Bot (service_role via authenticated): pode inserir aceites
CREATE POLICY "terms_acceptance_insert" ON terms_acceptance
  FOR INSERT WITH CHECK (true);

-- NINGUÉM pode atualizar (append-only)
CREATE POLICY "terms_acceptance_no_update" ON terms_acceptance
  FOR UPDATE USING (false);

-- NINGUÉM pode deletar (append-only)
CREATE POLICY "terms_acceptance_no_delete" ON terms_acceptance
  FOR DELETE USING (false);
```

### Funções Existentes Reutilizadas

| Função / Módulo | Arquivo | Propósito |
|-----------------|---------|-----------|
| `supabase` client | lib/supabase.js | Acesso ao banco via service_role |
| `logger` | lib/logger.js | Logging (NUNCA console.log) |
| `config` | lib/config.js | Acesso a config.membership.groupId |
| `resolveGroupId()` | Pattern de memberService.js | Multi-tenant group resolution |
| `get_my_role()` | Migration 020 | RLS helper function |
| `get_my_group_id()` | Migration 020 | RLS helper function |

### Testes — Mock Pattern

Seguir o pattern dos testes de kick-expired e memberService:

```javascript
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

jest.mock('../../lib/config', () => ({
  config: { membership: { groupId: 'test-group-id' } }
}));
```

### Integração com Story 3-2

Esta story cria a infraestrutura (tabela + service). A Story 3-2 integrará o `termsService` no fluxo do `startCommand.js`:
- Antes de `handleInternalTrialStart()`, verificar se membro já aceitou o termo via `hasAcceptedVersion()`
- Se não aceitou, exibir termo com botão inline "Li e aceito"
- Callback handler registra aceite via `acceptTerms()` e prossegue com o fluxo

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1] — AC e requisitos
- [Source: _bmad-output/planning-artifacts/architecture.md#D2] — Decisão de imutabilidade
- [Source: _bmad-output/planning-artifacts/architecture.md#P4] — Pattern insert-only
- [Source: _bmad-output/planning-artifacts/prd.md#NFR-S1] — Requisito de segurança
- [Source: sql/migrations/019_multi_tenant.sql] — Pattern RLS com groups FK
- [Source: sql/migrations/020_rls_helpers.sql] — get_my_role()/get_my_group_id()
- [Source: sql/migrations/021_audit_log.sql] — Append-only table pattern
- [Source: bot/services/memberService.js] — Service pattern { success, data/error }
- [Source: lib/supabase.js] — Supabase client initialization

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Task 1: Created migration 035_terms_acceptance.sql with table, composite index, RLS (5 policies including USING(false) for UPDATE/DELETE), immutability trigger function, and two triggers (BEFORE UPDATE + BEFORE DELETE).
- Task 2: Migration applied to Supabase production. Table schema verified (7 columns). Immutability verified — both UPDATE and DELETE raise exception as expected.
- Task 3: Created termsService.js with 3 functions (acceptTerms, getLatestAcceptance, hasAcceptedVersion) following project service pattern with resolveGroupId multi-tenancy support.
- Task 4: Created 14 unit tests covering all 3 functions including success, DB error, unexpected error, ipMetadata, and groupId fallback scenarios.
- Task 5: 924 bot tests pass (45 suites), 578 admin-panel tests pass (53 suites), TypeScript build clean.

### File List
- `sql/migrations/035_terms_acceptance.sql` — CREATED (table + RLS + triggers)
- `bot/services/termsService.js` — CREATED (acceptTerms, getLatestAcceptance, hasAcceptedVersion)
- `__tests__/services/termsService.test.js` — CREATED (14 tests)
