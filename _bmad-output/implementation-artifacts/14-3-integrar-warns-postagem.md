# Story 14.3: Integrar Warns no Job de Postagem

Status: ready-for-dev

## Story

As a operador,
I want receber warn após cada postagem,
so that saiba o que foi postado e o que está pendente.

## Acceptance Criteria

1. **Given** job de postagem executa (10h, 15h, 22h)
   **When** postagem conclui (sucesso ou falha)
   **Then** chama `sendPostWarn()` com dados coletados
   **And** warn é enviado para grupo admin

2. **Given** warn sendo enviado
   **When** formatando mensagem
   **Then** inclui lista de apostas postadas com:
   - ID, jogo, mercado, odd para cada aposta
   - Indicação se foi repost ou nova postagem

3. **Given** warn sendo enviado
   **When** formatando próximos jogos
   **Then** busca apostas elegíveis dos próximos 2 dias
   **And** agrupa por HOJE e AMANHÃ
   **And** mostra status (pronta, sem link, sem odds)

4. **Given** warn sendo enviado
   **When** formatando ações pendentes
   **Then** lista apostas que precisam de:
   - Link (comando /link ID URL)
   - Odds (comando /atualizar odds)

5. **Given** job falhar completamente
   **When** nenhuma aposta postada
   **Then** warn indica falha
   **And** sugere ação de recuperação

## Tasks / Subtasks

- [ ] Task 1: Importar módulo jobWarn no postBets.js (AC: #1)
  - [ ] 1.1: Adicionar import do sendPostWarn
  - [ ] 1.2: Importar getAvailableBets para buscar próximos jogos

- [ ] Task 2: Coletar dados durante execução (AC: #2)
  - [ ] 2.1: Criar array postedBets para armazenar apostas postadas
  - [ ] 2.2: Armazenar objeto com id, jogo, mercado, odd, tipo (repost/nova)
  - [ ] 2.3: Coletar estatísticas de falhas

- [ ] Task 3: Buscar dados para warn após job (AC: #3, #4)
  - [ ] 3.1: Chamar getAvailableBets() para próximos 2 dias
  - [ ] 3.2: Filtrar e identificar apostas sem link
  - [ ] 3.3: Filtrar e identificar apostas sem odds

- [ ] Task 4: Construir objeto pendingActions (AC: #4)
  - [ ] 4.1: Mapear apostas sem link para ações
  - [ ] 4.2: Mapear apostas sem odds para ações
  - [ ] 4.3: Formatar com comandos sugeridos

- [ ] Task 5: Integrar chamada sendPostWarn (AC: #1, #5)
  - [ ] 5.1: Chamar sendPostWarn ao final de runPostBets()
  - [ ] 5.2: Passar period, postedBets, upcomingBets, pendingActions
  - [ ] 5.3: Tratar erros do warn (não deve falhar job)

- [ ] Task 6: Testar integração (AC: #1-5)
  - [ ] 6.1: Testar job com apostas postadas - warn mostra sucesso
  - [ ] 6.2: Testar job sem apostas - warn indica vazio
  - [ ] 6.3: Verificar formato no grupo admin

## Dev Notes

### Dependência

**IMPORTANTE:** Esta story DEPENDE da Story 14.2 (criar módulo warns). O módulo `bot/jobs/jobWarn.js` deve existir antes de implementar esta integração.

### Modificações no postBets.js

O job atual termina na linha 285 retornando estatísticas. Precisamos:

1. **Coletar dados durante execução** - Armazenar apostas postadas em array
2. **Buscar dados extras** - Próximos jogos e pendências
3. **Chamar warn** - Ao final, independente de sucesso/falha

### Código Atual (Final do Job)

```javascript
// Linha 271-285 de postBets.js
logger.info('Post bets job complete', {
  reposted,
  repostFailed,
  newPosted: posted,
  newSkipped: skipped,
  totalSent: reposted + posted
});

return {
  reposted,
  repostFailed,
  posted,
  skipped,
  totalSent: reposted + posted
};
```

### Código Proposto (Adicionar Antes do Return)

```javascript
// Após o logger.info existente, antes do return

// Step 5: Enviar warn para grupo admin (Story 14.3)
try {
  // Buscar apostas dos próximos 2 dias
  const upcomingResult = await getAvailableBets();
  const upcomingBets = upcomingResult.success ? upcomingResult.data : [];

  // Identificar pendências
  const pendingActions = [];
  for (const bet of upcomingBets) {
    if (!bet.deepLink) {
      pendingActions.push({
        type: 'link',
        betId: bet.id,
        match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
        action: `/link ${bet.id} URL`
      });
    }
    if (!bet.odds) {
      pendingActions.push({
        type: 'odds',
        betId: bet.id,
        match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
        action: `/atualizar odds`
      });
    }
  }

  await sendPostWarn(period, postedBetsArray, upcomingBets, pendingActions);
} catch (warnErr) {
  // Warn failure should not fail the job
  logger.warn('Failed to send post warn', { error: warnErr.message });
}
```

### Estrutura postedBetsArray

```javascript
// Coletar durante execução:
const postedBetsArray = [];

// Quando aposta é repostada:
postedBetsArray.push({
  id: bet.id,
  match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
  market: bet.betMarket,
  odds: bet.odds,
  type: 'repost'
});

// Quando aposta nova é postada:
postedBetsArray.push({
  id: bet.id,
  match: `${bet.homeTeamName} vs ${bet.awayTeamName}`,
  market: bet.betMarket,
  odds: bet.odds,
  type: 'new'
});
```

### Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/jobs/postBets.js` | MODIFICAR | Adicionar coleta e chamada warn |

### Imports a Adicionar

```javascript
const { sendPostWarn } = require('./jobWarn');
const { getAvailableBets } = require('../services/betService');
// getAvailableBets já pode estar importado via destructuring
```

### Project Structure Notes

- Segue padrão de jobs existentes
- Warn é "best effort" - falha não afeta job principal
- Usa funções existentes de betService

### References

- [Source: bot/jobs/postBets.js:164-301] - Job atual completo
- [Source: bot/services/betService.js:334] - getAvailableBets
- [Source: bot/services/betService.js:997] - getFilaStatus
- [Source: _bmad-output/planning-artifacts/epics.md#story-14.3] - Definição original
- [Source: _bmad-output/implementation-artifacts/14-2-criar-modulo-warns.md] - Dependência

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/jobs/postBets.js (modificar)
