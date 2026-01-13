# Story 13.3: Implementar Comando /remover

Status: review

## Story

As a operador,
I want remover uma aposta da fila de postagem usando /remover,
so that ela não seja mais postada nos próximos jobs.

## Acceptance Criteria

### AC1: Comando reconhecido
**Given** operador no grupo admin
**When** envia `/remover 45`
**Then** bot processa o comando corretamente
**And** identifica ID 45 como alvo

### AC2: Aposta removida com sucesso
**Given** aposta ID 45 existe no banco
**When** comando `/remover 45` processado
**Then** aposta é atualizada com:
  - `elegibilidade = 'removida'`
**And** bot responde com ✅ e detalhes da aposta
**And** informa como reverter com /promover

### AC3: Aposta já removida
**Given** aposta ID 45 já tem `elegibilidade = 'removida'`
**When** operador envia `/remover 45`
**Then** bot informa "Aposta já está removida da fila"

### AC4: ID inválido
**Given** aposta ID 999 não existe
**When** operador envia `/remover 999`
**Then** bot responde com ❌ "Aposta #999 não encontrada"

### AC5: Comando sem ID
**Given** operador no grupo admin
**When** envia `/remover` sem ID
**Then** bot responde com uso correto: "Uso: /remover <id>"

### AC6: Reversão via /promover
**Given** aposta removida com `/remover 45`
**When** operador envia `/promover 45`
**Then** aposta volta a ser elegível
**And** `elegibilidade = 'elegivel'`

## Tasks / Subtasks

- [x] Task 1: Adicionar handler para /remover (AC: 1, 5)
  - [x] Registrar comando no bot
  - [x] Parsear ID do argumento
  - [x] Validar que ID foi fornecido

- [x] Task 2: Criar função removerAposta em betService (AC: 2, 3, 4)
  - [x] Buscar aposta por ID
  - [x] Verificar se já está removida
  - [x] Atualizar campo elegibilidade para 'removida'
  - [x] Retornar { success, data/error }

- [x] Task 3: Formatar resposta visual (AC: 2)
  - [x] Mensagem de sucesso com detalhes
  - [x] Incluir dica de reversão

- [x] Task 4: Testar cenários (AC: 1-6)
  - [x] Testar remoção com sucesso
  - [x] Testar aposta já removida
  - [x] Testar reversão via /promover

## Dev Notes

### Handler Implementation

**Arquivo:** `bot/handlers/adminGroup.js`

```javascript
case '/remover':
  await handleRemover(msg, args);
  break;

async function handleRemover(msg, args) {
  const chatId = msg.chat.id;

  if (!args || args.length === 0) {
    await bot.sendMessage(chatId, '❌ Uso: /remover <id>\n\nExemplo: /remover 45');
    return;
  }

  const betId = parseInt(args[0], 10);
  if (isNaN(betId)) {
    await bot.sendMessage(chatId, '❌ ID inválido. Use um número.');
    return;
  }

  const result = await betService.removerAposta(betId);

  if (!result.success) {
    await bot.sendMessage(chatId, `❌ ${result.error.message}`);
    return;
  }

  const bet = result.data;
  const response = `✅ *APOSTA REMOVIDA DA FILA*

#${bet.id} ${bet.home_team} vs ${bet.away_team}
🎯 ${bet.bet_market}: ${bet.bet_pick}

⛔ Removida da fila de postagem
💡 Use \`/promover ${bet.id}\` para reverter`;

  await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
}
```

### Service Implementation

**Arquivo:** `bot/services/betService.js`

```javascript
async function removerAposta(betId) {
  try {
    const { data: bet, error: fetchError } = await supabase
      .from('suggested_bets')
      .select('*')
      .eq('id', betId)
      .single();

    if (fetchError || !bet) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Aposta #${betId} não encontrada` }
      };
    }

    if (bet.elegibilidade === 'removida') {
      return {
        success: false,
        error: { code: 'ALREADY_REMOVED', message: `Aposta #${betId} já está removida da fila` }
      };
    }

    const { data: updated, error: updateError } = await supabase
      .from('suggested_bets')
      .update({ elegibilidade: 'removida' })
      .eq('id', betId)
      .select()
      .single();

    if (updateError) {
      logger.error('Erro ao remover aposta', { betId, error: updateError.message });
      return {
        success: false,
        error: { code: 'UPDATE_ERROR', message: 'Erro ao atualizar aposta' }
      };
    }

    logger.info('Aposta removida da fila', { betId });
    return { success: true, data: updated };

  } catch (err) {
    logger.error('Erro inesperado ao remover aposta', { betId, error: err.message });
    return {
      success: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Erro interno' }
    };
  }
}

module.exports = {
  // ... exports existentes
  removerAposta,
};
```

### Formato de Resposta

**Sucesso:**
```
✅ APOSTA REMOVIDA DA FILA

#45 Liverpool vs Arsenal
🎯 Over 2.5 gols

⛔ Removida da fila de postagem
💡 Use `/promover 45` para reverter
```

### Dependencies

- Story 13.1 DEVE estar completa (campo elegibilidade deve existir)
- Story 13.2 DEVE estar completa (para reversão funcionar)

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR48]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.3]
- [Source: _bmad-output/project-context.md#Service Response Pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Função `removerAposta` criada no betService.js
  - Atualiza `elegibilidade = 'removida'`
  - Valida se aposta já está removida (AC3)
  - Retorna dados completos da aposta
- Handler `handleRemoverCommand` adicionado ao adminGroup.js
  - Regex aceita `/remover` com ou sem argumentos
  - Mostra ajuda quando sem ID (AC5)
  - Feedback visual com dica de reversão via /promover (AC2)
- Comando /help atualizado com /remover
- Testes passaram: 90/90 ✅
- Lint sem erros nos arquivos modificados ✅

### File List

- `bot/services/betService.js` (modificado - função removerAposta + export)
- `bot/handlers/adminGroup.js` (modificado - import, regex, handler, help)

### Change Log

- 2026-01-12: Implementado comando /remover para remover apostas da fila
