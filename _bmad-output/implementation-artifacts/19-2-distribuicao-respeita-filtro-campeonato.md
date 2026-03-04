# Story 19.2: Distribuição Respeita Filtro de Campeonato

Status: ready-for-dev

## Story

As a sistema (job de distribuição),
I want filtrar as apostas por campeonato antes de distribuir para cada grupo,
So that cada grupo receba apenas apostas dos campeonatos que configurou.

## Acceptance Criteria

1. **Given** grupo tem preferências de campeonato configuradas (alguns desativados)
   **When** job `distribute-bets` executa
   **Then** apostas de campeonatos desativados NÃO são distribuídas para aquele grupo
   **And** apostas de campeonatos ativados são distribuídas normalmente

2. **Given** grupo recebe apostas de Brasileirão, Premier League e La Liga
   **When** super admin desativa "La Liga" para esse grupo
   **Then** próxima distribuição envia apenas Brasileirão e Premier League
   **And** La Liga continua sendo distribuída normalmente para outros grupos que a têm ativada

3. **Given** aposta é de um campeonato novo (nunca visto antes)
   **When** distribuição é executada
   **Then** campeonato novo é tratado como "ativado" por padrão (se grupo não tem preferência explícita)

4. **Given** preferências de liga mudam para um grupo
   **When** próximo ciclo de distribuição executa
   **Then** apenas apostas NÃO-POSTADAS e NÃO-DISTRIBUÍDAS são afetadas (apostas já distribuídas permanecem)

5. **Given** grupo não tem nenhuma preferência configurada (tabela vazia para aquele group_id)
   **When** distribuição é executada
   **Then** grupo recebe TODAS as apostas — comportamento atual mantido (retrocompatível)

## Tasks / Subtasks

- [ ] Task 1: Modify `getUndistributedBets()` to include league_name (AC: all)
  - [ ] 1.1: Add join to `league_seasons` via `league_matches.season_id` to get `league_name`
  - [ ] 1.2: Return `league_name` in each bet object for per-group filtering

- [ ] Task 2: Load group league preferences (AC: #1, #2, #3, #5)
  - [ ] 2.1: Create `getGroupLeaguePreferences(groupId)` function
  - [ ] 2.2: Returns Map<league_name, enabled> for the group
  - [ ] 2.3: Empty map means "accept all" (retrocompatible)

- [ ] Task 3: Per-group filtering in distribution (AC: #1, #2, #3, #4, #5)
  - [ ] 3.1: Before `distributeRoundRobin()`, filter bets per group based on preferences
  - [ ] 3.2: Restructure: instead of 1 round-robin, do per-group assignment
  - [ ] 3.3: For each group, filter bets: exclude bets where `league_name` has `enabled=false`
  - [ ] 3.4: If group has no preferences → no filtering (all bets eligible)
  - [ ] 3.5: If bet's `league_name` not in preferences → treat as enabled (new league)

- [ ] Task 4: Unit tests (AC: all)
  - [ ] 4.1: Test distributeRoundRobin with league filter — disabled leagues excluded
  - [ ] 4.2: Test no preferences → all bets distributed (retrocompatible)
  - [ ] 4.3: Test new/unknown league → treated as enabled
  - [ ] 4.4: Test multi-group: group A blocks La Liga, group B allows all → La Liga goes only to B

## Dev Notes

### Context & Existing Infrastructure

**Current distribution flow (`bot/jobs/distributeBets.js`):**
1. `getActiveGroups()` → list of active groups
2. `rebalanceIfNeeded(groups)` → undistribute non-posted bets if new group added
3. `getUndistributedBets()` → bets with `elegibilidade='elegivel'`, `group_id IS NULL`, `distributed_at IS NULL`, `bet_status != 'posted'`, kickoff today/tomorrow
4. `getGroupBetCounts()` → existing distribution counts
5. `distributeRoundRobin(bets, groups, groupCounts)` → flat round-robin: ALL bets to ALL groups
6. `assignBetToGroup(betId, groupId, postAt)` → update bet with group_id

**Key observation:** Current round-robin is GROUP-agnostic — it assigns bets sequentially to whichever group has fewest. It does NOT consider which bets are eligible for which groups.

**Schema chain for league_name:**
```
suggested_bets.match_id → league_matches.match_id
league_matches.season_id → league_seasons.season_id
league_seasons.league_name ← this is what we filter on
```

**Current `getUndistributedBets()` query:**
```js
.select('id, match_id, elegibilidade, group_id, distributed_at, bet_status, league_matches!inner(kickoff_time)')
```
Need to expand inner join to include: `league_matches!inner(kickoff_time, league_seasons!inner(league_name))`

### Implementation Approach

**Strategy: Per-group eligible bets → per-group round-robin**

The current flat round-robin (`distributeRoundRobin(allBets, allGroups)`) can't work when different groups are eligible for different bets. We need:

1. **Fetch all undistributed bets WITH league_name** (Task 1)
2. **Fetch all group preferences** (Task 2)
3. **For each group, determine eligible bets** (Task 3)
4. **New distribution logic:**
   - Sort bets by kickoff_time (existing)
   - For each bet, find eligible groups (groups that haven't disabled this bet's league)
   - Among eligible groups, pick the one with fewest bets (round-robin)
   - Assign bet to that group

This is essentially changing from "round-robin across all bets" to "per-bet: pick best eligible group".

**Algorithm change in `runDistributeBets()`:**
```
Before: assignments = distributeRoundRobin(bets, groups, groupCounts)
After:
  1. Load preferences for ALL groups
  2. For each bet:
     a. Get bet's league_name
     b. Filter groups to those eligible for this league
     c. Among eligible groups, pick group with fewest bets
     d. Create assignment
```

**CRITICAL**: Do NOT change the `getUndistributedBets()` filter — it still returns ALL undistributed bets. The per-group filtering happens at assignment time. This means a bet might NOT be assigned to any group if ALL groups have disabled its league — that's correct behavior (it stays unassigned).

### Key Files

| File | Action | Description |
|------|--------|-------------|
| `bot/jobs/distributeBets.js` | **MODIFY** | Add league_name to query, per-group filtering logic |
| `bot/jobs/__tests__/distributeBets.test.js` | **CREATE** | Unit tests for league-filtered distribution |

### Architecture Compliance

- Pure function `distributeRoundRobin` refactored to `distributeWithLeagueFilter` — still testable ✅
- No API changes — this is backend job logic only ✅
- Retrocompatible: no preferences = all bets (existing behavior) ✅
- Uses supabase service role (bot context, not admin-panel RLS) ✅

### Testing Strategy

- Vitest unit tests for the pure distribution logic
- Integration: manually run distribute job and verify bets are filtered per group preferences set in Story 19-1

### References

- [Source: bot/jobs/distributeBets.js] — Current distribution job
- [Source: sql/migrations/049_group_league_preferences.sql] — Preferences table
- [Source: admin-panel/src/app/api/groups/[groupId]/leagues/route.ts] — API created in Story 19-1
