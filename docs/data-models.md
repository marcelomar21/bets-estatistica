# Bets Estatística - Modelos de Dados

## Visão Geral

O sistema utiliza PostgreSQL com dois schemas principais:
- **league_schema.sql** - Dados esportivos (ligas, partidas, times, jogadores)
- **agent_schema.sql** - Dados do agente de análise (análises, apostas, fila)

## Diagrama ER Simplificado

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ league_seasons  │───┬──▶│ league_matches  │◀──────│ stats_match_    │
│                 │   │   │                 │       │ details         │
│ season_id (PK)  │   │   │ match_id (PK)   │       │                 │
│ league_name     │   │   │ season_id (FK)  │       │ match_id (FK)   │
│ country         │   │   │ home_team_id    │       │ raw_payload     │
│ season_year     │   │   │ away_team_id    │       │ ordered_stats   │
└─────────────────┘   │   │ kickoff_time    │       └─────────────────┘
                      │   └────────┬────────┘
                      │            │
                      │            ▼
                      │   ┌─────────────────┐       ┌─────────────────┐
                      │   │ game_analysis   │       │ suggested_bets  │
                      │   │                 │       │                 │
                      │   │ match_id (FK)   │       │ match_id (FK)   │
                      │   │ analysis_md     │       │ bet_market      │
                      │   │ analysis_json   │       │ bet_pick        │
                      │   └─────────────────┘       │ confidence      │
                      │                             └─────────────────┘
                      │
                      │   ┌─────────────────┐       ┌─────────────────┐
                      ├──▶│ league_team_    │       │ team_lastx_     │
                      │   │ stats           │       │ stats           │
                      │   │                 │       │                 │
                      │   │ season_id (FK)  │       │ team_id         │
                      │   │ team_id         │       │ window_scope    │
                      │   │ stats (JSONB)   │       │ last_x_match_num│
                      │   └─────────────────┘       │ raw_payload     │
                      │                             └─────────────────┘
                      │
                      │   ┌─────────────────┐       ┌─────────────────┐
                      └──▶│ league_players  │       │ match_analysis_ │
                          │                 │       │ queue           │
                          │ season_id (FK)  │       │                 │
                          │ player_id       │       │ match_id (FK)   │
                          │ full_name       │       │ status          │
                          │ position        │       │ error_reason    │
                          └─────────────────┘       └─────────────────┘
```

## Tabelas de Dados Esportivos (league_schema.sql)

### league_seasons
Armazena temporadas de ligas disponíveis.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL | PK interna |
| season_id | INTEGER | ID único da temporada (API) |
| league_name | TEXT | Nome da liga |
| country | TEXT | País |
| display_name | TEXT | Nome de exibição |
| season_year | INTEGER | Ano da temporada |
| raw_league | JSONB | Payload completo da API |
| active | BOOLEAN | Se está ativa |

### league_matches
Partidas de cada temporada.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL | PK interna |
| match_id | BIGINT | ID único da partida (API) |
| season_id | INTEGER | FK para league_seasons |
| home_team_id | INTEGER | ID do time da casa |
| away_team_id | INTEGER | ID do time visitante |
| home_team_name | TEXT | Nome do time da casa |
| away_team_name | TEXT | Nome do time visitante |
| home_score | INTEGER | Gols do mandante |
| away_score | INTEGER | Gols do visitante |
| status | TEXT | Status (complete, incomplete, etc) |
| game_week | INTEGER | Rodada |
| kickoff_time | TIMESTAMPTZ | Horário do jogo |
| venue | TEXT | Estádio |
| raw_match | JSONB | Payload completo |

**View:** `league_matches_br` - Adiciona coluna `kickoff_time_br` com timezone Brasil (UTC-3)

### league_players
Jogadores de cada temporada.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL | PK interna |
| season_id | INTEGER | FK para league_seasons |
| player_id | INTEGER | ID único do jogador |
| full_name | TEXT | Nome completo |
| position | TEXT | Posição |
| club_team_id | INTEGER | ID do time atual |
| goals_overall | INTEGER | Gols na temporada |
| assists_overall | INTEGER | Assistências |
| cards_overall | INTEGER | Total de cartões |
| raw_player | JSONB | Payload completo |

### league_team_stats
Estatísticas de times por temporada.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL | PK interna |
| season_id | INTEGER | FK para league_seasons |
| team_id | INTEGER | ID do time |
| team_name | TEXT | Nome do time |
| table_position | INTEGER | Posição na tabela |
| fetched_at | TIMESTAMPTZ | Quando foi buscado |
| stats | JSONB | Estatísticas detalhadas |
| raw_team | JSONB | Payload completo |

### stats_match_details
Estatísticas detalhadas de partidas (xG, chutes, posse, etc).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL | PK interna |
| match_id | BIGINT | FK para league_matches |
| season_id | INTEGER | FK para league_seasons |
| home_team_id | INTEGER | ID do mandante |
| away_team_id | INTEGER | ID do visitante |
| referee | TEXT | Árbitro |
| venue | TEXT | Estádio |
| attendance | INTEGER | Público |
| raw_payload | JSONB | Payload completo da API |
| ordered_stats | JSONB | Estatísticas estruturadas |

**Trigger:** `trg_sync_stats_match_details` - Sincroniza score/status quando league_matches é atualizado.

### team_lastx_stats
Forma recente dos times (últimos X jogos).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL | PK interna |
| team_id | INTEGER | ID do time |
| team_name | TEXT | Nome do time |
| window_scope | TEXT | Escopo (overall, home, away) |
| last_x_match_num | INTEGER | Quantidade de jogos (5, 10, etc) |
| last_updated_match_timestamp | BIGINT | Timestamp do último jogo |
| raw_payload | JSONB | Payload completo |
| ordered_stats | JSONB | Estatísticas estruturadas |

**Constraint:** `uq_team_lastx` (team_id, window_scope, last_x_match_num)

### countries
Tabela auxiliar de países.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| source_id | INTEGER | ID da fonte |
| iso | TEXT | Código ISO |
| name_en | TEXT | Nome em inglês |
| translations | JSONB | Traduções |

## Tabelas do Agente (agent_schema.sql)

### game_analysis
Análises geradas pelo agente IA.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL | PK interna |
| match_id | BIGINT | FK para league_matches (UNIQUE) |
| analysis_md | TEXT | Análise em Markdown |
| analysis_json | JSONB | Análise estruturada |
| created_at | TIMESTAMPTZ | Data de criação |
| updated_at | TIMESTAMPTZ | Data de atualização |

### suggested_bets
Apostas sugeridas pelo agente.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | BIGSERIAL | PK interna |
| match_id | BIGINT | FK para league_matches |
| bet_market | TEXT | Mercado (gols, cartões, etc) |
| bet_pick | TEXT | Seleção específica |
| odds | NUMERIC | Odds (se disponível) |
| confidence | NUMERIC | Confiança (0-1) |
| reasoning | TEXT | Justificativa |
| risk_level | TEXT | Nível de risco |
| bet_category | TEXT | SAFE ou OPORTUNIDADE |

**Constraint:** `bet_category IN ('SAFE', 'OPORTUNIDADE')`

### match_analysis_queue
Fila de controle do pipeline de análise.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| match_id | BIGINT | PK e FK para league_matches |
| status | TEXT | Status atual |
| last_checked_at | TIMESTAMPTZ | Última verificação |
| analysis_generated_at | TIMESTAMPTZ | Quando análise foi gerada |
| error_reason | TEXT | Motivo do erro (se houver) |
| created_at | TIMESTAMPTZ | Entrada na fila |
| updated_at | TIMESTAMPTZ | Última atualização |

**Status válidos:**
- `pending` - Aguardando processamento
- `dados_importados` - Dados atualizados pelo daily_update
- `analise_completa` - Análise IA finalizada
- `relatorio_concluido` - Relatórios gerados

## Campos JSONB Importantes

### ordered_stats (stats_match_details)

```json
{
  "meta": { "stadium": "...", "referee_id": 123 },
  "score": { "ht": { "home": 1, "away": 0 }, "ft": { "home": 2, "away": 1 } },
  "teams": { "home": { "id": 123, "name": "..." }, "away": {...} },
  "performance": {
    "possession": { "home": 55, "away": 45 },
    "shots": { "total": {...}, "on_target": {...} },
    "corners": { "home": 5, "away": 3 },
    "cards": { "yellow": {...}, "red": {...} }
  },
  "odds": { "full_time": {...}, "first_half": {...} },
  "potentials": { "goals": { "over_25": 65 }, "corners": {...} }
}
```

### ordered_stats (team_lastx_stats)

```json
{
  "meta": { "last_x": 10, "scope": 0 },
  "form": { "wins": 6, "draws": 2, "losses": 2, "ppg": 2.0 },
  "goals": { "scored_avg": 1.8, "conceded_avg": 0.9 },
  "clean_sheet": { "count": 4, "percentage": 40 },
  "btts": { "count": 5, "percentage": 50 },
  "overs": { "over_25_percentage": 60 }
}
```

## Índices

| Tabela | Índice | Colunas |
|--------|--------|---------|
| league_seasons | idx_league_seasons_country | country |
| league_matches | idx_league_matches_season | season_id |
| league_matches | idx_league_matches_game_week | game_week |
| league_players | idx_league_players_club | club_team_id |
| stats_match_details | idx_stats_match_details_season | season_id |
| team_lastx_stats | idx_team_lastx_team | team_id |
| match_analysis_queue | idx_match_analysis_queue_status | status |

---
*Documentação gerada em 2026-01-10 via BMM document-project workflow*
