# Story 3.4: Visualização de Membros pelo Super Admin

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want visualizar membros de qualquer grupo,
so that eu possa dar suporte e monitorar a plataforma.

## Acceptance Criteria

1. **Given** Super Admin esta logado e acessa `/members`
   **When** a pagina carrega
   **Then** ve membros de TODOS os grupos (FR16)

2. **Given** Super Admin na pagina `/members`
   **When** seleciona um grupo no dropdown de filtro
   **Then** pode filtrar por grupo especifico

3. **Given** Super Admin na pagina `/members`
   **When** visualiza qualquer membro na lista
   **Then** cada membro mostra o grupo a que pertence (coluna "Grupo")

4. **Given** Super Admin na pagina `/members`
   **When** usa os filtros existentes
   **Then** mesmas colunas da visao do Admin de Grupo (nome, status, vencimento) mais coluna "Grupo"

5. **Given** Super Admin na pagina `/members`
   **When** qualquer requisicao de API e feita
   **Then** `withTenant()` retorna `groupFilter = null` para Super Admin (ve tudo)

6. **Given** Super Admin filtra por grupo e por status simultaneamente
   **When** a API processa os filtros
   **Then** ambos os filtros sao aplicados corretamente em conjunto

## Tasks / Subtasks

- [x] Task 1: Adicionar suporte a `group_id` query param na API `/api/members` (AC: #1, #2, #5, #6)
  - [x] 1.1 Extrair `group_id` dos query params em `admin-panel/src/app/api/members/route.ts`
  - [x] 1.2 Aplicar filtro `.eq('group_id', groupIdParam)` quando super_admin selecionar grupo especifico
  - [x] 1.3 Aplicar mesmo filtro nas queries de contadores (trial, ativo, vencendo)
  - [x] 1.4 Testes unitarios: super_admin sem filtro ve todos, super_admin com group_id ve apenas do grupo, group_admin ignora group_id param

- [x] Task 2: Adicionar dropdown de grupos na pagina `/members` (AC: #2, #3, #4)
  - [x] 2.1 Adicionar state `groups` e `selectedGroupId` em `admin-panel/src/app/(auth)/members/page.tsx`
  - [x] 2.2 Fetch lista de grupos via `/api/groups` ao montar (apenas para super_admin)
  - [x] 2.3 Renderizar dropdown "Grupo" com opcao "Todos os grupos" + lista de grupos (visivel apenas para super_admin)
  - [x] 2.4 Passar `group_id` como query param ao chamar fetchMembers
  - [x] 2.5 Resetar paginacao ao mudar grupo selecionado

- [x] Task 3: Testes (AC: #1-6)
  - [x] 3.1 Teste API: super_admin sem group_id retorna membros de todos os grupos
  - [x] 3.2 Teste API: super_admin com group_id retorna apenas membros do grupo selecionado
  - [x] 3.3 Teste API: group_admin com group_id param e ignorado (usa groupFilter do tenant)
  - [x] 3.4 Teste API: contadores respeitam filtro de group_id
  - [x] 3.5 Teste UI: dropdown de grupos aparece apenas para super_admin
  - [x] 3.6 Teste UI: dropdown NAO aparece para group_admin
  - [x] 3.7 Teste UI: selecionar grupo atualiza lista de membros

## Dev Notes

### O que JA EXISTE e JA FUNCIONA (NAO recriar)

**A Story 3.3 JA implementou quase tudo para super_admin:**
- API `/api/members` JA faz join com `groups(name)` para super_admin (condicional por role)
- Componente `MemberList.tsx` JA renderiza coluna "Grupo" para super_admin
- Tipos `MemberListItem` JA incluem `groups?: { name: string } | null`
- Tenant middleware JA retorna `groupFilter = null` para super_admin
- Contadores JA diferenciam por role
- Sidebar JA mostra "Membros" para ambos os roles

**O que FALTA (escopo desta story):**
1. **API**: Adicionar `group_id` query param para super_admin filtrar por grupo especifico
2. **UI**: Adicionar dropdown de grupos na pagina de membros (apenas para super_admin)
3. **Testes**: Cobrir cenarios de filtro por grupo

### ALERTA: NAO reinventar — Story 3.3 ja fez o trabalho pesado

Esta story e **incremental**. A diferença da Story 3.3 para a 3.4 e:
- Story 3.3: Super Admin ve TODOS os membros, sem filtro por grupo
- Story 3.4: Super Admin pode FILTRAR por grupo via dropdown

**NÃO criar novos componentes, novas API routes, ou novos tipos.** Apenas adicionar:
1. Um query param `group_id` na API existente
2. Um dropdown na pagina existente
3. Testes para os novos cenarios

### Arquivos a MODIFICAR (apenas 2 arquivos)

1. **MODIFICAR** `admin-panel/src/app/api/members/route.ts` — Adicionar suporte a `group_id` query param
2. **MODIFICAR** `admin-panel/src/app/(auth)/members/page.tsx` — Adicionar dropdown de grupos

### Arquivos a NÃO tocar

- `admin-panel/src/components/features/members/MemberList.tsx` — JA tem coluna Grupo para super_admin
- `admin-panel/src/components/features/members/member-utils.ts` — Sem mudancas necessarias
- `admin-panel/src/types/database.ts` — Tipos ja suportam groups join
- `admin-panel/src/components/layout/Sidebar.tsx` — Navegacao ja correta
- `admin-panel/src/middleware/tenant.ts` — Logica de tenant ja correta
- `admin-panel/src/middleware/api-handler.ts` — Middleware ja correto

### Pattern: Adicionar group_id param na API

```typescript
// admin-panel/src/app/api/members/route.ts
// Adicionar apos extração dos outros query params:
const groupIdParam = url.searchParams.get('group_id')?.trim() || null;

// Na construcao da query principal, APOS o bloco de groupFilter:
if (groupFilter) {
  // group_admin case - usa tenant groupFilter (JA EXISTE)
  query = query.eq('group_id', groupFilter);
} else if (groupIdParam) {
  // super_admin com filtro explicito por grupo
  query = query.eq('group_id', groupIdParam);
}
// se nenhum dos dois, super_admin ve tudo (sem filtro)

// IMPORTANTE: Aplicar mesma logica nas queries de contadores
```

### Pattern: Dropdown de grupos na pagina

```typescript
// admin-panel/src/app/(auth)/members/page.tsx
// Adicionar state:
const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
const [selectedGroupId, setSelectedGroupId] = useState<string>('');

// Fetch grupos ao montar (apenas super_admin):
useEffect(() => {
  if (role !== 'super_admin') return;
  async function fetchGroups() {
    const res = await fetch('/api/groups');
    if (res.ok) {
      const payload = await res.json();
      if (payload.success) setGroups(payload.data);
    }
  }
  fetchGroups();
}, [role]);

// Dropdown no JSX (apos filtro de status, apenas para super_admin):
{role === 'super_admin' && (
  <select value={selectedGroupId} onChange={(e) => {
    setSelectedGroupId(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  }}>
    <option value="">Todos os grupos</option>
    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
  </select>
)}
```

### API `/api/groups` (JA EXISTE — usar como referencia)

A rota `GET /api/groups` ja retorna lista de grupos com `id` e `name`:
- Arquivo: `admin-panel/src/app/api/groups/route.ts`
- Acesso: `super_admin` only
- Response: `{ success: true, data: [{ id, name, status, ... }] }`

### Padrao de API obrigatorio (referencia Story 3.3)

```typescript
import { createApiHandler } from '@/middleware/api-handler';
import { NextResponse } from 'next/server';

export const GET = createApiHandler(async (req, context) => {
  const { supabase, role, groupFilter } = context;
  // groupFilter = null para super_admin, UUID para group_admin
  return NextResponse.json({ success: true, data: { ... } });
}, { allowedRoles: ['super_admin', 'group_admin'] });
```

### Schema da tabela `members` (referencia)

```sql
CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  telegram_username TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial', 'ativo', 'inadimplente', 'removido')),
  mp_subscription_id TEXT,
  mp_payer_id TEXT,
  trial_started_at TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  subscription_ends_at TIMESTAMPTZ,
  payment_method TEXT,
  last_payment_at TIMESTAMPTZ,
  kicked_at TIMESTAMPTZ,
  notes TEXT,
  group_id UUID REFERENCES groups(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Seguranca: group_id param NAO ignora RLS

- Para `group_admin`: o param `group_id` enviado pelo client DEVE ser IGNORADO. O filtro de tenant (`groupFilter`) sempre prevalece.
- Para `super_admin`: o param `group_id` e opcional. Se fornecido, filtra por aquele grupo. Se nao, retorna todos.
- RLS no banco garante que `group_admin` nunca ve membros de outro grupo, independente do que a API receba.

### Learnings da Story 3.3 (ANTERIOR)

- **API members JA funciona para ambos os roles**: super_admin ve todos, group_admin ve so os seus
- **390/390 testes passando** no admin-panel apos Story 3.3
- **Coluna correta no DB e `subscription_ends_at`** (NAO `vencimento_at`)
- **Bug detectado**: `dashboard/stats/route.ts` usa `vencimento_at` que pode retornar null — nao e escopo desta story
- **Pattern de contadores server-side**: contadores (trial, ativo, vencendo) sao calculados na API, nao no client
- **Branch da 3.3**: `feature/story-3.3-members-list` — esta story DEVE criar branch `feature/story-3.4-super-admin-members-view` a partir de master

### Git Intelligence

Commits recentes relevantes:
- `f820e91` feat(admin): implement members list with status and expiration (story 3.3)
- `55fdf54` Merge PR #22: feature/story-3.2-login-dashboard-group-admin
- `aa62271` feat(admin): implement group admin dashboard for story 3.2

**IMPORTANTE**: A Story 3.3 pode ainda nao ter sido merged na master. Verificar `git log master --oneline -5` antes de criar a branch. Se 3.3 nao estiver na master, criar branch a partir da branch da 3.3 ou esperar o merge.

### Performance (NFR-P4)

- Lista DEVE carregar em < 2 segundos com ate 10k registros
- Indices existentes: `idx_members_group_id`, `idx_members_subscription_ends`
- Paginacao server-side (50 por pagina)
- O filtro `group_id` usa indice existente — sem impacto de performance

### Super Admin vs Group Admin na pagina de membros (atualizado)

| Aspecto | Group Admin | Super Admin |
|---------|-------------|-------------|
| Membros visiveis | Apenas do seu grupo | Todos ou filtrado por grupo |
| Coluna "Grupo" | NAO | SIM |
| Filtro por grupo (dropdown) | NAO | SIM |
| Filtro por status | SIM | SIM |
| Busca por nome | SIM | SIM |
| Paginacao | SIM | SIM |

### Project Structure Notes

- Admin Panel: Next.js 16.x App Router, TypeScript, Tailwind CSS 4.x
- Componentes: `src/components/features/<domain>/`
- API routes: `src/app/api/<domain>/route.ts`
- Tipos: `src/types/database.ts`
- Middleware: `src/middleware/`
- Testes: vitest, arquivos `*.test.ts` / `*.test.tsx`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Story-3.4]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Middleware-Pattern]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Authentication-Security]
- [Source: _bmad-output/project-context.md#Multi-Tenant-Rules]
- [Source: admin-panel/src/app/api/members/route.ts]
- [Source: admin-panel/src/app/(auth)/members/page.tsx]
- [Source: admin-panel/src/components/features/members/MemberList.tsx]
- [Source: admin-panel/src/components/features/members/member-utils.ts]
- [Source: admin-panel/src/types/database.ts]
- [Source: admin-panel/src/app/api/groups/route.ts]
- [Source: admin-panel/src/middleware/tenant.ts]
- [Source: admin-panel/src/middleware/api-handler.ts]
- [Source: _bmad-output/implementation-artifacts/stories/3-3-lista-de-membros-com-status-e-vencimentos.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Nenhum problema encontrado durante a implementacao.

### Completion Notes List

- **Task 1 (API):** Adicionado suporte a `group_id` query param na rota `GET /api/members`. Quando super_admin fornece `group_id`, a query principal e os 3 contadores (trial, ativo, vencendo) filtram pelo grupo selecionado. Para group_admin, o param e ignorado e o `groupFilter` do tenant prevalece (seguranca). 5 novos testes API adicionados.
- **Task 2 (UI):** Adicionado dropdown "Grupo" na pagina `/members` visivel apenas para super_admin. Fetch de grupos via `/api/groups` ao montar. Ao selecionar um grupo, a paginacao reseta para pagina 1 e o `group_id` e passado como query param ao fetchMembers.
- **Task 3 (Testes):** 7 novos testes cobrindo: API sem filtro retorna todos, API com group_id filtra, group_admin ignora param, contadores respeitam filtro, dropdown visivel para super_admin, dropdown invisivel para group_admin, selecao de grupo atualiza lista. Teste existente ajustado para usar `getByRole('columnheader')` evitando ambiguidade.
- **Review Fix 1 (HIGH):** Validacao de `group_id` como UUID adicionada na API de membros, aplicada somente quando o parametro sera usado (super_admin), evitando erro 500 e mantendo regra de ignorar param para group_admin.
- **Review Fix 2 (MEDIUM):** Falhas nas queries de contadores agora retornam erro `DB_ERROR` (500), evitando resposta de sucesso com contadores inconsistentes.
- **Review Fix 3 (MEDIUM):** Teste de UI reforcado para validar reset de paginacao para pagina 1 ao trocar filtro de grupo.
- **Resultado final (pos review):** 24/24 testes focados passando (`members.test.ts` + `page.test.tsx`), sem regressao detectada.

### Change Log

- 2026-02-09: Implementacao completa da Story 3.4 - filtro por grupo para super_admin na pagina de membros
- 2026-02-09: Correcao de findings de code review (validacao de `group_id`, tratamento de erro de contadores, teste de reset de paginacao)

### File List

- `admin-panel/src/app/api/members/route.ts` (modificado) - Adicionado group_id query param
- `admin-panel/src/app/(auth)/members/page.tsx` (modificado) - Adicionado dropdown de grupos
- `admin-panel/src/app/api/__tests__/members.test.ts` (modificado) - 5 novos testes API
- `admin-panel/src/app/(auth)/members/page.test.tsx` (modificado) - 3 novos testes UI + 1 ajustado
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modificado) - Status atualizado
- `_bmad-output/implementation-artifacts/stories/3-4-visualizacao-de-membros-pelo-super-admin.md` (modificado) - Story atualizada

### Senior Developer Review (AI)

**Reviewer:** Marcelomendes (AI)  
**Date:** 2026-02-09  
**Outcome:** Changes Requested -> Resolved

- [HIGH][RESOLVED] Validacao de entrada ausente para `group_id` na API de membros.
- [MEDIUM][RESOLVED] Erros de queries de contadores nao eram tratados.
- [MEDIUM][RESOLVED] Cobertura de teste para reset de paginacao ao trocar grupo era incompleta.
