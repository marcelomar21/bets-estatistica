---
version: 4
baseDocument: prd.md
createdAt: 2026-01-13
author: Marcelomendes
status: draft
type: addendum
---

# PRD Addendum v4 - Bets Estatistica

**Referencia:** Este documento complementa o PRD original (`prd.md`) e os Addendums anteriores (v2, v3) com novos requisitos identificados em operacao.

**Contexto:** Apos operacao continua do sistema, foram identificadas necessidades de melhoria na visibilidade para admins, otimizacao do preenchimento de odds, e correcoes de UX.

---

## 1. Revisao do Sistema de Warns (Por Job)

### FEAT-011: Warn Apos Cada Execucao de Job

**Prioridade:** Alta
**Categoria:** Admin UX

**Contexto Atual:**

O sistema atual possui alertas fragmentados:
- Health check a cada 5 minutos (tecnico, muitos alertas)
- Lembretes de links (30/60/90 min)
- Alertas de falha de postagem
- Nenhum feedback apos execucao de jobs

**Problema:**
- Admin nao sabe se jobs executaram com sucesso
- Falta visibilidade do que mudou apos cada job
- Informacao dispersa e reativa (so alerta em erro)

**Requisitos Funcionais:**

| ID | Requisito |
|----|-----------|
| FR-W1 | Sistema envia warn APOS CADA job de postagem (10h, 15h, 22h) |
| FR-W2 | Sistema envia warn APOS CADA job de atualizacao (odds, analises) |
| FR-W3 | Warn mostra jogos dos proximos 2 dias com status atualizado |
| FR-W4 | Warn mostra resultado do job que acabou de rodar |
| FR-W5 | Warn mostra o que mudou (odds atualizadas, novas apostas) |
| FR-W6 | Warn usa linguagem simples, sem termos tecnicos |
| FR-W7 | Warn inclui acoes pendentes claras para o admin |

**Schedule de Warns:**

| Horario | Job | Warn |
|---------|-----|------|
| 09:30 | Scraping odds | Warn com odds atualizadas |
| 10:00 | Postagem manha | Warn com resultado da postagem |
| 14:30 | Scraping odds | Warn com odds atualizadas |
| 15:00 | Postagem tarde | Warn com resultado da postagem |
| 21:30 | Scraping odds | Warn com odds atualizadas |
| 22:00 | Postagem noite | Warn com resultado da postagem |
| Apos geracao | Novas analises | Warn com novos IDs criados |

**Formato - Warn Pos-Postagem:**

```
📤 *POSTAGEM 10H CONCLUIDA* ✅

━━━━━━━━━━━━━━━━━━━━

*APOSTAS POSTADAS:*
✅ #45 Liverpool vs Arsenal - Over 2.5 @ 1.92
✅ #52 PSG vs Monaco - Over 1.5 @ 1.68
✅ #58 Bayern vs Dortmund - BTTS @ 1.75

━━━━━━━━━━━━━━━━━━━━

📊 *PROXIMOS 2 DIAS*

*HOJE (13/01):*
⚽ #47 Real Madrid vs Barcelona - 21:00
   🎯 Ambas marcam │ 📈 1.85 │ ❌ Sem link

*AMANHA (14/01):*
⚽ #61 Chelsea vs Tottenham - 17:00
   🎯 Over 2.5 │ ⚠️ SEM ODD │ ❌ Sem link

━━━━━━━━━━━━━━━━━━━━

⚠️ *ACOES PENDENTES:*
1. Adicionar link para #47 (jogo HOJE 21h!)
2. Aguardar odds para #61

💡 Proxima postagem: 15h
```

**Formato - Warn Pos-Scraping:**

```
🔄 *ODDS ATUALIZADAS* ✅

Job: Scraping 09:30

━━━━━━━━━━━━━━━━━━━━

*5 apostas atualizadas:*
#45 Liverpool vs Arsenal
    Over 2.5: 1.85 → 1.92 (+0.07)

#52 PSG vs Monaco
    Over 1.5: 1.60 → 1.68 (+0.08)

#58 Bayern vs Dortmund
    BTTS: 1.72 → 1.75 (+0.03)

#47 Real Madrid vs Barcelona
    Ambas marcam: ⚠️ AINDA SEM ODD

#61 Chelsea vs Tottenham
    Over 2.5: ⚠️ AINDA SEM ODD

━━━━━━━━━━━━━━━━━━━━

📊 *STATUS PARA POSTAGEM 10H:*
✅ Prontas: 3 apostas
⚠️ Sem odds: 2 apostas
❌ Sem link: 1 aposta

💡 Postagem em 30 minutos!
```

**Formato - Warn Pos-Analises:**

```
🆕 *NOVAS ANALISES GERADAS* ✅

━━━━━━━━━━━━━━━━━━━━

*4 novas apostas criadas:*
#61 Chelsea vs Tottenham (15/01 17:00)
    🎯 Over 2.5 │ ⚠️ Aguardando odds

#62 Inter vs Milan (15/01 20:00)
    🎯 BTTS │ ⚠️ Aguardando odds

#63 Benfica vs Porto (16/01 21:00)
    🎯 Over 1.5 │ ⚠️ Aguardando odds

#64 Ajax vs PSV (16/01 18:00)
    🎯 Ambas marcam │ ⚠️ Aguardando odds

━━━━━━━━━━━━━━━━━━━━

💡 Odds serao buscadas no proximo scraping
```

**Implementacao:**

- **Arquivo:** Criar `bot/jobs/jobWarn.js`
- **Funcoes:** `sendPostWarn()`, `sendScrapingWarn()`, `sendAnalysisWarn()`
- **Integracao:** Chamar ao final de cada job em `postBets.js`, `scrapingOdds.js`, job de analises
- **Dependencias:** Usar `getAvailableBets()`, `getOverviewStats()` de betService.js

**Metricas de Sucesso:**
- Admin sabe resultado de cada job em tempo real
- Acoes pendentes sempre visiveis
- Zero surpresas na hora da postagem

---

## 2. Agente de IA para Scraping de Odds (Betano)

### FEAT-012: Agente de Scraping para Preenchimento de Odds

**Prioridade:** Alta
**Categoria:** Integracao / IA

**Contexto Atual:**

O sistema usa The Odds API para buscar odds:
- **Arquivo:** `bot/services/oddsService.js`
- **Funcao principal:** `getEventOdds(sportKey, eventId, market)`
- **Execucao:** 3x/dia nos jobs de enrichOdds (08:00, 13:00, 20:00)
- **Problema:** Muitas apostas ficam sem odds (API nao cobre todos os mercados/jogos)
- **Problema 2:** Odds mudam constantemente - precisam ser atualizadas ANTES de cada postagem

**Fluxo Atual de Odds:**

```
enrichOdds.js (runEnrichment) - Roda 08:00, 13:00, 20:00
    ↓
interpretMarket(bet.betMarket)  [OpenAI - parse mercado]
    ↓
getEventOdds(sport, eventId, market)  [The Odds API]
    ↓
findBestOdds(oddsData, type, line)  [Matching]
    ↓
updateBetOdds(betId, odds)  [Salva no BD]
```

**Solucao Proposta:**

Criar agente de scraping que:
1. Substitui `getEventOdds()` buscando odds diretamente no site da Betano
2. Roda **ANTES de cada postagem** (30 min de buffer) para garantir odds atualizadas

**NOVO Schedule de Scraping (Antes das Postagens):**

| Horario | Acao | Motivo |
|---------|------|--------|
| **09:30** | Scraping odds | 30 min antes da postagem das 10h |
| **14:30** | Scraping odds | 30 min antes da postagem das 15h |
| **21:30** | Scraping odds | 30 min antes da postagem das 22h |

**Por que 30 minutos de buffer?**
- Tempo suficiente para scraping + processamento
- Se falhar, ainda da tempo de fallback para API
- Odds geralmente nao mudam drasticamente em 30 min
- Admin tem tempo de reagir se algo der errado

**Requisitos Funcionais:**

| ID | Requisito |
|----|-----------|
| FR-S1 | Agente acessa site da Betano e extrai odds de jogos |
| FR-S2 | **Agente busca APENAS a odd do mercado especifico da aposta gerada (economia de tokens)** |
| FR-S3 | Agente usa mesma interface de retorno que `getEventOdds()` |
| FR-S4 | **Scraping roda 30 min ANTES de cada postagem (09:30, 14:30, 21:30)** |
| FR-S5 | Sistema tenta scraping primeiro, fallback para The Odds API se falhar |
| FR-S6 | Cache de 25 minutos por aposta (expira antes da proxima postagem) |
| FR-S7 | Limite de custo: maximo X chamadas LLM por dia (configuravel) |
| FR-S8 | Log detalhado de custo (tokens usados, chamadas feitas) |
| FR-S9 | Warn enviado apos scraping com odds atualizadas (FEAT-011) |

**Estrategia de Economia de Tokens:**

O agente busca **apenas o mercado especifico** de cada aposta gerada pela analise:

```
Exemplo - 3 apostas para buscar:

#45 Liverpool vs Arsenal → Over 2.5 gols
    → Scrape APENAS odd de "Over 2.5" (1 mercado)

#52 PSG vs Monaco → BTTS
    → Scrape APENAS odd de "Ambas marcam" (1 mercado)

#58 Bayern vs Dortmund → Vitoria mandante
    → Scrape APENAS odd de "1" (1 mercado)

Total: 3 scrapes especificos (nao todos os mercados de cada jogo)
```

**NAO fazer:**
- ❌ Buscar todas as odds do jogo (Over 0.5, 1.5, 2.5, 3.5, BTTS, 1X2, etc.)
- ❌ Buscar mercados que nao tem aposta gerada

**Fazer:**
- ✅ Buscar apenas a odd do mercado exato da aposta
- ✅ Input: time casa, time fora, mercado (ex: "Over 2.5")
- ✅ Output: apenas a odd daquele mercado especifico

**Arquitetura Proposta:**

```
┌─────────────────────────────────────────────────────────────┐
│              NOVO SCHEDULE DE ODDS                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  09:30 ──► scrapingOdds.js ──► Warn ──► 10:00 Postagem     │
│  14:30 ──► scrapingOdds.js ──► Warn ──► 15:00 Postagem     │
│  21:30 ──► scrapingOdds.js ──► Warn ──► 22:00 Postagem     │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    SCRAPING FLOW                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  scrapingOdds.js (roda 09:30, 14:30, 21:30)                │
│       ↓                                                     │
│  Buscar apostas para proxima postagem                       │
│       ↓                                                     │
│  Para cada aposta:                                          │
│       ↓                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. Verificar cache (jogo ja foi scrapeado?)        │   │
│  │     → Se sim E cache < 25 min, usar odds do cache   │   │
│  └─────────────────────────────────────────────────────┘   │
│       ↓ (cache miss ou expirado)                            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2. Scraping Agent (NOVO)                           │   │
│  │     → Busca pagina do jogo na Betano                │   │
│  │     → Extrai TODAS as odds do jogo                  │   │
│  │     → Salva no cache (25 min TTL)                   │   │
│  │     → Retorna odds do mercado especifico            │   │
│  └─────────────────────────────────────────────────────┘   │
│       ↓ (se falhar)                                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  3. Fallback: The Odds API                          │   │
│  │     → Comportamento atual mantido                   │   │
│  └─────────────────────────────────────────────────────┘   │
│       ↓                                                     │
│  updateBetOdds(betId, odds)                                │
│       ↓                                                     │
│  Registrar em odds_update_history (FEAT-014)               │
│       ↓                                                     │
│  sendScrapingWarn() (FEAT-011)                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Ponto de Integracao:**

```javascript
// bot/services/scrapingOddsService.js (NOVO)

async function scrapeBetOdds(homeTeam, awayTeam, betMarket, betPick) {
  // Input: dados da aposta especifica
  // Exemplo: "Liverpool", "Arsenal", "Over 2.5 gols", "over"

  // 1. Verificar cache da aposta especifica
  const cacheKey = `${homeTeam}_${awayTeam}_${betMarket}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  // 2. Buscar URL do jogo na Betano
  // 3. Usar agente LLM para extrair APENAS a odd do mercado especifico
  // 4. Retornar odd unica
  // 5. Salvar no cache (25 min TTL)

  return {
    bookmaker: 'betano',
    odds: 1.85,        // Odd do mercado especifico
    market: 'totals',
    type: 'over',
    line: 2.5
  };
}

// Chamada no job de scraping:
for (const bet of betsToUpdate) {
  const odds = await scrapeBetOdds(
    bet.homeTeamName,
    bet.awayTeamName,
    bet.betMarket,    // "Over 2.5 gols"
    bet.betPick       // "over"
  );
  await updateBetOdds(bet.id, odds.odds);
}
```

**Otimizacao de Custo:**

| Estrategia | Descricao |
|------------|-----------|
| **Mercado especifico** | Busca APENAS a odd do mercado da aposta, nao todas |
| Cache por aposta | Cache de 25 min por combinacao jogo+mercado |
| Limite diario | Max N scrapes/dia (configuravel em config.yaml) |
| Fallback API | Se limite atingido, usa The Odds API |
| Metricas | Log de custo por execucao para monitoramento |

**Estimativa de Custo:**

```
Cenario: 10 apostas para atualizar, 3x/dia

SEM otimizacao (buscar tudo):
- 10 apostas × ~20 mercados/jogo = 200 extraccoes
- Muito token por chamada LLM

COM otimizacao (mercado especifico):
- 10 apostas × 1 mercado = 10 extraccoes
- Prompt focado: "Qual a odd de Over 2.5 no jogo X vs Y?"
- ~500-1000 tokens por scrape (estimativa)
- Total: ~5k-10k tokens por execucao
```

**Prompt do Agente (exemplo):**

```
Acesse a pagina do jogo Liverpool vs Arsenal na Betano.
Encontre APENAS a odd do mercado "Mais de 2.5 gols" (Over 2.5).
Retorne apenas o valor numerico da odd (ex: 1.85).
```

**Arquivos a Criar/Modificar:**

| Arquivo | Acao |
|---------|------|
| `bot/services/scrapingOddsService.js` | CRIAR - Agente de scraping |
| `bot/jobs/scrapingOdds.js` | CRIAR - Job que roda 09:30, 14:30, 21:30 |
| `bot/jobs/jobWarn.js` | CRIAR - Funcoes de warn (FEAT-011) |
| `bot/services/oddsService.js` | MODIFICAR - Adicionar fallback |
| `bot/server.js` | MODIFICAR - Adicionar novos crons |
| `lib/config.js` | MODIFICAR - Adicionar configs de scraping |

**Novo Schedule em bot/server.js:**

```javascript
// ANTES (atual):
// 08:00 → enrichOdds + requestLinks
// 10:00 → postBets
// 13:00 → enrichOdds + requestLinks
// 15:00 → postBets
// 20:00 → enrichOdds + requestLinks
// 22:00 → postBets

// DEPOIS (novo):
// 09:30 → scrapingOdds + sendScrapingWarn
// 10:00 → postBets + sendPostWarn
// 14:30 → scrapingOdds + sendScrapingWarn
// 15:00 → postBets + sendPostWarn
// 21:30 → scrapingOdds + sendScrapingWarn
// 22:00 → postBets + sendPostWarn
```

---

## 3. Bug: /link Retorna 2 Mensagens

### BUG-007: Comando /link Envia Mensagem Duplicada

**Severidade:** 🟡 Media
**Status:** Causa Raiz Identificada

**Descricao:**
Ao usar o comando `/link ID URL`, o bot envia 2 mensagens de confirmacao ao inves de 1.

**Causa Raiz Identificada:**

**Arquivo:** `bot/handlers/adminGroup.js`
**Funcao:** `handleLinkUpdate()` (linhas 1206-1287)

O codigo envia 2 mensagens separadas:

**Mensagem 1** (linhas 1272-1276):
```javascript
await bot.sendMessage(
  msg.chat.id,
  `✅ *Link salvo!*\n\n🏟️ ${match}\n🎯 ${bet.betMarket}\n${statusMsg}`,
  { reply_to_message_id: msg.message_id, parse_mode: 'Markdown' }
);
```

**Mensagem 2** (linhas 1279-1284):
```javascript
await confirmLinkReceived({
  homeTeamName: bet.homeTeamName,
  // ... envia outra mensagem via alertService
});
```

A funcao `confirmLinkReceived()` em `bot/services/alertService.js` (linhas 94-104) envia uma segunda mensagem "✅ Link recebido!" para o grupo admin.

**Correcao Necessaria:**

Remover a chamada `confirmLinkReceived()` ja que a primeira mensagem e suficiente.

```javascript
// ANTES (linhas 1272-1284):
await bot.sendMessage(...);  // Mensagem 1
await confirmLinkReceived(...);  // Mensagem 2 - REMOVER

// DEPOIS:
await bot.sendMessage(...);  // Apenas 1 mensagem
// confirmLinkReceived removido
```

**Criterio de Resolucao:**
Comando `/link` envia apenas 1 mensagem de confirmacao.

---

## 4. Ordenacao Padronizada: Data → Odds

### FEAT-013: Ordenacao Consistente em Todos os Comandos

**Prioridade:** Alta
**Categoria:** UX Consistencia

**Contexto Atual:**

Ordenacao inconsistente entre comandos:

| Comando | Ordenacao Atual |
|---------|-----------------|
| /apostas | status → kickoff → odds (client-side) |
| /filtrar | kickoff apenas |
| /fila | promovida → odds |
| /simular | kickoff ou promovida → odds |
| /overview | kickoff |

**Problema:**
- Admin nao sabe o que esperar
- Dificil encontrar apostas especificas
- Falta agrupamento visual por dia

**Requisitos Funcionais:**

| ID | Requisito |
|----|-----------|
| FR-O1 | TODOS os comandos de listagem ordenam por: data ASC, odds DESC |
| FR-O2 | Listagens agrupam visualmente por dia (separador entre dias) |
| FR-O3 | TODOS os comandos de listagem tem paginacao |
| FR-O4 | Paginacao padrao: 10 itens por pagina |
| FR-O5 | Navegacao: `/comando pagina N` ou botoes inline |

**Query Padrao:**

```sql
SELECT * FROM suggested_bets
JOIN league_matches ON ...
WHERE ...
ORDER BY
  league_matches.kickoff_time ASC,  -- Data primeiro (mais proximo)
  suggested_bets.odds DESC           -- Depois maior odd
```

**Formato de Saida Padrao:**

```
📋 *APOSTAS DISPONIVEIS* (Pag 1/3)

━━━━ *HOJE - 13/01* ━━━━

1️⃣ #45 Liverpool vs Arsenal - 17:00
   🎯 Over 2.5 │ 📈 1.92 │ ✅ Pronto

2️⃣ #47 Real Madrid vs Barcelona - 21:00
   🎯 Ambas marcam │ 📈 1.85 │ ⚠️ Sem link

━━━━ *AMANHA - 14/01* ━━━━

3️⃣ #52 PSG vs Monaco - 16:00
   🎯 Over 1.5 │ 📈 1.75 │ ✅ Pronto

4️⃣ #58 Bayern vs Dortmund - 18:30
   🎯 BTTS │ 📈 1.68 │ ✅ Pronto

━━━━━━━━━━━━━━━━━━━━

📄 Pagina 1 de 3 │ Total: 28 apostas
💡 Use `/apostas 2` para proxima pagina
```

**Comandos Afetados:**

| Comando | Modificacao |
|---------|-------------|
| /apostas | Adicionar agrupamento por dia |
| /filtrar | Adicionar paginacao + agrupamento |
| /fila | Adicionar agrupamento por dia |
| /simular | Manter (ja limitado a 3) |
| /overview | Manter (resumo, nao lista) |

**Implementacao:**

1. Criar funcao helper `formatBetListWithDays(bets, page, pageSize)`
2. Aplicar em todos os handlers de listagem
3. Padronizar query ORDER BY em betService.js

---

## 5. Alertas de Atualizacao + Historico

### FEAT-014: Alertas de Novas Odds/Analises + Comando Historico

**Prioridade:** Media
**Categoria:** Visibilidade Admin

**Contexto:**

- Odds sao atualizadas 3x/dia (08:00, 13:00, 20:00)
- Analises (geracao de apostas) rodam para jogos novos
- Admin nao tem visibilidade do que foi atualizado
- Regra: NUNCA rodar analise para apostas que ja existem

**Requisitos Funcionais:**

| ID | Requisito |
|----|-----------|
| FR-A1 | Apos job de enrichOdds, enviar alerta com IDs atualizados |
| FR-A2 | Apos job de geracao de analises, enviar alerta com novos IDs |
| FR-A3 | Alerta mostra: ID, jogo, valor anterior → novo (para odds) |
| FR-A4 | Comando `/atualizados` lista todas atualizacoes recentes |
| FR-A5 | Comando `/atualizados` tem paginacao |
| FR-A6 | Historico mantem ultimas 48 horas de atualizacoes |
| FR-A7 | Analises NUNCA rodam para jogos que ja tem apostas geradas |

**Alerta de Odds Atualizadas:**

```
🔄 *ODDS ATUALIZADAS*

Job: Enrichment 13:00 ✅

*3 apostas atualizadas:*
#45 Liverpool vs Arsenal
    Over 2.5: 1.85 → 1.92 (+0.07)

#52 PSG vs Monaco
    Over 1.5: 1.60 → 1.68 (+0.08)

#58 Bayern vs Dortmund
    BTTS: 1.72 → 1.68 (-0.04)

💡 Use /atualizados para historico completo
```

**Alerta de Novas Analises:**

```
🆕 *NOVAS ANALISES GERADAS*

Job: Geracao 08:00 ✅

*4 novas apostas criadas:*
#61 Chelsea vs Tottenham (15/01)
    🎯 Over 2.5 │ ⚠️ Aguardando odds

#62 Inter vs Milan (15/01)
    🎯 BTTS │ ⚠️ Aguardando odds

#63 Benfica vs Porto (16/01)
    🎯 Over 1.5 │ ⚠️ Aguardando odds

#64 Ajax vs PSV (16/01)
    🎯 Ambas marcam │ ⚠️ Aguardando odds

💡 Odds serao buscadas no proximo enrichment
```

**Comando /atualizados:**

```
📜 *HISTORICO DE ATUALIZACOES* (Pag 1/2)

━━━━ *HOJE - 13/01* ━━━━

🕐 13:00 - Enrichment Odds
   #45, #52, #58 atualizadas

🕐 08:00 - Novas Analises
   #61, #62, #63, #64 criadas

🕐 08:00 - Enrichment Odds
   #45, #47, #52 atualizadas

━━━━ *ONTEM - 12/01* ━━━━

🕐 20:00 - Enrichment Odds
   #41, #42, #45 atualizadas

━━━━━━━━━━━━━━━━━━━━

📄 Pagina 1 de 2
💡 Use /atualizados 2 para mais
```

**Implementacao:**

1. **Tabela nova:** `odds_update_history`
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
   ```

2. **Modificar enrichOdds.js:** Registrar mudancas na tabela

3. **Modificar job de analises:** Registrar novas apostas

4. **Criar handler /atualizados:** Consultar historico com paginacao

5. **Enviar alertas:** Apos cada job, enviar resumo para admin group

---

## 6. Priorizacao Sugerida

### Sprint Imediata (Quick Wins)

| Item | Descricao | Esforco | Impacto |
|------|-----------|---------|---------|
| BUG-007 | /link 2 mensagens | Baixo | Alto |
| FEAT-013 | Ordenacao padronizada | Medio | Alto |

### Sprint 1 (Warns por Job)

| Item | Descricao | Esforco | Impacto |
|------|-----------|---------|---------|
| FEAT-011 | Warn apos cada job | Medio | Alto |
| FEAT-014 | Alertas de atualizacao + /atualizados | Medio | Medio |

### Sprint 2 (Scraping Odds - Antes das Postagens)

| Item | Descricao | Esforco | Impacto |
|------|-----------|---------|---------|
| FEAT-012 | Agente scraping (09:30, 14:30, 21:30) | Alto | Alto |

**Dependencias:**
- FEAT-011 (warns) deve ser feito ANTES de FEAT-012 (scraping)
- Scraping precisa chamar `sendScrapingWarn()` ao final
- Postagem precisa chamar `sendPostWarn()` ao final

---

## 7. Mapeamento para Epicos

### Epic 13: UX Admin e Visibilidade

**Objetivo:** Melhorar experiencia do admin nao-tecnico com informacoes claras e acoes obvias.

**Stories Propostas:**
1. 13-1: Corrigir bug /link duplo (BUG-007)
2. 13-2: Padronizar ordenacao data → odds com agrupamento por dia (FEAT-013)
3. 13-3: Adicionar paginacao em todos os comandos de listagem (FEAT-013)
4. 13-4: Criar jobWarn.js com funcoes de warn (FEAT-011)
5. 13-5: Integrar warns nos jobs de postagem (FEAT-011)
6. 13-6: Criar tabela odds_update_history (FEAT-014)
7. 13-7: Implementar comando /atualizados com paginacao (FEAT-014)

### Epic 14: Agente de Scraping para Odds (Antes das Postagens)

**Objetivo:** Garantir odds atualizadas buscando diretamente na Betano 30 min antes de cada postagem.

**Stories Propostas:**
1. 14-1: Criar scrapingOddsService.js com agente LLM
2. 14-2: Criar scrapingOdds.js job (09:30, 14:30, 21:30)
3. 14-3: Implementar cache por jogo (25 min TTL)
4. 14-4: Implementar fallback para The Odds API
5. 14-5: Integrar warn pos-scraping (sendScrapingWarn)
6. 14-6: Adicionar metricas de custo LLM
7. 14-7: Atualizar schedule em bot/server.js

---

## Aprovacao

| Papel | Nome | Data | Status |
|-------|------|------|--------|
| Product Owner | Marcelomendes | 2026-01-13 | ✅ Aprovado |

---

*Este documento sera atualizado conforme novos requisitos forem identificados.*
