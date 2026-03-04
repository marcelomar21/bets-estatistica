# Story 19.1: Tabela de Preferências de Campeonato e API

Status: done

## Story

As a admin (super_admin ou group_admin),
I want configurar quais campeonatos meu grupo recebe na distribuição,
So that cada grupo receba apenas apostas dos campeonatos relevantes para seu público.

## Acceptance Criteria

1. **Given** admin acessa as configurações de um grupo no admin panel
   **When** visualiza a seção de campeonatos/ligas
   **Then** vê lista de todos os campeonatos disponíveis (de `league_seasons` com `active = true`)
   **And** cada campeonato tem um toggle on/off (default: on se não há registro)

2. **Given** admin desativa um campeonato para um grupo
   **When** salva a configuração
   **Then** registro é criado/atualizado em `group_league_preferences` com `enabled = false`
   **And** próximas distribuições respeitam essa configuração

3. **Given** um grupo não tem nenhuma preferência configurada (tabela vazia para aquele group_id)
   **When** distribuição é executada
   **Then** grupo recebe TODAS as apostas — comportamento atual mantido (retrocompatível)

4. **Given** group_admin acessa as preferências de campeonato
   **When** visualiza e modifica os toggles
   **Then** vê e edita apenas as preferências do seu próprio grupo (RLS enforced)

## Tasks / Subtasks

- [ ] Task 1: Migration — Criar tabela `group_league_preferences` + RLS (AC: #1, #3, #4)
  - [ ] 1.1: Criar `sql/migrations/049_group_league_preferences.sql`
  - [ ] 1.2: Tabela: `id SERIAL PK, group_id UUID FK→groups NOT NULL, league_name TEXT NOT NULL, enabled BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(group_id, league_name)`
  - [ ] 1.3: RLS: super_admin ALL, group_admin ALL WHERE group_id = own group
  - [ ] 1.4: Aplicar migration via Supabase Management API
- [ ] Task 2: API — GET/PUT `/api/groups/[groupId]/leagues` (AC: #1, #2, #4)
  - [ ] 2.1: GET retorna: { leagues: [{league_name, country, enabled}] } — merge de `league_seasons` (active=true) com `group_league_preferences` para o grupo. Se não há registro → `enabled = true` (default)
  - [ ] 2.2: PUT aceita: { leagues: [{league_name, enabled}] } — upsert em `group_league_preferences` (insert on conflict update enabled)
  - [ ] 2.3: Ambos endpoints acessíveis por super_admin e group_admin (com group isolation via groupFilter)
  - [ ] 2.4: Seguir padrão `createApiHandler` + `{ success, data/error }` response
- [ ] Task 3: UI — Seção de campeonatos na página de detalhes do grupo (AC: #1, #2)
  - [ ] 3.1: Criar componente `LeaguePreferences` com lista de ligas e toggles
  - [ ] 3.2: Integrar na página de detalhes do grupo `/groups/[groupId]` ou criar sub-rota `/groups/[groupId]/leagues`
  - [ ] 3.3: Agrupar ligas por país para melhor UX
  - [ ] 3.4: Mostrar indicador de quantas ligas ativas vs total
  - [ ] 3.5: Botão "Salvar" que faz PUT no endpoint
- [ ] Task 4: Testes unitários (AC: #1, #2, #3, #4)
  - [ ] 4.1: Test GET /api/groups/[id]/leagues — retorna ligas merged com preferências
  - [ ] 4.2: Test GET — grupo sem preferências retorna todas enabled=true
  - [ ] 4.3: Test PUT — upsert funciona (cria e atualiza)
  - [ ] 4.4: Test PUT — group_admin só acessa seu grupo (403 para outro)
  - [ ] 4.5: Test GET — group_admin só acessa seu grupo (403 para outro)

## Dev Notes

### Context & Existing Infrastructure

**Distribuição atual (sem filtro de campeonato):**
- Job `bot/jobs/distributeBets.js` → `getUndistributedBets()` seleciona apostas com `elegibilidade='elegivel'`, `group_id IS NULL`, `distributed_at IS NULL`, `bet_status != 'posted'`, kickoff_time hoje/amanhã
- Round-robin distribui igualmente para todos os grupos ativos
- **NÃO** há filtro por liga/campeonato — isso será adicionado na Story 19.2

**Tabelas relevantes:**
- `league_seasons`: `season_id` (UNIQUE), `league_name` (TEXT), `country` (TEXT), `active` (BOOLEAN)
- `league_matches`: `match_id` (UNIQUE), `season_id` (FK→league_seasons), `kickoff_time`
- `suggested_bets`: `match_id` (FK→league_matches), `group_id` (FK→groups, nullable)
- `groups`: `id` (UUID PK), `name`, `status`, etc.

**Ligas disponíveis no sistema (TARGET_LEAGUES em syncSeasons.js):**
- Europa: La Liga, Premier League, Serie A, Bundesliga, Ligue 1, Champions League, Europa League
- Brasil: Serie A, Mineiro 1, Carioca 1, Paulista A1, Paranaense 1, Copa do Nordeste
- South America: Copa Libertadores

**Padrão de sub-rota de grupo existente:**
- `/api/groups/[groupId]/tone/route.ts` — GET/PUT com `ToneRouteContext = { params: Promise<{ groupId: string }> }`
- Acesso: `allowedRoles: ['super_admin', 'group_admin']`
- Group admin isolation: `if (role === 'group_admin' && groupFilter !== groupId) → 403`

### Implementation Approach

**Migration (Task 1):**

```sql
CREATE TABLE IF NOT EXISTS group_league_preferences (
  id SERIAL PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  league_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, league_name)
);

CREATE INDEX idx_group_league_prefs_group ON group_league_preferences(group_id);
CREATE INDEX idx_group_league_prefs_league ON group_league_preferences(league_name);

ALTER TABLE group_league_preferences ENABLE ROW LEVEL SECURITY;

-- super_admin: full access
CREATE POLICY group_league_prefs_super_admin ON group_league_preferences
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- group_admin: own group only
CREATE POLICY group_league_prefs_group_admin ON group_league_preferences
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'group_admin' AND group_id = group_league_preferences.group_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role = 'group_admin' AND group_id = group_league_preferences.group_id)
  );
```

**API (Task 2):**

GET `/api/groups/[groupId]/leagues`:
1. Query `league_seasons` com `active = true` → lista de ligas disponíveis
2. Query `group_league_preferences` onde `group_id = groupId` → preferências existentes
3. Merge: para cada liga, se tem preferência → usar `enabled` dela, senão → `true` (default)
4. Retornar `{ success: true, data: { leagues: [...] } }`

PUT `/api/groups/[groupId]/leagues`:
1. Receber `{ leagues: [{ league_name: string, enabled: boolean }] }`
2. Para cada item, upsert em `group_league_preferences`:
   ```sql
   INSERT INTO group_league_preferences (group_id, league_name, enabled)
   VALUES ($1, $2, $3)
   ON CONFLICT (group_id, league_name) DO UPDATE SET enabled = EXCLUDED.enabled
   ```
3. Usar service role client (`getSupabaseAdmin`) para upsert — RLS do context.supabase complica batch operations
   ALTERNATIVA: usar `context.supabase` com upsert individual (respeita RLS naturalmente) — PREFERIR esta abordagem

**CRITICAL**: Usar `context.supabase` (RLS) para queries, NÃO service role. O RLS já protege por grupo. Service role só se necessário para upsert batch.

**UI (Task 3):**
- Seguir padrão do `/groups/[groupId]/tone/page.tsx` — página dedicada
- Criar `/groups/[groupId]/leagues/page.tsx`
- Componente com lista de ligas agrupadas por país
- Toggle switch para cada liga
- Botão "Salvar Preferências"
- Adicionar link "Campeonatos" na página de detalhes do grupo (`/groups/[groupId]/page.tsx`)

### Key Files

| File | Action | Description |
|------|--------|-------------|
| `sql/migrations/049_group_league_preferences.sql` | **CREATE** | Tabela + RLS + indexes |
| `admin-panel/src/app/api/groups/[groupId]/leagues/route.ts` | **CREATE** | GET + PUT league preferences |
| `admin-panel/src/app/(auth)/groups/[groupId]/leagues/page.tsx` | **CREATE** | League preferences page |
| `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx` | **MODIFY** | Adicionar link para leagues |
| `admin-panel/src/app/api/__tests__/group-leagues.test.ts` | **CREATE** | 5+ testes |

### Architecture Compliance

- Pattern `{ success, data/error }` response — MUST follow ✅
- `createApiHandler` wrapper — MUST use for all API routes ✅
- RLS enforcement via `context.supabase` (NOT service role) ✅
- Multi-tenant: group_admin isolation via `groupFilter` check ✅
- Zod validation para PUT body ✅
- Seguir padrão de `/api/groups/[groupId]/tone/route.ts` como referência ✅

### Testing Strategy

- Vitest para API routes (mock supabase)
- Playwright E2E: navegar até /groups/[id]/leagues, verificar toggles, salvar, recarregar e verificar persistência

### References

- [Source: admin-panel/src/app/api/groups/[groupId]/tone/route.ts] — Padrão de sub-rota de grupo
- [Source: admin-panel/src/app/api/groups/[groupId]/route.ts] — GroupRouteContext, access control
- [Source: bot/jobs/distributeBets.js] — Job de distribuição (Story 19.2 vai modificar)
- [Source: sql/migrations/019_multitenant.sql] — Padrão de RLS policies
- [Source: scripts/syncSeasons.js:36-55] — TARGET_LEAGUES disponíveis

## Dev Agent Record

### Agent Model Used
claude-opus-4-6

### Completion Notes List
- Migration 049 applied to production Supabase
- Code review: added group existence check on PUT (was returning FK violation 500 instead of 404)
- Code review: added DB error test, cleaned up dead test mock code
- All 698 tests pass, build clean, E2E validated via Playwright

### File List
| File | Action |
|------|--------|
| `sql/migrations/049_group_league_preferences.sql` | CREATED |
| `admin-panel/src/app/api/groups/[groupId]/leagues/route.ts` | CREATED |
| `admin-panel/src/app/(auth)/groups/[groupId]/leagues/page.tsx` | CREATED |
| `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx` | MODIFIED — added Campeonatos link |
| `admin-panel/src/app/api/__tests__/group-leagues.test.ts` | CREATED — 8 tests |
