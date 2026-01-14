# Story 14.8: Registrar Mudancas de Odds no Historico

Status: ready-for-dev

## Story

As a sistema,
I want registrar toda mudanca de odds no historico,
so that tenha rastreabilidade completa.

## Acceptance Criteria

1. **Given** job de enriquecimento atualiza odds de uma aposta
   **When** `updateBetOdds(betId, newOdds)` e chamado
   **Then** registra em `odds_update_history`:
   - bet_id
   - update_type = 'odds_change'
   - old_value = odds anterior
   - new_value = odds nova
   - job_name = nome do job (ex: 'enrichOdds_13h')

2. **Given** odds e atualizada manualmente via /odds
   **When** admin usa comando `/odds ID valor`
   **Then** registra com job_name = 'manual_admin_/odds'

3. **Given** valor da odds nao mudou
   **When** tentativa de atualizar com mesmo valor
   **Then** NAO registra no historico
   **And** retorna sucesso sem criar duplicata

4. **Given** erro ao registrar historico
   **When** falha na insercao
   **Then** log de warning e gerado
   **And** atualizacao da aposta NAO e bloqueada (best-effort)

5. **Given** funcao registrarOddsHistory criada
   **When** chamada com parametros
   **Then** aceita: betId, oldValue, newValue, jobName
   **And** retorna { success: boolean }

## Tasks / Subtasks

- [ ] Task 1: Criar funcao registrarOddsHistory em betService.js (AC: #1, #5)
  - [ ] 1.1: Definir interface da funcao
  - [ ] 1.2: Implementar insercao no Supabase
  - [ ] 1.3: Adicionar tratamento de erros (nao bloquear operacao principal)
  - [ ] 1.4: Exportar funcao no modulo

- [ ] Task 2: Modificar updateBetOdds para registrar historico (AC: #1, #3)
  - [ ] 2.1: Buscar valor anterior antes de atualizar
  - [ ] 2.2: Comparar old_value com new_value
  - [ ] 2.3: Se diferentes, chamar registrarOddsHistory
  - [ ] 2.4: Adicionar parametro jobName (default 'manual_update')

- [ ] Task 3: Atualizar chamadas de updateBetOdds com jobName (AC: #1, #2)
  - [ ] 3.1: enrichOdds.js: passar 'enrichOdds_HHh' como jobName
  - [ ] 3.2: adminGroup.js handleOddsCommand: passar 'manual_admin_/odds'
  - [ ] 3.3: Verificar outras chamadas de updateBetOdds

- [ ] Task 4: Testar integracao (AC: #1-4)
  - [ ] 4.1: Testar atualizacao via enrichOdds - deve registrar
  - [ ] 4.2: Testar atualizacao via /odds - deve registrar
  - [ ] 4.3: Testar atualizacao com mesmo valor - NAO deve registrar
  - [ ] 4.4: Verificar registros no banco

## Dev Notes

### Dependencia

**IMPORTANTE:** Esta story DEPENDE da Story 14.7 (criar tabela odds_update_history). A tabela deve existir antes de implementar esta funcionalidade.

### Interface da Funcao registrarOddsHistory

```javascript
/**
 * Registra atualizacao de odds no historico (Story 14.8)
 * Funcao best-effort - nao bloqueia operacao principal se falhar
 * @param {number} betId - ID da aposta
 * @param {number|null} oldValue - Valor anterior (null para nova aposta)
 * @param {number} newValue - Novo valor
 * @param {string} jobName - Nome do job que fez a atualizacao
 * @returns {Promise<{success: boolean}>}
 */
async function registrarOddsHistory(betId, oldValue, newValue, jobName) {
  try {
    const { error } = await supabase
      .from('odds_update_history')
      .insert({
        bet_id: betId,
        update_type: oldValue === null ? 'new_analysis' : 'odds_change',
        old_value: oldValue,
        new_value: newValue,
        job_name: jobName
      });

    if (error) {
      logger.warn('Falha ao registrar historico de odds (best-effort)', {
        betId,
        error: error.message
      });
      return { success: false };
    }

    logger.debug('Historico de odds registrado', { betId, oldValue, newValue, jobName });
    return { success: true };

  } catch (err) {
    logger.warn('Erro inesperado ao registrar historico (best-effort)', {
      betId,
      error: err.message
    });
    return { success: false };
  }
}
```

### Modificacao em updateBetOdds

```javascript
/**
 * Update bet odds (manual or from API) and auto-promote to 'ready' if conditions met
 * Story 14.8: Agora registra mudancas no historico
 * @param {number} betId - Bet ID
 * @param {number} odds - New odds value
 * @param {string} notes - Optional notes about the update
 * @param {string} jobName - Nome do job que esta atualizando (default: 'manual_update')
 * @returns {Promise<{success: boolean, promoted?: boolean, error?: object}>}
 */
async function updateBetOdds(betId, odds, notes = null, jobName = 'manual_update') {
  try {
    // Story 14.8: Buscar valor anterior para historico
    const { data: currentBet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('odds')
      .eq('id', betId)
      .single();

    const oldOdds = currentBet?.odds || null;

    // So atualiza se valor mudou (evita duplicatas no historico)
    if (oldOdds !== null && Math.abs(oldOdds - odds) < 0.001) {
      logger.debug('Odds nao mudou, pulando atualizacao', { betId, odds });
      return { success: true, promoted: false };
    }

    const updateData = { odds };
    if (notes) {
      updateData.notes = notes;
    }

    const { error } = await supabase
      .from('suggested_bets')
      .update(updateData)
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet odds', { betId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet odds updated', { betId, oldOdds, newOdds: odds });

    // Story 14.8: Registrar no historico (best-effort)
    await registrarOddsHistory(betId, oldOdds, odds, jobName);

    // Try to auto-promote
    const promoteResult = await tryAutoPromote(betId);

    return { success: true, promoted: promoteResult.promoted };
  } catch (err) {
    logger.error('Error updating bet odds', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}
```

### Atualizacoes Necessarias

#### 1. enrichOdds.js

```javascript
// Linha ~224, dentro do loop de atualizacao
if (bet.odds && bet.odds !== bet.currentOdds) {
  // Determinar nome do job baseado no horario
  const hour = new Date().getHours();
  const jobName = `enrichOdds_${hour}h`;

  const result = await updateBetOdds(bet.id, bet.odds, null, jobName);
  if (result.success) {
    updated++;
    // ...
  }
}
```

#### 2. adminGroup.js - handleOddsCommand

```javascript
// Linha ~119, chamada existente
const updateResult = await updateBetOdds(
  betId,
  odds,
  `Odds manual via admin: ${odds}`,
  'manual_admin_/odds'  // Novo parametro
);
```

### Padrao de jobName

| Contexto | Formato jobName | Exemplo |
|----------|-----------------|---------|
| enrichOdds job | `enrichOdds_HHh` | `enrichOdds_08h`, `enrichOdds_13h` |
| Admin manual /odds | `manual_admin_/odds` | `manual_admin_/odds` |
| Scraping (Epic 15) | `scraping_HHhMM` | `scraping_09h30` |
| Nova analise | `analysis_pipeline` | `analysis_pipeline` |

### Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `bot/services/betService.js` | MODIFICAR | Adicionar registrarOddsHistory, atualizar updateBetOdds |
| `bot/jobs/enrichOdds.js` | MODIFICAR | Passar jobName nas chamadas |
| `bot/handlers/adminGroup.js` | MODIFICAR | Passar jobName na chamada handleOddsCommand |

### Consideracoes de Performance

- Registro e async mas nao bloqueia operacao principal
- Falha no historico e logada como warning, nao como error
- Nao duplica registros quando odds nao muda (comparacao com tolerancia)

### Project Structure Notes

- Segue padrao de response `{ success, data/error }` para registrarOddsHistory
- Best-effort: falha no historico nao impede atualizacao da aposta
- Logger usa nivel debug para sucesso, warn para falhas

### References

- [Source: bot/services/betService.js:683-710] - Funcao updateBetOdds atual
- [Source: bot/jobs/enrichOdds.js:214-237] - Loop de atualizacao de odds
- [Source: bot/handlers/adminGroup.js:88-152] - handleOddsCommand
- [Source: _bmad-output/planning-artifacts/epics.md#story-14.8] - Definicao original
- [Source: _bmad-output/implementation-artifacts/14-7-criar-tabela-odds-update-history.md] - Dependencia

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/services/betService.js (modificar)
- bot/jobs/enrichOdds.js (modificar)
- bot/handlers/adminGroup.js (modificar)
