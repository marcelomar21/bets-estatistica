# Story 4.2: Distribuir e Redistribuir Apostas (Individual)

Status: ready-for-dev

## Story

As a **Super Admin**,
I want distribuir uma aposta do pool para um grupo ou redistribuir entre grupos,
So that eu atenda pedidos de influencers rapidamente sem mexer no banco.

## Acceptance Criteria

1. **Given** Super Admin seleciona uma aposta do pool (sem grupo)
   **When** clica em "Distribuir" e seleciona um grupo destino
   **Then** a API `POST /api/bets/[id]/distribute` atribui `group_id` do grupo selecionado à aposta (FR15)
   **And** `bet_status` é setado para `ready`
   **And** retorna `{ success: true }` com dados atualizados
   **And** a aposta sai do pool e aparece na lista do grupo

2. **Given** Super Admin seleciona uma aposta já distribuída para o Grupo A
   **When** clica em "Redistribuir" e seleciona Grupo B
   **Then** a API atualiza `group_id` para Grupo B e `bet_status = 'ready'` (FR16, D4)
   **And** registra em `audit_log`: admin_id, bet_id, old_group_id (A), new_group_id (B) (FR17, NFR-S4, P5)
   **And** a aposta aparece na lista do Grupo B

3. **Given** Super Admin tenta distribuir para um grupo inválido ou inexistente
   **When** a API recebe o request
   **Then** retorna `{ success: false, error: 'Group not found' }` com status 400
   **And** a aposta não é alterada

4. **Given** a API `POST /api/bets/[id]/distribute` é chamada
   **When** processada
   **Then** usa `createApiHandler` com verificação de role `super_admin` (P7)
   **And** valida input com Zod (betId: number, groupId: UUID)

## Tasks / Subtasks

- [ ] Task 1: Criar API route POST /api/bets/[id]/distribute (AC: #1, #2, #3, #4)
  - [ ] 1.1 Criar `admin-panel/src/app/api/bets/[id]/distribute/route.ts`
  - [ ] 1.2 Usar `createApiHandler` com `allowedRoles: ['super_admin']` (P7)
  - [ ] 1.3 Validar input com Zod: `groupId` (UUID obrigatório)
  - [ ] 1.4 Validar que o grupo existe via query em `groups` table
  - [ ] 1.5 Buscar aposta atual para obter `old_group_id`
  - [ ] 1.6 UPDATE `suggested_bets`: set `group_id`, `bet_status = 'ready'`, `distributed_at = now()` (D4)
  - [ ] 1.7 Se redistribuição (old_group_id != null): INSERT em `audit_log` com old/new group_id (P5)
  - [ ] 1.8 Retornar `{ success: true, data: { bet, redistributed: boolean } }`

- [ ] Task 2: Criar DistributeModal component (AC: #1, #2)
  - [ ] 2.1 Criar `admin-panel/src/components/features/bets/DistributeModal.tsx`
  - [ ] 2.2 Modal com select de grupo destino (carregar grupos via prop)
  - [ ] 2.3 Botão "Distribuir" que chama API POST /api/bets/[id]/distribute
  - [ ] 2.4 Mostrar loading, sucesso e erro via toast

- [ ] Task 3: Integrar DistributeModal na BetTable (AC: #1, #2)
  - [ ] 3.1 Adicionar botão "Distribuir" nas ações da BetTable (super_admin only)
  - [ ] 3.2 Abrir DistributeModal ao clicar
  - [ ] 3.3 Após distribuição bem-sucedida, refetch da lista de apostas
  - [ ] 3.4 Na bets page.tsx, passar callback onDistribute e groups para BetTable

- [ ] Task 4: Escrever testes unitários (AC: #1-#4)
  - [ ] 4.1 Testar: POST /api/bets/[id]/distribute com aposta do pool → distribui para grupo
  - [ ] 4.2 Testar: POST /api/bets/[id]/distribute com aposta já distribuída → redistribui + audit_log
  - [ ] 4.3 Testar: POST /api/bets/[id]/distribute com grupo inválido → 400
  - [ ] 4.4 Testar: POST /api/bets/[id]/distribute sem ser super_admin → 403
  - [ ] 4.5 Testar: DistributeModal renderiza e interage corretamente

- [ ] Task 5: Validação completa
  - [ ] 5.1 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 5.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Padrão P5: Redistribuição — Atomic Update + Audit

```javascript
async function redistributeBet(betId, newGroupId, adminId) {
  // 1. Buscar estado atual
  const { data: bet } = await supabase
    .from('suggested_bets')
    .select('group_id')
    .eq('id', betId)
    .single();

  const oldGroupId = bet.group_id;

  // 2. Atualizar aposta
  await supabase
    .from('suggested_bets')
    .update({ group_id: newGroupId, bet_status: 'ready', distributed_at: new Date().toISOString() })
    .eq('id', betId);

  // 3. Audit log (somente redistribuição)
  if (oldGroupId) {
    await supabase.from('audit_log').insert({
      table_name: 'suggested_bets',
      record_id: betId.toString(),
      action: 'redistribute',
      changed_by: adminId,
      changes: { old_group_id: oldGroupId, new_group_id: newGroupId }
    });
  }

  return { success: true, data: { betId, oldGroupId, newGroupId } };
}
```

### Decision D4: Redistribuição

- UPDATE `group_id` + SET `bet_status = 'ready'`
- Dados de postagem: NÃO limpar (sobrescritos quando bot posta no novo grupo)
- Mensagem antiga: fica no grupo antigo (sem delete via Telegram API)
- Audit: registrar em `audit_log`

### Padrão P7: API Route Checklist

```typescript
import { createApiHandler } from '@/middleware/api-handler';
import { z } from 'zod';

const distributeSchema = z.object({
  groupId: z.string().uuid(),
});

export const POST = createApiHandler(
  async (req, context) => {
    const { supabase, userId } = context;
    const body = distributeSchema.parse(await req.json());
    // ... implementation
  },
  { allowedRoles: ['super_admin'] }
);
```

### audit_log table (Migration 021)

```
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
table_name TEXT NOT NULL
record_id UUID NOT NULL
action TEXT NOT NULL
changed_by UUID NOT NULL
changes JSONB NOT NULL
created_at TIMESTAMPTZ DEFAULT now()
```

Note: `record_id` is UUID type. `suggested_bets.id` is BIGSERIAL (number). Need to cast bet ID to string for record_id, or use `.toString()`. Check what the audit_log RLS policy expects for `changed_by` — it should be `auth.uid()` which matches `context.user.id` from createApiHandler.

### Existing Bet API Patterns

Existing API routes for bets at `/api/bets/[id]/`:
- `odds/route.ts` — PATCH, uses `createApiHandler`, super_admin only
- `link/route.ts` — PATCH, uses `createApiHandler`, super_admin only
- `promote/route.ts` — POST, super_admin only
- `remove/route.ts` — POST, super_admin only

Follow the same pattern for distribute.

### DistributeModal Pattern

Follow existing modal patterns:
- `OddsEditModal.tsx` — edit odds for a bet
- `LinkEditModal.tsx` — edit deep link for a bet
- `BulkOddsModal.tsx` — bulk odds update

These use: props `isOpen`, `onClose`, `onSuccess`, form state, fetch call, toast notifications.

### groups list

The bets page already fetches groups list for the filter. Pass this same list to DistributeModal.

### Existing Files (context)

| File | Purpose |
|------|---------|
| `admin-panel/src/app/api/bets/route.ts` | GET bets list (Story 4-1 modified) |
| `admin-panel/src/app/api/bets/[id]/odds/route.ts` | PATCH odds (follow pattern) |
| `admin-panel/src/components/features/bets/BetTable.tsx` | Table with actions (Story 4-1 modified) |
| `admin-panel/src/components/features/bets/OddsEditModal.tsx` | Modal pattern reference |
| `admin-panel/src/app/(auth)/bets/page.tsx` | Page orchestration, groups state |
| `admin-panel/src/types/database.ts` | Types (BetCounters updated in 4-1) |

### Previous Story Learnings (Story 4-1)

- `__pool__` filter pattern works well for filtering null group_id
- BetCounters type extension is straightforward
- Component test updates needed when changing badge display
- Build catches all type errors immediately

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.2] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#D4] — Redistribuição decision
- [Source: _bmad-output/planning-artifacts/architecture.md#P5] — Redistribuição atomic update + audit
- [Source: _bmad-output/planning-artifacts/architecture.md#P7] — API route checklist
- [Source: sql/migrations/021_audit_log.sql] — audit_log schema
- [Source: admin-panel/src/app/api/bets/[id]/odds/route.ts] — API pattern reference
- [Source: admin-panel/src/components/features/bets/OddsEditModal.tsx] — Modal pattern reference

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
