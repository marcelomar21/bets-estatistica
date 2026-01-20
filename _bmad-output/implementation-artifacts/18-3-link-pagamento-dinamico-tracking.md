# Story 18.3: Link de Pagamento Dinamico com Tracking

Status: done

---

## Story

**As a** sistema,
**I want** gerar link de pagamento com tracking de afiliado quando aplicavel,
**So that** Cakto possa atribuir comissao automaticamente ao afiliado correto.

---

## Acceptance Criteria

### AC1: Link COM Tracking para Afiliado Valido
**Given** membro em trial com `affiliate_code` valido (< 14 dias)
**When** bot gera link de pagamento
**Then** link inclui parametro de afiliado do Cakto
**And** formato: `{CAKTO_CHECKOUT_URL}?aff={affiliate_code}`

### AC2: Link SEM Tracking para Afiliado Invalido
**Given** membro em trial sem `affiliate_code` ou com atribuicao expirada
**When** bot gera link de pagamento
**Then** link e gerado SEM parametro de afiliado
**And** formato: `{CAKTO_CHECKOUT_URL}` (link generico)

### AC3: Funcao generatePaymentLink
**Given** funcao `generatePaymentLink(member)` chamada
**When** `isAffiliateValid(member)` retorna true
**Then** retorna link COM tracking: `{ url, hasAffiliate: true, affiliateCode }`
**When** `isAffiliateValid(member)` retorna false
**Then** retorna link SEM tracking: `{ url, hasAffiliate: false, affiliateCode: null }`

### AC4: Integracao com Mensagens de Cobranca
**Given** membro recebe mensagem de cobranca (trial dia 2, renewal reminder, etc.)
**When** mensagem inclui link de pagamento
**Then** link e gerado dinamicamente usando `generatePaymentLink()`
**And** log registra se link teve tracking ou nao

### AC5: Webhook Nao Requer Mudanca
**Given** webhook de `purchase_approved` recebido do Cakto
**When** pagamento processado
**Then** Cakto ja atribuiu comissao ao afiliado (automatico)
**And** sistema nao precisa fazer nada adicional para comissao

---

## Tasks / Subtasks

- [x] **Task 1: Criar funcao generatePaymentLink no memberService** (AC: #1, #2, #3)
  - [x] 1.1: Adicionar funcao `generatePaymentLink(member)` em `bot/services/memberService.js`
  - [x] 1.2: Usar `isAffiliateValid(member)` para verificar validade
  - [x] 1.3: Retornar objeto `{ url, hasAffiliate, affiliateCode }`
  - [x] 1.4: Logar com prefixo `[membership:payment-link]`
  - [x] 1.5: Adicionar `generatePaymentLink` ao module.exports

- [x] **Task 2: Atualizar notificationService para usar links dinamicos** (AC: #4)
  - [x] 2.1: Modificar `getCheckoutLink()` ou criar `getPaymentLinkForMember(member)`
  - [x] 2.2: Integrar chamada de `generatePaymentLink()` no notificationService
  - [x] 2.3: Logar se link teve tracking: `hasAffiliate: true/false`

- [x] **Task 3: Atualizar trial-reminders.js** (AC: #4)
  - [x] 3.1: Modificar `sendTrialReminder()` para usar link dinamico
  - [x] 3.2: Passar membro completo para geracao do link
  - [x] 3.3: Atualizar logs com informacao de afiliado

- [x] **Task 4: Atualizar renewal-reminders.js** (AC: #4)
  - [x] 4.1: Modificar para usar link dinamico (se aplicavel)
  - [x] 4.2: Nota: membros ativos podem nao ter affiliate_code (expirou)

- [x] **Task 5: Atualizar formatTrialReminder e formatRenewalReminder** (AC: #4)
  - [x] 5.1: Modificar assinaturas para aceitar URL dinamica
  - [x] 5.2: Alternativa: modificar chamadores para passar URL correta (escolhida)

- [x] **Task 6: Testes unitarios**
  - [x] 6.1: Adicionar testes para `generatePaymentLink()` em memberService.test.js
  - [x] 6.2: Testar caso com afiliado valido
  - [x] 6.3: Testar caso sem afiliado
  - [x] 6.4: Testar caso com afiliado expirado
  - [x] 6.5: Testar integracao com notificationService (mock)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] generatePaymentLink: adicionar validacao de input null/undefined [memberService.js:1779-1786]
- [x] [AI-Review][MEDIUM] Adicionar testes para member null/undefined [memberService.test.js:2184-2200]
- [x] [AI-Review][MEDIUM] Consistencia de logging prefix - usar [membership:payment-link] [notificationService.js:199,211]
- [x] [AI-Review][LOW] Mudar log level para debug no caso sem afiliado [memberService.js:1809]

---

## DO / DO NOT

### DO (Fazer)

1. **CRIAR** funcao `generatePaymentLink(member)` em `bot/services/memberService.js`
2. **USAR** `isAffiliateValid(member)` que ja existe em `memberService.js:1657`
3. **USAR** `config.membership.checkoutUrl` de `lib/config.js:61`
4. **MODIFICAR** `bot/services/notificationService.js` para usar link dinamico
5. **MODIFICAR** `bot/jobs/membership/trial-reminders.js` para gerar link dinamico
6. **MODIFICAR** `bot/jobs/membership/renewal-reminders.js` (se aplicavel)
7. **LOGAR** com prefixo `[membership:payment-link]` para rastreabilidade
8. **LOGAR** se link teve tracking (`hasAffiliate: true/false`)

### DO NOT (Nao Fazer)

1. **NAO CRIAR** nova variavel de ambiente - usar `CAKTO_CHECKOUT_URL` existente
2. **NAO MODIFICAR** webhook processing - Cakto ja cuida da comissao
3. **NAO MODIFICAR** `isAffiliateValid()` - ja funciona corretamente
4. **NAO MODIFICAR** `clearExpiredAffiliates()` - ja implementado em 18.2
5. **NAO HARDCODE** URLs - sempre usar config

---

## Dev Notes

### Contexto do Negocio
- **Modelo de Atribuicao:** Ultimo clique com janela de 14 dias
- **Comissao:** 80% da primeira venda para afiliado (R$40 de R$50)
- **Desconto:** Usuario final pode ter ate 10% desconto via afiliado
- **Trial Afiliado:** 2 dias (vs 7 dias regular)
- **Cakto:** Gerencia toda logica de comissao automaticamente

### isAffiliateValid - JA EXISTE

```
Localizacao: bot/services/memberService.js:1657
Exportada: Sim (linha 1813)
Funcionamento: Retorna true se affiliate_code existe E affiliate_clicked_at < 14 dias
```

### Nova Funcao: generatePaymentLink

```javascript
/**
 * Generate payment link with affiliate tracking when applicable
 * Story 18.3: Link de Pagamento Dinamico com Tracking
 *
 * Uses isAffiliateValid() to check if affiliate attribution is valid (within 14 days).
 * If valid, appends affiliate code to checkout URL.
 *
 * @param {object} member - Member object with affiliate_code and affiliate_clicked_at
 * @returns {{success: boolean, data?: {url: string, hasAffiliate: boolean, affiliateCode: string|null}, error?: object}}
 */
function generatePaymentLink(member) {
  const { config } = require('../../lib/config');
  const checkoutUrl = config.membership?.checkoutUrl;

  if (!checkoutUrl) {
    logger.warn('[membership:payment-link] generatePaymentLink: CAKTO_CHECKOUT_URL not configured');
    return {
      success: false,
      error: { code: 'CONFIG_MISSING', message: 'CAKTO_CHECKOUT_URL not configured' }
    };
  }

  // Check if affiliate is valid using existing function
  const hasValidAffiliate = isAffiliateValid(member);

  if (hasValidAffiliate) {
    const affiliateCode = member.affiliate_code;
    const url = `${checkoutUrl}?aff=${encodeURIComponent(affiliateCode)}`;

    logger.info('[membership:payment-link] Generated link with affiliate tracking', {
      memberId: member.id,
      telegramId: member.telegram_id,
      hasAffiliate: true,
      affiliateCode
    });

    return {
      success: true,
      data: { url, hasAffiliate: true, affiliateCode }
    };
  }

  // No valid affiliate - return plain URL
  logger.info('[membership:payment-link] Generated link without affiliate tracking', {
    memberId: member.id,
    telegramId: member.telegram_id,
    hasAffiliate: false,
    reason: !member.affiliate_code ? 'no_affiliate_code' : 'affiliate_expired'
  });

  return {
    success: true,
    data: { url: checkoutUrl, hasAffiliate: false, affiliateCode: null }
  };
}
```

**Adicionar ao module.exports em memberService.js:**
```javascript
  // Story 18.3: Payment link with affiliate tracking
  generatePaymentLink,
```

### Modificacao em notificationService.js

Opcao 1: Modificar `getCheckoutLink()` para aceitar member (quebra compatibilidade)
Opcao 2: Criar nova funcao `getPaymentLinkForMember(member)` (recomendado)

**Recomendado - Nova funcao:**
```javascript
const { generatePaymentLink } = require('./memberService');

/**
 * Get payment link for a member (with affiliate tracking if applicable)
 * Story 18.3: Link de Pagamento Dinamico com Tracking
 *
 * @param {object} member - Member object
 * @returns {{success: boolean, data?: {url: string, hasAffiliate: boolean}, error?: object}}
 */
function getPaymentLinkForMember(member) {
  return generatePaymentLink(member);
}
```

### Modificacao em trial-reminders.js

**Antes (linha 121-126):**
```javascript
// Get checkout link
const checkoutResult = getCheckoutLink();
if (!checkoutResult.success) {
  logger.warn('[membership:trial-reminders] sendTrialReminder: no checkout URL', { memberId });
  return checkoutResult;
}
const checkoutUrl = checkoutResult.data.checkoutUrl;
```

**Depois:**
```javascript
// Get payment link with affiliate tracking (Story 18.3)
const { generatePaymentLink } = require('../../services/memberService');
const linkResult = generatePaymentLink(member);
if (!linkResult.success) {
  logger.warn('[membership:trial-reminders] sendTrialReminder: no checkout URL', { memberId });
  return linkResult;
}
const checkoutUrl = linkResult.data.url;

// Log affiliate tracking status
logger.debug('[membership:trial-reminders] Payment link generated', {
  memberId,
  hasAffiliate: linkResult.data.hasAffiliate,
  affiliateCode: linkResult.data.affiliateCode
});
```

### Formato do Link Cakto

**Com afiliado:**
```
https://checkout.cakto.com.br/PRODUCT_ID?aff=CODIGO123
```

**Sem afiliado:**
```
https://checkout.cakto.com.br/PRODUCT_ID
```

**Nota:** O parametro exato pode variar. Verificar documentacao Cakto se necessario.
URL base vem de: `CAKTO_CHECKOUT_URL` (config.membership.checkoutUrl)

---

## Project Structure Notes

### Arquivos a Modificar

| Arquivo | Modificacao |
|---------|-------------|
| `bot/services/memberService.js` | Adicionar `generatePaymentLink()` + export |
| `bot/services/notificationService.js` | Opcional: adicionar `getPaymentLinkForMember()` |
| `bot/jobs/membership/trial-reminders.js` | Usar `generatePaymentLink()` em vez de `getCheckoutLink()` |
| `bot/jobs/membership/renewal-reminders.js` | Usar `generatePaymentLink()` (se aplicavel) |
| `__tests__/services/memberService.test.js` | Adicionar testes para `generatePaymentLink` |

### Arquivos Relevantes para Referencia

| Arquivo | Conteudo |
|---------|----------|
| `bot/services/memberService.js:1657` | `isAffiliateValid()` - verificacao de afiliado |
| `lib/config.js:61` | `config.membership.checkoutUrl` - URL do checkout |
| `bot/services/notificationService.js:168` | `getCheckoutLink()` - funcao atual |

---

## Intelligence da Story 18.1 e 18.2

### Learnings Relevantes

1. **Migration 012:** Campos de afiliado ja existem (`affiliate_code`, `affiliate_history`, `affiliate_clicked_at`)
2. **isAffiliateValid:** Ja implementada e testada (linha 1657)
3. **clearExpiredAffiliates:** Job roda as 00:30 BRT, limpa atribuicoes > 14 dias
4. **Trial Afiliado:** 2 dias (config.membership.affiliateTrialDays)
5. **Padroes:** Service response pattern, logging com prefixo do modulo

### Padroes Obrigatorios

**Service Response Pattern:**
```javascript
return { success: true, data: { url, hasAffiliate, affiliateCode } };
return { success: false, error: { code: 'CONFIG_MISSING', message: '...' } };
```

**Logging Pattern:**
```javascript
logger.info('[membership:payment-link] Generated link', { memberId, hasAffiliate });
```

---

## Commits Recentes Relevantes

```
3cddb3e feat(affiliate): implement affiliate tracking system (Story 18.1)
```

**Arquivos do commit 18.1:**
- `bot/services/memberService.js` - setAffiliateCode, isAffiliateValid, getAffiliateHistory
- `bot/handlers/startCommand.js` - extracao do codigo do deep link
- `sql/migrations/012_affiliate_tracking.sql` - campos na tabela members

---

## Edge Cases a Considerar

1. **Membro sem affiliate_code:** Retornar URL generica
2. **Membro com affiliate expirado:** Retornar URL generica (isAffiliateValid retorna false)
3. **CAKTO_CHECKOUT_URL nao configurada:** Retornar erro (ja tratado em getCheckoutLink)
4. **affiliate_code com caracteres especiais:** Usar `encodeURIComponent()`
5. **Membro ativo (nao trial):** Pode ter affiliate_code mas ja expirou - tratar normalmente

---

## Fluxo Completo

```
1. Usuario entra via link afiliado (Story 18.1)
   └─> affiliate_code = 'CODIGO123'
   └─> affiliate_clicked_at = now()

2. Job verifica expiracao (Story 18.2)
   └─> Se > 14 dias: limpa affiliate_code

3. Usuario recebe reminder de trial (Story 18.3)
   └─> generatePaymentLink(member)
   └─> isAffiliateValid() = true/false
   └─> Link COM ou SEM tracking

4. Usuario clica e paga
   └─> Cakto recebe aff=CODIGO123 (se tinha)
   └─> Cakto atribui comissao automaticamente

5. Webhook confirma pagamento
   └─> Sistema apenas ativa membro
   └─> NAO precisa fazer nada com afiliado
```

---

## References

- **PRD Afiliados:** `_bmad-output/planning-artifacts/prd-afiliados.md` - FR9, FR10, FR11
- **Epic 18:** `_bmad-output/planning-artifacts/epics-afiliados.md` - Story 18.3
- **Story 18.1:** `_bmad-output/implementation-artifacts/18-1-tracking-afiliados-entrada.md`
- **Story 18.2:** `_bmad-output/implementation-artifacts/18-2-logica-expiracao-atribuicao.md`
- **isAffiliateValid:** `bot/services/memberService.js:1657`
- **getCheckoutLink:** `bot/services/notificationService.js:168`
- **trial-reminders:** `bot/jobs/membership/trial-reminders.js`

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A - All tests passed on first run after final implementation.

### Completion Notes List

1. **Task 1:** Implemented `generatePaymentLink(member)` in memberService.js (lines 1757-1811). Uses existing `isAffiliateValid()` to determine if affiliate tracking should be included. Returns standardized service response pattern with `{ url, hasAffiliate, affiliateCode }`.

2. **Task 2:** Created `getPaymentLinkForMember(member)` wrapper in notificationService.js (lines 182-219). Falls back to generic checkout URL if member is null/undefined.

3. **Task 3:** Updated trial-reminders.js to use `getPaymentLinkForMember(member)` instead of `getCheckoutLink()`. Added affiliate tracking debug logging.

4. **Task 4:** Updated renewal-reminders.js similarly. Added note that active members typically won't have valid affiliate (expired after 14 days).

5. **Task 5:** Format functions already accept URL parameter - modified callers instead (option 5.2).

6. **Task 6:** Added 7 tests for `generatePaymentLink` in memberService.test.js and 5 tests for `getPaymentLinkForMember` in notificationService.test.js. All 574 project tests pass.

**Code Review Fixes (2026-01-20):**
- Added null/undefined member validation to `generatePaymentLink()` - prevents TypeError crash
- Changed log level from `info` to `debug` for routine "no affiliate" case - reduces log noise
- Standardized logging prefix to `[membership:payment-link]` across both services
- Added 2 tests for null/undefined member edge cases

### Change Log

- 2026-01-20: Code review fixes applied - 4 issues resolved (1 HIGH, 2 MEDIUM, 1 LOW), 2 new tests added, all 576 tests pass.
- 2026-01-19: Story 18.3 implementation complete - all 6 tasks done, 12 new tests added, all 574 tests pass.

### File List

**Modified:**
- `bot/services/memberService.js` - Added `generatePaymentLink()` function and export
- `bot/services/notificationService.js` - Added `getPaymentLinkForMember()` function and export
- `bot/jobs/membership/trial-reminders.js` - Updated to use dynamic payment links
- `bot/jobs/membership/renewal-reminders.js` - Updated to use dynamic payment links
- `__tests__/services/memberService.test.js` - Added 7 tests for generatePaymentLink, added config mock
- `__tests__/services/notificationService.test.js` - Added 5 tests for getPaymentLinkForMember, added memberService mock

