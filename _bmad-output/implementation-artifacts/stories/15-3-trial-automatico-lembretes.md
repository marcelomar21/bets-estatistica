# Story 15-3: Trial Automatico e Lembretes WhatsApp

Status: ready-for-dev

## Story

As a **sistema**,
I want iniciar trial de 3 dias para novos membros WhatsApp e enviar lembretes automaticos,
So that membros experimentem o servico e sejam incentivados a pagar antes do trial expirar.

## Acceptance Criteria

1. **AC1: Trial automatico ao entrar no grupo WhatsApp**
   - Given novo membro e detectado no grupo WhatsApp (Story 15-1)
   - When registro e criado com status `trial`
   - Then trial de 3 dias e iniciado com `trial_expires_at = now() + 3 days`
   - And DM de boas-vindas e enviada explicando o trial e como assinar

2. **AC2: Lembrete no dia 2 do trial**
   - Given membro esta no dia 2 do trial (1 dia restante)
   - When job de lembretes executa
   - Then DM de lembrete e enviada via WhatsApp: "Seu trial expira amanha, assine para continuar"

3. **AC3: Lembrete de urgencia no ultimo dia**
   - Given membro esta no dia 3 (ultimo dia) do trial
   - When job de lembretes executa
   - Then DM de urgencia e enviada via WhatsApp com link de pagamento

4. **AC4: Cross-channel detection — membro ativo no Telegram**
   - Given membro ja e assinante ativo via Telegram
   - When entra no grupo WhatsApp do mesmo grupo
   - Then trial NAO e iniciado — membro recebe status `active` automaticamente

## Tasks

### Task 1: Welcome DM on member join (AC1)
- In `whatsapp/handlers/memberEvents.js`, after `createWhatsAppTrialMember` succeeds, send a welcome DM via `channelAdapter.sendDM()`
- Message template: welcome text with trial period info and checkout URL
- Get checkout URL from group config (`checkout_url` or fallback)
- Non-blocking: if DM fails, member is still created

### Task 2: Multi-channel trial reminders (AC2, AC3)
- Modify `bot/jobs/membership/trial-reminders.js` to support WhatsApp members
- For WhatsApp members: use `channelAdapter.sendDM()` with `{ channel: 'whatsapp', groupId }`
- For Telegram members: keep existing `sendPrivateMessage()` flow unchanged
- Reminder messages: day 2 = gentle reminder, day 3 = urgency with checkout link

### Task 3: Cross-channel active detection (AC4)
- In `whatsapp/handlers/memberEvents.js`, before creating trial member:
  1. Check if same person exists as `ativo` member in the same group on Telegram channel
  2. Match by... phone? — Not possible (Telegram uses telegram_id, not phone)
  3. Implementation: Skip cross-channel detection for now — requires phone number matching which is not available between channels. Document as future enhancement when phone number is collected for both channels.
- Alternative: Create member as `trial` (current behavior) — operator can manually promote via admin panel

### Task 4: Tests
- Update `whatsapp/__tests__/memberEvents.test.js` to verify welcome DM is sent after member creation
- Update trial-reminders tests to cover WhatsApp channel members
- Test that DM failure does not prevent member creation

## Dev Notes

- Trial days for WhatsApp: configurable via `system_config.trial_days` (defaults to 3 for WhatsApp per epics, vs 7 for Telegram)
- Welcome DM should be non-blocking — wrap in try/catch with logging
- `channelAdapter.sendDM()` already handles Telegram→WhatsApp format conversion
- Existing trial-reminders job uses `sendPrivateMessage()` directly — needs to branch on member.channel
