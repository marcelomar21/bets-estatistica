# Story 5.3: Gestao de Links no Painel (Individual e Bulk)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin**,
I want adicionar e gerenciar links de casas de apostas nas apostas pelo painel admin,
So that os membros possam apostar diretamente pelo link quando a aposta for postada no grupo Telegram.

## Acceptance Criteria

1. **AC1: Edicao individual de link**
   - Given Super Admin esta na tela de apostas `/bets`
   - When seleciona uma aposta e clica em editar link
   - Then pode adicionar ou alterar o `deep_link` da aposta (FR23)
   - And link e validado (formato URL valido com `http://` ou `https://`)
   - And a alteracao e salva via API Route com resposta `{ success, data }`
   - And se a aposta agora tem `deep_link` E `odds >= 1.60` (ou `promovida_manual = true`), status auto-promove para `ready`
   - And se tem link mas nao odds valida, status vai para `pending_odds`
   - And se limpar link (enviar `null`/vazio) de uma aposta `ready`, status REGRIDE para `pending_link` (porque perdeu o link mas ainda tem odds)
   - And se limpar link de aposta `pending_odds`, status vai para `generated` (sem link e sem odds valida)
   - And feedback visual confirma sucesso ou exibe erro

2. **AC2: Edicao bulk de links**
   - Given Super Admin seleciona multiplas apostas via checkbox
   - When clica em "Adicionar Links em Lote" e insere UM UNICO link
   - Then TODAS as apostas selecionadas recebem o MESMO link informado (FR24) — mesmo padrao do BulkOddsModal (1 valor para todos)
   - And bulk update processa em < 5 segundos para ate 50 itens (NFR-P5)
   - And auto-promocao e avaliada para cada aposta individualmente
   - And resposta inclui resumo: `{ updated: N, promoted: N, skipped: N, failed: N, errors: [] }`
   - And se alguma falhar, as demais continuam (falha parcial nao aborta)

3. **AC3: Validacao de URL**
   - Given Super Admin insere um link
   - Then o sistema valida que e uma URL valida (comeca com `http://` ou `https://`)
   - And links vazios/null sao permitidos (para limpar um link existente)
   - And links com espacos sao trimados antes de validar
   - And links sem protocolo (ex: `bet365.com/...`) sao rejeitados com mensagem clara
   - And URLs muito longas (> 2048 caracteres) sao rejeitadas

4. **AC4: Visualizacao de links na listagem**
   - Given Super Admin esta na pagina `/bets` (JA EXISTE da story 5.2)
   - Then a coluna de link mostra: icone de link clicavel se preenchido (abre em nova aba), indicador "sem link" se vazio
   - And o filtro `has_link` ja funciona na BetFilters (implementado na 5.2)
   - And o contador `sem_link` ja aparece na BetStatsBar (implementado na 5.2)

5. **AC5: Multi-tenant - Consistente com Story 5.2**
   - Given Super Admin acessa `/bets` → ve apostas de TODOS os grupos (JA FUNCIONA via 5.2)
   - Given Group Admin acessa `/bets` → ve APENAS apostas do seu grupo (JA FUNCIONA via 5.2)
   - And Group Admin pode VER links mas NAO pode editar - API Routes de update sao `allowedRoles: ['super_admin']`
   - And UI esconde botoes de edicao para Group Admin (pattern ja estabelecido na 5.2)

## Tasks / Subtasks

- [x] Task 0: Extrair determineStatus() para modulo compartilhado (OBRIGATORIO — pre-requisito)
  - [x] 0.1 Criar `admin-panel/src/lib/bet-utils.ts` com `determineStatus()`, `isValidUrl()`, `normalizeLink()` e constante `MIN_ODDS = 1.60`
  - [x] 0.2 Refatorar `admin-panel/src/app/api/bets/[id]/odds/route.ts`: remover `determineStatus()` local e `MIN_ODDS`, importar de `@/lib/bet-utils`
  - [x] 0.3 Refatorar `admin-panel/src/app/api/bets/bulk/odds/route.ts`: remover `determineStatus()` local e `MIN_ODDS`, importar de `@/lib/bet-utils`
  - [x] 0.4 Rodar testes existentes de odds (API + componentes) para confirmar que refatoracao nao quebrou nada

- [x] Task 1: Adicionar tipos TypeScript para link updates (AC: #1, #2, #3)
  - [x] 1.1 Adicionar `BetLinkUpdateRequest` interface em `admin-panel/src/types/database.ts`: `{ link: string | null }`
  - [x] 1.2 Adicionar `BulkLinksUpdateRequest` interface: `{ updates: Array<{ id: number; link: string | null }> }`
  - [x] 1.3 Adicionar `BetLinkUpdateResponse` interface: `{ success: true; data: { bet: SuggestedBet; promoted: boolean; old_link: string | null; new_link: string | null } }`
  - [x] 1.4 Adicionar `BulkLinksUpdateResponse` interface: mesmo formato de `BulkOddsUpdateResponse` (updated, promoted, skipped, failed, errors)

- [x] Task 2: Criar API Route PATCH /api/bets/[id]/link - edicao individual (AC: #1, #3, #5)
  - [x] 2.1 Criar `admin-panel/src/app/api/bets/[id]/link/route.ts` com handler PATCH usando `createApiHandler()`
  - [x] 2.2 Validar input: `link` como string (URL valida http/https) ou null/vazio para limpar
  - [x] 2.3 Implementar `isValidUrl(link)`: trim → rejeitar se nao comeca com `http://` ou `https://` → rejeitar se > 2048 chars → usar `new URL()` para validacao final
  - [x] 2.4 Buscar aposta atual: `odds, deep_link, bet_status, promovida_manual`
  - [x] 2.5 Pular update se `deep_link` nao mudou (comparacao direta de strings)
  - [x] 2.6 Calcular novo status via `determineStatus(currentStatus, odds, newLink, promovidaManual)` — importar de `lib/bet-utils.ts` (Task 2.0 abaixo)
  - [x] 2.7 Update atomico: `{ deep_link: newLink, bet_status: newStatus }` em uma unica query
  - [x] 2.8 Retornar `{ success: true, data: { bet, promoted, old_link, new_link } }`
  - [x] 2.9 `allowedRoles: ['super_admin']`

- [x] Task 3: Criar API Route POST /api/bets/bulk/links - edicao bulk (AC: #2, #3, #5)
  - [x] 3.1 Criar `admin-panel/src/app/api/bets/bulk/links/route.ts` com handler POST
  - [x] 3.2 Validar input: array de `{ id: number; link: string | null }`, maximo 50 itens por request
  - [x] 3.3 Validar formato URL de cada link (mesma validacao da route individual)
  - [x] 3.4 Processar updates sequencialmente (consistente com `bulk/odds/route.ts`)
  - [x] 3.5 Para cada item: buscar estado atual, pular se deep_link nao mudou, update atomico (deep_link + bet_status), avaliar auto-promocao
  - [x] 3.6 Falha parcial NAO aborta: continuar processando demais itens
  - [x] 3.7 Retornar `{ success: true, data: { updated, promoted, skipped, failed, errors } }`
  - [x] 3.8 Performance: processar 50 itens em < 5 segundos (NFR-P5) — ~2 queries por item (fetch + update)
  - [x] 3.9 `allowedRoles: ['super_admin']`

- [x] Task 4: Criar componentes de UI para links (AC: #1, #2, #3, #4)
  - [x] 4.1 Criar `admin-panel/src/components/features/bets/LinkEditModal.tsx` — modal para editar link individual com: campo de input URL, validacao inline, preview do link, botao "Limpar Link" para remover
  - [x] 4.2 Criar `admin-panel/src/components/features/bets/BulkLinksModal.tsx` — modal para adicionar link em lote: campo URL + lista dos IDs selecionados + preview + contagem
  - [x] 4.3 Estender `BetTable.tsx`: adicionar botao de edicao de link (icone 🔗) ao lado do botao de odds existente (icone) na coluna de acoes — so visivel para super_admin
  - [x] 4.4 Estender `BetTable.tsx`: coluna `deep_link` mostra icone clicavel que abre URL em nova aba (`target="_blank" rel="noopener"`) ou texto "—" se vazio
  - [x] 4.5 Estender barra de acoes bulk no `page.tsx`: adicionar botao "Adicionar Links" ao lado do "Atualizar Odds em Lote" existente

- [x] Task 5: Integrar modais de links na pagina /bets (AC: #1, #2)
  - [x] 5.1 Atualizar `admin-panel/src/app/(auth)/bets/page.tsx`: adicionar estados `linkEditBet` e `showBulkLinks`
  - [x] 5.2 Conectar callback de edicao de link individual: `BetTable` → `onEditLink(bet)` → abre `LinkEditModal` → salva via `PATCH /api/bets/[id]/link` → refresh lista
  - [x] 5.3 Conectar callback de edicao bulk: botao bulk → abre `BulkLinksModal` → salva via `POST /api/bets/bulk/links` → refresh lista
  - [x] 5.4 Reutilizar toast de feedback existente da story 5.2

- [x] Task 6: Testes de API Routes de links (AC: #1-#5)
  - [x] 6.1 Criar `admin-panel/src/app/api/__tests__/bets-links.test.ts` (arquivo separado para nao poluir o existente)
  - [x] 6.2 Testar PATCH /api/bets/[id]/link: link valido (https://...), link invalido (sem protocolo), link vazio (limpar deep_link), link muito longo
  - [x] 6.3 Testar PATCH /api/bets/[id]/link: auto-promocao (link + odds >= 1.60 → ready), link sem odds → pending_odds
  - [x] 6.4 Testar PATCH /api/bets/[id]/link: bet nao encontrada → 404
  - [x] 6.5 Testar PATCH /api/bets/[id]/link: group_admin recebe 403
  - [x] 6.6 Testar PATCH /api/bets/[id]/link: skip quando link nao mudou
  - [x] 6.6b Testar PATCH /api/bets/[id]/link: limpar link de aposta `ready` (com odds valida) → status regride para `pending_link`
  - [x] 6.6c Testar PATCH /api/bets/[id]/link: limpar link de aposta `pending_odds` → status vai para `generated`
  - [x] 6.7 Testar POST /api/bets/bulk/links: bulk valido (3 itens), bulk vazio (rejeitar), bulk > 50 itens (rejeitar)
  - [x] 6.8 Testar POST /api/bets/bulk/links: falha parcial (1 de 3 falha, outros 2 salvam)
  - [x] 6.9 Testar POST /api/bets/bulk/links: group_admin recebe 403
  - [x] 6.10 Testar POST /api/bets/bulk/links: validacao de URL em cada item

- [x] Task 7: Testes de componentes React de links (AC: #1-#4)
  - [x] 7.1 Criar `admin-panel/src/components/features/bets/__tests__/LinkComponents.test.tsx`
  - [x] 7.2 Testar: LinkEditModal renderiza, valida URL, submete com link valido, limpa link
  - [x] 7.3 Testar: BulkLinksModal renderiza com contagem de selecionados, valida URL, submete
  - [x] 7.4 Testar: BetTable renderiza link clicavel quando preenchido, "—" quando vazio
  - [x] 7.5 Testar: Group Admin nao ve botoes de edicao de link

- [x] Task 8: Regressao completa (OBRIGATORIO antes de PR)
  - [x] 8.1 Rodar suite COMPLETA de testes: `npm test` no admin-panel (baseline: 462 testes em 43 arquivos — story 5.2)
  - [x] 8.2 Confirmar que TODOS os testes existentes de odds (individual + bulk) continuam passando apos refatoracao do `determineStatus()` (Task 0)
  - [x] 8.3 Verificar que testes existentes de BetTable nao quebraram com as novas props `onEditLink`
  - [x] 8.4 Confirmar que novos testes de links (Tasks 6 + 7) passam junto com os existentes

## Dev Notes

### Contexto Critico: EXTENSAO da Story 5.2 — NAO recriar

**IMPORTANTE:** A story 5.2 JA criou toda a infraestrutura da pagina `/bets`:
- Pagina principal: `admin-panel/src/app/(auth)/bets/page.tsx`
- Tabela com paginacao: `BetTable.tsx`
- Filtros: `BetFilters.tsx` (inclui filtro has_link)
- Contadores: `BetStatsBar.tsx` (inclui contador sem_link)
- Badge de status: `BetStatusBadge.tsx`
- Modal de odds individual: `OddsEditModal.tsx`
- Modal de odds bulk: `BulkOddsModal.tsx`
- API Routes: GET /api/bets, GET /api/bets/[id], PATCH /api/bets/[id]/odds, POST /api/bets/bulk/odds
- Tipos: SuggestedBet, BetListResponse, etc.
- Sidebar com entrada "Apostas"

**Esta story ADICIONA link management sobre a infraestrutura existente. NAO recriar nada da 5.2.**

### Componentes JA Existentes (NAO RECRIAR)

| Componente | Arquivo | O que ja faz |
|------------|---------|--------------|
| `createApiHandler()` | `admin-panel/src/middleware/api-handler.ts` | Wrapper obrigatorio para API Routes |
| `withTenant()` | `admin-panel/src/middleware/tenant.ts` | Extrai role + groupFilter do JWT |
| `BetTable.tsx` | `admin-panel/src/components/features/bets/BetTable.tsx` | Tabela com sort, checkbox, pagination, role-based UI |
| `BetFilters.tsx` | `admin-panel/src/components/features/bets/BetFilters.tsx` | Filtros incluindo `has_link` |
| `BetStatsBar.tsx` | `admin-panel/src/components/features/bets/BetStatsBar.tsx` | Contadores incluindo `sem_link` |
| `BetStatusBadge.tsx` | `admin-panel/src/components/features/bets/BetStatusBadge.tsx` | Badge colorido por status |
| GET /api/bets | `admin-panel/src/app/api/bets/route.ts` | Listagem com filtros, paginacao, contadores |
| GET /api/bets/[id] | `admin-panel/src/app/api/bets/[id]/route.ts` | Detalhe com historico de odds |
| Sidebar | `admin-panel/src/components/layout/Sidebar.tsx` | Ja tem entrada "Apostas" |
| Types | `admin-panel/src/types/database.ts` | SuggestedBet, BetStatus, etc. |

### O que CRIAR/MODIFICAR nesta story

| Tipo | Arquivo | Descricao |
|------|---------|-----------|
| **NOVO** | `src/app/api/bets/[id]/link/route.ts` | PATCH - update individual de link |
| **NOVO** | `src/app/api/bets/bulk/links/route.ts` | POST - update bulk de links |
| **NOVO** | `src/components/features/bets/LinkEditModal.tsx` | Modal edicao link individual |
| **NOVO** | `src/components/features/bets/BulkLinksModal.tsx` | Modal edicao link bulk |
| **NOVO** | `src/app/api/__tests__/bets-links.test.ts` | Testes API de links |
| **NOVO** | `src/components/features/bets/__tests__/LinkComponents.test.tsx` | Testes componentes links |
| **NOVO** | `src/lib/bet-utils.ts` | Extrair determineStatus(), isValidUrl(), normalizeLink() (OBRIGATORIO) |
| **REFATORAR** | `src/app/api/bets/[id]/odds/route.ts` | Remover determineStatus() local, importar de bet-utils |
| **REFATORAR** | `src/app/api/bets/bulk/odds/route.ts` | Remover determineStatus() local, importar de bet-utils |
| **MODIFICAR** | `src/types/database.ts` | Adicionar BetLinkUpdateRequest, BulkLinksUpdateRequest, responses |
| **MODIFICAR** | `src/components/features/bets/BetTable.tsx` | Adicionar coluna link clicavel + botao editar link |
| **MODIFICAR** | `src/app/(auth)/bets/page.tsx` | Integrar LinkEditModal, BulkLinksModal, botao bulk links |

### Logica de Auto-Promocao — determineStatus()

```typescript
// MESMA logica usada em PATCH /api/bets/[id]/odds e POST /api/bets/bulk/odds
// Copiar ou extrair para modulo compartilhado
const MIN_ODDS = 1.60;

function determineStatus(
  currentStatus: BetStatus,
  odds: number | null,
  deepLink: string | null,
  promovidaManual: boolean,
): BetStatus {
  if (currentStatus === 'posted') return 'posted'; // NUNCA regride
  const hasOdds = odds != null && (odds >= MIN_ODDS || promovidaManual);
  const hasLink = !!deepLink;
  if (hasOdds && hasLink) return 'ready';
  if (hasOdds && !hasLink) return 'pending_link';
  if (!hasOdds && hasLink) return 'pending_odds';
  return 'generated';
}
```

**OBRIGATORIO:** A funcao `determineStatus()` esta duplicada em `bets/[id]/odds/route.ts` e `bets/bulk/odds/route.ts`. A **Task 0** desta story EXIGE extrair para `admin-panel/src/lib/bet-utils.ts` e importar de la em todas as 4 routes (odds individual, odds bulk, link individual, link bulk). Isso e single source of truth — NAO copiar a funcao novamente.

### Validacao de URL — Funcoes em `lib/bet-utils.ts`

**IMPORTANTE:** As funcoes `isValidUrl()` e `normalizeLink()` abaixo DEVEM ser incluidas no `lib/bet-utils.ts` junto com `determineStatus()` e `MIN_ODDS` (Task 0). Isso centraliza TODA a logica de dominio de apostas em um unico modulo.

```typescript
// ========== lib/bet-utils.ts ==========
// Modulo compartilhado: determineStatus(), MIN_ODDS, isValidUrl(), normalizeLink()

export const MIN_ODDS = 1.60;

export function determineStatus(...): BetStatus { /* ... */ }

// Validacao de URL para links de apostas
export function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed.length === 0) return true; // Vazio = limpar link (permitido)
  if (trimmed.length > 2048) return false;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
}

// Normalizar: trim + null se vazio
export function normalizeLink(link: string | null | undefined): string | null {
  if (link == null) return null;
  const trimmed = link.trim();
  return trimmed.length === 0 ? null : trimmed;
}
```

### Schema: suggested_bets — Coluna Relevante para Links

```sql
-- Coluna de link (ja existe, NAO precisa de migration)
deep_link TEXT,  -- URL do bookmaker (ex: https://bet365.com/...)

-- Colunas usadas na auto-promocao (ja existem)
odds NUMERIC,
bet_status TEXT,  -- generated | pending_link | pending_odds | ready | posted
promovida_manual BOOLEAN DEFAULT false,
```

**Nenhuma migration SQL necessaria** — a coluna `deep_link` ja existe em `suggested_bets`.

### Padrao de API Route — Referencia PATCH odds (5.2)

A route `PATCH /api/bets/[id]/link` segue EXATAMENTE o mesmo padrao de `PATCH /api/bets/[id]/odds/route.ts`:
1. Parse e valida input (`link` em vez de `odds`)
2. Busca estado atual da aposta
3. Pula se nao mudou
4. Calcula novo status via `determineStatus()`
5. Update atomico (deep_link + bet_status)
6. Retorna resultado com flag `promoted`

**Diferenca principal:** NAO registra em `odds_update_history` (historico e so para odds). Nao ha tabela de historico de links.

### Padrao de Bulk Route — Referencia POST bulk/odds (5.2)

A route `POST /api/bets/bulk/links` segue EXATAMENTE o mesmo padrao de `POST /api/bets/bulk/odds/route.ts`:
1. Valida array de updates
2. Maximo 50 itens
3. Processamento sequencial
4. Falha parcial NAO aborta
5. Retorna resumo com contadores

**Diferenca principal:** Valida URL em vez de odds numerico. NAO registra em historico.

### Padrao de Componentes React — Referencia OddsEditModal (5.2)

Os modais `LinkEditModal.tsx` e `BulkLinksModal.tsx` seguem o mesmo padrao de `OddsEditModal.tsx` e `BulkOddsModal.tsx`:
- `'use client'` no topo
- `useState` para estado do form
- `fetch()` nativo para chamada de API
- Validacao inline
- Callback `onSave` chamado apos sucesso para parent refresh

**Padrao de handler no page.tsx:** O `handleEditLink` no `bets/page.tsx` deve seguir EXATAMENTE o padrao do `handleEditOdds` existente — abrir modal com bet selecionada, salvar via API, fechar modal, refresh lista. Verificar a implementacao existente de `handleEditOdds` como referencia direta.

### Learnings da Story 5.2 (Anterior)

- **Multi-tenant group resolution:** `context.groupFilter` no admin panel — aplicado automaticamente por `createApiHandler()`
- **Service Response Pattern:** `{ success: true/false, data/error }` — OBRIGATORIO em todas as APIs
- **Role-based UI:** Super Admin ve botoes de edicao, Group Admin ve somente leitura — condicional com `role` no state do componente
- **determineStatus() duplicada:** Ja esta duplicada em 2 routes. Esta story cria mais 2 — Task 0 OBRIGA extrair para `lib/bet-utils.ts` ANTES de criar routes de link
- **Baseline de testes:** 462 testes passando em 43 arquivos (apos story 5.2)
- **Update atomico:** Odds + bet_status em uma unica query para evitar `promoted` falso — APLICAR mesmo pattern para link + bet_status
- **Best-effort para operacoes secundarias:** historico de odds e best-effort. Para links, nao ha historico, entao nao se aplica
- **Batch queries para bulk:** Listado como otimizacao na 5.2 se performance ficar acima de 5s. Links sao mais simples (sem historico), entao deve ficar abaixo de 5s naturalmente

### Git Intelligence

**Commits recentes (Epic 5):**
```
4457962 feat(admin): close story 5.2 with review fixes
5e0eaaa Merge PR #30 (story 5.1 - round-robin distribution)
3465de6 feat(bot): close story 5.1 review findings
3540c3d Merge PR #29 (story 4.5 - kick-expired)
```

**Branch atual:** `feature/story-5.2-gestao-de-odds-no-painel-individual-e-bulk`

**Branch para esta story:** `feature/story-5.3-gestao-de-links-no-painel-individual-e-bulk`
- Criar a partir de `master` apos merge da 5.2
- OU criar a partir da branch 5.2 se ainda nao mergeada (as mudancas da 5.2 sao prerequisito)

**Commit pattern:** `feat(admin): implement link management with bulk editing (story 5.3)`

**ATENCAO:** A branch da story 5.2 PRECISA estar mergeada ou acessivel, pois esta story depende de toda a infraestrutura de `/bets` criada na 5.2 (pagina, tabela, API routes, tipos, etc.).

### Riscos e Mitigacoes

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| determineStatus() diverge entre 4 routes | Status inconsistente | Extrair para `lib/bet-utils.ts` compartilhado — single source of truth |
| URL validation incompleta | Links invalidos salvos | Usar `new URL()` nativo + check de protocolo http/https |
| Performance bulk > 5s | Viola NFR-P5 | Links nao tem historico (2 queries/item em vez de 3), deve ficar < 3s para 50 itens |
| BetTable.tsx fica muito grande | Manutencao dificil | Adicionar props `onEditLink`, `onEditOdds` consistentes — logica de modal fica no parent |
| Merge conflict com 5.2 na bets/page.tsx | Perde mudancas | Criar branch a partir da 5.2 ou master pos-merge |
| Group Admin tenta editar via API direto | Bypass de UI | Backend valida `allowedRoles: ['super_admin']` — mesma protecao da 5.2 |

### Project Structure Notes

**Alinhamento com estrutura do admin panel:**
```
admin-panel/src/
├── app/
│   ├── api/
│   │   └── bets/
│   │       ├── route.ts          # GET listagem (5.2 - NAO MODIFICAR)
│   │       ├── [id]/
│   │       │   ├── route.ts      # GET detalhe (5.2 - NAO MODIFICAR)
│   │       │   ├── odds/
│   │       │   │   └── route.ts  # PATCH odds (5.2 - NAO MODIFICAR)
│   │       │   └── link/
│   │       │       └── route.ts  # PATCH link (NOVO - esta story)
│   │       └── bulk/
│   │           ├── odds/
│   │           │   └── route.ts  # POST bulk odds (5.2 - NAO MODIFICAR)
│   │           └── links/
│   │               └── route.ts  # POST bulk links (NOVO - esta story)
│   └── (auth)/
│       └── bets/
│           └── page.tsx          # MODIFICAR - integrar modais de links
├── components/
│   └── features/
│       └── bets/
│           ├── BetTable.tsx       # MODIFICAR - coluna link + botao edit link
│           ├── BetFilters.tsx     # NAO MODIFICAR (has_link ja existe)
│           ├── BetStatsBar.tsx    # NAO MODIFICAR (sem_link ja existe)
│           ├── BetStatusBadge.tsx # NAO MODIFICAR
│           ├── OddsEditModal.tsx  # NAO MODIFICAR
│           ├── BulkOddsModal.tsx  # NAO MODIFICAR
│           ├── LinkEditModal.tsx  # NOVO - esta story
│           └── BulkLinksModal.tsx # NOVO - esta story
├── lib/
│   └── bet-utils.ts              # NOVO (OBRIGATORIO) - determineStatus(), isValidUrl(), normalizeLink()
└── types/
    └── database.ts               # MODIFICAR - adicionar tipos de link request/response
```

**Nenhum arquivo do `bot/` e modificado nesta story.**
**Nenhuma migration SQL necessaria.**

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 5, Story 5.3 (FR23, FR24, NFR-P5)]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md - Multi-tenant, withTenant(), API patterns]
- [Source: _bmad-output/project-context.md - Bet State Machines, Service Response Pattern, Multi-Tenant Rules]
- [Source: admin-panel/src/middleware/api-handler.ts - createApiHandler() pattern]
- [Source: admin-panel/src/middleware/tenant.ts - withTenant(), TenantContext]
- [Source: admin-panel/src/app/api/bets/[id]/odds/route.ts - Referencia para route de link (mesmo pattern)]
- [Source: admin-panel/src/app/api/bets/bulk/odds/route.ts - Referencia para bulk links (mesmo pattern)]
- [Source: admin-panel/src/components/features/bets/OddsEditModal.tsx - Referencia para LinkEditModal]
- [Source: admin-panel/src/components/features/bets/BulkOddsModal.tsx - Referencia para BulkLinksModal]
- [Source: admin-panel/src/components/features/bets/BetTable.tsx - Componente a estender]
- [Source: admin-panel/src/app/(auth)/bets/page.tsx - Pagina a estender]
- [Source: admin-panel/src/types/database.ts - Tipos a estender]
- [Source: stories/5-2-gestao-de-odds-no-painel-individual-e-bulk.md - Previous story learnings]

## Change Log

- 2026-02-10: Implementacao completa da story 5.3 — gestao de links no painel (individual e bulk)
  - Extraido `determineStatus()`, `isValidUrl()`, `normalizeLink()` para modulo compartilhado `lib/bet-utils.ts`
  - Refatorado routes de odds para importar de `bet-utils` (single source of truth)
  - Criado API Route PATCH `/api/bets/[id]/link` para edicao individual de link
  - Criado API Route POST `/api/bets/bulk/links` para edicao bulk de links
  - Criado `LinkEditModal` e `BulkLinksModal` para UI de edicao de links
  - Estendido `BetTable` com coluna de link clicavel e botao de edicao de link
  - Integrado modais de links na pagina `/bets` com toast feedback
  - Adicionados tipos TypeScript para link request/response
  - 28 novos testes (16 API + 12 componentes), 490 total passando
- 2026-02-11: Ajustes de code review adversarial aplicados
  - Endurecida validacao de payload nas routes de link (`link` obrigatorio e tipo `string | null`)
  - Corrigido tratamento de erros para diferenciar `NOT_FOUND` de `DB_ERROR`
  - Adicionada validacao de IDs duplicados no bulk de links
  - Melhoradas mensagens de erro nos modais para exibir feedback detalhado do backend
  - Cobertura de testes reforcada para regressao de status, validacao de payload e cenarios de erro de banco
  - Suite atualizada: 498 testes passando em 45 arquivos

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Nenhum HALT ou bloqueio encontrado durante a implementacao

### Completion Notes List

- Task 0: Extraido `determineStatus()`, `MIN_ODDS`, `isValidUrl()`, `normalizeLink()` para `lib/bet-utils.ts`. Refatorado `[id]/odds/route.ts` e `bulk/odds/route.ts` — 462 testes existentes passaram sem regressao.
- Task 1: Adicionados 4 tipos TypeScript (`BetLinkUpdateRequest`, `BulkLinksUpdateRequest`, `BetLinkUpdateResponse`, `BulkLinksUpdateResponse`) em `types/database.ts`.
- Task 2: API Route `PATCH /api/bets/[id]/link` implementada com validacao URL, auto-promocao, skip quando inalterado, update atomico, `allowedRoles: ['super_admin']`.
- Task 3: API Route `POST /api/bets/bulk/links` implementada com processamento sequencial, falha parcial nao aborta, max 50 itens, validacao URL por item.
- Task 4: Componentes `LinkEditModal.tsx` (com preview, validacao inline, limpar link) e `BulkLinksModal.tsx` (link unico para multiplas apostas) criados seguindo o padrao dos modais de odds.
- Task 5: Integrado na `page.tsx` com estados `linkEditBet` e `showBulkLinks`, handlers `handleEditLink`, `handleSaveLink`, `handleBulkLinksSave`. Botao "Adicionar Links em Lote" adicionado na barra bulk.
- Task 6: 23 testes de API cobrindo: URL valida/invalida, auto-promocao, 404, 403, skip, regressao de status com assert do `bet_status`, payload invalido, IDs duplicados e erro de banco.
- Task 7: 13 testes de componentes cobrindo: renderizacao, validacao, submit, limpar link, link clicavel, dash para vazio, role-based visibility e exibicao de erros detalhados do backend.
- Task 8: Suite completa de regressao — 498 testes passando em 45 arquivos (baseline era 462 em 43).

### File List

**NOVOS:**
- `admin-panel/src/lib/bet-utils.ts` — modulo compartilhado com determineStatus(), isValidUrl(), normalizeLink(), MIN_ODDS
- `admin-panel/src/app/api/bets/[id]/link/route.ts` — PATCH individual link update
- `admin-panel/src/app/api/bets/bulk/links/route.ts` — POST bulk links update
- `admin-panel/src/components/features/bets/LinkEditModal.tsx` — modal edicao link individual
- `admin-panel/src/components/features/bets/BulkLinksModal.tsx` — modal edicao link bulk
- `admin-panel/src/app/api/__tests__/bets-links.test.ts` — testes API de links
- `admin-panel/src/components/features/bets/__tests__/LinkComponents.test.tsx` — testes componentes links

**MODIFICADOS:**
- `admin-panel/src/app/api/bets/[id]/odds/route.ts` — removido determineStatus() e MIN_ODDS locais, importa de bet-utils
- `admin-panel/src/app/api/bets/bulk/odds/route.ts` — removido determineStatus() e MIN_ODDS locais, importa de bet-utils
- `admin-panel/src/types/database.ts` — adicionados tipos BetLinkUpdateRequest, BulkLinksUpdateRequest, responses
- `admin-panel/src/components/features/bets/BetTable.tsx` — adicionada coluna link, botao editar link, prop onEditLink
- `admin-panel/src/app/(auth)/bets/page.tsx` — integrados modais de links, handlers, botao bulk links
