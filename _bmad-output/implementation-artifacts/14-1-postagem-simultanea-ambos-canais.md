# Story 14-1: Postagem Simultânea em Ambos os Canais

## Status: ready-for-dev

## Story
As a sistema (bot de apostas),
I want postar apostas no WhatsApp e Telegram simultaneamente quando o grupo tem ambos os canais,
So that membros de qualquer canal recebam as apostas ao mesmo tempo.

## Acceptance Criteria
1. Grupo com channels ['telegram', 'whatsapp'] → mensagem enviada para ambos em paralelo
2. Grupo com apenas ['telegram'] → comportamento atual mantido (retrocompatível)
3. Posting schedule respeitado em ambos os canais
4. Falha em um canal → sucesso parcial registrado, outro canal não afetado
5. Rate limit de 10 msg/min por número respeitado

## Tasks

### Task 1: Add channels/whatsapp_group_jid to botCtx
- Extend bot registry query in `telegram.js` to include `channels, whatsapp_group_jid` from groups
- Add `channels` and `whatsappGroupJid` to botCtx object
- Defaults: channels=['telegram'], whatsappGroupJid=null

### Task 2: Multi-channel posting helper in postBets.js
- Create `postToAllChannels(groupId, message, botCtx)` helper
- Sends to all channels in the group's channels array in parallel
- Returns per-channel results: `{ telegram: result, whatsapp: result }`
- Considers a bet "sent" if at least one channel succeeds

### Task 3: Replace sendToPublic calls
- Replace `sendToPublic(message, botCtx)` at lines 534, 580 with `postToAllChannels`
- Update success/failure tracking to handle partial success
- Update log messages to include per-channel status

### Task 4: Update job result with per-channel stats
- Add channel breakdown to job result object
- Update error handling to distinguish all-channels-failed vs partial

### Task 5: Tests
- Unit tests for postToAllChannels helper
- Integration tests for multi-channel posting scenarios
