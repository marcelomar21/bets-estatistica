# Story 4.3: Distribuicao em Lote

Status: ready-for-dev

## Story

As a **Super Admin**,
I want distribuir varias apostas do pool para um grupo de uma so vez,
So that eu ganhe tempo quando preciso distribuir multiplas apostas.

## Acceptance Criteria

1. **Given** Super Admin esta na lista de apostas do pool
   **When** seleciona multiplas apostas via checkbox
   **Then** ve botao "Distribuir Selecionadas" habilitado com contagem (ex: "Distribuir 5 apostas")

2. **Given** Super Admin selecionou N apostas e clica em "Distribuir Selecionadas"
   **When** seleciona o grupo destino e confirma
   **Then** a API `POST /api/bets/bulk/distribute` processa todas as apostas selecionadas (FR18)
   **And** cada aposta recebe `group_id` do grupo destino e `bet_status = 'ready'`
   **And** retorna `{ success: true, data: { distributed: N } }`

3. **Given** a distribuicao em lote inclui apostas ja distribuidas (redistribuicao)
   **When** processada
   **Then** cada redistribuicao e registrada individualmente no `audit_log` (NFR-S4, P5)

4. **Given** uma aposta do lote falha ao ser distribuida
   **When** o erro ocorre
   **Then** as demais apostas continuam sendo processadas
   **And** retorna resultado parcial: `{ success: true, data: { distributed: X, failed: Y, errors: [...] } }`

5. **Given** a API `POST /api/bets/bulk/distribute` e chamada
   **When** processada
   **Then** usa `createApiHandler` com verificacao `super_admin` (P7)
   **And** valida input com Zod: betIds (array de numbers), groupId (UUID)

## Tasks / Subtasks

- [ ] Task 1: Criar API route POST /api/bets/bulk/distribute (AC: #2, #3, #4, #5)
  - [ ] 1.1 Criar `admin-panel/src/app/api/bets/bulk/distribute/route.ts`
  - [ ] 1.2 Usar `createApiHandler` com `allowedRoles: ['super_admin']` (P7)
  - [ ] 1.3 Validar input com Zod: `betIds` (array de numbers, min 1, max 50), `groupId` (UUID)
  - [ ] 1.4 Validar que o grupo existe via query em `groups` table
  - [ ] 1.5 Processar sequencialmente: fetch bet → update group_id + bet_status='ready' + distributed_at
  - [ ] 1.6 Para cada redistribuicao (old_group_id != null): INSERT em `audit_log` (P5)
  - [ ] 1.7 Retornar `{ success: true, data: { distributed, redistributed, failed, errors } }`

- [ ] Task 2: Criar BulkDistributeModal component (AC: #1, #2)
  - [ ] 2.1 Criar `admin-panel/src/components/features/bets/BulkDistributeModal.tsx`
  - [ ] 2.2 Modal com select de grupo destino (carregar grupos via prop)
  - [ ] 2.3 Mostrar contagem de apostas selecionadas
  - [ ] 2.4 Botao "Distribuir N apostas" que chama API POST /api/bets/bulk/distribute
  - [ ] 2.5 Mostrar loading, sucesso e erro via toast

- [ ] Task 3: Integrar BulkDistributeModal na bets page (AC: #1)
  - [ ] 3.1 Adicionar botao "Distribuir Selecionadas" na barra de acoes bulk (super_admin only)
  - [ ] 3.2 Abrir BulkDistributeModal ao clicar
  - [ ] 3.3 Apos distribuicao bem-sucedida, refetch da lista + limpar selecao

- [ ] Task 4: Escrever testes unitarios (AC: #1-#5)
  - [ ] 4.1 Testar: POST /api/bets/bulk/distribute com apostas do pool → distribui para grupo
  - [ ] 4.2 Testar: POST /api/bets/bulk/distribute com apostas ja distribuidas → redistribui + audit_log
  - [ ] 4.3 Testar: POST /api/bets/bulk/distribute com grupo invalido → 400
  - [ ] 4.4 Testar: POST /api/bets/bulk/distribute sem ser super_admin → 403
  - [ ] 4.5 Testar: POST /api/bets/bulk/distribute com lista vazia → 400
  - [ ] 4.6 Testar: POST /api/bets/bulk/distribute com > 50 itens → 400
  - [ ] 4.7 Testar: Falha parcial → retorna resultado parcial com errors
  - [ ] 4.8 Testar: BulkDistributeModal renderiza e interage corretamente

- [ ] Task 5: Validacao completa
  - [ ] 5.1 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 5.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Padrao existente: Bulk Operations

Existem duas rotas bulk ja implementadas que servem de referencia direta:

| Rota | Arquivo | Padrao |
|------|---------|--------|
| POST /api/bets/bulk/odds | `admin-panel/src/app/api/bets/bulk/odds/route.ts` | Manual validation, sequential processing |
| POST /api/bets/bulk/links | `admin-panel/src/app/api/bets/bulk/links/route.ts` | Same pattern, URL validation |

Ambas usam:
- `createApiHandler` com `allowedRoles: ['super_admin']`
- Validacao manual (nao Zod) para o array de updates
- Processamento sequencial (loop for...of)
- Resultado parcial: `{ updated, failed, errors }`
- MAX_BULK_ITEMS = 50

### Diferenca: usar Zod como em Story 4-2

A Story 4-2 usou Zod validation. Para consistencia dentro do Epic 4, a rota bulk distribute tambem deveria usar Zod. Porem, as rotas bulk existentes usam validacao manual. Decisao: **usar Zod** por ser mais limpo e consistente com 4-2.

```typescript
import { z } from 'zod';

const bulkDistributeSchema = z.object({
  betIds: z.array(z.number().int().positive()).min(1).max(50),
  groupId: z.string().uuid(),
});
```

Note: `suggested_bets.id` e BIGSERIAL (number), nao UUID. O schema deve aceitar numbers para betIds.

### Padrao P5: Redistribuicao — Audit por item

Para bulk, cada redistribuicao individual deve gerar uma entrada no audit_log:

```typescript
for (const betId of betIds) {
  const { data: bet } = await supabase
    .from('suggested_bets')
    .select('group_id')
    .eq('id', betId)
    .single();

  const oldGroupId = bet?.group_id;

  await supabase
    .from('suggested_bets')
    .update({ group_id: groupId, bet_status: 'ready', distributed_at: new Date().toISOString() })
    .eq('id', betId);

  // Audit apenas para redistribuicao
  if (oldGroupId) {
    await supabase.from('audit_log').insert({
      table_name: 'suggested_bets',
      record_id: betId.toString(),
      action: 'redistribute',
      changed_by: context.user.id,
      changes: { old_group_id: oldGroupId, new_group_id: groupId },
    });
  }
}
```

### BulkDistributeModal — seguir padrao BulkOddsModal

O modal segue o mesmo padrao dos modais bulk existentes:
- Props: `selectedCount`, `groups`, `onClose`, `onSave`
- `onSave(groupId: string)` callback
- Usa select para grupo destino (mesmo que DistributeModal)
- Botao: "Distribuir N Apostas"

### Integracao na bets page

A bets page ja tem uma barra de acoes bulk que aparece quando `selectedIds.size > 0`:

```tsx
{selectedIds.size > 0 && role === 'super_admin' && (
  <div className="flex items-center gap-3 ...">
    <span>{selectedIds.size} apostas selecionadas</span>
    <button onClick={() => setShowBulkModal(true)}>Atualizar Odds em Lote</button>
    <button onClick={() => setShowBulkLinks(true)}>Adicionar Links em Lote</button>
    {/* ADD: Distribuir Selecionadas */}
  </div>
)}
```

### Existing Files (context)

| File | Purpose |
|------|---------|
| `admin-panel/src/app/api/bets/bulk/odds/route.ts` | Bulk odds (pattern reference) |
| `admin-panel/src/app/api/bets/bulk/links/route.ts` | Bulk links (pattern reference) |
| `admin-panel/src/components/features/bets/BulkOddsModal.tsx` | Modal pattern reference |
| `admin-panel/src/components/features/bets/DistributeModal.tsx` | Group selector (Story 4-2) |
| `admin-panel/src/app/(auth)/bets/page.tsx` | Page with bulk action bar |
| `admin-panel/src/app/api/bets/[id]/distribute/route.ts` | Individual distribute (Story 4-2) |

### Previous Story Learnings (Story 4-2)

- Zod v4 uses `.issues` not `.errors` for error messages
- `suggested_bets.id` is BIGSERIAL (number), not UUID
- `createRouteContext` pattern works for route params
- Group validation via `groups` table query is needed
- Audit log `record_id` is TEXT — cast bet ID with `.toString()`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 4.3] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#D4] — Redistribuicao decision
- [Source: _bmad-output/planning-artifacts/architecture.md#P5] — Redistribuicao atomic update + audit
- [Source: _bmad-output/planning-artifacts/architecture.md#P7] — API route checklist
- [Source: admin-panel/src/app/api/bets/bulk/odds/route.ts] — Bulk API pattern reference
- [Source: admin-panel/src/components/features/bets/BulkOddsModal.tsx] — Bulk modal pattern reference
- [Source: admin-panel/src/app/api/bets/[id]/distribute/route.ts] — Individual distribute (Story 4-2)

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
