# Story 7.1: Implementar Repostagem de Apostas Ativas

Status: done

## Story

As a bot,
I want repostar apostas ativas nos horários programados,
So that membros do grupo recebam as apostas 3x ao dia até o jogo acontecer.

## Acceptance Criteria

1. **Given** apostas com `bet_status = 'posted'` e jogo ainda não iniciado
   **When** horário de postagem (10h, 15h, 22h) chega
   **Then** bot reposta essas apostas no grupo público

2. **Given** já existem 3 apostas ativas (posted)
   **When** job de postagem executa
   **Then** não busca novas apostas do status `ready`
   **And** apenas reposta as 3 ativas existentes

3. **Given** uma aposta ativa cujo jogo terminou
   **When** job de postagem executa
   **Then** essa aposta não é mais repostada
   **And** uma nova aposta de status `ready` pode ocupar o slot vago

4. **Given** processo de repostagem
   **When** mensagem é enviada
   **Then** loga sucesso com bet ID e message ID
   **And** não atualiza `telegram_posted_at` (mantém data original)

## Tasks / Subtasks

- [ ] **Task 1: Criar função `getActiveBetsForRepost()`** (AC: #1, #2)
  - [ ] 1.1 Criar query em `betService.js` para buscar bets `posted` com jogo futuro
  - [ ] 1.2 Incluir join com `league_matches` para obter dados do jogo
  - [ ] 1.3 Filtrar `kickoff_time > now()` (jogo ainda não começou)
  - [ ] 1.4 Ordenar por `kickoff_time` (mais próximo primeiro)

- [ ] **Task 2: Criar função `repostActiveBets()`** (AC: #1, #4)
  - [ ] 2.1 Criar função em `postBets.js`
  - [ ] 2.2 Para cada bet ativa, formatar mensagem com template aleatório
  - [ ] 2.3 Enviar via `sendToPublic()`
  - [ ] 2.4 Logar sucesso/falha sem atualizar `telegram_posted_at`

- [ ] **Task 3: Refatorar `runPostBets()` para nova lógica** (AC: #1, #2, #3)
  - [ ] 3.1 Remover `return` quando `availableSlots === 0`
  - [ ] 3.2 Primeiro: chamar `repostActiveBets()` para bets ativas
  - [ ] 3.3 Segundo: se `availableSlots > 0`, buscar novas bets `ready`
  - [ ] 3.4 Postar novas bets apenas nos slots vagos

- [ ] **Task 4: Adicionar logs de debug** (AC: #4)
  - [ ] 4.1 Log no início do job: período, hora atual
  - [ ] 4.2 Log após buscar bets ativas: quantidade encontrada
  - [ ] 4.3 Log após repostar: bet IDs repostadas
  - [ ] 4.4 Log de slots disponíveis para novas bets

## Dev Notes

### Problema Atual (Root Cause)

O código atual em `postBets.js` linha 172-175:

```javascript
if (availableSlots === 0) {
  logger.info('No posting slots available');
  return { posted: 0, skipped: 0 };
}
```

Quando há 3 bets ativas (`posted`), `availableSlots = 0` e o job retorna imediatamente **sem repostar as bets existentes**. Isso significa que após a primeira postagem, nenhuma mensagem é enviada novamente.

### Fluxo Esperado

```
1. Job inicia (10h, 15h ou 22h)
2. Busca bets com status='posted' e kickoff_time > now()
3. Para cada bet ativa encontrada:
   - Formata mensagem
   - Envia para grupo público
   - Loga sucesso (NÃO atualiza timestamp)
4. Calcula slots disponíveis (3 - bets ativas cujo jogo não terminou)
5. Se slots > 0:
   - Busca bets com status='ready'
   - Posta até preencher slots
   - Atualiza status para 'posted'
6. Retorna resultado
```

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/betService.js` | Adicionar `getActiveBetsForRepost()` |
| `bot/jobs/postBets.js` | Adicionar `repostActiveBets()` e refatorar `runPostBets()` |

### Código de Referência

**betService.js - Nova função:**

```javascript
async function getActiveBetsForRepost() {
  const { data, error } = await supabase
    .from('suggested_bets')
    .select(`
      id, match_id, bet_market, bet_pick, odds_at_post, reasoning, deep_link,
      league_matches!inner (
        home_team_name, away_team_name, kickoff_time
      )
    `)
    .eq('bet_status', 'posted')
    .gte('league_matches.kickoff_time', new Date().toISOString())
    .order('league_matches.kickoff_time', { ascending: true });
  
  // Flatten response...
}
```

**postBets.js - Nova lógica:**

```javascript
async function runPostBets() {
  // 1. Repostar bets ativas
  const activeResult = await getActiveBetsForRepost();
  if (activeResult.success && activeResult.data.length > 0) {
    await repostActiveBets(activeResult.data);
  }
  
  // 2. Calcular slots vagos
  const availableSlots = await calculatePostingSlots();
  
  // 3. Preencher slots com novas bets
  if (availableSlots > 0) {
    const newBets = await getBetsReadyForPosting();
    // ... postar novas bets
  }
}
```

### Considerações Importantes

1. **Não duplicar mensagens**: Cada bet ativa é repostada uma vez por período
2. **Usar `odds_at_post`** na repostagem (não `odds` atual)
3. **Manter `deep_link`** original
4. **Logs claros** para debug em produção

### Testes Manuais Sugeridos

1. Criar bet com status `posted` e jogo futuro
2. Rodar `node bot/jobs/postBets.js morning`
3. Verificar se mensagem foi enviada ao grupo
4. Verificar logs no console

### References

- [Source: bot/jobs/postBets.js] - Job atual de postagem
- [Source: bot/services/betService.js] - Funções de acesso ao BD
- [Source: _bmad-output/planning-artifacts/prd-addendum-v2.md#BUG-001] - Descrição do bug

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (2026-01-11)

### Debug Log References

N/A - Implementação direta sem necessidade de debug

### Completion Notes List

1. ✅ Criada função `getActiveBetsForRepost()` em betService.js
2. ✅ Criada função `repostActiveBets()` em postBets.js
3. ✅ Refatorada `runPostBets()` para nova lógica de repostagem
4. ✅ Adicionados logs detalhados em todos os passos
5. ✅ Removido `return` prematuro quando `availableSlots === 0`
6. ✅ Fluxo agora: primeiro reposta ativas, depois preenche slots com novas

### File List

| Arquivo | Modificação |
|---------|-------------|
| `bot/services/betService.js` | +50 linhas - Nova função `getActiveBetsForRepost()` |
| `bot/jobs/postBets.js` | +60 linhas - Nova função `repostActiveBets()` e refatoração de `runPostBets()` |
