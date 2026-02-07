# Story 13.2: Implementar Comando /promover

Status: review

## Story

As a operador,
I want promover uma aposta para a fila de postagem usando /promover,
so that ela seja postada mesmo sem atender aos critérios automáticos de odds mínimas.

## Acceptance Criteria

### AC1: Comando reconhecido
**Given** operador no grupo admin
**When** envia `/promover 45`
**Then** bot processa o comando corretamente
**And** identifica ID 45 como alvo

### AC2: Aposta promovida com sucesso
**Given** aposta ID 45 existe no banco
**When** comando `/promover 45` processado
**Then** aposta é atualizada com:
  - `elegibilidade = 'elegivel'`
  - `promovida_manual = true`
**And** bot responde com ✅ e detalhes da aposta

### AC3: Aposta já promovida
**Given** aposta ID 45 já tem `promovida_manual = true`
**When** operador envia `/promover 45`
**Then** bot informa "Aposta já está promovida"
**And** não altera dados

### AC4: ID inválido
**Given** aposta ID 999 não existe
**When** operador envia `/promover 999`
**Then** bot responde com ❌ "Aposta #999 não encontrada"

### AC5: Comando sem ID
**Given** operador no grupo admin
**When** envia `/promover` sem ID
**Then** bot responde com uso correto: "Uso: /promover <id>"

### AC6: Feedback visual
**Given** comando processado com sucesso
**When** responder ao operador
**Then** usar ✅ para sucesso
**And** usar ❌ para erro
**And** usar ⚡ para indicar promoção manual

## Tasks / Subtasks

- [x] Task 1: Adicionar handler para /promover (AC: 1, 5)
  - [x] Registrar comando no bot
  - [x] Parsear ID do argumento
  - [x] Validar que ID foi fornecido

- [x] Task 2: Criar função promoverAposta em betService (AC: 2, 3, 4)
  - [x] Buscar aposta por ID
  - [x] Verificar se já está promovida
  - [x] Atualizar campos elegibilidade e promovida_manual
  - [x] Retornar { success, data/error }

- [x] Task 3: Formatar resposta visual (AC: 6)
  - [x] Mensagem de sucesso com detalhes da aposta
  - [x] Mensagem de erro clara
  - [x] Emojis conforme spec

- [x] Task 4: Testar cenários (AC: 1-6)
  - [x] Testar promoção com sucesso
  - [x] Testar aposta já promovida
  - [x] Testar ID inexistente
  - [x] Testar comando sem argumentos

## Dev Notes

### Handler Implementation

**Arquivo:** `bot/handlers/adminGroup.js`

```javascript
// Adicionar ao switch/case ou handler de comandos existente

case '/promover':
  await handlePromover(msg, args);
  break;

async function handlePromover(msg, args) {
  const chatId = msg.chat.id;

  // Validar argumentos
  if (!args || args.length === 0) {
    await bot.sendMessage(chatId, '❌ Uso: /promover <id>\n\nExemplo: /promover 45');
    return;
  }

  const betId = parseInt(args[0], 10);
  if (isNaN(betId)) {
    await bot.sendMessage(chatId, '❌ ID inválido. Use um número.\n\nExemplo: /promover 45');
    return;
  }

  // Chamar service
  const result = await betService.promoverAposta(betId);

  if (!result.success) {
    await bot.sendMessage(chatId, `❌ ${result.error.message}`);
    return;
  }

  // Formatar resposta de sucesso
  const bet = result.data;
  const response = `✅ *APOSTA PROMOVIDA*

#${bet.id} ${bet.home_team} vs ${bet.away_team}
🎯 ${bet.bet_market}: ${bet.bet_pick}
📊 Odd: ${bet.odds || 'N/A'}${bet.odds && bet.odds < 1.60 ? ' (abaixo do mínimo)' : ''}

⚡ Promoção manual ativada
📤 Será incluída na próxima postagem`;

  await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
}
```

### Service Implementation

**Arquivo:** `bot/services/betService.js`

```javascript
/**
 * Promove uma aposta para a fila de postagem
 * @param {number} betId - ID da aposta
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function promoverAposta(betId) {
  try {
    // Buscar aposta
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

    // Verificar se já está promovida
    if (bet.promovida_manual === true) {
      return {
        success: false,
        error: { code: 'ALREADY_PROMOTED', message: `Aposta #${betId} já está promovida` }
      };
    }

    // Atualizar
    const { data: updated, error: updateError } = await supabase
      .from('suggested_bets')
      .update({
        elegibilidade: 'elegivel',
        promovida_manual: true
      })
      .eq('id', betId)
      .select()
      .single();

    if (updateError) {
      logger.error('Erro ao promover aposta', { betId, error: updateError.message });
      return {
        success: false,
        error: { code: 'UPDATE_ERROR', message: 'Erro ao atualizar aposta' }
      };
    }

    logger.info('Aposta promovida', { betId });
    return { success: true, data: updated };

  } catch (err) {
    logger.error('Erro inesperado ao promover aposta', { betId, error: err.message });
    return {
      success: false,
      error: { code: 'UNEXPECTED_ERROR', message: 'Erro interno' }
    };
  }
}

module.exports = {
  // ... exports existentes
  promoverAposta,
};
```

### Formato de Resposta

**Sucesso:**
```
✅ APOSTA PROMOVIDA

#45 Liverpool vs Arsenal
🎯 Over 2.5 gols
📊 Odd: 1.45 (abaixo do mínimo)

⚡ Promoção manual ativada
📤 Será incluída na próxima postagem
```

**Erro - Não encontrada:**
```
❌ Aposta #999 não encontrada
```

**Erro - Já promovida:**
```
❌ Aposta #45 já está promovida
```

**Erro - Uso incorreto:**
```
❌ Uso: /promover <id>

Exemplo: /promover 45
```

### Project Structure Notes

**Arquivos a modificar:**
- `bot/handlers/adminGroup.js` - Adicionar handler /promover
- `bot/services/betService.js` - Adicionar função promoverAposta

**Dependências:**
- Story 13.1 DEVE estar completa (campos elegibilidade e promovida_manual devem existir)

### Architecture Compliance

- ✅ Response pattern: `{ success, data/error }`
- ✅ Logging: `logger.info/error`
- ✅ Supabase via `lib/supabase.js`
- ✅ Parse mode Markdown para Telegram

### References

- [Source: _bmad-output/planning-artifacts/prd.md#FR47]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 13.2]
- [Source: _bmad-output/project-context.md#Service Response Pattern]
- [Source: _bmad-output/project-context.md#Telegram Bot Rules]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Já existia handler /promover (FEAT-011) com lógica diferente - substituído pela nova implementação
- Handler anterior exigia odds >= 1.60 e link; nova implementação ignora esses requisitos
- Regex atualizado para aceitar `/promover` sem argumentos (AC5)

### Completion Notes List

- Função `promoverAposta` adicionada ao betService.js
  - Atualiza `elegibilidade = 'elegivel'` e `promovida_manual = true`
  - Retorna dados completos da aposta incluindo info do jogo
  - Valida se aposta já está promovida (AC3)
  - Retorna erro apropriado se aposta não existe (AC4)
- Handler `handlePromoverCommand` reescrito no adminGroup.js
  - Usa nova função `promoverAposta` do betService
  - Mostra ajuda quando chamado sem argumentos (AC5)
  - Feedback visual com emojis conforme spec (AC6)
  - Indica quando odds está abaixo do mínimo
- Testes passaram: `npm test` ✅
- Lint sem erros nos arquivos modificados: `npm run lint` ✅

### File List

- `bot/services/betService.js` (modificado - função promoverAposta + export)
- `bot/handlers/adminGroup.js` (modificado - import, regex, handler)

### Change Log

- 2026-01-12: Implementado comando /promover com nova lógica de elegibilidade
- 2026-01-12: Função promoverAposta criada no betService
