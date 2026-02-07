# Story 13.5: Atualizar Lógica de Seleção por Job

Status: review

## Story

As a sistema,
I want considerar `promovida_manual` e `elegibilidade` na seleção de apostas,
so that as regras de override funcionem corretamente nos jobs de postagem.

## Acceptance Criteria

### AC1: Query de seleção atualizada
**Given** job de postagem executa (10h, 15h, 22h)
**When** selecionar apostas para postar
**Then** query considera:
  - `elegibilidade = 'elegivel'`
  - `deep_link IS NOT NULL`
  - `kickoff_time BETWEEN NOW() AND NOW() + 2 days`
  - `(odds >= 1.60 OR promovida_manual = true)`

### AC2: Ordenação correta
**Given** apostas elegíveis encontradas
**When** ordenar para seleção
**Then** ordena por:
  1. `promovida_manual DESC` (promovidas primeiro)
  2. `odds DESC` (maiores odds depois)
**And** limita a 3 apostas

### AC3: Apostas promovidas incluídas mesmo com odds baixas
**Given** aposta com `odds = 1.45` e `promovida_manual = true`
**When** seleção executada
**Then** aposta é incluída na seleção
**And** aparece antes de apostas não promovidas

### AC4: Apostas removidas excluídas
**Given** aposta com `elegibilidade = 'removida'`
**When** seleção executada
**Then** aposta NÃO aparece na seleção

### AC5: Histórico de postagens atualizado
**Given** aposta selecionada e postada
**When** postagem concluída
**Then** timestamp adicionado ao array `historico_postagens`
**And** aposta continua elegível para próximos jobs

### AC6: FR7 atualizado
**Given** filtro de odds aplicado
**When** aposta tem `promovida_manual = true`
**Then** filtro de odds >= 1.60 é ignorado para essa aposta

## Tasks / Subtasks

- [x] Task 1: Atualizar getBetsReadyForPosting em betService (AC: 1, 2, 3, 4, 6)
  - [x] Adicionar filtro `elegibilidade = 'elegivel'`
  - [x] Adicionar condição OR para promovida_manual
  - [x] Ajustar ordenação: promovida_manual DESC, odds DESC

- [x] Task 2: Criar função registrarPostagem (AC: 5)
  - [x] Adicionar timestamp ao array historico_postagens
  - [x] Usar JSONB append

- [x] Task 3: Atualizar postBets job (AC: 1, 5, 6)
  - [x] Usar nova query de seleção
  - [x] Chamar registrarPostagem após postar
  - [x] Atualizar validateBetForPosting para ignorar odds mínimas quando promovida_manual=true

- [x] Task 4: Testar cenários (AC: 1-6)
  - [x] Testar seleção com apostas promovidas
  - [x] Testar exclusão de removidas
  - [x] Testar histórico de postagens

## Dev Notes

### Atualizar getEligibleBets

**Arquivo:** `bot/services/betService.js`

```javascript
/**
 * Busca apostas elegíveis para postagem
 * Considera: elegibilidade, odds, promoção manual, link, data do jogo
 *
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getEligibleBets() {
  try {
    const now = new Date();
    const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Query principal com todos os critérios
    const { data, error } = await supabase
      .from('suggested_bets')
      .select('*')
      .eq('elegibilidade', 'elegivel')           // Apenas elegíveis
      .not('deep_link', 'is', null)               // Deve ter link
      .gte('kickoff_time', twoHoursLater.toISOString())  // Jogo não muito próximo
      .lte('kickoff_time', twoDaysLater.toISOString())   // Jogo dentro de 2 dias
      .or('odds.gte.1.60,promovida_manual.eq.true')      // Odds >= 1.60 OU promovida
      .order('promovida_manual', { ascending: false })   // Promovidas primeiro
      .order('odds', { ascending: false })               // Depois por odds
      .limit(3);

    if (error) {
      logger.error('Erro ao buscar apostas elegíveis', { error: error.message });
      return { success: false, error: { message: 'Erro ao buscar apostas' } };
    }

    logger.info('Apostas elegíveis encontradas', {
      count: data?.length || 0,
      promovidas: data?.filter(b => b.promovida_manual).length || 0
    });

    return { success: true, data: data || [] };

  } catch (err) {
    logger.error('Erro inesperado em getEligibleBets', { error: err.message });
    return { success: false, error: { message: 'Erro interno' } };
  }
}
```

### Criar registrarPostagem

**Arquivo:** `bot/services/betService.js`

```javascript
/**
 * Registra uma postagem no histórico da aposta
 * Adiciona timestamp ao array historico_postagens
 *
 * @param {number} betId - ID da aposta
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function registrarPostagem(betId) {
  try {
    const timestamp = new Date().toISOString();

    // Usar RPC ou raw SQL para append no JSONB
    // Alternativa: buscar, modificar, salvar
    const { data: bet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('historico_postagens')
      .eq('id', betId)
      .single();

    if (fetchError) {
      logger.error('Erro ao buscar aposta para registro', { betId, error: fetchError.message });
      return { success: false, error: { message: 'Aposta não encontrada' } };
    }

    const historico = bet.historico_postagens || [];
    historico.push(timestamp);

    const { error: updateError } = await supabase
      .from('suggested_bets')
      .update({ historico_postagens: historico })
      .eq('id', betId);

    if (updateError) {
      logger.error('Erro ao registrar postagem', { betId, error: updateError.message });
      return { success: false, error: { message: 'Erro ao atualizar' } };
    }

    logger.info('Postagem registrada no histórico', { betId, postCount: historico.length });
    return { success: true };

  } catch (err) {
    logger.error('Erro inesperado em registrarPostagem', { betId, error: err.message });
    return { success: false, error: { message: 'Erro interno' } };
  }
}

module.exports = {
  // ... exports existentes
  getEligibleBets,  // Atualizada
  registrarPostagem,
};
```

### Atualizar postBets Job

**Arquivo:** `bot/jobs/postBets.js`

```javascript
// Na função principal do job, após postar com sucesso:

const eligibleResult = await betService.getEligibleBets();
if (!eligibleResult.success || eligibleResult.data.length === 0) {
  logger.info('Nenhuma aposta elegível para postagem');
  return;
}

for (const bet of eligibleResult.data) {
  // ... código de postagem existente ...

  // Após postar com sucesso:
  await betService.registrarPostagem(bet.id);

  // ... resto do código ...
}
```

### Query SQL Equivalente

Para referência, a query equivalente em SQL:

```sql
SELECT * FROM suggested_bets
WHERE elegibilidade = 'elegivel'
  AND deep_link IS NOT NULL
  AND kickoff_time >= NOW() + INTERVAL '2 hours'
  AND kickoff_time <= NOW() + INTERVAL '2 days'
  AND (odds >= 1.60 OR promovida_manual = true)
ORDER BY
  promovida_manual DESC,
  odds DESC
LIMIT 3;
```

### Impacto no FR7

**Antes (FR7 original):**
> Sistema pode filtrar apostas com odds < 1.60

**Depois (FR7 atualizado):**
> Sistema pode filtrar apostas com odds < 1.60, **exceto quando `promovida_manual = true`**

### Dependencies

- Story 13.1 DEVE estar completa (campos elegibilidade, promovida_manual, historico_postagens)

### Architecture Compliance

- ✅ Response pattern: `{ success, data/error }`
- ✅ Logging com contexto
- ✅ Supabase via lib/supabase.js
- ✅ Timezone: America/Sao_Paulo (jobs)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR7]
- [Source: _bmad-output/planning-artifacts/prd.md#FR50]
- [Source: _bmad-output/planning-artifacts/prd.md#Lógica de Seleção por Job]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.5]
- [Source: _bmad-output/project-context.md#Bet State Machine]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- `getBetsReadyForPosting` atualizada no betService.js:
  - Usa `elegibilidade = 'elegivel'` em vez de `eligible = true`
  - Ordena por `promovida_manual DESC`, depois `odds DESC` (AC2)
  - Filtra no código: `odds >= 1.60 OR promovida_manual = true` (AC3, AC6)
  - Apostas removidas são excluídas (AC4)
- Função `registrarPostagem` criada no betService.js (AC5)
  - Adiciona timestamp ao array `historico_postagens`
  - Aposta continua elegível para próximos jobs
- `validateBetForPosting` atualizada no postBets.js (AC6)
  - Ignora filtro de odds mínimas quando `promovida_manual = true`
- Job `postBets.js` atualizado para chamar `registrarPostagem` após postar (AC5)
- Testes passaram: 90/90 ✅
- Lint sem erros ✅

### File List

- `bot/services/betService.js` (modificado - getBetsReadyForPosting, registrarPostagem + export)
- `bot/jobs/postBets.js` (modificado - import, validateBetForPosting, chamada registrarPostagem)

### Change Log

- 2026-01-12: Implementada lógica de seleção por job com elegibilidade e promoção manual
