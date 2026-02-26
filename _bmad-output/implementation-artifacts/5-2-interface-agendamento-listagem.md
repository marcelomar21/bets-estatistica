# Story 5.2: Interface de Agendamento e Listagem de Mensagens

Status: done

## Story

As a **admin (Super or Group)**,
I want uma pagina no painel para agendar mensagens e ver o historico,
So that eu tenha autonomia para comunicar com meus membros sem depender de ninguem.

## Acceptance Criteria

1. **Given** admin acessa a pagina `/messages` no painel
   **When** a pagina carrega
   **Then** ve lista de mensagens agendadas com: texto (preview), grupo, data/hora, status
   **And** mensagens ordenadas por `scheduled_at` (proximas primeiro)

2. **Given** admin clica em "Nova Mensagem"
   **When** o form abre
   **Then** ve campos: texto (textarea), data, hora, grupo destino
   **And** Super Admin ve dropdown com todos os grupos
   **And** Group Admin ve apenas seu grupo pre-selecionado

3. **Given** admin preenche o form e clica em "Agendar"
   **When** dados sao validos
   **Then** chama POST /api/messages e exibe confirmacao via toast
   **And** mensagem aparece na lista com status pending

4. **Given** admin tenta agendar com data/hora no passado
   **When** submete o form
   **Then** exibe erro de validacao inline sem enviar request

5. **Given** admin ve mensagem pending na lista
   **When** clica em "Cancelar"
   **Then** chama DELETE /api/messages/[id] e atualiza status para cancelled

6. **Given** a lista tem mensagens de varios status
   **When** admin visualiza
   **Then** cada status tem indicacao visual distinta: pending (amarelo), sent (verde), failed (vermelho), cancelled (cinza)

7. **Given** link para /messages no sidebar do admin panel
   **When** admin navega
   **Then** o link e visivel e acessivel

## Tasks / Subtasks

- [ ] Task 1: Adicionar link /messages no Sidebar (AC: #7)
  - [ ] 1.1 No `Sidebar.tsx`, adicionar item "Mensagens" ao array navigation

- [ ] Task 2: Criar pagina /messages (AC: #1, #2, #3, #4, #5, #6)
  - [ ] 2.1 Criar `admin-panel/src/app/(auth)/messages/page.tsx`
  - [ ] 2.2 Estado: messages, loading, groups, role, form visibility, toast
  - [ ] 2.3 fetchMessages via GET /api/messages
  - [ ] 2.4 Botao "Nova Mensagem" que mostra/esconde form
  - [ ] 2.5 Form com textarea, date/time, group select (super: todos, group_admin: pre-selecionado)
  - [ ] 2.6 Validacao client-side: texto nao vazio, data futura
  - [ ] 2.7 Submit via POST /api/messages → toast sucesso/erro → refetch
  - [ ] 2.8 Lista de mensagens com colunas: texto (truncado), grupo, data/hora, status badge
  - [ ] 2.9 Badge de status com cores: pending (yellow), sent (green), failed (red), cancelled (gray)
  - [ ] 2.10 Botao "Cancelar" em mensagens pending → DELETE /api/messages/[id] → refetch

- [ ] Task 3: Escrever testes
  - [ ] 3.1 Testar migration syntax (scheduled_messages table, indexes, RLS)

- [ ] Task 4: Validacao completa
  - [ ] 4.1 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 4.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Sidebar navigation

Em `admin-panel/src/components/layout/Sidebar.tsx`, o array `navigation` lista os itens. Adicionar:

```typescript
{ name: 'Mensagens', href: '/messages', icon: 'envelope' }
```

### Page pattern

Seguir o padrao da bets page (`admin-panel/src/app/(auth)/bets/page.tsx`):
- `'use client'`
- useState para messages, loading, groups, role, form
- useEffect para fetchMessages e fetchGroups
- Toast pattern igual

### Form

O form para agendar usa `<textarea>` para o texto e inputs date/time. Para o grupo, mesmo select das bets (groups dropdown).

### Status badge colors

```typescript
const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800' },
  sent: { label: 'Enviada', className: 'bg-green-100 text-green-800' },
  failed: { label: 'Falhou', className: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelada', className: 'bg-gray-100 text-gray-600' },
};
```

### Existing Files (context)

| File | Purpose |
|------|---------|
| `admin-panel/src/components/layout/Sidebar.tsx` | Navigation sidebar |
| `admin-panel/src/app/(auth)/bets/page.tsx` | Page pattern reference |
| `admin-panel/src/app/api/messages/route.ts` | GET/POST API (Story 5-1) |
| `admin-panel/src/app/api/messages/[id]/route.ts` | DELETE API (Story 5-1) |
| `admin-panel/src/types/database.ts` | ScheduledMessage types |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2] — AC
- [Source: admin-panel/src/components/layout/Sidebar.tsx] — Navigation
- [Source: admin-panel/src/app/(auth)/bets/page.tsx] — Page pattern

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Task 1: Added Mensagens link to Sidebar navigation array
- Task 2: Created /messages page with form, list, status badges, cancel, toast
- Task 3-4: 572 admin-panel tests pass, build OK, /messages route present

### File List
- admin-panel/src/components/layout/Sidebar.tsx (MODIFIED — added Mensagens nav item)
- admin-panel/src/app/(auth)/messages/page.tsx (NEW — messages page with form + list)
