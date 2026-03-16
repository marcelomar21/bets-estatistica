---
title: 'Configurações de Comunidade — Onboarding, Trial e Preço'
slug: 'community-settings-onboarding'
created: '2026-03-16'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'TypeScript 5.x', 'Supabase', 'Tailwind CSS 4', 'Node.js 20+ (bot)', 'Vitest 3.2 (admin)', 'Jest (bot)', 'Zod 4.x']
files_to_modify:
  - 'sql/migrations/058_group_onboarding_settings.sql'
  - 'admin-panel/src/components/layout/Sidebar.tsx'
  - 'admin-panel/src/app/(auth)/onboarding/page.tsx'
  - 'admin-panel/src/app/(auth)/community-settings/page.tsx'
  - 'admin-panel/src/app/api/groups/[groupId]/community-settings/route.ts'
  - 'admin-panel/src/components/features/community/OnboardingEditor.tsx'
  - 'admin-panel/src/components/features/community/OnboardingEditor.test.tsx'
  - 'admin-panel/src/components/features/community/CommunitySettingsForm.tsx'
  - 'admin-panel/src/components/features/community/CommunitySettingsForm.test.tsx'
  - 'admin-panel/src/lib/mercadopago.ts'
  - 'admin-panel/src/lib/__tests__/mercadopago.test.ts'
  - 'bot/handlers/startCommand.js'
  - 'bot/telegram.js'
  - 'bot/services/memberService.js'
code_patterns:
  - 'createApiHandler + withTenant() para todas API routes'
  - 'JSONB configs na tabela groups (ex: copy_tone_config, posting_schedule)'
  - 'botCtx.groupConfig para configs per-group no bot'
  - 'Service response pattern: { success: true, data } | { success: false, error: { code, message } }'
  - 'Zod schema validation em API routes'
  - 'Audit log em updates de grupo'
test_patterns:
  - 'Vitest + jsdom + React Testing Library (admin panel)'
  - 'Jest + mock supabase chains (bot services)'
  - 'Mock fetch para API calls'
  - 'Test file co-location: __tests__/ ou .test.tsx ao lado do componente'
---

# Tech-Spec: Configurações de Comunidade — Onboarding, Trial e Preço

**Created:** 2026-03-16

## Overview

### Problem Statement

O group_admin não consegue personalizar a mensagem de boas-vindas (onboarding), configurar dias de trial ou definir o preço da assinatura — tudo está hardcoded ou em config global (`system_config`). Além disso, o plano do Mercado Pago ainda inclui `free_trial: 7 dias`, gerando conflito com o trial interno que agora é gerenciado pela aplicação.

### Solution

Criar nova seção no módulo Comunidade do admin panel com:
1. **Editor de mensagem de onboarding** com sistema de placeholders clicáveis e preview client-side
2. **Configurações por grupo** — trial days e preço da assinatura salvos na tabela `groups`
3. **Remover `free_trial` do MP** nos novos planos criados (planos existentes mantidos intactos)
4. **Adaptar bot** para ler template e configs do grupo ao invés de usar hardcoded/global

### Scope

**In Scope:**
- Sub-item "Onboarding" na sidebar Comunidade (editor de template + preview)
- Sub-item "Configurações" na sidebar Comunidade (trial days + preço por grupo)
- Migration: colunas `trial_days` e `welcome_message_template` na tabela `groups` (`subscription_price` já existe como VARCHAR)
- Remover `free_trial` do payload do MP ao criar novos planos
- Adaptar `startCommand.js` para usar o template do grupo em vez de hardcoded
- Preview da mensagem de onboarding (client-side, sem proxy para bot)

**Out of Scope:**
- Cancelar/recriar planos MP existentes (otimização futura)
- Edição da mensagem do fluxo Mercado Pago (foco no internal trial)
- WhatsApp onboarding

---

## Context for Development

### Codebase Patterns

- **API routes:** `createApiHandler` com `withTenant()` para isolamento multi-tenant. Zod para validação de input.
- **Group configs:** Stored diretamente na tabela `groups` como colunas ou JSONB (ex: `copy_tone_config`, `posting_schedule`, `max_active_bets`).
- **BotContext:** Carregado em `telegram.js:initBots()` (linha 119) via JOIN `bot_pool` → `groups`. Configs ficam em `ctx.groupConfig` com campos: name, postingSchedule, maxActiveBets, copyToneConfig, checkoutUrl, operatorUsername, subscriptionPrice.
- **Preview de bet:** Proxy admin→bot via `BOT_API_URL` com LLM. **Onboarding preview NÃO precisa disto** — é substituição de placeholders determinística, renderizado client-side.
- **Trial days atual:** Global em `system_config` via `getConfig('TRIAL_DAYS', '7')` com cache 5min em `configHelper.js`. `getTrialDays()` em `memberService.js:1520`.
- **Sidebar:** Módulo "Comunidade" (Sidebar.tsx:22-29) com Dashboard, Membros, Mensagens. Adicionar Onboarding e Configurações.
- **Role-based pages:** Padrão em `tone/page.tsx` — group_admin é redirecionado para seu grupo; super_admin vê seletor de grupos.
- **Audit log:** PUT em groups registra old/new values (ref: `groups/[groupId]/route.ts`).

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `admin-panel/src/components/layout/Sidebar.tsx:22-29` | Sidebar — módulo Comunidade, adicionar sub-itens |
| `admin-panel/src/lib/mercadopago.ts:110-113` | `free_trial` hardcoded em `createSubscriptionPlan()` |
| `admin-panel/src/lib/__tests__/mercadopago.test.ts:64-68` | Test que asserta `free_trial` — remover assertion |
| `bot/handlers/startCommand.js:769-823` | Template welcome message hardcoded (internal trial + MP flow) |
| `bot/handlers/startCommand.js:374-389` | `handleInternalTrialStart()` — chama `getTrialDays()` global |
| `bot/handlers/startCommand.js:705-837` | `generateAndSendInvite()` — monta welcome message com variáveis |
| `bot/services/memberService.js:1520-1530` | `getTrialDays()` — lê `system_config` global |
| `bot/telegram.js:119-143` | `initBots()` — SELECT das colunas de `groups`, monta groupConfig |
| `bot/telegram.js:160-168` | groupConfig object — adicionar `trialDays` e `welcomeMessageTemplate` |
| `admin-panel/src/app/(auth)/tone/page.tsx` | Referência UX: role-based redirect pattern |
| `admin-panel/src/components/features/tone/ToneConfigForm.tsx` | Referência UX: editor + preview + group selector |
| `admin-panel/src/app/api/groups/[groupId]/route.ts:73-164` | Referência: PUT com Zod + audit log |
| `sql/migrations/037_group_operator_price.sql` | Migration que adicionou `subscription_price` VARCHAR |

### Technical Decisions

1. **Placeholders via chips clicáveis**: Tags abaixo do textarea. Clicar insere `{placeholder}` na posição do cursor. Legenda com descrição e exemplo de cada.

2. **Preview 100% client-side**: Substituição de placeholders com dados reais do grupo (nome, trial_days, preço) + mock para dados de membro (nome, data_expiracao). Renderiza Telegram markdown (`*bold*` → `<strong>`). Sem necessidade de proxy para bot.

3. **Trial days per-group**: Coluna `trial_days` INTEGER DEFAULT 7 na tabela `groups`. No bot: `handleInternalTrialStart()` lê de `botCtx.groupConfig.trialDays` em vez de `getTrialDays()` global.

4. **Preço per-group**: `subscription_price` já existe como VARCHAR (migration 037). Já está no botCtx. Apenas expor no admin panel para edição.

5. **MP free_trial removido**: Remover bloco `free_trial` de `createSubscriptionPlan()` em `mercadopago.ts`. Planos existentes mantidos intactos.

6. **Template default**: Quando `welcome_message_template` é NULL, bot usa template hardcoded (backwards compatible). O admin panel mostra o default no editor quando NULL.

7. **Inline keyboard não editável**: Os botões (ENTRAR NO GRUPO, ASSINAR AGORA) são fixos e não fazem parte do template editável.

---

## Implementation Plan

### Tasks

- [x] **Task 1: Migration — adicionar colunas ao `groups`**
  - File: `sql/migrations/058_group_onboarding_settings.sql`
  - Action: Criar migration com:
    ```sql
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 7;
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS welcome_message_template TEXT;
    ```
  - Notes: `subscription_price` já existe (VARCHAR, migration 037). Não precisa RLS novo — `groups` já tem policies. Aplicar via Supabase Management API.

- [x] **Task 2: API route — community settings CRUD**
  - File: `admin-panel/src/app/api/groups/[groupId]/community-settings/route.ts` (NOVO)
  - Action: Criar GET e PUT handlers usando `createApiHandler`:
    - **GET**: Retorna `{ trial_days, subscription_price, welcome_message_template }` do grupo. Group_admin só acessa seu grupo (via `groupFilter`).
    - **PUT**: Valida com Zod schema:
      - `trial_days`: z.number().int().min(1).max(30).optional()
      - `subscription_price`: z.string().max(50).optional() (ex: "R$ 49,90/mês")
      - `welcome_message_template`: z.string().max(2000).nullable().optional()
    - Faz update na tabela `groups` com os campos enviados.
    - Registra audit_log com old/new values (pattern de `groups/[groupId]/route.ts:148-159`).
  - Notes: Usar `allowedRoles: ['super_admin', 'group_admin']`. Group_admin só edita seu grupo. Super_admin edita qualquer grupo via `groupId` param.

- [x] **Task 3: Bot — carregar novas configs no botCtx**
  - File: `bot/telegram.js`
  - Action:
    - Linha 130-141 (SELECT): Adicionar `trial_days` e `welcome_message_template` na query de `groups`:
      ```
      groups!inner (
        ..., trial_days, welcome_message_template
      )
      ```
    - Linha 160-168 (groupConfig): Adicionar campos:
      ```javascript
      trialDays: row.groups.trial_days || 7,
      welcomeMessageTemplate: row.groups.welcome_message_template || null,
      ```
  - Notes: Fallback `|| 7` para trialDays garante compatibilidade se migration não foi aplicada.

- [x] **Task 4: Bot — usar trial_days do grupo em vez de global**
  - File: `bot/handlers/startCommand.js`
  - Action:
    - Linha 380-381: Substituir `getTrialDays()` global por leitura do botCtx:
      ```javascript
      // ANTES:
      const trialDaysResult = await getTrialDays();
      const trialDays = trialDaysResult.success ? trialDaysResult.data.days : 7;

      // DEPOIS:
      const groupConfig = effectiveBotCtx?.groupConfig;
      const trialDays = groupConfig?.trialDays || 7;
      ```
  - Notes: Remove a dependência de `system_config` para trial days. O valor já está em `botCtx.groupConfig.trialDays` carregado no startup (Task 3). Se o bot for reiniciado, pega o valor atualizado.

- [x] **Task 5: Bot — renderizar welcome message a partir do template**
  - File: `bot/handlers/startCommand.js`
  - Action:
    - Criar função `renderWelcomeTemplate(template, vars)` que substitui placeholders:
      ```javascript
      function renderWelcomeTemplate(template, vars) {
        return template
          .replace(/\{nome\}/g, vars.nome || 'apostador')
          .replace(/\{grupo\}/g, vars.grupo || '')
          .replace(/\{dias_trial\}/g, String(vars.dias_trial || 7))
          .replace(/\{data_expiracao\}/g, vars.data_expiracao || '—')
          .replace(/\{taxa_acerto\}/g, vars.taxa_acerto || '0')
          .replace(/\{preco\}/g, vars.preco || '');
      }
      ```
    - Linha 769 (bloco `if (trialMode === 'internal' && isTrialMember)`): Substituir o template hardcoded:
      ```javascript
      const template = groupConfig?.welcomeMessageTemplate || DEFAULT_WELCOME_TEMPLATE;

      welcomeMessage = renderWelcomeTemplate(template, {
        nome: firstName || 'apostador',
        grupo: getGroupName(botCtx),
        dias_trial: trialDays,
        data_expiracao: trialEndsAt,
        taxa_acerto: successRateText,
        preco: subscriptionPrice || '',
      });
      ```
    - Definir `DEFAULT_WELCOME_TEMPLATE` como constante no topo do arquivo (o template atual convertido para placeholders):
      ```javascript
      const DEFAULT_WELCOME_TEMPLATE = `🎉 Bem-vindo ao *{grupo}*, {nome}!

      Seu trial de *{dias_trial} dias* começa agora!
      📅 *Válido até:* {data_expiracao}

      📊 *O que você recebe:*
      • 3 sugestões de apostas diárias
      • Análise estatística completa
      • Taxa de acerto histórica: *{taxa_acerto}%*

      💰 Para continuar após o trial, assine por apenas *{preco}*.

      👇 *Clique no botão abaixo para entrar no grupo:*`.replace(/^      /gm, '');
      ```
    - Tratar caso de `{preco}` vazio: se `subscriptionPrice` for null/empty, substituir a linha de preço por "Para continuar após o trial, consulte o operador."
  - Notes: A lógica de `priceLineInternalTrial` (linha 775-777) é absorvida pelo template. Se o template customizado não incluir `{preco}`, a linha simplesmente não aparece. O `DEFAULT_WELCOME_TEMPLATE` inclui `{preco}` para manter o comportamento atual.

- [x] **Task 6: Fix MP — remover free_trial**
  - File: `admin-panel/src/lib/mercadopago.ts`
  - Action: Remover linhas 110-113 do payload de `createSubscriptionPlan()`:
    ```typescript
    // REMOVER:
    free_trial: {
      frequency: 7,
      frequency_type: 'days',
    },
    ```
  - Notes: Novos planos criados sem trial no MP. Planos existentes continuam com o free_trial original — não cancelamos/recriamos.

- [x] **Task 7: Fix MP test — atualizar assertion**
  - File: `admin-panel/src/lib/__tests__/mercadopago.test.ts`
  - Action: Remover a assertion que verifica `free_trial` no payload:
    ```typescript
    // REMOVER:
    expect(body.auto_recurring.free_trial).toEqual({
      frequency: 7,
      frequency_type: 'days',
    });
    ```
    Adicionar assertion negativa:
    ```typescript
    expect(body.auto_recurring.free_trial).toBeUndefined();
    ```

- [x] **Task 8: Componente — OnboardingEditor**
  - File: `admin-panel/src/components/features/community/OnboardingEditor.tsx` (NOVO)
  - Action: Criar componente com:
    - **Props:** `groupId: string`, `initialTemplate: string | null`, `groupName: string`, `trialDays: number`, `subscriptionPrice: string | null`
    - **State:** `template` (textarea value), `previewing` (boolean), `saving` (boolean)
    - **Textarea:** Pré-populado com `initialTemplate || DEFAULT_WELCOME_TEMPLATE` (mesma constante do bot). Markdown plain text.
    - **Placeholder chips:** Abaixo do textarea, row de chips clicáveis:
      ```
      {nome} {grupo} {dias_trial} {data_expiracao} {taxa_acerto} {preco}
      ```
      Cada chip mostra o nome do placeholder. Tooltip ou texto menor mostra a descrição. Ao clicar, insere o placeholder na posição do cursor no textarea (usar `ref` + `selectionStart`).
    - **Legenda:** Tabela ou lista compacta abaixo dos chips:
      | Placeholder | Descrição | Exemplo |
      |---|---|---|
      | `{nome}` | Nome do membro | João |
      | `{grupo}` | Nome do grupo | (nome real) |
      | `{dias_trial}` | Dias de trial | (valor configurado) |
      | `{data_expiracao}` | Data fim trial | dd/mm/yyyy |
      | `{taxa_acerto}` | Taxa de acerto | 66.6 |
      | `{preco}` | Preço assinatura | (valor configurado) |
    - **Botão "Preview":** Renderiza o template substituindo placeholders com:
      - `{nome}` → "João" (mock)
      - `{grupo}` → `groupName` (real)
      - `{dias_trial}` → `trialDays` (real)
      - `{data_expiracao}` → hoje + trialDays formatado dd/mm/yyyy
      - `{taxa_acerto}` → "66.6" (mock)
      - `{preco}` → `subscriptionPrice` (real) ou "R$ XX,XX"
    - **Preview display:** Box estilizado como mensagem do Telegram. Converte Telegram markdown para HTML: `*bold*` → `<strong>`, links, etc. Mostra inline keyboard mockado (botões desabilitados): "🚀 ENTRAR NO GRUPO" + "💳 ASSINAR AGORA".
    - **Botão "Salvar":** PUT `/api/groups/{groupId}/community-settings` com `{ welcome_message_template: template }`. Toast de sucesso/erro.
    - **Botão "Restaurar padrão":** Reseta textarea para `DEFAULT_WELCOME_TEMPLATE`. Confirmar com dialog antes.
  - Notes: Usar Tailwind. Sem dependência de bibliotecas externas para markdown rendering — implementar uma função simples `telegramMarkdownToHtml()` que cobre `*bold*`, `_italic_`, backticks.

- [x] **Task 9: Componente — CommunitySettingsForm**
  - File: `admin-panel/src/components/features/community/CommunitySettingsForm.tsx` (NOVO)
  - Action: Criar componente com:
    - **Props:** `groupId: string`, `initialTrialDays: number`, `initialPrice: string | null`
    - **Campos:**
      - `trial_days`: Input number (min 1, max 30, step 1). Label: "Dias de trial". Helper text: "Duração do período de teste para novos membros (1-30 dias)".
      - `subscription_price`: Input text. Label: "Preço da assinatura". Placeholder: "Ex: R$ 49,90/mês". Helper text: "Exibido na mensagem de boas-vindas".
    - **Botão "Salvar":** PUT `/api/groups/{groupId}/community-settings` com `{ trial_days, subscription_price }`. Toast de sucesso/erro. Desabilitado se nenhuma mudança.
  - Notes: Layout simples, dois campos + botão. Seguir padrão visual das outras forms do admin panel.

- [x] **Task 10: Página — Onboarding**
  - File: `admin-panel/src/app/(auth)/onboarding/page.tsx` (NOVO)
  - Action: Criar page client-side:
    - **Role detection** (padrão `tone/page.tsx`):
      - `group_admin` → fetch seu grupo automaticamente via `/api/groups` (single result)
      - `super_admin` → seletor de grupo no topo
    - **Data fetch:** GET `/api/groups/{groupId}/community-settings` para carregar `welcome_message_template`, `trial_days`, `subscription_price`. GET `/api/groups/{groupId}` para `name`.
    - **Render:** `<OnboardingEditor>` com as props carregadas.
    - **Loading/error states:** Skeleton enquanto carrega, mensagem de erro se falhar.

- [x] **Task 11: Página — Configurações da Comunidade**
  - File: `admin-panel/src/app/(auth)/community-settings/page.tsx` (NOVO)
  - Action: Criar page client-side:
    - **Role detection** (mesmo padrão da Task 10):
      - `group_admin` → seu grupo automaticamente
      - `super_admin` → seletor de grupo
    - **Data fetch:** GET `/api/groups/{groupId}/community-settings`
    - **Render:** `<CommunitySettingsForm>` com props carregadas.

- [x] **Task 12: Sidebar — adicionar sub-itens à Comunidade**
  - File: `admin-panel/src/components/layout/Sidebar.tsx`
  - Action: Adicionar no array `children` do módulo "Comunidade" (linha 25-29):
    ```typescript
    { name: 'Onboarding', href: '/onboarding', icon: '🎉' },
    { name: 'Configurações', href: '/community-settings', icon: '⚙️' },
    ```
    Posicionar após "Mensagens".

- [x] **Task 13: Testes — OnboardingEditor**
  - File: `admin-panel/src/components/features/community/OnboardingEditor.test.tsx` (NOVO)
  - Action: Testes com Vitest + React Testing Library:
    - Renderiza com template default quando `initialTemplate` é null
    - Renderiza com template customizado quando fornecido
    - Clicar em chip de placeholder insere no textarea
    - Preview substitui placeholders corretamente
    - Preview renderiza Telegram markdown (*bold*) como HTML
    - Salvar chama PUT com template atualizado
    - Restaurar padrão reseta para DEFAULT_WELCOME_TEMPLATE

- [x] **Task 14: Testes — CommunitySettingsForm**
  - File: `admin-panel/src/components/features/community/CommunitySettingsForm.test.tsx` (NOVO)
  - Action: Testes com Vitest + React Testing Library:
    - Renderiza campos com valores iniciais
    - Validação: trial_days min 1, max 30
    - Salvar chama PUT com dados atualizados
    - Botão desabilitado quando sem mudanças
    - Mostra toast de sucesso/erro

- [x] **Task 15: Testes — API route community-settings**
  - File: `admin-panel/src/app/api/groups/[groupId]/__tests__/community-settings.test.ts` (NOVO)
  - Action: Testes com Vitest:
    - GET retorna campos corretos
    - PUT valida trial_days range (rejeita 0, 31, -1)
    - PUT valida subscription_price max length
    - PUT atualiza e retorna sucesso
    - PUT registra audit_log
    - Group_admin só acessa seu grupo (403 para outro)

### Acceptance Criteria

- [x] **AC 1:** Given um group_admin logado, when navega para /onboarding, then vê o editor de template pré-populado com o template atual (ou default se nunca editou).

- [x] **AC 2:** Given o editor de onboarding carregado, when clica no chip `{nome}`, then o placeholder `{nome}` é inserido na posição do cursor no textarea.

- [x] **AC 3:** Given um template editado com placeholders, when clica "Preview", then vê a mensagem renderizada com dados reais do grupo (nome, trial_days, preço) e mock para membro (nome "João", data_expiracao calculada), formatada como mensagem do Telegram com bold, e botões mockados.

- [x] **AC 4:** Given um template editado, when clica "Salvar", then o template é persistido em `groups.welcome_message_template` e toast de sucesso é exibido.

- [x] **AC 5:** Given um group_admin logado, when navega para /community-settings, then vê campos de trial_days (número) e preço da assinatura (texto) com valores atuais do grupo.

- [x] **AC 6:** Given o formulário de configurações, when altera trial_days para 5 e salva, then o valor é persistido em `groups.trial_days` e audit_log registra a mudança.

- [x] **AC 7:** Given trial_days configurado como 5 no grupo, when um novo membro inicia trial via bot, then o bot cria o trial com 5 dias (não 7 global).

- [x] **AC 8:** Given `welcome_message_template` customizado no grupo, when um novo membro inicia trial via bot, then a mensagem enviada usa o template customizado com placeholders substituídos.

- [x] **AC 9:** Given `welcome_message_template` NULL no grupo, when um novo membro inicia trial via bot, then a mensagem enviada usa o template default (comportamento atual preservado).

- [x] **AC 10:** Given a criação de um novo plano de assinatura no Mercado Pago, when `createSubscriptionPlan()` é chamado, then o payload NÃO inclui `free_trial`.

- [x] **AC 11:** Given um group_admin, when tenta acessar configurações de outro grupo via API, then recebe 403/401.

- [x] **AC 12:** Given trial_days = 0 ou 31 no input, when tenta salvar, then a validação rejeita com mensagem de erro.

---

## Additional Context

### Dependencies

- **Migration #058** deve ser aplicada antes do deploy do bot e admin panel
- Bot precisa ser re-deployed após mudanças em `startCommand.js` e `telegram.js` (recarrega groupConfig no startup)
- Se migration não foi aplicada, bot usa fallback (`trialDays: 7`, `welcomeMessageTemplate: null`)
- Admin panel depende do Supabase Auth para role detection

### Testing Strategy

**Unit Tests (Vitest — admin panel):**
- `OnboardingEditor.test.tsx` — chip insertion, preview rendering, save
- `CommunitySettingsForm.test.tsx` — validation, save, disabled state
- `community-settings.test.ts` — API route GET/PUT, validation, auth
- `mercadopago.test.ts` — atualizar test existente (remover free_trial assertion)

**Build:**
- `npm run build` no admin-panel — TypeScript strict deve passar

**E2E (Playwright):**
1. Login como group_admin → navegar para /onboarding → editar template → preview → salvar → recarregar e verificar persistência
2. Navegar para /community-settings → alterar trial_days para 5 → salvar → recarregar e verificar
3. Verificar que sidebar mostra Onboarding e Configurações sob Comunidade

### Notes

**Placeholders disponíveis:**

| Placeholder | Descrição | Mock para preview | Fonte real no bot |
|---|---|---|---|
| `{nome}` | Primeiro nome do membro | João | `firstName` param |
| `{grupo}` | Nome do grupo | (nome real do grupo) | `getGroupName(botCtx)` |
| `{dias_trial}` | Dias de trial configurados | (valor real) | `groupConfig.trialDays` |
| `{data_expiracao}` | Data fim do trial (dd/mm/yyyy) | (hoje + dias_trial) | `member.trial_ends_at` |
| `{taxa_acerto}` | Taxa de acerto histórica (%) | 66.6 | `getSuccessRateForDays(30)` |
| `{preco}` | Preço da assinatura | (valor real ou "R$ XX,XX") | `groupConfig.subscriptionPrice` |

**Template default** (exatamente o que é enviado hoje, convertido para placeholders):
```
🎉 Bem-vindo ao *{grupo}*, {nome}!

Seu trial de *{dias_trial} dias* começa agora!
📅 *Válido até:* {data_expiracao}

📊 *O que você recebe:*
• 3 sugestões de apostas diárias
• Análise estatística completa
• Taxa de acerto histórica: *{taxa_acerto}%*

💰 Para continuar após o trial, assine por apenas *{preco}*.

👇 *Clique no botão abaixo para entrar no grupo:*
```

**Riscos identificados:**
1. **Bot cold-start:** O bot carrega `groupConfig` no startup. Se admin edita trial_days/template, o bot só pega no próximo restart. Mitigação: aceitável, pois o bot reinicia a cada deploy e os valores mudam raramente. Alternativa futura: recarregar config sob demanda.
2. **Template inválido:** Admin pode escrever template com markdown quebrado. Mitigação: preview mostra exatamente como fica. Se renderização falhar no bot, usa fallback default.
3. **Planos MP existentes:** Continuam com 7 dias free_trial. Mitigação: explicitamente fora de escopo. Novos planos não terão.

**Decisão futura (fora de escopo):**
- Hot-reload de groupConfig sem restart do bot
- Recriar planos MP existentes sem free_trial
- Template para fluxo Mercado Pago (não apenas internal trial)
- WhatsApp onboarding message
