# Story 11.2: Metricas de Acerto no Dashboard

Status: ready-for-dev

## Story

As a **operador (Super Admin ou Group Admin)**,
I want ver metricas de acerto das apostas diretamente no dashboard,
So that eu tenha visibilidade imediata da performance ao abrir o painel.

## Acceptance Criteria

1. **Given** dashboard carrega
   **When** existem apostas com resultado
   **Then** exibe cards de Performance: Taxa Total, Ultimos 7d, Ultimos 30d

2. **Given** Super Admin
   **When** dashboard carrega
   **Then** ve mini-cards por grupo com nome + taxa

3. **Given** Group Admin
   **When** dashboard carrega
   **Then** ve apenas taxa do proprio grupo

4. **Given** sem apostas com resultado
   **When** dashboard carrega
   **Then** exibe "Sem dados suficientes"

5. **Given** cards de performance
   **When** renderizados
   **Then** aparecem ANTES dos cards de membros/bots

6. **Given** dashboard
   **When** carrega
   **Then** < 3 segundos total

## Tasks / Subtasks

- [ ] Task 1: Adicionar metricas de acerto ao dashboard
  - [ ] 1.1 Fetch /api/analytics/accuracy no dashboard
  - [ ] 1.2 Cards de performance (Taxa Total, 7d, 30d) com cores e tendencia
  - [ ] 1.3 Mini-cards por grupo (super_admin only)
  - [ ] 1.4 Estado vazio "Sem dados suficientes"

- [ ] Task 2: GroupAdminDashboard
  - [ ] 2.1 Adicionar metricas ao GroupAdminDashboard

- [ ] Task 3: Validacao
  - [ ] 3.1 `cd admin-panel && npm test` — todos passando
  - [ ] 3.2 `cd admin-panel && npm run build` — build OK

## Dev Notes

### API
GET /api/analytics/accuracy — already built in Epic 10

### Color Logic
- >= 70%: green
- >= 50%: yellow
- < 50%: red

### References
- [Source: admin-panel/src/app/api/analytics/accuracy/route.ts] Analytics API
- [Source: admin-panel/src/app/(auth)/dashboard/page.tsx] Dashboard
- [Source: admin-panel/src/components/features/dashboard/GroupAdminDashboard.tsx] Group admin view

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
