# Story 12.2: Corrigir Overview Object Object

Status: done

## Story

As a operador,
I want ver IDs numéricos no comando /overview,
so that saiba exatamente quais apostas estão postadas.

## Contexto do Bug

**Problema:**
Ao usar `/overview`, a seção "IDs Postadas" mostra `#[object Object], #[object Object]` ao invés dos IDs reais.

**Causa raiz:**
Incompatibilidade entre o formato retornado por `getOverviewStats()` e o tratamento em `handleOverviewCommand()`.

**`getOverviewStats()` retorna:**
```javascript
postedIds: [
  { id: 45, match: 'Liverpool x Arsenal', kickoff: '...', odds: 1.85 },
  { id: 47, match: 'Real Madrid x Barcelona', kickoff: '...', odds: 1.72 },
]
```

**`handleOverviewCommand()` trata como:**
```javascript
stats.postedIds.map(id => `#${id}`)  // ❌ 'id' é objeto, não número!
// Resultado: "#[object Object]"
```

## Acceptance Criteria

1. **AC1:** Comando `/overview` exibe IDs numéricos (ex: `#45, #47, #52`)
2. **AC2:** Não quebra se não houver apostas postadas
3. **AC3:** Mantém formatação existente do restante da mensagem

## Tasks / Subtasks

- [ ] Task 1: Corrigir map em handleOverviewCommand (AC: 1, 2)
  - [ ] 1.1 Alterar `id => \`#${id}\`` para `item => \`#${item.id}\``

- [ ] Task 2: Testar comando /overview (AC: 1, 2, 3)
  - [ ] 2.1 Verificar exibição com apostas postadas
  - [ ] 2.2 Verificar exibição sem apostas postadas

## Dev Notes

### Código a Corrigir

**Arquivo:** `bot/handlers/adminGroup.js`
**Linha:** 277-279

**Antes (bug):**
```javascript
const postedIdsList = stats.postedIds.length > 0
  ? stats.postedIds.map(id => `#${id}`).join(', ')
  : 'Nenhuma';
```

**Depois (corrigido):**
```javascript
const postedIdsList = stats.postedIds.length > 0
  ? stats.postedIds.map(item => `#${item.id}`).join(', ')
  : 'Nenhuma';
```

### Estrutura de Dados

`getOverviewStats()` em `bot/services/betService.js` (linha 743-748):
```javascript
postedIds: (postedBets || []).map(b => ({
  id: b.id,
  match: `${b.league_matches.home_team_name} x ${b.league_matches.away_team_name}`,
  kickoff: b.league_matches.kickoff_time,
  odds: b.odds_at_post,
})),
```

### References

- [Source: prd-addendum-v3.md#BUG-004]
- [Source: bot/handlers/adminGroup.js#handleOverviewCommand]
- [Source: bot/services/betService.js#getOverviewStats]

## Dev Agent Record

### Agent Model Used

_Preencher após implementação_

### Completion Notes List

### File List

- `bot/handlers/adminGroup.js` (modificado)
