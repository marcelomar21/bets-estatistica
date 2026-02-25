# Story 1.2: Histórico de Postagens no Dashboard

Status: ready-for-dev

## Story

As a **Super Admin**,
I want visualizar o histórico de postagens com horários e status,
So that eu possa confirmar que as apostas estão sendo entregues corretamente.

## Acceptance Criteria

1. **Given** Super Admin está logado no painel admin
   **When** acessa a seção de postagens/dashboard
   **Then** vê lista das postagens recentes com: aposta, grupo, horário programado, horário real de envio, status (FR36)
   **And** postagens são ordenadas por data (mais recente primeiro)

2. **Given** uma aposta foi postada com sucesso
   **When** aparece no histórico
   **Then** mostra status `posted` com horário de envio e `telegram_message_id`

3. **Given** uma aposta com `bet_status = 'ready'` não foi postada no horário esperado
   **When** Super Admin consulta o histórico
   **Then** a aposta aparece com indicação visual de atraso ou pendência
   **And** Super Admin consegue identificar rapidamente o que não foi postado

4. **Given** existem postagens de múltiplos grupos
   **When** Super Admin visualiza o histórico
   **Then** pode filtrar por grupo para ver postagens específicas

## Tasks / Subtasks

- [ ] Task 1: Criar API route GET /api/bets/posting-history (AC: #1, #2, #4)
  - [ ] 1.1 Criar `admin-panel/src/app/api/bets/posting-history/route.ts` usando `createApiHandler`
  - [ ] 1.2 Query `suggested_bets` JOIN `league_matches` JOIN `groups` — filtrar bets com `bet_status IN ('posted', 'ready')` e `group_id IS NOT NULL`
  - [ ] 1.3 Retornar: id, homeTeamName, awayTeamName, kickoffTime, odds, odds_at_post, bet_status, telegram_posted_at, telegram_message_id, group name, historico_postagens
  - [ ] 1.4 Suportar query params: `?group_id=`, `?page=`, `?per_page=`, `?sort=`, `?order=`
  - [ ] 1.5 Aplicar `groupFilter` para RLS — group_admin vê só seu grupo
  - [ ] 1.6 Ordenar por `telegram_posted_at DESC NULLS LAST` (posted primeiro, ready pendentes depois)

- [ ] Task 2: Criar componente PostingHistoryTable (AC: #1, #2, #3)
  - [ ] 2.1 Criar `admin-panel/src/components/features/posting/PostingHistoryTable.tsx`
  - [ ] 2.2 Colunas: Jogo (home vs away), Odds (post), Grupo, Postado em, Status, Msg ID
  - [ ] 2.3 Status badge: `posted` → azul com checkmark, `ready` (com telegram_posted_at null e kickoff futuro) → amarelo "pendente", `ready` (com kickoff no passado e sem posted_at) → vermelho "não postada"
  - [ ] 2.4 Paginação com page/per_page (pattern do BetTable)
  - [ ] 2.5 Colunas clicáveis para sorting (pattern do BetTable/PostingQueueTable)

- [ ] Task 3: Criar página /posting-history (AC: #1, #4)
  - [ ] 3.1 Criar `admin-panel/src/app/(auth)/posting-history/page.tsx`
  - [ ] 3.2 LayoutShell com título "Histórico de Postagens"
  - [ ] 3.3 Filtro de grupo (dropdown) para super_admin — group_admin vê só seu grupo
  - [ ] 3.4 Carregar dados via fetch para a API criada em Task 1
  - [ ] 3.5 Exibir resumo no topo: total postadas, total pendentes, taxa de sucesso

- [ ] Task 4: Adicionar link na sidebar (AC: #1)
  - [ ] 4.1 Editar `admin-panel/src/components/layout/Sidebar.tsx`
  - [ ] 4.2 Adicionar item "Histórico" após o item "Postagem" existente
  - [ ] 4.3 Visível para `super_admin` e `group_admin`

- [ ] Task 5: Escrever testes unitários (AC: #1, #2, #3, #4)
  - [ ] 5.1 Testar API route: resposta com dados corretos, filtro por grupo, paginação, groupFilter
  - [ ] 5.2 Testar componente PostingHistoryTable: renderização de colunas, status badges, sorting
  - [ ] 5.3 Testar página: carregamento, filtro por grupo, resumo no topo

- [ ] Task 6: Validação completa
  - [ ] 6.1 `npm test` — todos os testes passam
  - [ ] 6.2 `npm run build` — TypeScript strict build OK
  - [ ] 6.3 Nenhum `console.log` — apenas logger

## Dev Notes

### Dados Disponíveis no Banco

A tabela `suggested_bets` já tem todos os campos necessários para o histórico:

- `telegram_posted_at` (TIMESTAMPTZ) — quando foi postada no Telegram
- `telegram_message_id` (BIGINT) — ID da mensagem no Telegram
- `odds_at_post` (NUMERIC) — odds no momento da postagem
- `historico_postagens` (JSONB) — array de timestamps de cada postagem/repostagem
- `bet_status` — `'ready'` (pendente) ou `'posted'` (enviada)
- `group_id` (UUID, FK groups) — grupo ao qual a aposta pertence

Não é necessário criar migração SQL — todos os dados já existem.

### Padrões Existentes a Seguir

**API Route (OBRIGATÓRIO):**
```typescript
import { createApiHandler } from '@/middleware/api-handler';

export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter, role } = context;
    // groupFilter: null para super_admin, UUID para group_admin
    let query = supabase.from('suggested_bets').select('...');
    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }
    // ... pagination, sorting
    return NextResponse.json({ success: true, data: ... });
  },
  { allowedRoles: ['super_admin', 'group_admin'] }
);
```

**Tabela (seguir pattern de BetTable.tsx e PostingQueueTable.tsx):**
- Tailwind CSS puro, sem component library
- `divide-y divide-gray-200` para separadores
- Status badges: `bg-green-100 text-green-800` (success), `bg-yellow-100 text-yellow-800` (pending), `bg-red-100 text-red-800` (failed)
- Paginação com botões Previous/Next e contagem
- Colunas clicáveis com ícone de sort

**Página (seguir pattern existente):**
```typescript
// Wrapper de layout obrigatório
import LayoutShell from '@/components/layout/LayoutShell';
export default function PostingHistoryPage() {
  return (
    <LayoutShell title="Histórico de Postagens">
      {/* content */}
    </LayoutShell>
  );
}
```

**Sidebar (em Sidebar.tsx):**
```typescript
// Adicionar item no array de navigation
{ name: 'Histórico', href: '/posting-history', icon: '📋', roles: ['super_admin', 'group_admin'] }
```

### Lógica de Status Visual (AC #3)

Para identificar apostas "não postadas" (indicação visual de atraso):

- `bet_status = 'posted'` + `telegram_posted_at` presente → **Postada** (badge azul)
- `bet_status = 'ready'` + `kickoffTime > NOW()` → **Pendente** (badge amarelo) — ainda pode ser postada
- `bet_status = 'ready'` + `kickoffTime <= NOW()` + sem `telegram_posted_at` → **Não Postada** (badge vermelho) — jogo já começou sem postagem

### Arquivos a Criar/Modificar

| Arquivo | Ação | Motivo |
|---------|------|--------|
| `admin-panel/src/app/api/bets/posting-history/route.ts` | CRIAR | API endpoint para histórico |
| `admin-panel/src/components/features/posting/PostingHistoryTable.tsx` | CRIAR | Componente de tabela |
| `admin-panel/src/app/(auth)/posting-history/page.tsx` | CRIAR | Página do histórico |
| `admin-panel/src/components/layout/Sidebar.tsx` | MODIFICAR | Adicionar link na nav |
| `admin-panel/src/app/api/bets/posting-history/__tests__/route.test.ts` | CRIAR | Testes da API |
| `admin-panel/src/components/features/posting/__tests__/PostingHistoryTable.test.tsx` | CRIAR | Testes do componente |

### Learnings da Story 1-1 (Contexto Anterior)

- Story 1-1 corrigiu o bug de `job_executions` sempre mostrando `success` — agora falhas reais são registradas corretamente
- O campo `sendFailed` foi adicionado ao result JSONB de `postBets` para distinguir falhas de Telegram vs falhas de validação
- `formatResult` foi atualizado para exibir contagem de falhas
- Pattern de job execution: `withExecutionLogging(jobName, fn)` que registra start/finish em `job_executions`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story1.2] — requisitos FR36
- [Source: admin-panel/src/app/api/bets/route.ts] — pattern de API route para bets
- [Source: admin-panel/src/components/features/bets/BetTable.tsx] — pattern de tabela com sorting/pagination
- [Source: admin-panel/src/components/features/posting/PostingQueueTable.tsx] — pattern de tabela de postagem
- [Source: admin-panel/src/components/layout/Sidebar.tsx] — estrutura de navegação
- [Source: admin-panel/src/components/layout/LayoutShell.tsx] — wrapper de layout
- [Source: admin-panel/src/middleware/api-handler.ts] — createApiHandler pattern
- [Source: sql/migrations/] — schema de suggested_bets, groups, job_executions

### Project Structure Notes

- Story 1.2 é 100% admin-panel (Next.js/TypeScript/React) — sem mudanças no bot
- Testes ficam em `__tests__/` adjacente ao arquivo testado, usando Vitest
- Supabase client no admin-panel: `createBrowserClient` para client-side, service_role para server-side
- Não precisa de migração SQL — dados já existem nas tabelas

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
