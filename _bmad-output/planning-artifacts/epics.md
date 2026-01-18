---
stepsCompleted: [1, 2, 3, 4]
status: active
updatedAt: "2026-01-17"
lastAddendum: "v5-membership-payments"
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/prd-addendum-v2.md
  - _bmad-output/planning-artifacts/prd-addendum-v3.md
  - _bmad-output/planning-artifacts/prd-addendum-v4.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/project-context.md
  - docs/data-models.md
epicCount: 2
activeEpics: [15, 16]
pendingEpic: 15
priorityEpic: 16
completedEpicsFile: epics-completed.md
---

# bets-estatistica - Epic Breakdown (Ativos)

## Overview

Este documento contém os épicos ativos (15-16) do projeto bets-estatistica.

Para épicos completados (1-14), veja `epics-completed.md`.

## Requirements Inventory

### Functional Requirements

**Geraçao de Apostas**
- FR1: Sistema pode gerar análises estatísticas para jogos usando IA (LangChain + OpenAI)
- FR2: Sistema pode filtrar apenas apostas do tipo safe_bets das análises geradas
- FR3: Sistema pode descartar value_bets e manter apenas safe_bets
- FR4: Sistema pode armazenar apostas geradas na tabela suggested_bets

**Integraçao de Odds**
- FR5: Sistema pode consultar odds em tempo real de uma API externa
- FR6: Sistema pode associar odds a cada aposta gerada
- FR7: Sistema pode filtrar apostas com odds < 1.60, exceto quando `promovida_manual = true`
- FR8: Sistema pode ordenar apostas por odds (maior primeiro)
- FR9: Sistema pode selecionar as top 3 apostas com maiores odds

**Gestao de Elegibilidade (Epic 13)**
- FR47: Bot pode processar comando `/promover <id>` para marcar aposta como `elegivel` e `promovida_manual = true`, ignorando filtro de odds mínimas
- FR48: Bot pode processar comando `/remover <id>` para marcar aposta como `elegibilidade = 'removida'`, excluindo-a da seleçao de jobs futuros
- FR49: Bot pode processar comando `/status` para listar apostas elegíveis, próximo horário de postagem e contagem de apostas na fila
- FR50: Sistema pode incluir apostas com `promovida_manual = true` na seleçao mesmo quando odds < 1.60
- FR51: Bot pode confirmar execuçao de comandos admin com feedback visual

**Gestao de Membros - Entrada e Trial (FR-MB1-MB6)**
- FR-MB1: Bot pode detectar quando um novo usuário entra no grupo público via Telegram API
- FR-MB2: Sistema pode registrar novo membro no BD com `telegram_id`, `username`, `data_entrada`, `status = 'trial'`
- FR-MB3: Sistema pode calcular dias restantes de trial para cada membro
- FR-MB4: Sistema pode identificar método de pagamento do membro (cartao recorrente vs avulso)
- FR-MB5: Bot pode enviar mensagem de boas-vindas ao novo membro explicando o trial de 7 dias
- FR-MB6: Sistema pode armazenar configuraçao global de dias de trial (default: 7)

**Gestao de Membros - Integraçao Cakto Webhooks (FR-MB7-MB12)**
- FR-MB7: Sistema pode receber webhooks do Cakto via endpoint HTTPS com validaçao de secret
- FR-MB8: Sistema pode processar evento `purchase_approved` e marcar membro como `status = 'ativo'`
- FR-MB9: Sistema pode processar evento `subscription_created` e registrar tipo de assinatura
- FR-MB10: Sistema pode processar evento `subscription_renewed` e atualizar `data_proxima_renovacao`
- FR-MB11: Sistema pode processar evento `subscription_renewal_refused` e marcar membro para remoçao imediata
- FR-MB12: Sistema pode processar evento `subscription_canceled` e marcar membro para remoçao imediata

**Gestao de Membros - Notificaçoes (FR-MB13-MB17)**
- FR-MB13: Sistema pode enviar mensagem privada no Telegram para membros em trial
- FR-MB14: Sistema pode enviar lembrete diário a partir do dia 5 do trial para membros que nao pagaram
- FR-MB15: Sistema pode enviar lembrete diário a partir de 5 dias antes da renovaçao para membros com pagamento avulso (PIX/Boleto)
- FR-MB16: Sistema nao envia lembretes de renovaçao para membros com cartao de crédito recorrente
- FR-MB17: Sistema pode incluir link de checkout do Cakto nas mensagens de cobrança

**Gestao de Membros - Remoçao Automática (FR-MB18-MB21)**
- FR-MB18: Sistema pode remover (kick) membro do grupo Telegram via API
- FR-MB19: Sistema pode executar kick automático no dia 8 (trial expirado) se membro nao pagou
- FR-MB20: Sistema pode executar kick imediato quando renovaçao falha ou assinatura é cancelada
- FR-MB21: Sistema pode enviar mensagem ao membro removido com motivo e link para voltar

**Gestao de Membros - Comandos Admin (FR-MB22-MB27)**
- FR-MB22: Bot pode processar comando `/membros` e listar membros ativos, em trial, e inadimplentes com MRR e taxa de conversao
- FR-MB23: Bot pode processar comando `/membro @user` e exibir status detalhado (data entrada, status, dias restantes, histórico de pagamentos)
- FR-MB24: Bot pode processar comando `/trial <dias>` e configurar duraçao padrao do trial
- FR-MB25: Bot pode processar comando `/add_trial @user` e adicionar usuário manualmente ao trial
- FR-MB26: Bot pode processar comando `/remover_membro @user` e remover membro manualmente do grupo
- FR-MB27: Bot pode processar comando `/estender @user <dias>` e estender assinatura por cortesia

**Publicaçao Telegram (Grupo Público)**
- FR10: Bot pode enviar mensagens para o grupo público do Telegram
- FR11: Bot pode postar automaticamente nos horários 10h, 15h e 22h (America/Sao_Paulo)
- FR12: Bot pode formatar mensagens com informaçoes do jogo, aposta, odds e justificativa
- FR13: Bot pode incluir link de aposta fornecido pelo operador
- FR14: Bot pode variar o texto das mensagens para manter engajamento
- FR15: Bot pode exibir taxa de acerto histórica na mensagem

**Grupo Admin (Coleta de Links)**
- FR16: Bot pode postar pedidos de links no grupo admin (8h, 13h, 20h)
- FR17: Bot pode formatar pedido com detalhes da aposta (jogo, mercado, odd esperada)
- FR18: Bot pode detectar quando operador responde com um link
- FR19: Bot pode validar se o link é de uma casa de apostas conhecida (Bet365, Betano, etc.)
- FR20: Bot pode salvar link associado à aposta no BD
- FR21: Bot pode enviar lembrete se operador nao responder em X minutos
- FR22: Bot pode confirmar recebimento do link com checkmark

**Deep Links**
- FR23: Sistema pode armazenar links de aposta fornecidos pelo operador
- FR24: Sistema só posta no grupo público se a aposta tiver link válido
- FR25: Usuário pode clicar no link e ser direcionado para a aposta na casa

**Tracking de Resultados**
- FR26: Sistema pode registrar status de cada aposta (pending, success, failure, cancelled)
- FR27: Sistema pode detectar quando um jogo termina
- FR28: Sistema pode comparar resultado do jogo com a aposta sugerida
- FR29: Sistema pode atualizar automaticamente o status da aposta após o jogo
- FR30: Sistema pode armazenar odds no momento da postagem
- FR31: Sistema pode armazenar timestamp de cada postagem

**Métricas e Monitoramento**
- FR32: Sistema pode calcular taxa de acerto (últimos 30 dias)
- FR33: Sistema pode calcular taxa de acerto histórica (all-time)
- FR34: Operador pode visualizar logs de execuçao do bot
- FR35: Operador pode verificar status de postagens (enviadas/falhadas)
- FR36: Operador pode forçar retry manual de postagem falhada
- FR37: Sistema pode alertar operador em caso de falha crítica

**Regras de Negócio**
- FR38: Sistema deve manter pelo menos 3 apostas ativas a qualquer momento
- FR39: Sistema deve considerar apenas jogos com pelo menos 2 dias de antecedencia
- FR40: Sistema nao deve postar no grupo público se aposta nao tiver link válido
- FR41: Sistema nao deve postar se API de odds estiver indisponível
- FR42: Sistema deve pedir links 2h antes do horário de postagem pública

**Gestao de Dados**
- FR43: Sistema pode buscar dados de jogos da API FootyStats
- FR44: Sistema pode armazenar jogos, times e estatísticas no PostgreSQL (Supabase)
- FR45: Sistema pode gerenciar fila de análise de partidas
- FR46: Sistema pode sincronizar dados com Supabase

### NonFunctional Requirements

**Performance**
- NFR1: Postagem deve ocorrer no horário programado (± 30 segundos)
- NFR2: Consulta de odds deve completar em < 5 segundos por aposta
- NFR3: Geraçao de deep links pode ser pré-processada (< 5 minutos)
- NFR4: Tracking de resultados pode ter delay (< 30 minutos após fim do jogo)

**Reliability**
- NFR5: Bot deve estar disponível nos horários de postagem (cold start OK)
- NFR6: Postagens nao devem ser perdidas (0 por mes)
- NFR7: Sistema deve recuperar de falhas automaticamente (retry < 5 min)
- NFR8: Dados de tracking nao devem ser perdidos (100%)

**Security**
- NFR9: API keys devem ser armazenadas em variáveis de ambiente
- NFR10: Bot token do Telegram deve ser protegido (rotaçao possível)
- NFR11: Logs nao devem expor credenciais

**Scalability**
- NFR12: Sistema deve suportar até 10.000 membros sem degradaçao
- NFR13: Custos de API devem ser previsíveis

**Integration**
- NFR14: Sistema deve tolerar indisponibilidade de APIs externas (fallback)
- NFR15: Sistema deve cachear dados de odds (5 minutos)
- NFR16: Sistema deve logar todas as chamadas de API

**Operabilidade**
- NFR17: Operador deve ser alertado de falhas críticas (< 5 min)
- NFR18: Sistema deve ter logs estruturados (JSON)
- NFR19: Deploy deve ser simples (1 comando)
- NFR20: Rollback deve ser possível (< 5 min)

**Gestao de Membros**
- NFR21: Webhook do Cakto deve ser processado rapidamente (< 5 segundos)
- NFR22: Remoçao de membro inadimplente deve ocorrer no horário correto (± 1 hora)
- NFR23: Mensagens de cobrança devem ser entregues (99% via Telegram API)
- NFR24: Dados de membros devem ser protegidos (criptografia em transito, acesso restrito)

### Additional Requirements

**Da Architecture:**
- Migrar PostgreSQL local -> Supabase
- Implementar state machine de apostas (7 estados)
- Deploy no Render com cron jobs (8 jobs)
- Integrar The Odds API com market mapping
- Padrao de response `{ success, data/error }`
- Retry 3x com exponential backoff
- Alertas no grupo admin (formato técnico + simples)
- Acesso ao banco centralizado via lib/supabase.js

**Do data-models.md (Migraçao):**
- Adicionar campos em suggested_bets:
  - deep_link (TEXT)
  - bet_status (ENUM: generated, pending_link, ready, posted, success, failure, cancelled)
  - telegram_posted_at (TIMESTAMP)
  - telegram_message_id (BIGINT)
  - odds_at_post (DECIMAL)
  - result_updated_at (TIMESTAMP)
- Manter constraint bet_category IN ('SAFE', 'OPORTUNIDADE')
- Usar apenas SAFE (safe_bets)

**Do project-context.md:**
- Naming: snake_case (DB), camelCase (JS)
- Logging: logger.info/warn/error
- Error handling: retry + alertAdmin()
- Remover puppeteer

**Da Architecture (Gestao de Membros - Epic 16):**
- Express server separado na porta 3001 para webhooks Cakto
- Event sourcing: salvar webhook raw em `webhook_events` -> processar async
- State machine de membros: `trial -> ativo -> inadimplente -> removido`
- Locks distribuídos via Supabase para jobs de membership
- Validaçao HMAC + rate limiting (100 req/min)
- Tabelas: `members`, `member_notifications`, `webhook_events`
- 5 jobs de membership: trial-reminders, kick-expired, renewal-reminders, process-webhooks, reconciliation
- Service wrapper `caktoService.js` para OAuth + API Cakto
- `memberService.js` para CRUD de membros + validaçao de transiçoes

### FR Coverage Map

| FR | Epic | Descriçao |
|----|------|-----------|
| FR1-4 | Epic 6 | Geraçao IA (safe_bets) |
| FR5-9 | Epic 4 | Integraçao Odds API |
| FR10-15 | Epic 3 | Postagem grupo público |
| FR16-22 | Epic 2 | Coleta links admin |
| FR23-25 | Epic 2 | Deep links |
| FR26-31 | Epic 5 | Tracking resultados |
| FR32-37 | Epic 5 | Métricas |
| FR38-42 | Epic 3 | Regras de negócio |
| FR43-46 | Epic 1 | Gestao de dados |
| FR47-51 | Epic 13 | Gestao de elegibilidade |
| FR-MB1-6 | Epic 16 | Entrada e trial de membros |
| FR-MB7-12 | Epic 16 | Integraçao webhooks Cakto |
| FR-MB13-17 | Epic 16 | Notificaçoes de cobrança |
| FR-MB18-21 | Epic 16 | Remoçao automática |
| FR-MB22-27 | Epic 16 | Comandos admin membros |

## Epic List (Ativos)

### Epic 15: Agente de Scraping para Odds (Betano)
Garantir odds atualizadas buscando diretamente na Betano 30 minutos antes de cada postagem, usando agente LLM.
**FRs cobertos:** FR-S1-9
**Status:** Pendente

### Epic 16: Gestao de Membros e Pagamentos Cakto
Permitir que o sistema monetize através de assinaturas, gerenciando membros do grupo público com trial de 7 dias, processando pagamentos via Cakto, e automatizando remoçao de inadimplentes.
**FRs cobertos:** FR-MB1-27, NFR21-24, ADR-001-004
**Status:** Prioridade Alta (Sprint atual)

---

## Epic 15: Agente de Scraping para Odds (Betano)

Garantir odds atualizadas buscando diretamente na Betano 30 minutos antes de cada postagem, usando agente LLM.

**Valor para o Usuário:**
- Odds sempre atualizadas no momento da postagem
- Maior cobertura de odds (mercados que API nao cobre)
- Transparencia sobre custo de tokens

**FRs cobertos:** FR-S1-9

### Story 15.1: Criar Serviço de Scraping (scrapingOddsService.js)

As a sistema,
I want ter um serviço de scraping de odds via LLM,
So that possa buscar odds diretamente da Betano.

**Acceptance Criteria:**

**Given** módulo `bot/services/scrapingOddsService.js` criado
**When** chamado com dados de uma aposta
**Then** usa agente LLM para:
  1. Acessar site da Betano
  2. Encontrar o jogo pelos times
  3. Extrair APENAS a odd do mercado específico
  4. Retornar valor numérico

**Interface:**
```javascript
async function scrapeBetOdds(homeTeam, awayTeam, betMarket, betPick) {
  // Input: "Liverpool", "Arsenal", "Over 2.5 gols", "over"
  // Output: { bookmaker: 'betano', odds: 1.85, market: 'totals', type: 'over', line: 2.5 }
}
```

**Regras de Economia:**
- Buscar APENAS o mercado específico da aposta
- NAO buscar todos os mercados do jogo
- Prompt focado: "Qual a odd de Over 2.5 no jogo X vs Y?"

### Story 15.2: Implementar Cache por Aposta

As a sistema,
I want cachear odds buscadas por aposta,
So that nao faça scraping repetido.

**Acceptance Criteria:**

**Given** scraping de odds executado para uma aposta
**When** mesma aposta consultada novamente
**Then** retorna do cache se < 25 minutos
**And** faz novo scraping se cache expirado

**Cache key:** `${homeTeam}_${awayTeam}_${betMarket}`
**TTL:** 25 minutos (expira antes da próxima postagem)

### Story 15.3: Criar Job de Scraping (scrapingOdds.js)

As a sistema,
I want ter um job de scraping que roda antes das postagens,
So that odds estejam sempre atualizadas.

**Acceptance Criteria:**

**Given** cron configurado para 09:30, 14:30, 21:30
**When** job executa
**Then** busca apostas elegíveis para próxima postagem
**And** para cada aposta:
  1. Verifica cache
  2. Se cache miss, chama `scrapeBetOdds()`
  3. Se scraping falhar, tenta fallback API
  4. Atualiza odds no BD
  5. Registra em histórico
**And** ao final, envia warn com resumo

**Technical Notes:**
- Criar `bot/jobs/scrapingOdds.js`
- Funçao principal: `runScrapingOdds()`
- Chamar `sendScrapingWarn()` ao final

### Story 15.4: Implementar Fallback para The Odds API

As a sistema,
I want ter fallback para API se scraping falhar,
So that nao fique sem odds.

**Acceptance Criteria:**

**Given** scraping de uma aposta falha
**When** sistema detecta erro
**Then** tenta buscar via The Odds API (comportamento atual)
**And** se ambos falharem, marca aposta como "sem odds"
**And** loga qual método foi usado

**Hierarquia:**
1. Cache (se disponível e < 25 min)
2. Scraping Betano
3. The Odds API (fallback)
4. Sem odds (último recurso)

### Story 15.5: Integrar Warn Pós-Scraping

As a operador,
I want receber warn após cada scraping,
So that saiba quais odds foram atualizadas.

**Acceptance Criteria:**

**Given** job de scraping conclui
**When** resultados processados
**Then** chama `sendScrapingWarn()` com:
  - Apostas atualizadas (old -> new)
  - Apostas que falharam
  - Status para próxima postagem

**Technical Notes:**
- Chamar `sendScrapingWarn()` ao final de `scrapingOdds.js`
- Passar lista de atualizaçoes coletadas durante execuçao

### Story 15.6: Adicionar Métricas de Custo LLM

As a operador,
I want ver quanto estou gastando em tokens,
So that possa controlar custos.

**Acceptance Criteria:**

**Given** scraping via LLM executado
**When** job conclui
**Then** loga métricas:
  - Total de scrapes feitos
  - Tokens usados (estimativa)
  - Cache hits vs misses
  - Tempo de execuçao
**And** inclui resumo no warn:
  - "Custo: ~X tokens | Cache: Y hits"

**Technical Notes:**
- Criar contador em `scrapingOddsService.js`
- Estimar tokens por chamada (~500-1000)
- Incluir no warn via parametro adicional

### Story 15.7: Configurar Limite Diário de Custo

As a sistema,
I want ter limite configurável de chamadas LLM,
So that custos nao fujam do controle.

**Acceptance Criteria:**

**Given** configuraçao em `lib/config.js`
**When** limite de scrapes diários atingido
**Then** usa apenas fallback API
**And** alerta operador que limite foi atingido

**Configuraçao:**
```javascript
scraping: {
  maxDailyScapes: 100,      // Máximo por dia
  cacheTtlMinutes: 25,       // TTL do cache
  fallbackToApi: true,       // Usar API se falhar
  alertOnLimitReached: true  // Alertar ao atingir limite
}
```

### Story 15.8: Atualizar Schedule em bot/server.js

As a sistema,
I want ter o novo schedule de jobs configurado,
So that scraping rode antes das postagens.

**Acceptance Criteria:**

**Given** `bot/server.js` atualizado
**When** cron jobs configurados
**Then** schedule é:
  - 09:30 -> `runScrapingOdds()` + warn
  - 10:00 -> `runPostBets('morning')` + warn
  - 14:30 -> `runScrapingOdds()` + warn
  - 15:00 -> `runPostBets('afternoon')` + warn
  - 21:30 -> `runScrapingOdds()` + warn
  - 22:00 -> `runPostBets('night')` + warn

**Technical Notes:**
- Adicionar novos crons para 09:30, 14:30, 21:30
- Manter health check a cada 5 min
- Remover ou ajustar enrichOdds antigos (08:00, 13:00, 20:00)

---

## Ordem de Implementaçao - Epic 15

1. Story 15.1 (Serviço scraping) -> Core
2. Story 15.2 (Cache) -> Otimizaçao
3. Story 15.4 (Fallback API) -> Resiliencia
4. Story 15.3 (Job scraping) -> Integraçao
5. Story 15.5 (Warn pós-scraping) -> UX
6. Story 15.6 (Métricas custo) -> Monitoramento
7. Story 15.7 (Limite diário) -> Controle
8. Story 15.8 (Novo schedule) -> Finalizaçao

---

# ADDENDUM v5 - Gestao de Membros e Pagamentos (2026-01-17)

## Requirements Inventory - Addendum v5

### Novos Functional Requirements (Gestao de Membros)

**Entrada e Trial (FR-MB1-MB6)**
- FR-MB1: Bot detecta entrada de novo usuário via Telegram API
- FR-MB2: Sistema registra membro com `telegram_id`, `username`, `status = 'trial'`
- FR-MB3: Sistema calcula dias restantes de trial
- FR-MB4: Sistema identifica método de pagamento (cartao vs avulso)
- FR-MB5: Bot envia mensagem de boas-vindas explicando trial 7 dias
- FR-MB6: Sistema armazena configuraçao global de trial (default: 7)

**Integraçao Cakto Webhooks (FR-MB7-MB12)**
- FR-MB7: Sistema recebe webhooks via HTTPS com validaçao HMAC
- FR-MB8: Processa `purchase_approved` -> `status = 'ativo'`
- FR-MB9: Processa `subscription_created` -> registra tipo assinatura
- FR-MB10: Processa `subscription_renewed` -> atualiza renovaçao
- FR-MB11: Processa `subscription_renewal_refused` -> marca para kick
- FR-MB12: Processa `subscription_canceled` -> marca para kick

**Notificaçoes (FR-MB13-MB17)**
- FR-MB13: Sistema envia mensagem privada para membros em trial
- FR-MB14: Lembrete diário a partir do dia 5 do trial
- FR-MB15: Lembrete 5 dias antes da renovaçao (PIX/Boleto)
- FR-MB16: NAO envia lembretes para cartao recorrente
- FR-MB17: Inclui link checkout Cakto nas mensagens

**Remoçao Automática (FR-MB18-MB21)**
- FR-MB18: Sistema pode remover (kick) membro via API Telegram
- FR-MB19: Kick automático dia 8 (trial expirado)
- FR-MB20: Kick imediato quando renovaçao falha/cancela
- FR-MB21: Mensagem ao removido com motivo + link para voltar

**Comandos Admin (FR-MB22-MB27)**
- FR-MB22: `/membros` - lista ativos, trial, inadimplentes, MRR
- FR-MB23: `/membro @user` - status detalhado
- FR-MB24: `/trial <dias>` - configura duraçao trial
- FR-MB25: `/add_trial @user` - adiciona ao trial
- FR-MB26: `/remover_membro @user` - remove manualmente
- FR-MB27: `/estender @user <dias>` - estende por cortesia

### Novos Non-Functional Requirements

- NFR21: Webhook response < 5 segundos
- NFR22: Remoçao +- 1 hora do horário programado
- NFR23: 99% entrega de mensagens via Telegram
- NFR24: Dados de membros protegidos (criptografia)

### Requisitos da Architecture (ADRs)

- ADR-001: Event Sourcing para webhooks (salvar raw -> processar async)
- ADR-002: Supabase como fonte de verdade de estado
- ADR-003: Módulo `membership/` com jobs + locks distribuídos
- ADR-004: Validaçao HMAC + rate limiting (100 req/min)

### FR Coverage Map - Addendum v5

| FR | Story | Descriçao |
|----|-------|-----------|
| FR-MB1-6 | 16.4 | Entrada e trial de membros |
| FR-MB7 | 16.2 | Webhook server + event sourcing |
| FR-MB8-12 | 16.3 | Processamento de webhooks |
| FR-MB13-17 | 16.5 | Notificaçoes de cobrança |
| FR-MB18-21 | 16.6 | Remoçao automática |
| FR-MB22-27 | 16.7 | Comandos admin membros |
| ADR-001,004 | 16.2 | Segurança webhooks |
| ADR-002,003 | 16.1, 16.8 | State machine + reconciliaçao |

---

## Epic 16: Gestao de Membros e Pagamentos Cakto

Permitir que o sistema monetize através de assinaturas, gerenciando membros do grupo público com trial de 7 dias, processando pagamentos via Cakto, e automatizando remoçao de inadimplentes.

**Valor para o Usuário:**
- Marcelo (operador) pode monetizar o grupo com R$50/mes
- Novos membros tem experiencia de trial de 7 dias
- Pagamentos sao processados automaticamente via Cakto
- Inadimplentes sao removidos sem intervençao manual
- Operador tem visibilidade completa sobre MRR e membros

**FRs cobertos:** FR-MB1-27, NFR21-24, ADR-001-004

**Prioridade:** ALTA (Sprint atual)

---

### Story 16.1: Criar Infraestrutura de Membros e State Machine

As a sistema,
I want ter tabelas de membros e validaçao de transiçoes de estado,
So that possa gerenciar o ciclo de vida dos membros.

**Acceptance Criteria:**

**Given** migration executada no Supabase
**When** tabelas criadas
**Then** estrutura inclui:
  - `members` com campos: id, telegram_id, telegram_username, email, status, cakto_subscription_id, cakto_customer_id, trial_started_at, trial_ends_at, subscription_started_at, subscription_ends_at, payment_method, last_payment_at, kicked_at, created_at, updated_at
  - `member_notifications` com campos: id, member_id, type, channel, sent_at, message_id
  - `webhook_events` com campos: id, idempotency_key, event_type, payload, status, attempts, max_attempts, last_error, created_at, processed_at
**And** índices criados para consultas frequentes

**Given** funçao `canTransition(currentStatus, newStatus)` implementada
**When** chamada com transiçao válida (ex: trial -> ativo)
**Then** retorna true
**And** quando chamada com transiçao inválida (ex: removido -> ativo)
**Then** retorna false

**Given** funçao `updateMemberStatus(memberId, newStatus)` chamada
**When** transiçao é válida
**Then** atualiza status e updated_at
**And** quando transiçao é inválida
**Then** retorna erro com código INVALID_MEMBER_STATUS

**Technical Notes:**
- Criar sql/migrations/002_membership_tables.sql
- Criar sql/migrations/003_webhook_events.sql
- Criar bot/services/memberService.js com VALID_TRANSITIONS
- Seguir Service Response Pattern: { success, data/error }

### Story 16.2: Criar Webhook Server com Event Sourcing

As a sistema,
I want receber webhooks do Cakto de forma segura e confiável,
So that nunca perca eventos de pagamento.

**Acceptance Criteria:**

**Given** Express server configurado na porta 3001
**When** request POST recebido em /webhooks/cakto
**Then** aplica rate limiting (100 req/min por IP)
**And** rejeita payloads > 1MB com status 413
**And** valida assinatura HMAC-SHA256 do header
**And** se assinatura inválida, retorna 401

**Given** webhook com assinatura válida recebido
**When** processado pelo handler
**Then** salva evento raw na tabela `webhook_events` com status 'pending'
**And** responde 200 imediatamente (< 200ms)
**And** NAO processa o evento síncronamente

**Given** evento já recebido anteriormente (mesmo idempotency_key)
**When** webhook duplicado chega
**Then** retorna 200 sem criar novo registro
**And** loga como "duplicate webhook ignored"

**Given** servidor iniciado
**When** GET /health chamado
**Then** retorna { status: 'ok', port: 3001 }

**Technical Notes:**
- Criar bot/webhook-server.js (Express + helmet + rate-limit)
- Criar bot/handlers/caktoWebhook.js
- Validar HMAC com crypto.timingSafeEqual
- Usar CAKTO_WEBHOOK_SECRET do .env
- Logar com prefixo [cakto:webhook]

### Story 16.3: Implementar Processamento Assíncrono de Webhooks

As a sistema,
I want processar eventos de pagamento do Cakto,
So that membros sejam ativados/desativados automaticamente.

**Acceptance Criteria:**

**Given** job process-webhooks rodando a cada 30 segundos
**When** eventos com status 'pending' existem
**Then** processa cada evento em ordem de criaçao
**And** atualiza status para 'processing' durante execuçao
**And** atualiza status para 'completed' após sucesso
**And** incrementa attempts e atualiza last_error em caso de falha

**Given** evento `purchase_approved` recebido
**When** processado
**Then** busca ou cria membro pelo email/telegram_id
**And** atualiza status para 'ativo'
**And** registra cakto_subscription_id e cakto_customer_id
**And** registra payment_method (pix/boleto/cartao_recorrente)
**And** registra subscription_started_at e calcula subscription_ends_at

**Given** evento `subscription_renewed` recebido
**When** processado
**Then** atualiza last_payment_at
**And** recalcula subscription_ends_at (+30 dias)
**And** se status era 'inadimplente', muda para 'ativo'

**Given** evento `subscription_renewal_refused` ou `subscription_canceled` recebido
**When** processado
**Then** muda status para 'inadimplente' (se era ativo)
**And** agenda kick imediato (via flag ou fila)

**Given** evento com attempts >= max_attempts (5)
**When** job tenta processar
**Then** muda status para 'failed'
**And** envia alerta para admin com detalhes do erro

**Technical Notes:**
- Criar bot/jobs/membership/process-webhooks.js
- Criar bot/services/caktoService.js para OAuth + API
- Usar lock distribuído via lib/lock.js
- Handler registry: WEBHOOK_HANDLERS[event_type]
- Logar com prefixo [membership:process-webhooks]

### Story 16.4: Implementar Detecçao de Entrada e Sistema de Trial

As a novo membro,
I want ser registrado automaticamente quando entro no grupo,
So that tenha 7 dias de trial para experimentar o serviço.

**Acceptance Criteria:**

**Given** novo usuário entra no grupo público (via new_chat_members)
**When** bot detecta o evento
**Then** cria registro em `members` com:
  - telegram_id do usuário
  - telegram_username (se disponível)
  - status = 'trial'
  - trial_started_at = NOW()
  - trial_ends_at = NOW() + 7 dias (configurável)
**And** envia mensagem de boas-vindas no privado

**Given** usuário já existe na tabela members
**When** entra novamente no grupo
**Then** NAO cria registro duplicado
**And** se status era 'removido' e kicked_at < 24h, permite reentrada
**And** se kicked_at > 24h, envia mensagem pedindo pagamento

**Given** membro em trial
**When** funçao `getTrialDaysRemaining(memberId)` chamada
**Then** retorna número de dias restantes (0 a 7)
**And** retorna 0 se trial já expirou

**Given** configuraçao global de trial
**When** variável TRIAL_DAYS alterada
**Then** novos membros usam o novo valor
**And** membros existentes mantem seu trial original

**Formato mensagem boas-vindas:**
```
Bem-vindo ao [Nome do Grupo]!

Voce tem *7 dias grátis* para experimentar nossas apostas.

Receba 3 apostas diárias com análise estatística
Taxa de acerto histórica: XX%

Após o trial, continue por apenas R$50/mes.

Dúvidas? Fale com @operador
```

**Technical Notes:**
- Criar handler em bot/handlers/memberEvents.js
- Usar evento 'new_chat_members' do Telegram
- Funçao getMemberByTelegramId() em memberService.js
- Funçao createTrialMember() em memberService.js
- Config TRIAL_DAYS em lib/config.js (default: 7)

### Story 16.5: Implementar Notificaçoes de Cobrança

As a operador,
I want que membros recebam lembretes de pagamento automaticamente,
So that a conversao de trial e renovaçao seja maximizada.

**Acceptance Criteria:**

**Given** job trial-reminders rodando às 09:00 BRT
**When** membro está no dia 5, 6 ou 7 do trial
**Then** envia mensagem privada com lembrete
**And** registra em `member_notifications` (type: 'trial_reminder')
**And** NAO envia se já enviou hoje (mesmo type)

**Given** job renewal-reminders rodando às 10:00 BRT
**When** membro ativo com PIX/Boleto está a 5, 3 ou 1 dia da renovaçao
**Then** envia mensagem privada com lembrete
**And** registra em `member_notifications` (type: 'renewal_reminder')
**And** NAO envia se payment_method = 'cartao_recorrente'

**Given** qualquer mensagem de cobrança
**When** enviada ao membro
**Then** inclui link de checkout Cakto personalizado
**And** inclui dias restantes de forma clara
**And** usa tom amigável, nao agressivo

**Formato lembrete trial (dia 5):**
```
Seu trial termina em *3 dias*!

Voce está aproveitando as apostas?

Continue recebendo análises diárias por R$50/mes:
[ASSINAR AGORA](link_cakto)

Dúvidas? @operador
```

**Formato lembrete renovaçao (PIX/Boleto):**
```
Sua assinatura renova em *5 dias*

Para nao perder acesso, efetue o pagamento:
[PAGAR AGORA](link_cakto)

Pagamentos via PIX/Boleto precisam ser feitos manualmente.
```

**Technical Notes:**
- Criar bot/jobs/membership/trial-reminders.js (09:00 BRT)
- Criar bot/jobs/membership/renewal-reminders.js (10:00 BRT)
- Funçao sendPrivateMessage(telegramId, message)
- Funçao hasNotificationToday(memberId, type)
- Funçao getCheckoutLink(memberId) via caktoService
- Logar com prefixo [membership:trial-reminders] e [membership:renewal-reminders]

### Story 16.6: Implementar Remoçao Automática de Inadimplentes

As a operador,
I want que membros inadimplentes sejam removidos automaticamente,
So that nao precise fazer isso manualmente.

**Acceptance Criteria:**

**Given** job kick-expired rodando às 00:01 BRT
**When** membro tem status 'trial' e trial_ends_at < NOW()
**Then** envia mensagem de despedida no privado
**And** remove (kick) membro do grupo via API Telegram
**And** atualiza status para 'removido'
**And** registra kicked_at = NOW()

**Given** evento de cancelamento/falha de renovaçao processado
**When** membro marcado para kick imediato
**Then** envia mensagem de despedida no privado
**And** remove membro do grupo imediatamente
**And** atualiza status para 'removido'

**Given** kick executado
**When** API Telegram falha
**Then** registra erro e tenta novamente na próxima execuçao
**And** alerta admin após 3 tentativas falhas

**Given** membro removido
**When** mensagem de despedida enviada
**Then** inclui motivo da remoçao (trial expirado ou pagamento falhou)
**And** inclui link para reativar assinatura
**And** informa período de graça de 24h para voltar

**Formato mensagem despedida (trial):**
```
Seu trial de 7 dias terminou

Sentiremos sua falta!

Para voltar a receber nossas apostas:
[ASSINAR POR R$50/MES](link_cakto)

Voce tem 24h para reativar e voltar ao grupo.
```

**Formato mensagem despedida (inadimplente):**
```
Sua assinatura nao foi renovada

Voce foi removido do grupo por falta de pagamento.

Para reativar seu acesso:
[PAGAR AGORA](link_cakto)

Regularize em 24h para voltar automaticamente.
```

**Technical Notes:**
- Criar bot/jobs/membership/kick-expired.js (00:01 BRT)
- Funçao kickMember(telegramId, chatId) via Telegram API
- Funçao sendFarewellMessage(memberId, reason)
- Usar banChatMember com until_date para permitir reentrada
- Logar com prefixo [membership:kick-expired]

### Story 16.7: Implementar Comandos Admin para Gestao de Membros

As a operador,
I want ter comandos para gerenciar membros manualmente,
So that possa ter controle total sobre o grupo.

**Acceptance Criteria:**

**Given** operador envia `/membros` no grupo admin
**When** bot processa comando
**Then** exibe resumo:
  - Total de membros ativos
  - Total em trial
  - Total inadimplentes
  - MRR (Monthly Recurring Revenue)
  - Taxa de conversao (trial -> ativo)

**Given** operador envia `/membro @username` no grupo admin
**When** bot processa comando
**Then** exibe status detalhado do membro:
  - Status atual (trial/ativo/inadimplente/removido)
  - Data de entrada
  - Dias restantes (trial ou assinatura)
  - Método de pagamento
  - Ultima renovaçao
  - Histórico de notificaçoes enviadas

**Given** operador envia `/trial 14` no grupo admin
**When** bot processa comando
**Then** altera TRIAL_DAYS global para 14
**And** confirma: "Trial alterado para 14 dias (novos membros)"

**Given** operador envia `/add_trial @username` no grupo admin
**When** bot processa comando
**Then** cria membro com status 'trial' se nao existe
**And** se já existe, reinicia trial
**And** confirma com detalhes

**Given** operador envia `/remover_membro @username` no grupo admin
**When** bot processa comando
**Then** remove membro do grupo via API
**And** atualiza status para 'removido'
**And** registra motivo: 'manual_removal'
**And** confirma: "@username removido do grupo"

**Given** operador envia `/estender @username 7` no grupo admin
**When** bot processa comando
**Then** adiciona 7 dias à subscription_ends_at ou trial_ends_at
**And** confirma: "@username estendido por 7 dias (cortesia)"
**And** registra em notes: 'cortesia +7 dias'

**Formato /membros:**
```
*MEMBROS DO GRUPO*

Total: 150 membros
Ativos: 120
Trial: 25
Inadimplentes: 5

MRR: R$ 6.000,00
Conversao: 48% (trial -> ativo)

Use /membro @user para detalhes
```

**Technical Notes:**
- Adicionar handlers em bot/handlers/adminGroup.js
- Funçoes em memberService.js: getMemberStats(), getMemberDetails()
- Funçao setTrialDays() para config global
- Funçao extendMembership(memberId, days)

### Story 16.8: Implementar Reconciliaçao com Cakto

As a sistema,
I want reconciliar estado dos membros com o Cakto diariamente,
So that detecte e corrija dessincronizaçoes.

**Acceptance Criteria:**

**Given** job reconciliation rodando às 03:00 BRT
**When** executa
**Then** busca todos os membros com status 'ativo' ou 'trial'
**And** para cada membro com cakto_subscription_id, consulta API Cakto
**And** compara status local vs status Cakto

**Given** membro local 'ativo' mas Cakto retorna 'canceled'
**When** dessincronizaçao detectada
**Then** NAO corrige automaticamente
**And** envia alerta para admin:
  - Membro afetado
  - Status local vs Cakto
  - Açao sugerida: "verificar manualmente"

**Given** membro local 'trial' sem cakto_subscription_id
**When** reconciliaçao executa
**Then** ignora (trial nao tem assinatura ainda)

**Given** API Cakto indisponível
**When** reconciliaçao tenta consultar
**Then** loga erro e continua com próximo membro
**And** ao final, reporta quantos falharam
**And** se > 50% falhou, alerta admin

**Given** reconciliaçao concluída
**When** job termina
**Then** loga resumo:
  - Total verificados
  - Total sincronizados
  - Total dessincronizados
  - Total com erro de API
**And** se houver dessincronizaçoes, envia alerta consolidado

**Formato alerta dessincronizaçao:**
```
*DESSINCRONIZACAO DETECTADA*

Job: Reconciliaçao 03:00

*2 membros com estado divergente:*

@user1
   Local: ativo | Cakto: canceled
   Verificar se deve remover

@user2
   Local: ativo | Cakto: expired
   Verificar pagamento

Açao: Verificaçao manual necessária
```

**Technical Notes:**
- Criar bot/jobs/membership/reconciliation.js (03:00 BRT)
- Usar caktoService.getSubscription(subscriptionId)
- Lock de 15 minutos (reconciliaçao pode demorar)
- Rate limit nas chamadas Cakto (evitar throttling)
- Logar com prefixo [membership:reconciliation]

---

## Ordem de Implementaçao - Epic 16

1. Story 16.1 (Infraestrutura DB + State Machine) -> Base
2. Story 16.2 (Webhook Server + Event Sourcing) -> Integraçao
3. Story 16.3 (Processamento Webhooks) -> Core
4. Story 16.4 (Detecçao Entrada + Trial) -> Onboarding
5. Story 16.5 (Notificaçoes Cobrança) -> Monetizaçao
6. Story 16.6 (Remoçao Automática) -> Enforcement
7. Story 16.7 (Comandos Admin) -> Operaçao
8. Story 16.8 (Reconciliaçao Cakto) -> Resiliencia
