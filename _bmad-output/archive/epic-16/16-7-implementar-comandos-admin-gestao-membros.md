# Story 16.7: Implementar Comandos Admin para Gestao de Membros

Status: done

---

## Story

As a operador,
I want ter comandos para gerenciar membros manualmente,
So that possa ter controle total sobre o grupo.

---

## Acceptance Criteria

### AC1: Comando /membros - Listar resumo de membros

**Given** operador envia `/membros` no grupo admin
**When** bot processa comando
**Then** exibe resumo:
  - Total de membros ativos
  - Total em trial
  - Total inadimplentes
  - MRR (Monthly Recurring Revenue)
  - Taxa de conversao (trial -> ativo)
  - Novos membros na ultima semana (tendencia)

### AC2: Comando /membro - Status detalhado

**Given** operador envia `/membro @username` ou `/membro 123456789` (telegram_id) no grupo admin
**When** bot processa comando
**Then** exibe status detalhado do membro:
  - Status atual (trial/ativo/inadimplente/removido)
  - Telegram ID (sempre visivel, util se usuario nao tem @username)
  - Data de entrada
  - Dias restantes (trial ou assinatura)
  - Metodo de pagamento
  - Ultima renovacao
  - Historico de notificacoes enviadas
**And** se membro nao encontrado, exibe: "Membro nao encontrado. Use @username ou telegram_id numerico."

### AC3: Comando /trial - Configurar duracao trial

**Given** operador envia `/trial 14` no grupo admin
**When** bot processa comando
**Then** valida que dias esta entre 1 e 30
**And** se invalido, exibe: "Valor invalido. Use entre 1 e 30 dias."
**And** altera TRIAL_DAYS global para 14
**And** confirma: "Trial alterado para 14 dias (novos membros)"
**And** registra em logs: operador, valor anterior, novo valor, timestamp

### AC4: Comando /add_trial @username - Adicionar usuario ao trial

**Given** operador envia `/add_trial @username` ou `/add_trial 123456789` no grupo admin
**When** bot processa comando
**Then** verifica se identifier e valido (@username ou telegram_id numerico)
**And** se membro nao existe, cria com status 'trial'
**And** se membro ja existe com status 'removido' ou 'inadimplente', reinicia trial
**And** se membro ja existe com status 'ativo', retorna erro: "Membro ja esta ativo. Use /estender para dar mais tempo."
**And** confirma com detalhes: "@username adicionado ao trial (7 dias ate DD/MM/YYYY)"
**And** se identifier invalido, exibe: "Use @username ou telegram_id numerico"

### AC5: Comando /remover_membro @username [motivo] - Remover membro manualmente

**Given** operador envia `/remover_membro @username` ou `/remover_membro 123456789 [motivo opcional]` no grupo admin
**When** bot processa comando
**Then** busca membro e exibe preview com inline keyboard:
  - Mensagem: "Remover @username? (Status: ativo, Membro desde: DD/MM)"
  - Botoes: [✅ Confirmar] [❌ Cancelar]
**And** aguarda clique no botao (timeout 60s)
**And** se operador clicar em Confirmar:
  - Envia farewell message ao membro (consistente com kick-expired.js)
  - Remove membro do grupo via banChatMember (24h)
  - Atualiza status para 'removido'
  - Registra motivo: motivo informado ou 'manual_removal'
  - Registra operador que executou (msg.from.username ou msg.from.id)
  - Confirma: "@username removido do grupo"
**And** se operador clicar em Cancelar ou timeout, cancela: "Remocao cancelada."
**And** se membro nao encontrado, exibe erro

### AC6: Comando /estender @username dias - Estender assinatura

**Given** operador envia `/estender @username 7` ou `/estender 123456789 7` no grupo admin
**When** bot processa comando
**Then** valida que dias esta entre 1 e 90
**And** se invalido, exibe: "Valor invalido. Use entre 1 e 90 dias."
**And** busca membro e calcula nova data
**And** exibe preview: "Estender @username por 7 dias? Atual: DD/MM/YYYY -> Nova: DD/MM/YYYY"
**And** aplica extensao imediatamente (sem confirmacao adicional - acao nao destrutiva)
**And** adiciona dias a subscription_ends_at (se ativo/inadimplente) ou trial_ends_at (se trial)
**And** confirma: "@username estendido por 7 dias (cortesia). Nova data: DD/MM/YYYY"
**And** registra em notes: 'cortesia +7 dias por @operador em DD/MM/YYYY'
**And** se membro 'removido', retorna erro: "Membro removido. Use /add_trial para reativar."

---

## Tasks / Subtasks

- [x] Task 1: Criar funcoes de estatisticas no memberService.js (AC: #1) ✅
  - [x] 1.1: Implementar getMemberStats() - retorna contagens por status
  - [x] 1.2: Implementar calculateMRR() - soma membros ativos * preco assinatura
  - [x] 1.3: Implementar calculateConversionRate() - ratio trial->ativo
  - [x] 1.4: Implementar getNewMembersThisWeek() - contagem de novos membros nos ultimos 7 dias (tendencia)
  - [x] 1.5: Seguir Service Response Pattern { success, data/error }

- [x] Task 2: Criar funcoes CRUD para gestao manual (AC: #2, #4, #6) ✅
  - [x] 2.1: Implementar getMemberDetails(identifier) - username primeiro, fallback telegram_id (ADR-002)
  - [x] 2.2: Implementar getNotificationHistory(memberId, limit=10) - ultimas N notificacoes
  - [x] 2.3: Implementar addManualTrialMember(telegramId, username) - cria ou reinicia trial
  - [x] 2.4: Implementar extendMembership(memberId, days, operatorUsername) - adiciona dias + auditoria
  - [x] 2.5: Implementar appendToNotes(memberId, operador, acao) - formato estruturado (ADR-004)

- [x] Task 3: Implementar comando /membros (AC: #1) ✅
  - [x] 3.1: Adicionar MEMBROS_PATTERN regex em adminGroup.js
  - [x] 3.2: Criar handleMembrosCommand(bot, msg)
  - [x] 3.3: Chamar getMemberStats() e formatMemberStatsMessage()
  - [x] 3.4: Exibir contagens, MRR e taxa de conversao

- [x] Task 4: Implementar comando /membro @username (AC: #2) ✅
  - [x] 4.1: Adicionar MEMBRO_PATTERN regex em adminGroup.js
  - [x] 4.2: Criar handleMembroCommand(bot, msg, identifier)
  - [x] 4.3: Chamar getMemberDetails() e getNotificationHistory()
  - [x] 4.4: Formatar status detalhado com historico

- [x] Task 5: Implementar comando /trial (AC: #3) ✅
  - [x] 5.1: Criar tabela system_config se nao existir (ADR-001)
  - [x] 5.2: Implementar getTrialDays() - le de system_config, fallback para env
  - [x] 5.3: Implementar setTrialDays(days, operatorUsername) - grava em system_config
  - [x] 5.4: Adicionar TRIAL_CONFIG_PATTERN regex em adminGroup.js
  - [x] 5.5: Criar handleTrialConfigCommand(bot, msg, days)
  - [x] 5.6: Validar range 1-30 dias antes de aplicar
  - [x] 5.7: Registrar em logs: operador, valor anterior, novo valor
  - [x] 5.8: Confirmar alteracao com feedback

- [x] Task 6: Implementar comando /add_trial @username (AC: #4) ✅
  - [x] 6.1: Adicionar ADD_TRIAL_PATTERN regex em adminGroup.js
  - [x] 6.2: Criar handleAddTrialCommand(bot, msg, identifier)
  - [x] 6.3: Chamar addManualTrialMember()
  - [x] 6.4: Confirmar criacao/reinicio do trial

- [x] Task 7: Implementar comando /remover_membro @username [motivo] (AC: #5) ✅
  - [x] 7.1: Adicionar REMOVER_MEMBRO_PATTERN regex em adminGroup.js (capturar motivo opcional)
  - [x] 7.2: Criar handleRemoverMembroCommand(bot, msg, identifier, motivo)
  - [x] 7.3: Chamar getMemberDetails() para buscar membro (ADR-002)
  - [x] 7.4: Exibir preview com inline keyboard [Confirmar] [Cancelar]
  - [x] 7.5: Criar pendingRemovals Map com auto-cleanup 60s (ADR-003)
  - [x] 7.6: Implementar callback handler para botoes (callback_query)
  - [x] 7.7: Se confirmado, enviar farewell message ao membro (reusar formatFarewellMessage)
  - [x] 7.8: Se confirmado, chamar kickMemberFromGroup() e markMemberAsRemoved()
  - [x] 7.9: Registrar motivo e operador em notes (ADR-004)
  - [x] 7.10: Se cancelado ou timeout, editar mensagem: "Remocao cancelada."

- [x] Task 8: Implementar comando /estender @username dias (AC: #6) ✅
  - [x] 8.1: Adicionar ESTENDER_PATTERN regex em adminGroup.js
  - [x] 8.2: Criar handleEstenderCommand(bot, msg, identifier, days)
  - [x] 8.3: Validar range 1-90 dias antes de aplicar
  - [x] 8.4: Chamar getMemberDetails() (ADR-002) e extendMembership()
  - [x] 8.5: Registrar operador em notes (ADR-004)
  - [x] 8.6: Confirmar extensao com feedback (data anterior -> nova data)

- [x] Task 9: Criar testes unitarios (AC: #1, #2, #3, #4, #5, #6) ✅
  - [x] 9.1: Testar getMemberStats - contagens corretas
  - [x] 9.2: Testar calculateMRR - calculo correto
  - [x] 9.3: Testar getMemberDetails - busca por username e telegram_id
  - [x] 9.4: Testar addManualTrialMember - criar novo e reiniciar existente
  - [x] 9.5: Testar extendMembership - trial e ativo
  - [x] 9.6: Testar handlers de comando - parse de argumentos e respostas

---

## Architecture Decision Records

### ADR-001: Armazenamento de Configuracao do Trial

| Aspecto | Decisao |
|---------|---------|
| **Contexto** | Comando `/trial N` precisa alterar duracao dinamicamente |
| **Decisao** | Usar tabela `system_config` no banco |
| **Alternativas** | (A) Env var - requer redeploy; (C) Hibrido - over-engineering |
| **Rationale** | AC3 exige alteracao dinamica; tabela simples e suficiente |
| **Trade-off** | +1 query ao iniciar, mas configuracao flexivel |
| **Rollback** | Se falhar, usar env var como fallback temporario |

```sql
-- Criar tabela se nao existir (pode ja existir de outra feature)
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_config (key, value) VALUES ('trial_days', '7')
ON CONFLICT (key) DO NOTHING;
```

### ADR-002: Identificador Primario para Busca de Membros

| Aspecto | Decisao |
|---------|---------|
| **Contexto** | Comandos aceitam `@username` ou `telegram_id` |
| **Decisao** | Tentar username primeiro, fallback para telegram_id |
| **Alternativas** | (A) Username only - pode falhar se mudar; (B) ID only - UX ruim |
| **Rationale** | Melhor UX, ambos os caminhos funcionam |
| **Trade-off** | Potencial 2 queries, mas so em edge case |
| **Implementacao** | `getMemberByUsername() \|\| getMemberByTelegramId()` |

**Regra adicional:** Sempre mostrar telegram_id na resposta para que operador aprenda o ID.

### ADR-003: Gerenciamento de Estado para Confirmacao (Inline Keyboard)

| Aspecto | Decisao |
|---------|---------|
| **Contexto** | `/remover_membro` usa inline keyboard, precisa manter estado |
| **Decisao** | Map em memoria (`pendingRemovals`) com auto-cleanup |
| **Alternativas** | (B) Encode no callback_data - limite 64 bytes; (C) Tabela - over-engineering |
| **Rationale** | Bot single-instance, simplicidade > escalabilidade prematura |
| **Trade-off** | Perde estado em restart (aceitavel para confirmacao) |
| **Mitigacao** | setTimeout para auto-cleanup apos 60s |

### ADR-004: Estrutura de Auditoria

| Aspecto | Decisao |
|---------|---------|
| **Contexto** | AC3 e AC6 exigem registro de quem executou |
| **Decisao** | Campo `notes` na tabela members com formato estruturado |
| **Alternativas** | (B) Tabela audit_log - mais complexa; (C) Hibrido - duplicacao |
| **Rationale** | Suficiente para escopo atual, evita schema change |
| **Trade-off** | Menos consultavel, mas atende o caso de uso |
| **Formato** | `[YYYY-MM-DD HH:mm] @operador: acao +valor` |
| **Evolucao** | Migrar para tabela audit_log se requisitos crescerem |

---

## Dev Notes

### Aprendizados das Stories Anteriores (CRITICO)

| Aprendizado | Aplicacao |
|-------------|-----------|
| Service Response Pattern | SEMPRE retornar `{ success, data/error }` |
| Optimistic Locking | Usar `.eq('status', currentStatus)` em updates |
| Logger com prefixo | `[memberService]` para services, `[admin]` para handlers |
| Erro 403 Telegram | Usuario bloqueou bot ou ja saiu do grupo - logar warn, nao falhar |
| Telegram API kick | Usar banChatMember with until_date para ban temporario |
| Pattern de regex | Ver PROMOVER_PATTERN, REMOVER_PATTERN como exemplo |
| Inline Keyboard | Usar callback_query para confirmacoes (mais robusto que aguardar texto) |
| Validacao de range | Sempre validar inputs numericos com min/max |
| Auditoria | Registrar operador, timestamp e valores anteriores em alteracoes |

### Formato das Mensagens

**Formato /membros:**
```
*MEMBROS DO GRUPO*

Total: 150 membros
Ativos: 120
Trial: 25
Inadimplentes: 5

MRR: R$ 6.000,00
Conversao: 48% (trial -> ativo)

Novos esta semana: +8 membros

Use /membro @user para detalhes
```

**Formato /membro @username:**
```
*MEMBRO: @username*

Status: ativo
Telegram ID: 123456789
Email: user@email.com

*Datas:*
Entrada: 15/01/2026
Trial fim: 22/01/2026
Assinatura: 22/01/2026 - 22/02/2026
Dias restantes: 25

*Pagamento:*
Metodo: cartao_recorrente
Ultima renovacao: 22/01/2026

*Notificacoes recentes:*
- 20/01: trial_reminder
- 21/01: trial_reminder

/estender @username 7 | /remover_membro @username
```

**Formato /trial:**
```
*TRIAL CONFIGURADO*

Duracao: 14 dias

Novos membros terao 14 dias de trial.
Membros existentes mantem configuracao atual.
```

**Formato /add_trial:**
```
*TRIAL ADICIONADO*

@username adicionado ao trial.
Trial: 7 dias (ate 25/01/2026)

Membro ja existia: trial reiniciado
```

**Formato /remover_membro (preview com inline keyboard):**
```
*CONFIRMAR REMOCAO*

Remover @username do grupo?

Status: ativo
Membro desde: 15/01/2026
Dias restantes: 12

[✅ Confirmar] [❌ Cancelar]
```

**Codigo para inline keyboard:**
```javascript
const keyboard = {
  inline_keyboard: [[
    { text: '✅ Confirmar', callback_data: `remove_confirm:${memberId}` },
    { text: '❌ Cancelar', callback_data: `remove_cancel:${memberId}` }
  ]]
};
await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', reply_markup: keyboard });
```

**Formato /remover_membro (confirmado):**
```
*MEMBRO REMOVIDO*

@username foi removido do grupo.
Motivo: Remocao manual (ou motivo informado)
Operador: @admin_username

O membro pode solicitar reativacao em 24h.
```

**Formato /remover_membro (cancelado - editar mensagem original):**
```
Remocao de @username cancelada.
```

### Callback Query Handler para Inline Keyboard

```javascript
// Em bot/handlers/adminGroup.js ou novo arquivo bot/handlers/callbackQuery.js

// Map para armazenar contexto de operacoes pendentes (com timeout)
const pendingRemovals = new Map();

/**
 * Registrar callback handler no bot
 */
function setupCallbackHandler(bot) {
  bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    // Parse callback data: "remove_confirm:memberId" ou "remove_cancel:memberId"
    if (data.startsWith('remove_')) {
      const [action, memberId] = data.split(':');
      const pendingOp = pendingRemovals.get(memberId);

      if (!pendingOp) {
        await bot.answerCallbackQuery(query.id, { text: 'Operacao expirada' });
        return;
      }

      if (action === 'remove_confirm') {
        // Executar remocao
        await executeRemoval(bot, chatId, messageId, pendingOp);
      } else {
        // Cancelar
        await bot.editMessageText('Remocao cancelada.', { chat_id: chatId, message_id: messageId });
      }

      pendingRemovals.delete(memberId);
      await bot.answerCallbackQuery(query.id);
    }
  });
}

/**
 * Registrar operacao pendente com timeout
 */
function registerPendingRemoval(memberId, context, timeoutMs = 60000) {
  pendingRemovals.set(memberId, context);

  // Auto-limpar apos timeout
  setTimeout(() => {
    if (pendingRemovals.has(memberId)) {
      pendingRemovals.delete(memberId);
      // Opcional: editar mensagem para indicar timeout
    }
  }, timeoutMs);
}
```

**Formato /estender:**
```
*ASSINATURA ESTENDIDA*

@username ganhou +7 dias de cortesia.

Data anterior: 22/02/2026
Nova data: 01/03/2026

Registrado: cortesia +7 dias via /estender
```

### Funcoes a Implementar no memberService.js

```javascript
/**
 * Get member statistics for /membros command
 * @returns {Promise<{success: boolean, data?: {total, active, trial, inadimplente, removido}, error?: object}>}
 */
async function getMemberStats() {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('status');

    if (error) {
      logger.error('[memberService] getMemberStats: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const counts = {
      total: data.length,
      ativo: data.filter(m => m.status === 'ativo').length,
      trial: data.filter(m => m.status === 'trial').length,
      inadimplente: data.filter(m => m.status === 'inadimplente').length,
      removido: data.filter(m => m.status === 'removido').length,
    };

    return { success: true, data: counts };
  } catch (err) {
    logger.error('[memberService] getMemberStats: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Calculate Monthly Recurring Revenue
 * @param {number} activeCount - Number of active members
 * @param {number} pricePerMember - Price per member (default: 50)
 * @returns {number} MRR in BRL
 */
function calculateMRR(activeCount, pricePerMember = 50) {
  return activeCount * pricePerMember;
}

/**
 * Calculate trial to active conversion rate
 * @returns {Promise<{success: boolean, data?: {rate, converted, totalTrials}, error?: object}>}
 */
async function calculateConversionRate() {
  try {
    // Contar membros que ja foram trial e agora sao ativos
    // (aqueles que tem trial_started_at e status='ativo')
    const { data: activeConverted, error: error1 } = await supabase
      .from('members')
      .select('id')
      .eq('status', 'ativo')
      .not('trial_started_at', 'is', null);

    const { data: allTrials, error: error2 } = await supabase
      .from('members')
      .select('id')
      .not('trial_started_at', 'is', null);

    if (error1 || error2) {
      return { success: false, error: { code: 'DB_ERROR', message: error1?.message || error2?.message } };
    }

    const converted = activeConverted?.length || 0;
    const totalTrials = allTrials?.length || 0;
    const rate = totalTrials > 0 ? (converted / totalTrials) * 100 : 0;

    return { success: true, data: { rate, converted, totalTrials } };
  } catch (err) {
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}
```

### Busca de Membro por Username

```javascript
/**
 * Get member details by @username or telegram_id
 * Story 16.7: Implementar Comandos Admin para Gestao de Membros
 * @param {string} identifier - @username (with @) or telegram_id
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getMemberDetails(identifier) {
  try {
    let query = supabase.from('members').select('*');

    // Check if identifier is @username or telegram_id
    if (identifier.startsWith('@')) {
      const username = identifier.substring(1); // Remove @
      query = query.eq('telegram_username', username);
    } else {
      // Assume telegram_id
      query = query.eq('telegram_id', identifier);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: false,
          error: { code: 'MEMBER_NOT_FOUND', message: `Membro ${identifier} nao encontrado` }
        };
      }
      logger.error('[memberService] getMemberDetails: database error', { identifier, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] getMemberDetails: unexpected error', { identifier, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}
```

### Historico de Notificacoes

```javascript
/**
 * Get notification history for a member
 * @param {string} memberId - Member UUID
 * @param {number} limit - Max notifications to return (default: 10)
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getNotificationHistory(memberId, limit = 10) {
  try {
    const { data, error } = await supabase
      .from('member_notifications')
      .select('type, channel, sent_at')
      .eq('member_id', memberId)
      .order('sent_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('[memberService] getNotificationHistory: database error', { memberId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    logger.error('[memberService] getNotificationHistory: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}
```

### Adicionar Membro Manual ao Trial

```javascript
/**
 * Add member manually to trial (create new or restart existing)
 * Story 16.7: Implementar Comandos Admin para Gestao de Membros
 * @param {number|string} telegramId - Telegram user ID
 * @param {string} username - Telegram username (without @)
 * @returns {Promise<{success: boolean, data?: object, isNew?: boolean, error?: object}>}
 */
async function addManualTrialMember(telegramId, username) {
  const { config } = require('../../lib/config');
  const trialDays = config.membership?.trialDays || 7;

  try {
    // Check if member exists
    const existingResult = await getMemberByTelegramId(telegramId);

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    if (existingResult.success) {
      // Member exists - restart trial
      const member = existingResult.data;

      // Only allow restart if status allows it
      if (member.status === 'ativo') {
        return {
          success: false,
          error: { code: 'MEMBER_ACTIVE', message: 'Membro ja esta ativo. Use /estender para dar mais tempo.' }
        };
      }

      const { data, error } = await supabase
        .from('members')
        .update({
          status: 'trial',
          telegram_username: username,
          trial_started_at: now.toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
          kicked_at: null,
          notes: `Trial reiniciado manualmente em ${now.toISOString()}`
        })
        .eq('id', member.id)
        .select()
        .single();

      if (error) {
        return { success: false, error: { code: 'DB_ERROR', message: error.message } };
      }

      logger.info('[memberService] addManualTrialMember: trial restarted', { memberId: member.id, telegramId });
      return { success: true, data, isNew: false };
    }

    // Only proceed if error was MEMBER_NOT_FOUND
    if (existingResult.error.code !== 'MEMBER_NOT_FOUND') {
      return existingResult;
    }

    // Create new trial member
    const { data, error } = await supabase
      .from('members')
      .insert({
        telegram_id: telegramId,
        telegram_username: username,
        status: 'trial',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEndsAt.toISOString(),
        notes: `Trial adicionado manualmente em ${now.toISOString()}`
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] addManualTrialMember: new trial created', { memberId: data.id, telegramId });
    return { success: true, data, isNew: true };
  } catch (err) {
    logger.error('[memberService] addManualTrialMember: unexpected error', { telegramId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}
```

### Estender Assinatura/Trial

```javascript
/**
 * Extend membership (trial or subscription) by X days
 * Story 16.7: Implementar Comandos Admin para Gestao de Membros
 * @param {string} memberId - Member UUID
 * @param {number} days - Days to add
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function extendMembership(memberId, days) {
  try {
    const memberResult = await getMemberById(memberId);

    if (!memberResult.success) {
      return memberResult;
    }

    const member = memberResult.data;
    const now = new Date();

    // Determine which date to extend
    let updateFields = {};
    let fieldExtended = '';

    if (member.status === 'trial') {
      // Extend trial_ends_at
      const currentEnd = new Date(member.trial_ends_at || now);
      const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);
      updateFields = {
        trial_ends_at: newEnd.toISOString(),
        notes: `${member.notes || ''}\nCortesia +${days} dias em ${now.toISOString()}`.trim()
      };
      fieldExtended = 'trial_ends_at';
    } else if (member.status === 'ativo' || member.status === 'inadimplente') {
      // Extend subscription_ends_at
      const currentEnd = new Date(member.subscription_ends_at || now);
      const newEnd = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);
      updateFields = {
        subscription_ends_at: newEnd.toISOString(),
        notes: `${member.notes || ''}\nCortesia +${days} dias em ${now.toISOString()}`.trim()
      };
      fieldExtended = 'subscription_ends_at';

      // If inadimplente, transition to ativo
      if (member.status === 'inadimplente') {
        updateFields.status = 'ativo';
      }
    } else {
      return {
        success: false,
        error: { code: 'INVALID_MEMBER_STATUS', message: `Nao e possivel estender membro com status '${member.status}'` }
      };
    }

    const { data, error } = await supabase
      .from('members')
      .update(updateFields)
      .eq('id', memberId)
      .select()
      .single();

    if (error) {
      logger.error('[memberService] extendMembership: database error', { memberId, error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] extendMembership: success', {
      memberId,
      days,
      fieldExtended,
      newEnd: updateFields[fieldExtended]
    });

    return { success: true, data };
  } catch (err) {
    logger.error('[memberService] extendMembership: unexpected error', { memberId, error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}
```

### Regex Patterns para adminGroup.js

```javascript
// Story 16.7: Comandos de gestao de membros

// Regex to match "/membros" command
const MEMBROS_PATTERN = /^\/membros$/i;

// Regex to match "/membro @username" or "/membro telegram_id" command
const MEMBRO_PATTERN = /^\/membro\s+(@?\w+)$/i;

// Regex to match "/trial 14" command (set trial days)
const TRIAL_CONFIG_PATTERN = /^\/trial\s+(\d+)$/i;

// Regex to match "/add_trial @username" command
const ADD_TRIAL_PATTERN = /^\/add_trial\s+(@?\w+)$/i;

// Regex to match "/remover_membro @username" command
const REMOVER_MEMBRO_PATTERN = /^\/remover_membro\s+(@?\w+)$/i;

// Regex to match "/estender @username 7" command
const ESTENDER_PATTERN = /^\/estender\s+(@?\w+)\s+(\d+)$/i;
```

### Estrutura dos Handlers

```javascript
/**
 * Handle /membros command - Show member statistics (Story 16.7)
 */
async function handleMembrosCommand(bot, msg) {
  logger.info('Received /membros command', { chatId: msg.chat.id, userId: msg.from?.id });

  const [statsResult, conversionResult] = await Promise.all([
    getMemberStats(),
    calculateConversionRate(),
  ]);

  if (!statsResult.success) {
    await bot.sendMessage(
      msg.chat.id,
      `Erro ao buscar estatisticas: ${statsResult.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const stats = statsResult.data;
  const conversion = conversionResult.success ? conversionResult.data : null;
  const mrr = calculateMRR(stats.ativo);

  const message = `*MEMBROS DO GRUPO*

Total: ${stats.total} membros
Ativos: ${stats.ativo}
Trial: ${stats.trial}
Inadimplentes: ${stats.inadimplente}

MRR: R$ ${mrr.toLocaleString('pt-BR')},00
Conversao: ${conversion ? conversion.rate.toFixed(0) : '?'}% (trial -> ativo)

Use /membro @user para detalhes`;

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
  logger.info('Membros command executed', { stats });
}
```

### Obter Telegram ID de Username

**IMPORTANTE:** O bot nao consegue obter o telegram_id de um username diretamente. Ha duas opcoes:

1. **Se o usuario ja esta no banco:** Buscar por telegram_username
2. **Se o usuario nao esta no banco:** Pedir ao operador o telegram_id

```javascript
/**
 * Resolve identifier to telegram_id
 * If @username, try to find in members table
 * If numeric, assume it's telegram_id
 */
async function resolveIdentifier(identifier) {
  if (identifier.startsWith('@')) {
    // Try to find by username in members table
    const result = await getMemberDetails(identifier);
    if (result.success) {
      return { success: true, telegramId: result.data.telegram_id, member: result.data };
    }
    return { success: false, error: result.error };
  }

  // Numeric - assume telegram_id
  const telegramId = parseInt(identifier, 10);
  if (isNaN(telegramId)) {
    return { success: false, error: { code: 'INVALID_IDENTIFIER', message: 'Identificador invalido' } };
  }

  return { success: true, telegramId, member: null };
}
```

### Configuracao Trial Dinamica

Para permitir alteracao dinamica do trial_days, ha duas opcoes:

**Opcao A: Variavel de ambiente (requer restart)**
```javascript
// Atualizar .env e fazer redeploy
// Nao recomendado para alteracao frequente
```

**Opcao B: Tabela de configuracao (recomendado)**
```sql
-- Criar tabela de configuracoes (se nao existir)
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Inserir configuracao default
INSERT INTO system_config (key, value) VALUES ('trial_days', '7')
ON CONFLICT (key) DO NOTHING;
```

```javascript
/**
 * Set trial days in system config
 * @param {number} days - New trial duration
 */
async function setTrialDays(days) {
  try {
    const { error } = await supabase
      .from('system_config')
      .upsert({
        key: 'trial_days',
        value: days.toString(),
        updated_at: new Date().toISOString()
      });

    if (error) {
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    logger.info('[memberService] setTrialDays: updated', { days });
    return { success: true, data: { days } };
  } catch (err) {
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}

/**
 * Get trial days from system config or env fallback
 */
async function getTrialDays() {
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', 'trial_days')
      .single();

    if (!error && data) {
      return parseInt(data.value, 10) || 7;
    }

    // Fallback to config
    const { config } = require('../../lib/config');
    return config.membership?.trialDays || 7;
  } catch (err) {
    return 7; // Default fallback
  }
}
```

**Decisao: Usar Opcao B (tabela system_config)**
- Permite alteracao sem redeploy
- Mantido em sincronia com o banco
- Fallback para config.membership.trialDays se tabela nao existir

### Migration para system_config (Opcional)

```sql
-- sql/migrations/006_system_config.sql (se necessario)
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO system_config (key, value) VALUES ('trial_days', '7')
ON CONFLICT (key) DO NOTHING;
```

**Nota:** Se preferir simplicidade, pode usar apenas a variavel de ambiente e documentar que requer redeploy para alterar.

---

## Project Structure Notes

**Arquivos a ATUALIZAR:**
```
bot/
├── handlers/
│   └── adminGroup.js           # Adicionar comandos /membros, /membro, etc.
└── services/
    └── memberService.js        # Adicionar getMemberStats, getMemberDetails, etc.

lib/
└── config.js                   # Ja tem membership.trialDays (pode precisar getTrialDays dinamico)
```

**Arquivos a CRIAR (testes):**
```
__tests__/
├── handlers/
│   └── adminGroup.membros.test.js  # Testes dos novos comandos
└── services/
    └── memberService.stats.test.js # Testes das novas funcoes
```

**Dependencias existentes:**
- `node-telegram-bot-api` - Ja instalado
- `@supabase/supabase-js` - Ja instalado

---

## Previous Story Intelligence

### Story 16.6 (Remocao Automatica Inadimplentes)
- **Arquivos atualizados:** `bot/services/memberService.js`, `bot/services/notificationService.js`
- **Funcoes disponiveis:** `kickMemberFromGroup()`, `markMemberAsRemoved()`, `formatFarewellMessage()`
- **343 testes passando (27 novos)**

### Story 16.5 (Notificacoes de Cobranca)
- **Arquivos criados:** `bot/services/notificationService.js`, `bot/jobs/membership/trial-reminders.js`, `bot/jobs/membership/renewal-reminders.js`
- **Funcoes disponiveis:** `sendPrivateMessage()`, `getCheckoutLink()`, `hasNotificationToday()`, `registerNotification()`
- **316 testes passando (34 novos)**

### Story 16.4 (Deteccao Entrada + Trial)
- **Arquivos criados:** `bot/handlers/memberEvents.js`
- **Funcoes disponiveis:** `handleNewChatMembers()`, `processNewMember()`, `sendWelcomeMessage()`
- **Pattern de erro 403:** Implementado
- **57 testes novos**

### Story 16.3 (Processamento Assincrono Webhooks)
- **Arquivos criados:** `bot/jobs/membership/process-webhooks.js`, `bot/services/webhookProcessors.js`
- **38 testes passando**

### Story 16.2 (Webhook Server)
- **Arquivos criados:** `bot/webhook-server.js`, `bot/handlers/caktoWebhook.js`
- **19 testes passando**

### Story 16.1 (Infraestrutura + State Machine)
- **Arquivos criados:** `bot/services/memberService.js`
- **Funcoes disponiveis:** `getMemberById()`, `getMemberByTelegramId()`, `updateMemberStatus()`, `canTransition()`, `createTrialMember()`, `activateMember()`, `renewMemberSubscription()`, `markMemberAsDefaulted()`, `canRejoinGroup()`, `reactivateMember()`
- **State machine:** trial -> ativo -> inadimplente -> removido
- **34 testes passando**

### Git Intelligence (Commits Recentes)
```
c644156 feat(membership): implement automatic removal of expired trials and defaulted members (Story 16.6)
75836df feat(membership): implement billing notifications (Story 16.5)
d1e0a7f feat(membership): implement member entry detection and trial system (Story 16.4)
bea0df4 feat(membership): implement async webhook processing (Story 16.3)
```

**Total de testes no projeto:** 343 passando

---

## Architecture References

### ADR-003: Arquitetura de Jobs de Membros
```
bot/jobs/
└── membership/
    ├── trial-reminders.js      # 09:00 BRT (Story 16.5) OK
    ├── kick-expired.js         # 00:01 BRT (Story 16.6) OK
    ├── renewal-reminders.js    # 10:00 BRT (Story 16.5) OK
    ├── process-webhooks.js     # */30s (Story 16.3) OK
    └── reconciliation.js       # 03:00 BRT (Story 16.8) pendente
```

### Member State Machine (project-context.md)
```
trial ──────► ativo ──────► inadimplente
  │             │                │
  │             │                ▼
  └─────────────┴──────────► removido
```

### Service Response Pattern
```javascript
// Sucesso
return { success: true, data: { ... } };

// Erro
return { success: false, error: { code: 'CODIGO', message: '...' } };
```

### Tabela members (campos relevantes)
```
id (UUID)
telegram_id (BIGINT)
telegram_username (TEXT)
email (TEXT)
status (TEXT): trial, ativo, inadimplente, removido
cakto_subscription_id (TEXT)
cakto_customer_id (TEXT)
payment_method (TEXT): pix, boleto, cartao_recorrente
trial_started_at (TIMESTAMPTZ)
trial_ends_at (TIMESTAMPTZ)
subscription_started_at (TIMESTAMPTZ)
subscription_ends_at (TIMESTAMPTZ)
last_payment_at (TIMESTAMPTZ)
kicked_at (TIMESTAMPTZ)
notes (TEXT)
created_at (TIMESTAMPTZ)
```

### Tabela member_notifications (campos relevantes)
```
id (UUID)
member_id (UUID FK members)
type (TEXT): trial_reminder, renewal_reminder, welcome, farewell
channel (TEXT): telegram
sent_at (TIMESTAMPTZ)
message_id (TEXT)
```

---

## Environment Variables Necessarias

```bash
# Ja existentes
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_ADMIN_GROUP_ID=-100xxxxxxxxxx
TELEGRAM_PUBLIC_GROUP_ID=-100xxxxxxxxxx

# Config membership (ja existentes)
MEMBERSHIP_TRIAL_DAYS=7
MEMBERSHIP_SUBSCRIPTION_PRICE=R$50/mes
MEMBERSHIP_OPERATOR_USERNAME=operador
CAKTO_CHECKOUT_URL=https://pay.cakto.com.br/xxx
```

---

## Funcoes Uteis Ja Existentes

### bot/services/memberService.js
```javascript
const {
  getMemberById,
  getMemberByTelegramId,
  getMemberByEmail,
  updateMemberStatus,
  createTrialMember,
  activateMember,
  renewMemberSubscription,
  markMemberAsDefaulted,
  canRejoinGroup,
  reactivateMember,
  kickMemberFromGroup,
  markMemberAsRemoved,
  getTrialDaysRemaining,
  canTransition,
  MEMBER_STATUSES,
  VALID_TRANSITIONS,
} = require('./memberService');
```

### bot/services/notificationService.js
```javascript
const {
  sendPrivateMessage,
  getCheckoutLink,
  getOperatorUsername,
  getSubscriptionPrice,
  hasNotificationToday,
  registerNotification,
  formatTrialReminder,
  formatRenewalReminder,
  formatFarewellMessage,
} = require('./notificationService');
```

### bot/services/alertService.js
```javascript
const { alertAdmin } = require('./alertService');
// Enviar alerta ao grupo admin
await alertAdmin('Mensagem de alerta');
```

### bot/telegram.js
```javascript
const { getBot } = require('./telegram');
const bot = getBot();
// bot.sendMessage(chatId, message, options)
// bot.banChatMember(chatId, userId, { until_date })
```

### lib/config.js
```javascript
const { config } = require('../lib/config');
// config.membership.trialDays
// config.membership.checkoutUrl
// config.membership.operatorUsername
// config.membership.subscriptionPrice
// config.telegram.adminGroupId
// config.telegram.publicGroupId
```

---

## Error Codes

| Code | Quando usar |
|------|-------------|
| `MEMBER_NOT_FOUND` | Membro nao existe no banco |
| `MEMBER_ALREADY_EXISTS` | Telegram ID ja cadastrado |
| `MEMBER_ACTIVE` | Membro ja esta ativo (para add_trial) |
| `INVALID_MEMBER_STATUS` | Transicao de estado invalida |
| `INVALID_IDENTIFIER` | Identificador invalido (nem @username nem telegram_id) |
| `USER_NOT_IN_GROUP` | Usuario ja nao esta no grupo (400) |
| `BOT_NO_PERMISSION` | Bot sem permissao para kick (403) |
| `DB_ERROR` | Erro de banco de dados |
| `UNEXPECTED_ERROR` | Erro inesperado |

---

## References

- [Source: project-context.md#Member State Machine]
- [Source: project-context.md#Service Response Pattern]
- [Source: project-context.md#Membership Error Codes]
- [Source: epics.md#Story 16.7]
- [Pattern: bot/handlers/adminGroup.js - Existing command patterns]
- [Pattern: bot/services/memberService.js - Service Response Pattern]
- [Pattern: bot/services/notificationService.js - Notification functions]
- [Learnings: 16-6-implementar-remocao-automatica-inadimplentes.md]
- [Learnings: 16-5-implementar-notificacoes-cobranca.md]

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

### Completion Notes List

- All 9 tasks implemented with TDD (Red-Green-Refactor)
- 371 tests passing (27 new tests for Story 16.7)
- Code review completed with 5 issues found and fixed

### File List

- `bot/services/memberService.js` - Added statistics functions (getMemberStats, calculateMRR, calculateConversionRate, getNewMembersThisWeek) and CRUD functions (getMemberDetails, getNotificationHistory, addManualTrialMember, extendMembership, appendToNotes, getTrialDays, setTrialDays)
- `bot/handlers/adminGroup.js` - Added 6 new commands (/membros, /membro, /trial, /add_trial, /remover_membro, /estender) with handlers and inline keyboard support for removal confirmation
- `bot/server.js` - Added callback_query handler for inline keyboard buttons
- `__tests__/services/memberService.test.js` - Added 27 tests for new functions
- `sql/migrations/006_system_config.sql` - New migration for system_config table (ADR-001)

