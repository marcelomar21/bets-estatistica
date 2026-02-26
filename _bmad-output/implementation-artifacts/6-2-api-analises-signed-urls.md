# Story 6.2: API de Análises e Signed URLs

Status: done

## Story

As a **admin (Super ou Group)**,
I want uma API para listar análises e obter URLs seguras dos PDFs,
So that eu possa acessar as análises de forma segura sem expor URLs permanentes.

## Acceptance Criteria

1. **Given** um Super Admin faz `GET /api/analyses`
   **When** a API processa
   **Then** retorna lista de análises com: id, jogo (times), data, status do PDF (com/sem upload) (FR30)
   **And** inclui todas as análises de todos os grupos
   **And** responde em < 2 segundos para até 500 registros (NFR-P3)

2. **Given** um Group Admin faz `GET /api/analyses`
   **When** a API processa
   **Then** retorna apenas análises dos jogos relacionados ao seu grupo via `groupFilter` (FR31, NFR-S5)

3. **Given** um admin faz `GET /api/analyses?date=2026-02-25`
   **When** a API processa
   **Then** retorna apenas análises da data especificada (FR34)

4. **Given** um admin faz `GET /api/analyses?team=Flamengo`
   **When** a API processa
   **Then** retorna apenas análises de jogos que envolvem o time especificado (FR34)

5. **Given** um admin faz `GET /api/analyses/[id]/pdf` para análise com PDF uploaded
   **When** a API processa
   **Then** gera signed URL com expiração de 1 hora (FR33, NFR-S2, P1)
   **And** retorna `{ success: true, data: { url, expiresAt } }`

6. **Given** um admin faz `GET /api/analyses/[id]/pdf` para análise sem PDF
   **When** a API processa
   **Then** retorna `{ success: false, error: 'PDF not available' }` com status 404

7. **Given** todas as API routes deste epic
   **When** processadas
   **Then** usam `createApiHandler` com `groupFilter` aplicado (P7)

## Tasks / Subtasks

- [ ] Task 1: Criar API route GET /api/analyses (AC: #1, #2, #3, #4, #7)
  - [ ] 1.1 Criar `admin-panel/src/app/api/analyses/route.ts`
  - [ ] 1.2 GET: query game_analysis com join league_matches (home_team, away_team, match_date)
  - [ ] 1.3 GET: apply groupFilter via suggested_bets.group_id (analyses relate to groups through bets)
  - [ ] 1.4 GET: filter por ?date= (match_date)
  - [ ] 1.5 GET: filter por ?team= (home_team ou away_team ILIKE)
  - [ ] 1.6 GET: order by match_date DESC
  - [ ] 1.7 GET: include pdf_storage_path presence as hasPdf boolean

- [ ] Task 2: Criar API route GET /api/analyses/[id]/pdf (AC: #5, #6, #7)
  - [ ] 2.1 Criar `admin-panel/src/app/api/analyses/[id]/pdf/route.ts`
  - [ ] 2.2 Fetch analysis by id, verify pdf_storage_path exists
  - [ ] 2.3 Generate signed URL via supabase.storage.from('analysis-pdfs').createSignedUrl(path, 3600)
  - [ ] 2.4 Return { success: true, data: { url, expiresAt } }
  - [ ] 2.5 Return 404 if no pdf_storage_path

- [ ] Task 3: Escrever testes
  - [ ] 3.1 GET /api/analyses retorna lista de análises
  - [ ] 3.2 GET /api/analyses com ?date= filtra por data
  - [ ] 3.3 GET /api/analyses com ?team= filtra por time
  - [ ] 3.4 GET /api/analyses/[id]/pdf retorna signed URL
  - [ ] 3.5 GET /api/analyses/[id]/pdf retorna 404 sem PDF

- [ ] Task 4: Validacao completa
  - [ ] 4.1 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 4.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Multi-tenant filtering for analyses

game_analysis has match_id but no group_id directly. The relationship is:
- game_analysis.match_id → suggested_bets.match_id → suggested_bets.group_id

For Group Admin filtering, we need a subquery or join:
```sql
SELECT ga.*, lm.home_team, lm.away_team, lm.match_date
FROM game_analysis ga
JOIN league_matches lm ON ga.match_id = lm.match_id
WHERE ga.match_id IN (
  SELECT DISTINCT match_id FROM suggested_bets WHERE group_id = :groupFilter
)
```

With Supabase client, this is tricky. Options:
1. Use RPC/SQL function
2. First fetch match_ids from suggested_bets for the group, then filter game_analysis
3. Use Supabase's `in` filter

Option 2 is simplest and works within the createApiHandler pattern.

### Signed URL generation

```typescript
const { data } = await supabaseAdmin.storage
  .from('analysis-pdfs')
  .createSignedUrl(storagePath, 3600);
// data.signedUrl is the URL
```

Note: For signed URL generation, we need the **service_role** Supabase client, not the authenticated one from createApiHandler. The authenticated client may not have permission to generate signed URLs. Use `createClient` with service key directly.

### Service role client for storage

Create a helper or use the existing pattern. The admin-panel has `SUPABASE_SERVICE_KEY` in env:
```typescript
import { createClient } from '@supabase/supabase-js';
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);
```

### Existing Files (context)

| File | Purpose |
|------|---------|
| `admin-panel/src/app/api/messages/route.ts` | GET API pattern reference |
| `admin-panel/src/middleware/api-handler.ts` | createApiHandler wrapper |
| `admin-panel/src/middleware/tenant.ts` | TenantContext with groupFilter |
| `admin-panel/src/types/database.ts` | GameAnalysis types (Story 6-1) |
| `admin-panel/.env.local` | SUPABASE_SERVICE_KEY env var |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#P1] — Signed URL pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#D3] — PDF viewer decision
