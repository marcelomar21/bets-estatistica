# Story 10.1: Copy Dinâmico com LLM

Status: done

## Story

As a membro do grupo,
I want receber mensagens com copy engajador,
So that as postagens sejam mais interessantes.

## Acceptance Criteria

1. **AC1:** Cada postagem usa LLM para gerar copy único ✅
2. **AC2:** Copy é conciso (2-3 linhas máx) ✅
3. **AC3:** Mantém tom profissional mas acessível ✅
4. **AC4:** Inclui insight sobre o jogo/aposta (baseado no reasoning) ✅

## Tasks / Subtasks

- [x] Task 1: Criar bot/services/copyService.js
  - [x] 1.1 Implementar função generateBetCopy(bet)
  - [x] 1.2 Usar gpt-4o-mini (modelo custo-efetivo)
  - [x] 1.3 Prompt deve gerar copy engajador em português BR
  - [x] 1.4 Retornar { success, data: { copy }, error }

- [x] Task 2: Adicionar cache de copies (Story 10.2 será mais completo)
  - [x] 2.1 Cache in-memory básico por betId
  - [x] 2.2 TTL de 24h (expiração)
  - [x] 2.3 Retornar do cache se existir

- [x] Task 3: Integrar em postBets.js
  - [x] 3.1 Chamar copyService.generateBetCopy() em formatBetMessage()
  - [x] 3.2 Usar copy gerado ao invés do reasoning original
  - [x] 3.3 Fallback para reasoning se LLM falhar

- [x] Task 4: Testar geração de copy
  - [x] 4.1 Testar com aposta real
  - [x] 4.2 Verificar qualidade do copy gerado
  - [x] 4.3 Verificar cache funciona corretamente

## Dev Notes

### Implementação Atual

O `formatBetMessage()` em `bot/jobs/postBets.js:74` usa:
- Templates fixos (MESSAGE_TEMPLATES)
- `bet.reasoning` direto na mensagem

### Exemplo Antes (atual)

```
🎯 *APOSTA DO DIA*

⚽ *Liverpool x Arsenal*
🗓 15/01 às 17:00

📊 *Over 2.5 gols*: Mais de 2.5 gols
💰 Odd: *1.85*

📝 _Alto confronto ofensivo, média de 3.2 gols nos últimos jogos_

📈 Taxa de acerto: *68%*

🔗 [Apostar Agora](https://betano.com/...)

🍀 Boa sorte!
```

### Exemplo Depois (com LLM)

```
🎯 *APOSTA DO DIA*

⚽ *Liverpool x Arsenal*
🗓 15/01 às 17:00

📊 *Over 2.5 gols*: Mais de 2.5 gols
💰 Odd: *1.85*

📝 _Os Reds em Anfield são uma máquina de gols! Média de 3.2 nos últimos 5 jogos. Aposta certeira!_

📈 Taxa de acerto: *68%*

🔗 [Apostar Agora](https://betano.com/...)

🍀 Boa sorte!
```

### Padrão a Seguir

Usar mesmo padrão de `marketInterpreter.js`:
- ChatOpenAI com gpt-4o-mini
- temperature 0.7 (mais criativo)
- maxTokens 150
- Cache in-memory com TTL

### Prompt Sugerido

```javascript
const prompt = `Você é um copywriter de apostas esportivas. Gere um copy CURTO e ENGAJADOR para esta aposta:

Jogo: ${bet.homeTeamName} x ${bet.awayTeamName}
Aposta: ${bet.betMarket} - ${bet.betPick}
Odd: ${bet.odds}
Análise original: ${bet.reasoning}

Regras:
- Máximo 2 linhas
- Tom animado mas profissional
- Em português BR informal
- Mencione algum dado/insight
- NÃO use emojis (serão adicionados separadamente)

Responda APENAS com o copy, sem aspas ou formatação.`;
```

### References

- [Source: bot/jobs/postBets.js:74 - formatBetMessage]
- [Source: bot/services/marketInterpreter.js - padrão OpenAI]
- [Source: lib/config.js - OPENAI_API_KEY]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Criado copyService.js com generateBetCopy() usando gpt-4o-mini
- Cache in-memory com TTL 24h e max 200 entries
- formatBetMessage() em postBets.js agora é async e usa LLM copy
- Fallback automático para reasoning original se LLM falhar
- Testado: copy gerado com qualidade, cache funcionando

### Test Output

```
Input: Liverpool vs Arsenal, Over 2.5 gols @ 1.85
Output: "Prepare-se para um show de gols! Liverpool e Arsenal têm um histórico
de partidas explosivas, com média de 3.2 gols nos últimos confrontos."
```

### Change Log

- 2026-01-11: Implementação da Story 10.1 - Copy Dinâmico com LLM

### File List

- `bot/services/copyService.js` (criado)
- `bot/jobs/postBets.js` (modificado - formatBetMessage async)
