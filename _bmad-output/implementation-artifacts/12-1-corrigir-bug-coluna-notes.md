# Story 12.1: Corrigir Bug Coluna Notes

Status: done

## Story

As a operador,
I want que o comando /atualizar odds funcione sem erros,
so that possa atualizar odds das apostas manualmente quando necessário.

## Contexto do Bug

**Erro reportado:**
```
❌ Erro ao salvar odds: Could not find the 'notes' column of 'suggested_bets' in the schema cache
```

**Causa raiz:**
O código em `bot/services/betService.js` tenta escrever na coluna `notes` que não existe na tabela `suggested_bets`.

**Funções afetadas:**
1. `updateBetOdds()` - linha 534-556
2. `setBetPendingWithNote()` - linha 565-586
3. `createManualBet()` - usa `notes` para armazenar info de criação

## Acceptance Criteria

1. **AC1:** Comando `/atualizar odds` executa sem erro de coluna não encontrada
2. **AC2:** Comando `/odd ID valor` salva odds corretamente
3. **AC3:** Histórico de alterações é preservado para auditoria (coluna notes funcional)
4. **AC4:** Migration é idempotente (pode rodar múltiplas vezes sem erro)

## Tasks / Subtasks

- [ ] Task 1: Criar migration SQL (AC: 3, 4)
  - [ ] 1.1 Criar arquivo `sql/migrations/002_add_notes_column.sql`
  - [ ] 1.2 Adicionar coluna `notes TEXT` na tabela `suggested_bets`
  - [ ] 1.3 Usar `IF NOT EXISTS` para idempotência

- [ ] Task 2: Executar migration no Supabase (AC: 1, 2, 3)
  - [ ] 2.1 Executar SQL no Supabase Dashboard ou via script

- [ ] Task 3: Testar comandos afetados (AC: 1, 2)
  - [ ] 3.1 Testar `/atualizar odds` no grupo admin
  - [ ] 3.2 Testar `/odd ID valor` no grupo admin
  - [ ] 3.3 Verificar que notes são salvos no banco

## Dev Notes

### Arquitetura Relevante

- **Acesso ao banco:** Sempre via `lib/supabase.js` (Supabase REST API)
- **Padrão de resposta:** `{ success: true/false, data/error }`
- **Logging:** Usar `logger.info/warn/error` de `lib/logger.js`

### Código Afetado

**`bot/services/betService.js`:**

```javascript
// Linha 534-539 - updateBetOdds
async function updateBetOdds(betId, odds, notes = null) {
  const updateData = { odds };
  if (notes) {
    updateData.notes = notes;  // ❌ Esta linha causa o erro
  }
  // ...
}

// Linha 565-572 - setBetPendingWithNote
async function setBetPendingWithNote(betId, note) {
  const { error } = await supabase
    .from('suggested_bets')
    .update({
      bet_status: 'pending_link',
      notes: note,  // ❌ Esta linha causa o erro
    })
    .eq('id', betId);
  // ...
}
```

### Migration SQL

```sql
-- Migration: 002_add_notes_column.sql
-- Adiciona coluna notes para histórico de alterações manuais

ALTER TABLE suggested_bets 
ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN suggested_bets.notes IS 'Notas sobre alterações manuais (odds, status, etc)';
```

### Project Structure Notes

- Migration fica em: `sql/migrations/002_add_notes_column.sql`
- Último migration existente: `001_initial_schema.sql`
- Convenção de nomes: `NNN_descricao.sql`

### Como Executar Migration

**Opção 1 - Supabase Dashboard:**
1. Acessar Supabase Dashboard
2. SQL Editor → New Query
3. Colar o SQL da migration
4. Executar

**Opção 2 - Script existente:**
```bash
node scripts/run-migration.js sql/migrations/002_add_notes_column.sql
```

### References

- [Source: prd-addendum-v3.md#BUG-003]
- [Source: bot/services/betService.js#updateBetOdds]
- [Source: bot/services/betService.js#setBetPendingWithNote]
- [Source: sql/agent_schema.sql - tabela suggested_bets]

## Dev Agent Record

### Agent Model Used

_Preencher após implementação_

### Debug Log References

### Completion Notes List

### File List

- `sql/migrations/002_add_notes_column.sql` (novo)
