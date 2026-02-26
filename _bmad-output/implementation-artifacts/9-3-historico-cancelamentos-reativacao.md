# Story 9.3: Historico de Cancelamentos e Reativacao

Status: done

## Story

As a **operador (Super Admin)**,
I want ver o historico de cancelamentos e poder reativar membros,
So that eu tenha visibilidade total e possa corrigir cancelamentos indevidos.

## Acceptance Criteria

1. **Given** operador esta na pagina `/members` e filtra por "Cancelado"
   **When** tabela carrega
   **Then** mostra membros cancelados com colunas adicionais: Motivo, Cancelado Por, Data

2. **Given** operador ve um membro cancelado
   **When** clica em "Reativar"
   **Then** API `POST /api/members/{id}/reactivate` atualiza `status = 'ativo'`, limpa campos de cancelamento

3. **Given** reativacao processada
   **When** sistema executa
   **Then** membro e readicionado ao grupo Telegram via `unbanChatMember`

4. **Given** reativacao concluida
   **When** operacao finaliza
   **Then** reativacao registrada no audit log

## Tasks / Subtasks

- [ ] Task 1: API route `POST /api/members/[id]/reactivate`
  - [ ] 1.1 Criar `admin-panel/src/app/api/members/[id]/reactivate/route.ts`
  - [ ] 1.2 Validar membro tem status `cancelado`
  - [ ] 1.3 Atualizar: `status = 'ativo'`, `kicked_at = null`, `cancellation_reason = null`, `cancelled_by = null`
  - [ ] 1.4 Chamar Telegram `unbanChatMember` (best-effort)
  - [ ] 1.5 Registrar no audit_log

- [ ] Task 2: Botao "Reativar" no MemberList para membros cancelados
  - [ ] 2.1 Adicionar botao "Reativar" quando `status === 'cancelado'`
  - [ ] 2.2 Chamar API e atualizar lista ao confirmar

- [ ] Task 3: Colunas adicionais para membros cancelados
  - [ ] 3.1 Expandir select da API GET /api/members para incluir `cancellation_reason`, `cancelled_by`
  - [ ] 3.2 Mostrar colunas extras na tabela quando filtro = cancelado
  - [ ] 3.3 Atualizar `MemberListItem` type para incluir novos campos

- [ ] Task 4: Atualizar state machine do bot
  - [ ] 4.1 Adicionar transicao `cancelado -> ativo` em VALID_TRANSITIONS

- [ ] Task 5: Testes e validacao
  - [ ] 5.1 Testes unitarios para API reactivate endpoint
  - [ ] 5.2 `cd admin-panel && npm test` — todos os testes passando
  - [ ] 5.3 `cd admin-panel && npm run build` — build OK

## Dev Notes

### Telegram unbanChatMember

Para reativar, usar `unbanChatMember` seguido de novo convite:
```typescript
await fetch(`https://api.telegram.org/bot${botToken}/unbanChatMember`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: publicGroupId, user_id: telegramId, only_if_banned: true }),
});
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md] Story 9.3 spec
- [Source: admin-panel/src/app/api/members/[id]/cancel/route.ts] Cancel route pattern

## Dev Agent Record

### Agent Model Used
claude-opus-4-6

### Completion Notes List
- POST /api/members/[id]/reactivate with optimistic locking and status validation
- Telegram unbanChatMember (best-effort) on reactivation
- Reativar button for cancelled members in MemberList
- Cancellation details columns (Motivo, Cancelado Por, Data Cancelamento) when filtering by cancelado
- Resolve cancelled_by UUID to admin email via secondary query (strips raw UUID from response)
- State machine: cancelado → ativo transition added
- 8 unit tests for reactivate endpoint (success, validation, 404, 409 conflict, group filter, Telegram call)
- Audit log for reactivation events
- Code review: fixed DB error message leak, cancelled_by UUID leak, double-click prevention

### File List
- `admin-panel/src/app/api/members/[id]/reactivate/route.ts` — NEW
- `admin-panel/src/app/api/__tests__/member-reactivate.test.ts` — NEW
- `admin-panel/src/app/api/members/route.ts` — MODIFIED (cancel cols, email resolution)
- `admin-panel/src/types/database.ts` — MODIFIED (MemberListItem extended)
- `admin-panel/src/components/features/members/MemberList.tsx` — MODIFIED (Reativar button, cancellation columns)
- `admin-panel/src/app/(auth)/members/page.tsx` — MODIFIED (handleReactivate, reactivateLoading)
- `bot/services/memberService.js` — MODIFIED (cancelado → ativo transition)
