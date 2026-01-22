# Story 16.8: Implementar Reconciliacao com Cakto

Status: done

---

## Story

As a sistema,
I want reconciliar estado dos membros com o Cakto diariamente,
So that detecte e corrija dessincronizacoes entre banco local e plataforma de pagamentos.

---

## Acceptance Criteria

### AC1: Job de Reconciliacao Agendado

**Given** job reconciliation configurado
**When** relogio marca 03:00 BRT
**Then** job executa automaticamente
**And** usa lock distribuido de 15 minutos
**And** loga com prefixo `[membership:reconciliation]`

### AC2: Buscar Membros Ativos/Trial com Subscription

**Given** job reconciliation executando
**When** busca membros para verificar
**Then** seleciona todos com status 'ativo' ou 'trial'
**And** ignora membros sem `cakto_subscription_id` (trial sem pagamento)
**And** ignora membros com status 'removido' ou 'inadimplente'

### AC3: Consultar Status na API Cakto

**Given** membro com `cakto_subscription_id` encontrado
**When** job consulta API Cakto
**Then** chama `caktoService.getSubscription(subscriptionId)`
**And** aplica rate limiting (max 10 req/segundo)
**And** captura status da assinatura do Cakto

### AC4: Detectar Dessincronizacao

**Given** status local e status Cakto obtidos
**When** comparacao executada
**Then** detecta dessincronizacao se:
  - Local 'ativo' mas Cakto 'canceled'
  - Local 'ativo' mas Cakto 'expired'
  - Local 'ativo' mas Cakto 'defaulted'
**And** NAO corrige automaticamente
**And** marca membro para revisao manual

### AC5: Alertar Admin sobre Dessincronizacoes

**Given** dessincronizacoes detectadas
**When** job termina
**Then** envia alerta consolidado para grupo admin:
  - Lista de membros afetados
  - Status local vs Cakto para cada um
  - Acao sugerida para cada caso
**And** alerta inclui @username e telegram_id

### AC6: Tratar Falhas de API

**Given** chamada a API Cakto falha
**When** erro ocorre
**Then** loga erro e continua com proximo membro
**And** incrementa contador de falhas
**And** ao final, reporta quantos falharam
**And** se > 50% falhou, envia alerta critico

### AC7: Relatorio Final de Reconciliacao

**Given** reconciliacao concluida
**When** job termina
**Then** loga resumo:
  - Total verificados
  - Total sincronizados (OK)
  - Total dessincronizados
  - Total com erro de API
  - Duracao da execucao
**And** se zero dessincronizacoes, nao envia alerta (sucesso silencioso)

---

## Tasks / Subtasks

- [x] Task 1: Criar caktoService.js com integracao API Cakto (AC: #3) **CRITICO**
  - [x] 1.1: Implementar `getAccessToken()` - OAuth client_credentials flow
  - [x] 1.2: Implementar `getSubscription(subscriptionId)` - consulta status assinatura
  - [x] 1.3: Implementar cache de token (expira em `expires_in - 60s`)
  - [x] 1.4: Implementar retry com exponential backoff (3 tentativas, 1s/2s/4s)
  - [x] 1.5: Configurar timeout de 10 segundos para todas as chamadas axios
  - [x] 1.6: Seguir Service Response Pattern `{ success, data/error }`

- [x] Task 2: Criar funcao de busca de membros para reconciliacao (AC: #2)
  - [x] 2.1: Implementar `getMembersForReconciliation()` em memberService.js
  - [x] 2.2: Filtrar status IN ('ativo', 'trial') com cakto_subscription_id NOT NULL
  - [x] 2.3: Retornar campos necessarios: id, telegram_id, telegram_username, status, cakto_subscription_id

- [x] Task 3: Implementar job reconciliation.js (AC: #1, #4, #6, #7)
  - [x] 3.1: Criar `bot/jobs/membership/reconciliation.js`
  - [x] 3.2: Configurar cron para 03:00 BRT em server.js
  - [x] 3.3: Implementar lock in-memory (consistente com outros jobs)
  - [x] 3.4: Implementar loop de verificacao com rate limiting
  - [x] 3.5: Implementar logica de comparacao de status
  - [x] 3.6: Implementar contadores de resultado
  - [x] 3.7: Logar resumo ao final

- [x] Task 4: Mapear status Cakto para status local (AC: #4)
  - [x] 4.1: Documentar mapeamento de status Cakto -> dessincronizado
  - [x] 4.2: Criar funcao `isDesynchronized(localStatus, caktoStatus)`
  - [x] 4.3: Definir acoes sugeridas para cada tipo de dessincronizacao

- [x] Task 5: Implementar alerta de dessincronizacao (AC: #5)
  - [x] 5.1: Criar funcao `sendDesyncAlert(members)`
  - [x] 5.2: Integrar com `alertAdmin()` existente
  - [x] 5.3: Incluir @username, telegram_id, status local vs Cakto

- [x] Task 6: Implementar alerta de falha critica (AC: #6)
  - [x] 6.1: Calcular percentual de falhas
  - [x] 6.2: Se > 50%, enviar alerta critico separado
  - [x] 6.3: Incluir detalhes de erros mais frequentes (top 3)

- [x] Task 7: Criar testes unitarios (AC: #1-7)
  - [x] 7.1: Testar caktoService.getAccessToken - cache e refresh
  - [x] 7.2: Testar caktoService.getSubscription - sucesso, erro 404, retry com backoff
  - [x] 7.3: Testar caktoService timeout - verificar que timeout de 10s esta configurado
  - [x] 7.4: Testar getMembersForReconciliation - filtros corretos
  - [x] 7.5: Testar isDesynchronized - todos os casos (active, canceled, expired, defaulted, NOT_FOUND)
  - [x] 7.6: Testar sendDesyncAlert - formato correto da mensagem
  - [x] 7.7: Testar sendCriticalFailureAlert - agregacao de erros
  - [x] 7.8: Testar job reconciliation - fluxo completo (mock API)

---

## Dev Notes

### Aprendizados das Stories Anteriores (CRITICO)

| Aprendizado | Aplicacao |
|-------------|-----------|
| Service Response Pattern | `{ success, data/error }` em caktoService |
| Lock distribuido | Usar `withLock('reconciliation', 900, fn)` - 15 min TTL |
| Logger com prefixo | `[membership:reconciliation]` para todos os logs |
| Rate limiting | Maximo 10 req/s para API externa |
| Erro handling | Retry 3x com backoff, depois marca como falha |
| Alerta consolidado | Agrupar multiplas dessincronizacoes em 1 alerta |

### caktoService.js - Estrutura Obrigatoria

```javascript
// bot/services/caktoService.js
const axios = require('axios');
const logger = require('../../lib/logger');

const CAKTO_API_URL = process.env.CAKTO_API_URL;
const CAKTO_CLIENT_ID = process.env.CAKTO_CLIENT_ID;
const CAKTO_CLIENT_SECRET = process.env.CAKTO_CLIENT_SECRET;

const API_TIMEOUT_MS = 10000; // 10 segundos
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

let accessToken = null;
let tokenExpiresAt = null;

/**
 * Sleep utility for retry delays
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get OAuth access token (cached)
 * @returns {Promise<{success: boolean, data?: {token}, error?: object}>}
 */
async function getAccessToken() {
  // Se token valido, retorna do cache
  if (accessToken && tokenExpiresAt > Date.now()) {
    return { success: true, data: { token: accessToken } };
  }

  try {
    const response = await axios.post(`${CAKTO_API_URL}/oauth/token`, {
      grant_type: 'client_credentials',
      client_id: CAKTO_CLIENT_ID,
      client_secret: CAKTO_CLIENT_SECRET
    }, { timeout: API_TIMEOUT_MS });

    accessToken = response.data.access_token;
    // Expira 60s antes para margem de seguranca
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000) - 60000;

    logger.info('[caktoService] getAccessToken: token refreshed', {
      expiresIn: response.data.expires_in
    });

    return { success: true, data: { token: accessToken } };
  } catch (err) {
    logger.error('[caktoService] getAccessToken: failed', { error: err.message });
    return { success: false, error: { code: 'CAKTO_AUTH_ERROR', message: err.message } };
  }
}

/**
 * Get subscription details from Cakto API (single attempt)
 * @param {string} subscriptionId - Cakto subscription ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getSubscriptionOnce(subscriptionId) {
  const tokenResult = await getAccessToken();
  if (!tokenResult.success) {
    return tokenResult;
  }

  try {
    const response = await axios.get(
      `${CAKTO_API_URL}/subscriptions/${subscriptionId}`,
      {
        headers: { Authorization: `Bearer ${tokenResult.data.token}` },
        timeout: API_TIMEOUT_MS
      }
    );

    logger.debug('[caktoService] getSubscription: success', { subscriptionId });
    return { success: true, data: response.data };
  } catch (err) {
    // 404 = assinatura nao encontrada (nao fazer retry)
    if (err.response?.status === 404) {
      logger.warn('[caktoService] getSubscription: not found', { subscriptionId });
      return { success: false, error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'Subscription not found in Cakto' } };
    }

    logger.error('[caktoService] getSubscription: failed', { subscriptionId, error: err.message });
    return { success: false, error: { code: 'CAKTO_API_ERROR', message: err.message } };
  }
}

/**
 * Get subscription with retry and exponential backoff
 * @param {string} subscriptionId - Cakto subscription ID
 * @returns {Promise<{success: boolean, data?: object, error?: object}>}
 */
async function getSubscription(subscriptionId) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await getSubscriptionOnce(subscriptionId);

    // Sucesso ou erro definitivo (404) - nao fazer retry
    if (result.success || result.error?.code === 'SUBSCRIPTION_NOT_FOUND') {
      return result;
    }

    // Erro transiente - fazer retry com backoff
    if (attempt < MAX_RETRIES - 1) {
      const delay = RETRY_DELAYS[attempt];
      logger.warn('[caktoService] getSubscription: retry', {
        subscriptionId,
        attempt: attempt + 1,
        delayMs: delay
      });
      await sleep(delay);
    }
  }

  logger.error('[caktoService] getSubscription: max retries exceeded', { subscriptionId });
  return { success: false, error: { code: 'CAKTO_API_ERROR', message: 'Max retries exceeded' } };
}

module.exports = {
  getAccessToken,
  getSubscription,
};
```

### Mapeamento de Status Cakto -> Dessincronizado

| Local | Cakto | Dessincronizado? | Acao Sugerida |
|-------|-------|------------------|---------------|
| ativo | active | Nao | - |
| ativo | canceled | SIM | Verificar se deve remover membro |
| ativo | cancelled | SIM | Verificar se deve remover membro |
| ativo | expired | SIM | Verificar pagamento pendente |
| ativo | defaulted | SIM | Verificar cobranca |
| ativo | suspended | SIM | Verificar cobranca |
| ativo | NOT_FOUND | SIM | Assinatura nao existe - verificar se deve remover |
| trial | * | Ignorar | Trial nao tem assinatura validada |

```javascript
/**
 * Check if member is desynchronized with Cakto
 * @param {string} localStatus - Member status in Supabase
 * @param {string} caktoStatus - Subscription status from Cakto
 * @returns {{desync: boolean, action: string}}
 */
function isDesynchronized(localStatus, caktoStatus) {
  // Trial members are ignored (no subscription yet)
  if (localStatus === 'trial') {
    return { desync: false, action: null };
  }

  // Active member should have active subscription
  if (localStatus === 'ativo') {
    const badStatuses = ['canceled', 'cancelled', 'expired', 'defaulted', 'suspended'];
    if (badStatuses.includes(caktoStatus?.toLowerCase())) {
      return {
        desync: true,
        action: caktoStatus === 'canceled' || caktoStatus === 'cancelled'
          ? 'Verificar se deve remover membro'
          : 'Verificar pagamento/cobranca'
      };
    }
  }

  return { desync: false, action: null };
}
```

### Formato do Alerta de Dessincronizacao

```
*DESSINCRONIZACAO DETECTADA*

Job: Reconciliacao 03:00 BRT
Data: DD/MM/YYYY

*X membros com estado divergente:*

@user1 (123456789)
   Local: ativo | Cakto: canceled
   Acao: Verificar se deve remover

@user2 (987654321)
   Local: ativo | Cakto: expired
   Acao: Verificar pagamento

---
Acao: Verificacao manual necessaria
```

### Formato do Alerta de Falha Critica

```
*FALHA CRITICA - RECONCILIACAO*

Job: Reconciliacao 03:00 BRT
Data: DD/MM/YYYY

*API Cakto indisponivel*

Verificados: X
Falhas: Y (Z%)

Erro mais comum: TIMEOUT

Acao: Verificar status da API Cakto
```

### Job reconciliation.js - Estrutura Completa

```javascript
// bot/jobs/membership/reconciliation.js
const logger = require('../../../lib/logger');
const { withLock } = require('../../../lib/lock');
const { alertAdmin } = require('../../services/alertService');
const { getMembersForReconciliation } = require('../../services/memberService');
const { getSubscription } = require('../../services/caktoService');

const JOB_NAME = 'membership:reconciliation';
const LOCK_TTL_SECONDS = 900; // 15 minutos
const RATE_LIMIT_MS = 100; // 10 req/s
const PROGRESS_LOG_INTERVAL = 100; // Log a cada 100 membros

/**
 * Sleep utility for rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if member is desynchronized with Cakto
 * @param {string} localStatus - Member status in Supabase
 * @param {string} caktoStatus - Subscription status from Cakto
 * @returns {{desync: boolean, action: string|null}}
 */
function isDesynchronized(localStatus, caktoStatus) {
  // Trial members are ignored (no subscription yet)
  if (localStatus === 'trial') {
    return { desync: false, action: null };
  }

  // Active member should have active subscription
  if (localStatus === 'ativo') {
    const badStatuses = ['canceled', 'cancelled', 'expired', 'defaulted', 'suspended'];
    if (badStatuses.includes(caktoStatus?.toLowerCase())) {
      return {
        desync: true,
        action: caktoStatus === 'canceled' || caktoStatus === 'cancelled'
          ? 'Verificar se deve remover membro'
          : 'Verificar pagamento/cobranca'
      };
    }
  }

  return { desync: false, action: null };
}

/**
 * Format and send desync alert to admin group
 * @param {Array} members - Desynchronized members with caktoStatus and suggestedAction
 */
async function sendDesyncAlert(members) {
  const today = new Date().toLocaleDateString('pt-BR');
  const lines = members.map(m =>
    `@${m.telegram_username || 'sem_username'} (${m.telegram_id})\n   Local: ${m.status} | Cakto: ${m.caktoStatus}\n   Acao: ${m.suggestedAction}`
  );

  const message = `*DESSINCRONIZACAO DETECTADA*

Job: Reconciliacao 03:00 BRT
Data: ${today}

*${members.length} membro(s) com estado divergente:*

${lines.join('\n\n')}

---
Acao: Verificacao manual necessaria`;

  await alertAdmin(message);
  logger.info(`[${JOB_NAME}] Alerta de dessincronizacao enviado`, { count: members.length });
}

/**
 * Format and send critical failure alert
 * @param {object} stats - Job statistics
 * @param {Array} errors - Error details
 */
async function sendCriticalFailureAlert(stats, errors) {
  const today = new Date().toLocaleDateString('pt-BR');
  const failureRate = ((stats.failed / stats.total) * 100).toFixed(1);

  // Agregar erros por tipo
  const errorCounts = errors.reduce((acc, e) => {
    acc[e.error] = (acc[e.error] || 0) + 1;
    return acc;
  }, {});

  const topErrors = Object.entries(errorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, count]) => `${code}: ${count}`)
    .join(', ');

  const message = `*FALHA CRITICA - RECONCILIACAO*

Job: Reconciliacao 03:00 BRT
Data: ${today}

*API Cakto com problemas*

Verificados: ${stats.total}
Falhas: ${stats.failed} (${failureRate}%)
Sincronizados: ${stats.synced}

Erros mais frequentes: ${topErrors || 'N/A'}

Acao: Verificar status da API Cakto`;

  await alertAdmin(message);
  logger.error(`[${JOB_NAME}] Alerta critico enviado`, { failureRate, topErrors });
}

/**
 * Run reconciliation job
 * Compares local member status with Cakto subscription status
 */
async function runReconciliation() {
  const startTime = Date.now();
  logger.info(`[${JOB_NAME}] Iniciando reconciliacao`);

  const result = await withLock('reconciliation', LOCK_TTL_SECONDS, async () => {
    const stats = {
      total: 0,
      synced: 0,
      desynced: 0,
      failed: 0,
    };
    const desyncedMembers = [];
    const errors = [];

    // 1. Buscar membros para verificar
    const membersResult = await getMembersForReconciliation();
    if (!membersResult.success) {
      logger.error(`[${JOB_NAME}] Falha ao buscar membros`, { error: membersResult.error });
      return { error: membersResult.error };
    }

    const members = membersResult.data;
    stats.total = members.length;

    logger.info(`[${JOB_NAME}] Verificando ${stats.total} membros`);

    // 2. Verificar cada membro com rate limiting
    for (let i = 0; i < members.length; i++) {
      const member = members[i];

      // Progress logging
      if ((i + 1) % PROGRESS_LOG_INTERVAL === 0) {
        logger.info(`[${JOB_NAME}] Progresso: ${i + 1}/${stats.total}`);
      }

      // Rate limiting
      await sleep(RATE_LIMIT_MS);

      const caktoResult = await getSubscription(member.cakto_subscription_id);

      // Tratar SUBSCRIPTION_NOT_FOUND como dessincronizacao
      if (!caktoResult.success) {
        if (caktoResult.error?.code === 'SUBSCRIPTION_NOT_FOUND') {
          // Assinatura deletada no Cakto = dessincronizacao
          stats.desynced++;
          desyncedMembers.push({
            ...member,
            caktoStatus: 'NOT_FOUND',
            suggestedAction: 'Assinatura nao existe no Cakto - verificar se deve remover'
          });
        } else {
          // Erro de API
          stats.failed++;
          errors.push({ memberId: member.id, error: caktoResult.error.code });
        }
        continue;
      }

      // 3. Comparar status
      const caktoStatus = caktoResult.data.status;
      const { desync, action } = isDesynchronized(member.status, caktoStatus);

      if (desync) {
        stats.desynced++;
        desyncedMembers.push({
          ...member,
          caktoStatus,
          suggestedAction: action
        });
      } else {
        stats.synced++;
      }
    }

    // 4. Enviar alertas se necessario (sucesso silencioso se tudo OK)
    if (desyncedMembers.length > 0) {
      await sendDesyncAlert(desyncedMembers);
    }

    // 5. Alerta critico se muitas falhas (> 50%)
    const failureRate = stats.total > 0 ? (stats.failed / stats.total) * 100 : 0;
    if (failureRate > 50) {
      await sendCriticalFailureAlert(stats, errors);
    }

    return stats;
  });

  if (result === null) {
    logger.warn(`[${JOB_NAME}] Lock nao adquirido, pulando`);
    return;
  }

  const duration = Date.now() - startTime;
  logger.info(`[${JOB_NAME}] Concluido`, { ...result, durationMs: duration });
}

module.exports = { runReconciliation, isDesynchronized };
```

### Atualizacao em server.js

```javascript
// Adicionar no schedule de crons em bot/server.js

const { runReconciliation } = require('./jobs/membership/reconciliation');

// 03:00 BRT - Reconciliacao com Cakto
cron.schedule('0 3 * * *', async () => {
  logger.info('[server] Cron: reconciliation');
  await runReconciliation();
}, { timezone: 'America/Sao_Paulo' });
```

### Funcao getMembersForReconciliation em memberService.js

```javascript
/**
 * Get members that need reconciliation with Cakto
 * Story 16.8: Members with subscription that need status verification
 * @returns {Promise<{success: boolean, data?: array, error?: object}>}
 */
async function getMembersForReconciliation() {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('id, telegram_id, telegram_username, email, status, cakto_subscription_id')
      .in('status', ['ativo', 'trial'])
      .not('cakto_subscription_id', 'is', null);

    if (error) {
      logger.error('[memberService] getMembersForReconciliation: database error', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    // Filtrar trials - so verificamos ativos com subscription
    const toVerify = data.filter(m => m.status === 'ativo');

    logger.info('[memberService] getMembersForReconciliation: found members', {
      total: data.length,
      toVerify: toVerify.length
    });

    return { success: true, data: toVerify };
  } catch (err) {
    logger.error('[memberService] getMembersForReconciliation: unexpected error', { error: err.message });
    return { success: false, error: { code: 'UNEXPECTED_ERROR', message: err.message } };
  }
}
```

---

## Project Structure Notes

**Arquivos a CRIAR:**
```
bot/
├── services/
│   └── caktoService.js          # NOVO - Integracao API Cakto
└── jobs/
    └── membership/
        └── reconciliation.js     # NOVO - Job de reconciliacao
```

**Arquivos a ATUALIZAR:**
```
bot/
├── server.js                     # Adicionar cron 03:00 BRT
└── services/
    └── memberService.js          # Adicionar getMembersForReconciliation()
```

---

## Previous Story Intelligence

### Story 16.7 (Comandos Admin)
- **371 testes passando** (27 novos)
- `getMemberDetails()` implementado - reutilizar pattern
- `alertAdmin()` ja disponivel para alertas
- `appendToNotes()` disponivel para auditoria

### Story 16.6 (Remocao Automatica)
- `kickMemberFromGroup()` disponivel se necessario remover
- Pattern de lock distribuido funcionando
- **343 testes passando**

### Story 16.3 (Processamento Webhooks)
- `webhookProcessors.js` mostra pattern de handlers
- `getMemberByEmail()` disponivel
- `extractSubscriptionData()` pode ser reutilizado

### Git Intelligence (Commits Recentes)
```
13d2fc0 feat(membership): implement admin commands (Story 16.7)
c644156 feat(membership): implement automatic removal (Story 16.6)
75836df feat(membership): implement billing notifications (Story 16.5)
d1e0a7f feat(membership): implement member entry detection (Story 16.4)
bea0df4 feat(membership): implement async webhook processing (Story 16.3)
```

---

## Architecture References

### ADR-002: Fonte de Verdade do Estado do Membro

```
Cakto (informante) ──webhook──► Supabase (master) ──action──► Telegram (executor)
                                      │
                                      ▼
                               Reconciliacao diaria
                                      │
                                      ▼
                               Alertas admin se divergir
```

**Regra CRITICA:** NAO corrigir automaticamente. Apenas alertar admin para revisao manual.

### ADR-003: Arquitetura de Jobs de Membros

| Job | Horario | Lock TTL | Status |
|-----|---------|----------|--------|
| trial-reminders | 09:00 BRT | 5min | ✅ Implementado |
| kick-expired | 00:01 BRT | 10min | ✅ Implementado |
| renewal-reminders | 10:00 BRT | 5min | ✅ Implementado |
| process-webhooks | */30s | 1min | ✅ Implementado |
| **reconciliation** | **03:00 BRT** | **in-memory** | **✅ Implementado** |

### Member State Machine

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

---

## Environment Variables Necessarias

```bash
# Cakto API (ja devem existir)
CAKTO_API_URL=https://api.cakto.com.br
CAKTO_CLIENT_ID=xxx
CAKTO_CLIENT_SECRET=xxx
CAKTO_WEBHOOK_SECRET=xxx  # Para webhooks - ja configurado

# Telegram (ja existem)
TELEGRAM_ADMIN_GROUP_ID=-100xxxxxxxxxx
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
  getMemberStats,
  MEMBER_STATUSES,
  VALID_TRANSITIONS,
} = require('./memberService');
```

### bot/services/alertService.js
```javascript
const { alertAdmin } = require('./alertService');
// Enviar alerta ao grupo admin
await alertAdmin('Mensagem de alerta');
```

### lib/lock.js
```javascript
const { withLock } = require('../lib/lock');
// Executar funcao com lock distribuido
const result = await withLock('job-name', ttlSeconds, asyncFn);
```

### lib/config.js
```javascript
const { config } = require('../lib/config');
// config.telegram.adminGroupId
```

---

## Error Codes

| Code | Quando usar |
|------|-------------|
| `CAKTO_AUTH_ERROR` | Falha no OAuth do Cakto |
| `CAKTO_API_ERROR` | Erro generico da API Cakto |
| `SUBSCRIPTION_NOT_FOUND` | Assinatura nao existe no Cakto |
| `DB_ERROR` | Erro de banco de dados |
| `UNEXPECTED_ERROR` | Erro inesperado |

---

## References

- [Source: architecture.md#ADR-002: Fonte de Verdade do Estado do Membro]
- [Source: architecture.md#ADR-003: Arquitetura de Jobs de Membros]
- [Source: project-context.md#Member State Machine]
- [Source: project-context.md#Service Response Pattern]
- [Source: epics.md#Story 16.8]
- [Pattern: bot/jobs/membership/kick-expired.js - Job with lock]
- [Pattern: bot/services/webhookProcessors.js - Service handlers]
- [Pattern: bot/services/alertService.js - Admin alerts]
- [Learnings: 16-7-implementar-comandos-admin-gestao-membros.md]

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- All 410 tests passing (34 new tests added)

### Completion Notes List

1. **caktoService.js** - OAuth client_credentials flow with token caching, retry with exponential backoff (1s/2s/4s), 10s timeout, Service Response Pattern
2. **getMembersForReconciliation()** - Filters active members with cakto_subscription_id, excludes trials
3. **reconciliation.js** - Complete job with isDesynchronized(), sendDesyncAlert(), sendCriticalFailureAlert(), rate limiting (100ms), progress logging
4. **server.js** - Added cron schedule for 03:00 BRT
5. **Tests** - 13 tests for caktoService, 5 tests for getMembersForReconciliation, 21 tests for reconciliation job

### File List

**Created:**
- `bot/services/caktoService.js` (134 lines)
- `bot/jobs/membership/reconciliation.js` (252 lines)
- `__tests__/services/caktoService.test.js` (152 lines)
- `__tests__/jobs/membership/reconciliation.test.js` (213 lines)

**Modified:**
- `bot/services/memberService.js` - Added getMembersForReconciliation()
- `bot/server.js` - Added reconciliation cron at 03:00 BRT
- `__tests__/services/memberService.test.js` - Added 5 tests for getMembersForReconciliation

---

## Code Review Fixes Applied

### Issues Found and Fixed

| ID | Severity | Issue | Fix Applied |
|----|----------|-------|-------------|
| C1 | Critical | No validation of subscriptionId in getSubscription() | Added validation, returns INVALID_SUBSCRIPTION_ID error |
| H1 | High | Inefficient query fetching trials then filtering | Changed to `.eq('status', 'ativo')` directly |
| H2 | High | Missing env var validation | Added module-load validation with console.error |
| H3 | High | No test for concurrent run lock | Added 3 tests for lock mechanism |
| M1 | Medium | Duplicate sleep function | Created `lib/utils.js` with shared sleep() |
| M3 | Medium | Magic string array for bad statuses | Extracted `BAD_CAKTO_STATUSES` constant |
| M4 | Medium | No test for token cache expiration | Added test with Date.now mock |
| L1 | Low | PROGRESS_LOG_INTERVAL not exported | Exported for testing/tuning |
| L2 | Low | Missing JSDoc on _runReconciliationInternal | Added detailed JSDoc |

### Files Modified in Code Review

**Created:**
- `lib/utils.js` - Shared utility functions (sleep)

**Modified:**
- `bot/services/caktoService.js` - C1, H2, M1 fixes
- `bot/services/memberService.js` - H1 fix (changed from .in() to .eq())
- `bot/jobs/membership/reconciliation.js` - M1, M3, L1, L2 fixes
- `__tests__/services/caktoService.test.js` - Added C1 + M4 tests
- `__tests__/services/memberService.test.js` - Updated mocks for H1 fix
- `__tests__/jobs/membership/reconciliation.test.js` - Added H3 lock tests

### Final Test Count

- **416 tests passing** (6 new tests added in code review)

