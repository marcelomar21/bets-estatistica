# Story 11.1: Simplificar Estrutura de Pastas

Status: done

## Story

As a desenvolvedor,
I want estrutura de pastas mais organizada,
So that seja mais fácil de navegar e manter.

## Acceptance Criteria

1. **AC1:** Arquivos obsoletos são removidos
2. **AC2:** Arquivos temporários são ignorados pelo git
3. **AC3:** Scripts de teste organizados em pasta dedicada
4. **AC4:** Código duplicado removido (scheduler.js)
5. **AC5:** package.json corrigido e limpo
6. **AC6:** Documentação atualizada
7. **AC7:** Projeto funciona após reorganização

---

# ANÁLISE COMPLETA DO REPOSITÓRIO

## Inventário de Arquivos (78 arquivos analisados)

### ROOT (9 arquivos)

| Arquivo | Linhas | Propósito | Decisão |
|---------|--------|-----------|---------|
| `index.js` | 104 | Script ANTIGO de teste FootyStats API | **DELETAR** - código morto |
| `main.js` | 232 | Orquestrador pipeline IA (usa pg Pool direto) | **MOVER** → `agent/pipeline.js` |
| `analysis_output.json` | ~3000 | Output temporário do agente | **GITIGNORE + DELETAR** |
| `final_raw_data.json` | ~30000 | Output temporário do pipeline | **GITIGNORE + DELETAR** |
| `TODO.md` | 9 | TODOs antigos/obsoletos | **DELETAR** |
| `package.json` | 28 | Config npm - TEM ERROS | **CORRIGIR** |
| `render.yaml` | 47 | Config Render | **MANTER** |
| `README.md` | 338 | Documentação principal | **MANTER** |
| `README_agent.md` | 93 | Documentação do agente | **MANTER** |

### AGENT/ (15 arquivos)

| Arquivo | Linhas | Propósito | Decisão |
|---------|--------|-----------|---------|
| `db.js` | 14 | Shim → lib/db.js | **MANTER** |
| `tools.js` | 264 | Tools LangChain | **MANTER** |
| `analysis/prompt.js` | ? | Prompt do agente | **MANTER** |
| `analysis/runAnalysis.js` | 1276 | Core da análise IA | **MANTER** |
| `analysis/schema.js` | ? | Schema Zod | **MANTER** |
| `persistence/main.js` | 170 | Entry point persistência | **MANTER** |
| `persistence/saveOutputs.js` | 158 | Salva no DB | **MANTER** |
| `persistence/analysisParser.js` | ? | Parser de análise | **MANTER** |
| `persistence/reportService.js` | ? | Gera relatórios | **MANTER** |
| `persistence/reportUtils.js` | 120 | Utils relatórios | **MANTER** |
| `persistence/htmlRenderer.js` | 313 | Renderiza HTML | **MANTER** |
| `persistence/pdfGenerator.js` | 82 | Gera PDF com Puppeteer | **AVALIAR** - usa puppeteer |
| `persistence/generateReport.js` | ? | CLI gera relatório | **MANTER** |
| `persistence/generateMissingReports.js` | 95 | Gera relatórios faltantes | **MANTER** |
| `persistence/generateMarkdown.js` | ? | Gera markdown | **MANTER** |
| `shared/naming.js` | ? | Convenções de nomes | **MANTER** |

### BOT/ (16 arquivos)

| Arquivo | Linhas | Propósito | Decisão |
|---------|--------|-----------|---------|
| `index.js` | 116 | Entry point (polling/dev) | **MANTER** |
| `server.js` | 248 | Entry point (webhook/prod) - TEM SCHEDULER INTERNO | **MANTER** |
| `scheduler.js` | 144 | Scheduler standalone | **DELETAR** - duplicado do server.js |
| `telegram.js` | 199 | Cliente Telegram | **MANTER** |
| `handlers/adminGroup.js` | 739 | Handlers admin | **MANTER** |
| `jobs/postBets.js` | 339 | Job postar apostas | **MANTER** |
| `jobs/requestLinks.js` | 217 | Job pedir links | **MANTER** |
| `jobs/trackResults.js` | 224 | Job tracking | **MANTER** |
| `jobs/enrichOdds.js` | 363 | Job enriquecer odds | **MANTER** |
| `jobs/healthCheck.js` | 411 | Job health check | **MANTER** |
| `jobs/reminders.js` | 140 | Job lembretes | **MANTER** |
| `services/betService.js` | 851 | CRUD apostas | **MANTER** |
| `services/oddsService.js` | 619 | The Odds API | **MANTER** |
| `services/alertService.js` | 186 | Alertas admin | **MANTER** |
| `services/copyService.js` | 169 | Copy LLM | **MANTER** |
| `services/matchService.js` | 83 | Match queries | **MANTER** |
| `services/metricsService.js` | 169 | Métricas | **MANTER** |
| `services/marketInterpreter.js` | 293 | Interpreta mercados | **MANTER** |

### LIB/ (4 arquivos)

| Arquivo | Linhas | Propósito | Decisão |
|---------|--------|-----------|---------|
| `db.js` | 131 | **FONTE ÚNICA** PostgreSQL Pool | **MANTER** |
| `supabase.js` | 64 | Cliente REST Supabase | **MANTER** |
| `logger.js` | ? | Logging centralizado | **MANTER** |
| `config.js` | ? | Configurações | **MANTER** |

### SCRIPTS/ (25 arquivos)

| Arquivo | Linhas | Tipo | Decisão |
|---------|--------|------|---------|
| `lib/db.js` | 14 | Shim | **MANTER** |
| `lib/matchScreening.js` | 351 | Lib ETL | **MANTER** |
| `pipeline.js` | 260 | Pipeline unificado | **MANTER** |
| `daily_update.js` | 1047 | ETL diário | **MANTER** |
| `check_analysis_queue.js` | 174 | Verifica fila | **MANTER** |
| `syncSeasons.js` | 341 | Sync temporadas | **MANTER** |
| `loadCountries.js` | 103 | Carrega países | **MANTER** |
| `loadLeagueSeasons.js` | 105 | Carrega seasons | **MANTER** |
| `loadLeagueMatches.js` | 174 | Carrega partidas | **MANTER** |
| `loadLeaguePlayers.js` | 153 | Carrega jogadores | **MANTER** |
| `loadLeagueTeamStats.js` | 188 | Carrega stats times | **MANTER** |
| `loadMatchDetails.js` | 328 | Carrega detalhes | **MANTER** |
| `loadLastX.js` | 188 | Carrega últimos jogos | **MANTER** |
| `fetchLeagues.js` | 155 | Busca ligas API | **MANTER** |
| `fetchLeagueMatches.js` | 156 | Busca partidas API | **MANTER** |
| `fetchLeaguePlayers.js` | 112 | Busca jogadores API | **MANTER** |
| `fetchLeagueTeams.js` | 179 | Busca times API | **MANTER** |
| `fetchLastX.js` | ? | Busca últimos API | **MANTER** |
| `fetchMatchDetails.js` | ? | Busca detalhes API | **MANTER** |
| `analyze_raw.js` | 87 | Debug de JSON raw | **MOVER** → tests/ |
| `resetAndEnrich.js` | ? | Reset + enrich | **MANTER** |
| `resetPosted.js` | ? | Reset posted | **MANTER** |
| `run-migration.js` | ? | Roda migrations | **MANTER** |
| **TESTES:** | | |
| `test-bet-matching.js` | 183 | Teste matching | **MOVER** → tests/ |
| `test-bot-flow.js` | 108 | Teste bot flow | **MOVER** → tests/ |
| `test-market-interpreter.js` | ? | Teste interpreter | **MOVER** → tests/ |
| `test-odds-api.js` | 147 | Teste odds API | **MOVER** → tests/ |
| `test-production-flow.js` | 192 | Teste prod flow | **MOVER** → tests/ |
| `test-supabase.js` | ? | Teste supabase | **MOVER** → tests/ |
| `test-telegram.js` | ? | Teste telegram | **MOVER** → tests/ |
| `debug-bets.js` | 104 | Debug apostas | **MOVER** → tests/ |

### SQL/ (3 arquivos)

| Arquivo | Propósito | Decisão |
|---------|-----------|---------|
| `agent_schema.sql` | Schema do agente | **MANTER** |
| `league_schema.sql` | Schema das ligas | **MANTER** |
| `migrations/001_initial_schema.sql` | Migration inicial | **MANTER** |

### DOCS/ (7 arquivos)

| Arquivo | Propósito | Decisão |
|---------|-----------|---------|
| `index.md` | Índice docs | **MANTER** |
| `architecture.md` | Arquitetura | **MANTER** |
| `data-models.md` | Modelos de dados | **MANTER** |
| `development-guide.md` | Guia dev | **MANTER** |
| `project-overview.md` | Overview | **MANTER** |
| `source-tree-analysis.md` | Análise estrutura | **ATUALIZAR** |
| `project-scan-report.json` | Temp scan | **GITIGNORE + DELETAR** |

---

# PROPOSTA DE REORGANIZAÇÃO

## 1. DELETAR (código morto/obsoleto)

| Arquivo | Motivo |
|---------|--------|
| `/index.js` | Script antigo de teste. Não é usado. `package.json` aponta para ele erroneamente. |
| `/TODO.md` | TODOs obsoletos de 2024 |
| `/bot/scheduler.js` | **DUPLICADO** - mesma lógica já existe dentro de `server.js` (linhas 117-208) |
| `/agent/persistence/pdfGenerator.js` | **DEPRECADO** - funcionalidade não usada |
| `/analysis_output.json` | Arquivo temporário gerado pelo agente |
| `/final_raw_data.json` | Arquivo temporário do pipeline |
| `/docs/project-scan-report.json` | Arquivo temporário do scan |

## 2. MOVER (reorganização)

| Arquivo | De | Para | Motivo |
|---------|-----|------|--------|
| `main.js` | `/main.js` | `/agent/pipeline.js` | Orquestrador do pipeline de análise. Pertence ao módulo agent/. Renomear para `pipeline.js` para clareza. |

## 3. CRIAR PASTA + MOVER TESTES

Criar `/scripts/tests/` e mover:

```
scripts/test-bet-matching.js      → scripts/tests/
scripts/test-bot-flow.js          → scripts/tests/
scripts/test-market-interpreter.js → scripts/tests/
scripts/test-odds-api.js          → scripts/tests/
scripts/test-production-flow.js   → scripts/tests/
scripts/test-supabase.js          → scripts/tests/
scripts/test-telegram.js          → scripts/tests/
scripts/debug-bets.js             → scripts/tests/
scripts/analyze_raw.js            → scripts/tests/
```

## 4. ATUALIZAR .gitignore

Adicionar:
```
# Temporary JSON outputs
analysis_output.json
final_raw_data.json
docs/project-scan-report.json
```

## 5. CORRIGIR package.json

**Problemas encontrados:**
1. `"main": "index.js"` aponta para arquivo que será deletado
2. Tem `puppeteer` como dependência (deveria ser removido per project-context.md)

**Correções:**
```json
{
  "main": "bot/server.js",  // Entry point real do projeto
  // Remover puppeteer das dependencies
}
```

**Nota sobre Puppeteer:** O arquivo `agent/persistence/pdfGenerator.js` usa puppeteer para gerar PDFs. Precisa decidir:
- Opção A: Manter puppeteer e o gerador de PDF
- Opção B: Remover puppeteer e desativar geração de PDF (usar apenas HTML)

## 6. ATUALIZAR DOCUMENTAÇÃO

- `docs/source-tree-analysis.md` - Refletir nova estrutura
- `_bmad-output/project-context.md` - Atualizar File Structure Reference

---

# ESTRUTURA FINAL PROPOSTA

```
bets-estatistica/
├── .gitignore              # Atualizado com temporários
├── .env.example
├── package.json            # Corrigido main + deps
├── package-lock.json
├── render.yaml
├── README.md
├── README_agent.md
│
├── agent/                  # Módulo de análise IA
│   ├── pipeline.js         # <- MOVIDO de /main.js (orquestrador)
│   ├── db.js               # Shim → lib/db.js
│   ├── tools.js
│   ├── analysis/
│   │   ├── runAnalysis.js
│   │   ├── prompt.js
│   │   └── schema.js
│   ├── persistence/
│   │   ├── main.js
│   │   ├── saveOutputs.js
│   │   ├── analysisParser.js
│   │   ├── reportService.js
│   │   ├── reportUtils.js
│   │   ├── htmlRenderer.js
│   │   ├── pdfGenerator.js     # Depende de puppeteer
│   │   ├── generateReport.js
│   │   ├── generateMissingReports.js
│   │   └── generateMarkdown.js
│   └── shared/
│       └── naming.js
│
├── bot/                    # Módulo Telegram Bot
│   ├── index.js            # Entry point (polling/dev)
│   ├── server.js           # Entry point (webhook/prod) + scheduler interno
│   ├── telegram.js
│   ├── handlers/
│   │   └── adminGroup.js
│   ├── jobs/
│   │   ├── postBets.js
│   │   ├── requestLinks.js
│   │   ├── trackResults.js
│   │   ├── enrichOdds.js
│   │   ├── healthCheck.js
│   │   └── reminders.js
│   └── services/
│       ├── betService.js
│       ├── oddsService.js
│       ├── alertService.js
│       ├── copyService.js
│       ├── matchService.js
│       ├── metricsService.js
│       └── marketInterpreter.js
│
├── lib/                    # Bibliotecas compartilhadas
│   ├── db.js               # PostgreSQL Pool (fonte única)
│   ├── supabase.js         # Cliente REST Supabase
│   ├── logger.js
│   └── config.js
│
├── scripts/                # ETL e manutenção
│   ├── lib/
│   │   ├── db.js           # Shim → lib/db.js
│   │   └── matchScreening.js
│   ├── tests/              # <- NOVA PASTA
│   │   ├── test-bet-matching.js
│   │   ├── test-bot-flow.js
│   │   ├── test-market-interpreter.js
│   │   ├── test-odds-api.js
│   │   ├── test-production-flow.js
│   │   ├── test-supabase.js
│   │   ├── test-telegram.js
│   │   ├── debug-bets.js
│   │   └── analyze_raw.js
│   ├── pipeline.js
│   ├── daily_update.js
│   ├── check_analysis_queue.js
│   ├── syncSeasons.js
│   ├── loadCountries.js
│   ├── loadLeagueSeasons.js
│   ├── loadLeagueMatches.js
│   ├── loadLeaguePlayers.js
│   ├── loadLeagueTeamStats.js
│   ├── loadMatchDetails.js
│   ├── loadLastX.js
│   ├── fetchLeagues.js
│   ├── fetchLeagueMatches.js
│   ├── fetchLeaguePlayers.js
│   ├── fetchLeagueTeams.js
│   ├── fetchLastX.js
│   ├── fetchMatchDetails.js
│   ├── resetAndEnrich.js
│   ├── resetPosted.js
│   └── run-migration.js
│
├── sql/
│   ├── agent_schema.sql
│   ├── league_schema.sql
│   └── migrations/
│       └── 001_initial_schema.sql
│
└── docs/
    ├── index.md
    ├── architecture.md
    ├── data-models.md
    ├── development-guide.md
    ├── project-overview.md
    └── source-tree-analysis.md  # Atualizar
```

---

# RESUMO DE MUDANÇAS

| Categoria | Quantidade | Arquivos |
|-----------|------------|----------|
| **DELETAR** | 6 | index.js, TODO.md, scheduler.js, + 3 JSONs temporários |
| **MOVER** | 10 | main.js → agent/, 9 test scripts → tests/ |
| **CRIAR** | 1 | scripts/tests/ |
| **CORRIGIR** | 1 | package.json |
| **ATUALIZAR** | 3 | .gitignore, source-tree-analysis.md, project-context.md |
| **MANTER** | ~60 | Todo o resto |

---

## Tasks / Subtasks

- [x] **Task 1: Deletar arquivos obsoletos** (AC: #1) ✅
  - [x] 1.1 Deletar `/index.js`
  - [x] 1.2 Deletar `/TODO.md`
  - [x] 1.3 Deletar `/bot/scheduler.js`
  - [x] 1.4 Deletar `/agent/persistence/pdfGenerator.js`
  - [x] 1.5 Deletar `/analysis_output.json`
  - [x] 1.6 Deletar `/final_raw_data.json`
  - [x] 1.7 Deletar `/docs/project-scan-report.json`

- [x] **Task 2: Atualizar .gitignore** (AC: #2) ✅
  - [x] 2.1 Adicionar `analysis_output.json`
  - [x] 2.2 Adicionar `final_raw_data.json`
  - [x] 2.3 Adicionar `docs/project-scan-report.json`

- [x] **Task 3: Mover main.js** (AC: #4) ✅
  - [x] 3.1 Mover `/main.js` → `/agent/pipeline.js`
  - [x] 3.2 Atualizar `ROOT_DIR` de `__dirname` para `path.join(__dirname, '..')`
  - [x] 3.3 Testar: `node -c agent/pipeline.js` - sintaxe OK

- [x] **Task 4: Organizar scripts de teste** (AC: #3) ✅
  - [x] 4.1 Criar pasta `scripts/tests/`
  - [x] 4.2 Mover 9 arquivos test/debug para `scripts/tests/`
  - [x] 4.3 Verificar se algum script referencia os arquivos movidos - nenhum

- [x] **Task 5: Corrigir package.json** (AC: #5) ✅
  - [x] 5.1 Mudar `"main"` de `"index.js"` para `"bot/server.js"`
  - [x] 5.2 Remover `puppeteer` das dependencies
  - [x] 5.3 Adicionar npm scripts (start, dev, pipeline)

- [x] **Task 6: Atualizar documentação** (AC: #6) ✅
  - [x] 6.1 Atualizar `docs/source-tree-analysis.md`
  - [x] 6.2 Atualizar `_bmad-output/project-context.md`

- [x] **Task 7: Validar funcionamento** (AC: #7) ✅
  - [x] 7.1 `node -c bot/server.js` - sintaxe OK
  - [x] 7.2 `node -c agent/pipeline.js` - sintaxe OK
  - [x] 7.3 `node -c agent/persistence/reportService.js` - sintaxe OK

---

## Dev Notes

### Sobre Puppeteer

~~O `agent/persistence/pdfGenerator.js` usa puppeteer para converter HTML em PDF.~~

**DECISÃO:** Remover puppeteer e pdfGenerator.js - funcionalidade deprecada e não usada (confirmado pelo usuário em 2026-01-12).

### Por que scheduler.js é duplicado?

O `bot/server.js` já contém toda a lógica de scheduling nas linhas 117-208 (função `setupScheduler()`). O arquivo `bot/scheduler.js` é uma versão standalone que faz exatamente a mesma coisa, mas não é usado em produção (Render usa server.js).

### Sobre lib/db.js vs lib/supabase.js

Não são duplicados! Têm propósitos diferentes:
- `lib/db.js` = PostgreSQL Pool via `pg` (usado por agent e scripts para queries SQL complexas)
- `lib/supabase.js` = Cliente REST Supabase (usado pelo bot para operações CRUD simples)

Os shims `agent/db.js` e `scripts/lib/db.js` apenas re-exportam `lib/db.js` para compatibilidade de imports.

---

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Analysis Date

2026-01-12

### Files Analyzed

78 arquivos em 7 módulos

### Debug Log References

_(To be filled during implementation)_

### Completion Notes List

1. Deleted 7 obsolete files (index.js, TODO.md, scheduler.js, pdfGenerator.js, 3 temp JSONs)
2. Updated reportService.js to remove pdfGenerator import before deleting
3. Moved main.js to agent/pipeline.js with ROOT_DIR fix
4. Created scripts/tests/ and moved 9 test files
5. Fixed package.json: main entry point, removed puppeteer, added npm scripts
6. Updated docs/source-tree-analysis.md with complete new structure
7. Updated project-context.md File Structure Reference section
8. All syntax checks passed

### File List

**DELETED:**
- `/index.js`
- `/TODO.md`
- `/bot/scheduler.js`
- `/agent/persistence/pdfGenerator.js`
- `/analysis_output.json`
- `/final_raw_data.json`
- `/docs/project-scan-report.json`

**CREATED:**
- `/agent/pipeline.js` (moved from main.js)
- `/scripts/tests/` directory

**MOVED TO scripts/tests/:**
- test-bet-matching.js
- test-bot-flow.js
- test-market-interpreter.js
- test-odds-api.js
- test-production-flow.js
- test-supabase.js
- test-telegram.js
- debug-bets.js
- analyze_raw.js

**MODIFIED:**
- `/package.json`
- `/.gitignore`
- `/agent/persistence/reportService.js`
- `/docs/source-tree-analysis.md`
- `/_bmad-output/project-context.md`
