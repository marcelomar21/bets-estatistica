---
stepsCompleted: [1, 2, 3, 4]
status: archived
archivedAt: "2026-02-05"
description: "Epics 1-14, 16, 17 completados e arquivados"
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/prd-addendum-v2.md
  - _bmad-output/planning-artifacts/prd-addendum-v3.md
  - _bmad-output/planning-artifacts/prd-addendum-v4.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/project-context.md
  - docs/data-models.md
epicCount: 16
---

# bets-estatistica - Epics Completados (1-14, 16, 17)

## Overview

Este documento contém os épicos completados (1-14, 16) do projeto bets-estatistica. Para épicos ativos, veja `epics.md`.

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

## Epic List

### Epic 1: Infraestrutura Supabase + Bot Básico
Sistema funcionando no Supabase com bot Telegram conectado e respondendo.
**FRs cobertos:** FR43, FR44, FR45, FR46

### Epic 2: Fluxo de Coleta de Links (Grupo Admin)
Operador recebe pedidos de links e pode responder com links validados.
**FRs cobertos:** FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24, FR25

### Epic 3: Postagem no Grupo Público
Membros do grupo recebem apostas formatadas com links funcionais.
**FRs cobertos:** FR10, FR11, FR12, FR13, FR14, FR15, FR38, FR39, FR40, FR41, FR42

### Epic 4: Integraçao de Odds (The Odds API)
Apostas sao enriquecidas com odds reais e rankeadas.
**FRs cobertos:** FR5, FR6, FR7, FR8, FR9

### Epic 5: Tracking de Resultados & Métricas
Sistema registra sucesso/fracasso de cada aposta automaticamente.
**FRs cobertos:** FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR37

### Epic 6: Refinamento da Geraçao de Apostas
IA gera apenas safe_bets filtradas corretamente.
**FRs cobertos:** FR1, FR2, FR3, FR4

### Epic 7: Bug Fixes Críticos
Corrigir bugs identificados na operaçao do MVP.
**Bugs cobertos:** BUG-001, BUG-002

### Epic 8: Admin Tools - Gestao de Apostas
Ferramentas para o operador gerenciar apostas no grupo admin.
**FRs cobertos:** FR-A1 a FR-A17

### Epic 9: Monitoramento e Alertas
Sistema de alertas proativos para o operador.
**FRs cobertos:** FR-M1 a FR-M4

### Epic 10: Melhorias de Produto
Melhorias de UX e expansao de conteúdo.
**FRs cobertos:** FR-P1 a FR-P4, FEAT-007

### Epic 11: Infraestrutura e DevOps
Melhorias técnicas e de deploy.
**Itens cobertos:** TECH-001, TECH-002, TECH-003

### Epic 12: Correçoes e Ferramentas Admin v2
Corrigir bugs identificados e adicionar ferramentas de visibilidade para operaçao eficiente.

### Epic 13: Gestao de Elegibilidade de Apostas
Operadores podem gerenciar manualmente quais apostas entram na fila de postagem.
**FRs cobertos:** FR7 (atualizaçao), FR47, FR48, FR49, FR50, FR51

### Epic 14: UX Admin e Visibilidade
Melhorar experiencia do admin nao-técnico com informaçoes claras, warns após cada job, e ordenaçao consistente.
**FRs cobertos:** BUG-007, FR-W1-7, FR-O1-5, FR-A1-7

### Epic 16: Gestao de Membros e Pagamentos Cakto
Permitir que o sistema monetize através de assinaturas, gerenciando membros do grupo público com trial de 7 dias, processando pagamentos via Cakto, e automatizando remoçao de inadimplentes.
**FRs cobertos:** FR-MB1-27, NFR21-24, ADR-001-004
**Status:** COMPLETO (10/10 stories)

## Ordem de Implementaçao

1. Epic 1 (Infra) -> 2. Epic 6 (Geraçao) -> 3. Epic 4 (Odds) -> 4. Epic 2 (Links) -> 5. Epic 3 (Postagem) -> 6. Epic 5 (Tracking)

---

## Epic 1: Infraestrutura Supabase + Bot Básico

Sistema funcionando no Supabase com bot Telegram conectado e respondendo.

### Story 1.1: Configurar Projeto Supabase

As a desenvolvedor,
I want criar e configurar um projeto Supabase,
So that o sistema tenha um banco de dados gerenciado na nuvem.

**Acceptance Criteria:**

**Given** acesso ao dashboard Supabase
**When** criar novo projeto "bets-estatistica"
**Then** projeto é criado com URL e service key
**And** credenciais sao salvas em `.env.example` (sem valores reais)

### Story 1.2: Migrar Schema para Supabase

As a desenvolvedor,
I want migrar o schema existente para Supabase,
So that todas as tabelas de dados esportivos e agente estejam disponíveis.

**Acceptance Criteria:**

**Given** schema local em `sql/league_schema.sql` e `sql/agent_schema.sql`
**When** executar migrations no Supabase
**Then** tabelas `league_seasons`, `league_matches`, `suggested_bets`, etc. sao criadas
**And** dados podem ser inseridos via Supabase client

### Story 1.3: Adicionar Campos de Status em suggested_bets

As a sistema,
I want ter campos de status e tracking na tabela suggested_bets,
So that possa gerenciar o ciclo de vida de cada aposta.

**Acceptance Criteria:**

**Given** tabela `suggested_bets` existente
**When** executar migration de alteraçao
**Then** novos campos sao adicionados:
  - `bet_status` (TEXT, default 'generated')
  - `deep_link` (TEXT, nullable)
  - `telegram_posted_at` (TIMESTAMPTZ, nullable)
  - `telegram_message_id` (BIGINT, nullable)
  - `odds_at_post` (NUMERIC, nullable)
  - `result_updated_at` (TIMESTAMPTZ, nullable)
**And** constraint `bet_status IN ('generated', 'pending_link', 'ready', 'posted', 'success', 'failure', 'cancelled')` é criada

### Story 1.4: Criar lib/supabase.js

As a desenvolvedor,
I want ter um cliente Supabase centralizado,
So that todo acesso ao banco passe por um único ponto.

**Acceptance Criteria:**

**Given** dependencia `@supabase/supabase-js` instalada
**When** importar `lib/supabase.js`
**Then** cliente Supabase é exportado configurado com env vars
**And** funçoes helper para queries sao disponibilizadas
**And** pattern `{ success, data/error }` é seguido

### Story 1.5: Criar lib/logger.js

As a desenvolvedor,
I want ter logging centralizado,
So that todos os logs sigam o mesmo padrao.

**Acceptance Criteria:**

**Given** necessidade de logs estruturados
**When** usar `logger.info()`, `logger.warn()`, `logger.error()`
**Then** logs sao formatados com timestamp, level e context
**And** logs nao expoem credenciais

### Story 1.6: Criar Bot Telegram Básico

As a operador,
I want ter um bot Telegram respondendo,
So that possa verificar que o sistema está online.

**Acceptance Criteria:**

**Given** token do bot configurado em `TELEGRAM_BOT_TOKEN`
**When** enviar `/status` para o bot
**Then** bot responde com "Online"
**And** bot está configurado para receber mensagens de grupos

### Story 1.7: Configurar Deploy no Render

As a desenvolvedor,
I want ter o bot deployado no Render,
So that rode em produçao com cron jobs.

**Acceptance Criteria:**

**Given** `render.yaml` configurado
**When** fazer push para branch main
**Then** Render faz deploy do bot
**And** variáveis de ambiente sao configuradas
**And** bot responde ao `/status`

---

## Epic 6: Refinamento da Geraçao de Apostas

IA gera apenas safe_bets para jogos próximos.

### Story 6.1: Gerar Apenas Safe Bets

As a sistema,
I want gerar apenas apostas do tipo safe_bets,
So that value_bets nao sejam nem criadas.

**Acceptance Criteria:**

**Given** análise de jogo pelo agente IA
**When** gerar apostas recomendadas
**Then** apenas apostas safe_bets sao geradas
**And** schema/prompt do agente nao inclui value_bets
**And** `bet_category` é sempre 'SAFE'

### Story 6.2: Salvar Apostas com Status Inicial

As a sistema,
I want salvar apostas com `bet_status = 'generated'`,
So that o ciclo de vida da aposta comece corretamente.

**Acceptance Criteria:**

**Given** aposta safe_bet gerada
**When** salvar em `suggested_bets`
**Then** `bet_status` é 'generated'
**And** `deep_link` é NULL
**And** `telegram_posted_at` é NULL

### Story 6.3: Filtrar Jogos Próximos (Menos de 2 Dias)

As a sistema,
I want selecionar apostas apenas para jogos com menos de 2 dias de antecedencia,
So that as apostas sejam para jogos iminentes.

**Acceptance Criteria:**

**Given** lista de apostas geradas
**When** selecionar para postagem
**Then** apenas jogos com `kickoff_time <= NOW() + 2 days` sao considerados
**And** jogos mais distantes sao ignorados para postagem

### Story 6.4: Migrar agent/db.js para Supabase

As a desenvolvedor,
I want que o agent use Supabase ao invés de PostgreSQL local,
So that todo o sistema use a mesma fonte de dados.

**Acceptance Criteria:**

**Given** `lib/supabase.js` disponível
**When** agent executa queries
**Then** queries sao feitas via Supabase client
**And** comportamento existente é mantido

---

## Epic 4: Integraçao de Odds (The Odds API)

Apostas sao enriquecidas com odds reais e rankeadas.

### Story 4.1: Criar bot/services/oddsService.js

As a desenvolvedor,
I want ter um serviço para consultar odds,
So that possa integrar com The Odds API.

**Acceptance Criteria:**

**Given** `THE_ODDS_API_KEY` configurada
**When** chamar `oddsService.getOdds(match)`
**Then** retorna odds para o jogo especificado
**And** segue pattern `{ success, data/error }`
**And** implementa retry 3x com backoff

### Story 4.2: Mapear Mercados para The Odds API

As a sistema,
I want mapear tipos de aposta internos para mercados da API,
So that possa buscar odds corretas.

**Acceptance Criteria:**

**Given** aposta com `bet_market` interno
**When** buscar odds na API
**Then** mercado é mapeado corretamente:
  - `over_gols` / `under_gols` -> `totals`
  - `btts` -> `btts`
  - `escanteios` -> `totals_corners`
  - `cartoes` -> `totals_bookings`
**And** bookmakers target sao `bet365` e `betano`

### Story 4.3: Associar Odds às Apostas

As a sistema,
I want enriquecer apostas com odds em tempo real,
So that cada aposta tenha odd atualizada.

**Acceptance Criteria:**

**Given** apostas com `bet_status = 'generated'`
**When** executar job de enriquecimento
**Then** campo `odds` é atualizado com valor da API
**And** se API falhar, aposta mantém odd anterior ou NULL

### Story 4.4: Marcar Apostas com Odds Insuficiente

As a sistema,
I want marcar apostas com odds < 1.60 como inelegíveis,
So that nao sejam selecionadas para postagem mas permaneçam no BD.

**Acceptance Criteria:**

**Given** apostas enriquecidas com odds
**When** odds < 1.60
**Then** aposta permanece no BD
**And** é marcada com flag (ex: `eligible = false` ou status específico)
**And** nao é considerada para seleçao de postagem
**And** log indica quantas foram marcadas como inelegíveis

### Story 4.5: Manter 3 Apostas Ativas com Reposiçao

As a sistema,
I want sempre manter pelo menos 3 apostas ativas,
So that o grupo tenha conteúdo consistente.

**Acceptance Criteria:**

**Given** apostas selecionadas e postadas no grupo
**When** uma aposta é concluída (success/failure)
**Then** sistema seleciona nova aposta da lista para repor
**And** nova aposta é a próxima com maior odd elegível
**And** sempre mantém pelo menos 3 apostas com `bet_status = 'posted'`

**Given** aposta foi postada
**When** ainda nao foi concluída
**Then** aposta permanece ativa até resultado final
**And** nao é substituída prematuramente

### Story 4.6: Cachear Odds (5 minutos)

As a sistema,
I want cachear consultas de odds,
So that reduza chamadas à API e custos.

**Acceptance Criteria:**

**Given** consulta de odds para um jogo
**When** mesma consulta é feita em < 5 minutos
**Then** retorna valor do cache
**And** após 5 minutos, busca novamente da API

---

## Epic 2: Fluxo de Coleta de Links (Grupo Admin)

Operador recebe pedidos de links e pode responder com links validados.

### Story 2.1: Criar Job de Pedido de Links

As a bot,
I want postar pedidos de links no grupo admin,
So that operador saiba quais links preciso.

**Acceptance Criteria:**

**Given** horários 8h, 13h, 20h (Sao Paulo)
**When** cron job executa
**Then** bot posta no grupo admin pedidos para cada aposta que precisa de link
**And** mensagem inclui: jogo, mercado, pick, odd esperada
**And** `bet_status` muda para 'pending_link'

### Story 2.2: Formatar Pedido de Link

As a operador,
I want receber pedido claro e formatado,
So that saiba exatamente qual aposta criar na casa.

**Acceptance Criteria:**

**Given** aposta selecionada para postagem
**When** bot posta pedido
**Then** mensagem segue formato estruturado com jogo, mercado, odd esperada
**And** indica para responder com link da Bet365 ou Betano

### Story 2.3: Detectar Resposta com Link

As a bot,
I want detectar quando operador responde com um link,
So that possa processar e salvar.

**Acceptance Criteria:**

**Given** operador responde no grupo admin
**When** mensagem contém URL (http/https)
**Then** bot detecta como possível resposta de link
**And** tenta associar à aposta pendente mais recente

### Story 2.4: Validar Link de Casa de Apostas

As a sistema,
I want validar se link é de casa conhecida,
So that nao aceite links inválidos.

**Acceptance Criteria:**

**Given** link recebido do operador
**When** validar
**Then** aceita links que contém: `bet365.com`, `betano.com`, `betano.com.br`
**And** rejeita links de outros domínios
**And** se rejeitado, bot responde pedindo link correto

### Story 2.5: Salvar Link no BD

As a sistema,
I want salvar link validado na aposta,
So that fique disponível para postagem.

**Acceptance Criteria:**

**Given** link validado
**When** salvar
**Then** campo `deep_link` é atualizado
**And** `bet_status` muda para 'ready'
**And** bot confirma com checkmark

### Story 2.6: Enviar Lembretes

As a bot,
I want enviar lembretes se operador nao responder,
So that links sejam coletados a tempo.

**Acceptance Criteria:**

**Given** pedido de link enviado há X minutos
**When** operador nao respondeu
**Then** bot envia lembrete a cada 30 minutos
**And** após 3 lembretes, continua pedindo 1x por hora
**And** lembrete indica urgencia

### Story 2.7: Confirmar Recebimento

As a operador,
I want receber confirmaçao quando link for aceito,
So that saiba que foi processado.

**Acceptance Criteria:**

**Given** link validado e salvo
**When** processamento completo
**Then** bot responde com checkmark e detalhes da aposta
**And** operador sabe que pode seguir para próximo

---

## Epic 3: Postagem no Grupo Público

Membros do grupo recebem apostas formatadas com links funcionais.

### Story 3.1: Criar Job de Postagem Pública

As a bot,
I want postar automaticamente nos horários definidos,
So that membros recebam apostas pontualmente.

**Acceptance Criteria:**

**Given** horários 10h, 15h, 22h (Sao Paulo)
**When** cron job executa
**Then** bot posta no grupo público as apostas prontas
**And** apenas apostas com `bet_status = 'ready'` sao postadas
**And** `bet_status` muda para 'posted'
**And** `telegram_posted_at` é registrado

### Story 3.2: Formatar Mensagem de Aposta

As a membro do grupo,
I want receber mensagem clara e atrativa,
So that entenda a aposta facilmente.

**Acceptance Criteria:**

**Given** aposta pronta para postagem
**When** formatar mensagem
**Then** inclui: emoji, jogo, mercado, pick, odds, justificativa, link
**And** link é clicável
**And** mensagem usa Markdown para formataçao

### Story 3.3: Incluir Deep Link na Mensagem

As a membro do grupo,
I want clicar no link e ir direto para a aposta,
So that possa apostar rapidamente.

**Acceptance Criteria:**

**Given** aposta com `deep_link` preenchido
**When** postar mensagem
**Then** link está incluído como botao ou hyperlink
**And** ao clicar, usuário é direcionado para a casa de apostas
**And** `odds_at_post` é registrado com valor no momento

### Story 3.4: Validar Requisitos Antes de Postar

As a sistema,
I want verificar requisitos antes de postar,
So that nao poste mensagens incompletas.

**Acceptance Criteria:**

**Given** horário de postagem
**When** selecionar apostas
**Then** só posta se:
  - Tem link válido (`deep_link` nao null)
  - Jogo está dentro de 2 dias
  - Odd >= 1.60
**And** apostas que nao atendem sao puladas
**And** log indica motivo

### Story 3.5: Fallback de Odds via Grupo Admin

As a sistema,
I want ter fallback manual quando API de odds falhar,
So that ainda possa postar com odds confirmadas.

**Acceptance Criteria:**

**Given** API de odds indisponível após 3 tentativas
**When** precisar postar
**Then** bot posta no grupo admin pedindo confirmaçao de odds
**And** operador responde com odd numérica
**And** bot valida (número entre 1.0 e 10.0)
**And** se confirmado, usa essa odd para postar
**And** se nao responder até horário de postagem, pula a aposta

### Story 3.6: Variar Texto das Mensagens

As a membro do grupo,
I want mensagens com textos variados,
So that nao pareçam robóticas.

**Acceptance Criteria:**

**Given** template de mensagem
**When** postar
**Then** usa variaçoes de frases de abertura
**And** emojis diferentes
**And** chamadas para açao variadas
**And** mantém informaçoes essenciais consistentes

### Story 3.7: Exibir Taxa de Acerto

As a membro do grupo,
I want ver a taxa de acerto do bot,
So that tenha confiança nas sugestoes.

**Acceptance Criteria:**

**Given** histórico de apostas concluídas
**When** postar mensagem
**Then** inclui taxa de acerto (ex: "78% de acerto nos últimos 30 dias")
**And** se nao houver dados suficientes, omite ou mostra "Começando agora"

### Story 3.8: Registrar Message ID do Telegram

As a sistema,
I want salvar o ID da mensagem enviada,
So that possa editar ou referenciar depois.

**Acceptance Criteria:**

**Given** mensagem enviada com sucesso
**When** Telegram retorna message_id
**Then** campo `telegram_message_id` é atualizado
**And** pode ser usado para ediçao futura

---

## Epic 5: Tracking de Resultados & Métricas

Sistema registra sucesso/fracasso de cada aposta automaticamente.

### Story 5.1: Criar Job de Tracking de Resultados

As a sistema,
I want verificar resultados apenas após tempo suficiente,
So that nao desperdice recursos com jogos em andamento.

**Acceptance Criteria:**

**Given** cron job executando a cada 5 minutos
**When** verificar apostas com `bet_status = 'posted'`
**Then** só verifica jogos onde `kickoff_time + 2 horas < NOW()`
**And** jogos que ainda nao passaram 2h do início sao ignorados
**And** se jogo terminou, processa resultado

### Story 5.2: Detectar Fim de Jogo

As a sistema,
I want detectar fim de jogo após período mínimo,
So that busque resultados apenas quando faz sentido.

**Acceptance Criteria:**

**Given** aposta com jogo iniciado há mais de 2 horas
**When** verificar status
**Then** busca status do jogo na API/BD
**And** se status = 'complete', processa
**And** se ainda 'in_progress' (prorrogaçao/atraso), tenta novamente em 5 min
**And** timeout máximo de 4 horas após início

### Story 5.3: Comparar Resultado com Aposta

As a sistema,
I want comparar resultado real com aposta sugerida,
So that determine sucesso ou fracasso.

**Acceptance Criteria:**

**Given** jogo finalizado com placar
**When** avaliar aposta
**Then** compara resultado com `bet_pick`:
  - Over 2.5: total gols > 2.5 -> success
  - Under 2.5: total gols < 2.5 -> success
  - BTTS: ambos marcaram -> success
**And** atualiza `bet_status` para 'success' ou 'failure'

### Story 5.4: Atualizar Status Automaticamente

As a sistema,
I want atualizar status da aposta no BD,
So that histórico fique completo.

**Acceptance Criteria:**

**Given** resultado avaliado
**When** atualizar BD
**Then** `bet_status` muda para 'success' ou 'failure'
**And** `result_updated_at` é registrado
**And** log indica resultado

### Story 5.5: Calcular Taxa de Acerto (30 dias)

As a sistema,
I want calcular taxa de acerto recente,
So that possa exibir nas mensagens.

**Acceptance Criteria:**

**Given** apostas concluídas nos últimos 30 dias
**When** calcular taxa
**Then** taxa = (success / total) * 100
**And** arredonda para inteiro
**And** retorna formato "X% de acerto"

### Story 5.6: Calcular Taxa de Acerto (All-time)

As a sistema,
I want calcular taxa histórica total,
So that tenha visao completa.

**Acceptance Criteria:**

**Given** todas as apostas concluídas
**When** calcular taxa
**Then** taxa = (total success / total concluídas) * 100
**And** disponível para consulta

### Story 5.7: Alertar Operador em Falhas Críticas

As a operador,
I want ser alertado de falhas no tracking,
So that possa intervir se necessário.

**Acceptance Criteria:**

**Given** erro no job de tracking
**When** falha 3x consecutivas
**Then** alerta no grupo admin com detalhes técnicos
**And** inclui resumo simples do problema
**And** indica se precisa intervençao manual

### Story 5.8: Comando /status para Operador

As a operador,
I want consultar status do sistema,
So that verifique se está tudo funcionando.

**Acceptance Criteria:**

**Given** operador envia `/status` no grupo admin
**When** processar comando
**Then** bot responde com:
  - Apostas ativas: X
  - Ultima postagem: HH:MM
  - Taxa de acerto: X%
  - Próxima postagem: HH:MM

### Story 5.9: Comando /retry para Reprocessar

As a operador,
I want forçar retry de postagem falhada,
So that possa recuperar de erros.

**Acceptance Criteria:**

**Given** operador envia `/retry` no grupo admin
**When** processar comando
**Then** lista apostas pendentes ou com erro
**And** permite selecionar para reprocessar
**And** executa postagem manualmente

---

# ADDENDUM v2 - Novos Requisitos (2026-01-11)

## Requirements Inventory - Addendum

### Novos Functional Requirements (Admin Tools)

**Visualizaçao de Apostas**
- FR-A1: Bot pode listar apostas com jogos de data futura quando solicitado
- FR-A2: Cada aposta deve mostrar: jogo (times), mercado, odd, data/hora
- FR-A3: Lista deve ser ordenada por data do jogo (mais próximo primeiro)
- FR-A4: Cada item deve ter identificador único para referencia

**Correçao de Odds e Links**
- FR-A5: Operador pode responder com número + nova odd para atualizar
- FR-A6: Operador pode responder com número + link para adicionar link
- FR-A7: Bot confirma a alteraçao com checkmark
- FR-A8: Alteraçoes sao salvas no banco de dados
- FR-A9: Histórico de alteraçoes é mantido (quem alterou, quando)

**Apostas Manuais**
- FR-A10: Operador pode adicionar aposta via comando no grupo admin
- FR-A11: Bot solicita informaçoes: jogo, mercado, odd, link
- FR-A12: Aposta manual é marcada como `source: manual` no BD
- FR-A13: Aposta manual entra na fila de postagem normalmente

**Comandos de Atualizaçao**
- FR-A14: Comando `/atualizar odds` força refresh de odds da API
- FR-A15: Comando `/atualizar apostas` reprocessa ranking de apostas
- FR-A16: Comando `/forcar postagem` envia postagem imediatamente
- FR-A17: Bot confirma execuçao e reporta resultado

**Monitoramento**
- FR-M1: Bot monitora health check do sistema
- FR-M2: Se falha detectada, envia alerta no grupo admin
- FR-M3: Alerta menciona o operador (@username)
- FR-M4: Alerta inclui: tipo de falha, timestamp, açao sugerida

**Melhorias de Produto**
- FR-P1: Cada postagem tem texto gerado por LLM
- FR-P2: Copy deve ser conciso (máx 2-3 linhas por aposta)
- FR-P3: Manter consistencia de tom (profissional mas acessível)
- FR-P4: Cache de copies para evitar custo excessivo

### Bug Fixes Identificados

- BUG-001: Postagens nao repostam apostas ativas nos horários programados
- BUG-002: Odds incorretas devido a matching errado de mercados

### FR Coverage Map - Addendum

| FR | Epic | Descriçao |
|----|------|-----------|
| FR-A1-4 | Epic 8 | Visualizaçao de apostas |
| FR-A5-9 | Epic 8 | Correçao de odds/links |
| FR-A10-13 | Epic 8 | Apostas manuais |
| FR-A14-17 | Epic 8 | Comandos de atualizaçao |
| FR-M1-4 | Epic 9 | Alertas e monitoramento |
| FR-P1-4 | Epic 10 | Copy dinamico |
| BUG-001-002 | Epic 7 | Bug fixes críticos |

## Epic List - Addendum

### Epic 7: Bug Fixes Críticos
Corrigir bugs identificados na operaçao do MVP.
**Bugs cobertos:** BUG-001, BUG-002

### Epic 8: Admin Tools - Gestao de Apostas
Ferramentas para o operador gerenciar apostas no grupo admin.
**FRs cobertos:** FR-A1 a FR-A17

### Epic 9: Monitoramento e Alertas
Sistema de alertas proativos para o operador.
**FRs cobertos:** FR-M1 a FR-M4

### Epic 10: Melhorias de Produto
Melhorias de UX e expansao de conteúdo.
**FRs cobertos:** FR-P1 a FR-P4, FEAT-007

### Epic 11: Infraestrutura e DevOps
Melhorias técnicas e de deploy.
**Itens cobertos:** TECH-001, TECH-002, TECH-003

## Ordem de Implementaçao - Addendum

1. Epic 7 (Bug Fixes) -> 2. Epic 8 (Admin Tools) -> 3. Epic 9 (Alertas) -> 4. Epic 10 (Melhorias) -> 5. Epic 11 (DevOps)

---

## Epic 7: Bug Fixes Críticos

Corrigir bugs identificados na operaçao do MVP que impedem o funcionamento autonomo do sistema.

### Story 7.1: Implementar Repostagem de Apostas Ativas

As a bot,
I want repostar apostas ativas nos horários programados,
So that membros do grupo recebam as apostas 3x ao dia até o jogo acontecer.

**Acceptance Criteria:**

**Given** apostas com `bet_status = 'posted'` e jogo ainda nao iniciado
**When** horário de postagem (10h, 15h, 22h) chega
**Then** bot reposta essas apostas no grupo público
**And** nao busca novas apostas se já tem 3 ativas
**And** só substitui uma aposta quando o jogo dela terminar

**Technical Notes:**
- Modificar `bot/jobs/postBets.js`
- Remover lógica que sai quando `availableSlots === 0`
- Adicionar busca de apostas `posted` com jogo futuro
- Criar funçao `repostActiveBets()`

### Story 7.2: Corrigir Matching de Odds

As a sistema,
I want buscar odds corretamente da API,
So that as odds exibidas correspondam às odds reais.

**Acceptance Criteria:**

**Given** aposta com mercado específico (ex: Over 2.5)
**When** buscar odds na The Odds API
**Then** retorna a odd correta para a linha especificada
**And** nao confunde linhas (Over 0.5 vs Over 2.5)
**And** nao confunde tipos (Over vs Under)
**And** margem de erro < +-0.05

**Technical Notes:**
- Revisar `bot/services/oddsService.js` funçao `findBestOdds()`
- Verificar matching de `outcome.point` com linha da aposta
- Adicionar logs de debug para comparar valores
- Criar testes unitários para casos conhecidos

### Story 7.3: Adicionar Logs de Debug no Matching de Odds

As a desenvolvedor,
I want ter logs detalhados do matching de odds,
So that possa diagnosticar problemas futuros.

**Acceptance Criteria:**

**Given** processo de busca de odds
**When** executar matching
**Then** loga: mercado buscado, linha esperada, outcomes encontrados
**And** loga qual outcome foi selecionado e por que
**And** loga quando nao encontra match exato
**And** logs em nível DEBUG (nao poluem produçao)

---

## Epic 8: Admin Tools - Gestao de Apostas

Ferramentas para o operador gerenciar apostas no grupo admin do Telegram.

### Story 8.1: Comando /apostas - Listar Apostas Disponíveis

As a operador,
I want listar todas as apostas disponíveis,
So that possa ver o que está na fila.

**Acceptance Criteria:**

**Given** operador envia `/apostas` no grupo admin
**When** bot processa comando
**Then** lista apostas com jogos futuros
**And** mostra: ID, times, data/hora, mercado, odd
**And** ordena por data do jogo (mais próximo primeiro)
**And** indica quais já tem link

### Story 8.2: Comando para Ajustar Odd

As a operador,
I want corrigir a odd de uma aposta,
So that o valor exibido seja o correto.

**Acceptance Criteria:**

**Given** operador envia `/odd 45 1.90` no grupo admin
**When** bot processa comando
**Then** atualiza odds da aposta ID 45 para 1.90
**And** responde com checkmark confirmando alteraçao
**And** mostra valor anterior e novo

### Story 8.3: Comando para Adicionar Link

As a operador,
I want adicionar link a uma aposta,
So that fique pronta para postagem.

**Acceptance Criteria:**

**Given** operador envia `/link 45 https://betano.com/...`
**When** bot processa comando
**Then** valida se link é de casa conhecida
**And** salva link na aposta
**And** muda status para 'ready'
**And** confirma com checkmark

### Story 8.4: Comando /adicionar - Aposta Manual

As a operador,
I want adicionar uma aposta manualmente,
So that possa incluir apostas que o sistema nao gerou.

**Acceptance Criteria:**

**Given** operador envia `/adicionar` no grupo admin
**When** bot inicia fluxo conversacional
**Then** pergunta: jogo, mercado, odd, link
**And** cria aposta com `source: 'manual'`
**And** aposta entra na fila normalmente
**And** confirma criaçao com detalhes

### Story 8.5: Comando /atualizar - Forçar Refresh

As a operador,
I want forçar atualizaçao de odds,
So that nao precise esperar o cron.

**Acceptance Criteria:**

**Given** operador envia `/atualizar odds`
**When** bot processa comando
**Then** executa job de enriquecimento de odds
**And** reporta quantas odds foram atualizadas
**And** reporta erros se houver

### Story 8.6: Comando /postar - Forçar Postagem

As a operador,
I want forçar uma postagem imediata,
So that possa testar ou recuperar de falhas.

**Acceptance Criteria:**

**Given** operador envia `/postar`
**When** bot processa comando
**Then** executa job de postagem imediatamente
**And** reporta quantas apostas foram postadas
**And** reporta se nao havia apostas prontas

---

## Epic 9: Monitoramento e Alertas

Sistema de alertas proativos para o operador.

### Story 9.1: Monitorar Health Check

As a sistema,
I want verificar health do sistema periodicamente,
So that detecte problemas proativamente.

**Acceptance Criteria:**

**Given** sistema rodando
**When** a cada 5 minutos
**Then** verifica: conexao BD, última postagem, jobs rodando
**And** se falha detectada, dispara alerta
**And** registra status em log

### Story 9.2: Alertar Operador em Falha de Postagem

As a operador,
I want ser alertado se postagem nao acontecer,
So that possa intervir rapidamente.

**Acceptance Criteria:**

**Given** horário de postagem passou (ex: 10h)
**When** verificaçao às 10:05 detecta que nao postou
**Then** envia alerta no grupo admin
**And** menciona @operador
**And** inclui: tipo de falha, timestamp, açao sugerida

### Story 9.3: Alertar em Erro de API

As a operador,
I want ser alertado se APIs externas falharem,
So that saiba que odds podem estar desatualizadas.

**Acceptance Criteria:**

**Given** chamada a The Odds API falha 3x consecutivas
**When** todas as tentativas falharem
**Then** envia alerta no grupo admin
**And** indica qual API falhou
**And** sugere verificar manualmente

---

## Epic 10: Melhorias de Produto

Melhorias de UX e expansao de conteúdo.

### Story 10.1: Copy Dinamico com LLM

As a membro do grupo,
I want receber mensagens com copy engajador,
So that as postagens sejam mais interessantes.

**Acceptance Criteria:**

**Given** aposta pronta para postagem
**When** formatar mensagem
**Then** usa LLM para gerar copy único
**And** copy é conciso (2-3 linhas)
**And** mantém tom profissional mas acessível
**And** inclui insight sobre o jogo/aposta

### Story 10.2: Cache de Copies LLM

As a sistema,
I want cachear copies gerados,
So that nao gaste tokens demais.

**Acceptance Criteria:**

**Given** copy gerado para uma aposta
**When** mesma aposta for postada novamente
**Then** usa copy do cache
**And** cache expira após 24h
**And** novo copy é gerado na expiraçao

### Story 10.3: Adicionar Novas Ligas

As a operador,
I want expandir para mais ligas,
So that tenha mais apostas disponíveis.

**Acceptance Criteria:**

**Given** configuraçao de ligas
**When** adicionar nova liga
**Then** sistema busca jogos da liga
**And** gera apostas normalmente
**And** odds sao enriquecidas se disponíveis na API

---

## Epic 11: Infraestrutura e DevOps

Melhorias técnicas e de deploy.

### Story 11.1: Simplificar Estrutura de Pastas

As a desenvolvedor,
I want estrutura de pastas mais organizada,
So that seja mais fácil de navegar e manter.

**Acceptance Criteria:**

**Given** estrutura atual do projeto
**When** reorganizar
**Then** pastas seguem padrao claro
**And** imports sao atualizados
**And** documentaçao reflete nova estrutura

### Story 11.2: Configurar CI/CD com GitHub Actions

As a desenvolvedor,
I want pipeline de CI/CD,
So that deploys sejam automatizados e seguros.

**Acceptance Criteria:**

**Given** push para branch main
**When** GitHub Actions executa
**Then** roda testes unitários
**And** roda linting
**And** se passar, faz deploy no Render
**And** se falhar, bloqueia deploy

### Story 11.3: Criar Testes Unitários Críticos

As a desenvolvedor,
I want testes para funçoes críticas,
So that bugs nao passem despercebidos.

**Acceptance Criteria:**

**Given** funçoes críticas do sistema
**When** criar testes
**Then** cobre: matching de odds, formataçao de mensagens, cálculo de métricas
**And** testes rodam em < 30s
**And** coverage > 50% nas funçoes críticas

### Story 11.4: Validar Cálculo de Métricas

As a operador,
I want ter certeza que métricas estao corretas,
So that possa confiar nos dados.

**Acceptance Criteria:**

**Given** histórico de apostas
**When** calcular métricas
**Then** taxa de acerto é calculada corretamente
**And** contagem por status está correta
**And** validado contra cálculo manual

---

# ADDENDUM v3 - Novos Requisitos (2026-01-12)

## Requirements Inventory - Addendum v3

### Bug Fixes Identificados

- BUG-003: Comando /atualizar odds falha - coluna 'notes' nao existe na tabela
- BUG-004: Overview mostra "[object Object]" nos IDs postados
- BUG-005: Health check alertando excessivamente
- BUG-006: Limite de 2 dias de elegibilidade nao está sendo aplicado (regressao)

### Novos Functional Requirements (Admin Tools v2)

**Filtragem de Apostas**
- FR-F1: `/filtrar sem_odds` lista todas apostas sem odds
- FR-F2: `/filtrar sem_link` lista apostas sem link
- FR-F3: `/filtrar com_link` lista apostas com link
- FR-F4: `/filtrar com_odds` lista apostas com odds
- FR-F5: `/filtrar prontas` lista apostas com status 'ready'
- FR-F6: Cada item mostra: ID, jogo, mercado, status, odds, link
- FR-F7: Lista ordenada por data do jogo

**Preview de Postagem**
- FR-S1: `/simular` gera preview das próximas 3 apostas
- FR-S2: Preview mostra mensagem completa com copy LLM
- FR-S3: Preview mostra qual link seria incluído
- FR-S4: `/simular novo` regenera copy se necessário
- FR-S5: Preview nao altera estado das apostas
- FR-S6: `/simular ID` simula aposta específica

**Overview Aprimorado**
- FR-O1: Mostrar contagem por status
- FR-O2: Mostrar lista de IDs por categoria
- FR-O3: Mostrar próximo jogo
- FR-O4: Mostrar última postagem
- FR-O5: Mostrar taxa de acerto atual

### Correçoes Técnicas

- TECH-004: Adicionar coluna 'notes' na tabela suggested_bets
- TECH-005: Ajustar thresholds do health check

### FR Coverage Map - Addendum v3

| FR | Epic | Descriçao |
|----|------|-----------|
| BUG-003, TECH-004 | Epic 12 | Corrigir bug notes |
| BUG-004 | Epic 12 | Corrigir overview object |
| BUG-005, TECH-005 | Epic 12 | Ajustar health check |
| BUG-006 | Epic 12 | Restaurar filtro 2 dias |
| FR-F1-7 | Epic 12 | Comando /filtrar |
| FR-S1-6 | Epic 12 | Comando /simular |
| FR-O1-5 | Epic 12 | Overview aprimorado |

---

## Epic 12: Correçoes e Ferramentas Admin v2

Corrigir bugs identificados e adicionar ferramentas de visibilidade para operaçao eficiente.

### Story 12.1: Corrigir Bug Coluna Notes

As a operador,
I want que o comando /atualizar odds funcione,
So that possa atualizar odds das apostas sem erros.

**Acceptance Criteria:**

**Given** comando `/atualizar odds` executado
**When** sistema tenta salvar odds
**Then** operaçao completa sem erro
**And** coluna `notes` existe na tabela (se necessário)

**Technical Notes:**
- Criar migration: `ALTER TABLE suggested_bets ADD COLUMN IF NOT EXISTS notes TEXT;`
- Ou remover lógica de notes do código se nao necessária

### Story 12.2: Corrigir Overview Object Object

As a operador,
I want ver IDs numéricos no /overview,
So that saiba quais apostas estao postadas.

**Acceptance Criteria:**

**Given** comando `/overview` executado
**When** sistema exibe IDs postadas
**Then** mostra `#45, #47, #52` (IDs numéricos)
**And** nao mostra `#[object Object]`

**Technical Notes:**
- Corrigir em `bot/handlers/adminGroup.js` linha 277-279
- Mudar `id` para `item.id` no map

### Story 12.3: Ajustar Health Check

As a operador,
I want receber alertas apenas quando necessário,
So that nao seja bombardeado com falsos positivos.

**Acceptance Criteria:**

**Given** sistema rodando normalmente
**When** health check executa
**Then** nao envia alertas desnecessários
**And** thresholds sao adequados para operaçao real:
  - `PENDING_LINK_MAX_HOURS: 8` (antes 4)
  - `READY_NOT_POSTED_HOURS: 4` (antes 2)
  - `POST_SCHEDULE_GRACE_MIN: 15` (antes 10)

**Technical Notes:**
- Ajustar thresholds em `bot/jobs/healthCheck.js`
- Investigar quais alertas estao sendo disparados

### Story 12.4: Restaurar Filtro 2 Dias Elegibilidade

As a sistema,
I want considerar apenas jogos com menos de 2 dias,
So that apostas sejam para jogos iminentes.

**Acceptance Criteria:**

**Given** lista de apostas elegíveis
**When** selecionar para postagem
**Then** apenas jogos com `kickoff_time >= NOW() AND kickoff_time <= NOW() + 2 days` sao considerados
**And** jogos muito próximos (< 2h) ou muito distantes (> 2 dias) sao excluídos

**Technical Notes:**
- Verificar `betService.js` funçao `getEligibleBets()`
- Verificar job de enriquecimento de odds

### Story 12.5: Implementar Comando /filtrar

As a operador,
I want filtrar apostas por critérios específicos,
So that tenha visibilidade rápida do status.

**Acceptance Criteria:**

**Given** operador envia `/filtrar sem_odds`
**When** bot processa comando
**Then** lista apenas apostas sem odds definida
**And** mostra: ID, jogo, mercado, status

**Filtros disponíveis:**
- `/filtrar sem_odds` - apostas sem odds
- `/filtrar sem_link` - apostas sem link
- `/filtrar com_link` - apostas com link
- `/filtrar com_odds` - apostas com odds
- `/filtrar prontas` - apostas com status 'ready'

### Story 12.6: Implementar Comando /simular

As a operador,
I want ver preview da próxima postagem,
So that possa verificar e ajustar antes de publicar.

**Acceptance Criteria:**

**Given** operador envia `/simular`
**When** bot processa comando
**Then** gera preview das próximas 3 apostas
**And** mostra mensagem completa com copy LLM
**And** mostra link que seria incluído
**And** nao altera estado das apostas

**Given** operador envia `/simular novo`
**When** copy atual tem problema
**Then** regenera copy via LLM
**And** mostra novo preview

### Story 12.7: Aprimorar Comando /overview

As a operador,
I want overview mais completo,
So that tenha visao geral do sistema.

**Acceptance Criteria:**

**Given** operador envia `/overview`
**When** bot processa comando
**Then** mostra:
  - Contagem por status (geradas, aguardando, prontas, postadas)
  - IDs das apostas postadas ativas
  - Próximo jogo (data/hora)
  - Ultima postagem (quando)
  - Pendencias (sem odds, sem link)
  - Taxa de acerto 30 dias

---

# ADDENDUM v4 - Gestao de Elegibilidade (2026-01-12)

## Requirements Inventory - Addendum v4

### Novos Functional Requirements (Gestao de Elegibilidade)

**Modelo de Elegibilidade**
- FR7 (atualizado): Sistema pode filtrar apostas com odds < 1.60, exceto quando `promovida_manual = true`
- FR47: Bot pode processar `/promover <id>` para marcar aposta como elegível ignorando odds mínimas
- FR48: Bot pode processar `/remover <id>` para marcar aposta como removida da fila
- FR49: Bot pode processar `/status` para listar apostas elegíveis e próximo horário
- FR50: Sistema pode incluir apostas promovidas manualmente na seleçao
- FR51: Bot pode confirmar comandos com feedback visual

### Modelo de Dados - Novos Campos

**Campos a adicionar em `suggested_bets`:**
- `elegibilidade` (ENUM: 'elegivel', 'removida', 'expirada')
- `promovida_manual` (BOOLEAN, default false)
- `historico_postagens` (JSONB, array de timestamps)

### FR Coverage Map - Addendum v4

| FR | Epic | Descriçao |
|----|------|-----------|
| FR7 (atualizado) | Epic 13 | Filtro de odds considera promoçao manual |
| FR47 | Epic 13 | Comando /promover |
| FR48 | Epic 13 | Comando /remover |
| FR49 | Epic 13 | Comando /status elegibilidade |
| FR50 | Epic 13 | Lógica de seleçao com promoçao |
| FR51 | Epic 13 | Feedback visual comandos |

---

## Epic 13: Gestao de Elegibilidade de Apostas

Operadores podem gerenciar manualmente quais apostas entram na fila de postagem, sobrepondo as regras automáticas de seleçao.

**Valor para o Usuário:**
- Marcelo (operador) pode forçar a postagem de uma aposta específica mesmo sem odds mínimas
- Marcelo pode remover uma aposta da fila se nao quiser mais postá-la
- Marcelo pode visualizar o status atual da fila antes de cada job

**FRs cobertos:** FR7 (atualizaçao), FR47, FR48, FR49, FR50, FR51

### Story 13.1: Atualizar Modelo de Dados com Campos de Elegibilidade

As a desenvolvedor,
I want ter campos de elegibilidade na tabela suggested_bets,
So that possa gerenciar o ciclo de vida de postagem das apostas.

**Acceptance Criteria:**

**Given** tabela `suggested_bets` existente
**When** executar migration de alteraçao
**Then** novos campos sao adicionados:
  - `elegibilidade` (TEXT, default 'elegivel', CHECK IN ('elegivel', 'removida', 'expirada'))
  - `promovida_manual` (BOOLEAN, default false)
  - `historico_postagens` (JSONB, default '[]')
**And** índice em `elegibilidade` para performance
**And** apostas existentes tem `elegibilidade = 'elegivel'`

**Technical Notes:**
```sql
ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS elegibilidade TEXT DEFAULT 'elegivel'
CHECK (elegibilidade IN ('elegivel', 'removida', 'expirada'));

ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS promovida_manual BOOLEAN DEFAULT false;

ALTER TABLE suggested_bets
ADD COLUMN IF NOT EXISTS historico_postagens JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_suggested_bets_elegibilidade
ON suggested_bets(elegibilidade);
```

### Story 13.2: Implementar Comando /promover

As a operador,
I want promover uma aposta para a fila de postagem,
So that ela seja postada mesmo sem atender aos critérios automáticos.

**Acceptance Criteria:**

**Given** operador envia `/promover 45` no grupo admin
**When** bot processa comando
**Then** aposta ID 45 é marcada com:
  - `elegibilidade = 'elegivel'`
  - `promovida_manual = true`
**And** bot responde com checkmark e detalhes da aposta
**And** aposta entra na próxima seleçao de postagem

**Given** aposta já está promovida
**When** operador tenta promover novamente
**Then** bot informa que já está promovida

**Given** ID inválido ou inexistente
**When** operador envia `/promover 999`
**Then** bot responde com X "Aposta nao encontrada"

**Technical Notes:**
- Criar handler em `bot/handlers/adminGroup.js`
- Funçao `promoverAposta(id)` em `betService.js`

### Story 13.3: Implementar Comando /remover

As a operador,
I want remover uma aposta da fila de postagem,
So that ela nao seja mais postada nos próximos jobs.

**Acceptance Criteria:**

**Given** operador envia `/remover 45` no grupo admin
**When** bot processa comando
**Then** aposta ID 45 é marcada com:
  - `elegibilidade = 'removida'`
**And** bot responde com checkmark e detalhes da aposta
**And** aposta nao aparece mais nas seleçoes de postagem

**Given** operador quer reverter a remoçao
**When** operador envia `/promover 45`
**Then** aposta volta a ser elegível

**Given** ID inválido ou inexistente
**When** operador envia `/remover 999`
**Then** bot responde com X "Aposta nao encontrada"

**Technical Notes:**
- Criar handler em `bot/handlers/adminGroup.js`
- Funçao `removerAposta(id)` em `betService.js`

### Story 13.4: Implementar Comando /status (Elegibilidade)

As a operador,
I want ver o status da fila de apostas elegíveis,
So that saiba o que será postado no próximo job.

**Acceptance Criteria:**

**Given** operador envia `/fila` no grupo admin
**When** bot processa comando
**Then** mostra:
  - Apostas elegíveis para próxima postagem (top 3)
  - Apostas promovidas manualmente
  - Próximo horário de postagem
  - Contagem por elegibilidade

**Technical Notes:**
- Usar lógica de seleçao existente para preview
- Ordenar por odds DESC, promovidas primeiro

### Story 13.5: Atualizar Lógica de Seleçao por Job

As a sistema,
I want considerar `promovida_manual` e `elegibilidade` na seleçao,
So that as regras de override funcionem corretamente.

**Acceptance Criteria:**

**Given** job de postagem executa (10h, 15h, 22h)
**When** selecionar apostas para postar
**Then** query considera:
  - `elegibilidade = 'elegivel'`
  - `odds_preenchidas = true`
  - `data_jogo BETWEEN NOW() AND NOW() + 2 days`
  - `(odds >= 1.60 OR promovida_manual = true)`
**And** ordena por odds DESC
**And** seleciona top 3

**Given** aposta é postada
**When** registrar postagem
**Then** adiciona timestamp ao array `historico_postagens`
**And** aposta continua elegível para próximos jobs

**Query de seleçao:**
```sql
SELECT * FROM suggested_bets
WHERE elegibilidade = 'elegivel'
  AND (odds IS NOT NULL OR promovida_manual = true)
  AND kickoff_time >= NOW()
  AND kickoff_time <= NOW() + INTERVAL '2 days'
  AND (odds >= 1.60 OR promovida_manual = true)
  AND deep_link IS NOT NULL
ORDER BY
  promovida_manual DESC,
  odds DESC
LIMIT 3;
```

**Technical Notes:**
- Modificar `betService.js` funçao `getEligibleBets()`
- Adicionar funçao `registrarPostagem(id)` para atualizar histórico
- Atualizar job `postBets.js`

---

## Ordem de Implementaçao - Epic 13

1. Story 13.1 (Modelo de dados) -> 2. Story 13.5 (Lógica de seleçao) -> 3. Story 13.2 (/promover) -> 4. Story 13.3 (/remover) -> 5. Story 13.4 (/fila)

---

# ADDENDUM v4.1 - UX Admin e Scraping (2026-01-13)

## Requirements Inventory - Addendum v4.1

### Bug Fixes Identificados

- BUG-007: Comando /link envia 2 mensagens ao invés de 1

### Novos Functional Requirements (Warns por Job)

**Sistema de Warns**
- FR-W1: Sistema envia warn APOS CADA job de postagem (10h, 15h, 22h)
- FR-W2: Sistema envia warn APOS CADA job de atualizacao (odds, analises)
- FR-W3: Warn mostra jogos dos proximos 2 dias com status atualizado
- FR-W4: Warn mostra resultado do job que acabou de rodar
- FR-W5: Warn mostra o que mudou (odds atualizadas, novas apostas)
- FR-W6: Warn usa linguagem simples, sem termos tecnicos
- FR-W7: Warn inclui acoes pendentes claras para o admin

### Novos Functional Requirements (Ordenaçao)

**Ordenaçao Padronizada**
- FR-O1: TODOS os comandos de listagem ordenam por: data ASC, odds DESC
- FR-O2: Listagens agrupam visualmente por dia (separador entre dias)
- FR-O3: TODOS os comandos de listagem tem paginacao
- FR-O4: Paginacao padrao: 10 itens por pagina
- FR-O5: Navegacao: `/comando pagina N` ou botoes inline

### Novos Functional Requirements (Alertas de Atualizaçao)

**Alertas e Histórico**
- FR-A1: Apos job de enrichOdds, enviar alerta com IDs atualizados
- FR-A2: Apos job de geracao de analises, enviar alerta com novos IDs
- FR-A3: Alerta mostra: ID, jogo, valor anterior -> novo (para odds)
- FR-A4: Comando `/atualizados` lista todas atualizacoes recentes
- FR-A5: Comando `/atualizados` tem paginacao
- FR-A6: Historico mantem ultimas 48 horas de atualizacoes
- FR-A7: Analises NUNCA rodam para jogos que ja tem apostas geradas

### FR Coverage Map - Addendum v4.1

| FR | Epic | Descriçao |
|----|------|-----------|
| BUG-007 | Epic 14 | /link 2 mensagens |
| FR-W1-7 | Epic 14 | Sistema de warns por job |
| FR-O1-5 | Epic 14 | Ordenaçao padronizada |
| FR-A1-7 | Epic 14 | Alertas de atualizaçao |

---

## Epic 14: UX Admin e Visibilidade

Melhorar experiencia do admin nao-técnico com informaçoes claras, warns após cada job, e ordenaçao consistente.

**Valor para o Usuário:**
- Marcelo (operador) sabe o resultado de cada job em tempo real
- Marcelo ve as apostas sempre ordenadas por data e odds de forma consistente
- Marcelo recebe alertas quando odds ou análises sao atualizadas
- Marcelo pode consultar histórico de atualizaçoes

**FRs cobertos:** BUG-007, FR-W1-7, FR-O1-5, FR-A1-7

### Story 14.1: Corrigir Bug /link Duplicado

As a operador,
I want receber apenas 1 mensagem quando cadastro um link,
So that nao seja confundido com mensagens duplicadas.

**Acceptance Criteria:**

**Given** operador envia `/link 45 https://betano.com/...`
**When** bot processa e salva o link
**Then** envia APENAS 1 mensagem de confirmaçao
**And** nao chama `confirmLinkReceived()` separadamente

**Technical Notes:**
- Arquivo: `bot/handlers/adminGroup.js`
- Funçao: `handleLinkUpdate()` (linhas 1272-1284)
- Remover chamada `confirmLinkReceived()` na linha 1279-1284
- Manter apenas o `bot.sendMessage()` das linhas 1272-1276

### Story 14.2: Criar Módulo de Warns (jobWarn.js)

As a sistema,
I want ter funçoes centralizadas para enviar warns,
So that todos os jobs possam reportar seus resultados de forma consistente.

**Acceptance Criteria:**

**Given** módulo `bot/jobs/jobWarn.js` criado
**When** importado por outros jobs
**Then** expoe funçoes:
  - `sendPostWarn(period, postedBets, upcomingBets, pendingActions)`
  - `sendScrapingWarn(updatedBets, failedBets, statusForNextPost)`
  - `sendAnalysisWarn(newBets)`
**And** cada funçao formata mensagem seguindo padrao definido
**And** envia para grupo admin via `sendToAdmin()`

### Story 14.3: Integrar Warns no Job de Postagem

As a operador,
I want receber warn após cada postagem,
So that saiba o que foi postado e o que está pendente.

**Acceptance Criteria:**

**Given** job de postagem executa (10h, 15h, 22h)
**When** postagem conclui (sucesso ou falha)
**Then** chama `sendPostWarn()` com:
  - Lista de apostas postadas
  - Lista de jogos próximos 2 dias
  - Açoes pendentes (sem link, sem odds)
**And** warn é enviado para grupo admin

**Technical Notes:**
- Modificar `bot/jobs/postBets.js`
- Adicionar chamada `sendPostWarn()` ao final do job
- Passar dados coletados durante execuçao

### Story 14.4: Padronizar Ordenaçao (Data -> Odds)

As a operador,
I want ver apostas sempre ordenadas por data e depois por odds,
So that tenha consistencia em todos os comandos.

**Acceptance Criteria:**

**Given** qualquer comando de listagem (/apostas, /filtrar, /fila)
**When** bot retorna lista de apostas
**Then** ordenaçao é: `kickoff_time ASC, odds DESC`
**And** jogos mais próximos aparecem primeiro
**And** dentro do mesmo dia, maior odd primeiro

**Technical Notes:**
- Modificar queries em `bot/services/betService.js`:
  - `getAvailableBets()`
  - `getEligibleBets()`
  - `getFilaStatus()`
- Padronizar ORDER BY clause

### Story 14.5: Implementar Agrupamento por Dia

As a operador,
I want ver apostas agrupadas visualmente por dia,
So that seja fácil identificar jogos de hoje vs amanha.

**Acceptance Criteria:**

**Given** lista de apostas retornada
**When** formatar para exibiçao
**Then** agrupa apostas por dia com separador visual
**And** mostra header "HOJE - DD/MM" ou "AMANHA - DD/MM"
**And** usa separador entre dias

**Technical Notes:**
- Criar helper `formatBetListWithDays(bets, page, pageSize)` em `bot/utils/formatters.js`
- Aplicar em handlers de `/apostas`, `/filtrar`, `/fila`

### Story 14.6: Adicionar Paginaçao em Todos os Comandos

As a operador,
I want navegar por páginas de resultados,
So that nao receba mensagens muito longas.

**Acceptance Criteria:**

**Given** comando de listagem com mais de 10 resultados
**When** bot formata resposta
**Then** mostra apenas 10 itens por página
**And** indica "Página X de Y | Total: N apostas"
**And** instrui como navegar: `/comando 2` para página 2

**Comandos afetados:**
- `/apostas [página]` - já tem, manter
- `/filtrar [tipo] [página]` - adicionar
- `/fila [página]` - adicionar
- `/atualizados [página]` - criar com paginaçao

### Story 14.7: Criar Tabela odds_update_history

As a sistema,
I want registrar histórico de atualizaçoes de odds,
So that operador possa consultar o que mudou.

**Acceptance Criteria:**

**Given** migration executada
**When** tabela criada
**Then** estrutura é:
```sql
CREATE TABLE odds_update_history (
  id SERIAL PRIMARY KEY,
  bet_id BIGINT REFERENCES suggested_bets(id),
  update_type TEXT, -- 'odds_change', 'new_analysis'
  old_value NUMERIC,
  new_value NUMERIC,
  job_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_odds_history_bet_id ON odds_update_history(bet_id);
CREATE INDEX idx_odds_history_created ON odds_update_history(created_at);
```

### Story 14.8: Registrar Mudanças de Odds no Histórico

As a sistema,
I want registrar toda mudança de odds no histórico,
So that tenha rastreabilidade completa.

**Acceptance Criteria:**

**Given** job de enriquecimento atualiza odds de uma aposta
**When** `updateBetOdds(betId, newOdds)` é chamado
**Then** registra em `odds_update_history`:
  - bet_id
  - update_type = 'odds_change'
  - old_value = odds anterior
  - new_value = odds nova
  - job_name = nome do job (ex: 'enrichOdds_13h')
**And** só registra se valor realmente mudou

**Technical Notes:**
- Modificar `betService.js` funçao `updateBetOdds()`
- Buscar valor anterior antes de atualizar
- Inserir em `odds_update_history` se diferente

### Story 14.9: Implementar Comando /atualizados

As a operador,
I want consultar histórico de atualizaçoes,
So that saiba o que mudou nas últimas horas.

**Acceptance Criteria:**

**Given** operador envia `/atualizados` no grupo admin
**When** bot processa comando
**Then** lista atualizaçoes das últimas 48 horas
**And** agrupa por dia e hora
**And** mostra tipo (odds ou análise) e IDs afetados
**And** tem paginaçao (10 por página)

---

## Ordem de Implementaçao - Epics 14

1. Story 14.1 (Bug /link) -> Quick win
2. Story 14.7 (Tabela histórico) -> Pré-requisito
3. Story 14.2 (Módulo warns) -> Base
4. Story 14.4 + 14.5 (Ordenaçao + Agrupamento) -> UX
5. Story 14.6 (Paginaçao) -> UX
6. Story 14.8 (Registrar mudanças) -> Histórico
7. Story 14.9 (Comando /atualizados) -> Histórico
8. Story 14.3 (Integrar warns postagem) -> Finalizaçao

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

**Status:** COMPLETO (10/10 stories)

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

**Technical Notes:**
- Criar bot/jobs/membership/reconciliation.js (03:00 BRT)
- Usar caktoService.getSubscription(subscriptionId)
- Lock de 15 minutos (reconciliaçao pode demorar)
- Rate limit nas chamadas Cakto (evitar throttling)
- Logar com prefixo [membership:reconciliation]

### Story 16.9: Implementar Portao de Entrada do Bot

As a sistema,
I want bloquear entrada de membros que nao estao ativos ou em trial,
So that apenas membros autorizados possam entrar no grupo.

**Acceptance Criteria:**

**Given** usuário tenta entrar no grupo público
**When** bot detecta o evento new_chat_members
**Then** verifica se membro existe e tem status válido (ativo ou trial)
**And** se nao autorizado, remove imediatamente e envia mensagem explicativa

**Technical Notes:**
- Modificar handler em bot/handlers/memberEvents.js
- Adicionar validaçao antes de criar trial

### Story 16.10: Reativar Membro Removido Após Pagamento

As a sistema,
I want reativar automaticamente membros que pagaram após serem removidos,
So that voltem ao grupo sem intervençao manual.

**Acceptance Criteria:**

**Given** membro com status 'removido' e kicked_at recente
**When** webhook purchase_approved é processado
**Then** muda status para 'ativo'
**And** envia convite para voltar ao grupo

**Technical Notes:**
- Modificar processamento de webhooks para detectar reativaçao
- Criar funçao sendRejoinInvite(memberId)

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
9. Story 16.9 (Portao de Entrada) -> Segurança
10. Story 16.10 (Reativaçao Pós-Pagamento) -> UX

---

# ADDENDUM v6 - Refatoracao e Debito Tecnico (2026-01-18)

## Origem

Este epic foi criado a partir da **Retrospectiva do Epic 16** (2026-01-18), que identificou os seguintes problemas:

1. **adminGroup.js com 2000+ linhas** - Arquivo monolítico difícil de manter e testar
2. **Falta de testes de integraçao** - Apenas testes unitários existem
3. **Funçoes duplicadas** (sleep, formatters) - Código repetido entre módulos
4. **Validaçao de input inconsistente** - Issues C1/H1 encontrados em code review

## Requirements Inventory - Addendum v6

### Novos Non-Functional Requirements (Refatoraçao)

- NFR-R1: Nenhum arquivo de handler deve exceder 500 linhas
- NFR-R2: Cobertura de testes de integraçao para fluxos críticos (webhook -> kick)
- NFR-R3: Utilitários compartilhados devem estar em lib/utils.js
- NFR-R4: Toda funçao que recebe ID externo deve validar antes de usar

### Technical Debt Items (da Retrospectiva)

| ID | Severidade | Item | Origem |
|----|------------|------|--------|
| T4 | Alta | Refatorar adminGroup.js em módulos | Retro Epic 16 |
| T1 | Alta | Adicionar testes de integraçao | Retro Epic 16 |
| T2 | Media | Documentar env vars em .env.example | Retro Epic 16 |
| A2 | Media | Padrao de validaçao de input | Retro Epic 16 |

---

## Epic 17: Refatoracao e Debito Tecnico (ARQUIVADO 2026-02-05)

Reduzir debito tecnico identificado na retrospectiva do Epic 16, melhorando a manutentibilidade e testabilidade do código.

**Valor para o Desenvolvedor:**
- Arquivos menores e mais focados facilitam navegaçao
- Testes de integraçao aumentam confiança em mudanças
- Padroes consistentes reduzem bugs de validaçao
- Código mais fácil de entender para novos contribuidores

**Origem:** Retrospectiva Epic 16 (Action Items T1, T2, T4, A2)

**Status Final:** COMPLETO (5/5 stories done)

---

### Story 17.1: Refatorar adminGroup.js em Módulos por Domínio ✅

As a desenvolvedor,
I want ter handlers de admin separados por domínio,
So that seja mais fácil manter e testar cada funcionalidade.

**Status:** DONE

### Story 17.2: Adicionar Testes de Integraçao para Fluxo de Membership ✅

As a desenvolvedor,
I want ter testes de integraçao para o fluxo webhook -> processamento -> kick,
So that tenha confiança que o sistema funciona end-to-end.

**Status:** DONE

### Story 17.3: Documentar Environment Variables ✅

As a desenvolvedor,
I want ter um .env.example atualizado e documentado,
So that saiba todas as variáveis necessárias para rodar o projeto.

**Status:** DONE

### Story 17.4: Implementar Validaçao Padronizada de Input ✅

As a desenvolvedor,
I want ter um padrão de validaçao de input para IDs externos,
So that evite bugs de validaçao como o C1 encontrado no code review.

**Status:** DONE

### Story 17.5: Consolidar Utilitários Compartilhados ✅

As a desenvolvedor,
I want ter utilitários comuns em um único lugar,
So that nao tenha código duplicado entre módulos.

**Status:** DONE

---

## Ordem de Implementaçao - Epic 17

1. Story 17.3 (Documentar env vars) -> Quick win, independente ✅
2. Story 17.5 (Consolidar utilitários) -> Base para refatoraçao ✅
3. Story 17.4 (Validaçao de input) -> Padrão para novos módulos ✅
4. Story 17.1 (Refatorar adminGroup.js) -> Principal débito técnico ✅
5. Story 17.2 (Testes de integraçao) -> Validaçao final ✅

**Arquivado em:** 2026-02-05
