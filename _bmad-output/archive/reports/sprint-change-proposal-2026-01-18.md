# Sprint Change Proposal - Epic 16 Hotfix + Portão de Entrada

**Data:** 2026-01-18
**Autor:** Workflow Correct Course
**Status:** Pendente Aprovação
**Epic Afetado:** Epic 16 - Gestão de Membros e Pagamentos Cakto

---

## 1. Resumo do Problema

O Epic 16 foi marcado como "done", porém **3 problemas críticos** foram descobertos em produção:

### 1.1 Tabela `member_events` Não Existe

**Evidência:**
```json
{"timestamp":"2026-01-18T16:36:47.860Z","level":"WARN","message":"[membership:member-events] Failed to register event","memberId":8,"eventType":"join","error":"Could not find the table 'public.member_events' in the schema cache"}
```

**Causa:** O código em `bot/handlers/memberEvents.js:259` referencia uma tabela que nunca foi criada nas migrations.

### 1.2 Bot Não Pode Enviar Mensagens Privadas

**Evidência:**
```json
{"timestamp":"2026-01-18T16:36:48.430Z","level":"WARN","message":"[membership:member-events] User has not started chat with bot","telegramId":6652491217}
```

**Causa:** Limitação do Telegram - bots não podem iniciar conversas. Usuário precisa dar /start primeiro.

**Impacto:** Mensagens de boas-vindas, lembretes de trial e cobranças **não são entregues**. Usuário pode ser kickado sem nunca ter recebido aviso.

### 1.3 Falta Validação de Schema

**Causa:** Não há teste que valide se todas as tabelas referenciadas no código existem no banco.

---

## 2. Análise de Impacto

### 2.1 Impacto no Epic 16

| Story | Status Real | Problema |
|-------|-------------|----------|
| 16.4 - Detecção de Entrada | ⚠️ Parcial | `member_events` não existe |
| 16.5 - Notificações | ❌ Não funciona | Bot não pode enviar mensagens privadas |
| 16.6 - Remoção Automática | ⚠️ Parcial | Kick funciona, mas sem aviso prévio |

### 2.2 FRs Afetados

| FR | Requisito | Status |
|----|-----------|--------|
| FR-MB5 | Mensagem de boas-vindas | ❌ Falha |
| FR-MB13 | Mensagem privada para trial | ❌ Falha |
| FR-MB14-15 | Lembretes diários | ❌ Falha |
| FR-MB21 | Mensagem ao removido | ❌ Falha |

### 2.3 Impacto em Artefatos

| Artefato | Mudança Necessária |
|----------|-------------------|
| PRD | Atualizar FR-MB1, FR-MB2, FR-MB5 |
| Architecture | Adicionar ADR-005 (Portão de Entrada) |
| Migrations | Adicionar 008_member_events.sql |
| Epic 16 | Adicionar Story 16.9, reabrir como in-progress |
| Sprint Status | Atualizar status do Epic 16 |

---

## 3. Abordagem Recomendada

**Decisão:** Implementar **Portão de Entrada** com bot como intermediário.

### 3.1 Solução: Portão de Entrada

```
FLUXO ATUAL (problemático):
[Grupo Público] → Usuário entra → Bot não pode enviar mensagem → Kick sem aviso

FLUXO NOVO (robusto):
[Link Público] → [Bot /start] → [Bot gera convite] → [Grupo Privado]
                      ↓
              Agora bot PODE enviar
              mensagens privadas
```

### 3.2 Por Que Essa Abordagem?

| Alternativa | Avaliação |
|-------------|-----------|
| Userbot (conta pessoal) | ❌ Viola ToS Telegram, risco de ban |
| Mensagem no grupo | ❌ Flood de boas-vindas |
| Deep link no grupo | ❌ ~50% não clicam, kick sem aviso |
| **Portão de entrada** | ✅ 100% cobertura, padrão de mercado |

### 3.3 Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Fricção extra na entrada | Média | UX clara, link direto para bot |
| Usuários não completam fluxo | Baixa | Mensagens claras, suporte via @operador |
| Link de convite expira | Baixa | Regenerar via /start |

---

## 4. Propostas de Mudança Detalhadas

### 4.1 Migration: `member_events`

**Arquivo:** `sql/migrations/008_member_events.sql`

```sql
-- Migration 008: Create member_events table for audit logging
-- Fix: Code in memberEvents.js expects this table but it was never created

CREATE TABLE IF NOT EXISTS member_events (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('join', 'leave', 'kick', 'payment', 'trial_start', 'trial_end', 'reactivate')),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for querying events by member
CREATE INDEX IF NOT EXISTS idx_member_events_member_id
ON member_events(member_id);

-- Index for querying events by type
CREATE INDEX IF NOT EXISTS idx_member_events_type
ON member_events(event_type, created_at DESC);

COMMENT ON TABLE member_events IS 'Audit log de eventos de membros (entrada, saída, pagamento, etc)';
```

**Prioridade:** 🔴 CRÍTICO - Aplicar imediatamente

---

### 4.2 Teste de Validação de Schema

**Arquivo:** `__tests__/schema-validation.test.js`

```javascript
/**
 * Schema Validation Test
 * Ensures all tables expected by code actually exist in database
 */
const { supabase } = require('../lib/supabase');

describe('Database Schema Validation', () => {
  const REQUIRED_TABLES = [
    'members',
    'member_notifications',
    'member_events',
    'webhook_events',
    'suggested_bets',
    'odds_update_history',
    'system_config'
  ];

  test.each(REQUIRED_TABLES)('table "%s" should exist', async (tableName) => {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    // If table doesn't exist, error will contain "relation does not exist"
    expect(error?.message).not.toMatch(/relation.*does not exist/i);
    expect(error?.message).not.toMatch(/Could not find.*in the schema cache/i);
  });

  test('members table should have all required columns', async () => {
    const { data, error } = await supabase
      .from('members')
      .select('id, telegram_id, status, trial_started_at, trial_ends_at')
      .limit(1);

    expect(error).toBeNull();
  });

  test('webhook_events table should have updated_at column', async () => {
    const { data, error } = await supabase
      .from('webhook_events')
      .select('id, updated_at')
      .limit(1);

    expect(error).toBeNull();
  });
});
```

**Prioridade:** 🟡 ALTA - Incluir no CI/CD

---

### 4.3 Nova Story 16.9: Portão de Entrada

**Adicionar ao Epic 16:**

```markdown
### Story 16.9: Implementar Portão de Entrada com Bot

As a novo membro,
I want entrar no grupo através do bot,
So that possa receber todas as notificações no privado.

**Acceptance Criteria:**

**Given** usuário clica no link público (t.me/GuruBetBot?start=join)
**When** bot recebe comando /start com payload "join"
**Then** registra membro como trial no banco
**And** envia mensagem de boas-vindas com link de convite
**And** link de convite é único e expira em 24h

**Given** usuário já é membro ativo ou em trial
**When** envia /start novamente
**Then** bot responde com status atual
**And** não gera novo convite

**Given** usuário foi removido há menos de 24h
**When** envia /start
**Then** bot permite reentrada
**And** gera novo convite

**Given** usuário foi removido há mais de 24h
**When** envia /start
**Then** bot envia link de pagamento Cakto
**And** não gera convite até pagamento confirmado

**Given** membro entra no grupo via convite
**When** bot detecta new_chat_members
**Then** atualiza registro: joined_group_at = NOW()
**And** registra evento em member_events

**Technical Notes:**
- Criar handler `handleJoinStart()` em bot/handlers/startCommand.js
- Usar `bot.createChatInviteLink()` com `member_limit: 1` e `expire_date`
- Armazenar invite_link no registro do membro para tracking
- Grupo deve ser configurado como privado no Telegram
- Atualizar link de divulgação em todos os canais
```

**Prioridade:** 🟡 ALTA - Resolve problema de notificações

---

### 4.4 Atualizações de Documentação

**Architecture.md - Adicionar ADR-005:**

```markdown
### ADR-005: Portão de Entrada para Grupo Privado

**Status:** ✅ Aprovado
**Contexto:** Bots do Telegram não podem iniciar conversas privadas. Usuários entravam no grupo sem dar /start, impossibilitando notificações.

**Decisão:** Implementar portão de entrada onde usuário interage com bot ANTES de entrar no grupo.

**Fluxo:**
1. Link público direciona para bot (t.me/Bot?start=join)
2. Bot registra membro e envia boas-vindas
3. Bot gera link de convite único para grupo privado
4. Usuário entra no grupo
5. Todas as notificações funcionam

**Consequências:**
- ✅ 100% dos membros podem receber notificações
- ✅ Padrão de mercado (Hotmart, Kiwify)
- ⚠️ Um clique extra na jornada de entrada
- ⚠️ Grupo precisa ser privado
```

---

## 5. Plano de Implementação

### 5.1 Sequência de Execução

| Ordem | Tarefa | Responsável | Esforço |
|-------|--------|-------------|---------|
| 1 | Aplicar migration 008_member_events.sql | Dev | 5 min |
| 2 | Criar teste schema-validation.test.js | Dev | 30 min |
| 3 | Configurar grupo como privado no Telegram | Operador | 5 min |
| 4 | Implementar Story 16.9 (portão de entrada) | Dev | 4-6h |
| 5 | Atualizar links de divulgação | Operador | 15 min |
| 6 | Testar fluxo completo end-to-end | QA | 1h |
| 7 | Atualizar Architecture.md com ADR-005 | Dev | 15 min |

### 5.2 Critérios de Sucesso

- [ ] Migration aplicada sem erros
- [ ] Teste de schema passando no CI
- [ ] Novo membro consegue entrar via bot → grupo
- [ ] Mensagem de boas-vindas entregue 100%
- [ ] Lembretes de trial entregues nos dias 5, 6, 7
- [ ] Kick com mensagem de despedida entregue

---

## 6. Classificação e Handoff

### 6.1 Escopo da Mudança

**Classificação:** 🟡 **MODERADA**

- Não é apenas hotfix (requer nova story)
- Não é mudança fundamental de arquitetura (usa componentes existentes)
- Requer coordenação entre Dev e Operador

### 6.2 Handoff

| Papel | Responsabilidade |
|-------|------------------|
| **Dev** | Implementar migration, teste, Story 16.9 |
| **Operador** | Configurar grupo privado, atualizar links |
| **SM** | Reabrir Epic 16, adicionar Story 16.9 |

### 6.3 Próximos Passos

1. ✅ Aprovar esta proposta
2. ⬜ Aplicar migration imediatamente (hotfix)
3. ⬜ Reabrir Epic 16 no sprint-status.yaml
4. ⬜ Criar story file para 16.9
5. ⬜ Implementar via workflow dev-story

---

## 7. Aprovação

| Papel | Nome | Data | Decisão |
|-------|------|------|---------|
| Product Owner | Marcelomendes | 2026-01-18 | ✅ **APROVADO** |

**Status:** Aprovado para implementação
**Sprint Status:** Epic 16 reaberto como `in-progress`
**Próxima ação:** Aplicar migration e implementar Story 16.9

---

*Documento gerado pelo workflow Correct Course*
*Versão: 1.0*
