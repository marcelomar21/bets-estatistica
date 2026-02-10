# Story 4.1: Assinatura Recorrente via Mercado Pago

Status: done

## Story

As a Super Admin,
I want que o onboarding crie uma assinatura recorrente (Preapproval Plan) no Mercado Pago em vez de um checkout avulso,
so that membros sejam cobrados automaticamente todo mês sem intervenção manual, com trial de 7 dias gerenciado pelo MP.

## Acceptance Criteria

1. **AC1: Criar Preapproval Plan no Mercado Pago**
   - Given o onboarding de um novo influencer (step `configuring_mp`)
   - When o sistema configura o Mercado Pago para o grupo
   - Then cria um Preapproval Plan (`POST /preapproval_plan`) com:
     - `reason`: "Assinatura {nome do grupo}"
     - `auto_recurring.frequency`: 1, `frequency_type`: "months"
     - `auto_recurring.transaction_amount`: preço definido no onboarding
     - `auto_recurring.currency_id`: "BRL"
     - `auto_recurring.free_trial.frequency`: 7, `frequency_type`: "days"
   - And salva `preapproval_plan_id` na tabela `groups` coluna `mp_plan_id` (substituindo `mp_product_id`)
   - And gera o `init_point` (URL de assinatura) como `checkout_url` do grupo
   - And `external_reference` = `group_id` para rastreabilidade no webhook
   - And a URL de assinatura permite que múltiplos membros assinem o mesmo plano
   - And se grupo já possui `mp_plan_id` preenchido, retorna plano existente sem criar novo (idempotência)

2. **AC2: Refatorar Código de Onboarding**
   - Given o sistema já usa `createCheckoutPreference()` em `admin-panel/src/lib/mercadopago.ts`
   - When esta story é implementada
   - Then `createCheckoutPreference()` é substituída por `createSubscriptionPlan()`
   - And o onboarding step `configuring_mp` chama a nova função
   - And a coluna `mp_product_id` na tabela `groups` é renomeada para `mp_plan_id` (migration)
   - And valores legados de `mp_product_id` e `checkout_url` são limpos (IDs de checkout preference incompatíveis com preapproval plan)
   - And testes unitários cobrem: plano criado com sucesso, token ausente, erro da API MP, idempotência

## Tasks / Subtasks

- [x] Task 1: Migration DB - renomear `mp_product_id` para `mp_plan_id` (AC: #1, #2)
  - [x] 1.1 Criar migration SQL: `ALTER TABLE groups RENAME COLUMN mp_product_id TO mp_plan_id`
  - [x] 1.2 Limpar valores legados: `UPDATE groups SET mp_plan_id = NULL WHERE mp_plan_id IS NOT NULL` E `UPDATE groups SET checkout_url = NULL WHERE checkout_url IS NOT NULL` (IDs/URLs antigos são de checkout preferences, incompatíveis com preapproval plans)
  - [x] 1.3 Adicionar índice em `mp_plan_id` para lookups de webhook
  - [x] 1.4 Executar migration no Supabase
  - [x] 1.5 Pós-migration: verificar quantos grupos ficaram com `mp_plan_id = NULL` e documentar necessidade de recriação via onboarding
- [x] Task 2: Criar função `createSubscriptionPlan()` (AC: #1)
  - [x] 2.1 Pesquisar documentação ATUAL do MP para `/preapproval_plan`: https://www.mercadopago.com.br/developers/pt/reference/subscriptions/_preapproval_plan/post — validar formato do payload (especialmente `free_trial`)
  - [x] 2.2 Implementar `createSubscriptionPlan(groupName, groupId, price)` em `admin-panel/src/lib/mercadopago.ts`
  - [x] 2.3 Endpoint EXATO: `POST https://api.mercadopago.com/preapproval_plan` — NÃO usar `/preapproval` (isso cria assinatura individual, não template de plano)
  - [x] 2.4 Antes de chamar MP, verificar se grupo já tem `mp_plan_id` preenchido (idempotência — evita planos duplicados em caso de retry)
  - [x] 2.5 Env var: usar `MERCADO_PAGO_ACCESS_TOKEN` (já existe em `mercadopago.ts` linha 20 — NÃO usar `MP_ACCESS_TOKEN` que é do bot)
  - [x] 2.6 Retornar `{ success: true, data: { planId, checkoutUrl } }` ou error
  - [x] 2.7 Tratar erros: token ausente, 401, 500, timeout
  - [x] 2.8 Se chamada ao MP sucede mas save no DB falha: logar `planId` retornado para recuperação manual
- [x] Task 3: Remover `createCheckoutPreference()` e atualizar onboarding (AC: #2)
  - [x] 3.1 Em `admin-panel/src/app/api/groups/onboarding/route.ts` (L6, L238): substituir import e chamada `createCheckoutPreference()` → `createSubscriptionPlan()`
  - [x] 3.2 Em `route.ts` (L218): atualizar select de `mp_product_id` → `mp_plan_id`
  - [x] 3.3 Em `route.ts` (L230): atualizar check `if (group.mp_plan_id)` (era `mp_product_id`)
  - [x] 3.4 Em `route.ts` (L258): atualizar update `{ mp_plan_id: ..., checkout_url: ... }` (campo renomeado)
  - [x] 3.5 Em `route.ts` (L654): atualizar select de `mp_product_id` → `mp_plan_id`
  - [x] 3.6 Atualizar referências de `mp_product_id` nos demais arquivos (ver lista completa em "Mapa de Referências" abaixo)
  - [x] 3.7 Remover função `createCheckoutPreference()` de `mercadopago.ts` após substituição completa
- [x] Task 4: Atualizar tipos TypeScript (AC: #1, #2)
  - [x] 4.1 Atualizar `types/database.ts` - trocar `mp_product_id` por `mp_plan_id`
  - [x] 4.2 Atualizar qualquer componente que referencia `mp_product_id`
- [x] Task 5: Testes unitários e de integração (AC: #2)
  - [x] 5.1 Em `admin-panel/src/lib/__tests__/mercadopago.test.ts`: reescrever suite para `createSubscriptionPlan()`
  - [x] 5.2 Teste: sucesso (mock 201 com planId + checkoutUrl)
  - [x] 5.3 Teste: token ausente retorna erro claro (variável `MERCADO_PAGO_ACCESS_TOKEN`)
  - [x] 5.4 Teste: MP retorna 401 → erro "credenciais inválidas"
  - [x] 5.5 Teste: MP retorna 500 → erro sem retry automático (POST não-idempotente, retry manual via step-level)
  - [x] 5.6 Teste: timeout → erro sem retry automático (POST não-idempotente)
  - [x] 5.7 Teste: idempotência (coberto em `onboarding.test.ts` L371-390 — `createSubscriptionPlan` não faz check de DB, quem faz é `handleConfiguringMp`)
  - [x] 5.8 Teste: URL chamada contém `/preapproval_plan` (não `/preapproval`)
  - [x] 5.9 Teste: sucesso MP + falha DB (coberto em `onboarding.test.ts` L392-438 — `createSubscriptionPlan` não faz operações de DB)
  - [x] 5.10 Em `admin-panel/src/app/api/__tests__/onboarding.test.ts`: atualizar mocks de `createCheckoutPreference` → `createSubscriptionPlan`, atualizar refs `mp_product_id` → `mp_plan_id`
  - [x] 5.11 N/A — `OnboardingWizard.test.tsx` não referenciava `mp_product_id`/`createCheckoutPreference` (contrato de resposta inalterado)
  - [x] 5.12 Em `admin-panel/src/types/database.test.ts`: atualizar refs `mp_product_id` → `mp_plan_id`
  - [x] 5.13 [AI-Review] Teste: preço zero/negativo retorna erro (validação defensiva)
  - [x] 5.14 [AI-Review] Teste: `back_url` incluído quando `NEXT_PUBLIC_APP_URL` definido
  - [x] 5.15 [AI-Review] Teste: `response.json()` falha → erro genérico (fallback)
  - [x] 5.16 [AI-Review] Teste: erro MP com `message` para status não-401/não-500
  - [x] 5.17 [AI-Review] Teste: erro de rede genérico (não-timeout)

## Dev Notes

### Contexto Crítico

**Esta é a primeira story do Epic 4 (Pagamentos).** Ela estabelece a fundação de assinatura recorrente que todas as stories seguintes dependem:
- Story 4.2 (Boas-vindas + Trial) precisa do `checkout_url`
- Story 4.3 (Webhook Multi-tenant) precisa do `mp_plan_id` para identificar grupo
- Story 4.4 (Acesso Instantâneo) precisa da estrutura de subscription
- Story 4.5 (Kick Automático) precisa do lifecycle de subscription

### Decisões Arquiteturais (ADRs)

**ADR-001: Preapproval Plan (template) em vez de Checkout Preference (avulso) ou Preapproval direto (per-member)**
- **Decisão:** Usar `POST /preapproval_plan` para criar 1 template por grupo. MP gerencia trial, cobranças recorrentes e retry automaticamente.
- **Trade-off aceito:** Perdemos controle granular per-member (ex: preço diferente por membro). Aceitável — preço é por grupo, não por membro.
- **Alternativas descartadas:** Preapproval direto (complexidade de gestão, URL diferente por membro) e manter checkout + cron (reinventar a roda).

**ADR-002: Chamada ao MP no Admin Panel (não no Bot Backend)**
- **Decisão:** `createSubscriptionPlan()` fica em `admin-panel/src/lib/mercadopago.ts` — substituição direta de `createCheckoutPreference()`.
- **Rationale:** Criação de plano é feature do onboarding (admin panel). Bot processa webhooks (leitura). Separação de responsabilidades: admin cria, bot reage.
- **Trade-off aceito:** Lógica MP em 2 lugares (admin + bot). Intencional — são responsabilidades distintas.

**ADR-003: Rename coluna + limpar dados legados (não adicionar coluna nova)**
- **Decisão:** `RENAME COLUMN mp_product_id TO mp_plan_id` + `SET NULL` nos valores existentes.
- **Rationale:** IDs de checkout preference são incompatíveis com preapproval plan — manter causa bugs silenciosos.
- **Impacto operacional:** Grupos existentes perdem `checkout_url` e precisam recriar plano via retry do onboarding. Verificar quantos grupos são afetados pós-migration.

**ADR-004: Idempotência via check no DB (não via idempotency key do MP)**
- **Decisão:** Antes de chamar MP, verificar `if (group.mp_plan_id) return existing`. Previne duplicatas em caso de retry.
- **Rationale:** `fetchWithRetry` pode reenviar POST. MP não documenta suporte a idempotency key em `/preapproval_plan`.
- **Trade-off aceito:** Em cenário extremo (MP criou plan + DB save falhou + retry desiste), 1 plano órfão no MP. Aceitável para MVP — cleanup manual.

### Arquitetura de Assinatura Mercado Pago

**Estrutura de dois níveis (ATENÇÃO — nomenclatura confusa do MP):**
1. **Preapproval Plan** (`POST /preapproval_plan`) → Template do plano (criado 1x por grupo) — **ESCOPO DESTA STORY**
2. **Preapproval** (`POST /preapproval`) → Assinatura individual (criada automaticamente pelo MP quando membro clica no `checkout_url`)

> **ALERTA: NÃO confundir os endpoints!** `/preapproval_plan` cria o template. `/preapproval` cria assinatura individual. Usar o endpoint errado faz o super admin assinar o próprio plano em vez de criar o template.

**API Endpoint:**
```
POST https://api.mercadopago.com/preapproval_plan
Authorization: Bearer {MERCADO_PAGO_ACCESS_TOKEN}
Content-Type: application/json

{
  "reason": "Assinatura {group_name}",
  "auto_recurring": {
    "frequency": 1,
    "frequency_type": "months",
    "transaction_amount": 29.90,
    "currency_id": "BRL",
    "free_trial": {
      "frequency": 7,
      "frequency_type": "days"
    }
  },
  "external_reference": "{group_id}"
}
```

**Resposta esperada (201):**
```json
{
  "id": "preapproval_plan_id_aqui",
  "init_point": "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=xxx",
  "status": "active"
}
```

### Código Existente a Modificar

**Arquivo principal:** `admin-panel/src/lib/mercadopago.ts`
- **ATUALMENTE** contém `createCheckoutPreference()` que faz `POST /checkout/preferences` (checkout avulso)
- **DEVE SER** substituído por `createSubscriptionPlan()` que faz `POST /preapproval_plan` (assinatura recorrente)
- Já usa `fetchWithRetry` de `./fetch-utils` (manter este padrão, mas CUIDADO: retry em POST pode duplicar recursos no MP — implementar check de idempotência antes de cada chamada)
- Já usa padrão de retorno `{ success: true/false, data/error }` (manter)
- Env var: `MERCADO_PAGO_ACCESS_TOKEN` (linha 20 do arquivo atual — NÃO trocar para `MP_ACCESS_TOKEN` que é a variável dos bots)

**Tipo de retorno atualizado:**
```typescript
interface MercadoPagoSuccess {
  success: true;
  data: { planId: string; checkoutUrl: string };  // era { id, checkout_url }
}
```

**Chamadas a `createCheckoutPreference()` (resultado de grep — paths exatos):**
- `admin-panel/src/app/api/groups/onboarding/route.ts` L6 (import), L238 (chamada) — **ESTE é o arquivo que chama a função**
- `OnboardingWizard.tsx` NÃO chama diretamente — faz fetch para `/api/groups/onboarding`

**Mapa Completo de Referências a `mp_product_id` (TODOS devem ser atualizados):**
- `admin-panel/src/types/database.ts` L7 — tipo Group
- `admin-panel/src/types/database.test.ts` L12,23,37,53,69,85,101,117,126 — testes de tipo
- `admin-panel/src/app/api/groups/onboarding/route.ts` L218,230,258,654 — select, check, update
- `admin-panel/src/app/api/__tests__/onboarding.test.ts` L334,356,375,520 — mocks

**Arquivos de teste a atualizar:**
- `admin-panel/src/lib/__tests__/mercadopago.test.ts` — suite principal (reescrever para `createSubscriptionPlan`)
- `admin-panel/src/app/api/__tests__/onboarding.test.ts` L11,67,341,363,368,389 — mocks e assertions
- `admin-panel/src/components/features/groups/OnboardingWizard.test.tsx` L35,58,274,297 — mocks de fetch
- `admin-panel/src/types/database.test.ts` — todas refs `mp_product_id`

**UI que exibe `checkout_url` (não precisa mudar campo, mas verificar comportamento com NULL pós-migration):**
- `admin-panel/src/app/(auth)/groups/[groupId]/page.tsx` L69-79 — exibe link (já tem check `checkout_url &&`)
- `admin-panel/src/components/features/groups/OnboardingWizard.tsx` L163,178,246,437-438 — exibe na conclusão do wizard

### Migration SQL

```sql
-- Migration: rename mp_product_id to mp_plan_id (ADR-003)
ALTER TABLE groups RENAME COLUMN mp_product_id TO mp_plan_id;

-- Limpar IDs legados de checkout preferences (incompatíveis com preapproval plans)
UPDATE groups SET mp_plan_id = NULL WHERE mp_plan_id IS NOT NULL;

-- Limpar checkout_url legadas (URLs de checkout preference, não de preapproval plan)
UPDATE groups SET checkout_url = NULL WHERE checkout_url IS NOT NULL;

-- Index for webhook lookups (Story 4.3 will use this)
CREATE INDEX IF NOT EXISTS idx_groups_mp_plan_id ON groups(mp_plan_id) WHERE mp_plan_id IS NOT NULL;
```

**Dados existentes (AÇÃO OBRIGATÓRIA):** Grupos existentes com `mp_product_id` e `checkout_url` preenchidos contêm IDs/URLs de checkout preferences (pagamento avulso), que são INCOMPATÍVEIS com preapproval plans (assinatura recorrente). A migration DEVE limpar ambos os valores. Esses grupos precisarão ter novos planos de assinatura criados via retry do step `configuring_mp` no onboarding.

### Comportamento da UI Pós-Migration

Após a migration, grupos existentes ficam com `mp_plan_id = NULL` e `checkout_url = NULL`:
- **Página do grupo** (`groups/[groupId]/page.tsx`): já tem guard `checkout_url &&` (L69) — não exibe link. OK, sem mudança necessária.
- **OnboardingWizard**: quando super admin faz retry do step `configuring_mp`, a nova função `createSubscriptionPlan()` será chamada e preencherá ambos os campos. O wizard já mostra o `checkout_url` na conclusão.
- **Nenhuma mudança de UI necessária** — os guards existentes já tratam campos NULL.

### Padrões Obrigatórios do Projeto

1. **Resposta de API:** Sempre `{ success: true/false, data/error }` — NUNCA retornar formato diferente
2. **Tenant isolation:** `withTenant()` middleware em toda API route — super_admin vê tudo, group_admin só seu grupo
3. **Retry com backoff:** Usar `fetchWithRetry` de `lib/fetch-utils` para chamadas externas
4. **Validação:** Zod 4.x para validar inputs na API route
5. **Testes:** Vitest com mocks de Supabase e fetch — nunca chamar APIs reais nos testes
6. **Error codes:** Usar códigos padronizados: `MP_API_ERROR`, `MP_TOKEN_MISSING`, `DB_ERROR`

### Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| MP plan creation falha no meio do onboarding | Grupo fica em estado "failed" | Retry mechanism (já existe via `fetchWithRetry`), UI mostra status claro |
| Chamada duplicada cria 2 plans para mesmo grupo | Planos órfãos no MP | Verificar se `mp_plan_id` já existe antes de criar novo (idempotência local) |
| Grupo deletado mas plan ativo no MP | Plano órfão cobrando | Documentar processo de cleanup (manual para MVP) |
| Trial duration configurada errada | Período de trial incorreto | Validar config antes de API call, cobrir com testes |
| Endpoint errado: `/preapproval` vs `/preapproval_plan` | Super admin vira assinante em vez de criar template | Teste que valida URL contém `/preapproval_plan`, alerta explícito nos Dev Notes |
| Env var errada: `MP_ACCESS_TOKEN` vs `MERCADO_PAGO_ACCESS_TOKEN` | Token undefined em produção, 100% das criações falham | Manter `MERCADO_PAGO_ACCESS_TOKEN` (já usada em `mercadopago.ts` L20) |
| fetchWithRetry faz retry em POST que já criou o plan | Planos duplicados no MP | Check de idempotência: verificar `mp_plan_id` no DB antes de cada tentativa |
| Sucesso no MP mas falha no DB save | Plan criado no MP mas sistema não sabe o ID | Logar `planId` retornado para recuperação manual, retornar erro claro |
| Payload `free_trial` com formato desatualizado | MP retorna 400, onboarding falha | Pesquisar doc ATUAL do MP antes de implementar, testar com sandbox |

### Learnings da Story Anterior (3.4)

- **UUID validation:** Sempre validar UUIDs de parâmetros recebidos (aplicar ao `group_id` no payload do MP)
- **Counter queries:** Se queries auxiliares falham, retornar erro 500, não sucesso com zeros
- **Testes focados:** 24/24 testes passando após review — manter cobertura alta
- **Padrão de filter:** O mesmo padrão de `groupFilter` do tenant middleware se aplica aqui

### Git Intelligence

**Commits recentes mostram:**
- Padrão de commit: `feat(admin): implement X (story Y.Z)`
- Branch naming: `feature/story-X.Y-description`
- PRs criados contra `master`
- Stories 3.1-3.4 todas seguiram o padrão de admin-panel com Vitest

### Project Structure Notes

- Story modifica apenas o **admin-panel** (Next.js TypeScript) — decisão intencional (ADR-002)
- Bot backend (`bot/`) NÃO é tocado nesta story — bot lida com webhooks (Stories 4.3+), admin lida com criação de planos
- Migration SQL executada diretamente no Supabase (não via admin-panel)
- Arquivos a criar/modificar estão todos em `admin-panel/src/`

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 4, Story 4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md - API Patterns, DB Schemas]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md - Multi-tenant RLS]
- [Source: _bmad-output/planning-artifacts/prd.md - FR44-FR49, NFR-P2, NFR-S3, NFR-I2]
- [Source: admin-panel/src/lib/mercadopago.ts - Função atual createCheckoutPreference()]
- [Source: stories/3-4-visualizacao-de-membros-pelo-super-admin.md - Learnings]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm test -- src/lib/__tests__/mercadopago.test.ts src/app/api/__tests__/onboarding.test.ts src/types/database.test.ts` (53/53)
- `npm test` em `admin-panel` (403/403)
- `npm run lint` em `admin-panel` (falhas preexistentes fora do escopo da story)
- `node scripts/run-migration.js sql/migrations/025_groups_mp_plan_id.sql` (exec_sql indisponível, fallback manual)
- `psql "$DATABASE_URL" -f sql/migrations/025_groups_mp_plan_id.sql` (migration aplicada com sucesso)
- `psql` pós-migration: `SELECT COUNT(*) FILTER (WHERE mp_plan_id IS NULL), COUNT(*) FILTER (WHERE mp_plan_id IS NOT NULL), COUNT(*) FILTER (WHERE checkout_url IS NULL), COUNT(*) FILTER (WHERE checkout_url IS NOT NULL) FROM groups;` → `1,0,1,0`

### Completion Notes List

- ✅ Implementada `createSubscriptionPlan()` usando endpoint correto `/preapproval_plan`, payload recorrente mensal em BRL, `free_trial` de 7 dias e `external_reference = group_id`.
- ✅ Mantido uso de `MERCADO_PAGO_ACCESS_TOKEN`; erros mapeados para token ausente, 401, 500 com retry e timeout após 3 tentativas.
- ✅ Onboarding (`configuring_mp`) refatorado para `mp_plan_id`, idempotência por coluna existente e persistência de `checkout_url` via `init_point`.
- ✅ Adicionado tratamento de falha de persistência após sucesso no MP: retorno de erro claro e log com `planId` para recuperação manual.
- ✅ Migration `025_groups_mp_plan_id.sql` criada e executada no Supabase: rename de coluna, limpeza de legado e índice parcial `idx_groups_mp_plan_id`.
- ✅ Pós-migration validado: 1 grupo total, 1 com `mp_plan_id = NULL`, 1 com `checkout_url = NULL`; necessário reexecutar onboarding (`configuring_mp`) para recriar plano nesse grupo.
- ✅ Suite de testes atualizada e verde para cobertura dos novos cenários (sucesso, 401, 500, timeout, idempotência e erro de DB após sucesso no MP).
- ℹ️ `OnboardingWizard.test.tsx` revisado; não exigiu mudança de `mp_product_id`/`createCheckoutPreference` porque o contrato de resposta consumido pelo wizard não mudou.

### File List

- `sql/migrations/025_groups_mp_plan_id.sql`
- `admin-panel/src/lib/mercadopago.ts`
- `admin-panel/src/app/api/groups/onboarding/route.ts`
- `admin-panel/src/types/database.ts`
- `admin-panel/src/lib/__tests__/mercadopago.test.ts`
- `admin-panel/src/app/api/__tests__/onboarding.test.ts`
- `admin-panel/src/types/database.test.ts`

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 | **Data:** 2026-02-10

### Issues Encontrados: 3 High, 4 Medium, 2 Low

| # | Sev | Issue | Resolução |
|---|-----|-------|-----------|
| H1 | HIGH | Task 5.7 (idempotência) marcada [x] em `mercadopago.test.ts` mas cobertura real está em `onboarding.test.ts` | Corrigido mapeamento na story |
| H2 | HIGH | Task 5.9 (sucesso MP + falha DB) marcada [x] em `mercadopago.test.ts` mas cobertura real está em `onboarding.test.ts` | Corrigido mapeamento na story |
| H3 | HIGH | `fetchWithRetry` faz retry em POST `/preapproval_plan` — risco de planos duplicados no MP se 500 retornado após criação | Substituído `fetchWithRetry` por `fetch` direto; retry fica a cargo do step-level (com idempotência via DB) |
| M1 | MEDIUM | Branch `feature/story-3.4` contém mudanças de ambas stories 3.4 e 4.1 (4 arquivos de members misturados) | Documentado; separação deve ocorrer no PR |
| M2 | MEDIUM | `mercadopago.test.ts` tinha apenas 5 testes, faltavam cenários de `back_url`, `response.json()` failure, erro genérico, MP error message | Adicionados 5 testes novos (5.13-5.17), suite agora com 10 testes |
| M3 | MEDIUM | Task 5.11 (`OnboardingWizard.test.tsx`) marcada [x] sem mudança real | Corrigido para N/A com justificativa |
| M4 | MEDIUM | `createSubscriptionPlan()` não validava preço negativo/zero | Adicionada validação `price <= 0` com teste |
| L1 | LOW | Tipos `MercadoPagoSuccess`/`MercadoPagoError`/`MercadoPagoResult` não exportados | Exportados para melhor DX |
| L2 | LOW | Migration `RENAME COLUMN` sem `IF EXISTS` (não suportado em PostgreSQL) | Aceito — migrations são one-shot por design |

### Decisão Arquitetural do Review

**ADR-005: Não usar retry automático em POST que cria recursos no MP**
- **Decisão:** Substituir `fetchWithRetry` por `fetch` direto em `createSubscriptionPlan()`
- **Rationale:** POST `/preapproval_plan` não é idempotente no MP. Se o MP processar a request mas retornar 500 (transporte/timeout), retry cria plano duplicado. O retry seguro é no nível do step de onboarding, onde o check `if (group.mp_plan_id)` previne duplicatas.
- **Impacto:** Se o MP retornar 500, o onboarding mostra erro e o super admin pode clicar "retry" — o retry do step verifica o DB antes de chamar o MP novamente.

## Change Log

- 2026-02-10: Story 4.1 implementada (preapproval plan MP, rename `mp_plan_id`, idempotência onboarding, testes atualizados e migration aplicada no Supabase).
- 2026-02-10: [AI-Review] Corrigidos 9 issues: removido retry HTTP em POST (H3), validação de preço (M4), 5 testes adicionais (M2), tipos exportados (L1), mapeamento de tasks corrigido (H1/H2/M3). Suite: 58/58 green, full suite: 408/408 green.
