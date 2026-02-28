# Story 16-1: Deteccao de Ban e Failover Automatico

Status: ready-for-dev

## Story

As a **sistema**,
I want detectar bans automaticamente e promover numero backup a ativo sem intervencao humana,
So that o grupo WhatsApp continue operando mesmo quando um numero e banido.

## Acceptance Criteria

1. **AC1: Deteccao de ban e desalocacao**
   - Given numero `active` de um grupo perde conexao com codigo 401 (ban)
   - When Baileys emite evento `connection.update` com statusCode 401
   - Then failoverService muda status do numero para `banned`
   - And numero e desalocado do grupo automaticamente

2. **AC2: Promocao de backup a ativo**
   - Given numero ativo foi banido e grupo tem backup disponivel
   - When failover e iniciado pelo failoverService
   - Then primeiro numero `backup` e promovido a `active`
   - And failover completa em menos de 5 minutos

3. **AC3: Alocacao de novo backup do pool**
   - Given backup foi promovido a ativo
   - When promocao e confirmada
   - Then sistema aloca novo numero `available` do pool global como `backup`
   - And se pool nao tem numeros disponiveis, alerta super admin

4. **AC4: Failover em cascata**
   - Given grupo tem 2 backups e ambos falham em sequencia
   - When segundo failover e necessario
   - Then segundo backup e promovido seguindo a mesma logica

## Existing Infrastructure

- **BaileyClient** (`whatsapp/client/baileyClient.js`): Already detects 401 in `_handleConnectionUpdate`, sets number status to `banned` via `_updateNumberStatus('banned')`
- **numberPoolService** (`whatsapp/pool/numberPoolService.js`): Has `handleBan(numberId)` which sets status to `banned`, clears group_id/role. Has `VALID_TRANSITIONS` state machine.
- Missing: **failoverService** that orchestrates the full failover flow (ban → promote backup → allocate new backup)

## Tasks

### Task 1: Create failoverService
- New file: `whatsapp/services/failoverService.js`
- Main function: `handleFailover(numberId, groupId, reason)`
  1. Call `numberPoolService.handleBan(numberId)` to ban the number
  2. Find first backup number for the group: query `whatsapp_numbers` where `group_id = groupId AND role = 'backup'`
  3. Promote backup: update `role = 'active', status = 'active'`
  4. Allocate new backup from pool: query `whatsapp_numbers` where `status = 'available' AND group_id IS NULL`, update `group_id, role = 'backup', status = 'backup'`
  5. If no pool numbers available, alert admin
  6. Register failover event in `member_events` or a new `failover_events` approach
  7. Return result with details

### Task 2: Wire BaileyClient ban detection to failoverService
- In BaileyClient's `_handleConnectionUpdate`, when 401 is detected:
  - Currently calls `_updateNumberStatus('banned')` directly
  - Add call to `failoverService.handleFailover(this.numberId, groupId, 'ban')`
  - Need to resolve the group_id for this number (query `whatsapp_numbers` for `group_id`)

### Task 3: Alert admin on failover
- Use `alertAdmin` service to send Telegram notification when failover occurs
- Include: banned number, group affected, backup promoted, pool status

### Task 4: Tests
- Test happy path: ban → backup promoted → new backup allocated
- Test no backup available: ban → no promotion possible → alert admin
- Test no pool numbers: backup promoted but no replacement → alert admin
- Test cascading failover

## Dev Notes

- numberPoolService.handleBan already handles the status transition and deallocation
- VALID_TRANSITIONS in numberPoolService: `backup → active` is allowed, `available → backup` is allowed
- BaileyClient already handles reconnection for non-ban disconnects (backoff)
- alertAdmin is imported from `bot/services/alertService.js`
