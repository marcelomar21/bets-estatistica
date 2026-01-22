# Story 7.2: Corrigir Matching de Odds

Status: done

## Story

As a sistema,
I want buscar odds corretamente da API,
So that as odds exibidas correspondam às odds reais.

## Acceptance Criteria

1. **Given** aposta com mercado específico (ex: Over 2.5)
   **When** buscar odds na The Odds API
   **Then** retorna a odd correta para a linha especificada

2. **Given** aposta com linha específica (ex: 2.5)
   **When** existem múltiplas linhas disponíveis na API
   **Then** não confunde linhas (Over 0.5 vs Over 2.5)

3. **Given** aposta do tipo Over ou Under
   **When** buscar odds
   **Then** não confunde tipos (Over vs Under)

4. **Given** qualquer matching de odds
   **When** comparar odd retornada com odd real
   **Then** margem de erro < ±0.05

5. **Given** processo de matching
   **When** executa busca
   **Then** logs detalhados mostram: mercado buscado, linha esperada, outcomes encontrados, seleção final

## Tasks / Subtasks

- [ ] **Task 1: Analisar estrutura de resposta da The Odds API** (AC: #1)
  - [ ] 1.1 Adicionar logs para ver estrutura real do `oddsData.bookmakers[].markets[].outcomes[]`
  - [ ] 1.2 Identificar formato exato de `outcome.name` (case, valores possíveis)
  - [ ] 1.3 Identificar formato de `outcome.point` (tipo, precisão)

- [ ] **Task 2: Corrigir matching de betType** (AC: #2, #3)
  - [ ] 2.1 Normalizar case: converter `outcomeType` e `betType` para lowercase
  - [ ] 2.2 Verificar se API retorna 'Over'/'Under' ou 'over'/'under'
  - [ ] 2.3 Adicionar validação de tipo antes de comparar linha

- [ ] **Task 3: Corrigir matching de linha** (AC: #2)
  - [ ] 3.1 Verificar se `outcome.point` é number ou string
  - [ ] 3.2 Garantir comparação numérica (não string)
  - [ ] 3.3 Usar tolerância de ±0.01 para comparação de floats

- [ ] **Task 4: Adicionar logs de debug detalhados** (AC: #5)
  - [ ] 4.1 Log entrada: betType, line esperada, mercado
  - [ ] 4.2 Log outcomes encontrados: todos os outcomes com seus values
  - [ ] 4.3 Log seleção: qual outcome foi escolhido e por quê
  - [ ] 4.4 Log quando não encontra match exato

## Dev Notes

### Análise do Código Atual

**`findBestOdds()` em `oddsService.js` linha 227-296:**

```javascript
// Match bet type
const outcomeType = outcome.name?.toLowerCase();
if (betType && outcomeType !== betType) continue;

const outcomePoint = outcome.point;
const lineDiff = (line !== null && outcomePoint !== undefined) 
  ? Math.abs(outcomePoint - line) 
  : 0;
```

### Possíveis Problemas

1. **Case sensitivity**: O código já faz `.toLowerCase()`, mas precisa verificar se `betType` vem em lowercase do `marketInterpreter`

2. **Tipo de linha**: `outcome.point` pode ser string ou undefined em alguns mercados

3. **Mercados sem linha**: BTTS não tem `point`, mas o código trata `line = null` corretamente

4. **Seleção errada**: Se não achar match exato, pega o mais próximo - pode pegar Over 0.5 quando queria Over 2.5

### Estrutura Esperada da API

```json
{
  "bookmakers": [{
    "key": "bet365",
    "markets": [{
      "key": "totals",
      "outcomes": [
        { "name": "Over", "point": 2.5, "price": 1.85 },
        { "name": "Under", "point": 2.5, "price": 1.95 },
        { "name": "Over", "point": 1.5, "price": 1.25 },
        { "name": "Under", "point": 1.5, "price": 3.50 }
      ]
    }]
  }]
}
```

### Fix Proposto

```javascript
function findBestOdds(oddsData, betType, line = null) {
  // Normalize betType
  const normalizedBetType = betType?.toLowerCase();
  
  for (const outcome of market.outcomes || []) {
    const outcomeType = outcome.name?.toLowerCase();
    
    // STRICT TYPE MATCH
    if (normalizedBetType && outcomeType !== normalizedBetType) continue;
    
    // STRICT LINE MATCH (if line specified)
    if (line !== null) {
      const outcomePoint = parseFloat(outcome.point);
      if (isNaN(outcomePoint)) continue;
      if (Math.abs(outcomePoint - line) > 0.01) continue; // Only exact match
    }
    
    // This is a valid candidate
    candidates.push({...});
  }
}
```

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/oddsService.js` | Corrigir `findBestOdds()` e adicionar logs |

### Testes Manuais

1. Buscar odds para "Mais de 2.5 gols" - deve retornar Over 2.5, não Over 0.5
2. Buscar odds para "Menos de 3.5 gols" - deve retornar Under 3.5
3. Verificar logs mostram matching correto

### References

- [Source: bot/services/oddsService.js#findBestOdds] - Função de matching
- [Source: bot/services/marketInterpreter.js#interpretMarket] - Parser do mercado
- [Source: _bmad-output/planning-artifacts/prd-addendum-v2.md#BUG-002] - Descrição do bug

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (2026-01-11)

### Debug Log References

N/A - Logs adicionados diretamente no código

### Completion Notes List

1. ✅ Refatorada função `findBestOdds()` com STRICT matching
2. ✅ Normalização de `betType` para lowercase
3. ✅ Conversão de `outcome.point` string para number
4. ✅ Tolerância de ±0.01 para comparação de floats (linhas)
5. ✅ Removida lógica de "closest line" - agora só aceita match exato
6. ✅ Logs detalhados: entrada, todos outcomes, candidates, seleção final
7. ✅ Story 7.3 (logs de debug) incorporada nesta implementação

### File List

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/oddsService.js` | ~80 linhas modificadas - `findBestOdds()` e `getOddsForBet()` |
