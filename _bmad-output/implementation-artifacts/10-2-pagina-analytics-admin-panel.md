# Story 10.2: Página de Analytics no Admin Panel

Status: done

## Story

As a **operador (Super Admin ou Group Admin)**,
I want uma página dedicada de analytics no admin panel,
So that eu possa analisar performance das apostas e tomar decisões baseadas em dados.

## Acceptance Criteria

1. **Given** operador está logado no admin panel
   **When** navega para `/analytics`
   **Then** página exibe cards de resumo: Taxa Total, Últimos 7 dias, Últimos 30 dias

2. **Given** página carregou
   **When** exibe tabelas de breakdown
   **Then** mostra Acerto por Mercado e Acerto por Campeonato (ordenáveis por taxa)

3. **Given** Super Admin está logado
   **When** acessa `/analytics`
   **Then** vê seção adicional "Acerto por Grupo" com tabela

4. **Given** Group Admin está logado
   **When** acessa `/analytics`
   **Then** NÃO vê seção "Acerto por Grupo"

5. **Given** taxa de acerto exibida
   **When** renderizada
   **Then** cores: >= 70% verde, >= 50% amarelo, < 50% vermelho

6. **Given** menu lateral
   **When** renderizado
   **Then** inclui item "Analytics" com ícone de gráfico

7. **Given** página
   **When** carrega
   **Then** responsiva e < 3 segundos

## Tasks / Subtasks

- [x] Task 1: Criar página `/analytics`
  - [x] 1.1 Criar `admin-panel/src/app/(auth)/analytics/page.tsx`
  - [x] 1.2 Fetch dados de `/api/analytics/accuracy`
  - [x] 1.3 Cards de resumo (Total, 7d, 30d) com indicador de tendência
  - [x] 1.4 Tabela "Acerto por Mercado" ordenável
  - [x] 1.5 Tabela "Acerto por Campeonato" ordenável
  - [x] 1.6 Tabela "Acerto por Grupo" (apenas super_admin)
  - [x] 1.7 Cores condicionais: verde >= 70%, amarelo >= 50%, vermelho < 50%
  - [x] 1.8 Estados de loading, erro e vazio

- [x] Task 2: Adicionar ao menu lateral
  - [x] 2.1 Adicionar item "Analytics" no Sidebar.tsx

- [x] Task 3: Validação
  - [x] 3.1 `cd admin-panel && npm test` — 663 passed (58 files)
  - [x] 3.2 `cd admin-panel && npm run build` — build OK

- [x] Task 4: Code Review (adversarial)
  - [x] 4.1 Fixed role default to null to prevent race condition (MEDIUM)
  - [x] 4.2 Changed table keys from array index to stable identifiers (MEDIUM)

## Dev Notes

### API Contract

```
GET /api/analytics/accuracy
Response: { success, data: { total, byGroup, byMarket, byChampionship, periods } }
```

### Color Logic

```typescript
function rateColor(rate: number): string {
  if (rate >= 70) return 'text-green-700';
  if (rate >= 50) return 'text-yellow-700';
  return 'text-red-700';
}
```

### References

- [Source: admin-panel/src/app/api/analytics/accuracy/route.ts] API endpoint (Story 10-1)
- [Source: admin-panel/src/app/(auth)/analyses/page.tsx] Page structure pattern
- [Source: admin-panel/src/components/layout/Sidebar.tsx] Navigation
- [Source: admin-panel/src/lib/bet-categories.ts] Market categories + CATEGORY_STYLES

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Created /analytics page with summary cards and 3 sortable breakdown tables
- Added Analytics nav item in Sidebar
- Code review: fixed role race condition, stable table keys

### File List
- admin-panel/src/app/(auth)/analytics/page.tsx (NEW)
- admin-panel/src/components/layout/Sidebar.tsx (MODIFIED)
