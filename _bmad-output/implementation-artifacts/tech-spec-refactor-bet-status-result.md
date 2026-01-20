# Tech Spec: Separação bet_status e bet_result

**Data:** 2026-01-20
**Autor:** John (PM) + Winston (Architect)
**Status:** Draft

---

## 1. Problema

A coluna `bet_status` está sobrecarregada - mistura **estado do fluxo de publicação** com **resultado do jogo**:

```
generated → pending_link → ready → posted → success/failure/cancelled
                                            ↑
                                   Conceitos diferentes!
```

**Bug descoberto:** O job `enrichOdds.js` reseta apostas já publicadas (`posted`) para `pending_link` quando o mercado não é suportado pela API. Isso acontece porque `pending_link` está sendo usado incorretamente para indicar "aguardando odds manual".

**Apostas afetadas:** 9 apostas com `telegram_posted_at` preenchido mas `bet_status = 'pending_link'` (IDs: 79, 86, 87, 111, 143, 147, 391, 415, 422).

---

## 2. Solução

Separar em duas colunas ortogonais:

### 2.1 `bet_status` (fluxo de publicação)

| Status | Condição |
|--------|----------|
| `generated` | Sem odds E sem link |
| `pending_link` | Com odds, sem link |
| `pending_odds` | Sem odds, com link (NOVO) |
| `ready` | Com odds E com link |
| `posted` | Publicada no Telegram |

### 2.2 `bet_result` (resultado do jogo) - NOVA COLUNA

| Result | Significado |
|--------|-------------|
| `pending` | Aguardando resultado (default) |
| `success` | Aposta ganhou |
| `failure` | Aposta perdeu |
| `cancelled` | Cancelada |

---

## 3. Regras de Negócio

### 3.1 Determinação automática do status

```javascript
function determineStatus(currentStatus, odds, deepLink, minOdds) {
  // Nunca regride de posted
  if (currentStatus === 'posted') return 'posted';

  const hasOdds = odds && odds >= minOdds;
  const hasLink = !!deepLink;

  if (hasOdds && hasLink) return 'ready';
  if (hasOdds && !hasLink) return 'pending_link';
  if (!hasOdds && hasLink) return 'pending_odds';
  return 'generated';
}
```

### 3.2 Transições válidas de status

| De | Para | Trigger |
|----|------|---------|
| `generated` | `pending_link` | Recebe odds |
| `generated` | `pending_odds` | Recebe link |
| `pending_link` | `ready` | Recebe link |
| `pending_odds` | `ready` | Recebe odds |
| `ready` | `posted` | Publicada no Telegram |

### 3.3 Transições válidas de result

| De | Para | Trigger |
|----|------|---------|
| `pending` | `success` | Jogo terminou, aposta ganhou |
| `pending` | `failure` | Jogo terminou, aposta perdeu |
| `pending` | `cancelled` | Cancelada manualmente ou por timeout |

---

## 4. Migração de Dados

### 4.1 SQL Migration

```sql
-- ================================================
-- Migration: 012_separate_status_result.sql
-- ================================================

-- 1. Remover constraint antiga
ALTER TABLE suggested_bets
  DROP CONSTRAINT IF EXISTS suggested_bets_status_check;

-- 2. Adicionar coluna bet_result
ALTER TABLE suggested_bets
  ADD COLUMN IF NOT EXISTS bet_result TEXT NOT NULL DEFAULT 'pending';

-- 3. Migrar dados existentes (ANTES de mudar constraint)
UPDATE suggested_bets
  SET bet_result = 'success', bet_status = 'posted'
  WHERE bet_status = 'success';

UPDATE suggested_bets
  SET bet_result = 'failure', bet_status = 'posted'
  WHERE bet_status = 'failure';

UPDATE suggested_bets
  SET bet_result = 'cancelled', bet_status = 'ready'
  WHERE bet_status = 'cancelled';

-- 4. Corrigir apostas inconsistentes (telegram_posted_at mas status errado)
UPDATE suggested_bets
  SET bet_status = 'posted'
  WHERE telegram_posted_at IS NOT NULL
    AND bet_status NOT IN ('posted');

-- 5. Adicionar novas constraints
ALTER TABLE suggested_bets
  ADD CONSTRAINT suggested_bets_status_check
  CHECK (bet_status IN ('generated', 'pending_link', 'pending_odds', 'ready', 'posted'));

ALTER TABLE suggested_bets
  ADD CONSTRAINT suggested_bets_result_check
  CHECK (bet_result IN ('pending', 'success', 'failure', 'cancelled'));

-- 6. Índice para result
CREATE INDEX IF NOT EXISTS idx_suggested_bets_result
  ON suggested_bets (bet_result);

-- 7. Atualizar índice de status
DROP INDEX IF EXISTS idx_suggested_bets_status;
CREATE INDEX idx_suggested_bets_status
  ON suggested_bets (bet_status);
```

### 4.2 Rollback (se necessário)

```sql
-- Rollback migration
ALTER TABLE suggested_bets DROP CONSTRAINT IF EXISTS suggested_bets_result_check;
ALTER TABLE suggested_bets DROP CONSTRAINT IF EXISTS suggested_bets_status_check;

UPDATE suggested_bets SET bet_status = bet_result WHERE bet_result IN ('success', 'failure', 'cancelled');

ALTER TABLE suggested_bets DROP COLUMN IF EXISTS bet_result;

ALTER TABLE suggested_bets
  ADD CONSTRAINT suggested_bets_status_check
  CHECK (bet_status IN ('generated', 'pending_link', 'ready', 'posted', 'success', 'failure', 'cancelled'));
```

---

## 5. Arquivos a Modificar

### 5.1 Banco de Dados

| Arquivo | Mudança |
|---------|---------|
| `sql/migrations/012_separate_status_result.sql` | Nova migration |
| `sql/migrations/001_initial_schema.sql` | Atualizar comentários/documentação |

### 5.2 Services

| Arquivo | Mudança |
|---------|---------|
| `bot/services/betService.js` | Adicionar `determineStatus()`, `updateBetResult()`, ajustar queries |
| `bot/services/metricsService.js` | Usar `bet_result` para calcular taxa de acerto |

### 5.3 Jobs

| Arquivo | Mudança |
|---------|---------|
| `bot/jobs/enrichOdds.js` | Usar `determineStatus()` em vez de `setBetPendingWithNote()` |
| `bot/jobs/trackResults.js` | Atualizar `bet_result` em vez de `bet_status` |
| `bot/jobs/postBets.js` | Manter (já filtra por status correto) |

### 5.4 Handlers

| Arquivo | Mudança |
|---------|---------|
| `bot/handlers/adminGroup.js` | Exibir `bet_result` nos comandos de status |

### 5.5 Documentação

| Arquivo | Mudança |
|---------|---------|
| `_bmad-output/project-context.md` | Atualizar state machines |

---

## 6. Implementação Detalhada

### 6.1 betService.js - Nova função determineStatus

```javascript
/**
 * Determina o status correto baseado em odds e link
 * @param {string} currentStatus - Status atual
 * @param {number|null} odds - Odds da aposta
 * @param {string|null} deepLink - Link da aposta
 * @returns {string} - Novo status
 */
function determineStatus(currentStatus, odds, deepLink) {
  // Nunca regride de posted
  if (currentStatus === 'posted') return 'posted';

  const hasOdds = odds && odds >= config.betting.minOdds;
  const hasLink = !!deepLink;

  if (hasOdds && hasLink) return 'ready';
  if (hasOdds && !hasLink) return 'pending_link';
  if (!hasOdds && hasLink) return 'pending_odds';
  return 'generated';
}
```

### 6.2 betService.js - Nova função updateBetResult

```javascript
/**
 * Atualiza o resultado de uma aposta
 * @param {number} betId - ID da aposta
 * @param {string} result - Resultado ('success', 'failure', 'cancelled')
 * @returns {Promise<{success: boolean, error?: object}>}
 */
async function updateBetResult(betId, result) {
  try {
    const { error } = await supabase
      .from('suggested_bets')
      .update({
        bet_result: result,
        result_updated_at: new Date().toISOString(),
      })
      .eq('id', betId);

    if (error) {
      logger.error('Failed to update bet result', { betId, result, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('Bet result updated', { betId, result });
    return { success: true };
  } catch (err) {
    logger.error('Error updating bet result', { betId, error: err.message });
    return { success: false, error: { code: 'UPDATE_ERROR', message: err.message } };
  }
}
```

### 6.3 enrichOdds.js - Corrigir requestAdminOdds

```javascript
// ANTES (bug)
for (const bet of data.bets) {
  await setBetPendingWithNote(
    bet.id,
    'Aguardando odds manual do admin (mercado não suportado pela API)'
  );
}

// DEPOIS (corrigido)
for (const bet of data.bets) {
  // Só atualiza status se NÃO estiver posted e NÃO tiver link
  if (bet.betStatus !== 'posted') {
    const newStatus = determineStatus(bet.betStatus, null, bet.deepLink);
    if (newStatus !== bet.betStatus) {
      await updateBetStatus(bet.id, newStatus);
    }
  }
  // Nota: a mensagem para admin ainda é enviada, só não muda status de posted
}
```

### 6.4 trackResults.js - Usar bet_result

```javascript
// ANTES
await updateBetStatus(betId, won ? 'success' : 'failure');

// DEPOIS
await updateBetResult(betId, won ? 'success' : 'failure');
```

### 6.5 metricsService.js - Filtrar por bet_result

```javascript
// ANTES
.in('bet_status', ['success', 'failure'])

// DEPOIS
.in('bet_result', ['success', 'failure'])
```

---

## 7. Testes

### 7.1 Cenários de Teste

| Cenário | Input | Expected |
|---------|-------|----------|
| Aposta nova sem nada | odds=null, link=null | status=`generated` |
| Recebe odds | odds=1.80, link=null | status=`pending_link` |
| Recebe link primeiro | odds=null, link="http..." | status=`pending_odds` |
| Recebe ambos | odds=1.80, link="http..." | status=`ready` |
| Após publicar | posted=true | status=`posted` (nunca regride) |
| enrichOdds em posted | status=posted, mercado não suportado | status=`posted` (não muda) |
| Jogo terminou, ganhou | - | result=`success` |
| Jogo terminou, perdeu | - | result=`failure` |

### 7.2 Testes de Migração

- [ ] Apostas `success` migram para `bet_result='success'`, `bet_status='posted'`
- [ ] Apostas `failure` migram para `bet_result='failure'`, `bet_status='posted'`
- [ ] Apostas com `telegram_posted_at` mas status errado são corrigidas
- [ ] Métricas continuam funcionando após migração

---

## 8. Rollout Plan

> **Nota:** Não há ambiente de staging. Deploy direto em produção.

### Fase 1: Preparação
1. Criar migration SQL
2. Implementar `determineStatus()` e `updateBetResult()`
3. Testar migration localmente (dump do banco se possível)
4. Atualizar testes

### Fase 2: Migration (Produção)
1. **Backup:** Exportar tabela `suggested_bets` antes de rodar
2. Rodar migration em horário de baixo movimento (madrugada BRT)
3. Verificar dados migrados com queries de validação
4. Ter rollback script pronto para execução imediata

### Fase 3: Deploy
1. Deploy do código atualizado
2. Verificar jobs funcionando (`/status` no Telegram)
3. Monitorar logs por 24h

### Fase 4: Cleanup
1. Atualizar documentação (`project-context.md`)
2. Remover função `setBetPendingWithNote` se não for mais usada

---

## 9. Critérios de Aceite

- [ ] Coluna `bet_result` criada com valores corretos
- [ ] Status `pending_odds` funcionando
- [ ] `enrichOdds` não muda status de apostas `posted`
- [ ] Métricas calculam usando `bet_result`
- [ ] 9 apostas inconsistentes corrigidas
- [ ] Testes passando
- [ ] Documentação atualizada

---

## 10. Riscos

| Risco | Mitigação |
|-------|-----------|
| Migration falha em prod | Backup antes, rollback script pronto, rodar madrugada |
| Queries quebram | Atualizar todas as queries antes do deploy |
| Métricas divergem | Validar cálculos antes e depois da migração |
| Sem staging para testar | Testar migration localmente, revisar SQL com cuidado |

---

_Tech Spec gerada em 2026-01-20 por PM John com arquitetura de Architect Winston._
