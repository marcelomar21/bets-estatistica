---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
completedAt: '2026-02-06'
epicCount: 6
storyCount: 27
frsTotal: 62
frsCovered: 58
frsDelegatedToMP: 4
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture-multitenant.md
workflowType: 'epics-and-stories'
projectType: 'brownfield'
project_name: 'bets-estatistica'
scope: 'SaaS Multi-tenant Platform'
---

# bets-estatistica - Epic Breakdown

## Overview

Este documento contém o breakdown completo de épicos e stories para a plataforma SaaS Multi-tenant do bets-estatistica, transformando os requisitos do PRD e decisões da Arquitetura em stories implementáveis.

**Escopo:** Transformar o sistema single-group existente em plataforma multi-tenant para múltiplos influencers.

## Requirements Inventory

### Functional Requirements

**Gestão de Grupos (Multi-tenant)**
- FR1: Super Admin pode criar um novo grupo/influencer
- FR2: Super Admin pode visualizar lista de todos os grupos
- FR3: Super Admin pode editar configurações de um grupo
- FR4: Super Admin pode pausar ou desativar um grupo
- FR5: Sistema pode isolar dados de cada grupo (um grupo não vê dados de outro)

**Gestão de Membros**
- FR6: Sistema pode registrar novo membro quando entra no grupo Telegram com status `trial`
- FR7: Membro entra em trial gerenciado pelo Mercado Pago. Sistema registra status `trial` internamente.
- ~~FR8: Lembrete dia 5~~ → Delegado ao Mercado Pago
- ~~FR9: Lembrete dia 6~~ → Delegado ao Mercado Pago
- ~~FR10: Lembrete dia 7~~ → Delegado ao Mercado Pago
- FR11: Sistema pode remover (kick) membro cuja assinatura expirou/cancelou no MP
- FR12: Sistema pode conceder acesso instantâneo após confirmação de pagamento
- FR13: Admin de Grupo pode visualizar lista de membros do seu grupo
- FR14: Admin de Grupo pode ver status de cada membro (trial, ativo, vencendo)
- FR15: Admin de Grupo pode ver data de vencimento de cada membro
- FR16: Super Admin pode visualizar membros de qualquer grupo

**Gestão de Apostas**
- FR17: Sistema pode gerar pool de apostas (existente)
- FR18: Sistema pode distribuir apostas para grupos via round-robin
- FR19: Sistema pode registrar qual aposta foi para qual grupo
- FR20: Super Admin pode visualizar todas as apostas e sua distribuição
- FR21: Super Admin pode atualizar odds de apostas (individual)
- FR22: Super Admin pode atualizar odds de apostas (em lote/bulk)
- FR23: Super Admin pode adicionar links de apostas (individual)
- FR24: Super Admin pode adicionar links de apostas (em lote/bulk)
- FR25: Bot pode postar apostas no grupo Telegram nos horários programados

**Gestão de Bots**
- FR26: Super Admin pode visualizar pool de bots disponíveis
- FR27: Super Admin pode visualizar bots em uso e seus grupos
- FR28: Super Admin pode associar bot do pool a um novo grupo
- FR29: Sistema pode monitorar status de cada bot (health check)
- FR30: Sistema pode detectar quando um bot fica offline
- FR31: Sistema pode enviar alerta quando bot fica offline
- FR32: Super Admin pode reiniciar um bot remotamente
- FR33: Super Admin pode ver quantidade de bots disponíveis vs em uso

**Painel Admin - Super Admin**
- FR34: Super Admin pode fazer login no painel
- FR35: Super Admin pode ver dashboard consolidado de todos os grupos
- FR36: Super Admin pode acessar tela de onboarding de novo influencer
- FR37: Super Admin pode completar onboarding em até 5 passos
- FR38: Super Admin pode ver alertas e notificações do sistema

**Painel Admin - Admin de Grupo**
- FR39: Admin de Grupo pode fazer login no painel
- FR40: Admin de Grupo pode ver dashboard apenas do seu grupo
- FR41: Admin de Grupo pode ver contagem de membros (total, trial, ativos)
- FR42: Admin de Grupo pode ver lista de membros com vencimentos
- FR43: Admin de Grupo não pode ver dados de outros grupos

**Pagamentos (Mercado Pago)**
- FR44: Sistema pode receber webhook de pagamento do Mercado Pago
- FR45: Sistema pode validar assinatura (HMAC) do webhook
- FR46: Sistema pode identificar qual grupo o pagamento pertence
- FR47: Sistema pode processar evento de pagamento aprovado
- FR48: Sistema pode atualizar status do membro após pagamento
- FR49: Cada grupo pode ter seu próprio link de checkout

**Notificações**
- FR50: Bot pode enviar mensagem de boas-vindas ao novo membro
- ~~FR51: Lembretes de pagamento via DM~~ → Delegado ao Mercado Pago
- FR52: Bot pode enviar confirmação de pagamento
- FR53: Bot pode enviar mensagem de remoção com link pra voltar
- FR54: Sistema pode enviar alertas pra Super Admin via Telegram

**Automação Telegram**
- FR59: Sistema pode criar grupo/supergrupo no Telegram automaticamente via MTProto (conta do founder)
- FR60: Sistema pode adicionar bot do pool como admin do grupo Telegram criado
- FR61: Bot Super Admin pode enviar convites de novos grupos para os founders automaticamente
- FR62: Sistema pode enviar convite do grupo Telegram para o dono (influencer) e outras pessoas configuráveis

**Segurança**
- FR55: Sistema pode autenticar usuários via Supabase Auth
- FR56: Sistema pode aplicar Row Level Security por grupo
- FR57: Sistema pode validar permissões em cada requisição de API
- FR58: Sistema pode impedir que Admin de Grupo altere seu próprio role

### NonFunctional Requirements

**Performance**
- NFR-P1: Postagem de apostas inicia no máximo 30 segundos após horário programado (P0)
- NFR-P2: Acesso de membro liberado em < 30 segundos após confirmação de pagamento (P0)
- NFR-P3: Painel admin carrega em < 3 segundos (first contentful paint) (P1)
- NFR-P4: Lista de membros carrega em < 2 segundos (até 10k registros) (P1)
- NFR-P5: Bulk update de odds/links processa em < 5 segundos (até 50 itens) (P1)

**Security**
- NFR-S1: Isolamento de dados: 0 vazamentos entre tenants (validado por testes automatizados) (P0)
- NFR-S2: Tokens de bot criptografados at rest (AES-256 ou equivalente) (P0)
- NFR-S3: Webhook Mercado Pago validado via HMAC em 100% das requisições (P0)
- NFR-S4: Sessões admin expiram em 24 horas sem atividade (P1)
- NFR-S5: Audit log de ações críticas retido por 90 dias (P1)
- NFR-S6: Rate limiting: máximo 100 requisições/minuto por usuário (P1)

**Scalability**
- NFR-SC1: Suportar 3 grupos com 10k membros cada (30k total) sem degradação (Dia 1)
- NFR-SC2: Escalar para 10 influencers sem mudança de arquitetura (3 meses)
- NFR-SC3: Suportar pico de 1000 novos membros/hora (lançamento de influencer) (Dia 1)
- NFR-SC4: Banco de dados dimensionado para 100k membros totais (6 meses)

**Reliability**
- NFR-R1: Uptime de bots >= 99.9% durante horários de postagem (7h-23h) (P0)
- NFR-R2: Health check detecta bot offline em <= 2 minutos (P0)
- NFR-R3: Alerta de bot offline enviado em <= 5 minutos da detecção (P0)
- NFR-R4: Tempo médio de recuperação (MTTR) de bot <= 10 minutos (P1)
- NFR-R5: Webhook Mercado Pago com retry automático (3 tentativas) (P1)
- NFR-R6: Painel admin disponível 99% do tempo (P2)

**Integration**
- NFR-I1: Compatível com Telegram Bot API v6.x+ (P0)
- NFR-I2: Webhook Mercado Pago v2 suportado (P0)
- NFR-I3: Funciona com Supabase Auth (JWT padrão) (P0)
- NFR-I4: Deploy automatizado via Render (1 serviço por bot) (P1)
- NFR-I5: Graceful degradation: se Mercado Pago timeout, retry + log (P1)

### Additional Requirements

**Da Arquitetura:**
- Starter template para Admin Panel: `npx create-next-app@latest admin-panel --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
- Migration SQL necessária: criar tabelas `groups`, `admin_users`, `bot_pool`, `bot_health`
- Adicionar `group_id` (FK → groups) nas tabelas `members` e `suggested_bets`
- RLS policies obrigatórias em todas as tabelas com `group_id`
- Middleware de tenant (`withTenant()`) obrigatório em toda API Route do admin panel
- Onboarding automático: integração com MP API (criar produto) + Render API (deploy bot) + Supabase Auth (criar admin)
- Health check pattern: bot pinga Supabase a cada 60 segundos via `bot_health`
- Restart remoto via flag `restart_requested` no Supabase → bot faz `process.exit(1)` → Render reinicia
- Dois repositórios: `bets-estatistica` (bots existentes) + `admin-panel` (Next.js novo)
- Sequência recomendada: Migration → RLS → Admin Panel básico → Adaptar Bots → Onboarding → Health Check
- Identificação de grupo no Mercado Pago: produto por grupo (cada influencer tem seu próprio produto no MP)
- Distribuição de apostas: pool global → round-robin entre grupos ativos

### FR Coverage Map

- FR1: Epic 1 - Criar novo grupo/influencer (migration + API)
- FR2: Epic 1 - Listar todos os grupos (API + UI)
- FR3: Epic 2 - Editar configurações de grupo
- FR4: Epic 2 - Pausar/desativar grupo
- FR5: Epic 1 - Isolamento de dados (RLS + middleware)
- FR6: Epic 3 - Registrar novo membro no Telegram
- FR7: Epic 4 - Trial gerenciado pelo MP, sistema registra status `trial`
- ~~FR8: Delegado ao Mercado Pago~~
- ~~FR9: Delegado ao Mercado Pago~~
- ~~FR10: Delegado ao Mercado Pago~~
- FR11: Epic 4 - Kick automático por expiração de assinatura no MP
- FR12: Epic 4 - Acesso instantâneo pós-pagamento
- FR13: Epic 3 - Admin de Grupo visualiza membros
- FR14: Epic 3 - Admin de Grupo vê status dos membros
- FR15: Epic 3 - Admin de Grupo vê vencimentos
- FR16: Epic 3 - Super Admin visualiza membros de qualquer grupo
- FR17: Epic 5 - Gerar pool de apostas (existente)
- FR18: Epic 5 - Distribuir apostas via round-robin
- FR19: Epic 5 - Registrar qual aposta foi para qual grupo
- FR20: Epic 5 - Visualizar apostas e distribuição
- FR21: Epic 5 - Atualizar odds (individual)
- FR22: Epic 5 - Atualizar odds (bulk)
- FR23: Epic 5 - Adicionar links (individual)
- FR24: Epic 5 - Adicionar links (bulk)
- FR25: Epic 5 - Bot posta apostas no grupo Telegram
- FR26: Epic 2 - Visualizar pool de bots
- FR27: Epic 2 - Visualizar bots em uso
- FR28: Epic 2 - Associar bot a novo grupo
- FR29: Epic 6 - Monitorar status de cada bot
- FR30: Epic 6 - Detectar bot offline
- FR31: Epic 6 - Enviar alerta de bot offline
- FR32: Epic 6 - Reiniciar bot remotamente
- FR33: Epic 2 - Ver quantidade bots disponíveis vs em uso
- FR34: Epic 1 - Super Admin login no painel
- FR35: Epic 2 - Dashboard consolidado de todos os grupos
- FR36: Epic 2 - Tela de onboarding de influencer
- FR37: Epic 2 - Onboarding em até 5 passos
- FR38: Epic 2 - Ver alertas e notificações
- FR39: Epic 3 - Admin de Grupo login no painel
- FR40: Epic 3 - Dashboard apenas do seu grupo
- FR41: Epic 3 - Contagem de membros (total, trial, ativos)
- FR42: Epic 3 - Lista de membros com vencimentos
- FR43: Epic 3 - Não pode ver dados de outros grupos
- FR44: Epic 4 - Receber webhook Mercado Pago
- FR45: Epic 4 - Validar HMAC do webhook
- FR46: Epic 4 - Identificar grupo do pagamento
- FR47: Epic 4 - Processar pagamento aprovado
- FR48: Epic 4 - Atualizar status do membro
- FR49: Epic 2 - Link de checkout próprio por grupo
- FR50: Epic 4 - Mensagem de boas-vindas
- ~~FR51: Delegado ao Mercado Pago~~
- FR52: Epic 4 - Confirmação de pagamento
- FR53: Epic 4 - Mensagem de remoção com link
- FR54: Epic 6 - Alertas pra Super Admin via Telegram
- FR55: Epic 1 - Autenticação via Supabase Auth
- FR56: Epic 1 - Row Level Security por grupo
- FR57: Epic 1 - Validar permissões em cada requisição
- FR58: Epic 1 - Impedir Admin de Grupo alterar role
- FR59: Epic 2 - Criar grupo Telegram automaticamente via MTProto
- FR60: Epic 2 - Adicionar bot como admin do grupo Telegram
- FR61: Epic 2 - Bot Super Admin envia convites para founders
- FR62: Epic 2 - Enviar convite para influencer e convidados

## Epic List

### Epic 1: Fundação Multi-tenant e Autenticação
Super Admin pode criar a infraestrutura multi-tenant, logar no painel admin e criar/listar grupos com isolamento de dados completo.
**FRs cobertos:** FR1, FR2, FR5, FR34, FR55, FR56, FR57, FR58
**NFRs endereçados:** NFR-S1, NFR-S2, NFR-S4, NFR-S6, NFR-I3, NFR-SC1
**Inclui:** Migration SQL (tabelas groups, admin_users, bot_pool, bot_health + group_id em members/suggested_bets), RLS policies, scaffold admin-panel (Next.js), Supabase Auth, middleware de tenant (withTenant)

### Epic 2: Gestão de Grupos e Onboarding de Influencer
Super Admin pode fazer onboarding completo de um novo influencer em <=5 cliques, gerenciar pool de bots, ver dashboard consolidado, e automatizar criação de grupos Telegram com convites.
**FRs cobertos:** FR3, FR4, FR26, FR27, FR28, FR33, FR35, FR36, FR37, FR38, FR49, FR59, FR60, FR61, FR62
**NFRs endereçados:** NFR-I4, NFR-S5, NFR-I1
**Jornada:** J1 - Marcelo faz onboarding da Bianca
**Inclui:** Onboarding automático (MP API + Render API + Supabase Auth + MTProto Telegram), pool de bots, dashboard Super Admin, Bot Super Admin para notificar founders
**Pre-mortem:** Onboarding é operação multi-step sem rollback. Grupo precisa de status intermediários (`creating`, `active`, `failed`). Se Render API ou MP API falhar no meio, deve ser possível retry/resume sem recriar tudo. UI deve mostrar status de cada step. MTProto requer sessão autenticada do founder — sessão deve ser persistida e renovada. Bot Super Admin precisa que founders tenham dado `/start` previamente.

### Epic 3: Gestão de Membros e Painel do Influencer
Influencer pode logar no painel, ver dashboard do seu grupo, listar membros com status e vencimentos, com dados completamente isolados.
**FRs cobertos:** FR6, FR13, FR14, FR15, FR16, FR39, FR40, FR41, FR42, FR43
**NFRs endereçados:** NFR-P3, NFR-P4, NFR-R6
**Jornada:** J4 - Bianca confere seus números
**Inclui:** Adaptar registro de membros no bot para multi-tenant, painel Group Admin

### Epic 4: Pagamentos, Acesso Automático e Kick
Membro entra no grupo com status `trial` (gerenciado pelo MP), paga e recebe acesso instantâneo, ou é removido automaticamente quando assinatura expira.
**FRs cobertos:** FR7, FR11, FR12, FR44, FR45, FR46, FR47, FR48, FR50, FR52, FR53 (FR8, FR9, FR10, FR51 delegados ao MP)
**NFRs endereçados:** NFR-P2, NFR-S3, NFR-I2, NFR-R5, NFR-I5
**Jornadas:** J2 - Lucas paga e fica, J3 - Pedro não paga e é removido
**Inclui:** Webhook MP multi-tenant (pagamento + assinatura + trial expirado), kick por expiração, notificações Telegram
**Pre-mortem:** Risco de pagamento creditado ao grupo errado. Webhook deve usar validação dupla: `product_id` + metadata com `group_id` no checkout. Audit log obrigatório em todo pagamento processado. Testar com 2+ grupos simulados.
**Nota:** Trial de 7 dias, lembretes e cobrança são responsabilidade do Mercado Pago (assinatura com período grátis). Sistema apenas reage aos webhooks do MP.

### Epic 5: Distribuição de Apostas Multi-tenant
Apostas são geradas, distribuídas entre grupos via round-robin, e postadas automaticamente nos grupos Telegram. Super Admin gerencia odds e links.
**FRs cobertos:** FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25
**NFRs endereçados:** NFR-P1, NFR-P5, NFR-I1
**Inclui:** Round-robin, gestão de odds/links (individual + bulk), postagem por bot
**Pre-mortem:** Round-robin deve filtrar apenas grupos com `status = 'active'` para não distribuir apostas para grupos pausados/inativos. Logging obrigatório de cada distribuição (qual aposta → qual grupo).

### Epic 6: Health Check, Monitoramento e Alertas
Sistema monitora bots ativamente, detecta falhas, alerta Super Admin via Telegram e permite restart remoto pelo painel.
**FRs cobertos:** FR29, FR30, FR31, FR32, FR54
**NFRs endereçados:** NFR-R1, NFR-R2, NFR-R3, NFR-R4
**Jornada:** J5 - Bot caiu às 3h da manhã
**Inclui:** Heartbeat a cada 60s, detecção offline, alertas Telegram, restart via flag no Supabase

---

## Epic 1: Fundação Multi-tenant e Autenticação

Super Admin pode criar a infraestrutura multi-tenant, logar no painel admin e criar/listar grupos com isolamento de dados completo.

### Story 1.1: Migration Multi-tenant e RLS

As a **Super Admin**,
I want o banco de dados preparado para multi-tenant com isolamento por grupo,
So that cada grupo tenha seus dados completamente isolados.

**Acceptance Criteria:**

**Given** o banco Supabase existente
**When** a migration `010_multitenant.sql` é executada
**Then** as tabelas `groups`, `admin_users`, `bot_pool`, `bot_health` são criadas com os schemas definidos na arquitetura
**And** as tabelas `members` e `suggested_bets` recebem coluna `group_id` (FK → groups)
**And** RLS policies são criadas em todas as tabelas com `group_id`
**And** RLS garante que `super_admin` (group_id NULL) vê tudo e `group_admin` vê apenas seu grupo
**And** dados existentes continuam acessíveis (backward compatible)

### Story 1.2: Scaffold Admin Panel com Supabase Auth

As a **Super Admin**,
I want um painel admin com autenticação segura,
So that eu possa logar e acessar funcionalidades administrativas.

**Acceptance Criteria:**

**Given** nenhum admin panel existe
**When** o admin-panel é criado com Next.js App Router + TypeScript + Tailwind
**Then** a aplicação roda localmente com `npm run dev`
**And** Supabase Auth está integrado (login com email/senha)
**And** existe uma página de login funcional
**And** após login, Super Admin é redirecionado para `/dashboard`
**And** usuários não autenticados são redirecionados para `/login`
**And** sessões expiram após 24 horas de inatividade (NFR-S4)

### Story 1.3: Middleware de Tenant e Proteção de Rotas

As a **Super Admin**,
I want que toda requisição API valide permissões e filtre por grupo,
So that nenhum dado vaze entre tenants.

**Acceptance Criteria:**

**Given** um usuário autenticado no admin panel
**When** qualquer API Route é chamada
**Then** o middleware `withTenant()` identifica o role e group_id do usuário via JWT
**And** se `super_admin`, `groupFilter = null` (vê tudo)
**And** se `group_admin`, `groupFilter = user.group_id` (só seu grupo)
**And** se não autenticado, retorna 401 `{ success: false, error: 'UNAUTHORIZED' }`
**And** response segue o pattern `{ success: true, data }` ou `{ success: false, error }`
**And** Admin de Grupo não pode alterar seu próprio role (FR58)
**And** todas as API Routes DEVEM ser criadas via wrapper `createApiHandler()` que aplica `withTenant()` automaticamente — nenhuma rota pode ser criada sem passar por ele (security audit: enforcement automático)

### Story 1.4: CRUD de Grupos e Listagem

As a **Super Admin**,
I want criar e listar grupos de influencers no painel,
So that eu possa gerenciar os tenants da plataforma.

**Acceptance Criteria:**

**Given** Super Admin está logado no painel
**When** acessa `/groups`
**Then** vê lista de todos os grupos com nome, status e data de criação (FR2)
**And** pode clicar em "Novo Grupo" e criar um grupo com nome e configurações básicas (FR1)
**And** grupo é criado no banco com `status = 'active'`
**And** dados do grupo são isolados por RLS (FR5)
**And** API Routes usam `withTenant()` em todas as operações
**And** Group Admin não consegue acessar `/groups` (retorna 403)

---

## Epic 2: Gestão de Grupos e Onboarding de Influencer

Super Admin pode fazer onboarding completo de um novo influencer em <=5 cliques, gerenciar pool de bots, ver dashboard consolidado, e automatizar criação de grupos Telegram com convites para founders e influencer.

### Story 2.1: Editar e Gerenciar Status de Grupos

As a **Super Admin**,
I want editar configurações de um grupo e pausar/desativar grupos,
So that eu possa gerenciar o ciclo de vida de cada influencer.

**Acceptance Criteria:**

**Given** Super Admin está logado e acessa `/groups/[groupId]`
**When** edita campos do grupo (nome, telegram_group_id, telegram_admin_group_id)
**Then** as alterações são salvas no banco via API Route com `withTenant()` (FR3)
**And** pode alterar status do grupo para `active`, `paused` ou `inactive` (FR4)
**And** grupo pausado/inativo fica visível na listagem com badge de status
**And** audit log registra quem alterou, quando e o quê (NFR-S5)

### Story 2.2: Gestão do Pool de Bots

As a **Super Admin**,
I want visualizar e gerenciar o pool de bots disponíveis,
So that eu saiba quais bots estão livres para novos influencers.

**Acceptance Criteria:**

**Given** Super Admin está logado e acessa `/bots`
**When** a página carrega
**Then** vê lista de todos os bots com status (`available` ou `in_use`) (FR26)
**And** bots em uso mostram qual grupo/influencer estão associados (FR27)
**And** vê contador: "X disponíveis / Y em uso / Z total" (FR33)
**And** pode adicionar novos bots ao pool (token + username)
**And** tokens de bot são criptografados no banco (NFR-S2)

### Story 2.3: Onboarding Automático de Influencer

As a **Super Admin**,
I want fazer onboarding de um novo influencer em até 5 passos,
So that um novo influencer esteja operacional rapidamente.

**Acceptance Criteria:**

**Given** Super Admin acessa `/groups/new` (FR36)
**When** preenche: nome do influencer, email, seleciona bot do pool
**Then** sistema valida o token do bot selecionado via Telegram API (`getMe`) e preenche automaticamente o `bot_username` com o username retornado
**And** sistema executa onboarding automático em sequência:
1. Cria grupo no banco com `status = 'creating'`
2. Cria produto no Mercado Pago via API → salva `mp_product_id` e `checkout_url` (FR49)
3. Faz deploy do bot no Render via API → salva `render_service_id` (NFR-I4)
4. Cria usuário admin via Supabase Auth → insere em `admin_users` com `role = 'group_admin'`
5. Atualiza grupo para `status = 'active'`
**And** bot é associado ao grupo via `bot_pool` (FR28)
**And** onboarding completa em até 5 passos/cliques (FR37)
**And** checkout_url criado no MP inclui `external_reference` com `group_id` do grupo (security audit: rastreabilidade no webhook)
**And** UI mostra progresso de cada step (creating → configurando MP → deploy bot → criando admin → ativo)
**And** se qualquer step falhar, grupo fica com `status = 'failed'` e UI permite retry do step que falhou (pre-mortem)
**And** retorna: link do bot + credenciais de login do influencer

### Story 2.4: Dashboard Consolidado do Super Admin

As a **Super Admin**,
I want ver um dashboard com visão geral de todos os grupos,
So that eu tenha visibilidade completa da plataforma.

**Acceptance Criteria:**

**Given** Super Admin está logado e acessa `/dashboard`
**When** a página carrega
**Then** vê cards com resumo de cada grupo: nome, membros ativos, status (FR35)
**And** vê totalizadores: total de membros, total de grupos ativos, bots em uso
**And** vê seção de alertas e notificações do sistema (FR38)
**And** dados vêm via API Routes com `withTenant()` (groupFilter = null)

### Story 2.5: Notificações e Alertas no Painel

As a **Super Admin**,
I want ver alertas e notificações importantes no painel,
So that eu esteja ciente de problemas e eventos relevantes.

**Acceptance Criteria:**

**Given** Super Admin está no dashboard
**When** eventos relevantes ocorrem (onboarding concluído, grupo pausado, erro de integração)
**Then** alertas aparecem na seção de notificações do dashboard (FR38)
**And** alertas mostram: tipo, mensagem, timestamp
**And** alertas são persistidos no banco para histórico
**And** audit log registra eventos críticos com retenção de 90 dias (NFR-S5)

### Story 2.6: Automação de Grupo Telegram e Convites via MTProto

As a **Super Admin**,
I want que o onboarding crie automaticamente o grupo no Telegram, adicione o bot como admin e envie convites para founders e influencer,
So that o processo de onboarding seja 100% automatizado sem passos manuais no Telegram.

**Acceptance Criteria:**

**Given** onboarding de um novo influencer foi iniciado (Story 2.3)
**When** o step de criação de grupo Telegram é executado
**Then** sistema cria um supergrupo no Telegram via MTProto usando a conta do founder (FR59)
**And** o bot selecionado do pool é adicionado ao grupo como administrador (FR60)
**And** o título e descrição do grupo são configurados automaticamente
**And** `telegram_group_id` é salvo na tabela `groups`

**Given** grupo Telegram foi criado com sucesso
**When** o step de convites é executado
**Then** Bot Super Admin (bot dedicado já autorizado pelos founders) envia mensagem com link de convite para cada founder (FR61)
**And** sistema envia convite para o dono do grupo (influencer) via email ou Telegram (FR62)
**And** sistema permite configurar lista de convidados adicionais por grupo
**And** convites são links de convite do grupo (`createChatInviteLink`)

**Given** MTProto requer autenticação
**When** sistema precisa criar grupo
**Then** usa sessão persistida da conta do founder (autenticada uma vez via code/2FA)
**And** sessão é armazenada de forma segura e renovada automaticamente
**And** se sessão expirar, sistema alerta founders para re-autenticar

**Given** Bot Super Admin é um bot dedicado para notificações dos founders
**When** novo grupo é criado em qualquer onboarding
**Then** Bot Super Admin envia mensagem com: nome do grupo, link de convite, nome do influencer
**And** founders já autorizaram o Bot Super Admin previamente (`/start`)
**And** Bot Super Admin é separado dos bots do pool (não é associado a nenhum grupo)

**Nota técnica:** MTProto (GramJS/Telethon) opera com conta de usuário real (do founder), diferente da Bot API. Requer phone number + session string persistida. A sessão deve ser criada uma única vez (setup inicial) e reutilizada em todos os onboardings.

---

## Epic 3: Gestão de Membros e Painel do Influencer

Influencer pode logar no painel, ver dashboard do seu grupo, listar membros com status e vencimentos, com dados completamente isolados.

### Story 3.1: Adaptar Registro de Membros para Multi-tenant

As a **sistema**,
I want registrar novos membros associados ao grupo correto,
So that cada influencer tenha seus próprios membros isolados.

**Acceptance Criteria:**

**Given** um bot está rodando associado a um grupo específico (com `GROUP_ID` no env)
**When** um novo usuário entra no grupo Telegram
**Then** o membro é registrado na tabela `members` com o `group_id` do bot (FR6)
**And** o `group_id` é lido da variável de ambiente `GROUP_ID` do processo do bot
**And** se `GROUP_ID` não está definido, o bot continua funcionando com comportamento atual (backward compatible)
**And** RLS garante que o membro só é visível para o grupo correto

### Story 3.2: Login e Dashboard do Admin de Grupo

As a **Admin de Grupo (Influencer)**,
I want logar no painel e ver o dashboard do meu grupo,
So that eu tenha visibilidade da minha operação.

**Acceptance Criteria:**

**Given** um Admin de Grupo criado durante onboarding (Epic 2)
**When** faz login com email/senha no painel (FR39)
**Then** é redirecionado para `/dashboard`
**And** o dashboard mostra dados APENAS do seu grupo (FR40, FR43)
**And** vê contagem de membros: total, em trial, ativos pagantes (FR41)
**And** vê card com nome do grupo e status
**And** NÃO vê menu de "Grupos", "Bots" ou funcionalidades de Super Admin
**And** painel carrega em < 3 segundos (NFR-P3)
**And** middleware `withTenant()` filtra automaticamente por `group_id`

### Story 3.3: Lista de Membros com Status e Vencimentos

As a **Admin de Grupo**,
I want ver a lista completa dos membros do meu grupo com status e vencimentos,
So that eu saiba quem está ativo, em trial e quem vai vencer.

**Acceptance Criteria:**

**Given** Admin de Grupo está logado e acessa `/members`
**When** a página carrega
**Then** vê lista de membros do seu grupo com: nome Telegram, status (trial/ativo/vencendo/expirado), data de entrada, data de vencimento (FR13, FR14, FR15, FR42)
**And** pode filtrar por status (todos, trial, ativos, vencendo em 7 dias)
**And** pode buscar membro por nome
**And** lista carrega em < 2 segundos com até 10k registros (NFR-P4)
**And** paginação se necessário
**And** dados são filtrados por `group_id` via `withTenant()`

### Story 3.4: Visualização de Membros pelo Super Admin

As a **Super Admin**,
I want visualizar membros de qualquer grupo,
So that eu possa dar suporte e monitorar a plataforma.

**Acceptance Criteria:**

**Given** Super Admin está logado e acessa `/members`
**When** a página carrega
**Then** vê membros de TODOS os grupos (FR16)
**And** pode filtrar por grupo específico via dropdown
**And** cada membro mostra o grupo a que pertence
**And** mesmas colunas da visão do Admin de Grupo (nome, status, vencimento)
**And** `withTenant()` retorna `groupFilter = null` para Super Admin

---

## Epic 4: Pagamentos, Acesso Automático e Kick

Membro entra no grupo com status `trial` (gerenciado pelo MP), paga e recebe acesso instantâneo, ou é removido automaticamente quando assinatura expira.

### Story 4.1: Assinatura Recorrente via Mercado Pago

As a **Super Admin**,
I want que o onboarding crie uma assinatura recorrente (e não um pagamento avulso) no Mercado Pago,
So that membros sejam cobrados automaticamente todo mês sem intervenção manual.

**Acceptance Criteria:**

**Given** o onboarding de um novo influencer (step `configuring_mp`)
**When** o sistema configura o Mercado Pago para o grupo
**Then** cria um **Preapproval Plan** (`/preapproval_plan`) com:
- `reason`: "Assinatura {nome do grupo}"
- `auto_recurring.frequency`: 1, `frequency_type`: "months"
- `auto_recurring.transaction_amount`: preço definido no onboarding
- `auto_recurring.currency_id`: "BRL"
- `auto_recurring.free_trial.frequency`: 7, `frequency_type`: "days" (trial de 7 dias gerenciado pelo MP)
**And** salva `preapproval_plan_id` na tabela `groups` (substituindo `mp_product_id`)
**And** gera o `init_point` (URL de assinatura) como `checkout_url` do grupo
**And** `external_reference` continua sendo o `group_id` para rastreabilidade no webhook
**And** a URL de assinatura permite que múltiplos membros assinem o mesmo plano

**Given** o sistema já usa `createCheckoutPreference()` no onboarding
**When** esta story é implementada
**Then** `createCheckoutPreference()` é substituída por `createSubscriptionPlan()` em `src/lib/mercadopago.ts`
**And** o onboarding step `configuring_mp` chama a nova função
**And** a coluna `mp_product_id` na tabela `groups` é renomeada para `mp_plan_id` (migration)
**And** testes unitários cobrem: plano criado com sucesso, token ausente, erro da API MP

**Nota técnica:** Mercado Pago tem 2 abordagens para assinaturas:
1. **Preapproval Plan** (`/preapproval_plan`) → cria o plano (template); membros assinam via `init_point`
2. **Preapproval** (`/preapproval`) → assinatura individual de cada membro (criada quando membro clica no link)
O sistema cria apenas o Plan; as assinaturas individuais são gerenciadas pelo MP. Webhooks de `subscription` notificam mudanças de status.

### Story 4.2: Boas-vindas e Registro com Status Trial

As a **novo membro**,
I want ser recebido no grupo e registrado como trial,
So that o sistema saiba que estou no período de experiência do MP.

**Acceptance Criteria:**

**Given** um novo membro entra no grupo Telegram de um influencer
**When** o bot detecta a entrada
**Then** o membro é registrado com `status = 'trial'` e `group_id` do bot (FR6, FR7)
**And** bot envia DM de boas-vindas com nome do grupo e link de checkout do MP (FR50)
**And** link de checkout é o `checkout_url` específico do grupo (assinatura com trial no MP)

### Story 4.3: Webhook Mercado Pago Multi-tenant

As a **sistema**,
I want processar webhooks de pagamento e assinatura identificando o grupo correto,
So that pagamentos e mudanças de status de cada influencer sejam creditados corretamente.

**Acceptance Criteria:**

**Given** Mercado Pago envia webhook (pagamento aprovado, assinatura cancelada, trial expirado)
**When** o endpoint `/api/webhooks/mercadopago` recebe a requisição
**Then** valida assinatura HMAC em 100% das requisições (FR45, NFR-S3)
**And** identifica o grupo via `product_id` do pagamento (FR46)
**And** valida `group_id` cruzando `product_id` + `external_reference` do checkout (security audit: validação dupla contra spoofing)
**And** valida que o `group_id` existe e está ativo
**And** para evento `payment.approved`: atualiza membro para `status = 'active'` com `paid_until` (FR47, FR48)
**And** para evento `subscription.cancelled` ou `subscription.expired`: marca membro como `expired`
**And** registra audit log: evento, membro, grupo, valor, timestamp (pre-mortem)
**And** webhook duplicado (idempotency) é ignorado sem erro
**And** se MP timeout, retry automático até 3 tentativas (NFR-R5, NFR-I5)

### Story 4.4: Acesso Instantâneo Pós-Pagamento

As a **membro que pagou**,
I want receber acesso instantâneo após pagamento,
So that eu não precise esperar para continuar no grupo.

**Acceptance Criteria:**

**Given** webhook processou pagamento/assinatura aprovada
**When** o status do membro é atualizado para `active`
**Then** bot envia DM: "Pagamento confirmado! Acesso liberado até DD/MM/AAAA" (FR52, FR12)
**And** acesso é concedido em < 30 segundos após confirmação (NFR-P2)
**And** se membro havia sido removido (kick), bot re-adiciona ao grupo automaticamente
**And** se membro ainda está no grupo, apenas atualiza status
**And** membro renovando tem `paid_until` estendido

### Story 4.5: Kick Automático de Membros Expirados

As a **sistema**,
I want remover automaticamente membros cuja assinatura expirou no MP,
So that o grupo mantenha apenas membros ativos.

**Acceptance Criteria:**

**Given** um membro com `status = 'expired'` (marcado pelo webhook do MP)
**When** o job de kick roda (cron diário)
**Then** o bot remove (kick) o membro do grupo Telegram (FR11)
**And** bot envia DM: "Sua assinatura expirou. Quer voltar? [link checkout]" (FR53)
**And** kick é executado apenas para membros do `group_id` do bot
**And** audit log registra o kick: membro, grupo, timestamp
**And** membros com `status = 'active'` e `paid_until` futuro NÃO são removidos

---

## Epic 5: Distribuição de Apostas Multi-tenant

Apostas são geradas, distribuídas entre grupos via round-robin, e postadas automaticamente nos grupos Telegram. Super Admin gerencia odds e links.

### Story 5.1: Distribuição Round-robin de Apostas entre Grupos

As a **sistema**,
I want distribuir apostas geradas entre os grupos ativos via round-robin,
So that cada influencer receba apostas diferentes sem repetição.

**Acceptance Criteria:**

**Given** o pool de apostas foi gerado (FR17 - sistema existente)
**When** o job de distribuição roda
**Then** apostas são distribuídas via round-robin entre grupos com `status = 'active'` apenas (pre-mortem)
**And** cada aposta recebe `group_id` e `distributed_at` na tabela `suggested_bets` (FR18, FR19)
**And** grupos pausados/inativos NÃO recebem apostas
**And** logging registra cada distribuição: aposta ID → grupo ID → timestamp
**And** se só há 1 grupo ativo, todas as apostas vão pra ele

### Story 5.2: Gestão de Odds no Painel (Individual e Bulk)

As a **Super Admin**,
I want atualizar odds de apostas no painel,
So that as apostas tenham odds corretas antes de serem postadas.

**Acceptance Criteria:**

**Given** Super Admin está logado e acessa `/bets`
**When** seleciona uma aposta
**Then** pode editar odds individualmente (FR21)
**And** pode selecionar múltiplas apostas e atualizar odds em lote/bulk (FR22)
**And** bulk update processa em < 5 segundos para até 50 itens (NFR-P5)
**And** vê lista de todas as apostas com: jogo, odds, grupo destino, status de distribuição (FR20)
**And** API Routes usam `withTenant()` (Super Admin vê tudo)

### Story 5.3: Gestão de Links no Painel (Individual e Bulk)

As a **Super Admin**,
I want adicionar links de casas de apostas às apostas,
So that os membros possam apostar diretamente pelo link.

**Acceptance Criteria:**

**Given** Super Admin está na tela de apostas `/bets`
**When** seleciona uma aposta
**Then** pode adicionar link de aposta individualmente (FR23)
**And** pode selecionar múltiplas apostas e adicionar links em lote/bulk (FR24)
**And** bulk update processa em < 5 segundos para até 50 itens (NFR-P5)
**And** links são validados (formato URL válido)
**And** alterações são salvas via API Route com response pattern `{ success, data }`

### Story 5.4: Postagem Automática de Apostas nos Grupos Telegram

As a **membro de um grupo**,
I want receber apostas postadas automaticamente no grupo Telegram,
So that eu tenha as dicas no horário programado.

**Acceptance Criteria:**

**Given** apostas foram distribuídas para um grupo e têm odds + links preenchidos
**When** o horário programado de postagem chega
**Then** o bot posta apenas as apostas do seu `group_id` no grupo Telegram (FR25)
**And** postagem inicia no máximo 30 segundos após horário programado (NFR-P1)
**And** formato da mensagem inclui: jogo, odds, link de aposta
**And** se bot está offline, apostas ficam pendentes para próximo ciclo
**And** logging registra: apostas postadas, grupo, horário real de postagem

### Story 5.5: Controle de Postagem no Painel Admin

As a **Super Admin / Admin de grupo**,
I want controlar postagens automáticas pelo painel admin,
So that eu possa ligar/desligar postagens, configurar horários, ver a fila e disparar postagens manualmente.

**Acceptance Criteria:**

**Given** admin está logado no painel
**When** acessa as configurações do grupo
**Then** pode ligar/desligar postagem automática via toggle (`posting_schedule.enabled`)
**And** pode configurar múltiplos horários de postagem via time picker (user-friendly)
**And** horários são salvos como array `["10:00", "15:00", "22:00"]` em JSONB
**And** bot recarrega configuração periodicamente sem restart
**And** admin vê card "Próxima Postagem" com: horário, apostas prontas, pendências
**And** admin pode disparar postagem imediata via botão "Postar Agora" (equivalente ao /postar)
**And** distribuição automática é agendada 5 min antes de cada horário configurado

### Story 5.6: Melhorias de UX na Listagem de Apostas

As a **Super Admin / Admin de Grupo**,
I want uma listagem de apostas mais clara, com filtro de jogos futuros, coluna de data separada, filtro por data, coluna de mercado corrigida e taxa histórica de acerto,
So that eu consiga analisar as apostas rapidamente sem poluição visual de jogos passados e com contexto de performance histórica.

**Acceptance Criteria:**

**Given** o admin acessa a página `/bets`
**When** a página carrega pela primeira vez
**Then** apenas apostas com `kickoff_time > now()` são exibidas por padrão (toggle "Mostrar jogos passados" disponível)
**And** existe uma coluna separada "Data Jogo" com `kickoff_time` (sortable), e coluna "Jogo" exibe apenas nomes dos times
**And** existe filtro por período (data início/fim) com atalhos rápidos (Hoje, Amanhã, Próximos 7 dias)
**And** coluna "Mercado" exibe a categoria (Gols, Escanteios, Cartões, BTTS, Outros) como badge colorido
**And** coluna "Pick" exibe `bet_market + bet_pick` combinados (sem duplicação se iguais)
**And** coluna "Taxa Hist." exibe taxa de acerto histórica por par liga+categoria com indicador visual colorido (verde/amarelo/vermelho) e ícone (i) com tooltip explicativo
**And** taxa é calculada via lógica idêntica ao `getAllPairStats()` do bot, sem N+1 queries

---

## Epic 6: Health Check, Monitoramento e Alertas

Sistema monitora bots ativamente, detecta falhas, alerta Super Admin via Telegram e permite restart remoto pelo painel.

### Story 6.1: Heartbeat dos Bots e Detecção de Offline

As a **sistema**,
I want monitorar o status de cada bot em tempo real,
So that falhas sejam detectadas rapidamente.

**Acceptance Criteria:**

**Given** um bot está rodando associado a um grupo
**When** o bot está ativo
**Then** envia heartbeat a cada 60 segundos atualizando `bot_health.last_heartbeat` e `status = 'online'` (FR29)
**And** se `last_heartbeat` tem mais de 2 minutos, o bot é considerado offline (FR30, NFR-R2)
**And** a página `/bots` no admin panel mostra status em tempo real: online/offline com timestamp do último heartbeat
**And** bot que acabou de iniciar registra heartbeat imediatamente
**And** uptime dos bots >= 99.9% durante horários de postagem 7h-23h (NFR-R1)

### Story 6.2: Alertas de Bot Offline via Telegram

As a **Super Admin**,
I want receber alertas quando um bot fica offline,
So that eu possa agir rapidamente e minimizar impacto.

**Acceptance Criteria:**

**Given** um bot foi detectado como offline (last_heartbeat > 2 min)
**When** o sistema de monitoramento identifica a falha
**Then** envia alerta via Telegram para o grupo admin do Super Admin (FR31, FR54)
**And** alerta inclui: nome do bot, grupo afetado, tempo offline, sugestão de ação
**And** alerta é enviado em <= 5 minutos da detecção (NFR-R3)
**And** NÃO envia alertas duplicados (se já alertou sobre esse bot offline, não repete até voltar)
**And** quando bot volta online, envia alerta de recuperação: "Bot X online novamente"

### Story 6.3: Restart Remoto de Bot pelo Painel

As a **Super Admin**,
I want reiniciar um bot remotamente pelo painel admin,
So that eu possa resolver problemas sem acesso ao servidor.

**Acceptance Criteria:**

**Given** Super Admin está na página `/bots` e vê um bot offline
**When** clica em "Reiniciar" no bot
**Then** sistema seta `bot_health.restart_requested = true` para o grupo do bot (FR32)
**And** bot (no próximo health check) detecta a flag e executa `process.exit(1)`
**And** Render detecta processo morto e reinicia automaticamente
**And** bot ao reiniciar: limpa `restart_requested = false`, envia heartbeat, status volta para `online`
**And** MTTR (tempo médio de recuperação) <= 10 minutos (NFR-R4)
**And** UI mostra feedback: "Restart solicitado" → "Reiniciando..." → "Online"
**And** audit log registra: quem solicitou restart, qual bot, quando
