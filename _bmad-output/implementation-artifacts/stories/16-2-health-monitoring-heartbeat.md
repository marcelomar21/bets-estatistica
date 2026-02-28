# Story 16-2: Health Monitoring e Heartbeat

Status: ready-for-dev

## Story

As a **sistema**,
I want monitorar a saude de todos os numeros via heartbeat periodico e alertar sobre problemas,
So that eu detecte falhas de conexao antes que afetem a operacao do grupo.

## Acceptance Criteria

1. **AC1: Heartbeat periodico**
   - Given numeros WhatsApp estao conectados
   - When a cada 60 segundos (NFR5)
   - Then sistema executa heartbeat para cada numero verificando estado da conexao WebSocket
   - And resultado e registrado em `bot_health` (reutilizando tabela existente)

2. **AC2: Reconexao automatica em perda de conexao**
   - Given heartbeat detecta que um numero perdeu conexao SEM ser ban (queda de rede, restart parcial)
   - When conexao esta down mas sem codigo 401
   - Then sistema tenta reconexao automatica com backoff exponencial
   - And alerta e enviado se reconexao falha apos 5 tentativas

3. **AC3: Marcacao unhealthy e failover preventivo**
   - Given numero nao responde ao heartbeat por mais de 3 ciclos consecutivos (3 min)
   - When sistema avalia a situacao
   - Then numero e marcado como `unhealthy` temporariamente
   - And se nao recuperar em 5 min, failover e iniciado como precaucao

## Existing Infrastructure

- **BaileyClient** (`whatsapp/client/baileyClient.js`): Has `_updateHeartbeat()` that writes to `whatsapp_numbers.last_heartbeat`. Called on connection open. Has reconnection logic with backoff already.
- **clientRegistry** (`whatsapp/clientRegistry.js`): `clients` Map holds all active BaileyClient instances.
- **whatsapp/server.js**: Starts all clients, runs Express server. No periodic heartbeat yet.
- **bot_health table**: Existing table with `group_id PK`, `last_heartbeat`, `status` (online/offline), `restart_requested`, `error_message`.
- **failoverService** (`whatsapp/services/failoverService.js`): Has `handleFailover(numberId, groupId, reason)` — can be called with reason='unhealthy'.
- **healthCheck.js** (`bot/jobs/healthCheck.js`): Existing health check job for DB connection. Separate from WhatsApp heartbeat.
- Architecture says: extend `bot_health` with `channel` and `number_id` columns, no new table.

## Tasks

### Task 1: Migration 048 — Extend bot_health for WhatsApp
- ALTER TABLE `bot_health` to:
  - DROP the primary key constraint on `group_id` (since we'll have multiple rows per group)
  - ADD `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - ADD `channel TEXT DEFAULT 'telegram'` — 'telegram' or 'whatsapp'
  - ADD `number_id UUID REFERENCES whatsapp_numbers(id)` — for WhatsApp entries
  - ADD unique constraint on `(group_id, channel, number_id)` to prevent duplicates
  - Make `group_id` nullable (WhatsApp numbers in pool have no group yet)
- Keep RLS policies working (service_role bypasses RLS for bot writes)

### Task 2: Create heartbeatService
- New file: `whatsapp/services/heartbeatService.js`
- Main function: `runHeartbeatCycle()`
  1. Iterate all clients in `clientRegistry.clients`
  2. For each client, check if socket exists and is connected (`client.getStats().connected`)
  3. Update `bot_health` row with heartbeat result (online/offline)
  4. Update `whatsapp_numbers.last_heartbeat` timestamp
  5. Track consecutive failures per number (in-memory Map)
  6. If 3+ consecutive failures (3 min), mark number as `unhealthy` in `whatsapp_numbers`
  7. If 5+ consecutive failures (5 min), trigger `handleFailover(numberId, groupId, 'unhealthy')`
  8. Alert admin on connection loss detection

### Task 3: Wire heartbeat to server startup
- In `whatsapp/server.js`, after `initClients()`, start a `setInterval` running `runHeartbeatCycle()` every 60s
- Clear interval on shutdown

### Task 4: Tests
- Test heartbeat cycle with connected client
- Test heartbeat cycle with disconnected client
- Test consecutive failure tracking and unhealthy marking
- Test failover trigger after 5 consecutive failures
- Test reconnection attempt for disconnected client

## Dev Notes

- BaileyClient already has reconnection logic with backoff — heartbeat should NOT duplicate this. Instead, heartbeat detects if the client is stuck disconnected (not reconnecting).
- `bot_health` needs structural changes since its PK is currently `group_id` and we need per-number rows
- The heartbeat interval should be configurable via `config.whatsapp.heartbeatIntervalMs`
- Use `service_role` key for bot_health writes (bypasses RLS)
