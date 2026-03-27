---
title: 'Preview-First Posting — Enviar exatamente o preview aprovado/editado'
slug: 'preview-first-posting'
created: '2026-03-12'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'Node.js 20+', 'Supabase (PostgreSQL)', 'TypeScript 5.x', 'React 19', 'Vitest 3.2', 'Jest']
files_to_modify:
  - 'sql/migrations/051_groups_post_now_preview_id.sql'
  - 'admin-panel/src/app/api/bets/post-now/route.ts'
  - 'admin-panel/src/app/api/bets/post-now/preview/route.ts'
  - 'admin-panel/src/app/(auth)/postagem/page.tsx'
  - 'bot/server.scheduler.js'
  - 'bot/jobs/postBets.js'
  - 'bot/services/copyService.js'
  - 'bot/jobs/__tests__/postBets.test.js'
code_patterns:
  - 'createApiHandler com allowedRoles'
  - 'service-response { success, data/error }'
  - 'withExecutionLogging para jobs'
  - 'supabase singleton (service key, bypassa RLS)'
  - 'flags na tabela groups para coordenação admin→bot'
  - 'factory scheduler (createScheduler) para multi-tenant'
test_patterns:
  - 'Jest para bot/ (jest.mock, makeBet fixture)'
  - 'Vitest para admin-panel/'
---

# Tech-Spec: Preview-First Posting

**Created:** 2026-03-12

## Overview

### Problem Statement

O sistema tem dois caminhos divergentes para gerar mensagens de postagem:

1. **Preview**: O admin gera preview → LLM cria mensagem → texto salvo em `post_previews.bets` → admin revisa/edita → clica "Enviar"
2. **Posting real**: Bot detecta flag `post_now_requested_at` → **regenera mensagem do zero via LLM** → envia ao Telegram

O preview salvo em `post_previews` é **completamente ignorado** na hora de postar. Como o LLM é não-determinístico, a mensagem enviada ao grupo é diferente do que o admin aprovou. Configurações de tom de voz (oddLabel, headers, footers) podem se comportar de forma imprevisível.

Problemas secundários encontrados:
- `copyService.js` não passa `oddLabel` ao prompt do LLM (afeta também posting agendado)
- `instanceCheckPostNow()` (factory/multi-tenant) não lê `post_now_bet_ids` — posta TUDO em vez das específicas
- Edição de preview no frontend é local (React state) — nunca persiste no banco

### Solution

**Princípio: O que o admin vê é o que vai pro grupo.**

1. **Post-now manual**: O bot lê as mensagens salvas em `post_previews` e envia **exatamente aquele texto**, sem chamar LLM
2. **Posting agendado (cron)**: Corrigir `copyService.js` para usar `oddLabel` no prompt do LLM
3. **Edição de preview**: Persistir edições no `post_previews` via API antes de enviar
4. **Factory fix**: `instanceCheckPostNow` deve ler `post_now_bet_ids` e `post_now_preview_id`

### Scope

**In Scope:**
- Passar `post_now_preview_id` do admin panel pro bot via tabela `groups`
- Bot lê `post_previews.bets` e envia o texto armazenado (sem LLM) para post-now manual
- Persistir edições de preview no banco via PATCH API
- Corrigir `copyService.js` para incluir `oddLabel` no prompt do LLM (posting agendado)
- Corrigir `instanceCheckPostNow()` para ler `post_now_bet_ids` e limpar corretamente
- Testes unitários para os fluxos alterados

**Out of Scope:**
- Refactor completo do copyService.js
- UI nova — a UI de edição de preview já existe

## Context for Development

### Codebase Patterns

- Todas as API routes usam `createApiHandler` com `{ allowedRoles: [...] }`
- Service responses seguem `{ success: true, data }` / `{ success: false, error: { code, message } }`
- Bot jobs usam `withExecutionLogging` para tracking
- Multi-tenant: singleton scheduler (env GROUP_ID) + factory scheduler (multi-bot)
- Coordenação admin→bot via flags na tabela `groups` (poll a cada 30s)
- Bot usa Supabase com service key (bypassa RLS) — pode ler `post_previews` direto
- Migrations SQL em `sql/migrations/` com numeração sequencial

### Files to Reference

| File | Purpose | Ação |
| ---- | ------- | ---- |
| `sql/migrations/050_groups_post_now_bet_ids.sql` | Última migration de groups | Referência para nova migration |
| `sql/migrations/033_post_previews.sql` | Schema post_previews (preview_id, bets JSONB, status, expires_at) | Referência |
| `admin-panel/src/app/api/bets/post-now/route.ts` | POST — seta flags no groups, valida bets e preview | Modificar: salvar previewId |
| `admin-panel/src/app/api/bets/post-now/preview/route.ts` | POST — proxy ao bot para gerar preview | Modificar: adicionar PATCH |
| `admin-panel/src/app/(auth)/postagem/page.tsx` | UI completa de postagem com edição de preview | Modificar: persistir edição |
| `bot/server.scheduler.js` | checkPostNow (singleton) + instanceCheckPostNow (factory) | Modificar: ler previewId |
| `bot/jobs/postBets.js` | runPostBets + formatBetMessage | Modificar: aceitar previewMessages |
| `bot/services/copyService.js` | generateBetCopy — prompt LLM | Modificar: oddLabel |
| `bot/jobs/__tests__/postBets.test.js` | Testes Jest do postBets | Modificar: adicionar testes |

### Technical Decisions

1. **previewId via groups table**: Reusar o padrão existente de comunicação admin→bot via flags na tabela `groups`. Adicionar `post_now_preview_id TEXT`.

2. **Bot lê post_previews diretamente**: O bot tem acesso ao Supabase com service key. Ao receber um previewId, faz query em `post_previews` para obter as mensagens pré-formatadas.

3. **Mapa betId → previewText**: O bot constrói um Map a partir do JSONB `bets` (que tem `[{ betId, preview, betInfo }]`). Para cada bet no loop de postagem, usa o texto do mapa em vez de chamar `formatBetMessage()`.

4. **Fallback para LLM**: Se não houver previewId (posting agendado via cron), manter o fluxo atual de gerar via LLM — mas com oddLabel corrigido no prompt.

5. **Persistir edições via PATCH**: `handleSavePreviewEdit()` no frontend faz PATCH em `/api/bets/post-now/preview` que atualiza o JSONB `bets` na tabela `post_previews`.

6. **Marcar preview como confirmed**: Após envio bem-sucedido, bot atualiza `post_previews.status` de `'draft'` para `'confirmed'`.

## Implementation Plan

### Tasks

- [x] **Task 1: Migration — adicionar `post_now_preview_id` na tabela groups**
  - File: `sql/migrations/051_groups_post_now_preview_id.sql`
  - Action: `ALTER TABLE groups ADD COLUMN IF NOT EXISTS post_now_preview_id TEXT;` com COMMENT
  - Notes: Seguir padrão da migration 050. Coluna nullable, default NULL. Limpa junto com `post_now_requested_at`.

- [x] **Task 2: API PATCH — persistir edição de preview no banco**
  - File: `admin-panel/src/app/api/bets/post-now/preview/route.ts`
  - Action: Adicionar handler `PATCH` exportado. Recebe `{ previewId, bets }`. Faz UPDATE em `post_previews` SET `bets = novo_JSONB` WHERE `preview_id = previewId` AND `group_id = groupFilter` AND `status = 'draft'`. Retorna `{ success: true }`.
  - Notes: Usar `createApiHandler` com `{ allowedRoles: ['super_admin', 'group_admin'] }`. Validar que preview existe e não expirou.

- [x] **Task 3: Frontend — persistir edição de preview via PATCH**
  - File: `admin-panel/src/app/(auth)/postagem/page.tsx`
  - Action: Em `handleSavePreviewEdit(idx)`, após atualizar o state local (`setPreviewBets`), fazer `fetch('/api/bets/post-now/preview', { method: 'PATCH', body: { previewId: previewData.previewId, bets: updatedBets } })`. Fire-and-forget com log de erro.
  - Notes: O state local já é atualizado imediatamente (optimistic). O PATCH persiste no banco para que o bot envie o texto editado. O `previewData.previewId` já está disponível no state.

- [x] **Task 4: API POST post-now — passar previewId pro bot via groups table**
  - File: `admin-panel/src/app/api/bets/post-now/route.ts`
  - Action: No `updateData` (linha 158), adicionar `post_now_preview_id: previewId` ao lado de `post_now_requested_at` e `post_now_bet_ids`. O `previewId` já está parseado do body (linha 26).
  - Notes: Mudança de 1 linha. O `previewId` pode ser null (posting sem preview) — nesse caso o bot faz o fallback normal via LLM.

- [x] **Task 5: Bot scheduler — ler previewId e passar ao runPostBets**
  - File: `bot/server.scheduler.js`
  - Action (singleton `checkPostNow`, ~linha 280): Adicionar `post_now_preview_id` no SELECT. Extrair `const previewId = data.post_now_preview_id || null;`. Passar para `runPostBets(true, { ..., previewId })`. No finally, limpar `post_now_preview_id: null` no UPDATE.
  - Action (factory `instanceCheckPostNow`, ~linha 426): Adicionar `post_now_bet_ids, post_now_preview_id` no SELECT (atualmente só lê `post_now_requested_at`). Extrair `allowedBetIds` e `previewId`. Passar ambos para `runPostBets(true, { ..., allowedBetIds, previewId, botCtx })`. No finally, limpar `post_now_bet_ids: null, post_now_preview_id: null` no UPDATE.
  - Notes: O factory fix resolve 2 bugs de uma vez: post_now_bet_ids ignorado + previewId.

- [x] **Task 6: Bot postBets — usar preview salvo em vez de regenerar via LLM**
  - File: `bot/jobs/postBets.js`
  - Action:
    1. Aceitar `previewId` em `options` de `runPostBets()` (~linha 520): `const { ..., previewId = null } = options;`
    2. Após carregar toneConfig (~linha 540), se `previewId` existir:
       ```javascript
       let previewMessages = null;
       if (previewId) {
         const { data: previewData, error: previewError } = await supabase
           .from('post_previews')
           .select('bets, status')
           .eq('preview_id', previewId)
           .single();
         if (!previewError && previewData?.bets && previewData.status === 'draft') {
           previewMessages = new Map();
           for (const item of previewData.bets) {
             previewMessages.set(item.betId, item.preview);
           }
           logger.info('[postBets] Loaded preview messages', {
             groupId, previewId, count: previewMessages.size
           });
         } else {
           logger.warn('[postBets] Preview not found or expired, falling back to LLM', {
             groupId, previewId, error: previewError?.message
           });
         }
       }
       ```
    3. No loop de ativas e novas, substituir a chamada `formatBetMessage()` por lookup no mapa:
       ```javascript
       // Dentro do loop (tanto ativas quanto novas):
       let message;
       if (previewMessages?.has(bet.id)) {
         message = previewMessages.get(bet.id);
         logger.debug('[postBets] Using preview message', { betId: bet.id, groupId });
       } else {
         const template = getTemplate(toneConfig, betIndex);
         message = await formatBetMessage(bet, template, toneConfig, betIndex);
       }
       ```
    4. Após postagem bem-sucedida (no final, depois do loop), se `previewId` e pelo menos 1 bet foi postada, marcar preview como confirmed:
       ```javascript
       if (previewId && (reposted + posted) > 0) {
         await supabase
           .from('post_previews')
           .update({ status: 'confirmed' })
           .eq('preview_id', previewId);
       }
       ```
  - Notes: Manter validação (kickoff futuro, deep link) mesmo com preview. O preview define o TEXTO, não pula validação. Fallback gracioso: se preview não encontrado, gera via LLM normalmente.

- [x] **Task 7: copyService — incluir oddLabel no prompt LLM (posting agendado)**
  - File: `bot/services/copyService.js`
  - Action:
    1. No bloco full-message (examplePosts), ~linha 138: Trocar `- Odd: ${bet.odds?.toFixed?.(2) || 'N/A'}` por `- ${toneConfig?.oddLabel || 'Odd'}: ${bet.odds?.toFixed?.(2) || 'N/A'}`
    2. No mesmo bloco, adicionar nas `parts` de configuração de tom (~linha 113): `if (toneConfig.oddLabel) parts.push(\`Use "${toneConfig.oddLabel}" em vez de "Odd" para se referir as odds\`);`
  - Notes: O path de bullet-points (não-fullMessage) já usa oddLabel via `formatBetMessage` no postBets.js. Este fix garante que o LLM também use o label correto quando gera mensagens completas.

- [x] **Task 8: Testes — postBets preview-first path**
  - File: `bot/jobs/__tests__/postBets.test.js`
  - Action: Adicionar novo `describe('preview-first posting')` com os seguintes testes:
    1. `should use preview message when previewId is provided` — mock supabase para retornar preview com bets JSONB, verificar que `generateBetCopy` NÃO é chamado e `sendToPublic` recebe o texto do preview
    2. `should fall back to LLM when previewId not found` — mock supabase para retornar error, verificar que `formatBetMessage` é chamado normalmente
    3. `should fall back to LLM for bets not in preview map` — preview tem bet-1 mas fila tem bet-1 e bet-2, verificar que bet-1 usa preview e bet-2 usa LLM
    4. `should still validate bets even with preview (kickoff, deepLink)` — preview fornecido mas bet tem kickoff no passado, verificar que é skipped
    5. `should mark preview as confirmed after successful posting` — verificar que `supabase.from('post_previews').update({status:'confirmed'})` é chamado
  - Notes: Seguir padrão existente: `makeBet()`, `setupDefaultSupabaseMock()`, `jest.mock`. O mock de supabase precisa ser estendido para interceptar queries em `post_previews`.

### Acceptance Criteria

- [ ] **AC 1**: Given um admin que gerou preview e clicou "Enviar", when o bot processa o post-now, then a mensagem enviada ao Telegram é **idêntica** ao texto do preview (sem chamar LLM novamente).

- [ ] **AC 2**: Given um admin que editou o texto do preview na UI e clicou "Salvar", when o admin depois clica "Enviar", then a mensagem enviada ao Telegram reflete a edição feita pelo admin.

- [ ] **AC 3**: Given um admin que editou o preview, when a edição é salva, then o texto editado é persistido na tabela `post_previews.bets` via PATCH API (não apenas em React state).

- [ ] **AC 4**: Given posting agendado via cron (sem preview), when o grupo tem `oddLabel: "Cotação"` no toneConfig, then a mensagem gerada pelo LLM usa "Cotação" em vez de "Odd".

- [ ] **AC 5**: Given um post-now com previewId que expirou ou não existe, when o bot tenta carregar o preview, then o bot faz fallback para geração via LLM (comportamento atual) sem erro fatal.

- [ ] **AC 6**: Given `instanceCheckPostNow()` (factory/multi-tenant), when o admin seta `post_now_bet_ids` e `post_now_preview_id`, then o factory lê ambos os campos e passa para `runPostBets`, e limpa todos os flags após execução.

- [ ] **AC 7**: Given um preview com 3 bets, when o admin remove 1 bet do preview e envia, then apenas as 2 bets restantes são postadas, usando os textos do preview.

- [ ] **AC 8**: Given um post-now bem-sucedido com previewId, when todas as bets são postadas, then `post_previews.status` é atualizado de `'draft'` para `'confirmed'`.

## Additional Context

### Dependencies

- Nenhuma dependência externa nova. Usa apenas Supabase client já configurado.
- Migration 051 precisa ser aplicada antes do deploy.

### Testing Strategy

**Unit tests (obrigatório):**
- `bot/jobs/__tests__/postBets.test.js`: 5 novos testes (Task 8)
- Cobertura existente de `copyService` já testa o path de oddLabel via `formatBetMessage` test (linha 622-663 do test file)

**E2E via Playwright (obrigatório — CLAUDE.md):**
1. Abrir `/postagem`, gerar preview
2. Editar o texto de uma aposta no preview
3. Verificar que o texto editado aparece corretamente
4. Clicar "Enviar" e verificar no Telegram Web que a mensagem recebida é idêntica ao preview editado

**Manual (recomendado):**
- Testar posting agendado (cron) com oddLabel customizado e verificar que a mensagem usa o label correto

### Notes

**Riscos:**
- O mock de Supabase no postBets.test.js precisa ser estendido cuidadosamente para interceptar queries em `post_previews` sem quebrar os mocks existentes de `groups` e `suggested_bets`.
- O PATCH de preview é fire-and-forget no frontend. Se falhar silenciosamente, o admin pode pensar que editou mas o bot envia o texto original. Mitigação: logar erro no console e mostrar toast de erro.

**Observações:**
- O factory `instanceCheckPostNow()` tem um bug pré-existente (não lê `post_now_bet_ids`) que é corrigido como parte desta spec. Não é um item novo, mas aproveita a mesma mudança.
- O `previewService.js` NÃO precisa de mudanças — ele já gera previews corretamente. O problema está apenas no consumo (posting ignora o preview).

**Ordem de deploy:**
1. Migration 051 (banco)
2. Bot (novo código do postBets + copyService + scheduler)
3. Admin panel (PATCH API + frontend + previewId no post-now)
