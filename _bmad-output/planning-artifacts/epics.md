---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: "2026-01-10"
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/project-context.md
  - docs/data-models.md
---

# bets-estatistica - Epic Breakdown

## Overview

Este documento contém a decomposição completa de épicos e stories para bets-estatistica, transformando os requisitos do PRD, Architecture e data models em histórias implementáveis.

## Requirements Inventory

### Functional Requirements

**Geração de Apostas**
- FR1: Sistema pode gerar análises estatísticas para jogos usando IA (LangChain + OpenAI)
- FR2: Sistema pode filtrar apenas apostas do tipo safe_bets das análises geradas
- FR3: Sistema pode descartar value_bets e manter apenas safe_bets
- FR4: Sistema pode armazenar apostas geradas na tabela suggested_bets

**Integração de Odds**
- FR5: Sistema pode consultar odds em tempo real de uma API externa
- FR6: Sistema pode associar odds a cada aposta gerada
- FR7: Sistema pode filtrar apostas com odds < 1.60
- FR8: Sistema pode ordenar apostas por odds (maior primeiro)
- FR9: Sistema pode selecionar as top 3 apostas com maiores odds

**Publicação Telegram (Grupo Público)**
- FR10: Bot pode enviar mensagens para o grupo público do Telegram
- FR11: Bot pode postar automaticamente nos horários 10h, 15h e 22h (America/Sao_Paulo)
- FR12: Bot pode formatar mensagens com informações do jogo, aposta, odds e justificativa
- FR13: Bot pode incluir link de aposta fornecido pelo operador
- FR14: Bot pode variar o texto das mensagens para manter engajamento
- FR15: Bot pode exibir taxa de acerto histórica na mensagem

**Grupo Admin (Coleta de Links)**
- FR16: Bot pode postar pedidos de links no grupo admin (8h, 13h, 20h)
- FR17: Bot pode formatar pedido com detalhes da aposta (jogo, mercado, odd esperada)
- FR18: Bot pode detectar quando operador responde com um link
- FR19: Bot pode validar se o link é de uma casa de apostas conhecida (Bet365, Betano, etc.)
- FR20: Bot pode salvar link associado à aposta no BD
- FR21: Bot pode enviar lembrete se operador não responder em X minutos
- FR22: Bot pode confirmar recebimento do link com ✅

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
- FR34: Operador pode visualizar logs de execução do bot
- FR35: Operador pode verificar status de postagens (enviadas/falhadas)
- FR36: Operador pode forçar retry manual de postagem falhada
- FR37: Sistema pode alertar operador em caso de falha crítica

**Regras de Negócio**
- FR38: Sistema deve manter pelo menos 3 apostas ativas a qualquer momento
- FR39: Sistema deve considerar apenas jogos com pelo menos 2 dias de antecedência
- FR40: Sistema não deve postar no grupo público se aposta não tiver link válido
- FR41: Sistema não deve postar se API de odds estiver indisponível
- FR42: Sistema deve pedir links 2h antes do horário de postagem pública

**Gestão de Dados**
- FR43: Sistema pode buscar dados de jogos da API FootyStats
- FR44: Sistema pode armazenar jogos, times e estatísticas no PostgreSQL (Supabase)
- FR45: Sistema pode gerenciar fila de análise de partidas
- FR46: Sistema pode sincronizar dados com Supabase

### NonFunctional Requirements

**Performance**
- NFR1: Postagem deve ocorrer no horário programado (± 30 segundos)
- NFR2: Consulta de odds deve completar em < 5 segundos por aposta
- NFR3: Geração de deep links pode ser pré-processada (< 5 minutos)
- NFR4: Tracking de resultados pode ter delay (< 30 minutos após fim do jogo)

**Reliability**
- NFR5: Bot deve estar disponível nos horários de postagem (cold start OK)
- NFR6: Postagens não devem ser perdidas (0 por mês)
- NFR7: Sistema deve recuperar de falhas automaticamente (retry < 5 min)
- NFR8: Dados de tracking não devem ser perdidos (100%)

**Security**
- NFR9: API keys devem ser armazenadas em variáveis de ambiente
- NFR10: Bot token do Telegram deve ser protegido (rotação possível)
- NFR11: Logs não devem expor credenciais

**Scalability**
- NFR12: Sistema deve suportar até 10.000 membros sem degradação
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
- Migrar PostgreSQL local → Supabase
- Implementar state machine de apostas (7 estados)
- Deploy no Render com cron jobs (8 jobs)
- Integrar The Odds API com market mapping
- Padrão de response `{ success, data/error }`
- Retry 3x com exponential backoff
- Alertas no grupo admin (formato técnico + simples)
- Acesso ao banco centralizado via lib/supabase.js

**Do data-models.md (Migração):**
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

| FR | Epic | Descrição |
|----|------|-----------|
| FR1-4 | Epic 6 | Geração IA (safe_bets) |
| FR5-9 | Epic 4 | Integração Odds API |
| FR10-15 | Epic 3 | Postagem grupo público |
| FR16-22 | Epic 2 | Coleta links admin |
| FR23-25 | Epic 2 | Deep links |
| FR26-31 | Epic 5 | Tracking resultados |
| FR32-37 | Epic 5 | Métricas |
| FR38-42 | Epic 3 | Regras de negócio |
| FR43-46 | Epic 1 | Gestão de dados |

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

### Epic 4: Integração de Odds (The Odds API)
Apostas são enriquecidas com odds reais e rankeadas.
**FRs cobertos:** FR5, FR6, FR7, FR8, FR9

### Epic 5: Tracking de Resultados & Métricas
Sistema registra sucesso/fracasso de cada aposta automaticamente.
**FRs cobertos:** FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34, FR35, FR36, FR37

### Epic 6: Refinamento da Geração de Apostas
IA gera apenas safe_bets filtradas corretamente.
**FRs cobertos:** FR1, FR2, FR3, FR4

## Ordem de Implementação

1. Epic 1 (Infra) → 2. Epic 6 (Geração) → 3. Epic 4 (Odds) → 4. Epic 2 (Links) → 5. Epic 3 (Postagem) → 6. Epic 5 (Tracking)

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
**And** credenciais são salvas em `.env.example` (sem valores reais)

### Story 1.2: Migrar Schema para Supabase

As a desenvolvedor,
I want migrar o schema existente para Supabase,
So that todas as tabelas de dados esportivos e agente estejam disponíveis.

**Acceptance Criteria:**

**Given** schema local em `sql/league_schema.sql` e `sql/agent_schema.sql`
**When** executar migrations no Supabase
**Then** tabelas `league_seasons`, `league_matches`, `suggested_bets`, etc. são criadas
**And** dados podem ser inseridos via Supabase client

### Story 1.3: Adicionar Campos de Status em suggested_bets

As a sistema,
I want ter campos de status e tracking na tabela suggested_bets,
So that possa gerenciar o ciclo de vida de cada aposta.

**Acceptance Criteria:**

**Given** tabela `suggested_bets` existente
**When** executar migration de alteração
**Then** novos campos são adicionados:
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

**Given** dependência `@supabase/supabase-js` instalada
**When** importar `lib/supabase.js`
**Then** cliente Supabase é exportado configurado com env vars
**And** funções helper para queries são disponibilizadas
**And** pattern `{ success, data/error }` é seguido

### Story 1.5: Criar lib/logger.js

As a desenvolvedor,
I want ter logging centralizado,
So that todos os logs sigam o mesmo padrão.

**Acceptance Criteria:**

**Given** necessidade de logs estruturados
**When** usar `logger.info()`, `logger.warn()`, `logger.error()`
**Then** logs são formatados com timestamp, level e context
**And** logs não expõem credenciais

### Story 1.6: Criar Bot Telegram Básico

As a operador,
I want ter um bot Telegram respondendo,
So that possa verificar que o sistema está online.

**Acceptance Criteria:**

**Given** token do bot configurado em `TELEGRAM_BOT_TOKEN`
**When** enviar `/status` para o bot
**Then** bot responde com "🟢 Online"
**And** bot está configurado para receber mensagens de grupos

### Story 1.7: Configurar Deploy no Render

As a desenvolvedor,
I want ter o bot deployado no Render,
So that rode em produção com cron jobs.

**Acceptance Criteria:**

**Given** `render.yaml` configurado
**When** fazer push para branch main
**Then** Render faz deploy do bot
**And** variáveis de ambiente são configuradas
**And** bot responde ao `/status`

---

## Epic 6: Refinamento da Geração de Apostas

IA gera apenas safe_bets para jogos próximos.

### Story 6.1: Gerar Apenas Safe Bets

As a sistema,
I want gerar apenas apostas do tipo safe_bets,
So that value_bets não sejam nem criadas.

**Acceptance Criteria:**

**Given** análise de jogo pelo agente IA
**When** gerar apostas recomendadas
**Then** apenas apostas safe_bets são geradas
**And** schema/prompt do agente não inclui value_bets
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
I want selecionar apostas apenas para jogos com menos de 2 dias de antecedência,
So that as apostas sejam para jogos iminentes.

**Acceptance Criteria:**

**Given** lista de apostas geradas
**When** selecionar para postagem
**Then** apenas jogos com `kickoff_time <= NOW() + 2 days` são considerados
**And** jogos mais distantes são ignorados para postagem

### Story 6.4: Migrar agent/db.js para Supabase

As a desenvolvedor,
I want que o agent use Supabase ao invés de PostgreSQL local,
So that todo o sistema use a mesma fonte de dados.

**Acceptance Criteria:**

**Given** `lib/supabase.js` disponível
**When** agent executa queries
**Then** queries são feitas via Supabase client
**And** comportamento existente é mantido

---

## Epic 4: Integração de Odds (The Odds API)

Apostas são enriquecidas com odds reais e rankeadas.

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
  - `over_gols` / `under_gols` → `totals`
  - `btts` → `btts`
  - `escanteios` → `totals_corners`
  - `cartoes` → `totals_bookings`
**And** bookmakers target são `bet365` e `betano`

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
So that não sejam selecionadas para postagem mas permaneçam no BD.

**Acceptance Criteria:**

**Given** apostas enriquecidas com odds
**When** odds < 1.60
**Then** aposta permanece no BD
**And** é marcada com flag (ex: `eligible = false` ou status específico)
**And** não é considerada para seleção de postagem
**And** log indica quantas foram marcadas como inelegíveis

### Story 4.5: Manter 3 Apostas Ativas com Reposição

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
**When** ainda não foi concluída
**Then** aposta permanece ativa até resultado final
**And** não é substituída prematuramente

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

**Given** horários 8h, 13h, 20h (São Paulo)
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
So that não aceite links inválidos.

**Acceptance Criteria:**

**Given** link recebido do operador
**When** validar
**Then** aceita links que contêm: `bet365.com`, `betano.com`, `betano.com.br`
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
**And** bot confirma com ✅

### Story 2.6: Enviar Lembretes

As a bot,
I want enviar lembretes se operador não responder,
So that links sejam coletados a tempo.

**Acceptance Criteria:**

**Given** pedido de link enviado há X minutos
**When** operador não respondeu
**Then** bot envia lembrete a cada 30 minutos
**And** após 3 lembretes, continua pedindo 1x por hora
**And** lembrete indica urgência

### Story 2.7: Confirmar Recebimento

As a operador,
I want receber confirmação quando link for aceito,
So that saiba que foi processado.

**Acceptance Criteria:**

**Given** link validado e salvo
**When** processamento completo
**Then** bot responde com ✅ e detalhes da aposta
**And** operador sabe que pode seguir para próximo

---

## Epic 3: Postagem no Grupo Público

Membros do grupo recebem apostas formatadas com links funcionais.

### Story 3.1: Criar Job de Postagem Pública

As a bot,
I want postar automaticamente nos horários definidos,
So that membros recebam apostas pontualmente.

**Acceptance Criteria:**

**Given** horários 10h, 15h, 22h (São Paulo)
**When** cron job executa
**Then** bot posta no grupo público as apostas prontas
**And** apenas apostas com `bet_status = 'ready'` são postadas
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
**And** mensagem usa Markdown para formatação

### Story 3.3: Incluir Deep Link na Mensagem

As a membro do grupo,
I want clicar no link e ir direto para a aposta,
So that possa apostar rapidamente.

**Acceptance Criteria:**

**Given** aposta com `deep_link` preenchido
**When** postar mensagem
**Then** link está incluído como botão ou hyperlink
**And** ao clicar, usuário é direcionado para a casa de apostas
**And** `odds_at_post` é registrado com valor no momento

### Story 3.4: Validar Requisitos Antes de Postar

As a sistema,
I want verificar requisitos antes de postar,
So that não poste mensagens incompletas.

**Acceptance Criteria:**

**Given** horário de postagem
**When** selecionar apostas
**Then** só posta se:
  - Tem link válido (`deep_link` não null)
  - Jogo está dentro de 2 dias
  - Odd ≥ 1.60
**And** apostas que não atendem são puladas
**And** log indica motivo

### Story 3.5: Fallback de Odds via Grupo Admin

As a sistema,
I want ter fallback manual quando API de odds falhar,
So that ainda possa postar com odds confirmadas.

**Acceptance Criteria:**

**Given** API de odds indisponível após 3 tentativas
**When** precisar postar
**Then** bot posta no grupo admin pedindo confirmação de odds
**And** operador responde com odd numérica
**And** bot valida (número entre 1.0 e 10.0)
**And** se confirmado, usa essa odd para postar
**And** se não responder até horário de postagem, pula a aposta

### Story 3.6: Variar Texto das Mensagens

As a membro do grupo,
I want mensagens com textos variados,
So that não pareçam robóticas.

**Acceptance Criteria:**

**Given** template de mensagem
**When** postar
**Then** usa variações de frases de abertura
**And** emojis diferentes
**And** chamadas para ação variadas
**And** mantém informações essenciais consistentes

### Story 3.7: Exibir Taxa de Acerto

As a membro do grupo,
I want ver a taxa de acerto do bot,
So that tenha confiança nas sugestões.

**Acceptance Criteria:**

**Given** histórico de apostas concluídas
**When** postar mensagem
**Then** inclui taxa de acerto (ex: "🎯 78% de acerto nos últimos 30 dias")
**And** se não houver dados suficientes, omite ou mostra "Começando agora"

### Story 3.8: Registrar Message ID do Telegram

As a sistema,
I want salvar o ID da mensagem enviada,
So that possa editar ou referenciar depois.

**Acceptance Criteria:**

**Given** mensagem enviada com sucesso
**When** Telegram retorna message_id
**Then** campo `telegram_message_id` é atualizado
**And** pode ser usado para edição futura

---

## Epic 5: Tracking de Resultados & Métricas

Sistema registra sucesso/fracasso de cada aposta automaticamente.

### Story 5.1: Criar Job de Tracking de Resultados

As a sistema,
I want verificar resultados apenas após tempo suficiente,
So that não desperdice recursos com jogos em andamento.

**Acceptance Criteria:**

**Given** cron job executando a cada 5 minutos
**When** verificar apostas com `bet_status = 'posted'`
**Then** só verifica jogos onde `kickoff_time + 2 horas < NOW()`
**And** jogos que ainda não passaram 2h do início são ignorados
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
**And** se ainda 'in_progress' (prorrogação/atraso), tenta novamente em 5 min
**And** timeout máximo de 4 horas após início

### Story 5.3: Comparar Resultado com Aposta

As a sistema,
I want comparar resultado real com aposta sugerida,
So that determine sucesso ou fracasso.

**Acceptance Criteria:**

**Given** jogo finalizado com placar
**When** avaliar aposta
**Then** compara resultado com `bet_pick`:
  - Over 2.5: total gols > 2.5 → success
  - Under 2.5: total gols < 2.5 → success
  - BTTS: ambos marcaram → success
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
So that tenha visão completa.

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
**And** indica se precisa intervenção manual

### Story 5.8: Comando /status para Operador

As a operador,
I want consultar status do sistema,
So that verifique se está tudo funcionando.

**Acceptance Criteria:**

**Given** operador envia `/status` no grupo admin
**When** processar comando
**Then** bot responde com:
  - Apostas ativas: X
  - Última postagem: HH:MM
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
