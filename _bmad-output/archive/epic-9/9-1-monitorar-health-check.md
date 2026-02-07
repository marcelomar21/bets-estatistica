# Story 9.1: Monitorar Health Check

Status: done

## Story

As a sistema,
I want verificar health do sistema periodicamente,
So that detecte problemas proativamente.

## Acceptance Criteria

1. **AC1:** Sistema executa verificação de health a cada 5 minutos ✅
2. **AC2:** Verificação checa conexão com Supabase (BD) ✅
3. **AC3:** Verificação checa se última postagem ocorreu no horário esperado ✅
4. **AC4:** Verificação checa se os jobs críticos estão funcionando ✅
5. **AC5:** Se falha detectada, dispara alerta no grupo admin ✅
6. **AC6:** Status de health é registrado em log ✅

## Tasks / Subtasks

- [x] Task 1: Criar `bot/jobs/healthCheck.js` (AC: #1, #6)
  - [x] 1.1 Criar estrutura básica do job seguindo padrão existente
  - [x] 1.2 Implementar função principal `runHealthCheck()`
  - [x] 1.3 Adicionar logging estruturado com níveis corretos

- [x] Task 2: Implementar verificação de conexão BD (AC: #2)
  - [x] 2.1 Criar função `checkDatabaseConnection()`
  - [x] 2.2 Fazer query simples usando `testConnection()` existente
  - [x] 2.3 Retornar `{ success, latencyMs, error }` seguindo padrão

- [x] Task 3: Implementar verificação de última postagem (AC: #3)
  - [x] 3.1 Criar função `checkLastPosting()`
  - [x] 3.2 Consultar `suggested_bets` para última `telegram_posted_at`
  - [x] 3.3 Comparar com horários esperados (10h, 15h, 22h)
  - [x] 3.4 Retornar warning se postagem não ocorreu no horário esperado

- [x] Task 4: Implementar verificação de jobs (AC: #4)
  - [x] 4.1 Criar função `checkJobsHealth()`
  - [x] 4.2 Verificar se há apostas `pending_link` paradas há muito tempo (> 4h)
  - [x] 4.3 Verificar se há apostas `ready` que deveriam ter sido postadas (> 2h)
  - [x] 4.4 Verificar se tracking está funcionando (apostas `posted` com jogo terminado > 6h)

- [x] Task 5: Integrar alertas (AC: #5)
  - [x] 5.1 Adicionar função `healthCheckAlert()` em `alertService.js`
  - [x] 5.2 Chamar alerta quando qualquer verificação falhar
  - [x] 5.3 Incluir detalhes técnicos e sugestão de ação

- [x] Task 6: Configurar execução
  - [x] 6.1 Adicionar cron job `*/5 * * * *` no scheduler interno (`server.js`)
  - [x] 6.2 Testar execução manual do job

## Dev Notes

### Arquitetura e Padrões

**Localização do arquivo:**
```
bot/jobs/healthCheck.js  # Novo arquivo
```

**Seguir padrões existentes de:**
- `bot/jobs/postBets.js` - estrutura de job
- `bot/jobs/trackResults.js` - verificações periódicas
- `bot/services/alertService.js` - funções de alerta

**Response Pattern obrigatório:**
```javascript
// Sucesso
{ success: true, data: { ... } }

// Erro
{ success: false, error: { code: 'HEALTH_ERROR', message: '...' } }
```

### Verificações de Health

| Check | Query/Verificação | Threshold |
|-------|-------------------|-----------|
| Database | `testConnection()` via Supabase | < 5s |
| Last Post | `telegram_posted_at` mais recente | Deve ter ocorrido no último horário programado |
| Pending Links | Apostas `pending_link` há > 4h | Alerta se > 0 |
| Stuck Ready | Apostas `ready` há > 2h sem postar | Alerta se > 0 |
| Stuck Posted | Apostas `posted` há > 6h após kickoff sem resultado | Alerta se > 0 |

### Formato de Alerta

```javascript
await healthCheckAlert(alerts, hasErrors);
// alerts: [{ severity, check, message, action }]
```

### Project Structure Notes

**Arquivos criados:**
- `bot/jobs/healthCheck.js` - Job principal

**Arquivos modificados:**
- `bot/services/alertService.js` - Adicionado `healthCheckAlert()`
- `bot/server.js` - Adicionado cron job no scheduler interno

**Dependências existentes usadas:**
- `lib/supabase.js` - Acesso ao BD (usando `testConnection()` existente)
- `lib/logger.js` - Logging
- `bot/telegram.js` - Envio de alertas (via alertService)

### Horários de Postagem (Referência)

| Período | Request Links | Post Bets |
|---------|---------------|-----------|
| Manhã | 08:00 | 10:00 |
| Tarde | 13:00 | 15:00 |
| Noite | 20:00 | 22:00 |

O health check às X:05 verifica se a postagem das X:00 ocorreu.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 9.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Decision 3: Error Handling & Fallback]
- [Source: _bmad-output/project-context.md#Critical Implementation Rules]
- [Source: bot/services/alertService.js] - Padrão de alertas
- [Source: bot/jobs/postBets.js] - Padrão de jobs
- [Source: bot/telegram.js#alertAdmin] - Função de alerta

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

- Health check implementado com sucesso
- Job executa a cada 5 minutos via cron interno (node-cron)
- Teste manual executado com sucesso - enviou alerta ao grupo admin (messageId: 114)
- Detectou corretamente warning de última postagem (11h atrás vs esperado às 15:00/22:00)
- Todas as verificações funcionando: DB (latência 1660ms), Last Posting, Jobs Health
- Arquitetura usa scheduler interno devido ao tier gratuito do Render

### Debug Log References

- Teste manual: `node bot/jobs/healthCheck.js`
- Output: `{"success":true,"hasWarnings":true,"alertCount":1,"dbLatencyMs":1660}`

### Change Log

- 2026-01-11: Implementação inicial da Story 9.1 - Health Check
- 2026-01-11: Code review aprovado (4 MED, 4 LOW - nice-to-have)

## Senior Developer Review (AI)

**Review Date:** 2026-01-11
**Outcome:** ✅ APPROVED

**Summary:** Story implementada corretamente. Todos os ACs satisfeitos, todos os tasks completados. Issues encontrados são melhorias nice-to-have, não bloqueantes.

**Issues Found:** 0 High, 4 Medium, 4 Low (deferred)

**Deferred Items:**
- MED-001: Adicionar testes unitários
- MED-002: Melhorar timezone handling
- MED-003: Verificar conexão Telegram
- MED-004: Retry/fallback para alertas
- LOW-001 a LOW-004: Melhorias de código

### File List

- `bot/jobs/healthCheck.js` (criado)
- `bot/services/alertService.js` (modificado - adicionado healthCheckAlert)
- `bot/server.js` (modificado - adicionado cron job)
