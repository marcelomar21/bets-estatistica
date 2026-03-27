---
title: Tom de Voz com 2 Níveis de Configuração
created: '2026-02-25'
status: accepted
author: Sally (UX)
tags:
- adr
permalink: guru/adrs/adr-003-tom-de-voz-2-niveis
---

# ADR-003: Tom de Voz com 2 Niveis de Configuracao

## Context

Operators need per-group tone control for bot messages. The current `copyService.js` uses a fixed LLM prompt with no vocabulary restrictions or persona configuration per group. Different groups have different needs:

- **Osmar Palpites**: cannot use the word "apostas" (regulatory/branding reasons)
- **Guru da Bet**: wants a confident, expert persona
- Some operators just want to set one simple rule ("don't say apostas"), while others want full control over persona, forbidden words, CTA text, and custom rules.

Additionally, bot-generated messages sometimes use English team names (inherited from FootyStats/Odds API), and there is no translation or team name normalization layer.

The current `copyService.js` uses a raw string prompt without `ChatPromptTemplate` or system message, making tone injection impossible without refactoring.

## Decision

Implement **2 levels of tone configuration** in the admin panel:

### Level 1 -- Natural Language (default, visible by default)

A textarea where the operator describes how their bot should communicate in plain language.

- **Placeholder**: *"Informal, sem usar a palavra 'aposta', chamar o publico de 'galera'. Tom confiante mas nao arrogante."*
- The backend converts this free text into structured config via LLM (`gpt-5-mini` with `withStructuredOutput`)
- Conversion uses a Zod schema:

```js
z.object({
  persona: z.string().optional(),
  tone: z.string(),
  forbiddenWords: z.array(z.string()),
  ctaText: z.string().optional(),
  customRules: z.array(z.string()),
  rawDescription: z.string() // preserves original text
})
```

### Level 2 -- Advanced Fields (collapsed by default)

Structured fields for power users who want explicit control:

- **Persona** (text input) -- e.g., "Guru da Bet"
- **Forbidden Words** (tag input) -- e.g., "aposta", "bet"
- **CTA** (text input) -- e.g., "Confira agora!"
- **Custom Rules** (textarea) -- freeform additional rules

A **"Test"** button generates a preview of copy with the current configs.

### Storage

New JSONB column `groups.copy_tone_config` (migration 030):
```json
{
  "tone": "informal",
  "persona": "Guru da Bet",
  "forbiddenWords": ["aposta", "bet"],
  "ctaText": "Confira agora!",
  "customRules": ["Abrevie nomes de times conhecidos"],
  "rawDescription": "Informal, sem usar a palavra 'aposta'..."
}
```

### Access Control

- **Super admin** can edit any group's tone
- **Group admin** can edit their own group's tone (not other groups)

### Integration with copyService

`copyService.js` migrates from raw string prompt to `ChatPromptTemplate.fromMessages([['system', systemMsg], ['human', humanMsg]])`. The system message is injected with persona, tone, forbidden words, and custom rules from the group's `copy_tone_config`.

Cache is invalidated when `copy_tone_config` changes (via timestamp of last update).

## Consequences

### Positive

- **Low cognitive load for basic users**: operators who just want "don't say apostas" write that in the textarea and are done
- **Full control for power users**: advanced fields give explicit control over every aspect
- **LLM-powered conversion**: natural language is automatically structured into programmatic config
- **Group admin empowerment**: operators control their own group's tone without needing super admin

### Negative

- **LLM conversion can fail**: if the LLM fails or returns an invalid schema, fallback saves only `{ rawDescription: originalText }`. The `copyService` uses `rawDescription` as a fallback in the system prompt
- **Extra LLM cost on save**: each save of Level 1 text triggers a conversion LLM call (mitigated by using `gpt-5-mini`, which is fast and cheap)
- **Consistency not guaranteed**: LLM-generated copy may not always perfectly follow tone rules (mitigated by "Test" button and prompt engineering)

### Validation Limits

- `forbiddenWords`: max 50 items
- `customRules`: max 20 rules

## Alternatives Considered

| Alternative | Status | Reason |
|---|---|---|
| Only structured fields | Rejected | Too complex for operators who just want one simple rule; high cognitive load |
| Only free text (no structured fields) | Rejected | No programmatic access; can't reliably enforce forbidden words without structure |
| Template-based (choose from presets) | Rejected | Too rigid; operators need customization, not presets |

## Related

- [[Specs/Multi-Bot v2]] — Full technical specification (Tasks 4.1, 4.2, 4.3)
- [[2026-02-25 Feedback Operadores]] — Discovery session (items V1, V2, V3)
- [[ADR-001 Servidor Único Multi-Bot]] — BotContext carries `groupConfig.copyToneConfig`