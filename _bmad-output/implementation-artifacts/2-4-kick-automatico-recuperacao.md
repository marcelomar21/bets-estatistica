# Story 2.4: Kick Automático e Recuperação Pós-Trial

Status: ready-for-dev

## Story

As a **sistema**,
I want remover automaticamente membros cujo trial expirou e oferecer caminho de volta,
So that apenas membros pagantes permaneçam no grupo e os removidos possam se recuperar.

## Acceptance Criteria

1. **Given** `TRIAL_MODE = 'internal'` e um membro tem `trial_started_at` + duração expirados e `status = 'trial'`
   **When** o job `kick-expired` executa
   **Then** remove (kick) o membro do grupo Telegram (FR11)
   **And** atualiza `status` para `removido`
   **And** envia DM: "Seu trial expirou. Quer voltar? [link checkout]" (FR12)
   **And** kick ocorre em até 24h após expiração (NFR-R2)

2. **Given** `TRIAL_MODE = 'mercadopago'`
   **When** o job `kick-expired` executa
   **Then** usa a lógica atual (baseada em status inadimplente do MP) — sem mudança

3. **Given** um membro kickado por trial expirado clica no link de checkout e paga
   **When** o webhook do MP confirma o pagamento
   **Then** sistema atualiza `status` para `ativo` (FR13)
   **And** bot adiciona o membro de volta ao grupo
   **And** fluxo de pagamento existente funciona sem mudanças (NFR-I2)

4. **Given** o job `kick-expired` é executado
   **When** existem múltiplos membros com trial expirado
   **Then** processa todos sequencialmente
   **And** falha em um membro não impede processamento dos demais
   **And** registra execução em `job_executions` com contagem de kicks realizados

5. **Given** um membro está em `status = 'ativo'` (já pagou)
   **When** o job `kick-expired` executa
   **Then** ignora esse membro — não é afetado pelo job de trial

## Tasks / Subtasks

- [ ] Task 1: Adicionar lógica de kick de trial expirado no kick-expired job (AC: #1, #2)
  - [ ] 1.1 No `_runKickExpiredInternal()`, ler `TRIAL_MODE` via `getConfig('TRIAL_MODE', 'mercadopago')`
  - [ ] 1.2 Se `'internal'`: buscar membros com `status = 'trial'` e `trial_ends_at` vencido
  - [ ] 1.3 Criar `getExpiredTrialMembers()` que retorna trial members com trial_ends_at <= NOW()
  - [ ] 1.4 Processar cada membro expirado via `processMemberKick(member, 'trial_expired', groupData)`
  - [ ] 1.5 Se `'mercadopago'`: manter fluxo atual inalterado (processar apenas inadimplentes)
  - [ ] 1.6 Combinar resultados: merged counts from inadimplente + trial_expired kicks

- [ ] Task 2: Criar função getExpiredTrialMembers (AC: #1, #5)
  - [ ] 2.1 Buscar membros com `status = 'trial'` e `trial_ends_at IS NOT NULL`
  - [ ] 2.2 Filtrar onde `trial_ends_at <= NOW()`
  - [ ] 2.3 Aplicar filtro de group_id (multi-tenant) se GROUP_ID configurado
  - [ ] 2.4 Retornar no mesmo formato que `getAllInadimplenteMembers()`

- [ ] Task 3: Adaptar DM de kick para trial expirado (AC: #1)
  - [ ] 3.1 Verificar se `formatFarewellMessage` em notificationService.js aceita motivo (reason)
  - [ ] 3.2 Se não aceita, customizar mensagem para trial expirado com link checkout

- [ ] Task 4: Verificar que recuperação via /start funciona (AC: #3)
  - [ ] 4.1 `handleRemovedMember()` já reativa membros removidos — verificar com trial expired
  - [ ] 4.2 Webhook MP `subscription_cancelled` → `reactivateRemovedMember()` — verificar que funciona
  - [ ] 4.3 Nenhuma mudança necessária se os fluxos existentes já cobrem — apenas documentar

- [ ] Task 5: Escrever testes unitários (AC: #1-#5)
  - [ ] 5.1 Testar: TRIAL_MODE=internal → busca e processa membros com trial expirado
  - [ ] 5.2 Testar: TRIAL_MODE=mercadopago → não processa trials expirados (fluxo original)
  - [ ] 5.3 Testar: membro ativo não é afetado (AC #5)
  - [ ] 5.4 Testar: falha em um membro não bloqueia os demais (AC #4)
  - [ ] 5.5 Testar: getExpiredTrialMembers retorna apenas trials vencidos

- [ ] Task 6: Validação completa
  - [ ] 6.1 `npm test` no admin-panel — todos os testes passam
  - [ ] 6.2 `npm run build` no admin-panel — TypeScript strict OK
  - [ ] 6.3 Testes do bot passam (jest)

## Dev Notes

### Fluxo Atual (TRIAL_MODE = 'mercadopago')

O job `kick-expired.js` só processa membros com `status = 'inadimplente'` (pagamento falhou via MP). Trial expirado é tratado por webhooks do MP (subscription_cancelled).

### Fluxo Novo (TRIAL_MODE = 'internal')

```
_runKickExpiredInternal()
  → getConfig('TRIAL_MODE', 'mercadopago')
  → Se 'internal':
      → getExpiredTrialMembers()
      → Para cada: processMemberKick(member, 'trial_expired', groupData)
  → SEMPRE: getAllInadimplenteMembers() + processar (fluxo existente)
```

### State Machine

```
trial → removido  ✅ (via markMemberAsRemoved)
ativo → NÃO processado pelo job de trial
inadimplente → removido ✅ (fluxo existente)
```

### Funções Existentes que Serão Reutilizadas

| Função | Arquivo | Propósito |
|--------|---------|-----------|
| `getConfig()` | configHelper.js | Ler TRIAL_MODE |
| `processMemberKick()` | kick-expired.js:233 | Kick + DM + mark as removed |
| `getAllInadimplenteMembers()` | kick-expired.js:89 | Fluxo existente (mantido) |
| `kickMemberFromGroup()` | memberService.js:1035 | Ban temporário 24h no Telegram |
| `markMemberAsRemoved()` | memberService.js:1082 | Atualizar status → removido |
| `handleRemovedMember()` | startCommand.js:287 | Recuperação via /start (24h window) |

### Scheduling e Logging

O job já roda diariamente às 00:01 BRT via cron no `server.js` e já usa `withExecutionLogging('kick-expired')`. Nenhuma mudança no scheduler necessária.

### Recuperação (AC #3)

Já implementada em Stories anteriores:
- `/start` com status `removido` → `handleRemovedMember()` → `canRejoinGroup()` → `reactivateMember()` → unban + invite
- Webhook MP com pagamento → `reactivateRemovedMember()` → status = 'ativo'

### Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `bot/jobs/membership/kick-expired.js` | MODIFICAR (adicionar TRIAL_MODE check + getExpiredTrialMembers) |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.4] — AC
- [Source: bot/jobs/membership/kick-expired.js] — Main modification target
- [Source: bot/services/memberService.js#kickMemberFromGroup] — Telegram kick
- [Source: bot/services/memberService.js#markMemberAsRemoved] — DB status update
- [Source: bot/handlers/startCommand.js#handleRemovedMember] — Recovery path

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
