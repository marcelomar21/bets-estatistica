---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'active'
completedAt: '2026-02-06'
epicCount: 1
storyCount: 3
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

### Epic 6: Health Check, Monitoramento e Alertas
Sistema monitora bots ativamente, detecta falhas, alerta Super Admin via Telegram e permite restart remoto pelo painel.
**FRs cobertos:** FR29, FR30, FR31, FR32, FR54
**NFRs endereçados:** NFR-R1, NFR-R2, NFR-R3, NFR-R4
**Jornada:** J5 - Bot caiu às 3h da manhã
**Inclui:** Heartbeat a cada 60s, detecção offline, alertas Telegram, restart via flag no Supabase

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
