# Story 12.3: Pool Global — Alocação e Gestão de Números

Status: done

## Story

As a super admin,
I want visualizar o status de todos os números e ter alocação automática de números para grupos,
So that cada grupo tenha sempre 1 número ativo + 2 backups sem gestão manual.

## Acceptance Criteria

1. **Given** super admin acessa a listagem de números
   **When** visualiza o pool global
   **Then** cada número mostra seu status atual (available, active, backup, banned, cooldown)
   **And** mostra a qual grupo está alocado (se aplicável)

2. **Given** um grupo precisa de números WhatsApp
   **When** sistema executa alocação automática
   **Then** 3 números `available` são alocados: 1 como `active`, 2 como `backup`
   **And** se não há números suficientes, aloca o máximo possível e alerta super admin

3. **Given** um número é banido
   **When** sistema detecta o ban
   **Then** número é desalocado do grupo e marcado como `banned` em `whatsapp_numbers`

4. **Given** pool global tem menos que um threshold de números `available`
   **When** sistema verifica estoque periodicamente
   **Then** alerta é enviado ao super admin (via Telegram admin group)

## Tasks / Subtasks

- [ ] Task 1: Add allocation functions to numberPoolService (AC: #1, #2)
  - [ ] 1.1: `allocateToGroup(groupId)` — finds 3 available numbers, assigns 1 active + 2 backup
  - [ ] 1.2: `deallocateFromGroup(numberId)` — removes group assignment, resets to available
  - [ ] 1.3: `getGroupNumbers(groupId)` — lists numbers allocated to a specific group
  - [ ] 1.4: Handle partial allocation (less than 3 available) with warning log
  - [ ] 1.5: Unit tests for allocation, deallocation, and getGroupNumbers

- [ ] Task 2: Add ban handling with deallocation (AC: #3)
  - [ ] 2.1: `handleBan(numberId)` — marks banned, deallocates from group, clears role
  - [ ] 2.2: Unit tests for ban deallocation flow

- [ ] Task 3: Low-stock alert system (AC: #4)
  - [ ] 3.1: `checkPoolHealth()` — counts available numbers vs threshold
  - [ ] 3.2: Returns warning when available count < `poolWarnThreshold` (default 5)
  - [ ] 3.3: Unit tests for pool health check

- [ ] Task 4: API routes for pool management
  - [ ] 4.1: `GET /api/whatsapp/numbers` — list all numbers with group info
  - [ ] 4.2: `POST /api/whatsapp/numbers/:groupId/allocate` — allocate numbers to group
  - [ ] 4.3: `DELETE /api/whatsapp/numbers/:numberId/deallocate` — deallocate number
  - [ ] 4.4: `GET /api/whatsapp/pool/health` — pool health status
  - [ ] 4.5: Unit tests for API routes

- [ ] Task 5: Validation
  - [ ] 5.1: All Jest tests pass
  - [ ] 5.2: ESLint passes

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

### What Already Exists (from Stories 12-1, 12-2)

- `numberPoolService.js` with `addNumber`, `listNumbers`, `getNumberById`, `updateNumberStatus`, `removeNumber`
- VALID_TRANSITIONS state machine in numberPoolService
- `whatsapp_numbers` table with `group_id`, `role`, `status`, `allocated_at` columns
- `config.whatsapp.maxNumbersPerGroup` (3) and `poolWarnThreshold` (5)

### Key Design Decisions

1. **Allocation is transactional**: All 3 numbers must be allocated atomically. If any update fails, roll back all.
2. **Role assignment**: First number gets `role: 'active'`, next two get `role: 'backup'`.
3. **Group column**: `group_id` FK in `whatsapp_numbers` tracks which group owns each number.
4. **Deallocation on ban**: When a number is banned, `group_id` and `role` are set to NULL.
5. **API routes**: Go in `whatsapp/server.js` Express app (not admin-panel Next.js).

### Config Values

From `lib/config.js`:
```javascript
whatsapp: {
  maxNumbersPerGroup: 3,
  poolWarnThreshold: 5,
}
```

### NFRs Covered

| NFR | Requirement | Implementation |
|-----|-------------|----------------|
| NFR5 | Max 3 numbers per group | allocateToGroup enforces maxNumbersPerGroup |

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Number Pool State Machine]
- [Source: _bmad-output/planning-artifacts/prd.md — FR2, FR3, FR4, FR5]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.3]
- [Source: whatsapp/pool/numberPoolService.js — Current pool service]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
