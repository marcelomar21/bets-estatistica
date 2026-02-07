---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain-skipped', 'step-06-innovation-skipped', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish']
inputDocuments:
  - _bmad-output/project-context.md
  - docs/index.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/data-models.md
  - docs/development-guide.md
  - docs/metrics.md
  - docs/source-tree-analysis.md
workflowType: 'prd'
projectType: 'brownfield'
documentCounts:
  brief: 0
  research: 0
  brainstorming: 0
  projectDocs: 8
classification:
  projectType: 'API Backend + Web App + Multi-Bot Automation'
  domain: 'Betting/Gambling + SaaS Multi-tenant'
  complexity: 'high'
  projectContext: 'brownfield'
architectureDecisions:
  multiTenant: 'Banco único com group_id + middleware obrigatório + Supabase RLS'
  botDeployment: '1 processo = 1 bot (serviços separados no Render)'
  adminPanel: 'Next.js + Supabase Auth + Vercel'
  betDistribution: 'Round-robin com audit log'
premortemActions:
  - 'external_reference no Mercado Pago com group_id'
  - 'Middleware obrigatório WHERE group_id'
  - 'Health check por bot com alerta'
  - 'Link de checkout único por influencer'
  - 'Onboarding em ≤5 cliques'
stakeholderDecisions:
  influencerVeto: false
  auditTrail: true
  instantAccess: true
---

# Product Requirements Document - bets-estatistica

**Author:** Marcelomendes
**Date:** 2026-02-04

## Project Classification

| Aspecto | Valor |
|---------|-------|
| **Tipo** | API Backend + Web App + Multi-Bot Automation |
| **Domínio** | Betting/Gambling + SaaS Multi-tenant |
| **Complexidade** | Alta |
| **Contexto** | Brownfield (estendendo sistema existente) |

## Executive Summary

**Objetivo:** Transformar o sistema atual de apostas (single-group) em uma plataforma SaaS multi-tenant para múltiplos influencers.

**Escopo MVP (Semana 1):** 3 influencers operando independentemente, cada um com seu próprio bot Telegram, grupo de membros e painel admin. Sistema 100% automatizado - postagem de apostas, trial de 7 dias, kick automático, pagamento via Mercado Pago com acesso instantâneo.

**Meta de Negócio (3 meses):** 9.000 membros pagantes (3k/grupo), MRR de R$450.000, churn < 10%.

**Arquitetura:** Banco único com `group_id` + RLS + middleware obrigatório. 1 bot = 1 processo no Render. Admin panel em Next.js + Supabase Auth no Vercel.

**Diferencial:** Onboarding de novo influencer em ≤5 cliques. Zero intervenção manual na operação diária.

## Success Criteria

### Sucesso do Influencer

| Critério | Meta | Descrição |
|----------|------|-----------|
| **Receita mensal** | ≥ R$60.000 (em 3 meses) | 3.000 membros × R$50 × 40% = R$60k/mês |
| **Zero dor de cabeça** | Painel self-service | Não precisa pedir nada pro Super Admin |
| **Visibilidade** | Dashboard próprio | Vê membros, faturamento, vencimentos |
| **Confiança** | Dados isolados | Garantia que concorrente não vê seus dados |

### Sucesso de Negócio

| Período | Membros/Grupo | Total (3 grupos) | MRR Total | Parte Fundadores (40%) |
|---------|---------------|------------------|-----------|------------------------|
| **3 meses** | 3.000 | 9.000 | R$450.000 | R$180.000 |
| **12 meses** | 10.000 | 30.000 | R$1.500.000 | R$600.000 |

| Métrica | Meta |
|---------|------|
| **Churn mensal** | < 10% |
| **Conversão trial → pago** | > 30% |
| **Onboarding novo influencer** | < 1 hora (≤5 cliques) |

### Sucesso Técnico

| Aspecto | Critério | Prioridade |
|---------|----------|------------|
| **Postagem de apostas** | 100% nos horários programados | P0 |
| **Pagamento → Acesso** | Instantâneo (< 30 segundos) | P0 |
| **Gestão de usuários** | Kick automático funciona 100% | P0 |
| **Isolamento multi-tenant** | Zero vazamento de dados entre grupos | P0 |
| **Uptime dos bots** | 99.9% nos horários de postagem | P0 |
| **Health monitoring** | Alerta em < 5 min se bot cair | P1 |

### Measurable Outcomes

**Para declarar a plataforma um sucesso em 3 meses:**

1. ✅ 3 influencers operando independentemente
2. ✅ 9.000 membros pagantes totais (3k por grupo)
3. ✅ MRR de R$450.000
4. ✅ Churn < 10%
5. ✅ Zero incidentes de vazamento de dados
6. ✅ 100% das postagens enviadas no horário
7. ✅ Influencers conseguem operar sem suporte

## Product Scope

### MVP - Semana 1 (Lançamento com 3 Influencers)

| Componente | Escopo |
|------------|--------|
| **3 Bots Telegram** | Configurados e rodando |
| **Multi-tenant DB** | group_id + middleware + RLS |
| **Painel Admin** | Next.js + Supabase Auth |
| **→ Super Admin** | Todos grupos, pool bots, onboarding |
| **→ Admin Grupo** | Só seu grupo, membros, vencimentos |
| **Gestão Membros** | Lista, status, vencimentos |
| **Gestão Odds/Links** | Individual e bulk |
| **Distribuição Apostas** | Round-robin automático |
| **Mercado Pago** | Webhook multi-tenant |
| **Health Check** | Por bot, com alertas |

### Growth Features (Pós-Lançamento)

| Feature | Trigger |
|---------|---------|
| **Dashboard de métricas** | Após 1º mês estável |
| **Tela "Meu Faturamento"** | Quando influencer pedir |
| **Relatório exportável** | Quando intermediadora pedir |
| **Audit trail visual** | Quando tiver disputa |
| **Multi-bot em 1 processo** | Quando > 10 influencers |

### Vision (Futuro)

- App mobile pra influencer gerenciar
- Onboarding 100% self-service (influencer cria sozinho)
- Marketplace de influencers
- White-label por influencer (bot com nome/marca dele)

## User Journeys

### Journey 1: Marcelo - Onboarding de Novo Influencer

**Cena de Abertura:**
Marcelo recebe mensagem: "Fechamos com a Bianca! Ela tem 500k seguidores e quer começar amanhã."

**A Jornada:**
1. Abre o painel admin
2. Clica em "Novo Influencer"
3. Seleciona um bot do pool (vê: "8 bots disponíveis")
4. Preenche: Nome, @telegram, email
5. Sistema cria automaticamente:
   - Tenant no banco
   - Link de checkout Mercado Pago
   - Usuário admin pra Bianca
6. Marcelo envia pra Bianca: link do bot + login do painel
7. **Tempo total: < 10 minutos**

**Resolução:**
Bianca já consegue logar no painel e ver "0 membros - aguardando primeiro pagamento"

---

### Journey 2: Lucas - Membro Entra e Paga (Happy Path)

**Cena de Abertura:**
Lucas, 28 anos, vê um story da Bianca: "Grupo VIP de apostas - 70% de acerto! Link na bio." Ele clica.

**A Jornada:**
1. Clica no link → abre o bot da Bianca no Telegram
2. Bot manda: "Bem-vindo! 🎯 Clique abaixo pra entrar no grupo VIP"
3. Lucas clica → é adicionado ao grupo
4. Bot manda DM: "Você tem 7 dias grátis! Pra continuar após o trial: [link checkout]"
5. Lucas curte as dicas por 5 dias
6. Dia 5: Bot manda lembrete "Seu trial acaba em 2 dias! [link checkout]"
7. Lucas clica, paga R$50 via PIX no Mercado Pago
8. **< 30 segundos depois:** Bot manda "✅ Pagamento confirmado! Acesso liberado até DD/MM/AAAA"
9. Lucas continua no grupo, feliz

**Resolução:**
Lucas virou membro pagante. Bianca ganhou um subscriber. Sistema registrou tudo automaticamente.

---

### Journey 3: Pedro - Membro Não Paga e É Removido

**Cena de Abertura:**
Pedro entrou no grupo pelo mesmo link, mas não tem grana pra pagar agora.

**A Jornada:**
1. Pedro entra no grupo, recebe boas-vindas, curte as dicas grátis
2. Dia 5: Bot manda "Seu trial acaba em 2 dias! [link checkout]" → Pedro ignora
3. Dia 6: Bot manda "Último dia amanhã! Garanta seu acesso [link checkout]" → Pedro ignora
4. Dia 7: Bot manda "⚠️ Seu acesso expira hoje à meia-noite"
5. Dia 8, 00:01: Sistema executa kick automático
6. Pedro tenta acessar o grupo → "Você foi removido"
7. Bot manda DM: "Seu trial expirou. Quer voltar? [link checkout]"

**Resolução:**
Pedro foi removido sem intervenção manual. Se pagar depois, volta automaticamente.

---

### Journey 4: Bianca - Influencer Confere Seus Números

**Cena de Abertura:**
Bianca quer saber quanto vai receber esse mês. É sexta-feira, dia de conferir.

**A Jornada:**
1. Bianca abre o painel admin (link que Marcelo mandou)
2. Faz login com email/senha (Supabase Auth)
3. Vê dashboard DO SEU GRUPO apenas:
   - **Membros ativos:** 847
   - **Em trial:** 23
   - **Vencendo em 7 dias:** 45
4. Vê lista de membros com status e data de vencimento
5. Pensa: "Preciso postar mais pra converter esses 23 em trial"
6. **(Fase 2):** Vê aba "Meu Faturamento" → R$42.350 no mês (40% dela)

**Resolução:**
Bianca tem visibilidade total do SEU grupo, sem precisar perguntar pro Marcelo. Não vê nada dos outros influencers.

---

### Journey 5: Marcelo - Bot Caiu às 3h da Manhã

**Cena de Abertura:**
São 3h17 da manhã. O bot da Bianca travou no Render.

**A Jornada:**
1. Health check detecta: "Bot Bianca offline há 2 minutos"
2. Sistema envia alerta:
   - Push notification no celular do Marcelo
   - Mensagem no grupo admin de super admins
3. Marcelo acorda, vê o alerta
4. Abre painel admin → vê dashboard de saúde dos bots
   - ✅ Bot João: online
   - ✅ Bot Carlos: online
   - ❌ Bot Bianca: **OFFLINE** há 5 min
5. Clica em "Reiniciar Bot Bianca"
6. Sistema faz restart no Render
7. 30 segundos depois: Bot Bianca volta ✅
8. Alerta de recuperação: "Bot Bianca online novamente"

**Resolução:**
Problema detectado e resolvido em < 10 minutos. Nenhum membro percebeu. Bianca nem ficou sabendo.

---

### Journey Requirements Summary

| Jornada | Capacidades Reveladas |
|---------|----------------------|
| **Onboarding Influencer** | Painel admin, pool de bots, criação de tenant, checkout automático |
| **Membro Happy Path** | Bot Telegram, trial automático, webhook Mercado Pago, acesso instantâneo |
| **Membro Não Pagou** | Lembretes automáticos, kick automático, mensagem de recuperação |
| **Influencer Dashboard** | Painel por grupo, lista de membros, métricas isoladas, RLS |
| **Bot Caiu** | Health check, alertas, dashboard de status, restart remoto |

## Backend + Web App Specific Requirements

### Arquitetura Técnica

| Componente | Tecnologia | Decisão |
|------------|------------|---------|
| **Admin Panel** | Next.js (App Router) | API Routes integradas |
| **Autenticação** | Supabase Auth | RLS por grupo |
| **Database** | Supabase PostgreSQL | Multi-tenant com `group_id` |
| **Bots** | Node.js + node-telegram-bot-api | 1 processo por bot no Render |
| **Pagamentos** | Mercado Pago | Webhook existente, adaptar pra multi-tenant |
| **Real-time** | Não | Reload manual (simplicidade) |
| **Notificações** | Telegram apenas | Alertas no grupo admin |

### Arquitetura de Permissões

| Role | group_id | Acesso |
|------|----------|--------|
| `super_admin` | `null` | Todos os grupos |
| `group_admin` | `uuid` | Apenas seu grupo (RLS automático) |

### API Routes (Next.js)

| Rota | Método | Descrição | Acesso |
|------|--------|-----------|--------|
| `/api/groups` | GET | Lista grupos | Super Admin |
| `/api/groups` | POST | Cria novo grupo (onboarding) | Super Admin |
| `/api/groups/[id]/members` | GET | Lista membros do grupo | Super + Group Admin |
| `/api/groups/[id]/bets` | GET | Lista apostas do grupo | Super + Group Admin |
| `/api/bets/odds` | PUT | Atualiza odds (bulk) | Super Admin |
| `/api/bets/links` | PUT | Atualiza links (bulk) | Super Admin |
| `/api/bots` | GET | Lista bots (pool + em uso) | Super Admin |
| `/api/bots/[id]/restart` | POST | Reinicia bot | Super Admin |
| `/api/health` | GET | Status de todos os bots | Super Admin |

### Modelo de Dados - Novas Tabelas

**Tabela `groups`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `name` | varchar | Nome do influencer/grupo |
| `bot_token` | varchar | Token do bot Telegram (criptografado) |
| `telegram_group_id` | bigint | ID do grupo público |
| `telegram_admin_group_id` | bigint | ID do grupo admin |
| `checkout_url` | varchar | Link Mercado Pago |
| `status` | enum | `active`, `paused`, `inactive` |
| `created_at` | timestamp | Criação |

**Tabela `admin_users`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK (= Supabase Auth user id) |
| `email` | varchar | Email do admin |
| `role` | enum | `super_admin`, `group_admin` |
| `group_id` | uuid | FK → groups (null pra super) |

**Tabela `bot_pool`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `bot_token` | varchar | Token do BotFather (criptografado) |
| `bot_username` | varchar | @username do bot |
| `status` | enum | `available`, `in_use` |
| `group_id` | uuid | FK → groups (quando em uso) |

### Alterações em Tabelas Existentes

**Tabela `members`** - adicionar:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `group_id` | uuid | FK → groups |

**Tabela `suggested_bets`** - adicionar:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `group_id` | uuid | FK → groups (após distribuição) |
| `distributed_at` | timestamp | Quando foi distribuída |

### Requisitos de Segurança

| Requisito | Prioridade | Implementação |
|-----------|------------|---------------|
| **RLS obrigatório** | P0 | Row Level Security em TODAS tabelas com `group_id` |
| **Middleware de tenant** | P0 | Toda rota API valida `group_id` do JWT |
| **Validação webhook MP** | P0 | HMAC signature do Mercado Pago |
| **Role imutável via API** | P0 | Usuário não pode alterar próprio role |
| **Bot tokens criptografados** | P1 | Encrypt at rest no banco |
| **Audit log** | P1 | Registrar: quem, quando, o quê |
| **Rate limiting** | P1 | Prevenir abuse da API |

### Padrão de Código Seguro (Obrigatório)

```javascript
// Middleware de tenant - TODA rota passa por aqui
function tenantMiddleware(req, res, next) {
  const user = req.user; // do JWT

  if (user.role === 'super_admin') {
    req.groupFilter = null; // vê tudo
  } else {
    req.groupFilter = user.group_id; // SÓ seu grupo
  }

  next();
}
```

## Project Scoping & Phased Development

### MVP Strategy

| Aspecto | Decisão |
|---------|---------|
| **Abordagem** | Platform MVP - Infraestrutura completa D1 |
| **Timeline** | Semana 1 (Dia 1 = tudo funcionando) |
| **Filosofia** | "Se não funciona automatizado, não lança" |

### MVP Feature Set - Dia 1 (Obrigatório)

| # | Funcionalidade | Jornada que Suporta |
|---|----------------|---------------------|
| 1 | 3 Bots Telegram configurados | Todas |
| 2 | Multi-tenant DB com RLS | Isolamento de dados |
| 3 | Painel Super Admin | Onboarding, Health |
| 4 | Painel Admin de Grupo | Influencer Dashboard |
| 5 | Lista de membros | Influencer Dashboard |
| 6 | Gestão de odds (bulk) | Operação diária |
| 7 | Gestão de links (bulk) | Operação diária |
| 8 | Distribuição round-robin | Apostas por grupo |
| 9 | Webhook Mercado Pago multi-tenant | Membro Happy Path |
| 10 | Acesso instantâneo pós-pagamento | Membro Happy Path |
| 11 | Trial 7 dias + lembretes | Membro Happy Path |
| 12 | Kick automático | Membro Não Pagou |
| 13 | Health check por bot | Bot Caiu |
| 14 | Alertas no Telegram | Bot Caiu |
| 15 | Onboarding de influencer (≤5 cliques) | Onboarding |
| 16 | Pool de bots | Onboarding |
| 17 | Middleware de segurança tenant | Segurança |

### Phase 2 - Mês 1 (Pós-Lançamento)

| Feature | Trigger |
|---------|---------|
| Dashboard de métricas | Após estabilizar |
| Tela "Meu Faturamento" | Quando influencer pedir |
| Relatório exportável | Quando intermediadora pedir |
| Audit log visual | Se tiver disputa |

### Phase 3 - Escala (Quando > 10 influencers)

| Feature | Trigger |
|---------|---------|
| Multi-bot em 1 processo | Custo de Render alto |
| Onboarding 100% self-service | Volume alto de influencers |
| App mobile pra influencer | Demanda |
| White-label | Premium tier |

### Risk Mitigation Strategy

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| **Timeline apertado** | Alta | Foco total, sem scope creep |
| **Bug em produção** | Média | Monitoramento ativo D1-D7 |
| **Bot cai** | Média | Health check + alerta + restart |
| **Vazamento multi-tenant** | Baixa | RLS + middleware + testes |
| **Webhook falha** | Baixa | Validação HMAC + logs |

### Recursos Necessários (MVP)

| Recurso | Quantidade |
|---------|------------|
| Dev Full-stack | 1 |
| Bots pré-criados | 5+ (pool) |
| Contas Render | 3 serviços |
| Supabase | 1 projeto |
| Vercel | 1 projeto |
| Mercado Pago | Já configurado |

## Functional Requirements

### Gestão de Grupos (Multi-tenant)

- **FR1:** Super Admin pode criar um novo grupo/influencer
- **FR2:** Super Admin pode visualizar lista de todos os grupos
- **FR3:** Super Admin pode editar configurações de um grupo
- **FR4:** Super Admin pode pausar ou desativar um grupo
- **FR5:** Sistema pode isolar dados de cada grupo (um grupo não vê dados de outro)

### Gestão de Membros

- **FR6:** Sistema pode registrar novo membro quando entra no grupo Telegram com status `trial`
- **FR7:** Membro entra em trial gerenciado pelo Mercado Pago (período grátis da assinatura). Sistema registra status `trial` internamente.
- **FR8:** ~~Sistema envia lembrete dia 5~~ → Delegado ao Mercado Pago (e-mails automáticos de assinatura)
- **FR9:** ~~Sistema envia lembrete dia 6~~ → Delegado ao Mercado Pago
- **FR10:** ~~Sistema envia lembrete dia 7~~ → Delegado ao Mercado Pago
- **FR11:** Sistema pode remover (kick) membro cuja assinatura expirou/cancelou no Mercado Pago
- **FR12:** Sistema pode conceder acesso instantâneo após confirmação de pagamento
- **FR13:** Admin de Grupo pode visualizar lista de membros do seu grupo
- **FR14:** Admin de Grupo pode ver status de cada membro (trial, ativo, vencendo)
- **FR15:** Admin de Grupo pode ver data de vencimento de cada membro
- **FR16:** Super Admin pode visualizar membros de qualquer grupo

### Gestão de Apostas

- **FR17:** Sistema pode gerar pool de apostas (existente)
- **FR18:** Sistema pode distribuir apostas para grupos via round-robin
- **FR19:** Sistema pode registrar qual aposta foi para qual grupo
- **FR20:** Super Admin pode visualizar todas as apostas e sua distribuição
- **FR21:** Super Admin pode atualizar odds de apostas (individual)
- **FR22:** Super Admin pode atualizar odds de apostas (em lote/bulk)
- **FR23:** Super Admin pode adicionar links de apostas (individual)
- **FR24:** Super Admin pode adicionar links de apostas (em lote/bulk)
- **FR25:** Bot pode postar apostas no grupo Telegram nos horários programados

### Gestão de Bots

- **FR26:** Super Admin pode visualizar pool de bots disponíveis
- **FR27:** Super Admin pode visualizar bots em uso e seus grupos
- **FR28:** Super Admin pode associar bot do pool a um novo grupo
- **FR29:** Sistema pode monitorar status de cada bot (health check)
- **FR30:** Sistema pode detectar quando um bot fica offline
- **FR31:** Sistema pode enviar alerta quando bot fica offline
- **FR32:** Super Admin pode reiniciar um bot remotamente
- **FR33:** Super Admin pode ver quantidade de bots disponíveis vs em uso

### Painel Admin - Super Admin

- **FR34:** Super Admin pode fazer login no painel
- **FR35:** Super Admin pode ver dashboard consolidado de todos os grupos
- **FR36:** Super Admin pode acessar tela de onboarding de novo influencer
- **FR37:** Super Admin pode completar onboarding em até 5 passos
- **FR38:** Super Admin pode ver alertas e notificações do sistema

### Painel Admin - Admin de Grupo

- **FR39:** Admin de Grupo pode fazer login no painel
- **FR40:** Admin de Grupo pode ver dashboard apenas do seu grupo
- **FR41:** Admin de Grupo pode ver contagem de membros (total, trial, ativos)
- **FR42:** Admin de Grupo pode ver lista de membros com vencimentos
- **FR43:** Admin de Grupo não pode ver dados de outros grupos

### Pagamentos (Mercado Pago)

- **FR44:** Sistema pode receber webhook de pagamento/assinatura do Mercado Pago
- **FR45:** Sistema pode validar assinatura (HMAC) do webhook
- **FR46:** Sistema pode identificar qual grupo o pagamento pertence
- **FR47:** Sistema pode processar eventos: pagamento aprovado, assinatura cancelada, trial expirado
- **FR48:** Sistema pode atualizar status do membro após eventos do MP (trial → active, active → expired)
- **FR49:** Cada grupo pode ter seu próprio link de checkout (assinatura com trial no MP)

### Notificações

- **FR50:** Bot pode enviar mensagem de boas-vindas ao novo membro
- **FR51:** ~~Bot envia lembretes de pagamento via DM~~ → Delegado ao Mercado Pago (e-mails automáticos de assinatura)
- **FR52:** Bot pode enviar confirmação de pagamento
- **FR53:** Bot pode enviar mensagem de remoção com link pra voltar
- **FR54:** Sistema pode enviar alertas pra Super Admin via Telegram

### Segurança

- **FR55:** Sistema pode autenticar usuários via Supabase Auth
- **FR56:** Sistema pode aplicar Row Level Security por grupo
- **FR57:** Sistema pode validar permissões em cada requisição de API
- **FR58:** Sistema pode impedir que Admin de Grupo altere seu próprio role

## Non-Functional Requirements

### Performance

| NFR | Métrica | Prioridade |
|-----|---------|------------|
| **NFR-P1** | Postagem de apostas inicia no máximo 30 segundos após horário programado | P0 |
| **NFR-P2** | Acesso de membro liberado em < 30 segundos após confirmação de pagamento | P0 |
| **NFR-P3** | Painel admin carrega em < 3 segundos (first contentful paint) | P1 |
| **NFR-P4** | Lista de membros carrega em < 2 segundos (até 10k registros) | P1 |
| **NFR-P5** | Bulk update de odds/links processa em < 5 segundos (até 50 itens) | P1 |

### Security

| NFR | Requisito | Prioridade |
|-----|-----------|------------|
| **NFR-S1** | Isolamento de dados: 0 vazamentos entre tenants (validado por testes automatizados) | P0 |
| **NFR-S2** | Tokens de bot criptografados at rest (AES-256 ou equivalente) | P0 |
| **NFR-S3** | Webhook Mercado Pago validado via HMAC em 100% das requisições | P0 |
| **NFR-S4** | Sessões admin expiram em 24 horas sem atividade | P1 |
| **NFR-S5** | Audit log de ações críticas (onboarding, kick, pagamento) retido por 90 dias | P1 |
| **NFR-S6** | Rate limiting: máximo 100 requisições/minuto por usuário | P1 |

### Scalability

| NFR | Requisito | Horizonte |
|-----|-----------|-----------|
| **NFR-SC1** | Suportar 3 grupos com 10k membros cada (30k total) sem degradação | Dia 1 |
| **NFR-SC2** | Escalar para 10 influencers sem mudança de arquitetura | 3 meses |
| **NFR-SC3** | Suportar pico de 1000 novos membros/hora (lançamento de influencer) | Dia 1 |
| **NFR-SC4** | Banco de dados dimensionado para 100k membros totais | 6 meses |

### Reliability

| NFR | Requisito | Prioridade |
|-----|-----------|------------|
| **NFR-R1** | Uptime de bots ≥ 99.9% durante horários de postagem (7h-23h) | P0 |
| **NFR-R2** | Health check detecta bot offline em ≤ 2 minutos | P0 |
| **NFR-R3** | Alerta de bot offline enviado em ≤ 5 minutos da detecção | P0 |
| **NFR-R4** | Tempo médio de recuperação (MTTR) de bot ≤ 10 minutos | P1 |
| **NFR-R5** | Webhook Mercado Pago com retry automático (3 tentativas) | P1 |
| **NFR-R6** | Painel admin disponível 99% do tempo | P2 |

### Integration

| NFR | Requisito | Prioridade |
|-----|-----------|------------|
| **NFR-I1** | Compatível com Telegram Bot API v6.x+ | P0 |
| **NFR-I2** | Webhook Mercado Pago v2 suportado | P0 |
| **NFR-I3** | Funciona com Supabase Auth (JWT padrão) | P0 |
| **NFR-I4** | Deploy automatizado via Render (1 serviço por bot) | P1 |
| **NFR-I5** | Graceful degradation: se Mercado Pago timeout, retry + log | P1 |

## Document History

| Data | Versão | Mudança |
|------|--------|---------|
| 2026-02-04 | 1.0 | PRD inicial criado via BMAD workflow |

---

**Total de Requisitos:**
- 58 Functional Requirements (FRs)
- 22 Non-Functional Requirements (NFRs)
- 5 User Journeys documentadas
- 17 features MVP obrigatórias para D1

