# Story 12.4: Restaurar Filtro 2 Dias Elegibilidade

Status: done

## Story

As a sistema,
I want considerar apenas jogos com menos de 2 dias de antecedência,
so that apostas sejam para jogos iminentes e links não fiquem desatualizados.

## Contexto do Problema

**Requisito PRD original (FR39):**
> Sistema deve considerar apenas jogos com pelo menos 2 dias de antecedência

**Configuração atual:**
```javascript
// lib/config.js linha 35
maxDaysAhead: 14, // 2 semanas para cobrir jogos de fim de semana
```

**Problema:** 14 dias é muito amplo. Gera apostas para jogos muito distantes onde:
- Odds podem mudar muito até o jogo
- Links ficam desatualizados
- Operador tem que gerenciar muitas apostas

## Acceptance Criteria

1. **AC1:** Configuração `maxDaysAhead` alterada para 2 dias
2. **AC2:** Função `getEligibleBets()` continua filtrando corretamente
3. **AC3:** Jogos com mais de 2 dias não aparecem como elegíveis

## Tasks / Subtasks

- [ ] Task 1: Alterar config (AC: 1)
  - [ ] 1.1 Mudar `maxDaysAhead` de 14 para 2

- [ ] Task 2: Verificar código dependente (AC: 2, 3)
  - [ ] 2.1 Confirmar que `getEligibleBets()` usa config corretamente

## Dev Notes

### Arquivo a Modificar

`lib/config.js` linha 35

### Código

```javascript
// ANTES
maxDaysAhead: 14, // 2 semanas para cobrir jogos de fim de semana

// DEPOIS
maxDaysAhead: 2, // 2 dias conforme PRD (FR39)
```

### Funções que Usam Este Config

- `getEligibleBets()` em `bot/services/betService.js` - já usa corretamente

### References

- [Source: prd.md#FR39]
- [Source: prd-addendum-v3.md#BUG-006]
- [Source: lib/config.js]

## Dev Agent Record

### Agent Model Used

_Preencher após implementação_

### Completion Notes List

### File List

- `lib/config.js` (modificado)
