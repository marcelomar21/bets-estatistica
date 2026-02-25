# Modelos de Dados - GuruBet (bets-estatistica)

Banco PostgreSQL hospedado no Supabase com 27 tabelas distribuidas em 28 migrations sequenciais (`sql/migrations/001..028`).

---

## Diagrama de Relacionamentos

```
groups (tenant)
  ├── admin_users          (group_id → groups.id)
  ├── members              (group_id → groups.id)
  │     ├── member_events         (member_id → members.id)
  │     └── member_notifications  (member_id → members.id)
  ├── suggested_bets       (group_id → groups.id)
  ├── bot_pool             (group_id → groups.id)
  ├── bot_health           (group_id PK/FK → groups.id)
  ├── webhook_events       (group_id → groups.id)
  └── notifications        (group_id → groups.id)

league_seasons
  ├── league_matches
  │     ├── stats_match_details   (match_id → league_matches.match_id)
  │     ├── game_analysis         (match_id → league_matches.match_id)
  │     ├── match_analysis_queue  (match_id PK/FK → league_matches.match_id)
  │     └── suggested_bets        (match_id → league_matches.match_id)
  ├── league_team_stats    (season_id → league_seasons.season_id)
  └── league_players       (season_id → league_seasons.season_id)

Tabelas independentes:
  countries, team_lastx_stats, system_config, job_executions,
  audit_log, mtproto_sessions, super_admin_bot_config, odds_update_history
```

---

## Tabelas Principais

### Multi-tenant

#### groups

Tenant principal do sistema. Cada grupo Telegram e um tenant isolado.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador do grupo |
| name | VARCHAR | Nome do grupo |
| bot_token | VARCHAR | Token do bot Telegram atribuido |
| telegram_group_id | BIGINT (UNIQUE) | Chat ID do grupo publico |
| telegram_admin_group_id | BIGINT | Chat ID do grupo admin |
| telegram_invite_link | VARCHAR | Link de convite do grupo |
| mp_plan_id | VARCHAR | ID do plano de assinatura no Mercado Pago |
| render_service_id | VARCHAR | ID do servico no Render (deploy do bot) |
| checkout_url | VARCHAR | URL de checkout para novos assinantes |
| posting_schedule | JSONB | Horarios de postagem: `{enabled: bool, times: ["HH:mm"]}` |
| post_now_requested_at | TIMESTAMPTZ | Flag para postagem manual imediata (bot limpa apos uso) |
| status | VARCHAR | `creating`, `active`, `paused`, `inactive`, `failed` |
| created_at | TIMESTAMPTZ | Data de criacao |

#### admin_users

Usuarios do painel administrativo, vinculados ao Supabase Auth.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Mesmo valor de `auth.uid()` do Supabase Auth |
| email | VARCHAR (UNIQUE) | Email do administrador |
| role | VARCHAR | `super_admin` ou `group_admin` |
| group_id | UUID (FK) | Grupo do admin (NULL para super_admin) |
| created_at | TIMESTAMPTZ | Data de criacao |

#### bot_pool

Pool de bots Telegram disponiveis para atribuicao a grupos.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador do bot |
| bot_token | VARCHAR (UNIQUE) | Token do bot |
| bot_username | VARCHAR (UNIQUE) | Username do bot (@) |
| status | VARCHAR | `available` ou `in_use` |
| group_id | UUID (FK) | Grupo atribuido (NULL se disponivel) |
| created_at | TIMESTAMPTZ | Data de criacao |

#### bot_health

Monitoramento de saude dos bots por grupo (1:1 com groups).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| group_id | UUID (PK/FK) | Referencia ao grupo |
| last_heartbeat | TIMESTAMPTZ | Ultimo heartbeat recebido |
| status | VARCHAR | `online` ou `offline` |
| restart_requested | BOOLEAN | Flag para solicitar restart |
| error_message | TEXT | Mensagem de erro (se offline) |
| updated_at | TIMESTAMPTZ | Ultima atualizacao |

---

### Apostas

#### suggested_bets

Apostas geradas pela IA com ciclo de vida completo (geracao -> postagem -> resultado).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | BIGSERIAL (PK) | Identificador da aposta |
| match_id | BIGINT (FK) | Partida associada |
| group_id | UUID (FK) | Grupo tenant |
| bet_market | TEXT | Mercado (gols, cartoes, escanteios, etc) |
| bet_pick | TEXT | Selecao especifica (ex: "Over 2.5") |
| odds | NUMERIC | Odds atuais |
| confidence | NUMERIC(0-1) | Nivel de confianca da IA |
| reasoning | TEXT | Justificativa da IA |
| risk_level | TEXT | Nivel de risco |
| bet_category | TEXT | `SAFE` ou `OPORTUNIDADE` |
| bet_status | TEXT | `generated` → `pending_link` → `pending_odds` → `ready` → `posted` |
| bet_result | TEXT | `pending`, `success`, `failure`, `cancelled`, `unknown` |
| result_reason | TEXT | Justificativa da LLM para o resultado |
| deep_link | TEXT | Link de aposta na casa |
| elegibilidade | TEXT | `elegivel`, `removida`, `expirada` |
| promovida_manual | BOOLEAN | Ignora filtro de odds >= 1.60 |
| distributed_at | TIMESTAMPTZ | Quando foi distribuida ao grupo |
| telegram_posted_at | TIMESTAMPTZ | Quando foi postada no Telegram |
| telegram_message_id | BIGINT | ID da mensagem no Telegram |
| created_at | TIMESTAMPTZ | Data de criacao |

#### odds_update_history

Historico de alteracoes de odds nas apostas.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | SERIAL (PK) | Identificador |
| bet_id | BIGINT (FK CASCADE) | Aposta associada |
| update_type | TEXT | `odds_change`, `new_analysis`, `manual_update` |
| old_value | NUMERIC(10,2) | Valor anterior |
| new_value | NUMERIC(10,2) | Novo valor |
| job_name | TEXT | Fonte da atualizacao (ex: `enrichOdds_08h`) |
| created_at | TIMESTAMPTZ | Data da atualizacao |

---

### Membros

#### members

Membros dos grupos Telegram com ciclo de vida de assinatura.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | SERIAL (PK) | Identificador interno |
| telegram_id | BIGINT (UNIQUE) | ID do usuario no Telegram (nullable) |
| telegram_username | TEXT | Username sem @ |
| email | TEXT | Email do membro |
| status | TEXT | `trial`, `ativo`, `inadimplente`, `removido` |
| group_id | UUID (FK) | Grupo tenant |
| mp_subscription_id | TEXT | ID da assinatura no Mercado Pago |
| mp_payer_id | TEXT | ID do pagador no Mercado Pago |
| trial_started_at | TIMESTAMPTZ | Inicio do trial |
| subscription_started_at | TIMESTAMPTZ | Inicio da assinatura paga |
| subscription_ends_at | TIMESTAMPTZ | Fim da assinatura atual |
| inadimplente_at | TIMESTAMPTZ | Data que ficou inadimplente |
| affiliate_coupon | TEXT | Cupom de afiliado usado no checkout |
| payment_method | TEXT | `pix`, `boleto`, `cartao_recorrente` |
| last_payment_at | TIMESTAMPTZ | Ultimo pagamento confirmado |
| kicked_at | TIMESTAMPTZ | Data de remocao do grupo |
| notes | TEXT | Notas internas |
| created_at / updated_at | TIMESTAMPTZ | Controle temporal |

#### member_events

Audit log de eventos do ciclo de vida de membros.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | SERIAL (PK) | Identificador |
| member_id | INT (FK CASCADE) | Membro associado |
| event_type | TEXT | `join`, `leave`, `kick`, `payment`, `trial_start`, `trial_end`, `reactivate` |
| payload | JSONB | Dados adicionais do evento |
| created_at | TIMESTAMPTZ | Data do evento |

#### member_notifications

Historico de notificacoes enviadas aos membros.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | SERIAL (PK) | Identificador |
| member_id | INT (FK CASCADE) | Membro destinatario |
| type | TEXT | `trial_reminder`, `renewal_reminder`, `welcome`, `farewell`, `payment_received`, `reactivation`, `payment_rejected` |
| channel | TEXT | `telegram` ou `email` |
| sent_at | TIMESTAMPTZ | Data de envio |
| message_id | TEXT | ID da mensagem no Telegram |

#### webhook_events

Event sourcing para webhooks de pagamento (Mercado Pago).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | SERIAL (PK) | Identificador |
| idempotency_key | TEXT (UNIQUE) | Chave para garantir idempotencia |
| event_type | TEXT | Tipo do evento (ex: `payment.created`) |
| payload | JSONB | Payload completo do webhook |
| status | TEXT | `pending`, `processing`, `completed`, `failed` |
| group_id | UUID (FK) | Grupo tenant |
| attempts / max_attempts | INT | Controle de retentativas (max: 5) |
| last_error | TEXT | Ultimo erro de processamento |
| created_at | TIMESTAMPTZ | Recebimento do webhook |
| processed_at | TIMESTAMPTZ | Conclusao do processamento |

---

### Dados Esportivos

#### league_seasons

Temporadas de ligas importadas da API FootyStats.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | BIGSERIAL (PK) | PK interna |
| season_id | INTEGER (UNIQUE) | ID da temporada na API |
| league_name | TEXT | Nome da liga |
| country | TEXT | Pais |
| display_name | TEXT | Nome de exibicao |
| season_year | INTEGER | Ano da temporada |
| active | BOOLEAN | Se esta ativa para importacao |
| raw_league | JSONB | Payload completo da API |

#### league_matches

Partidas de cada temporada.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | BIGSERIAL (PK) | PK interna |
| match_id | BIGINT (UNIQUE) | ID da partida na API |
| season_id | INTEGER (FK) | Temporada |
| home_team_id / away_team_id | INTEGER | IDs dos times |
| home_team_name / away_team_name | TEXT | Nomes dos times |
| home_score / away_score | INTEGER | Placar |
| status | TEXT | `complete`, `incomplete`, etc |
| game_week | INTEGER | Rodada |
| kickoff_time | TIMESTAMPTZ | Horario do jogo |
| venue | TEXT | Estadio |
| raw_match | JSONB | Payload completo |

#### league_team_stats, league_players, team_lastx_stats, stats_match_details

Estatisticas detalhadas de times, jogadores e partidas. Todas contem campos `raw_payload`/`raw_*` com dados brutos da API e campos `ordered_stats`/`stats` com dados estruturados para consulta.

#### game_analysis

Analises geradas pela IA para cada partida (`match_id` UNIQUE). Armazena versao Markdown (`analysis_md`) e JSON estruturado (`analysis_json`).

#### match_analysis_queue

Fila do pipeline de analise. Status: `pending` → `dados_importados` → `analise_completa` → `relatorio_concluido`.

---

### Sistema

#### audit_log

Log de acoes criticas no painel admin. Retencao de 90 dias.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador |
| table_name | TEXT | Tabela afetada |
| record_id | UUID | ID do registro alterado |
| action | TEXT | Acao realizada |
| changed_by | UUID (FK) | Admin que executou |
| changes | JSONB | Diff das alteracoes |
| created_at | TIMESTAMPTZ | Data da acao |

#### notifications

Alertas do sistema para o painel admin.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador |
| type | VARCHAR | `bot_offline`, `group_failed`, `onboarding_completed`, `group_paused`, `integration_error`, `telegram_group_created`, `telegram_group_failed`, `telegram_notification_failed`, `mtproto_session_expired` |
| severity | VARCHAR | `info`, `warning`, `error`, `success` |
| title | VARCHAR | Titulo do alerta |
| message | TEXT | Corpo da mensagem |
| group_id | UUID (FK) | Grupo relacionado |
| metadata | JSONB | Dados adicionais |
| read | BOOLEAN | Se foi lida |
| created_at | TIMESTAMPTZ | Data de criacao |

#### job_executions

Log de execucoes de jobs cron para monitoramento.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador |
| job_name | TEXT | Nome do job |
| started_at / finished_at | TIMESTAMPTZ | Inicio e fim |
| status | TEXT | `running`, `success`, `failed` |
| duration_ms | INTEGER | Duracao em milissegundos |
| result | JSONB | Resultado detalhado |
| error_message | TEXT | Mensagem de erro |

#### system_config

Configuracoes de runtime alteraveis sem redeploy.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| key | TEXT (PK) | Chave da configuracao (ex: `TRIAL_DAYS`) |
| value | TEXT | Valor (parseado conforme necessidade) |
| updated_at | TIMESTAMPTZ | Ultima alteracao |
| updated_by | TEXT | Quem alterou |

#### mtproto_sessions

Sessoes MTProto criptografadas (AES-256-GCM) para criacao de grupos Telegram via conta de founder.

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador |
| phone_number | VARCHAR (UNIQUE) | Numero do telefone |
| session_string | TEXT | Sessao criptografada (formato: `version:iv:authTag:ciphertext`) |
| key_version | INT | Versao da chave de criptografia |
| label | VARCHAR | Identificador legivel (ex: `founder_marcelo`) |
| is_active | BOOLEAN | Se esta ativa |
| requires_reauth | BOOLEAN | Se precisa reautenticacao |
| locked_at / locked_by | TIMESTAMPTZ / VARCHAR | Mutex para concorrencia |

#### super_admin_bot_config

Configuracao do bot dedicado para notificacoes dos founders (separado do pool).

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID (PK) | Identificador |
| bot_token | TEXT | Token criptografado (AES-256-GCM) |
| bot_username | VARCHAR | Username do bot |
| founder_chat_ids | JSONB | Array de chat IDs dos founders |
| is_active | BOOLEAN | Se esta ativo |

---

## RLS (Row Level Security)

Todas as tabelas com dados sensíveis possuem RLS habilitado. O modelo de acesso:

| Role | Acesso |
|------|--------|
| **super_admin** | CRUD completo em todas as tabelas |
| **group_admin** | CRUD restrito ao seu `group_id` |
| **service_role** | Bypassa RLS (usado pelo backend: bots, cron, webhooks) |

**Funcoes helper** (SECURITY DEFINER, bypassam RLS para evitar recursao infinita):
- `get_my_role()` -- retorna a role do usuario autenticado
- `get_my_group_id()` -- retorna o group_id do usuario autenticado

Tabelas com RLS: `groups`, `admin_users`, `bot_pool`, `bot_health`, `members`, `suggested_bets`, `member_notifications`, `webhook_events`, `audit_log`, `notifications`, `mtproto_sessions`, `super_admin_bot_config`.

---

## Views

| View | Descricao |
|------|-----------|
| `league_matches_br` | Adiciona coluna `kickoff_time_br` com timezone Brasil (UTC-3) |
| `active_bets` | Apostas elegiveis, com odds >= 1.60, dentro de 2 dias do kickoff e antes do inicio da partida |

---

*Documentacao atualizada em 2026-02-25 -- 28 migrations aplicadas*
