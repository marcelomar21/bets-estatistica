# Phase 3: League Upsell - Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Influencers (group_admins) podem monetizar ligas extras como add-ons pagos. Super admin classifica ligas como standard/extra. Group admins compram ligas extras via checkout no admin panel com Mercado Pago. Desconto percentual por cliente por liga aplicado pelo super admin. Distribuição de apostas bloqueada para ligas extras sem pagamento ativo.

</domain>

<decisions>
## Implementation Decisions

### Modelo de Pagamento
- Checkout único — group_admin seleciona várias ligas extras e paga tudo em um checkout só (preço = soma das ligas selecionadas menos descontos)
- Preapproval plan Mercado Pago único por grupo para ligas extras, com preço atualizado quando grupo muda ligas
- Self-service — group_admin compra ligas extras logado no admin panel
- Self-service — group_admin cancela ligas extras sozinho via admin panel
- Distribuição de apostas da liga bloqueada para o grupo sem pagamento ativo

### Checkout e Pricing
- Checkout dentro do admin panel (requer login de group_admin) — NÃO é página pública
- R$200/mês por liga como default, super_admin pode alterar preço individualmente por liga
- Reutilizar `createSubscriptionPlan()` e `updateSubscriptionPlanPrice()` existentes do `mercadoPagoService.js`

### Desconto e Schema
- Desconto percentual (ex: 20% off) por cliente por liga — super_admin aplica no admin panel
- Classificação de ligas via coluna `tier` na tabela `league_seasons` ('standard' | 'extra')
- Group_admin vê ligas extras não compradas listadas com badge "Extra" e botão "Comprar"

### Claude's Discretion
- Detalhes de UI/layout do checkout de ligas extras
- Nomes de tabelas/colunas para novas entidades (league_pricing, group_league_subscriptions)
- Estrutura do webhook handler para pagamentos de ligas extras
- Ordem dos migrations SQL

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `admin-panel/src/lib/mercadopago.ts` — Cliente MP com createSubscriptionPlan, updateSubscriptionPlanPrice, cancelSubscription
- `bot/services/mercadoPagoService.js` — API calls para MP (preapproval plans)
- `bot/handlers/mercadoPagoWebhook.js` — Webhook handler com HMAC validation e idempotency
- `sql/migrations/049_group_league_preferences.sql` — group_league_preferences table
- `admin-panel/src/app/(auth)/groups/[groupId]/leagues/page.tsx` — UI de preferências de liga existente
- `admin-panel/src/app/api/groups/[groupId]/leagues/route.ts` — API de preferências de liga
- `bot/jobs/distributeBets.js` — Distribuição com `isGroupEligibleForBet()` filtering

### Established Patterns
- Preapproval plans MP: criar plano → gerar checkout URL → webhook processa pagamentos
- Group pricing: `groups.subscription_price` + `groups.mp_plan_id` + `groups.checkout_url`
- League preferences: `group_league_preferences` (group_id, league_name, enabled)
- Multi-tenant RLS: todas as queries filtram por group_id
- Migrations: `sql/migrations/` com numeração sequencial (atual: 061+)

### Integration Points
- `distributeBets.js` precisa checar acesso a ligas extras antes de distribuir
- Webhook handler precisa processar pagamentos de ligas extras
- Admin panel precisa de nova página/seção para checkout de ligas
- `league_seasons.tier` precisa ser adicionado via migration

</code_context>

<specifics>
## Specific Ideas

- Group admin vê painel com ligas disponíveis divididas em "Incluídas" e "Extras (R$200/mês cada)"
- Seleção de múltiplas ligas extras em um único checkout
- Super admin tem tela para classificar ligas e definir preços
- Desconto aplicado no admin panel pelo super admin, refletido no preço final do checkout

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
