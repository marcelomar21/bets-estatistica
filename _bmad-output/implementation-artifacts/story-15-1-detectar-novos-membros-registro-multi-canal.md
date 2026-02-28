# Story 15-1: Detectar Novos Membros e Registro Multi-Canal

## Status: in-progress

## Story
As a sistema,
I want detectar quando um novo membro entra no grupo WhatsApp e registrá-lo no banco,
So that o sistema conheça todos os membros e suporte pertencimento simultâneo a Telegram e WhatsApp.

## Acceptance Criteria

1. Given um usuário entra no grupo WhatsApp via invite link
   When Baileys emite evento `group-participants-update` com action `add`
   Then sistema registra o membro em `members` com `channel = 'whatsapp'` e `channel_user_id = phone (E.164)`
   And status inicial é `trial`

2. Given membro já existe no mesmo grupo via Telegram
   When entra também no grupo WhatsApp
   Then sistema cria um registro separado com `channel = 'whatsapp'` para o mesmo grupo
   And ambos os registros coexistem (multi-canal simultâneo)

3. Given membro sai voluntariamente do grupo WhatsApp
   When Baileys emite evento `group-participants-update` com action `remove`
   Then registro do membro é atualizado com status `removido`

## Technical Tasks

1. Migration 047: ALTER TABLE members ADD channel TEXT DEFAULT 'telegram', ADD channel_user_id TEXT
2. BaileyClient: Register `group-participants.update` event listener with callback
3. WhatsApp member handler: `whatsapp/handlers/memberEvents.js`
4. MemberService: Add `getMemberByChannelUserId(channelUserId, groupId, channel)` and `createWhatsAppTrialMember()`
5. Wire handler in whatsapp/server.js initClients
6. Tests for handler and service functions

## FRs: FR11, FR17
