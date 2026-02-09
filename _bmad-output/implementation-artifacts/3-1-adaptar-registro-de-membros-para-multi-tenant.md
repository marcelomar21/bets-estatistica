# Story 3.1: Adaptar Registro de Membros para Multi-tenant

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **sistema**,
I want registrar novos membros associados ao grupo correto,
so that cada influencer tenha seus próprios membros isolados.

## Acceptance Criteria

1. **Given** um bot está rodando associado a um grupo específico (com `GROUP_ID` no env)
   **When** um novo usuário entra no grupo Telegram
   **Then** o membro é registrado na tabela `members` com o `group_id` do bot (FR6)

2. **Given** o bot tem `GROUP_ID` definido no env
   **When** `createTrialMember()` é chamado
   **Then** o `group_id` é lido da variável de ambiente `GROUP_ID` do processo do bot e salvo no registro do membro

3. **Given** `GROUP_ID` **não está definido** no env
   **When** um novo usuário entra no grupo Telegram
   **Then** o bot continua funcionando com comportamento atual (backward compatible) — membro é registrado com `group_id = null`

4. **Given** um membro registrado com `group_id` correto
   **When** RLS policies são aplicadas
   **Then** o membro só é visível para o grupo correto via admin panel (RLS já configurado em migration 020)

5. **Given** um membro já existe com `telegram_id` igual no **mesmo grupo**
   **When** tenta registrar novamente
   **Then** o sistema detecta duplicata e trata conforme lógica existente (reativação, skip, etc.)

6. **Given** multi-tenant está ativo (GROUP_ID definido)
   **When** qualquer query de membro é feita no bot
   **Then** a query filtra por `group_id` além do `telegram_id`, permitindo que o mesmo `telegram_id` exista em grupos diferentes

## Tasks / Subtasks

- [ ] Task 1: Adaptar `lib/config.js` para carregar `GROUP_ID` (AC: #2, #3)
  - [ ] 1.1: Adicionar `groupId: process.env.GROUP_ID || null` na seção de config
  - [ ] 1.2: Adicionar log de inicialização indicando modo multi-tenant ou single-tenant

- [ ] Task 2: Adaptar `bot/services/memberService.js` — funções de query (AC: #1, #5, #6)
  - [ ] 2.1: `getMemberByTelegramId(telegramId)` → adicionar parâmetro opcional `groupId` e filtrar `.eq('group_id', groupId)` quando fornecido
  - [ ] 2.2: `getMemberById(memberId)` → adicionar parâmetro opcional `groupId` para contexto
  - [ ] 2.3: `getMemberByEmail(email)` → adicionar filtro por `groupId` quando fornecido
  - [ ] 2.4: `getMemberBySubscription(subscriptionId)` → manter sem filtro (subscription é única global)
  - [ ] 2.5: `getMemberByPayerId(payerId)` → adicionar filtro por `groupId` quando fornecido

- [ ] Task 3: Adaptar `bot/services/memberService.js` — funções de criação (AC: #1, #2, #3)
  - [ ] 3.1: `createTrialMember()` → adicionar `groupId` ao objeto de insert, ler de `config.membership.groupId` ou parâmetro
  - [ ] 3.2: `createActiveMember()` → adicionar `groupId` ao insert
  - [ ] 3.3: `createTrialMemberMP()` → adicionar `groupId` ao insert
  - [ ] 3.4: Garantir que quando `groupId` é `null`, o insert mantém comportamento anterior (coluna nullable)

- [ ] Task 4: Adaptar `bot/handlers/memberEvents.js` (AC: #1, #2, #3, #5)
  - [ ] 4.1: `handleNewChatMembers(msg)` → extrair `groupId` de `config.membership.groupId` e passar para `processNewMember()`
  - [ ] 4.2: `processNewMember(user, groupId)` → passar `groupId` nas chamadas a `getMemberByTelegramId()` e `createTrialMember()`
  - [ ] 4.3: `sendWelcomeMessage()` → usar `checkout_url` do grupo se multi-tenant (buscar da tabela `groups` pelo `groupId`)
  - [ ] 4.4: `registerMemberEvent()` → sem mudança necessária (herda grupo via member FK)

- [ ] Task 5: Adaptar `bot/server.js` — detecção de novos membros (AC: #1, #3)
  - [ ] 5.1: Atualizar check do chat ID (linha ~126): se `GROUP_ID` definido, buscar `telegram_group_id` da tabela `groups` pelo `GROUP_ID` e comparar; se não definido, usar `config.telegram.publicGroupId` atual
  - [ ] 5.2: Cache do `telegram_group_id` na inicialização para evitar query a cada mensagem

- [ ] Task 6: Adaptar constraint UNIQUE de `telegram_id` (AC: #6)
  - [ ] 6.1: Criar migration para alterar constraint: `DROP INDEX idx_members_telegram_id` (unique) e criar `CREATE UNIQUE INDEX idx_members_telegram_id_group ON members(telegram_id, group_id)` — permitindo mesmo telegram_id em grupos diferentes
  - [ ] 6.2: Manter backward compat: para membros com `group_id = null`, o `telegram_id` continua único nesse subconjunto

- [ ] Task 7: Testes unitários (AC: #1-6)
  - [ ] 7.1: Testar `createTrialMember()` com `groupId` definido → verifica que `group_id` é salvo
  - [ ] 7.2: Testar `createTrialMember()` com `groupId = null` → verifica backward compat
  - [ ] 7.3: Testar `getMemberByTelegramId()` com filtro de `groupId` → retorna apenas membro do grupo correto
  - [ ] 7.4: Testar `getMemberByTelegramId()` sem `groupId` → retorna primeiro match (backward compat)
  - [ ] 7.5: Testar `processNewMember()` com `groupId` → verifica fluxo completo de registro
  - [ ] 7.6: Testar que mesmo `telegram_id` pode existir em dois grupos diferentes
  - [ ] 7.7: Testar inicialização com/sem `GROUP_ID` env → verificar log de modo

- [ ] Task 8: Testar integração manual (AC: #1-4)
  - [ ] 8.1: Bot com `GROUP_ID` definido → novo membro registrado com `group_id` correto
  - [ ] 8.2: Bot sem `GROUP_ID` → novo membro registrado com `group_id = null`
  - [ ] 8.3: Verificar no admin panel que RLS filtra membros por grupo

## Dev Notes

### Contexto Crítico

Esta story adapta o **bot** (repositório `bets-estatistica/`, Node.js CommonJS) para multi-tenant. O admin panel (Next.js) já tem infraestrutura multi-tenant completa (middleware `withTenant()`, `createApiHandler()`, RLS). O foco aqui é **exclusivamente o bot**.

### Arquivos Principais a Modificar

| Arquivo | Tipo de Mudança | Linhas Críticas |
|---------|----------------|----------------|
| `lib/config.js` | Adicionar `groupId` | Seção `membership` |
| `bot/services/memberService.js` | Adicionar `groupId` em CRUD | `createTrialMember()` L221, `getMemberByTelegramId()` L101, `createActiveMember()` L727, `createTrialMemberMP()` L1944 |
| `bot/handlers/memberEvents.js` | Passar `groupId` no fluxo | `handleNewChatMembers()` L25, `processNewMember()` L58, `sendWelcomeMessage()` L233 |
| `bot/server.js` | Detecção de chat correto | L126-128 |
| `sql/migrations/` | Nova migration para constraint | NOVO arquivo |

### Padrões Obrigatórios (do project-context.md)

- **Service Response Pattern:** `{ success: true, data }` / `{ success: false, error: { code, message } }`
- **Logging:** Usar `lib/logger.js` com prefixo `[membership:registration]` — NUNCA `console.log`
- **Supabase:** Usar `lib/supabase.js` singleton — NUNCA instanciar cliente direto
- **Naming:** snake_case para DB, camelCase para JS
- **Error codes:** `MEMBER_NOT_FOUND`, `MEMBER_ALREADY_EXISTS`, `INVALID_MEMBER_STATUS`, `TENANT_NOT_FOUND`
- **State machine:** Validar transições via `canTransition()` antes de atualizar status

### Decisão de Backward Compatibility

A coluna `members.group_id` é **nullable** (migration 019). Quando `GROUP_ID` env não está definido:
- `createTrialMember()` insere com `group_id = null`
- `getMemberByTelegramId()` sem `groupId` → query sem filtro de grupo (comportamento atual)
- Constraint UNIQUE precisa de index parcial para manter unicidade quando `group_id IS NULL`

### Decisão de Constraint UNIQUE

Atualmente `telegram_id` é `UNIQUE` na tabela. Para multi-tenant, o mesmo telegram_id pode existir em grupos diferentes. Nova migration necessária:

```sql
-- Nova migration: 024_members_multitenant_unique.sql
-- Remove UNIQUE constraint do telegram_id individual
ALTER TABLE members DROP CONSTRAINT IF EXISTS members_telegram_id_key;

-- Cria composite unique para multi-tenant
CREATE UNIQUE INDEX idx_members_telegram_group
  ON members (telegram_id, group_id)
  WHERE group_id IS NOT NULL;

-- Mantém unicidade para membros sem grupo (backward compat)
CREATE UNIQUE INDEX idx_members_telegram_null_group
  ON members (telegram_id)
  WHERE group_id IS NULL;
```

### Detecção do Grupo no server.js

Atualmente (server.js L126):
```javascript
if (msg.new_chat_members && msg.chat.id.toString() === config.telegram.publicGroupId) {
```

Depois:
```javascript
// Na inicialização, se GROUP_ID definido, buscar telegram_group_id do grupo
let expectedGroupChatId = config.telegram.publicGroupId; // fallback single-tenant

if (config.membership.groupId) {
  const { data: group } = await supabase
    .from('groups')
    .select('telegram_group_id')
    .eq('id', config.membership.groupId)
    .single();
  if (group) {
    expectedGroupChatId = group.telegram_group_id.toString();
  }
}

// No handler:
if (msg.new_chat_members && msg.chat.id.toString() === expectedGroupChatId) {
```

### Welcome Message com Checkout URL do Grupo

Atualmente `sendWelcomeMessage()` usa `config.membership.checkoutUrl` (env `MP_CHECKOUT_URL`). Para multi-tenant:
- Se `groupId` definido → buscar `checkout_url` da tabela `groups`
- Se `groupId` null → usar `config.membership.checkoutUrl` (fallback)
- Cache da checkout_url na inicialização junto com o telegram_group_id

### Lições do Epic 2 (Story 2.6)

- **Imports devem ser verificados** — cuidado com caminhos relativos no bot
- **Testes devem cobrir shape dos dados** — não apenas happy path
- **Cold start:** Busca inicial no Supabase na inicialização é OK (bot faz isso em outros pontos)
- **Zod v4 usa `.issues`** (não `.errors`) em safeParse

### Lições do Epic 1 (Retrospective)

- **Swarm automático** quando story tem 3+ tasks independentes
- **Ler código real** antes de implementar — não assumir estrutura
- **WITH CHECK constraints** — verificar em migrations novas
- **Code review adversarial** é essencial — encontrou 38 issues no Epic 1

### Project Structure Notes

- Alinhamento com estrutura unificada: bot está em `bot/`, lib compartilhado em `lib/`, migrations em `sql/migrations/`
- Nenhuma variância detectada — seguir padrões existentes
- **NÃO criar novos diretórios** — todas as mudanças são em arquivos existentes + 1 migration nova

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1] — Acceptance criteria e user story
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-002] — Supabase como fonte de verdade
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md] — Middleware de tenant e RLS
- [Source: _bmad-output/project-context.md#Multi-Tenant Rules] — Regras de isolamento por group_id
- [Source: _bmad-output/project-context.md#Critical Implementation Rules] — Padrões obrigatórios
- [Source: sql/migrations/019_multitenant.sql] — Schema multi-tenant (group_id em members)
- [Source: sql/migrations/020_fix_rls_infinite_recursion.sql] — RLS policies para members
- [Source: bot/services/memberService.js] — Serviço de membros atual (2173 linhas)
- [Source: bot/handlers/memberEvents.js] — Handler de novos membros (563 linhas)
- [Source: bot/server.js] — Entry point webhook com detecção de chat
- [Source: lib/config.js] — Configuração atual sem GROUP_ID
- [Source: _bmad-output/implementation-artifacts/2-6-automacao-grupo-telegram-e-convites-via-mtproto.md] — Dev notes do Epic 2 (padrões, lições)
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-02-08.md] — Retrospectiva Epic 1

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

