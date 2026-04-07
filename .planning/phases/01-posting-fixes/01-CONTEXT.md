# Phase 1: Posting Fixes - Context

**Gathered:** 2026-04-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Posting pipeline delivers correct, well-formatted messages to the right channels with the right tone. Four specific bugs to fix: tone of voice enforcement, confirmation routing, victory post CTA label leak, and victory post odds reading.

</domain>

<decisions>
## Implementation Decisions

### Tone of Voice Enforcement
- Quando nenhum tom de voz está configurado para um grupo, usar tom neutro/padrão embutido no código (fallback consistente)
- Quando tone config muda no admin panel, invalidar cache em `bet_group_assignments.generated_copy` para forçar regeneração na próxima postagem
- Em full-message mode (com examplePosts), passar persona, forbidden words e demais tone config ao LLM junto com os exemplos
- `enforceOddLabel()` deve ser aplicado em ambos os modos (template mode e full-message mode) — bug atual no template mode

### Confirmação & CTA
- Preview, resultado de envio e alertas de erro — tudo vai apenas para o grupo admin, nunca para grupos de clientes
- CTA em victory posts: o conteúdo do CTA sempre deve aparecer, mas a label técnica "CTA" nunca deve ser visível para o cliente — remover qualquer ocorrência literal de "CTA" nas mensagens enviadas
- Victory post sem nenhum acerto (winCount=0): manter comportamento atual (skip, não enviar mensagem)

### Leitura de Odds
- Usar campo `odds` do registro original da bet (valor no momento da análise), não odds atuais do mercado
- Formatação decimal com 2 casas (ex: 2.10) — padrão brasileiro de apostas
- Odds null/missing: omitir campo odds da linha, não inventar valor nem mostrar "N/A"

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `bot/services/copyService.js` — Geração de copy via LLM com tone config
- `bot/lib/telegramMarkdown.js` — `enforceOddLabel()` para labels customizados
- `bot/jobs/postBets.js` — Pipeline principal de postagem (874 linhas)
- `bot/jobs/dailyWinsRecap.js` — Job de recap de vitórias
- `bot/jobs/jobWarn.js` — Confirmações de envio via `sendToAdmin()`
- `lib/channelAdapter.js` — Abstração multi-canal (Telegram + WhatsApp)

### Established Patterns
- Tone config em `groups.copy_tone_config` (JSONB column) carregado do DB
- Dois modos de geração: full-message (examplePosts) e template (MESSAGE_TEMPLATES)
- `getOrGenerateMessage()` com cache em `bet_group_assignments.generated_copy`
- `sendToAdmin()` e `sendToPublic()` para roteamento explícito de mensagens
- `postToAllChannels()` para distribuição multi-canal

### Integration Points
- `postBets.js:189` — `formatBetMessage()` não aplica `enforceOddLabel()` em template mode
- `postBets.js:222-227` — Lógica de CTA com fallback
- `copyService.js:293` — Odds label no recap usa string direta, não `enforceOddLabel()`
- `jobWarn.js:191` — Confirmações via `sendToAdmin()` (já correto)
- `dailyWinsRecap.js` — Victory posts enviados para public group

</code_context>

<specifics>
## Specific Ideas

- Label "CTA" aparecendo literalmente nas mensagens dos clientes — remover todas as ocorrências visíveis do termo técnico
- Cache de generated_copy deve ser invalidado quando tone config do grupo muda — garantir que próxima postagem usa tom atualizado
- `enforceOddLabel()` deve ser chamado consistentemente em ambos os modos de geração

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
