---
title: 'Geração de PDFs de Análise por Jogo para TV'
slug: 'pdf-analise-jogo-tv'
created: '2026-02-06'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['html-pdf-node', 'node.js', 'postgresql', 'jest']
files_to_modify: ['scripts/generateTeamPdfs.js (NEW)', 'agent/persistence/reportService.js (MODIFY)', 'agent/persistence/reportUtils.js (MODIFY)']
code_patterns: ['service-response-pattern', 'logger-pattern', 'supabase-access', 'htmlRenderer-payload-format', 'naming-convention']
test_patterns: ['jest', '__tests__/ directory']
---

# Tech-Spec: Geração de PDFs de Análise por Jogo para TV

**Created:** 2026-02-06

## Overview

### Problem Statement

Influencer precisa de PDFs profissionais com análises de jogos para apresentar na TV. O sistema já gera relatórios HTML completos com análise LLM e apostas sugeridas, mas a conversão HTML→PDF foi removida (puppeteer deprecado). É necessário gerar PDFs sob demanda para os próximos jogos de 6 times específicos (4 do Rio + 2 do Paraná), usando exclusivamente dados já disponíveis no banco de dados.

### Solution

Criar um script CLI que: (1) consulta o BD para encontrar o próximo jogo de cada time solicitado, (2) busca a análise e apostas associadas, (3) gera HTML usando o `htmlRenderer` existente, e (4) converte pra PDF usando `html-pdf-node` (lib leve). O layout deve ser profissional — vai pra TV.

### Scope

**In Scope:**
- Instalar `html-pdf-node` como dependência
- Script CLI para gerar PDFs filtrados por time
- 6 times alvo: Flamengo, Vasco, Botafogo, Fluminense, Athletico PR, Coritiba
- Query ao BD: `league_matches` + `game_analysis` + `suggested_bets`
- Conversão HTML→PDF com qualidade profissional
- Saída em `data/relatorios/pdf/`

**Out of Scope:**
- Chamadas a APIs externas (FootyStats, The Odds API)
- Mudanças no pipeline de análise LLM existente
- Automação contínua (geração é pontual, sob demanda)
- Redesign do template HTML existente (aproveitar o que já existe)

## Context for Development

### Codebase Patterns

- Usar `{ success, data/error }` response pattern em todas as funções
- Logging via `require('../lib/logger')` — nunca `console.log` em produção
- Supabase client via `require('../lib/supabase')` — nunca instanciar direto
- Dados de análise em `game_analysis.analysis_json` (payload completo JSONB)
- Apostas em `suggested_bets` com `bet_category` = 'SAFE' ou 'OPORTUNIDADE'
- Script CLI standalone: usar `console.log`/`console.error` (scripts utilitários não usam logger)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `agent/persistence/htmlRenderer.js` | `renderHtmlReport(payload)` — recebe payload, retorna HTML string completo |
| `agent/persistence/reportService.js` | `generateReportForMatch({ matchId, payload })` — orquestra HTML (adicionar PDF) |
| `agent/persistence/reportUtils.js` | `resolveReportPaths(payload)` → `{ htmlPath, pdfPath }`, `REPORTS_PDF_DIR` |
| `agent/persistence/analysisParser.js` | `extractSections(text)` → `{ analysis, safe, opportunities }` |
| `agent/persistence/generateReport.js` | Entry point CLI existente — modelo para o novo script |
| `agent/shared/naming.js` | `buildReportBaseName()` — naming convention para arquivos |
| `lib/supabase.js` | Cliente Supabase (DB access) |
| `scripts/syncSeasons.js` | Referência de script CLI standalone com DB pool |

### Technical Decisions

- **html-pdf-node** escolhido por ser leve (~2MB vs ~400MB do puppeteer). Usa puppeteer-core internamente mas com Chromium bundled menor.
- Reutilizar `htmlRenderer.renderHtmlReport()` — não reinventar o template
- Script standalone em `scripts/` — padrão do projeto para scripts utilitários
- Buscar payload de `game_analysis.analysis_json` (JSONB) direto do BD — não depender de JSONs intermediários em disco
- Filtro por time usa `home_team_name ILIKE` / `away_team_name ILIKE` em `league_matches`
- JOIN com `league_seasons` para obter `league_name` e `country`
- `resolveReportPaths()` já calcula o caminho PDF em `data/relatorios/pdf/`
- Naming segue `YYYY_MM_DD_Competition_Home_x_Away.pdf` via `buildReportBaseName()`

## Implementation Plan

### Tasks

- [x] Task 1: Instalar `html-pdf-node`
  - File: `package.json`
  - Action: `npm install html-pdf-node`
  - Notes: Verificar se instala corretamente e não conflita com deps existentes

- [x] Task 2: Adicionar função `generatePdfFromHtml()` no `reportService.js`
  - File: `agent/persistence/reportService.js`
  - Action: Criar função que recebe HTML string e retorna Buffer PDF usando `html-pdf-node`
  - Notes: Configurar opções de PDF para qualidade profissional:
    - `format: 'A4'`
    - `printBackground: true` (preservar cores/backgrounds do CSS)
    - `margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }`
  - Atualizar `generateReportForMatch()` para também gerar PDF (substituir `pdfPath: null`)

- [x] Task 3: Garantir diretório PDF em `reportUtils.js`
  - File: `agent/persistence/reportUtils.js`
  - Action: Adicionar `REPORTS_PDF_DIR` no `ensureReportDirs()` (hoje só garante HTML dir)
  - Notes: `ensureDirectory(REPORTS_PDF_DIR)` antes de salvar

- [x] Task 4: Criar script CLI `scripts/generateTeamPdfs.js`
  - File: `scripts/generateTeamPdfs.js` (NEW)
  - Action: Script principal que:
    1. Define mapa de times alvo com variações de nome para matching
    2. Aceita argumentos CLI: `node scripts/generateTeamPdfs.js [time1] [time2] ...`
       - Sem args = gerar para todos os 6 times
       - Com args = gerar só para os times especificados (match parcial, case-insensitive)
    3. Para cada time, executa query no BD:
       ```sql
       SELECT lm.match_id, lm.home_team_name, lm.away_team_name,
              lm.kickoff_time, lm.status, lm.venue,
              ls.league_name, ls.country,
              ga.analysis_json
       FROM league_matches lm
       JOIN league_seasons ls ON lm.season_id = ls.season_id
       JOIN game_analysis ga ON lm.match_id = ga.match_id
       WHERE (lm.home_team_name ILIKE $1 OR lm.away_team_name ILIKE $1)
         AND lm.kickoff_time >= NOW()
       ORDER BY lm.kickoff_time ASC
       LIMIT 1;
       ```
    4. Reconstitui payload a partir de `analysis_json` (já é o payload completo)
    5. Chama `renderHtmlReport(payload)` → HTML
    6. Chama `generatePdfFromHtml(html)` → Buffer
    7. Resolve path via `resolveReportPaths(payload)` → `pdfPath`
    8. Salva HTML + PDF
    9. Imprime resumo no console
  - Notes:
    - Mapa de times com variações de nome:
      ```javascript
      const TARGET_TEAMS = {
        'Flamengo':     '%Flamengo%',
        'Vasco':        '%Vasco%',
        'Botafogo':     '%Botafogo%',
        'Fluminense':   '%Fluminense%',
        'Athletico PR': '%Athletico%Paranaense%',
        'Coritiba':     '%Coritiba%',
      };
      ```
    - Atenção: nomes no BD podem ser "Athletico Paranaense" (não "Athletico PR")
    - Se não encontrar próximo jogo com análise, logar warning e pular
    - Usar `getPool()` do `scripts/lib/db.js` (padrão dos scripts)
    - Fechar pool no finally com `closePool()`

- [x] Task 5: Teste manual end-to-end
  - Action: Rodar `node scripts/generateTeamPdfs.js Flamengo` e verificar:
    - PDF gerado em `data/relatorios/pdf/`
    - PDF abre corretamente
    - Layout profissional preservado (cores, fontes, grid)
    - Todas as seções presentes (header, contexto, análise, apostas)
  - Notes: Se layout não ficar bom no PDF, ajustar opções do html-pdf-node (margins, scale)

### Acceptance Criteria

- [x] AC 1: Given a team name as CLI arg, when running `node scripts/generateTeamPdfs.js Flamengo`, then a PDF is generated in `data/relatorios/pdf/` with the next match analysis for Flamengo
- [x] AC 2: Given no CLI args, when running `node scripts/generateTeamPdfs.js`, then PDFs are generated for all 6 target teams (Flamengo, Vasco, Botafogo, Fluminense, Athletico PR, Coritiba)
- [x] AC 3: Given a team with no upcoming analyzed match, when running the script, then a warning is logged and the team is skipped without error
- [x] AC 4: Given the generated PDF, when opened in a PDF viewer, then the layout matches the HTML report quality — headers, context grid, analysis text, and bet sections are all properly formatted
- [x] AC 5: Given the generated PDF, when checking the filename, then it follows the existing naming convention `YYYY_MM_DD_Competition_Home_x_Away.pdf`
- [x] AC 6: Given `generateReportForMatch()` is called, when a match payload is provided, then both HTML and PDF files are generated (PDF no longer returns null)

## Additional Context

### Dependencies

- `html-pdf-node` — conversão HTML→PDF (instalar via npm)
- Dados no BD: `league_matches`, `game_analysis`, `league_seasons` devem estar populados
- Análises LLM já devem ter sido geradas para os jogos (pipeline existente)

### Testing Strategy

- **Teste manual primário:** Rodar script pra 1 time, abrir PDF e validar qualidade visual
- **Teste de variações:** Rodar sem args (todos os 6 times) e verificar output
- **Teste de edge case:** Rodar com time sem jogo analisado — deve pular sem crash
- **Teste de integração (opcional):** Verificar que `generateReportForMatch()` agora retorna `pdfPath` não-null

### Notes

- **Risco:** `html-pdf-node` usa puppeteer-core por baixo. Se houver problemas de instalação (Chromium), alternativa é usar `pdf-lib` pra gerar PDF do zero ou voltar ao puppeteer full
- **Nomes no BD:** Verificar exatamente como os times aparecem no BD antes de fixar o mapa de ILIKE patterns. Pode ser "CR Flamengo", "Athletico Paranaense", etc.
- **Competições futuras:** Libertadores e Copa do Brasil não estão no `TARGET_LEAGUES` do sync. Jogos dessas competições só terão análise se forem adicionados ao pipeline. Isso está fora de escopo desta spec.
- Times alvo com competições esperadas:
  - **Flamengo**: Carioca, Brasileirão Série A, Libertadores, Copa do Brasil
  - **Vasco**: Carioca, Brasileirão Série A, Sul-Americana, Copa do Brasil
  - **Botafogo**: Carioca, Brasileirão Série A, Libertadores, Copa do Brasil
  - **Fluminense**: Carioca, Brasileirão Série A, Libertadores, Copa do Brasil
  - **Athletico PR**: Campeonato PR, Brasileirão Série A
  - **Coritiba**: Campeonato PR, Brasileirão Série A
- PDFs legados existem em `data/relatorios/pdf/` (52 arquivos) — manter padrão de naming

## Review Notes
- Adversarial review completed (15 findings)
- Findings: 15 total, 4 fixed (auto-fix), 11 skipped (noise/undecided)
- Resolution approach: auto-fix
- Fixes aplicados: timeout 60s no PDF generation (F11), validação do buffer PDF (F2), try-catch em generatePdfFromHtml (F1), resumo de erros no script CLI (F10)
