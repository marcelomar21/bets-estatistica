# Story 5.1: Distribuição Round-robin de Apostas entre Grupos

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **sistema**,
I want distribuir apostas geradas entre os grupos ativos via round-robin,
So that cada influencer receba apostas diferentes sem repetição.

## Acceptance Criteria

1. **AC1: Distribuição round-robin entre grupos ativos**
   - Given o pool de apostas foi gerado (FR17 — sistema existente em `agent/pipeline.js`)
   - When o job de distribuição roda
   - Then apostas elegíveis (`elegibilidade = 'elegivel'`, `group_id IS NULL`, `distributed_at IS NULL`) são distribuídas via round-robin entre grupos com `status = 'active'` apenas (pre-mortem)
   - And cada aposta recebe `group_id` e `distributed_at = NOW()` na tabela `suggested_bets` (FR18, FR19)
   - And grupos com `status` diferente de `'active'` (paused, inactive, failed, creating) NÃO recebem apostas
   - And logging registra cada distribuição: aposta ID → grupo ID → timestamp com prefixo `[bets:distribute]`

2. **AC2: Grupo único recebe todas**
   - Given apenas 1 grupo ativo existe no sistema
   - When o job de distribuição roda
   - Then todas as apostas elegíveis são atribuídas a esse grupo único
   - And o round-robin continua funcionando normalmente (sem erro)

3. **AC3: Sem grupos ativos — nenhuma distribuição**
   - Given nenhum grupo com `status = 'active'` existe
   - When o job de distribuição roda
   - Then nenhuma aposta é distribuída (todas permanecem com `group_id IS NULL`)
   - And alerta é enviado ao Super Admin: "Nenhum grupo ativo para distribuição de apostas"
   - And job termina sem erro

4. **AC4: Postagem filtra por group_id do bot**
   - Given apostas foram distribuídas para um grupo específico
   - When o bot desse grupo executa `postBets.js`
   - Then `getFilaStatus()` retorna apenas apostas com `group_id` igual ao `GROUP_ID` do bot
   - And apostas de outros grupos NÃO aparecem na fila
   - And apostas sem `group_id` (não distribuídas) NÃO aparecem na fila

5. **AC5: Fallback single-tenant**
   - Given o bot roda SEM `GROUP_ID` configurado (modo single-tenant legado)
   - When `postBets.js` executa
   - Then comportamento atual é mantido: busca todas as apostas elegíveis sem filtro de `group_id`
   - And backward compatibility é preservada

6. **AC6: Idempotência — apostas já distribuídas não são redistribuídas**
   - Given apostas já possuem `group_id` e `distributed_at` definidos
   - When o job de distribuição roda novamente
   - Then essas apostas NÃO são redistribuídas
   - And apenas apostas com `group_id IS NULL` são processadas

7. **AC7: Distribuição equilibrada**
   - Given N grupos ativos e M apostas para distribuir
   - When o round-robin executa
   - Then cada grupo recebe aproximadamente M/N apostas (diferença máxima de 1 aposta entre grupos)
   - And a ordem de distribuição é determinística e rastreável via logs

## Tasks / Subtasks

- [x] Task 1: Criar job `distributeBets.js` com lógica round-robin (AC: #1, #2, #3, #6, #7)
  - [x] 1.1 Criar `bot/jobs/distributeBets.js` com entry point `runDistributeBets()`
  - [x] 1.2 Implementar `getActiveGroups()`: query `groups` WHERE `status = 'active'` ORDER BY `created_at ASC`
  - [x] 1.3 Implementar `getUndistributedBets()`: query `suggested_bets` WHERE `elegibilidade = 'elegivel'` AND `group_id IS NULL` AND `distributed_at IS NULL` AND `bet_status != 'posted'` — ordenar por `kickoff_time ASC` (próximos jogos primeiro)
  - [x] 1.4 Implementar `distributeRoundRobin(bets, groups)`: atribuir apostas ciclicamente (bet[0]→group[0], bet[1]→group[1], ..., bet[N]→group[0], ...)
  - [x] 1.5 Implementar `assignBetToGroup(betId, groupId)`: UPDATE `suggested_bets` SET `group_id = groupId`, `distributed_at = NOW()` WHERE `id = betId` AND `group_id IS NULL` (idempotente)
  - [x] 1.6 Tratar caso sem grupos ativos: log warning + alertAdmin + return sem erro (AC #3)
  - [x] 1.7 Tratar caso sem apostas para distribuir: log info + return sem erro
  - [x] 1.8 Logging completo com prefixo `[bets:distribute]`: resumo final com contagem por grupo

- [x] Task 2: Adaptar `betService.js` para filtrar por group_id (AC: #4, #5)
  - [x] 2.1 Em `getFilaStatus()` (line ~1226): quando `config.membership.groupId` está definido, adicionar `.eq('group_id', groupId)` nas queries de `ativas` e `novas`
  - [x] 2.2 Em `getEligibleBets()` (line ~13): quando `groupId` está definido, adicionar filtro `.eq('group_id', groupId)`
  - [x] 2.3 Em `getBetsReadyForPosting()` (line ~87): quando `groupId` está definido, adicionar filtro `.eq('group_id', groupId)`
  - [x] 2.4 Em `getActiveBetsForRepost()` (line ~280): quando `groupId` está definido, adicionar filtro `.eq('group_id', groupId)`
  - [x] 2.5 Em `getAvailableBets()` (line ~338): quando `groupId` está definido, adicionar filtro `.eq('group_id', groupId)`
  - [x] 2.6 Fallback single-tenant: se `config.membership.groupId` é `null`, NÃO adicionar filtro (comportamento legado preservado — AC #5)

- [x] Task 3: Adaptar `postBets.js` para contexto multi-tenant (AC: #4, #5)
  - [x] 3.1 Em `runPostBets()` (line ~390): passar `groupId` para chamadas de `getFilaStatus()` se `config.membership.groupId` estiver definido
  - [x] 3.2 Garantir que `markBetAsPosted()` não sobrescreve `group_id` já atribuído pela distribuição
  - [x] 3.3 Log do grupo ao postar: `[postBets] Posting bet ${betId} for group ${groupId}`

- [x] Task 4: Testes cobrindo distribuição round-robin (AC: #1-#7)
  - [x] 4.1 Testar: 6 apostas, 3 grupos → cada grupo recebe 2 apostas
  - [x] 4.2 Testar: 7 apostas, 3 grupos → grupos recebem 3, 2, 2 (ou 2, 3, 2) apostas
  - [x] 4.3 Testar: 5 apostas, 1 grupo → grupo recebe todas as 5
  - [x] 4.4 Testar: 0 grupos ativos → nenhuma distribuição, alerta admin
  - [x] 4.5 Testar: 0 apostas para distribuir → log info, sem erro
  - [x] 4.6 Testar: idempotência — rodar 2x seguidas, segunda vez não redistribui
  - [x] 4.7 Testar: apostas já distribuídas (group_id != NULL) são ignoradas
  - [x] 4.8 Testar: grupos pausados/inativos NÃO recebem apostas
  - [x] 4.9 Testar: `getFilaStatus()` com `GROUP_ID` definido retorna apenas apostas do grupo
  - [x] 4.10 Testar: `getFilaStatus()` sem `GROUP_ID` retorna todas as apostas (fallback)

## Dev Notes

### Contexto Crítico: Infraestrutura de Colunas JÁ Existe, Falta Lógica

**As colunas `group_id` e `distributed_at` em `suggested_bets` JÁ EXISTEM** (migration 019_multitenant.sql, linhas 68-72). O trabalho é **criar a lógica de distribuição** e **adaptar as queries existentes** para respeitar o `group_id`.

**O que JÁ funciona:**

| Componente | Arquivo | Status |
|------------|---------|--------|
| Coluna `suggested_bets.group_id` | `sql/migrations/019_multitenant.sql:69` | ✅ Existe (nullable UUID, FK → groups) |
| Coluna `suggested_bets.distributed_at` | `sql/migrations/019_multitenant.sql:72` | ✅ Existe (TIMESTAMPTZ) |
| Índice `idx_suggested_bets_group_id` | `sql/migrations/019_multitenant.sql:78` | ✅ Existe |
| Tabela `groups` com `status` | `sql/migrations/019_multitenant.sql:13-24` | ✅ Existe |
| Config `config.membership.groupId` | `lib/config.js:56` | ✅ Lê `GROUP_ID` do env |
| RLS policies em `suggested_bets` | `sql/migrations/019_multitenant.sql:205-216` | ✅ Existe (service_role bypassa) |
| `getFilaStatus()` | `bot/services/betService.js:1226-1391` | ❌ NÃO filtra por group_id |
| `getEligibleBets()` | `bot/services/betService.js:13-78` | ❌ NÃO filtra por group_id |
| `getBetsReadyForPosting()` | `bot/services/betService.js:87-163` | ❌ NÃO filtra por group_id |
| `getActiveBetsForRepost()` | `bot/services/betService.js:280-331` | ❌ NÃO filtra por group_id |
| `getAvailableBets()` | `bot/services/betService.js:338-400` | ❌ NÃO filtra por group_id |
| Job de distribuição | — | ❌ NÃO existe (criar `bot/jobs/distributeBets.js`) |

### Algoritmo Round-Robin — Design

```
distributeBets.js (executar ANTES de postBets.js)
    ├─ getActiveGroups()              ← query groups WHERE status = 'active' ORDER BY created_at ASC
    ├─ getUndistributedBets()         ← query suggested_bets WHERE elegibilidade = 'elegivel'
    │                                    AND group_id IS NULL AND distributed_at IS NULL
    │                                    AND bet_status != 'posted'
    │                                    ORDER BY kickoff_time ASC
    ├─ distributeRoundRobin(bets, groups):
    │   ├─ for (let i = 0; i < bets.length; i++):
    │   │   ├─ groupIndex = i % groups.length
    │   │   └─ assignBetToGroup(bets[i].id, groups[groupIndex].id)
    │   └─ return { distributed: bets.length, perGroup: countPerGroup }
    └─ Resumo: logger.info('[bets:distribute] Distribuídas X apostas para Y grupos', { perGroup })
```

**Por que ORDER BY `created_at ASC` nos grupos:** Garante ordem determinística e estável. Se novos grupos forem adicionados, eles entram no final do round-robin sem alterar a distribuição dos grupos existentes.

**Por que ORDER BY `kickoff_time ASC` nas apostas:** Jogos mais próximos são distribuídos primeiro, garantindo que a distribuição priorize urgência.

### Padrão de Filtro Multi-tenant em betService.js

```javascript
// ✅ Padrão para TODAS as funções de query em betService.js
const groupId = config.membership.groupId;

let query = supabase
  .from('suggested_bets')
  .select('*')
  .eq('elegibilidade', 'elegivel');

// 🔒 Multi-tenant: filtrar por group_id quando definido
if (groupId) {
  query = query.eq('group_id', groupId);
}
// Fallback single-tenant: sem filtro (comportamento legado)

const { data, error } = await query;
```

**IMPORTANTE:** O filtro deve ser adicionado DENTRO de cada função que já existe, NÃO como wrapper externo. Isso preserva a lógica específica de cada função (filtros de status, ordenação, limites).

### Fluxo de Execução — Ordem dos Jobs

```
Pipeline diário:
  1. agent/pipeline.js      → Gera apostas (pool global, sem group_id)
  2. bot/jobs/enrichOdds.js  → Enriquece com odds da API
  3. bot/jobs/requestLinks.js → Solicita links ao admin
  ──────── NOVO ─────────
  4. bot/jobs/distributeBets.js → Round-robin: atribui group_id + distributed_at
  ──────── EXISTENTE (ADAPTAR) ─────────
  5. bot/jobs/postBets.js    → Cada bot posta SÓ as apostas do seu group_id
```

**Quando rodar o distributeBets.js:**
- Deve rodar APÓS o pipeline gerar apostas e ANTES do postBets.js
- Pode ser executado manualmente: `node bot/jobs/distributeBets.js`
- Em produção: via cron ou integrado ao pipeline
- Sugestão: rodar logo antes do postBets (ex: 09:50 se postBets roda 10:00)

### Padrão de assignBetToGroup — Idempotência

```javascript
// ✅ Idempotente: WHERE group_id IS NULL previne redistribuição
async function assignBetToGroup(betId, groupId) {
  const { data, error } = await supabase
    .from('suggested_bets')
    .update({
      group_id: groupId,
      distributed_at: new Date().toISOString()
    })
    .eq('id', betId)
    .is('group_id', null)  // ← CRÍTICO: só atribui se ainda não foi distribuída
    .select('id, group_id, distributed_at');

  if (error) {
    logger.error('[bets:distribute] Erro ao atribuir aposta', { betId, groupId, error: error.message });
    return { success: false, error: { code: 'DISTRIBUTION_ERROR', message: error.message } };
  }

  if (!data || data.length === 0) {
    logger.warn('[bets:distribute] Aposta já distribuída ou não encontrada', { betId });
    return { success: true, data: { alreadyDistributed: true } };
  }

  logger.info('[bets:distribute] Aposta atribuída', { betId, groupId });
  return { success: true, data: data[0] };
}
```

### markBetAsPosted — NÃO Sobrescrever group_id

```javascript
// ✅ ATUAL em betService.js:462-468
async function markBetAsPosted(betId, messageId, oddsAtPost) {
  return updateBetStatus(betId, 'posted', {
    telegram_posted_at: new Date().toISOString(),
    telegram_message_id: messageId,
    odds_at_post: oddsAtPost,
    // ⚠️ NÃO incluir group_id aqui — já foi atribuído por distributeBets
  });
}
```

**Verificar que `updateBetStatus()` não zera o `group_id` ao atualizar.** Olhar a implementação em `betService.js` — se faz spread de campos, está ok. Se reescreve toda a row, cuidado.

### Adaptação de getFilaStatus() — Exemplo Concreto

A função `getFilaStatus()` (betService.js:1226-1391) tem 2 queries principais que precisam de filtro:

**Query de `ativas` (apostas já postadas, para repost):**
```javascript
// Adicionar filtro group_id AQUI
let ativasQuery = supabase
  .from('suggested_bets')
  .select('...')
  .eq('bet_status', 'posted')
  .gte('kickoff_time', someDateCutoff);

if (groupId) {
  ativasQuery = ativasQuery.eq('group_id', groupId);
}
```

**Query de `novas` (elegíveis não postadas, para nova postagem):**
```javascript
// Adicionar filtro group_id AQUI
let novasQuery = supabase
  .from('suggested_bets')
  .select('...')
  .eq('elegibilidade', 'elegivel')
  .neq('bet_status', 'posted');

if (groupId) {
  novasQuery = novasQuery.eq('group_id', groupId);
}
```

### Learnings das Stories Anteriores (Epic 4)

- **Multi-tenant group resolution:** usar `config.membership.groupId` para saber qual grupo o bot atende (padrão estabelecido em stories 4.3-4.5)
- **DMs são "best-effort":** falha de DM NUNCA impede operação principal
- **Service Response Pattern:** `{ success: true/false, data/error }` — OBRIGATÓRIO
- **Logging:** prefixo `[module:job-name]` — NUNCA `console.log`
- **Supabase:** via `lib/supabase.js` — NUNCA instanciar novo cliente
- **Fallback single-tenant:** quando `GROUP_ID` não está definido, manter comportamento legado
- **Baseline de testes:** 788 testes passando pós-story 4.5

### Git Intelligence

**Commits recentes (Epic 4):**
```
3540c3d Merge PR #29 (story 4.5 - kick-expired multi-tenant)
66bd3c0 fix(bot): close story 4.5 review findings
fd8fcde feat(bot): adapt kick-expired job for multi-tenant (story 4.5)
41479f0 Merge PR #28 (story 4.4 - acesso instantâneo)
```

**Branch naming pattern:** `feature/story-5.1-distribuicao-round-robin-de-apostas-entre-grupos`
**Commit pattern:** `feat(bot): implement round-robin bet distribution (story 5.1)`

### Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Distribution job roda DEPOIS de postBets | Apostas postadas sem group_id | Garantir ordem de execução: distribute → postBets |
| Novo grupo adicionado no meio de distribuição | Grupo pode não receber apostas nesse round | Não é problema: receberá no próximo round |
| Pipeline gera apostas enquanto distribuição roda | Race condition | `group_id IS NULL` no WHERE do update é atômico no PostgreSQL |
| `updateBetStatus()` zera group_id | Perde distribuição ao postar | Verificar que o update faz merge, não replace |
| Grupo desativado APÓS distribuição | Apostas atribuídas a grupo inativo | Bot desse grupo não vai rodar postBets (deploy parado), apostas ficam sem postar — aceito para MVP |
| Regressão em testes existentes | Suite quebrada | Baseline: 788 testes — rodar antes e depois |

### Project Structure Notes

**Arquivos NOVOS:**
- `bot/jobs/distributeBets.js` — Job principal de distribuição round-robin
- `__tests__/jobs/distributeBets.test.js` — Testes do job

**Arquivos MODIFICADOS:**
- `bot/services/betService.js` — Adicionar filtro `group_id` em 5 funções de query
- `bot/jobs/postBets.js` — Adaptar para passar/logar `groupId`

**Nenhuma migration SQL necessária** — colunas `group_id` e `distributed_at` já existem em `suggested_bets`.

**Admin panel NÃO é modificado nesta story** — visualização de apostas por grupo virá na Story 5.2.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.1]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md — Distribuição round-robin, groups table schema]
- [Source: _bmad-output/planning-artifacts/prd.md — FR17-FR19, NFR-P1]
- [Source: _bmad-output/project-context.md — Bet State Machines, Multi-Tenant Rules, Service Response Pattern]
- [Source: sql/migrations/019_multitenant.sql:68-78 — group_id e distributed_at em suggested_bets]
- [Source: bot/services/betService.js:1226-1391 — getFilaStatus()]
- [Source: bot/services/betService.js:13-78 — getEligibleBets()]
- [Source: bot/services/betService.js:87-163 — getBetsReadyForPosting()]
- [Source: bot/services/betService.js:280-331 — getActiveBetsForRepost()]
- [Source: bot/services/betService.js:338-400 — getAvailableBets()]
- [Source: bot/services/betService.js:462-468 — markBetAsPosted()]
- [Source: bot/jobs/postBets.js:390-573 — runPostBets()]
- [Source: lib/config.js:56 — config.membership.groupId]
- [Source: stories/4-5-kick-automatico-de-membros-expirados.md — Previous story learnings, 788 tests baseline]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum debug necessário — implementação direta sem bloqueios.

### Completion Notes List

- Task 1: Criado `bot/jobs/distributeBets.js` com 5 funções exportadas: `runDistributeBets()`, `getActiveGroups()`, `getUndistributedBets()`, `distributeRoundRobin()`, `assignBetToGroup()`. Algoritmo round-robin determinístico (ORDER BY created_at ASC nos grupos, kickoff_time ASC nas apostas). Idempotência garantida via `WHERE group_id IS NULL` no UPDATE. Alert admin quando zero grupos ativos. Executável como CLI: `node bot/jobs/distributeBets.js`.
- Task 2: Adaptadas 5 funções em `betService.js` para filtrar por `group_id` quando `config.membership.groupId` está definido: `getEligibleBets()`, `getBetsReadyForPosting()`, `getActiveBetsForRepost()`, `getAvailableBets()`, `getFilaStatus()` (2 queries internas). Padrão: `let query = ...; if (groupId) { query = query.eq('group_id', groupId); }`. Fallback single-tenant preservado (sem filtro quando groupId é null).
- Task 3: Adaptado `postBets.js` com logging de `groupId` no início do job e em cada postagem. `runPostBets()` agora passa `groupId` explicitamente para `getFilaStatus(groupId)` quando configurado. Verificado que `markBetAsPosted()` faz spread de campos específicos, não sobrescreve `group_id`.
- Task 4: 26 testes em 2 arquivos: `distributeBets.test.js` (19 testes — round-robin, grupo único, sem grupos, idempotência (incluindo execução 2x), grupos inativos, funções unitárias e falha parcial) e `betService.multitenant.test.js` (7 testes — filtro group_id em todas as 5 funções + fallback single-tenant). Todos passando.
- Regressão pós-review: `26/26` testes da story passando (`npm test -- __tests__/jobs/distributeBets.test.js __tests__/services/betService.multitenant.test.js`).

### Change Log

- 2026-02-10: Implementação completa da story 5.1 — distribuição round-robin de apostas entre grupos multi-tenant, adaptação de 5 funções de query para filtrar por group_id, e 24 novos testes cobrindo todos os ACs.
- 2026-02-10: Ajustes de code review aplicados — `getFilaStatus(groupId)` com filtro também na contagem, `runPostBets()` passando `groupId` explicitamente, tratamento de falha parcial no `distributeBets` com `success: false` + alerta admin, e fortalecimento dos testes (26 no total).

### File List

- `bot/jobs/distributeBets.js` — NOVO — Job de distribuição round-robin
- `bot/services/betService.js` — MODIFICADO — Filtro group_id em 5 funções de query
- `bot/jobs/postBets.js` — MODIFICADO — Logging de groupId no contexto multi-tenant
- `__tests__/jobs/distributeBets.test.js` — NOVO — 19 testes do job de distribuição (inclui idempotência 2x e falha parcial)
- `__tests__/services/betService.multitenant.test.js` — NOVO — 7 testes multi-tenant do betService
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFICADO — Status 5-1 atualizado
- `_bmad-output/implementation-artifacts/stories/5-1-distribuicao-round-robin-de-apostas-entre-grupos.md` — MODIFICADO — Tasks marcadas, Dev Agent Record

### Senior Developer Review (AI)

**Reviewer:** Codex (GPT-5)  
**Data:** 2026-02-10  
**Outcome:** Changes Requested → Fixed

**Findings corrigidos nesta rodada:**
- Corrigido isolamento de tenant na contagem de `getFilaStatus()` (`counts` agora respeita `group_id` quando `GROUP_ID` está definido).
- `runPostBets()` passou a injetar `groupId` explicitamente em `getFilaStatus(groupId)`, alinhando implementação com a task declarada.
- `runDistributeBets()` agora retorna erro quando há falhas parciais de distribuição e alerta o admin.
- Cobertura de testes reforçada para:
  - Idempotência real com duas execuções sequenciais do job.
  - Cenário de falha parcial de distribuição.
  - Verificação mais estrita de filtros `group_id` em `getFilaStatus()`.
  - Garantia de query por `status = 'active'` para exclusão de grupos inativos.

**Git vs Story audit:**
- Foram identificados 18 arquivos alterados fora do escopo da story (principalmente `_bmad`/`_bmad-output`), documentados como mudanças de workspace não relacionadas ao código-fonte da feature.
