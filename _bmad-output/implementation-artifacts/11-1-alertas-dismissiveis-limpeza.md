# Story 11.1: Alertas Dismissiveis e Limpeza de Notificacoes

Status: ready-for-dev

## Story

As a **Super Admin**,
I want dispensar alertas e notificacoes do dashboard,
So that eu veja apenas informacoes relevantes e atuais.

## Acceptance Criteria

1. **Given** dashboard carregado
   **When** existem notificacoes
   **Then** cada notificacao tem botao dismiss que marca como lida

2. **Given** notificacoes existem
   **When** clica "Marcar todas como lidas"
   **Then** todas sao marcadas como lidas

3. **Given** notificacoes lidas
   **When** dashboard renderiza
   **Then** notificacoes lidas NAO aparecem (apenas unread)

4. **Given** dashboard
   **When** renderiza
   **Then** secao de alertas legacy (AlertsSection) e removida

5. **Given** dashboard
   **When** mostra badge
   **Then** badge exibe contagem de nao lidas

## Tasks / Subtasks

- [ ] Task 1: Limpar dashboard
  - [ ] 1.1 Remover import e uso de AlertsSection
  - [ ] 1.2 Filtrar notificacoes para mostrar apenas unread no dashboard
  - [ ] 1.3 Adicionar link "Ver todas" para pagina futura

- [ ] Task 2: Validacao
  - [ ] 2.1 `cd admin-panel && npm test` — todos passando
  - [ ] 2.2 `cd admin-panel && npm run build` — build OK

## Dev Notes

### Existing Infrastructure
- NotificationsPanel component already has mark-as-read and mark-all-read
- APIs PATCH /api/notifications/[id] and PATCH /api/notifications/mark-all-read exist
- Dashboard already fetches notifications and passes them to panel

### What to Change
- Remove AlertsSection import and usage from dashboard
- Filter `notifications` to show only unread in the default view
- The NotificationsPanel already handles dismiss UI

### References
- [Source: admin-panel/src/app/(auth)/dashboard/page.tsx] Dashboard page
- [Source: admin-panel/src/components/features/dashboard/NotificationsPanel.tsx] Panel component
- [Source: admin-panel/src/components/features/dashboard/AlertsSection.tsx] Legacy — to remove

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
