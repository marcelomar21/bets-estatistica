---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'active'
completedAt: '2026-02-26'
epicCount: 6
storyCount: 15
frsTotal: 78
frsCovered: 78
frsDelegatedToMP: 4
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-2026-02-26.md
workflowType: 'epics-and-stories'
projectType: 'brownfield'
project_name: 'bets-estatistica'
scope: 'SaaS Multi-tenant Platform — v3 Features'
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

**Mensagens com Mídia (v3)**
- FR59: Super Admin pode anexar arquivo (PDF ou imagem JPG/PNG, máx 10MB) ao agendar mensagem
- FR60: Sistema pode armazenar arquivo no Supabase Storage com path referenciado na `scheduled_messages`
- FR61: Bot pode enviar mensagem com PDF (`sendDocument`) ou imagem (`sendPhoto`) para o grupo Telegram
- FR62: Super Admin pode pré-visualizar mensagem agendada (texto + mídia) antes de confirmar envio

**Gestão de Apostas — Campeonato (v3)**
- FR63: Admin pode visualizar o campeonato/liga de cada aposta na tabela de apostas
- FR64: Admin pode filtrar apostas por campeonato/liga

**Cancelamento de Membros (v3)**
- FR65: Membro pode solicitar cancelamento da assinatura via comando `/cancelar` no bot
- FR66: Bot pode exibir instruções de cancelamento e solicitar confirmação antes de processar
- FR67: Sistema pode processar cancelamento: atualizar status do membro para `cancelado`, remover do grupo Telegram, registrar data e motivo
- FR68: Operador pode cancelar/expulsar membro pelo painel admin (aba Membros) com motivo obrigatório
- FR69: Sistema pode registrar cancelamento no audit log com: motivo, data, quem executou
- FR70: Bot pode enviar mensagem de despedida ao membro cancelado com link de reativação

**Analytics de Taxa de Acerto (v3)**
- FR71: Admin pode visualizar taxa de acerto total (all-time e por período selecionável)
- FR72: Admin pode visualizar taxa de acerto por grupo
- FR73: Admin pode visualizar taxa de acerto por mercado
- FR74: Admin pode visualizar taxa de acerto por campeonato/liga
- FR75: Admin pode filtrar métricas de acerto por período personalizado

**Painel Admin — Dashboard (v3)**
- FR76: Super Admin pode dispensar alertas/notificações do dashboard
- FR77: Dashboard pode exibir taxa de acerto total e por grupo como métrica principal
- FR78: Dashboard pode exibir resumo de performance recente com indicador de tendência

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
- FR59(auto): Epic 2 - Criar grupo Telegram automaticamente via MTProto
- FR60(auto): Epic 2 - Adicionar bot como admin do grupo Telegram
- FR61(auto): Epic 2 - Bot Super Admin envia convites para founders
- FR62(auto): Epic 2 - Enviar convite para influencer e convidados

**v3 — FR Coverage Map:**
- FR59: Epic 8 - Anexar arquivo (PDF/imagem) ao agendar mensagem
- FR60: Epic 8 - Armazenar arquivo no Supabase Storage
- FR61: Epic 8 - Bot envia PDF/imagem para grupo Telegram
- FR62: Epic 8 - Preview de mensagem agendada
- FR63: Epic 7 - Visualizar campeonato na tabela de apostas
- FR64: Epic 7 - Filtrar apostas por campeonato
- FR65: Epic 9 - Membro solicita cancelamento via `/cancelar`
- FR66: Epic 9 - Bot exibe instruções e pede confirmação
- FR67: Epic 9 - Sistema processa cancelamento
- FR68: Epic 9 - Operador cancela/expulsa membro pelo painel
- FR69: Epic 9 - Registro de cancelamento no audit log
- FR70: Epic 9 - Mensagem de despedida com link de reativação
- FR71: Epic 10 - Taxa de acerto total
- FR72: Epic 10 - Taxa de acerto por grupo
- FR73: Epic 10 - Taxa de acerto por mercado
- FR74: Epic 10 - Taxa de acerto por campeonato
- FR75: Epic 10 - Filtro por período personalizado
- FR76: Epic 11 - Dismiss de alertas/notificações
- FR77: Epic 11 - Taxa de acerto como métrica principal
- FR78: Epic 11 - Resumo de performance recente

## Epic List

### Epic 6: Health Check, Monitoramento e Alertas
Sistema monitora bots ativamente, detecta falhas, alerta Super Admin via Telegram e permite restart remoto pelo painel.
**FRs cobertos:** FR29, FR30, FR31, FR32, FR54
**NFRs endereçados:** NFR-R1, NFR-R2, NFR-R3, NFR-R4
**Jornada:** J5 - Bot caiu às 3h da manhã
**Inclui:** Heartbeat a cada 60s, detecção offline, alertas Telegram, restart via flag no Supabase

### Epic 7: Coluna Campeonato na Aba de Apostas
Operador pode visualizar e filtrar apostas por campeonato/liga, facilitando a busca e organização.
**FRs cobertos:** FR63, FR64
**NFRs endereçados:** NFR-P3, NFR-P4
**Jornada:** J7 (parcial)
**Inclui:** JOIN league_matches → league_seasons, coluna na tabela, filtro no BetFilters, coluna no PostingHistory

### Epic 8: Mensagens com Mídia e Preview
Operador pode enviar mensagens agendadas com PDF ou imagem anexa, e pré-visualizar antes de confirmar.
**FRs cobertos:** FR59, FR60, FR61, FR62
**NFRs endereçados:** NFR-P3
**Jornada:** Extensão da operação diária
**Inclui:** Upload de arquivo via Supabase Storage, campos de mídia em scheduled_messages, sendDocument/sendPhoto no bot, botão Preview

### Epic 9: Fluxo de Cancelamento de Membros
Membro pode cancelar pelo bot, operador pode cancelar/expulsar pelo painel. Tudo registrado com auditoria.
**FRs cobertos:** FR65, FR66, FR67, FR68, FR69, FR70
**NFRs endereçados:** NFR-S1, NFR-S5
**Jornada:** J6 - Pedro cancela assinatura
**Inclui:** Comando /cancelar no bot, ação de cancel/kick no painel, estado `cancelado` na state machine, mensagem despedida, audit log

### Epic 10: Analytics de Taxa de Acerto
Admin pode visualizar taxa de acerto por grupo, mercado, campeonato e período. Dados para decisões de negócio.
**FRs cobertos:** FR71, FR72, FR73, FR74, FR75
**NFRs endereçados:** NFR-P3, NFR-P4
**Jornada:** J7 - Marcelo analisa performance
**Inclui:** API routes de analytics, nova página no admin panel, filtros interativos, cards de resumo, tabela detalhada

### Epic 11: Revisão do Dashboard
Dashboard exibe métricas de acerto como destaque principal, alertas são dismissíveis, informações relevantes para o operador.
**FRs cobertos:** FR76, FR77, FR78
**NFRs endereçados:** NFR-P3
**Jornada:** J7 (parcial)
**Inclui:** Refatorar alertas para dismissíveis, cards de taxa de acerto, resumo de performance recente

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

---

## Epic 7: Coluna Campeonato na Aba de Apostas

Operador pode visualizar e filtrar apostas por campeonato/liga, facilitando a busca e organização.

### Story 7.1: Coluna Campeonato e Filtro por Liga na Aba de Apostas e Histórico

As a **operador (Super Admin ou Group Admin)**,
I want ver o campeonato/liga de cada aposta e poder filtrar por campeonato,
So that eu consiga localizar apostas rapidamente e identificar padrões por liga.

**Acceptance Criteria:**

**Given** operador está na página `/bets` (aba Apostas)
**When** a tabela de apostas é carregada
**Then** exibe coluna "Campeonato" entre "Jogo" e "Mercado", mostrando `league_seasons.league_name` via JOIN `suggested_bets → league_matches → league_seasons` (FR63)
**And** a coluna é sortable (ordenável)
**And** o componente `BetFilters` inclui dropdown "Campeonato" com lista distinta de ligas disponíveis nas apostas carregadas (FR64)
**And** ao selecionar um campeonato no filtro, a tabela mostra apenas apostas daquele campeonato
**And** a API `GET /api/bets` aceita parâmetro `championship` que filtra por `league_seasons.league_name` via JOIN
**And** a página `/posting-history` (Histórico) também exibe a coluna "Campeonato" na tabela
**And** performance: lista carrega em < 2 segundos com filtro de campeonato aplicado (NFR-P4)

---

## Epic 8: Mensagens com Mídia e Preview

Operador pode enviar mensagens agendadas com PDF ou imagem anexa, e pré-visualizar antes de confirmar.

### Story 8.1: Upload de Arquivo e Schema de Mídia

As a **Super Admin**,
I want anexar um PDF ou imagem ao agendar uma mensagem,
So that eu possa enviar relatórios, comunicados visuais e conteúdo rico para os grupos.

**Acceptance Criteria:**

**Given** Super Admin está na página `/messages` criando nova mensagem
**When** preenche o formulário de agendamento
**Then** o formulário exibe campo de upload de arquivo (drag & drop ou click) aceitando PDF, JPG e PNG com limite de 10MB (FR59)
**And** ao selecionar arquivo, mostra preview do nome, tipo e tamanho
**And** arquivo é enviado para Supabase Storage no bucket `message-media` com path `{group_id}/{uuid}.{ext}` (FR60)
**And** migration adiciona campos na tabela `scheduled_messages`: `media_url` (TEXT, nullable), `media_type` (VARCHAR: 'pdf'|'image'|null), `media_storage_path` (TEXT, nullable)
**And** API `POST /api/messages` aceita `media_storage_path` e `media_type` opcionais
**And** validação: rejeita arquivos > 10MB com mensagem clara de erro
**And** validação: rejeita tipos de arquivo não suportados (apenas PDF, JPG, PNG)
**And** mensagem pode ser agendada com texto apenas, mídia apenas, ou texto + mídia
**And** RLS: storage bucket respeita isolamento por grupo

### Story 8.2: Preview de Mensagem Agendada

As a **Super Admin**,
I want pré-visualizar como a mensagem ficará antes de confirmar o envio,
So that eu possa verificar formatação e conteúdo antes de enviar para o grupo.

**Acceptance Criteria:**

**Given** Super Admin preencheu o formulário de mensagem (texto e/ou mídia)
**When** clica no botão "Preview"
**Then** exibe modal de preview mostrando: texto formatado com Telegram Markdown renderizado (FR62)
**And** se mídia é imagem: exibe a imagem no preview com dimensões proporcionais
**And** se mídia é PDF: exibe ícone de PDF com nome do arquivo e tamanho
**And** preview inclui indicação do grupo destino e horário agendado
**And** modal tem botões "Editar" (volta ao form) e "Confirmar e Agendar" (salva)
**And** na tabela de mensagens agendadas, coluna "Mídia" exibe ícone indicando tipo (📎 PDF, 🖼️ imagem, ou vazio)
**And** ao clicar numa mensagem agendada com mídia na tabela, pode ver o preview da mídia

### Story 8.3: Envio de Mídia pelo Bot no Telegram

As a **sistema (job de envio)**,
I want que o bot envie PDF ou imagem junto com a mensagem agendada,
So that membros do grupo recebam o conteúdo rico no Telegram.

**Acceptance Criteria:**

**Given** uma mensagem agendada com mídia chegou no horário de envio (`scheduled_at <= now()` e `status = 'pending'`)
**When** o job de envio de mensagens processa esta mensagem
**Then** se `media_type = 'image'`: bot usa `sendPhoto` com o arquivo do Supabase Storage e `caption` com o texto da mensagem (FR61)
**And** se `media_type = 'pdf'`: bot usa `sendDocument` com o arquivo do Supabase Storage e `caption` com o texto da mensagem (FR61)
**And** se `media_type = null`: bot usa `sendMessage` com o texto (comportamento atual mantido)
**And** para obter o arquivo do Storage, gera signed URL temporária (60s) via Supabase Storage API
**And** em caso de falha no envio de mídia, registra erro no `scheduled_messages` com `status = 'failed'` e `attempts` incrementado
**And** retry automático: até 3 tentativas com backoff de 30s entre tentativas
**And** após envio bem-sucedido, atualiza `status = 'sent'`, `sent_at = now()`, `telegram_message_id`

---

## Epic 9: Fluxo de Cancelamento de Membros

Membro pode cancelar pelo bot, operador pode cancelar/expulsar pelo painel. Tudo registrado com auditoria.

### Story 9.1: Cancelamento pelo Operador no Painel Admin

As a **operador (Super Admin ou Group Admin)**,
I want cancelar ou expulsar um membro pelo painel admin,
So that eu possa gerenciar membros problemáticos sem depender do desenvolvedor.

**Acceptance Criteria:**

**Given** operador está na página `/members` e vê a lista de membros
**When** clica no botão "Cancelar" de um membro com status `trial` ou `ativo`
**Then** exibe modal de confirmação com: nome do membro, status atual, campo obrigatório de motivo (textarea) (FR68)
**And** ao confirmar, API `POST /api/members/{id}/cancel` processa: atualiza `status = 'cancelado'`, seta `kicked_at = now()`, registra motivo (FR67)
**And** sistema chama Telegram Bot API `banChatMember` para remover membro do grupo Telegram
**And** bot envia mensagem de despedida via DM ao membro: "Sua assinatura foi cancelada. Para reativar: [link checkout do grupo]" (FR70)
**And** registro no audit log: `{ action: 'member_cancelled', actor: operator_id, actor_type: 'operator', member_id, reason, timestamp }` (FR69)
**And** tabela de membros atualiza status para "Cancelado" com badge vermelha
**And** migration adiciona transição `cancelado` na member state machine: `trial → cancelado`, `ativo → cancelado`
**And** migration adiciona campos em `members`: `cancellation_reason` (TEXT, nullable), `cancelled_by` (UUID, nullable, FK → admin_users)
**And** Group Admin só pode cancelar membros do próprio grupo (RLS)

### Story 9.2: Cancelamento Self-Service pelo Membro via Bot

As a **membro do grupo**,
I want poder cancelar minha assinatura via comando no bot,
So that eu tenha autonomia para sair sem precisar falar com ninguém.

**Acceptance Criteria:**

**Given** membro está no chat privado com o bot e tem status `trial` ou `ativo`
**When** envia o comando `/cancelar`
**Then** bot responde com mensagem de confirmação: "Tem certeza que deseja cancelar? Você perderá acesso ao grupo VIP." com botões inline [Confirmar Cancelamento] e [Voltar] (FR65, FR66)
**And** se membro clica [Voltar]: bot responde "Cancelamento abortado. Você continua no grupo!" e encerra
**And** se membro clica [Confirmar Cancelamento]: sistema processa cancelamento (FR67)
**And** processamento: atualiza `status = 'cancelado'`, `kicked_at = now()`, `cancellation_reason = 'self_cancel'`, `cancelled_by = null` (self-service)
**And** bot envia mensagem de despedida: "Sentiremos sua falta! Se mudar de ideia: [link checkout]" (FR70)
**And** sistema remove membro do grupo Telegram via `banChatMember`
**And** registro no audit log: `{ action: 'member_cancelled', actor_type: 'self', member_id, reason: 'self_cancel', timestamp }` (FR69)
**And** se membro não tem status `trial` ou `ativo`, bot responde: "Você não tem assinatura ativa para cancelar."
**And** handler registrado no bot para comando `/cancelar` em chat privado apenas (não funciona no grupo)

### Story 9.3: Histórico de Cancelamentos e Reativação

As a **operador (Super Admin)**,
I want ver o histórico de cancelamentos e poder reativar membros,
So that eu tenha visibilidade total e possa corrigir cancelamentos indevidos.

**Acceptance Criteria:**

**Given** operador está na página `/members`
**When** filtra por status "Cancelado"
**Then** tabela mostra membros cancelados com colunas: Nome, Telegram ID, Motivo do Cancelamento, Cancelado Por (operador ou self-service), Data do Cancelamento (FR69)
**And** filtro de status no `MemberList` inclui opção "cancelado"
**And** API `GET /api/members` aceita `status=cancelado` como filtro
**And** counter cards no topo incluem contagem de "Cancelados" (últimos 30 dias)
**And** para membros cancelados, exibe botão "Reativar" que reabre acesso: atualiza `status = 'ativo'`, `kicked_at = null`, `cancellation_reason = null`
**And** reativação via API `POST /api/members/{id}/reactivate` adiciona membro de volta ao grupo Telegram via `unbanChatMember` + `inviteLink`
**And** reativação registrada no audit log

---

## Epic 10: Analytics de Taxa de Acerto

Admin pode visualizar taxa de acerto por grupo, mercado, campeonato e período. Dados para decisões de negócio.

### Story 10.1: API de Analytics de Acerto com Filtros

As a **sistema (backend)**,
I want ter API routes que calculem taxa de acerto com múltiplos filtros,
So that o frontend possa exibir analytics detalhados.

**Acceptance Criteria:**

**Given** existem apostas com `bet_result` IN ('success', 'failure') na tabela `suggested_bets`
**When** API `GET /api/analytics/accuracy` é chamada
**Then** retorna objeto com:
- `total`: `{ rate, wins, losses, total }` — taxa de acerto geral (FR71)
- `byGroup`: array de `{ group_id, group_name, rate, wins, losses, total }` (FR72)
- `byMarket`: array de `{ market, category, rate, wins, losses, total }` — usando `categorizeMarket()` existente do metricsService (FR73)
- `byChampionship`: array de `{ league_name, country, rate, wins, losses, total }` — via JOIN `league_matches → league_seasons` (FR74)
- `periods`: `{ last7d: { rate, total }, last30d: { rate, total }, allTime: { rate, total } }`
**And** aceita query params: `group_id` (opcional), `market` (opcional), `championship` (opcional), `date_from` (opcional), `date_to` (opcional) (FR75)
**And** quando `date_from` e `date_to` são informados, filtra por `result_updated_at` BETWEEN
**And** apenas apostas com `bet_status = 'posted'` e `bet_result IN ('success', 'failure')` são consideradas
**And** Group Admin só vê dados do próprio grupo (RLS)
**And** resposta segue pattern `{ success: true, data: { ... } }`
**And** performance: resposta em < 2 segundos para até 10k apostas (NFR-P4)

### Story 10.2: Página de Analytics no Admin Panel

As a **operador (Super Admin ou Group Admin)**,
I want uma página dedicada de analytics no admin panel,
So that eu possa analisar performance das apostas e tomar decisões baseadas em dados.

**Acceptance Criteria:**

**Given** operador está logado no admin panel
**When** navega para `/analytics` (nova página no menu lateral)
**Then** página exibe seção de **Cards de Resumo** no topo:
- Card "Taxa de Acerto Total" com porcentagem em destaque + wins/total
- Card "Últimos 7 dias" com porcentagem + indicador de tendência (↑ ou ↓ vs período anterior)
- Card "Últimos 30 dias" com porcentagem + indicador de tendência
**And** seção **Acerto por Grupo** com tabela: Grupo | Taxa | Acertos | Total — ordenável por taxa (FR72)
**And** seção **Acerto por Mercado** com tabela: Mercado | Taxa | Acertos | Total — ordenável por taxa (FR73)
**And** seção **Acerto por Campeonato** com tabela: Campeonato | Taxa | Acertos | Total — ordenável por taxa (FR74)
**And** cada tabela tem mínimo de 3 apostas para exibir (evitar dados estatisticamente irrelevantes)
**And** taxas coloridas: >= 70% verde, >= 50% amarelo, < 50% vermelho
**And** menu lateral inclui item "Analytics" com ícone de gráfico entre "Histórico" e "Análises"
**And** página responsiva e carrega em < 3 segundos (NFR-P3)
**And** Group Admin vê apenas dados do seu grupo (sem seção "por Grupo")

### Story 10.3: Filtros de Período e Exportação

As a **operador (Super Admin)**,
I want filtrar analytics por período personalizado e exportar os dados,
So that eu possa analisar períodos específicos e compartilhar relatórios com sócios.

**Acceptance Criteria:**

**Given** operador está na página `/analytics`
**When** interage com os filtros no topo da página
**Then** exibe date picker com opções rápidas: "Últimos 7 dias", "Últimos 30 dias", "Último mês", "Personalizado" (FR75)
**And** ao selecionar "Personalizado", exibe campos de data início e data fim
**And** ao aplicar filtro de período, todas as tabelas e cards se atualizam com dados do período selecionado
**And** exibe botão "Exportar CSV" que gera arquivo com: data, jogo, mercado, pick, campeonato, grupo, resultado, odds
**And** CSV inclui linha de resumo no final com totais e taxas
**And** filtro de grupo (Super Admin): dropdown para filtrar por grupo específico
**And** filtro de mercado: dropdown para filtrar por categoria de mercado
**And** filtros são combináveis (período + grupo + mercado)
**And** URL atualiza com query params dos filtros (permite compartilhar link filtrado)

---

## Epic 11: Revisão do Dashboard

Dashboard exibe métricas de acerto como destaque principal, alertas são dismissíveis, informações relevantes para o operador.

### Story 11.1: Alertas Dismissíveis e Limpeza de Notificações

As a **Super Admin**,
I want dispensar alertas e notificações do dashboard,
So that eu veja apenas informações relevantes e atuais.

**Acceptance Criteria:**

**Given** Super Admin está na página `/` (Dashboard)
**When** vê alertas/notificações no painel
**Then** cada alerta individual tem botão "×" (dismiss) que marca como lido e remove da visualização (FR76)
**And** botão "Limpar todos" marca todas as notificações como lidas de uma vez
**And** notificações dismissíveis usam o campo `read_at` já existente na tabela `notifications`
**And** seção de alertas legacy (bot_offline, group_failed, etc.) é removida e substituída por lista de notificações unificada
**And** API `PATCH /api/notifications/{id}` (já existente) marca notificação individual como lida
**And** API `PATCH /api/notifications/mark-all-read` (já existente) marca todas como lidas
**And** dashboard mostra badge com contagem de notificações não lidas
**And** notificações lidas não aparecem no dashboard (apenas acessíveis via link "Ver todas")

### Story 11.2: Métricas de Acerto no Dashboard

As a **operador (Super Admin ou Group Admin)**,
I want ver métricas de acerto das apostas diretamente no dashboard,
So that eu tenha visibilidade imediata da performance ao abrir o painel.

**Acceptance Criteria:**

**Given** operador está na página `/` (Dashboard)
**When** o dashboard carrega
**Then** seção principal exibe cards de **Performance de Apostas** em destaque:
- Card "Taxa de Acerto" com porcentagem total em fonte grande + wins/total (FR77)
- Card "Últimos 7 dias" com taxa e indicador de tendência (↑↓) vs 7 dias anteriores (FR78)
- Card "Últimos 30 dias" com taxa e indicador de tendência vs 30 dias anteriores (FR78)
**And** Super Admin vê cards adicionais por grupo: mini-cards com nome do grupo + taxa de acerto
**And** Group Admin vê apenas a taxa de acerto do seu grupo
**And** dados vêm da API `GET /api/analytics/accuracy` (Epic 10, Story 10.1)
**And** cards de performance aparecem ANTES dos cards de membros/bots existentes (prioridade visual)
**And** se não há apostas com resultado, exibe "Sem dados suficientes" no lugar da porcentagem
**And** dashboard carrega em < 3 segundos (NFR-P3)
**And** API `GET /api/dashboard/stats` é expandida para incluir campo `accuracy` com dados básicos de acerto (evita chamada extra)
