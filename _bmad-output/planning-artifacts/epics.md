---
stepsCompleted: [1, 2, 3, 4]
status: active
updatedAt: "2026-01-22"
lastAddendum: "v6-refactoring"
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/prd-addendum-v2.md
  - _bmad-output/planning-artifacts/prd-addendum-v3.md
  - _bmad-output/planning-artifacts/prd-addendum-v4.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/project-context.md
  - docs/data-models.md
epicCount: 2
activeEpics: [15, 17]
pendingEpic: 15
priorityEpic: 17
completedEpicsFile: archive/epics-completed.md
archivedEpics: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16]
---

# bets-estatistica - Epic Breakdown (Ativos)

## Overview

Este documento contém os épicos ativos (15, 17) do projeto bets-estatistica.

Para épicos completados (1-14, 16), veja `epics-completed.md`.

**Nota:** Epic 16 foi arquivado em 2026-01-22 após conclusao de todas as 10 stories.

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

### Epic 17: Refatoracao e Debito Tecnico (Pós-Epic 16)
Reduzir debito tecnico identificado na retrospectiva do Epic 16, com foco na refatoracao do adminGroup.js (2000+ linhas) e melhorias de testabilidade.
**Origem:** Retrospectiva Epic 16 (Action Items T1, T4)
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

## Epic 17: Refatoracao e Debito Tecnico

Reduzir debito tecnico identificado na retrospectiva do Epic 16, melhorando a manutentibilidade e testabilidade do código.

**Valor para o Desenvolvedor:**
- Arquivos menores e mais focados facilitam navegaçao
- Testes de integraçao aumentam confiança em mudanças
- Padroes consistentes reduzem bugs de validaçao
- Código mais fácil de entender para novos contribuidores

**Origem:** Retrospectiva Epic 16 (Action Items T1, T2, T4, A2)

**Prioridade:** ALTA (Antes de adicionar novas features)

---

### Story 17.1: Refatorar adminGroup.js em Módulos por Domínio

As a desenvolvedor,
I want ter handlers de admin separados por domínio,
So that seja mais fácil manter e testar cada funcionalidade.

**Acceptance Criteria:**

**Given** arquivo adminGroup.js atual com 2000+ linhas
**When** refatorado em módulos
**Then** estrutura final é:
```
bot/handlers/
├── adminGroup.js              # Router principal (~200 linhas)
├── admin/
│   ├── index.js               # Exports consolidados
│   ├── betCommands.js         # /apostas, /odd, /link, /filtrar, /fila, /promover, /remover (~400 linhas)
│   ├── memberCommands.js      # /membros, /membro, /trial, /add_trial, /remover_membro, /estender (~350 linhas)
│   ├── actionCommands.js      # /postar, /atualizar, /trocar (~150 linhas)
│   ├── queryCommands.js       # /overview, /metricas, /status, /simular, /atualizados (~300 linhas)
│   └── callbackHandlers.js    # Inline keyboard callbacks (~100 linhas)
```

**Given** módulos separados criados
**When** testes existentes executados
**Then** todos os 416 testes continuam passando (zero regressoes)

**Given** adminGroup.js refatorado
**When** novo comando precisa ser adicionado
**Then** desenvolvedor sabe exatamente qual arquivo editar baseado no domínio

**Technical Notes:**
- Manter backward compatibility total
- Usar re-exports em index.js para facilitar imports
- Cada módulo exporta suas funçoes handler
- adminGroup.js apenas faz routing para handlers
- Manter pendingRemovals em callbackHandlers.js
- Logar com prefixo consistente [admin:bet], [admin:member], etc.

### Story 17.2: Adicionar Testes de Integraçao para Fluxo de Membership

As a desenvolvedor,
I want ter testes de integraçao para o fluxo webhook -> processamento -> kick,
So that tenha confiança que o sistema funciona end-to-end.

**Acceptance Criteria:**

**Given** fluxo de webhook até kick implementado
**When** testes de integraçao criados
**Then** cobre os seguintes cenários:
  1. Webhook `purchase_approved` -> membro ativo -> pode acessar grupo
  2. Webhook `subscription_canceled` -> membro inadimplente -> kickado
  3. Trial expirado (dia 8) -> kick automático
  4. Membro kickado -> tenta reentrar < 24h -> permitido
  5. Membro kickado -> tenta reentrar > 24h -> bloqueado

**Given** testes de integraçao
**When** executados
**Then** usam mocks para Telegram API e Cakto API
**And** usam banco de dados de teste (transaçao com rollback)
**And** tempo de execuçao < 30 segundos total

**Technical Notes:**
- Criar pasta `__tests__/integration/membership/`
- Usar supertest para testar webhook-server.js
- Mock Telegram bot com jest.fn()
- Usar transaçao Supabase com rollback para isolamento
- Considerar usar testcontainers se necessário

### Story 17.3: Documentar Environment Variables

As a desenvolvedor,
I want ter um .env.example atualizado e documentado,
So that saiba todas as variáveis necessárias para rodar o projeto.

**Acceptance Criteria:**

**Given** projeto tem variáveis de ambiente espalhadas
**When** .env.example atualizado
**Then** contém TODAS as variáveis usadas no projeto com:
  - Nome da variável
  - Descriçao breve
  - Valor de exemplo (nao sensível)
  - Indicaçao se é obrigatória ou opcional

**Formato:**
```bash
# ===========================================
# TELEGRAM
# ===========================================
TELEGRAM_BOT_TOKEN=         # Bot token do @BotFather (obrigatório)
TELEGRAM_ADMIN_GROUP_ID=    # ID do grupo admin, ex: -100123456789 (obrigatório)
TELEGRAM_PUBLIC_GROUP_ID=   # ID do grupo público (obrigatório)

# ===========================================
# SUPABASE
# ===========================================
SUPABASE_URL=               # URL do projeto Supabase (obrigatório)
SUPABASE_ANON_KEY=          # Anon key do Supabase (obrigatório)

# ===========================================
# CAKTO (Membership)
# ===========================================
CAKTO_API_URL=              # URL da API Cakto, ex: https://api.cakto.com.br (obrigatório se Epic 16)
CAKTO_CLIENT_ID=            # Client ID OAuth do Cakto (obrigatório se Epic 16)
CAKTO_CLIENT_SECRET=        # Client Secret OAuth do Cakto (obrigatório se Epic 16)
CAKTO_WEBHOOK_SECRET=       # Secret para validaçao HMAC (obrigatório se Epic 16)
CAKTO_CHECKOUT_URL=         # URL de checkout para links (obrigatório se Epic 16)

# ===========================================
# MEMBERSHIP CONFIG
# ===========================================
MEMBERSHIP_TRIAL_DAYS=7     # Dias de trial para novos membros (opcional, default: 7)
MEMBERSHIP_SUBSCRIPTION_PRICE=R$50/mes  # Preço exibido nas mensagens (opcional)
MEMBERSHIP_OPERATOR_USERNAME=operador   # Username do operador (opcional)
```

**Given** .env.example criado
**When** desenvolvedor clona o projeto
**Then** consegue configurar ambiente copiando .env.example para .env
**And** sabe quais variáveis sao obrigatórias

**Technical Notes:**
- Revisar todos os arquivos que usam process.env
- Agrupar por funcionalidade
- Indicar quais sao necessários para cada Epic

### Story 17.4: Implementar Validaçao Padronizada de Input

As a desenvolvedor,
I want ter um padrão de validaçao de input para IDs externos,
So that evite bugs de validaçao como o C1 encontrado no code review.

**Acceptance Criteria:**

**Given** funçoes que recebem IDs externos (subscription_id, telegram_id, member_id)
**When** padrão de validaçao aplicado
**Then** toda funçao que recebe ID externo:
  1. Valida que nao é null/undefined
  2. Valida tipo esperado (string ou number)
  3. Valida formato se aplicável (UUID, numeric)
  4. Retorna erro estruturado se inválido

**Criar funçoes de validaçao em lib/validators.js:**
```javascript
function validateSubscriptionId(id) {
  if (!id || typeof id !== 'string' || id.trim() === '') {
    return { valid: false, error: { code: 'INVALID_SUBSCRIPTION_ID', message: 'Subscription ID is required' } };
  }
  return { valid: true };
}

function validateTelegramId(id) {
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;
  if (!numId || isNaN(numId) || numId <= 0) {
    return { valid: false, error: { code: 'INVALID_TELEGRAM_ID', message: 'Telegram ID must be positive number' } };
  }
  return { valid: true, value: numId };
}

function validateUUID(id) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    return { valid: false, error: { code: 'INVALID_UUID', message: 'Invalid UUID format' } };
  }
  return { valid: true };
}
```

**Given** validators criados
**When** aplicados em funçoes existentes
**Then** funçoes afetadas incluem:
  - caktoService.getSubscription(subscriptionId)
  - memberService.getMemberById(memberId)
  - memberService.getMemberByTelegramId(telegramId)
  - memberService.getMemberDetails(identifier)

**Technical Notes:**
- Criar lib/validators.js
- Aplicar em services existentes sem quebrar testes
- Adicionar testes para validators

### Story 17.5: Consolidar Utilitários Compartilhados

As a desenvolvedor,
I want ter utilitários comuns em um único lugar,
So that nao tenha código duplicado entre módulos.

**Acceptance Criteria:**

**Given** funçoes duplicadas identificadas
**When** consolidadas em lib/utils.js
**Then** inclui:
  - `sleep(ms)` - já existe (criado no Epic 16.8)
  - `formatDate(date, format)` - formataçao de datas
  - `truncate(str, maxLength)` - truncar strings longas
  - `parseNumericId(id)` - converter string para number com validaçao

**Given** utilitários consolidados
**When** módulos que usavam funçoes duplicadas
**Then** importam de lib/utils.js
**And** testes continuam passando

**Technical Notes:**
- lib/utils.js já existe (criado no code review 16.8)
- Adicionar funçoes comuns encontradas nos handlers
- Remover duplicatas dos módulos originais
- Manter backward compatibility

---

## Ordem de Implementaçao - Epic 17

1. Story 17.3 (Documentar env vars) -> Quick win, independente
2. Story 17.5 (Consolidar utilitários) -> Base para refatoraçao
3. Story 17.4 (Validaçao de input) -> Padrão para novos módulos
4. Story 17.1 (Refatorar adminGroup.js) -> Principal débito técnico
5. Story 17.2 (Testes de integraçao) -> Validaçao final

**Estimativa total:** 3-5 dias de desenvolvimento

---

## Critérios de Aceite do Epic

- [ ] Nenhum arquivo de handler excede 500 linhas
- [ ] Todos os 416+ testes continuam passando
- [ ] Pelo menos 5 testes de integraçao para membership flow
- [ ] .env.example documentado e completo
- [ ] Validators aplicados em funçoes críticas
- [ ] Zero duplicaçao de funçoes utilitárias
