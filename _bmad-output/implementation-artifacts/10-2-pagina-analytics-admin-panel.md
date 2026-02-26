# Story 10.2: Página de Analytics no Admin Panel

Status: ready-for-dev

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

- [ ] Task 1: Criar página `/analytics`
  - [ ] 1.1 Criar `admin-panel/src/app/(auth)/analytics/page.tsx`
  - [ ] 1.2 Fetch dados de `/api/analytics/accuracy`
  - [ ] 1.3 Cards de resumo (Total, 7d, 30d) com indicador de tendência
  - [ ] 1.4 Tabela "Acerto por Mercado" ordenável
  - [ ] 1.5 Tabela "Acerto por Campeonato" ordenável
  - [ ] 1.6 Tabela "Acerto por Grupo" (apenas super_admin)
  - [ ] 1.7 Cores condicionais: verde >= 70%, amarelo >= 50%, vermelho < 50%
  - [ ] 1.8 Estados de loading, erro e vazio

- [ ] Task 2: Adicionar ao menu lateral
  - [ ] 2.1 Adicionar item "Analytics" no Sidebar.tsx

- [ ] Task 3: Validação
  - [ ] 3.1 `cd admin-panel && npm test` — todos passando
  - [ ] 3.2 `cd admin-panel && npm run build` — build OK

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

### Completion Notes List

### File List
