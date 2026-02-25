# Story 1.3: Log de Execuções de Jobs e Identificação de Falhas

Status: ready-for-dev

## Story

As a **Super Admin**,
I want visualizar logs de execução dos jobs e identificar falhas rapidamente,
So that eu possa agir proativamente quando algo dá errado no envio automático.

## Acceptance Criteria

1. **Given** Super Admin está logado no painel admin
   **When** acessa a seção de logs de jobs
   **Then** vê lista de execuções recentes com: job_name, horário, duração, resultado (success/failure), mensagem de erro se houver (FR37)
   **And** execuções são ordenadas por data (mais recente primeiro)

2. **Given** um job falhou na última execução
   **When** Super Admin acessa o dashboard
   **Then** vê indicador visual de falha (badge, cor vermelha, ícone) destacando o problema (FR38)
   **And** consegue clicar para ver detalhes do erro

3. **Given** existem múltiplos jobs (postBets, distribute-bets, etc.)
   **When** Super Admin consulta os logs
   **Then** pode filtrar por tipo de job
   **And** vê contagem de execuções com sucesso vs falhas por período

4. **Given** Super Admin quer entender a saúde operacional
   **When** acessa o dashboard
   **Then** vê resumo: total de execuções, taxa de sucesso, último erro, e status geral (healthy/degraded)

## Tasks / Subtasks

- [ ] Task 1: Criar API route GET /api/job-executions (AC: #1, #3)
  - [ ] 1.1 Criar `admin-panel/src/app/api/job-executions/route.ts` usando `createApiHandler`
  - [ ] 1.2 Query `job_executions` com paginação, filtro por `job_name` e `status`
  - [ ] 1.3 Retornar: id, job_name, started_at, finished_at, status, duration_ms, result (JSONB), error_message
  - [ ] 1.4 Incluir counters: total, success, failed, success_rate
  - [ ] 1.5 Ordenar por `started_at DESC` (mais recente primeiro)
  - [ ] 1.6 Apenas `super_admin` pode acessar (jobs são dados globais do sistema)

- [ ] Task 2: Criar API route GET /api/job-executions/summary (AC: #2, #4)
  - [ ] 2.1 Criar `admin-panel/src/app/api/job-executions/summary/route.ts`
  - [ ] 2.2 Retornar: última execução de cada job (job_name, status, started_at, duration_ms, error_message)
  - [ ] 2.3 Incluir saúde geral: total_jobs, failed_count, status (healthy/degraded)
  - [ ] 2.4 `degraded` se qualquer job tem última execução com `status='failed'`

- [ ] Task 3: Criar componente JobExecutionsTable (AC: #1, #3)
  - [ ] 3.1 Criar `admin-panel/src/components/features/jobs/JobExecutionsTable.tsx`
  - [ ] 3.2 Colunas: Job, Início, Duração, Resultado, Status, Erro
  - [ ] 3.3 Status badge: `success` → verde, `failed` → vermelho, `running` → amarelo
  - [ ] 3.4 Resultado formatado via lógica similar a `formatResult` do bot
  - [ ] 3.5 Erro exibido truncado com tooltip/expandir no clique

- [ ] Task 4: Criar componente JobHealthSummary (AC: #2, #4)
  - [ ] 4.1 Criar `admin-panel/src/components/features/jobs/JobHealthSummary.tsx`
  - [ ] 4.2 Cards: Total execuções, Taxa de sucesso, Status geral (healthy/degraded badge)
  - [ ] 4.3 Lista de jobs com última execução — badge de status por job
  - [ ] 4.4 Jobs com falha destacados em vermelho, clicáveis para ver detalhes

- [ ] Task 5: Criar página /job-executions (AC: #1, #2, #3, #4)
  - [ ] 5.1 Criar `admin-panel/src/app/(auth)/job-executions/page.tsx`
  - [ ] 5.2 Seção superior: JobHealthSummary (resumo de saúde)
  - [ ] 5.3 Seção inferior: JobExecutionsTable (lista detalhada com paginação)
  - [ ] 5.4 Filtro por job_name (dropdown com todos os jobs)
  - [ ] 5.5 Filtro por status (all/success/failed)

- [ ] Task 6: Adicionar link na sidebar e badge no dashboard (AC: #2)
  - [ ] 6.1 Adicionar item "Jobs" na sidebar após "Historico", apenas `super_admin`
  - [ ] 6.2 No dashboard existente, adicionar card de saúde dos jobs com link para /job-executions

- [ ] Task 7: Escrever testes unitários (AC: #1, #2, #3, #4)
  - [ ] 7.1 Testar API /api/job-executions: paginação, filtros, counters
  - [ ] 7.2 Testar API /api/job-executions/summary: saúde geral, última execução por job
  - [ ] 7.3 Testar componente JobExecutionsTable: renderização, status badges
  - [ ] 7.4 Testar componente JobHealthSummary: healthy/degraded display

- [ ] Task 8: Validação completa
  - [ ] 8.1 `npm test` — todos os testes passam
  - [ ] 8.2 `npm run build` — TypeScript strict build OK

## Dev Notes

### Tabela job_executions (já existe)

```sql
CREATE TABLE job_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running', -- running/success/failed
  duration_ms INTEGER,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Não tem `group_id` — dados são globais do sistema. Apenas `super_admin` deve acessar.

### Jobs Existentes no Sistema (11 nomes)

- Scheduled: `check-affiliate-expiration`, `distribute-bets`, `enrich-odds`, `kick-expired`, `reconciliation`, `renewal-reminders`, `sync-group-members`, `track-results`
- Posting: `post-bets`, `post-bets-manual`
- Manual: `enrich-odds-manual`

### formatResult Logic (replicar no frontend)

O bot tem `formatResult(jobName, result)` em `jobExecutionService.js` que converte o JSONB para string legível. Para o frontend, replicar a lógica simplificada:

- `post-bets`: "X posted, Y repost"
- `track-results`: "X tracked (YG/ZR)"
- `kick-expired`: "X kicked"
- `healthCheck`: "X warns" ou "ok"
- Default: mostrar JSON truncado

### Padrões a Seguir

- API: `createApiHandler({ allowedRoles: ['super_admin'] })` — sem groupFilter (dados globais)
- Componentes: Tailwind puro, status badges como nos outros componentes
- Página: `'use client'` com fetch para APIs

### Learnings da Story 1-1 e 1-2

- Story 1-1 corrigiu `withExecutionLogging` para registrar falhas corretamente e preservar `err.jobResult`
- Story 1-2 criou pattern de API com paginação + counters + table component que deve ser seguido
- `formatResult` no bot já trata `sendFailed` no resultado de `post-bets`

### Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `admin-panel/src/app/api/job-executions/route.ts` | CRIAR |
| `admin-panel/src/app/api/job-executions/summary/route.ts` | CRIAR |
| `admin-panel/src/components/features/jobs/JobExecutionsTable.tsx` | CRIAR |
| `admin-panel/src/components/features/jobs/JobHealthSummary.tsx` | CRIAR |
| `admin-panel/src/app/(auth)/job-executions/page.tsx` | CRIAR |
| `admin-panel/src/components/layout/Sidebar.tsx` | MODIFICAR |
| `admin-panel/src/app/(auth)/dashboard/page.tsx` | MODIFICAR |

### References

- [Source: sql/migrations/011_job_executions.sql] — schema
- [Source: bot/services/jobExecutionService.js#formatResult] — result formatting logic
- [Source: admin-panel/src/app/api/bets/posting-history/route.ts] — API pattern from Story 1-2
- [Source: admin-panel/src/components/features/posting/PostingHistoryTable.tsx] — table pattern
- [Source: admin-panel/src/app/api/dashboard/stats/route.ts] — dashboard stats pattern

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
