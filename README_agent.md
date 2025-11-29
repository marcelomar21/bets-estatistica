# Agente de Apostas com LangChain

Este módulo adiciona dois processos Node.js para gerar análises estruturadas de partidas e persistir os resultados em Markdown e no banco Postgres.

## Pré-requisitos
- Node.js 20+
- Postgres acessível com os esquemas `league_*`, `stats_match_details` e `team_lastx_stats` populados.
- Variáveis de ambiente configuradas (`.env`), em especial:
  - `OPENAI_API_KEY` (ou `openai_api_key`) para o modelo `gpt-5-nano`.
  - `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD` conforme o banco local.

Instale as dependências:

```bash
cd /Users/marcelomendes/Projetos/bets-estatistica
npm install
```

## Estrutura
- `agent/analysis/runAnalysis.js`: gera o JSON intermediário usando LangChain + ferramenta SQL.
- `agent/analysis/schema.js`: esquema Zod esperado do modelo.
- `agent/analysis/prompt.js`: prompt PT-BR base.
- `agent/persistence/generateMarkdown.js`: monta o texto final.
- `agent/persistence/saveOutputs.js`: escreve Markdown e insere em `game_analysis`/`suggested_bets`.
- `agent/persistence/main.js`: CLI do processo 2.
- `data/analises_intermediarias/`: saídas JSON.
- `data/analises_finais/`: arquivos Markdown finais.

## Pipeline diário
1. `node scripts/daily_update.js` – garante dados atualizados nas tabelas de suporte.
2. `node agent/analysis/runAnalysis.js <match_id>` – gera `data/analises_intermediarias/<match_id>.json`.
3. `node agent/persistence/main.js <match_id>` – produz o Markdown final e atualiza Postgres.

## Execução manual (exemplo com match_id 7834664)
```bash
node agent/analysis/runAnalysis.js 7834664
node agent/persistence/main.js 7834664
```

Após o segundo comando, verifique:
- `data/analises_intermediarias/7834664.json`
- `data/analises_finais/<campeonato>_<home>vs<away>_<data>.md`
- Linhas em `game_analysis` e `suggested_bets`.

## Dicas e resolução de problemas
- Caso o agente solicite SQL adicionais, os logs mostrarão `pg_select_reader`.
- Se o modelo não finalizar em até `AGENT_MAX_STEPS` (default 6), aumente `AGENT_MAX_STEPS` via ambiente.
- Ajuste `AGENT_TEMPERATURE`, `AGENT_MAX_TOKENS` e `AGENT_TIMEOUT_MS` conforme necessário.
- Certifique-se de executar `psql -f sql/agent_schema.sql` sempre que o schema for alterado.


