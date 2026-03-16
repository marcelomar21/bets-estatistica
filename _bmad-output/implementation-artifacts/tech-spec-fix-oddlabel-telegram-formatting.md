---
title: 'Fix oddLabel + validador de formatação Telegram + persistência de copy'
slug: 'fix-oddlabel-telegram-formatting'
created: '2026-03-16'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js (ES2022/CommonJS)', 'Jest 29.7', 'Supabase (PostgreSQL)', 'LangChain/OpenAI', 'node-telegram-bot-api']
files_to_modify: ['bot/lib/telegramMarkdown.js (NOVO)', 'bot/services/copyService.js', 'bot/jobs/postBets.js', 'bot/services/previewService.js', 'bot/telegram.js', 'bot/services/betService.js', 'sql/migrations/055_generated_copy.sql (NOVO)', 'admin-panel/src/app/api/groups/[groupId]/tone/route.ts']
code_patterns: ['Service response: { success, data/error }', 'Logging: logger.info/warn/error com context', 'Multi-tenant: group_id em toda query', 'Tone config: groups.copy_tone_config JSONB']
test_patterns: ['Jest 29.7 (bot-side)', 'Mocks: logger, config, supabase, telegram', 'Fixture factory: makeBet(overrides)', 'Arquivo: bot/lib/__tests__/ ou bot/services/__tests__/']
---

# Tech-Spec: Fix oddLabel + validador de formatação Telegram + persistência de copy

**Created:** 2026-03-16

## Overview

### Problem Statement

Três problemas inter-relacionados no pipeline de mensagens Telegram:

1. **oddLabel ignorado**: O campo `oddLabel` configurado no tom de voz do grupo (ex: "Cotação") não é respeitado em todos os caminhos de geração de mensagem. No full-message mode, a LLM ignora a instrução e escreve "Odd". Em fallbacks de erro, está hardcoded "Odd:".

2. **Formatação quebrada**: A LLM retorna Markdown mal formatado (`*`, `_`, `[` desbalanceados) que é enviado ao Telegram sem validação. A mensagem chega com sinais visíveis e texto quebrado.

3. **Preview ≠ Mensagem enviada**: A copy é gerada on-the-fly via LLM a cada chamada (cache in-memory volátil). O preview pode gerar uma mensagem e o posting gerar outra diferente. Não existe persistência da copy gerada no bet.

### Solution

1. **Persistir copy gerada**: Nova coluna `generated_copy` em `suggested_bets`. Copy é gerada uma vez, persistida, e reutilizada por preview e posting. Regeneração apenas quando tom de voz muda ou admin solicita.

2. **oddLabel enforcement**: Pós-processamento com regex replace (`enforceOddLabel`) no momento da geração, antes de persistir. Garante oddLabel independente do que a LLM retornou.

3. **Validador de formatação**: Sanitizador de Markdown Telegram (`sanitizeTelegramMarkdown`) aplicado no momento da geração (antes de persistir) e como safety net em `sendToPublic()`.

### Scope

**In Scope:**
- Nova coluna `generated_copy` em `suggested_bets` + migration
- Utilitário `bot/lib/telegramMarkdown.js` com `sanitizeTelegramMarkdown()` + `enforceOddLabel()`
- Persistência de copy no BD via `betService.js`
- Refactor de `postBets.js` para aplicar pós-processamento e persistir
- Refactor de `previewService.js` para ler/gerar copy persistida
- Invalidação de `generated_copy` quando tom de voz muda
- Safety net no `sendToPublic()`
- Testes unitários

**Out of Scope:**
- Mensagens admin-only internas (alertService, betCommands, queryCommands)
- Mudanças no `post_previews` (continua funcionando pro fluxo de edição manual)
- Mudanças no admin-panel UI

## Context for Development

### Codebase Patterns

- **Service response**: `{ success: true, data: {...} }` / `{ success: false, error: { code, message } }`
- **Logging**: `logger.info/warn/error` com objeto de contexto `{ betId, groupId, ... }`
- **Multi-tenant**: Toda query filtra por `group_id`
- **Tone config**: Armazenado em `groups.copy_tone_config` (JSONB), carregado fresh do BD a cada operação
- **Copy cache atual**: In-memory Map com TTL 24h, max 200 entries — será substituído pela persistência no BD
- **Telegram parse_mode**: `'Markdown'` (legacy Markdown, não MarkdownV2)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `bot/services/copyService.js` | Geração de copy via LLM (full-message + bullet mode). Cache in-memory. |
| `bot/jobs/postBets.js` | `formatBetMessage()` monta mensagem. `getOrGenerateMessage()` (NOVO). `runPostBets()` orquestra posting. |
| `bot/services/previewService.js` | `formatPreviewMessage()` gera preview. Importa `formatBetMessage` e `getTemplate` de postBets. |
| `bot/telegram.js` | `sendToPublic()` — ponto único de envio para grupo público. `parse_mode: 'Markdown'`. |
| `bot/services/betService.js` | CRUD de bets. `getFilaStatus()` busca bets para posting. `updateGeneratedCopy()` (NOVO). |
| `bot/lib/telegramMarkdown.js` | NOVO — `sanitizeTelegramMarkdown()` + `enforceOddLabel()`. |
| `sql/migrations/055_generated_copy.sql` | NOVO — adiciona coluna `generated_copy`. |
| `admin-panel/src/app/api/groups/[groupId]/tone/route.ts` | PUT endpoint de tom de voz — ponto de invalidação. |

### Technical Decisions

1. **Coluna `generated_copy`** em `suggested_bets` (TEXT, nullable) — fonte única de verdade da mensagem formatada. Null = não gerada ainda.
2. **Sanitização no momento da geração** (não no envio) — garante que o que é armazenado já está limpo. `sendToPublic()` aplica sanitização como safety net extra.
3. **`enforceOddLabel()` como pós-processamento** — regex replace `Odd:` / `odd:` / `Odd :` / `Odds:` pelo oddLabel configurado. Roda depois da LLM, antes de persistir.
4. **Invalidação via API de tom de voz** — quando admin salva novo tom, limpa `generated_copy` de todas as bets não-postadas do grupo.
5. **`post_previews` continua existindo** — pra edição manual do admin. Hierarquia: `post_previews` (admin editou) > `generated_copy` (persistida) > gerar on-the-fly (fallback).
6. **Markdown legacy** (não MarkdownV2) — sanitizador foca em `*bold*`, `_italic_`, `` `code` ``, `[text](url)`.
7. **Cache in-memory removido** — `generated_copy` no BD substitui o cache. Simplifica a lógica e garante consistência entre restarts.

### Onde oddLabel falha atualmente

| Arquivo:Linha | Modo | Problema |
| --- | --- | --- |
| `postBets.js:202-204` | full-message | Retorna `copyResult.data.copy` direto sem replace |
| `copyService.js:129` | full-message prompt | Instrução fraca para LLM — pode ser ignorada |
| `previewService.js:152` | reasoning sintético | Hardcoded `"Odd:"` |
| `previewService.js:255` | fallback de erro | Hardcoded `"Odd:"` |

## Implementation Plan

### Tasks

- [x] **Task 1: Migration — adicionar coluna `generated_copy`**
  - File: `sql/migrations/055_generated_copy.sql` (NOVO)
  - Action: `ALTER TABLE suggested_bets ADD COLUMN generated_copy TEXT;`
  - Notes: Nullable. Null = copy não gerada ainda. Sem default.

- [x] **Task 2: Criar utilitário `bot/lib/telegramMarkdown.js`**
  - File: `bot/lib/telegramMarkdown.js` (NOVO)
  - Action: Implementar duas funções exportadas:
    - `sanitizeTelegramMarkdown(text)`:
      - Balancear marcadores `*` — se ímpar, remover o último `*` órfão
      - Balancear marcadores `_` — se ímpar, remover o último `_` órfão
      - Balancear marcadores `` ` `` — se ímpar, remover o último `` ` `` órfão
      - Corrigir links quebrados `[text](url)` — se `]` ou `)` faltando, remover formatação e manter texto
      - Remover formatação Markdown completamente quando há aninhamento problemático (ex: `*_texto_*` → `texto`)
      - Retornar texto limpo e seguro para Telegram
    - `enforceOddLabel(text, oddLabel)`:
      - Se `oddLabel` é falsy ou vazio, retornar texto sem alteração
      - Regex replace: `/\bOdds?\s*:/gi` → `${oddLabel}:` (captura "Odd:", "Odds:", "odd :", etc.)
  - Notes: Código puro sem dependências externas. Focar em Telegram legacy Markdown (não MarkdownV2).

- [x] **Task 3: Adicionar métodos de persistência em `betService.js`**
  - File: `bot/services/betService.js`
  - Action:
    - Adicionar `updateGeneratedCopy(betId, copy)`:
      ```javascript
      async function updateGeneratedCopy(betId, copy) {
        const { error } = await supabase
          .from('suggested_bets')
          .update({ generated_copy: copy })
          .eq('id', betId);
        if (error) {
          logger.warn('[betService] Failed to persist generated_copy', { betId, error: error.message });
        }
      }
      ```
    - Adicionar `clearGeneratedCopyByGroup(groupId)`:
      ```javascript
      async function clearGeneratedCopyByGroup(groupId) {
        const { error } = await supabase
          .from('suggested_bets')
          .update({ generated_copy: null })
          .eq('group_id', groupId)
          .neq('bet_status', 'posted');
        if (error) {
          logger.warn('[betService] Failed to clear generated_copy', { groupId, error: error.message });
        }
      }
      ```
    - Exportar ambas no `module.exports`
  - Notes: `updateGeneratedCopy` é fire-and-forget (warn, não throw). Não bloqueia o fluxo se falhar.

- [x] **Task 4: Adicionar `generated_copy` nas queries de `getFilaStatus()`**
  - File: `bot/services/betService.js`
  - Action:
    - Adicionar `generated_copy` no `.select()` da query de ativas (linha ~1307)
    - Adicionar `generated_copy` no `.select()` da query de novas (linha ~1368)
    - Mapear `generatedCopy: bet.generated_copy` nos dois mappers (linhas ~1345 e ~1410)
  - Notes: Sem isso, o bet object que chega em `postBets.js` não terá o campo.

- [x] **Task 5: Adicionar `generated_copy` nas queries de `previewService.js`**
  - File: `bot/services/previewService.js`
  - Action:
    - Adicionar `generated_copy` no `.select()` de `fetchSampleBets()` (linhas ~44 e ~68)
    - Adicionar `generated_copy` no `.select()` de `fetchBetById()` (linha ~170)
    - Adicionar `generated_copy` no `.select()` de `generatePreview()` batch mode (linha ~204)
    - Mapear `generatedCopy: raw.generated_copy` em `mapBet()` (linha ~88)
  - Notes: Garantir que o mapBet inclua o campo para que `getOrGenerateMessage()` possa usá-lo.

- [x] **Task 6: Aplicar pós-processamento em `formatBetMessage()`**
  - File: `bot/jobs/postBets.js`
  - Action:
    - Importar `{ sanitizeTelegramMarkdown, enforceOddLabel }` de `../lib/telegramMarkdown`
    - No retorno do full-message mode (linha ~204): aplicar `enforceOddLabel` + `sanitizeTelegramMarkdown` antes de retornar
      ```javascript
      // Antes:
      return copyResult.data.copy;
      // Depois:
      let fullMsg = copyResult.data.copy;
      fullMsg = enforceOddLabel(fullMsg, toneConfig?.oddLabel);
      return sanitizeTelegramMarkdown(fullMsg);
      ```
    - No retorno final do template mode (linha ~244): aplicar sanitização
      ```javascript
      // Antes:
      return parts.join('\n');
      // Depois:
      return sanitizeTelegramMarkdown(parts.join('\n'));
      ```
    - Nos fallbacks com reasoning truncado (linhas ~211-215, ~219-224): aplicar sanitização no `_${truncated}_`
  - Notes: `enforceOddLabel` só é necessário no full-message mode (template mode já usa `toneConfig?.oddLabel || 'Odd'` na linha 194). A sanitização roda em TODOS os retornos.

- [x] **Task 7: Criar `getOrGenerateMessage()` e refatorar loop de posting**
  - File: `bot/jobs/postBets.js`
  - Action:
    - Importar `{ updateGeneratedCopy }` de `../services/betService`
    - Criar nova função:
      ```javascript
      async function getOrGenerateMessage(bet, toneConfig, betIndex) {
        // 1. Se já tem copy persistida, usar
        if (bet.generatedCopy) {
          logger.debug('[postBets] Using persisted generated_copy', { betId: bet.id });
          return bet.generatedCopy;
        }
        // 2. Gerar via formatBetMessage (que já aplica oddLabel + sanitize — Task 6)
        const template = getTemplate(toneConfig, betIndex);
        const message = await formatBetMessage(bet, template, toneConfig, betIndex);
        // 3. Persistir no BD (fire-and-forget)
        updateGeneratedCopy(bet.id, message);
        return message;
      }
      ```
    - Refatorar loop de ativas (linhas ~670-678):
      ```javascript
      let message;
      if (previewMessages?.has(bet.id)) {
        message = previewMessages.get(bet.id);
      } else {
        message = await getOrGenerateMessage(bet, toneConfig, betIndex);
      }
      ```
    - Refatorar loop de novas (linhas ~724-731): mesma lógica
    - Exportar `getOrGenerateMessage` no `module.exports`
  - Notes: Hierarquia mantida: `previewMessages` (admin editou via post_previews) > `generated_copy` (persistida) > gerar on-the-fly.

- [x] **Task 8: Refatorar `previewService.js` para usar copy persistida**
  - File: `bot/services/previewService.js`
  - Action:
    - Importar `getOrGenerateMessage` de `../jobs/postBets` (já importa formatBetMessage de lá)
    - Refatorar `formatPreviewMessage()`:
      - **Tone test preview** (chamado pelo admin "Testar"): SEMPRE regenerar — limpar `generated_copy` do bet via `updateGeneratedCopy(bet.id, null)` antes, depois chamar `getOrGenerateMessage()`. Isso garante que o admin vê o resultado fresco do novo tom.
      - **Posting preview** (chamado pelo admin "Postar"): usar `getOrGenerateMessage()` direto. Reutiliza copy persistida.
    - Diferenciar os dois modos: `formatPreviewMessage(bet, toneConfig, { forceRegenerate })`. O `generatePreview()` passa `forceRegenerate: true` quando não há `betIds` (tone test). Quando há `betIds` (posting queue), passa `forceRegenerate: false`.
    - Corrigir hardcoded "Odd:" na synthetic reasoning (linha ~152):
      ```javascript
      // Antes:
      reasoning: `...Odd: ${bet.odds...`
      // Depois:
      reasoning: `...${toneConfig?.oddLabel || 'Odd'}: ${bet.odds...`
      ```
    - Corrigir hardcoded "Odd:" no fallback de erro (linha ~255):
      ```javascript
      // Antes:
      `💰 Odd: ${bet.odds...`
      // Depois:
      `💰 ${toneConfig?.oddLabel || 'Odd'}: ${bet.odds...`
      ```
  - Notes: O `clearBetCache()` atual pode ser removido (cache in-memory está sendo eliminado).

- [x] **Task 9: Remover cache in-memory de `copyService.js`**
  - File: `bot/services/copyService.js`
  - Action:
    - Remover toda a lógica de cache (Map, TTL, `getFromCache`, `setCache`, `getCacheStats`, `getCacheKey`)
    - Remover exports `clearCache`, `clearBetCache`, `getCacheStats`
    - Manter apenas `generateBetCopy` como export
    - A função `generateBetCopy` fica responsável APENAS por chamar a LLM e retornar o resultado — sem cache, sem persistência (isso é responsabilidade do caller via `getOrGenerateMessage`)
  - Notes: Verificar se `clearCache` e `clearBetCache` são chamados em outros lugares e remover essas chamadas.

- [x] **Task 10: Safety net em `telegram.js:sendToPublic()`**
  - File: `bot/telegram.js`
  - Action:
    - Importar `{ sanitizeTelegramMarkdown }` de `./lib/telegramMarkdown`
    - Aplicar antes do `sendMessage`:
      ```javascript
      const sanitizedText = sanitizeTelegramMarkdown(text);
      const message = await targetBot.sendMessage(targetChatId, sanitizedText, { parse_mode: 'Markdown', ... });
      ```
  - Notes: Redundante com a sanitização na geração (Task 6), mas serve como safety net para qualquer path que escape o pós-processamento.

- [x] **Task 11: Invalidar `generated_copy` ao mudar tom de voz**
  - File: `admin-panel/src/app/api/groups/[groupId]/tone/route.ts`
  - Action:
    - Após o `UPDATE` do `copy_tone_config` ser bem-sucedido, executar:
      ```typescript
      await supabase
        .from('suggested_bets')
        .update({ generated_copy: null })
        .eq('group_id', groupId)
        .neq('bet_status', 'posted');
      ```
    - Log da invalidação para rastreabilidade
  - Notes: Usa o `supabase` (service role) que já existe no handler. Só afeta bets não-postadas do grupo.

- [x] **Task 12: Testes — `telegramMarkdown.test.js`**
  - File: `bot/lib/__tests__/telegramMarkdown.test.js` (NOVO)
  - Action: Testes unitários cobrindo:
    - `sanitizeTelegramMarkdown`:
      - Texto sem formatação → retorna inalterado
      - `*bold*` balanceado → mantém
      - `*bold sem fechar` → remove o `*` órfão
      - `_italic_` balanceado → mantém
      - `_italic sem fechar` → remove o `_` órfão
      - `[link](url)` válido → mantém
      - `[link sem fechar` → remove `[`, mantém texto
      - `*_aninhado_*` → resolve ou mantém legível
      - Texto com múltiplos problemas → todos corrigidos
      - String vazia → retorna vazio
    - `enforceOddLabel`:
      - `"Odd: 1.85"` com oddLabel `"Cotação"` → `"Cotação: 1.85"`
      - `"Odds: 1.85"` → `"Cotação: 1.85"`
      - `"odd: 1.85"` (lowercase) → `"Cotação: 1.85"`
      - `"Odd : 1.85"` (com espaço) → `"Cotação: 1.85"`
      - Sem oddLabel (null/undefined/"") → retorna texto inalterado
      - Texto sem "Odd" → retorna inalterado
      - Múltiplas ocorrências → todas substituídas

- [x] **Task 13: Atualizar testes existentes**
  - File: `bot/jobs/__tests__/postBets.test.js`
  - Action:
    - Adicionar `generatedCopy` ao fixture `makeBet()` (default: null)
    - Testar `getOrGenerateMessage`: retorna `generatedCopy` quando existe
    - Testar `getOrGenerateMessage`: gera e chama `updateGeneratedCopy` quando não existe
    - Testar que `previewMessages` tem prioridade sobre `generatedCopy`
  - File: `bot/services/__tests__/previewService.test.js`
  - Action:
    - Atualizar mocks para incluir `generated_copy` na resposta do supabase
    - Testar que preview usa copy persistida quando não é tone test
    - Testar que tone test (forceRegenerate) limpa e regenera

### Acceptance Criteria

- [x] **AC 1**: Given um grupo com `oddLabel: "Cotação"` configurado, when a LLM gera uma mensagem com "Odd:" no full-message mode, then a mensagem persistida e enviada ao Telegram contém "Cotação:" em vez de "Odd:".

- [x] **AC 2**: Given um grupo com `oddLabel: "Cotação"`, when qualquer fallback de erro gera uma mensagem, then a mensagem contém "Cotação:" em vez de "Odd:".

- [x] **AC 3**: Given a LLM retornar texto com `*bold sem fechar`, when a mensagem é processada, then o `*` órfão é removido e a mensagem chega legível ao Telegram.

- [x] **AC 4**: Given a LLM retornar texto com `[link quebrado`, when a mensagem é processada, then a formatação de link é removida mas o texto é preservado.

- [x] **AC 5**: Given uma aposta sem `generated_copy` no BD, when o preview é gerado, then a mensagem é gerada via LLM, sanitizada, e persistida em `generated_copy`.

- [x] **AC 6**: Given uma aposta com `generated_copy` já persistida, when o posting roda, then a mensagem do `generated_copy` é usada sem chamar a LLM novamente.

- [x] **AC 7**: Given uma aposta com `generated_copy` já persistida, when o admin muda o tom de voz do grupo, then `generated_copy` é anulada para todas as bets não-postadas do grupo.

- [x] **AC 8**: Given o admin editou a mensagem via `post_previews`, when o posting roda com `previewId`, then a mensagem editada do `post_previews` prevalece sobre `generated_copy`.

- [x] **AC 9**: Given o admin clica "Testar" no tom de voz (tone test), when o preview é gerado, then uma nova mensagem é gerada via LLM (ignora `generated_copy` existente) e a nova copy é persistida.

- [x] **AC 10**: Given `sendToPublic()` recebe um texto com formatação inválida que escapou o pós-processamento, then o safety net sanitiza antes de enviar ao Telegram.

## Additional Context

### Dependencies

- Migration SQL `055_generated_copy.sql` deve ser aplicada antes de qualquer mudança de código
- Nenhuma dependência externa nova (sanitizador é código puro JS)

### Testing Strategy

**Unitários (Jest):**
- `bot/lib/__tests__/telegramMarkdown.test.js` — cobertura completa do sanitizador e oddLabel enforcer (Task 12)
- `bot/jobs/__tests__/postBets.test.js` — testar `getOrGenerateMessage` e integração com persistência (Task 13)
- `bot/services/__tests__/previewService.test.js` — testar uso de copy persistida vs regeneração (Task 13)

**E2E (Playwright via admin panel):**
- Configurar oddLabel como "Cotação" no tom de voz de um grupo
- Gerar preview e verificar que "Cotação" aparece (não "Odd")
- Enviar mensagem e verificar no Telegram que a formatação está correta
- Mudar o tom de voz e verificar que o preview seguinte reflete a mudança

### Notes

- **Risco**: A remoção do cache in-memory (Task 9) significa que a primeira geração de cada bet agora vai ao BD. Como `updateGeneratedCopy` é fire-and-forget, se o BD falhar, o posting continua funcionando (gera on-the-fly como hoje).
- **Backward compat**: Bets existentes sem `generated_copy` continuam funcionando — o código gera e persiste na primeira chamada.
- **Performance**: Trocar cache in-memory por BD adiciona latência na primeira geração (~1 query extra). Mas elimina o problema de inconsistência entre processos e restarts.
- **Ordem de implementação**: Tasks 1-2 não têm dependências. Tasks 3-5 dependem de Task 1. Tasks 6-8 dependem de Task 2. Task 9 depende de Tasks 7-8. Tasks 10-11 são independentes. Tasks 12-13 no final.
