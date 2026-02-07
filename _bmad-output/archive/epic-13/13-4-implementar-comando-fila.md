# Story 13.4: Implementar Comando /fila

Status: review

## Story

As a operador,
I want ver o status da fila de apostas elegíveis usando /fila,
so that saiba o que será postado no próximo job.

## Acceptance Criteria

### AC1: Comando reconhecido
**Given** operador no grupo admin
**When** envia `/fila`
**Then** bot processa e retorna status da fila

### AC2: Mostrar top 3 selecionadas
**Given** apostas elegíveis existem
**When** comando `/fila` processado
**Then** mostra as top 3 apostas que seriam postadas
**And** ordena por: promovidas primeiro, depois por odds DESC
**And** mostra ID, jogo, mercado, odd

### AC3: Indicar apostas promovidas
**Given** aposta tem `promovida_manual = true`
**When** exibir na lista
**Then** mostra ⚡ ao lado indicando promoção manual

### AC4: Mostrar próximo horário
**Given** horários de postagem são 10h, 15h, 22h
**When** exibir status
**Then** mostra próximo horário de postagem
**And** mostra "em Xh" para facilitar

### AC5: Mostrar resumo por elegibilidade
**Given** apostas com diferentes elegibilidades
**When** exibir resumo
**Then** mostra contagem:
  - ✅ Elegíveis: X
  - ⚡ Promovidas: X
  - ⛔ Removidas: X
  - ⏰ Expiradas: X

### AC6: Fila vazia
**Given** nenhuma aposta elegível
**When** comando `/fila` processado
**Then** mostra "Nenhuma aposta elegível para postagem"
**And** sugere usar /apostas para ver todas

## Tasks / Subtasks

- [x] Task 1: Adicionar handler para /fila (AC: 1)
  - [x] Registrar comando no bot

- [x] Task 2: Criar função getFilaStatus em betService (AC: 2, 3, 5)
  - [x] Buscar apostas elegíveis com critérios de seleção
  - [x] Contar por elegibilidade
  - [x] Ordenar: promovidas primeiro, depois odds DESC
  - [x] Limitar a top 3

- [x] Task 3: Calcular próximo horário (AC: 4)
  - [x] Comparar hora atual com 10h, 15h, 22h
  - [x] Retornar próximo horário e diferença

- [x] Task 4: Formatar resposta (AC: 2, 3, 4, 5, 6)
  - [x] Layout conforme spec
  - [x] Emojis corretos
  - [x] Markdown formatting

## Dev Notes

### Handler Implementation

**Arquivo:** `bot/handlers/adminGroup.js`

```javascript
case '/fila':
  await handleFila(msg);
  break;

async function handleFila(msg) {
  const chatId = msg.chat.id;

  const result = await betService.getFilaStatus();

  if (!result.success) {
    await bot.sendMessage(chatId, `❌ ${result.error.message}`);
    return;
  }

  const { top3, counts, nextPost } = result.data;

  if (top3.length === 0) {
    await bot.sendMessage(chatId,
      `📋 *FILA DE POSTAGEM*\n\n` +
      `Nenhuma aposta elegível para postagem.\n\n` +
      `💡 Use /apostas para ver todas as apostas.`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Formatar top 3
  let top3Text = top3.map((bet, i) => {
    const promoFlag = bet.promovida_manual ? ' ⚡ Promovida' : '';
    return `${i + 1}️⃣ #${bet.id} ${bet.home_team} vs ${bet.away_team}\n` +
           `   🎯 ${bet.bet_market} @ ${bet.odds || 'N/A'}${promoFlag}`;
  }).join('\n\n');

  const response = `📋 *FILA DE POSTAGEM*

*Próxima postagem:* ${nextPost.time} (em ${nextPost.diff})

*Top 3 selecionadas:*
${top3Text}

*Resumo:*
✅ Elegíveis: ${counts.elegivel}
⚡ Promovidas: ${counts.promovidas}
⛔ Removidas: ${counts.removida}
⏰ Expiradas: ${counts.expirada}`;

  await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
}
```

### Service Implementation

**Arquivo:** `bot/services/betService.js`

```javascript
async function getFilaStatus() {
  try {
    // Buscar apostas elegíveis para próxima postagem
    const now = new Date();
    const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const { data: eligibleBets, error: eligibleError } = await supabase
      .from('suggested_bets')
      .select('*')
      .eq('elegibilidade', 'elegivel')
      .not('deep_link', 'is', null)
      .gte('kickoff_time', now.toISOString())
      .lte('kickoff_time', twoDaysLater.toISOString())
      .or('odds.gte.1.60,promovida_manual.eq.true')
      .order('promovida_manual', { ascending: false })
      .order('odds', { ascending: false })
      .limit(3);

    if (eligibleError) {
      logger.error('Erro ao buscar fila', { error: eligibleError.message });
      return { success: false, error: { message: 'Erro ao buscar fila' } };
    }

    // Contar por elegibilidade
    const { data: allBets } = await supabase
      .from('suggested_bets')
      .select('elegibilidade, promovida_manual')
      .gte('kickoff_time', now.toISOString());

    const counts = {
      elegivel: 0,
      removida: 0,
      expirada: 0,
      promovidas: 0
    };

    (allBets || []).forEach(bet => {
      if (bet.elegibilidade) counts[bet.elegibilidade]++;
      if (bet.promovida_manual) counts.promovidas++;
    });

    // Calcular próximo horário de postagem
    const nextPost = getNextPostTime();

    return {
      success: true,
      data: {
        top3: eligibleBets || [],
        counts,
        nextPost
      }
    };

  } catch (err) {
    logger.error('Erro ao obter status da fila', { error: err.message });
    return { success: false, error: { message: 'Erro interno' } };
  }
}

function getNextPostTime() {
  const now = new Date();
  const hours = now.getHours();
  const postTimes = [10, 15, 22];

  for (const time of postTimes) {
    if (hours < time) {
      const diff = time - hours;
      return { time: `${time}:00`, diff: `${diff}h` };
    }
  }

  // Próximo é amanhã às 10h
  const diff = 24 - hours + 10;
  return { time: '10:00 (amanhã)', diff: `${diff}h` };
}

module.exports = {
  // ... exports existentes
  getFilaStatus,
};
```

### Formato de Resposta

```
📋 FILA DE POSTAGEM

*Próxima postagem:* 15:00 (em 2h)

*Top 3 selecionadas:*
1️⃣ #45 Liverpool vs Arsenal
   🎯 Over 2.5 @ 1.85 ⚡ Promovida

2️⃣ #47 Real Madrid vs Barcelona
   🎯 BTTS @ 1.72

3️⃣ #52 Man City vs Chelsea
   🎯 Under 3.5 @ 1.68

*Resumo:*
✅ Elegíveis: 12
⚡ Promovidas: 2
⛔ Removidas: 3
⏰ Expiradas: 5
```

### Dependencies

- Story 13.1 DEVE estar completa (campos de elegibilidade)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR49]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.4]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Função `getNextPostTime` criada para calcular próximo horário (10h, 15h, 22h)
- Função `getFilaStatus` criada no betService.js
  - Busca top 3 elegíveis: promovidas primeiro, depois odds DESC
  - Conta apostas por elegibilidade (elegivel, removida, expirada, promovidas)
  - Filtra: odds >= 1.60 OU promovida_manual = true
- Handler `handleFilaCommand` adicionado ao adminGroup.js
  - Mostra fila vazia quando não há apostas (AC6)
  - Indica ⚡ para apostas promovidas manualmente (AC3)
  - Mostra próximo horário de postagem (AC4)
- Comando /help atualizado com /fila
- Testes passaram: 90/90 ✅
- Lint sem erros ✅

### File List

- `bot/services/betService.js` (modificado - getNextPostTime, getFilaStatus + export)
- `bot/handlers/adminGroup.js` (modificado - import, regex, handler, help)

### Change Log

- 2026-01-12: Implementado comando /fila para ver status da fila de postagem
