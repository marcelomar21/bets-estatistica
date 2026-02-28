# Story 16-3: Alertas e Painel de Health por Grupo

Status: ready-for-dev

## Story

As a **super admin**,
I want visualizar o health dos numeros WhatsApp no admin panel com heartbeat e timeline de failover,
So that eu tenha visibilidade completa do estado da infraestrutura WhatsApp.

## Acceptance Criteria

1. **AC1: Alertas de ban e failover** (ALREADY DONE in 16-1)
   - Alerta enviado no Telegram admin com detalhes quando failover ocorre

2. **AC2: Alertas de perda de conexao** (ALREADY DONE in 16-2)
   - Alerta de warning enviado quando numero perde conexao via heartbeat

3. **AC3: Health status no admin panel**
   - Given super admin acessa a pagina WhatsApp Pool no admin panel
   - When visualiza a secao de numeros
   - Then ve status visual de health (online/offline) baseado no bot_health
   - And ve ultimo heartbeat de cada numero
   - And ve numeros agrupados por grupo com status consolidado

4. **AC4: Failover events timeline**
   - Given super admin acessa a pagina WhatsApp Pool
   - When ha eventos de failover registrados
   - Then ve timeline com eventos recentes (ban, promote, pool allocation)

## Existing Infrastructure

- **`/whatsapp-pool` page**: Already shows numbers with status, heartbeat, group. Needs health indicators.
- **`/api/whatsapp-pool` route**: Returns whatsapp_numbers with last_heartbeat. Needs health data from bot_health.
- **`bot_health` table**: Extended with channel='whatsapp', number_id columns (Migration 048).
- **Sidebar**: Already has "WhatsApp" nav item pointing to `/whatsapp-pool`.

## Tasks

### Task 1: API — Add health data to whatsapp-pool endpoint
- Modify `/api/whatsapp-pool/route.ts` GET to also fetch bot_health data for each number
- Join bot_health where channel='whatsapp' to get online/offline status
- Return health status alongside number data

### Task 2: UI — Health indicators on WhatsApp pool page
- Add health status badge (online/offline) to each number row
- Add visual indicator for consecutive heartbeat failures
- Color code: green pulse for online, red for offline, yellow for cooldown

### Task 3: UI — Group health summary section
- Group numbers by group_id in the pool page
- Show consolidated health: "Group X: 2/3 numbers online"
- Highlight groups with all numbers offline

### Task 4: Tests
- API test: verify health data is returned
- Component tests: verify health indicators render

## Dev Notes

- Keep it simple: enhance existing page rather than creating new pages
- Alerts (AC1, AC2) are already fully implemented in Stories 16-1 and 16-2
- Focus is on visibility in admin panel
