# Phase 1: Posting Fixes - Research

**Researched:** 2026-04-07
**Domain:** Telegram posting pipeline (bot/jobs, bot/services, bot/lib)
**Confidence:** HIGH

## Summary

Phase 1 fixes four specific bugs in the posting pipeline that cause incorrect or poorly-formatted messages to reach client-facing Telegram groups. All four bugs have been located in the codebase with high confidence.

The bugs are: (1) tone of voice not consistently enforced across both generation modes, (2) confirmation/status messages leaking to public groups (already mostly correct, needs audit), (3) CTA label "CTA" appearing literally in victory recap messages, and (4) victory posts reading wrong odds values. All fixes are in the bot-side JavaScript code (CommonJS, no TypeScript). The existing test infrastructure uses Jest for the bot module.

**Primary recommendation:** Fix each bug at its exact location. No architectural changes needed -- these are surgical fixes to existing code paths in `postBets.js`, `copyService.js`, `dailyWinsRecap.js`, and `telegramMarkdown.js`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Quando nenhum tom de voz esta configurado para um grupo, usar tom neutro/padrao embutido no codigo (fallback consistente)
- Quando tone config muda no admin panel, invalidar cache em `bet_group_assignments.generated_copy` para forcar regeneracao na proxima postagem
- Em full-message mode (com examplePosts), passar persona, forbidden words e demais tone config ao LLM junto com os exemplos
- `enforceOddLabel()` deve ser aplicado em ambos os modos (template mode e full-message mode) -- bug atual no template mode
- Preview, resultado de envio e alertas de erro -- tudo vai apenas para o grupo admin, nunca para grupos de clientes
- CTA em victory posts: o conteudo do CTA sempre deve aparecer, mas a label tecnica "CTA" nunca deve ser visivel para o cliente -- remover qualquer ocorrencia literal de "CTA" nas mensagens enviadas
- Victory post sem nenhum acerto (winCount=0): manter comportamento atual (skip, nao enviar mensagem)
- Usar campo `odds` do registro original da bet (valor no momento da analise), nao odds atuais do mercado
- Formatacao decimal com 2 casas (ex: 2.10) -- padrao brasileiro de apostas
- Odds null/missing: omitir campo odds da linha, nao inventar valor nem mostrar "N/A"

### Claude's Discretion
None specified -- all implementation details were decided.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POST-01 | Postagem automatica deve respeitar o tom de voz configurado por grupo/influencer | `enforceOddLabel()` missing in template mode (postBets.js:235); toneConfig loaded from DB per group; cache invalidation already works via tone PUT route |
| POST-02 | Confirmacao de envio deve ir apenas para o grupo admin, nunca para grupos de clientes | sendToAdmin/sendToPublic routing already enforced in telegram.js; needs audit of all call sites in posting pipeline |
| POST-03 | Post de vitoria nao deve exibir label CTA quando nao aplicavel | copyService.js:308 LLM prompt says "Inclua um CTA no final" -- the word "CTA" can appear literally in LLM output; needs prompt fix + sanitization |
| POST-04 | Post de vitoria deve ler e exibir odds corretamente | metricsService.js:316 queries `odds_at_post` from both `suggested_bets` and `bet_group_assignments` -- should prefer assignment's `odds_at_post`; copyService.js:292 reads `w.odds_at_post` directly from the bet record |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Git Flow**: NUNCA commitar na main/master, SEMPRE criar branch (feature/, fix/, refactor/, chore/), conventional commits
- **No truncation**: NUNCA truncar conteudo -- especially relevant for CTA text and message formatting
- **LLM Models**: Always via `config.llm.*`, never hardcode
- **Testing**: Jest for bot (`cd bot && npm test`), Vitest for admin-panel, Playwright E2E before PR
- **Code style**: CommonJS modules for bot, JSDoc for public functions, response pattern `{ success, data?, error? }`
- **Database**: snake_case for DB columns, camelCase for JS variables
- **Supabase**: RLS enforced, service_role for bot (bypasses RLS)

## Architecture Patterns

### Relevant Project Structure
```
bot/
  jobs/
    postBets.js          # Main posting pipeline (874 lines)
    dailyWinsRecap.js    # Victory recap job
    jobWarn.js           # Admin warn/confirmation module
  services/
    copyService.js       # LLM copy generation (generateBetCopy, generateWinsRecapCopy)
    betService.js         # DB operations (markBetAsPosted, getFilaStatus, updateGeneratedCopy)
    metricsService.js    # Metrics and wins data (getYesterdayWins)
  lib/
    telegramMarkdown.js  # sanitizeTelegramMarkdown, enforceOddLabel
  telegram.js            # sendToAdmin, sendToPublic (message routing)
```

### Pattern: Two Posting Modes
The system has two distinct message generation modes: [VERIFIED: codebase inspection]

1. **Template mode** (default): Uses `MESSAGE_TEMPLATES[]` with cycling headers/footers + LLM-generated bullet points from reasoning. Output is constructed from `parts[]` array in `formatBetMessage()`.
2. **Full-message mode** (when `examplePost(s)` present in toneConfig): LLM generates the entire message. Output goes through `enforceOddLabel()` + `sanitizeTelegramMarkdown()`.

The bug: template mode output at line 235 calls only `sanitizeTelegramMarkdown()`, never `enforceOddLabel()`. The LLM-generated bullets can contain "Odd:" text that should be replaced with the configured label.

### Pattern: Copy Caching
Generated copy is cached in `bet_group_assignments.generated_copy` (only in full-message mode). Cache is invalidated via `clearGeneratedCopyByGroup()` when tone config changes. The admin panel's PUT `/api/groups/[groupId]/tone` route already calls this invalidation (line 227-233 of tone/route.ts). [VERIFIED: codebase inspection]

### Pattern: Message Routing
`sendToAdmin()` and `sendToPublic()` in `telegram.js` require a valid `BotContext` with the correct chat ID. Both functions refuse to send without valid `botCtx`, logging an error and returning failure. This design already prevents accidental cross-group leaks. [VERIFIED: codebase inspection]

### Anti-Patterns to Avoid
- **Hardcoding "Odd" label:** Always use `toneConfig?.oddLabel || 'Odd'` for display, and `enforceOddLabel()` for LLM output post-processing
- **Direct string in LLM prompts:** Use configured labels from toneConfig, not hardcoded "CTA" or "Odd"
- **Using `console.log`:** Always use `require('../../lib/logger')`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telegram Markdown sanitization | Custom regex | `sanitizeTelegramMarkdown()` from `bot/lib/telegramMarkdown.js` | Handles unbalanced markers, broken links, URL underscores |
| Odds label replacement | Manual string replace | `enforceOddLabel()` from `bot/lib/telegramMarkdown.js` | Regex handles all "Odd/Odds:" variants with word boundary |
| Message routing | Direct `bot.sendMessage()` | `sendToAdmin()` / `sendToPublic()` from `bot/telegram.js` | Enforces BotContext validation, prevents cross-group leaks |
| Copy generation | Template strings | `generateBetCopy()` / `generateWinsRecapCopy()` from `bot/services/copyService.js` | Handles tone config injection, structural validation, retry |

## Common Pitfalls

### Pitfall 1: enforceOddLabel Only Matches "Odd:" Pattern
**What goes wrong:** `enforceOddLabel()` uses regex `/\bOdds?\s*:/gi` which only matches "Odd:" or "Odds:" at word boundaries. If the LLM generates a different pattern like "Cotacao:" (already the correct label), the function is a no-op -- which is fine.
**Why it happens:** The regex is intentionally narrow to avoid false positives.
**How to avoid:** In template mode, use the label directly in the parts array (`toneConfig?.oddLabel || 'Odd'`). Apply `enforceOddLabel()` as a safety net on the final output for any LLM-generated text embedded in the message.
**Warning signs:** LLM bullets containing "Odd:" when oddLabel is set to something else.

### Pitfall 2: CTA Label Appearing Literally in LLM Output
**What goes wrong:** The LLM prompt for victory recaps says "Inclua um CTA no final". The LLM may output text like "CTA: Aposte agora!" where "CTA" is a technical label visible to end users.
**Why it happens:** The LLM interprets "CTA" as both an instruction and a label to include.
**How to avoid:** Change the prompt to avoid the term "CTA" entirely, and add a post-processing sanitization step to strip any remaining literal "CTA" occurrences from the final output.
**Warning signs:** Messages containing "CTA:", "CTA ", or "CTA\n" going to public groups.

### Pitfall 3: Odds Source Ambiguity (suggested_bets.odds_at_post vs bet_group_assignments.odds_at_post)
**What goes wrong:** `getYesterdayWins()` queries `odds_at_post` from BOTH `suggested_bets` and `bet_group_assignments`. The `w.odds_at_post` in `copyService.js:292` reads from the top-level bet record (`suggested_bets.odds_at_post`), not from the assignment.
**Why it happens:** The data model migrated from single-tenant (odds_at_post on suggested_bets) to multi-tenant (odds_at_post on bet_group_assignments). The query includes both but the code reads the wrong one.
**How to avoid:** Read odds from `bet_group_assignments.odds_at_post` (the per-group snapshot), falling back to `suggested_bets.odds` (the original analysis odds).
**Warning signs:** Victory recaps showing "N/A" for odds or showing different odds than what was posted.

### Pitfall 4: Cache Invalidation on Tone Change
**What goes wrong:** Cache invalidation in the tone PUT route already works (line 227-233 of tone/route.ts), but the `postBets.js` `runPostBets()` function loads toneConfig fresh from DB each time (line 547-568). If the bot process cached BotContext.groupConfig.copyToneConfig, that stale cache could be used in `dailyWinsRecap.js:53`.
**Why it happens:** `dailyWinsRecap.js` reads toneConfig from `botCtx.groupConfig.copyToneConfig` which is loaded at bot startup via `initBots()`. It does NOT re-read from DB like `postBets.js` does.
**How to avoid:** Either have `dailyWinsRecap.js` re-read toneConfig from DB (like postBets does), or refresh the botRegistry's toneConfig before running the recap job.
**Warning signs:** Victory recaps using old tone after admin changes tone config.

## Code Examples

### Bug 1 Fix: Apply enforceOddLabel in Template Mode (POST-01)
```javascript
// Source: bot/jobs/postBets.js, line 235
// BEFORE:
return sanitizeTelegramMarkdown(parts.join('\n'));

// AFTER:
let finalMessage = parts.join('\n');
finalMessage = enforceOddLabel(finalMessage, toneConfig?.oddLabel);
return sanitizeTelegramMarkdown(finalMessage);
```
[VERIFIED: codebase inspection of postBets.js:235]

### Bug 2 Fix: Audit Confirmation Routing (POST-02)
```javascript
// Source: bot/telegram.js sendToAdmin (line 289-305)
// Already correct: sendToAdmin refuses without valid botCtx.adminGroupId
// Already correct: sendToPublic refuses without valid botCtx.publicGroupId
// Need to audit: alertAdmin at line 441 has fallback without botCtx
```
[VERIFIED: codebase inspection of telegram.js]

### Bug 3 Fix: Remove "CTA" Label from Victory Recaps (POST-03)
```javascript
// Source: bot/services/copyService.js, line 308
// BEFORE:
'- Inclua um CTA no final'

// AFTER: Use the actual CTA text from toneConfig instead of the technical term
'- Inclua um chamado para acao (call-to-action) no final convidando o leitor a assinar/apostar'
// Also: strip literal "CTA" from output before returning
```
[VERIFIED: codebase inspection of copyService.js:308]

### Bug 4 Fix: Victory Post Odds Reading (POST-04)
```javascript
// Source: bot/services/copyService.js, line 289-293
// BEFORE:
const odds = w.odds_at_post ? parseFloat(w.odds_at_post).toFixed(2) : 'N/A';

// AFTER (per user decision: use original bet odds, omit if null):
const assignmentOdds = w.bet_group_assignments?.[0]?.odds_at_post;
const odds = assignmentOdds ? parseFloat(assignmentOdds).toFixed(2) : null;
// And format the line conditionally:
const oddsSegment = odds ? ` | ${toneConfig?.oddLabel || 'Odd'}: ${odds}` : '';
return `- ${home} x ${away} | Mercado: ${w.bet_market} | Pick: ${w.bet_pick || 'N/A'}${oddsSegment}`;
```
[VERIFIED: codebase inspection of copyService.js:292 + metricsService.js:316-317]

### Bug 4 Supplemental: dailyWinsRecap.js toneConfig Source
```javascript
// Source: bot/jobs/dailyWinsRecap.js, line 53
// CURRENT: Uses cached BotContext config (stale after tone changes)
const toneConfig = botCtx.groupConfig?.copyToneConfig || null;

// FIX: Re-read from DB like postBets.js does (line 547-568)
// Load fresh toneConfig from groups table before generating recap copy
```
[VERIFIED: codebase inspection of dailyWinsRecap.js:53 vs postBets.js:547-568]

## Detailed Bug Analysis

### POST-01: Tone of Voice Enforcement

**Root cause locations:**
1. `postBets.js:235` -- template mode output does not call `enforceOddLabel()`. The LLM-generated bullets (from reasoning extraction) can contain "Odd:" when the configured label is different.
2. `dailyWinsRecap.js:53` -- reads toneConfig from cached BotContext, not fresh from DB. After an admin changes tone config, the next recap job still uses old config.

**What's already correct:**
- Full-message mode correctly applies `enforceOddLabel()` at line 200
- Template mode correctly uses `toneConfig?.oddLabel || 'Odd'` in the parts array at line 189
- Cache invalidation on tone change works in the admin panel PUT route
- `postBets.js` runPostBets() loads toneConfig fresh from DB every run

**Fixes needed:**
1. Add `enforceOddLabel()` call on the final template-mode output in `formatBetMessage()` before `sanitizeTelegramMarkdown()`
2. In `dailyWinsRecap.js`, load toneConfig fresh from DB instead of relying on cached BotContext

### POST-02: Confirmation Routing

**Root cause analysis:**
- `sendToAdmin()` (telegram.js:289) already refuses without valid botCtx with adminGroupId
- `sendToPublic()` (telegram.js:330) already refuses without valid botCtx with publicGroupId
- `requestConfirmation()` (postBets.js:330) sends confirmation to adminGroupId directly -- correct
- `sendPostWarn()` (jobWarn.js:191) uses `sendToAdmin()` -- correct
- All `sendToAdmin` calls in alertService.js use botCtx -- correct
- `alertAdmin()` (telegram.js:441) has a fallback path without botCtx that calls `sendToAdmin(text)` which will be rejected (returns error) -- safe but should be audited

**Potential leak vector:**
- `alertAdmin()` fallback at line 441: `return botCtx ? sendToAdmin(text, botCtx) : sendToAdmin(text)`. The non-botCtx path fails safely (sendToAdmin returns error without valid botCtx). No actual leak.

**Conclusion:** POST-02 is already correct in the current code. The routing is enforced by telegram.js requiring valid botCtx. An audit pass should confirm no new code paths bypass this.

### POST-03: CTA Label in Victory Posts

**Root cause locations:**
1. `copyService.js:308` -- LLM prompt says "Inclua um CTA no final". The LLM may output the literal word "CTA" in the message.
2. `copyService.js:57-60, 161-164, 272-275` -- CTA config is passed to LLM with labels like "CTAs disponiveis" and "CTA padrao". These technical labels can leak into LLM output.

**User decision clarification:** The CTA CONTENT should appear (e.g., "Aposte agora!"). The CTA LABEL "CTA" should never appear literally in client-facing messages.

**Fixes needed:**
1. Rewrite LLM prompt to avoid the term "CTA" -- use natural language like "chamado para acao" or just describe what to include
2. Add post-processing to strip literal "CTA" from the generated recap output (safety net)
3. Also audit CTA config labels in the system prompts for both `generateBetCopy()` and `generateWinsRecapCopy()`

### POST-04: Victory Post Odds

**Root cause locations:**
1. `metricsService.js:316-317` -- The query fetches `odds_at_post` from both `suggested_bets` AND `bet_group_assignments`. The top-level `w.odds_at_post` (from suggested_bets) may be null or stale.
2. `copyService.js:292` -- Reads `w.odds_at_post` (top-level) directly. Should read from `w.bet_group_assignments[0].odds_at_post` for the per-group posting odds.

**User decisions:**
- Use the original bet odds (the `odds` field from `suggested_bets` at analysis time), not current market odds
- Format: decimal with 2 decimal places (e.g., 2.10)
- If null/missing: omit the odds field entirely, never show "N/A"

**Data flow:**
- At posting time: `markBetAsPosted()` stores `odds_at_post` in `bet_group_assignments` (betService.js:526)
- At recap time: `getYesterdayWins()` fetches both `suggested_bets.odds_at_post` and `bet_group_assignments.odds_at_post`
- The recap code reads `w.odds_at_post` which is the suggested_bets column, potentially null

**Fix:** Read `w.bet_group_assignments[0].odds_at_post` as primary source, fall back to `w.odds` (original analysis odds), omit if both are null.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | LLM may output literal "CTA" in recap messages when prompted with "Inclua um CTA no final" | POST-03 Analysis | LOW -- can verify by testing; worst case the sanitization still strips it |
| A2 | `w.odds_at_post` in copyService.js:292 reads from suggested_bets top-level, not bet_group_assignments | POST-04 Analysis | LOW -- Supabase nested select returns joined data; the top-level field is from the primary table |

**All other claims verified via codebase inspection.**

## Open Questions

1. **How many groups currently have toneConfig configured?**
   - What we know: `copy_tone_config` is a JSONB column on `groups` table, defaults to null/empty
   - What's unclear: Which groups actively use oddLabel, examplePosts, etc.
   - Recommendation: Not blocking -- the fixes handle both configured and unconfigured cases

2. **Does alertAdmin() fallback path (no botCtx) ever fire in production?**
   - What we know: Code at telegram.js:441 falls back to `sendToAdmin(text)` without botCtx, which is rejected
   - What's unclear: Whether any code path actually calls alertAdmin without botCtx after multi-bot migration
   - Recommendation: Audit during POST-02 and log if it fires, but it's safe (message is dropped, not leaked)

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `bot/jobs/postBets.js` (874 lines) -- posting pipeline, formatBetMessage, getOrGenerateMessage
- Codebase inspection: `bot/services/copyService.js` (339 lines) -- generateBetCopy, generateWinsRecapCopy
- Codebase inspection: `bot/lib/telegramMarkdown.js` (102 lines) -- sanitizeTelegramMarkdown, enforceOddLabel
- Codebase inspection: `bot/telegram.js` (506 lines) -- sendToAdmin, sendToPublic, alertAdmin
- Codebase inspection: `bot/jobs/dailyWinsRecap.js` (90 lines) -- victory recap job
- Codebase inspection: `bot/jobs/jobWarn.js` (281 lines) -- admin warn module
- Codebase inspection: `bot/services/metricsService.js` (356 lines) -- getYesterdayWins
- Codebase inspection: `bot/services/betService.js` (1900+ lines) -- markBetAsPosted, updateGeneratedCopy, clearGeneratedCopyByGroup, getFilaStatus
- Codebase inspection: `admin-panel/src/app/api/groups/[groupId]/tone/route.ts` (260 lines) -- tone config PUT with cache invalidation
- Codebase inspection: `bot/jobs/__tests__/postBets.test.js` (989 lines) -- existing test patterns

## Metadata

**Confidence breakdown:**
- POST-01 (Tone enforcement): HIGH -- exact code locations identified, fix pattern clear
- POST-02 (Confirmation routing): HIGH -- already correct, just needs audit confirmation
- POST-03 (CTA label): HIGH -- prompt text and LLM behavior identified, fix straightforward
- POST-04 (Odds reading): HIGH -- data flow traced from DB schema through query to rendering

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable codebase, no upstream changes expected)
