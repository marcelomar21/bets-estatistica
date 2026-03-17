---
title: 'Sincronização de Preço — Community Settings + Mercado Pago'
slug: 'sync-price-mp'
created: '2026-03-16'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'TypeScript 5.x', 'Supabase', 'Mercado Pago API (preapproval_plan)', 'Node.js 20+ (bot)', 'Vitest 3.2', 'Jest (bot)', 'Zod 4.x']
files_to_modify:
  - 'sql/migrations/059_subscription_price_numeric.sql'
  - 'admin-panel/src/lib/mercadopago.ts'
  - 'admin-panel/src/lib/__tests__/mercadopago.test.ts'
  - 'admin-panel/src/lib/format.ts'
  - 'admin-panel/src/app/api/groups/[groupId]/community-settings/route.ts'
  - 'admin-panel/src/app/api/__tests__/community-settings.test.ts'
  - 'admin-panel/src/app/api/groups/onboarding/route.ts'
  - 'admin-panel/src/components/features/community/CommunitySettingsForm.tsx'
  - 'admin-panel/src/components/features/community/CommunitySettingsForm.test.tsx'
  - 'admin-panel/src/components/features/community/OnboardingEditor.tsx'
  - 'admin-panel/src/components/features/community/OnboardingEditor.test.tsx'
  - 'bot/lib/formatPrice.js'
  - 'bot/telegram.js'
  - 'bot/handlers/startCommand.js'
  - 'bot/handlers/memberEvents.js'
  - 'bot/services/notificationService.js'
  - 'bot/jobs/membership/trial-reminders.js'
  - 'bot/jobs/membership/renewal-reminders.js'
code_patterns:
  - 'createApiHandler + withTenant() para todas API routes'
  - 'Service response pattern: { success: true, data } | { success: false, error: { code, message } }'
  - 'Zod schema validation em API routes'
  - 'Audit log em updates de grupo'
  - 'MP API: PUT /preapproval_plan/{id} para update (mesmo endpoint que deactivate, body diferente)'
  - 'groupConfig.subscriptionPrice usado em 6+ arquivos no bot — todos interpolam como string em mensagens Telegram'
  - 'Onboarding wizard já recebe price como number, mas NÃO grava em subscription_price — só cria plano MP'
test_patterns:
  - 'Vitest + mock fetch para API/MP calls (admin panel)'
  - 'Jest + mock supabase chains (bot services)'
  - 'Mock fetch para MP API calls'
---

# Tech-Spec: Sincronização de Preço — Community Settings + Mercado Pago

**Created:** 2026-03-16

## Overview

### Problem Statement

O campo `subscription_price` na tabela `groups` é VARCHAR (texto livre, ex: "R$ 50/mês") e desconectado do plano do Mercado Pago. Quando o group_admin altera o preço na página de Configurações da Comunidade, apenas o texto de exibição muda — o plano MP continua com o valor antigo. Assinantes novos pagam o preço errado. Além disso, o onboarding wizard cria o plano MP com preço numérico mas **não grava esse valor** em `subscription_price`.

### Solution

1. Migrar `subscription_price` de VARCHAR para NUMERIC(10,2) (valor em reais, ex: 49.90)
2. Criar `updateSubscriptionPlan(planId, newPrice)` que faz `PUT /preapproval_plan/{id}` com novo `transaction_amount`
3. Ao salvar preço em Community Settings, se o grupo tem `mp_plan_id`, atualizar o plano MP automaticamente
4. Criar utility `formatBRL(price)` para formatar o valor numérico para exibição ("R$ 49,90")
5. Adaptar todos os usos no bot (6+ arquivos) para formatar preço numérico
6. Onboarding wizard: gravar preço numérico em `subscription_price` ao criar plano MP

### Scope

**In Scope:**
- Migration: `subscription_price` VARCHAR → NUMERIC(10,2) com conversão de dados existentes
- Nova função `updateSubscriptionPlan(planId, newPrice)` em `mercadopago.ts`
- PUT community-settings: se preço mudou e grupo tem `mp_plan_id`, atualizar plano MP
- Utility `formatBRL()` (frontend + bot)
- Frontend: input numérico com formatação BRL no CommunitySettingsForm
- Bot: todos os 6+ arquivos que interpolam `subscriptionPrice` devem usar `formatBRL()`
- Wizard onboarding: gravar `subscription_price` NUMERIC após criar plano MP
- OnboardingEditor: adaptar preview para formatar preço numérico

**Out of Scope:**
- Alterar ciclo de cobrança de assinantes existentes (MP atualiza automaticamente no próximo ciclo)
- Moedas além de BRL
- Histórico de preços

---

## Context for Development

### Codebase Patterns

- **MP API:** `PUT /preapproval_plan/{id}` aceita `auto_recurring.transaction_amount` para update de preço. `deactivateSubscriptionPlan()` já usa essa rota (muda `status`). Mesmo padrão HTTP/auth para update de preço.
- **`subscription_price` VARCHAR (migration 037):** Usado no bot (`groupConfig.subscriptionPrice`) e no admin panel. TODOS os usos no bot interpolam diretamente como string em mensagens Telegram.
- **Onboarding wizard:** `groups/onboarding/route.ts:238` chama `createSubscriptionPlan(name, id, price)` com preço numérico do request body. Grava `mp_plan_id` e `checkout_url` no DB, mas **NÃO grava `subscription_price`**.
- **Community Settings API:** `groups/[groupId]/community-settings/route.ts` — PUT aceita `subscription_price` como `z.string().nullable().optional()`. Precisa ser adaptado para `z.number()` + chamada MP.
- **Bot usage (6+ arquivos):** `startCommand.js`, `memberEvents.js`, `notificationService.js`, `trial-reminders.js`, `renewal-reminders.js` — todos usam `groupConfig.subscriptionPrice` como string.
- **Nenhum formatter de moeda existe** no codebase.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `admin-panel/src/lib/mercadopago.ts` | `createSubscriptionPlan()` e `deactivateSubscriptionPlan()` — base para `updateSubscriptionPlan()` |
| `admin-panel/src/lib/__tests__/mercadopago.test.ts` | Testes MP existentes |
| `admin-panel/src/app/api/groups/onboarding/route.ts:214-286` | Step `configuring_mp` — cria plano MP, precisa gravar `subscription_price` |
| `admin-panel/src/app/api/groups/[groupId]/community-settings/route.ts` | PUT — adaptar schema para numeric + chamada MP |
| `admin-panel/src/components/features/community/CommunitySettingsForm.tsx` | Input de preço — mudar de text para numeric |
| `admin-panel/src/components/features/community/OnboardingEditor.tsx` | Preview — formatar preço numérico |
| `bot/telegram.js:169` | `subscriptionPrice: row.groups.subscription_price` — agora retorna number |
| `bot/handlers/startCommand.js:693,751,821,832,900-926` | Múltiplos usos de `subscriptionPrice` como string |
| `bot/handlers/memberEvents.js:312-323,499-502` | `getSubscriptionPrice()` + interpolação |
| `bot/services/notificationService.js:252` | `getSubscriptionPrice()` |
| `bot/jobs/membership/trial-reminders.js:130` | `subscriptionPrice` em reminders |
| `bot/jobs/membership/renewal-reminders.js:250` | `subscriptionPrice` em renewal |
| `sql/migrations/037_group_operator_price.sql` | Migration original: `subscription_price VARCHAR` |

### Technical Decisions

1. **NUMERIC(10,2)** — compatível com MP `transaction_amount` (decimal). CHECK >= 0.
2. **Conversão de dados existentes:** Migration com regex para extrair número do VARCHAR. Ex: "R$ 49,90/mês" → regex captura "49,90" → converte `,` para `.` → 49.90. Se não parseável, NULL.
3. **`updateSubscriptionPlan()`** — retorna mesmo type que `deactivateSubscriptionPlan()` (success/error simples).
4. **Se grupo não tem `mp_plan_id`**, o PUT community-settings só atualiza o DB (sem chamada MP).
5. **`formatBRL(price)`** — utility compartilhada:
   - Frontend (TypeScript): `admin-panel/src/lib/format.ts` — `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)`
   - Bot (JS): `bot/lib/formatPrice.js` — `'R$ ' + price.toFixed(2).replace('.', ',')`
6. **Onboarding wizard** deve gravar `subscription_price` no DB junto com `mp_plan_id` e `checkout_url`.
7. **Bot `groupConfig.subscriptionPrice`** continua com a mesma key mas agora é `number | null` em vez de `string | null`. Todos os usos devem chamar `formatBRL()` antes de interpolar.

---

## Implementation Plan

### Tasks

- [x] **Task 1: Migration — `subscription_price` VARCHAR → NUMERIC(10,2)**
  - File: `sql/migrations/059_subscription_price_numeric.sql`
  - Action:
    - Adicionar coluna temporária `subscription_price_new NUMERIC(10,2)`
    - UPDATE para converter dados existentes: `regexp_replace(subscription_price, '[^0-9,.]', '', 'g')`, trocar `,` por `.`, cast para NUMERIC. Se falhar, NULL.
    - DROP `subscription_price` VARCHAR
    - RENAME `subscription_price_new` → `subscription_price`
    - ADD CHECK `subscription_price >= 0`
  - Notes: Usar abordagem add+rename para evitar perda de dados. Testar conversão com dados reais antes de aplicar.

- [x] **Task 2: Utility — `formatBRL()` no bot**
  - File: `bot/lib/formatPrice.js` (NOVO)
  - Action: Criar função:
    ```javascript
    function formatBRL(price) {
      if (price == null || isNaN(price)) return null;
      return 'R$ ' + Number(price).toFixed(2).replace('.', ',');
    }
    module.exports = { formatBRL };
    ```
  - Notes: Retorna `null` se input inválido. Os callers já lidam com null (`|| 'consulte o operador'`).

- [x] **Task 3: Utility — `formatBRL()` no admin panel**
  - File: `admin-panel/src/lib/format.ts` (NOVO)
  - Action: Criar função:
    ```typescript
    export function formatBRL(price: number | null): string | null {
      if (price == null) return null;
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
    }
    ```

- [x] **Task 4: `updateSubscriptionPlan()` no Mercado Pago**
  - File: `admin-panel/src/lib/mercadopago.ts`
  - Action: Adicionar função seguindo padrão de `deactivateSubscriptionPlan()`:
    ```typescript
    export async function updateSubscriptionPlanPrice(
      planId: string,
      newPrice: number,
    ): Promise<DeactivatePlanResult> {
      // PUT /preapproval_plan/{planId}
      // body: { auto_recurring: { transaction_amount: newPrice } }
      // Mesma estrutura de error handling que deactivateSubscriptionPlan
    }
    ```
  - Notes: Retorna `DeactivatePlanResult` (success/error). Mesmo endpoint, body diferente.

- [x] **Task 5: Teste — `updateSubscriptionPlanPrice()`**
  - File: `admin-panel/src/lib/__tests__/mercadopago.test.ts`
  - Action: Adicionar describe block para `updateSubscriptionPlanPrice` com testes:
    - Sucesso: retorna `{ success: true }`
    - 401: credenciais inválidas
    - 500: erro temporário
    - Verifica payload enviado tem `auto_recurring.transaction_amount`

- [x] **Task 6: API route — adaptar PUT community-settings para numeric + MP sync**
  - File: `admin-panel/src/app/api/groups/[groupId]/community-settings/route.ts`
  - Action:
    - Mudar schema: `subscription_price: z.number().min(0.01).max(99999.99).nullable().optional()`
    - No handler PUT, após update no DB:
      - Se `subscription_price` mudou e é não-null:
        - Buscar `mp_plan_id` do grupo
        - Se `mp_plan_id` existe: chamar `updateSubscriptionPlanPrice(mp_plan_id, newPrice)`
        - Se MP falhar: retornar warning no response (DB já foi atualizado, MP não)
    - Adaptar GET: `subscription_price` agora retorna number do DB
  - Notes: MP update é best-effort — se falhar, o DB já foi atualizado. Logar warning e informar o admin.

- [x] **Task 7: Teste — API route community-settings com MP sync**
  - File: `admin-panel/src/app/api/__tests__/community-settings.test.ts`
  - Action: Atualizar testes existentes + adicionar:
    - PUT com preço numérico válido → sucesso
    - PUT com preço → chama `updateSubscriptionPlanPrice` se `mp_plan_id` existe
    - PUT com preço → não chama MP se `mp_plan_id` é null
    - PUT com preço 0 ou negativo → rejeita validação
    - PUT com MP sync falha → retorna warning mas DB atualizado

- [x] **Task 8: CommunitySettingsForm — input numérico + formatação**
  - File: `admin-panel/src/components/features/community/CommunitySettingsForm.tsx`
  - Action:
    - Mudar prop `initialPrice: string | null` → `initialPrice: number | null`
    - Input: `type="number"` com `min={0.01}` `step={0.01}`
    - Exibir valor formatado como "R$ X,XX" abaixo do input (read-only preview)
    - Enviar como `subscription_price: numericValue` (number) no PUT
  - Notes: Usar `formatBRL()` de `@/lib/format` para o preview.

- [x] **Task 9: Teste — CommunitySettingsForm numeric**
  - File: `admin-panel/src/components/features/community/CommunitySettingsForm.test.tsx`
  - Action: Atualizar testes para `initialPrice: number | null`, validar input numérico, verificar payload numérico no PUT.

- [x] **Task 10: OnboardingEditor — formatar preço numérico no preview**
  - File: `admin-panel/src/components/features/community/OnboardingEditor.tsx`
  - Action:
    - Mudar prop `subscriptionPrice: string | null` → `subscriptionPrice: number | null`
    - Usar `formatBRL(subscriptionPrice)` em vez de `subscriptionPrice` no preview e na tabela de legenda
    - Atualizar `getPreviewHtml()`: `{preco}` → `formatBRL(subscriptionPrice) || 'R$ XX,XX'`

- [x] **Task 11: Teste — OnboardingEditor numeric**
  - File: `admin-panel/src/components/features/community/OnboardingEditor.test.tsx`
  - Action: Atualizar props para `subscriptionPrice: number`, verificar formatação BRL no preview.

- [x] **Task 12: Pages — adaptar tipos nas páginas**
  - Files: `admin-panel/src/app/(auth)/onboarding/page.tsx`, `admin-panel/src/app/(auth)/community-settings/page.tsx`
  - Action: Atualizar interface `SettingsData` — `subscription_price: number | null` (já vem como number do DB após migration).

- [x] **Task 13: Onboarding wizard — gravar `subscription_price` no DB**
  - File: `admin-panel/src/app/api/groups/onboarding/route.ts`
  - Action:
    - Linha 256-258: Após gravar `mp_plan_id` e `checkout_url`, também gravar `subscription_price: price`:
      ```typescript
      .update({ mp_plan_id: mpResult.data.planId, checkout_url: mpResult.data.checkoutUrl, subscription_price: price })
      ```
  - Notes: `price` já é numérico (vem do Zod schema `z.number().min(1)`). Uma linha de mudança.

- [x] **Task 14: Bot — `formatBRL()` em `startCommand.js`**
  - File: `bot/handlers/startCommand.js`
  - Action:
    - Importar: `const { formatBRL } = require('../../bot/lib/formatPrice');`
    - Substituir todos os usos de `subscriptionPrice` em interpolação de string por `formatBRL(subscriptionPrice)`:
      - Linha 693: `const subscriptionPrice = groupConfig?.subscriptionPrice || null;` → OK (number agora)
      - Linha 702: `\n💰 *Valor:* ${subscriptionPrice}` → `\n💰 *Valor:* ${formatBRL(subscriptionPrice)}`
      - Linha 821: `preco: subscriptionPrice || ''` → `preco: formatBRL(subscriptionPrice) || ''`
      - Linha 832-833: `*${subscriptionPrice}*` → `*${formatBRL(subscriptionPrice)}*`
      - Linha 877: `preco: subscriptionPrice || ''` → `preco: formatBRL(subscriptionPrice) || ''`
      - Linha 906-907, 925-926: mesma substituição
    - Atualizar `renderWelcomeTemplate()`: `vars.preco` já recebe formatado, sem mudança na função.

- [x] **Task 15: Bot — `formatBRL()` em `memberEvents.js`**
  - File: `bot/handlers/memberEvents.js`
  - Action:
    - Importar `formatBRL`
    - Linha 315: `const priceLabel = subscriptionPrice || 'consulte o operador'` → `const priceLabel = formatBRL(subscriptionPrice) || 'consulte o operador'`
    - Linha 322-323: `*${subscriptionPrice}*` → `*${formatBRL(subscriptionPrice)}*`
    - Linha 502: mesma substituição

- [x] **Task 16: Bot — `formatBRL()` em `notificationService.js`, `trial-reminders.js`, `renewal-reminders.js`**
  - Files: `bot/services/notificationService.js`, `bot/jobs/membership/trial-reminders.js`, `bot/jobs/membership/renewal-reminders.js`
  - Action:
    - Importar `formatBRL` em cada arquivo
    - Substituir `subscriptionPrice` por `formatBRL(subscriptionPrice)` em todas as interpolações de mensagem
    - `notificationService.js:252`: `getSubscriptionPrice()` retorna number agora — callers devem formatar

- [x] **Task 17: Bot — `telegram.js` — nenhuma mudança necessária**
  - File: `bot/telegram.js`
  - Action: Nenhuma. `subscriptionPrice: row.groups.subscription_price || null` já funciona — Supabase retorna number do NUMERIC. A key permanece igual.
  - Notes: Confirmar que `|| null` trata `0` corretamente (0 é falsy → vira null). Se precisar permitir preço 0, mudar para `?? null`.

- [x] **Task 18: Teste — `formatBRL()` no bot**
  - File: `bot/lib/__tests__/formatPrice.test.js` (NOVO)
  - Action: Testes Jest:
    - `formatBRL(49.90)` → `'R$ 49,90'`
    - `formatBRL(0)` → `'R$ 0,00'`
    - `formatBRL(null)` → `null`
    - `formatBRL(undefined)` → `null`
    - `formatBRL(1000)` → `'R$ 1000,00'`

### Acceptance Criteria

- [x] **AC 1:** Given um group_admin na página Configurações, when altera o preço para 39.90 e salva, then `groups.subscription_price` é 39.90 (NUMERIC) no DB e o plano MP é atualizado com `transaction_amount: 39.90`.

- [x] **AC 2:** Given um grupo sem `mp_plan_id`, when altera o preço em Configurações, then o DB é atualizado mas nenhuma chamada MP é feita.

- [x] **AC 3:** Given um grupo com `mp_plan_id` mas a API do MP falha, when altera o preço, then o DB é atualizado, o admin recebe um warning visual, e o preço antigo permanece no MP.

- [x] **AC 4:** Given dados existentes com `subscription_price` VARCHAR (ex: "R$ 49,90/mês"), when migration 059 roda, then o valor é convertido para NUMERIC 49.90.

- [x] **AC 5:** Given `subscription_price = 49.90` no DB, when a mensagem de boas-vindas é renderizada no bot, then o preço aparece formatado como "R$ 49,90".

- [x] **AC 6:** Given o input de preço no CommunitySettingsForm, when o admin digita 49.90, then vê preview "R$ 49,90" abaixo do campo e o valor é enviado como number no PUT.

- [x] **AC 7:** Given um grupo no wizard de onboarding, when step `configuring_mp` cria o plano com preço 29.90, then `groups.subscription_price` é gravado como 29.90 no DB.

- [x] **AC 8:** Given preço 0 ou negativo no input, when tenta salvar, then a validação rejeita (Zod min 0.01).

- [x] **AC 9:** Given `subscription_price = null` no grupo, when a mensagem do bot é montada, then exibe "consulte o operador" (fallback mantido).

- [x] **AC 10:** Given o OnboardingEditor com `subscriptionPrice = 49.90`, when preview é exibido, then o placeholder `{preco}` é substituído por "R$ 49,90".

---

## Additional Context

### Dependencies

- **Migration 059** deve ser aplicada antes do deploy do admin panel e bot
- **Migration 058** (onboarding settings) deve estar aplicada (já está)
- Bot precisa ser re-deployed após mudanças em `startCommand.js`, `memberEvents.js`, etc.
- Se migration não foi aplicada, `subscription_price` retorna string do VARCHAR — bot deve lidar gracefully (já faz via `formatBRL(null)`)

### Testing Strategy

**Unit Tests (Vitest — admin panel):**
- `mercadopago.test.ts` — testes para `updateSubscriptionPlanPrice()`
- `community-settings.test.ts` — PUT com numérico + MP sync
- `CommunitySettingsForm.test.tsx` — input numérico, payload
- `OnboardingEditor.test.tsx` — formatação BRL no preview

**Unit Tests (Jest — bot):**
- `formatPrice.test.js` — formatBRL com edge cases
- Testes existentes de `startCommand` podem precisar de ajuste no mock de `subscriptionPrice`

**Build:**
- `npm run build` no admin-panel — TypeScript strict

**E2E (Playwright):**
1. Login → Configurações → alterar preço para 39.90 → salvar → recarregar → verificar persistência como "R$ 39,90"
2. Onboarding → verificar preview com preço formatado
3. Reverter preço após teste

### Notes

**Riscos:**
1. **Conversão de dados:** VARCHARs com formatos inesperados (ex: "gratuito", "50 reais") não serão parseáveis → viram NULL. Isso é aceitável — admin pode re-configurar.
2. **MP update timing:** O `PUT /preapproval_plan` atualiza o preço para NOVAS assinaturas. Assinantes existentes mantêm o preço antigo até o próximo ciclo de renovação, quando o MP aplica o novo valor automaticamente.
3. **`|| null` vs `?? null`:** `subscriptionPrice: row.groups.subscription_price || null` trata 0 como null (falsy). Se preço 0 não faz sentido (assinatura gratuita não existe), isso é correto. CHECK >= 0.01 no DB garante.
4. **Bot cold-start:** O bot carrega `groupConfig` no startup. Se admin atualiza preço, o bot só pega no próximo restart. Mesmo risco aceito da feature anterior (onboarding settings).

**Decisão futura (fora de escopo):**
- Hot-reload de groupConfig sem restart do bot
- Suporte a múltiplas moedas
- Histórico de preços / log de alterações

---

## Review Notes

- Adversarial review completed
- Findings: 10 total, 10 fixed, 0 skipped
- Resolution approach: auto-fix all
- Key fixes applied: `|| null` → `?? null` (F1), thousands separator in bot formatBRL (F4), force_mp_sync retry (F5), NaN guard (F9), dedicated UpdatePlanPriceResult type (F10)
