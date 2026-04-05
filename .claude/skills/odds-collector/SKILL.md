# Odds Collector (Betano)

Coleta odds e deep links da Betano para apostas que estao sem esses dados no banco.

## Quando usar

Quando houver apostas em `suggested_bets` com `odds IS NULL` ou `deep_link IS NULL`.

## Pre-requisitos

- Playwright MCP conectado (verificar com `/mcp`)
- Pacote correto: `@playwright/mcp@latest` no `.mcp.json`

## Fluxo

### 1. Buscar apostas sem odds/link

```bash
SUPABASE_SERVICE_KEY="<ver CLAUDE.md>" && \
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/suggested_bets?select=id,match_id,bet_market,bet_pick,odds,deep_link,bet_status,created_at,league_matches(home_team_name,away_team_name,kickoff_time)&or=(odds.is.null,deep_link.is.null)&bet_status=neq.posted&order=created_at.desc&limit=20" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -m json.tool
```

Anotar os jogos e mercados que precisam de dados.

### 2. Abrir Betano e passar pelos popups

```
browser_navigate -> https://www.betano.bet.br/sport/futebol/
```

Dois popups aparecem na primeira visita:
- **Verificacao de idade**: clicar no botao "Sim" (nao "SIM, EU ACEITO")
- **Cookies**: clicar no botao "SIM, EU ACEITO"

Para encontrar os refs corretos, fazer `browser_snapshot` e buscar por:
- `button "Sim"` (idade)
- `button "SIM, EU ACEITO"` (cookies)

**IMPORTANTE**: O snapshot da Betano e muito grande (>100k chars). Usar `depth: 3` no snapshot ou salvar em arquivo e buscar com grep.

### 3. Buscar o jogo na Betano

Opcao A - Navegacao direta por URL:
```
browser_navigate -> https://www.betano.bet.br/sport/futebol/alemanha/bundesliga/rb-leipzig-borussia-mgladbach/MATCH_ID/
```

Opcao B - Usar o campo de busca:
1. Fazer snapshot com `depth: 3` para encontrar o icone/botao de busca
2. Clicar no icone de busca
3. Digitar o nome de um dos times (ex: "Leipzig")
4. Clicar no resultado do jogo

Opcao C - Navegar pela liga:
```
browser_navigate -> https://www.betano.bet.br/sport/futebol/alemanha/bundesliga/
```
Depois buscar o jogo no snapshot.

### 4. Extrair odds do jogo

Na pagina do jogo:
1. Fazer `browser_snapshot` (ou salvar em arquivo se muito grande)
2. Buscar pelo mercado desejado (ex: "Mais de 2.5", "Ambas Marcam", "Escanteios")
3. Extrair o valor da odd do texto do botao (formato: `"Bet on X with odds Y"`)
4. O deep_link e a URL atual da pagina do jogo na Betano

### 5. Atualizar no banco

Para cada aposta encontrada:

```bash
SUPABASE_SERVICE_KEY="<ver CLAUDE.md>" && \
curl -s -X PATCH "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/suggested_bets?id=eq.<BET_ID>" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"odds": <VALOR>, "deep_link": "<URL_BETANO>", "bet_status": "ready"}'
```

## Mapeamento de mercados

| Mercado no banco (bet_market) | Mercado na Betano |
|---|---|
| Mais de X.5 gols | "Total de Gols - Mais de X.5" ou "Mais de X.5" |
| Menos de X.5 gols | "Total de Gols - Menos de X.5" ou "Menos de X.5" |
| Ambas equipes marcam | "Ambas Marcam - Sim" |
| Mais de X.5 cartoes | "Total de Cartoes - Mais de X.5" (aba Cartoes) |
| Mais de X.5 escanteios | "Total de Escanteios - Mais de X.5" (aba Escanteios) |
| Time X acima de Y.5 gols | "Gols Time X - Mais de Y.5" |

## Dicas

- A Betano agrupa mercados em abas: Principal, Gols, Escanteios, Cartoes, etc.
- Para mercados de cartoes/escanteios, pode ser necessario clicar na aba correspondente
- O snapshot da pagina do jogo tem TODOS os mercados, nao precisa navegar entre abas se usar snapshot
- Odds mudam em tempo real - anotar o horario da coleta
- Deep link = URL da pagina do jogo (nao do botao de aposta individual)

## Estrutura de dados relevante (suggested_bets)

| Coluna | Tipo | Descricao |
|---|---|---|
| id | BIGSERIAL | PK |
| odds | NUMERIC | Odd da aposta (null = nao coletada) |
| deep_link | TEXT | Link afiliado/direto na casa de apostas |
| bet_status | TEXT | generated -> pending_link/pending_odds -> ready -> posted |
| bet_market | TEXT | Descricao do mercado |
| bet_pick | TEXT | Pick especifica |
| match_id | BIGINT | FK para league_matches |
