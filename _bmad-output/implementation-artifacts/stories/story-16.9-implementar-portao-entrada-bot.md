---
id: "16.9"
epicId: "16"
title: "Implementar Portão de Entrada com Bot"
status: "ready-for-dev"
priority: "high"
createdAt: "2026-01-18"
origin: "sprint-change-proposal-2026-01-18.md"
---

# Story 16.9: Implementar Portão de Entrada com Bot

## User Story

**As a** novo membro,
**I want** entrar no grupo através do bot,
**So that** possa receber todas as notificações no privado.

## Contexto

Esta story foi criada a partir do Sprint Change Proposal de 2026-01-18 para resolver a limitação do Telegram onde bots não conseguem enviar mensagens privadas para usuários que não iniciaram conversa.

**Problema original:** Usuários entravam no grupo público sem dar /start no bot, impossibilitando o envio de mensagens de boas-vindas, lembretes e cobranças. Usuários eram kickados sem nunca terem recebido nenhum aviso.

**Solução:** Implementar "portão de entrada" onde o usuário PRIMEIRO interage com o bot (/start), e só então recebe link de convite para o grupo (agora privado).

## Fluxo Proposto

```
ANTES (problemático):
[Grupo Público] → Usuário entra → Bot não pode enviar mensagem → Kick sem aviso

DEPOIS (robusto):
[Link Público] → [Bot /start] → [Bot gera convite] → [Grupo Privado]
      │                │                │
      │                │                └── Usuário entra no grupo
      │                └── Bot registra trial + envia boas-vindas
      └── t.me/GuruBetBot?start=join
```

## Acceptance Criteria

### AC1: Entrada via Bot com Payload "join"

**Given** usuário clica no link público `t.me/GuruBetBot?start=join`
**When** bot recebe comando /start com payload "join"
**Then** registra membro como trial no banco (se não existir)
**And** envia mensagem de boas-vindas com link de convite único
**And** link de convite expira em 24h
**And** link de convite permite apenas 1 uso (`member_limit: 1`)

### AC2: Usuário Já é Membro

**Given** usuário já é membro ativo ou em trial
**When** envia /start novamente
**Then** bot responde com status atual (dias restantes, etc)
**And** se não está no grupo, gera novo convite
**And** se já está no grupo, informa que já tem acesso

### AC3: Reentrada Permitida (< 24h)

**Given** usuário foi removido há menos de 24h
**When** envia /start
**Then** bot permite reentrada (reativa como trial)
**And** gera novo convite
**And** registra evento 'reactivate' em member_events

### AC4: Reentrada Bloqueada (> 24h)

**Given** usuário foi removido há mais de 24h
**When** envia /start
**Then** bot envia link de pagamento Cakto
**And** NÃO gera convite
**And** informa que precisa pagar para voltar

### AC5: Confirmação de Entrada no Grupo

**Given** membro entra no grupo via convite
**When** bot detecta `new_chat_members`
**Then** atualiza registro: `joined_group_at = NOW()`
**And** registra evento 'join' em member_events
**And** invalida o convite usado (se possível)

### AC6: /start Genérico (sem payload)

**Given** usuário envia /start sem payload
**When** bot recebe comando
**Then** exibe menu principal com opções:
  - "Entrar no grupo" → mesmo fluxo de AC1
  - "Meu status" → mostra status atual
  - "Ajuda" → informações de contato

## Technical Notes

### Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/handlers/startCommand.js` | Criar | Handler para /start com lógica de portão |
| `bot/handlers/memberEvents.js` | Modificar | Adicionar lógica de confirmação de entrada |
| `bot/telegram.js` | Modificar | Registrar handler de /start |
| `bot/services/memberService.js` | Modificar | Adicionar `generateInviteLink()` |

### API do Telegram para Convites

```javascript
// Gerar link de convite único
const invite = await bot.createChatInviteLink(groupChatId, {
  member_limit: 1,           // Apenas 1 uso
  expire_date: Math.floor(Date.now() / 1000) + 86400, // Expira em 24h
  creates_join_request: false // Entrada direta, sem aprovação
});

// invite.invite_link = "https://t.me/+ABC123..."
```

### Estrutura da Tabela Members (adicionar coluna)

```sql
-- Opcional: adicionar coluna para tracking do convite
ALTER TABLE members ADD COLUMN IF NOT EXISTS
  invite_link TEXT;

ALTER TABLE members ADD COLUMN IF NOT EXISTS
  joined_group_at TIMESTAMPTZ;
```

### Mensagem de Boas-vindas com Convite

```javascript
const message = `
Bem-vindo ao *GuruBet*! 🎯

Você tem *${trialDays} dias grátis* para experimentar.

📊 *O que você recebe:*
• 3 apostas diárias com análise estatística
• Horários: 10h, 15h e 22h
• Taxa de acerto: *${successRate}%*

👇 *Clique no botão abaixo para entrar no grupo:*
`;

await bot.sendMessage(telegramId, message, {
  parse_mode: 'Markdown',
  reply_markup: {
    inline_keyboard: [[
      { text: '🚀 ENTRAR NO GRUPO', url: inviteLink }
    ]]
  }
});
```

### Configuração do Grupo

**IMPORTANTE:** O operador precisa:
1. Configurar o grupo como **privado** no Telegram
2. Adicionar o bot como **administrador** com permissão de gerar convites
3. Atualizar links de divulgação para `t.me/GuruBetBot?start=join`

## Definição de Pronto (DoD)

- [ ] Handler /start implementado com todos os ACs
- [ ] Testes unitários para cada AC
- [ ] Mensagens em português, tom amigável
- [ ] Logs com prefixo `[membership:start-command]`
- [ ] Grupo configurado como privado (ação do operador)
- [ ] Link de divulgação atualizado (ação do operador)
- [ ] Teste end-to-end: link → bot → convite → grupo → notificações funcionando

## Estimativa

**Esforço:** Médio (4-6 horas)

## Dependências

- ✅ Migration 008_member_events.sql aplicada
- ⬜ Grupo configurado como privado pelo operador
- ⬜ Bot com permissão de admin no grupo

## Links Relacionados

- [Sprint Change Proposal](../planning-artifacts/sprint-change-proposal-2026-01-18.md)
- [Epic 16 - Gestão de Membros](../planning-artifacts/epics.md#epic-16)
- [Architecture - ADR-005](../planning-artifacts/architecture.md)
