# Story 9.1: Cancelamento pelo Operador no Painel Admin

Status: ready-for-dev

## Story

As a **operador (Super Admin ou Group Admin)**,
I want cancelar ou expulsar um membro pelo painel admin,
So that eu possa gerenciar membros problematicos sem depender do desenvolvedor.

## Acceptance Criteria

1. **Given** operador esta na pagina `/members` e ve a lista de membros
   **When** clica no botao "Cancelar" de um membro com status `trial` ou `ativo`
   **Then** exibe modal de confirmacao com: nome do membro, status atual, campo obrigatorio de motivo (textarea)

2. **Given** operador preencheu o motivo e confirmou no modal
   **When** API `POST /api/members/{id}/cancel` e chamada
   **Then** atualiza `status = 'cancelado'`, seta `kicked_at = now()`, registra `cancellation_reason` e `cancelled_by`

3. **Given** cancelamento confirmado
   **When** sistema processa
   **Then** chama Telegram Bot API `banChatMember` para remover membro do grupo Telegram

4. **Given** cancelamento processado
   **When** membro e removido
   **Then** bot envia mensagem de despedida via DM ao membro com link de reativacao (checkout URL do grupo)

5. **Given** cancelamento concluido
   **When** operacao finaliza
   **Then** registro no audit log: `{ action: 'member_cancelled', actor: operator_id, actor_type: 'operator', member_id, reason, timestamp }`

6. **Given** tabela de membros apos cancelamento
   **When** operador visualiza a lista
   **Then** membro aparece com status "Cancelado" e badge vermelha/cinza

7. **Given** Group Admin tentando cancelar
   **When** membro pertence a outro grupo
   **Then** API retorna 403 (RLS enforcement via groupFilter)

## Tasks / Subtasks

- [ ] Task 1: Migration — adicionar status `cancelado` e campos de cancelamento
  - [ ] 1.1 Criar `sql/migrations/039_member_cancellation.sql`
  - [ ] 1.2 ALTER CHECK constraint para incluir `cancelado` em `members.status`
  - [ ] 1.3 ADD COLUMN `cancellation_reason` TEXT nullable
  - [ ] 1.4 ADD COLUMN `cancelled_by` UUID nullable (FK → admin_users)
  - [ ] 1.5 Aplicar migration via Supabase Management API

- [ ] Task 2: Atualizar tipos TypeScript e member-utils
  - [ ] 2.1 Adicionar `'cancelado'` ao union type `Member.status` em `database.ts`
  - [ ] 2.2 Adicionar `cancellation_reason` e `cancelled_by` ao interface `Member`
  - [ ] 2.3 Adicionar `'cancelado'` ao `MemberDisplayStatus` e `memberStatusConfig` em `member-utils.ts`
  - [ ] 2.4 Adicionar `cancelado` ao filtro de status no `MemberList` e `page.tsx`

- [ ] Task 3: API route `POST /api/members/[id]/cancel`
  - [ ] 3.1 Criar `admin-panel/src/app/api/members/[id]/cancel/route.ts`
  - [ ] 3.2 Validar body: `{ reason: string }` (obrigatorio, min 3 chars)
  - [ ] 3.3 Buscar membro, validar status `trial` ou `ativo`, enforce groupFilter
  - [ ] 3.4 Atualizar DB: `status='cancelado'`, `kicked_at=now()`, `cancellation_reason`, `cancelled_by`
  - [ ] 3.5 Chamar Telegram `banChatMember` para remover do grupo (best-effort, nao bloquear em falha)
  - [ ] 3.6 Enviar DM de despedida com checkout URL (best-effort)
  - [ ] 3.7 Inserir registro no `audit_log`

- [ ] Task 4: Modal de cancelamento na UI
  - [ ] 4.1 Criar componente `CancelMemberModal.tsx` em `components/features/members/`
  - [ ] 4.2 Props: `member`, `onConfirm`, `onClose`, `isLoading`
  - [ ] 4.3 Exibir nome do membro, status atual, textarea de motivo (obrigatorio)
  - [ ] 4.4 Botoes "Cancelar Membro" (vermelho) e "Voltar"

- [ ] Task 5: Integrar botao "Cancelar" no MemberList
  - [ ] 5.1 Adicionar coluna "Acoes" na tabela do `MemberList`
  - [ ] 5.2 Botao "Cancelar" visivel apenas para membros com status `trial` ou `ativo`
  - [ ] 5.3 Ao clicar, abrir `CancelMemberModal`
  - [ ] 5.4 Ao confirmar, chamar `POST /api/members/{id}/cancel` e atualizar lista

- [ ] Task 6: Testes e validacao
  - [ ] 6.1 Testes unitarios para API cancel endpoint
  - [ ] 6.2 `cd admin-panel && npm test` — todos os testes passando
  - [ ] 6.3 `cd admin-panel && npm run build` — build OK

## Dev Notes

### State Machine Extension

Adicionar transicao `cancelado` em `memberService.js`:
```js
const VALID_TRANSITIONS = {
  trial: ['ativo', 'removido', 'cancelado'],
  ativo: ['inadimplente', 'removido', 'cancelado'],
  inadimplente: ['ativo', 'removido'],
  removido: [],
  cancelado: [],  // Final state
};
```

### Telegram Bot API — banChatMember

Padrao existente em `bot/services/memberService.js`:
```js
async function kickMemberFromGroup(telegramId, chatId, botInstance) {
  const banUntil = Math.floor(Date.now() / 1000) + 86400; // 24h ban
  await botInstance.banChatMember(chatId, telegramId, { until_date: banUntil });
}
```

Para o cancelamento do painel admin, fazer request direto via fetch ao Telegram API (o admin panel nao tem acesso ao bot instance):
```typescript
const response = await fetch(`https://api.telegram.org/bot${botToken}/banChatMember`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ chat_id: publicGroupId, user_id: telegramId, until_date: banUntil }),
});
```

### Farewell DM Pattern

Seguir padrao de `kick-expired.js`:
```typescript
await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: telegramId,
    text: `Sua assinatura foi cancelada.\n\nPara reativar: ${checkoutUrl}`,
    parse_mode: 'Markdown',
  }),
});
```

### Audit Log

`audit_log.record_id` e UUID mas `members.id` e SERIAL (integer). Usar cast `::text::uuid` nao funciona. Alternativa: armazenar member_id no campo `changes` JSONB e usar o `id` do grupo como `record_id`:
```typescript
await supabase.from('audit_log').insert({
  table_name: 'members',
  record_id: groupId, // grupo afetado
  action: 'member_cancelled',
  changed_by: userId,
  changes: { member_id: memberId, reason, actor_type: 'operator', telegram_id: member.telegram_id },
});
```

### Padroes existentes a seguir

- API handler: `createApiHandler` com `allowedRoles: ['super_admin', 'group_admin']`
- RLS: `groupFilter` para restringir por grupo
- Route shape: `POST /api/members/[id]/cancel/route.ts` (seguir `bets/[id]/promote/route.ts`)
- Bot token access: buscar da tabela `bot_pool` via Supabase (mesma tecnica usada em outros API routes)

### References

- [Source: _bmad-output/planning-artifacts/epics.md] Story 9.1 spec
- [Source: bot/services/memberService.js] kickMemberFromGroup, state machine
- [Source: admin-panel/src/app/api/members/route.ts] Members API pattern
- [Source: admin-panel/src/components/features/members/MemberList.tsx] MemberList component

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
