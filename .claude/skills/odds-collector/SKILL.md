# Odds Collector (Betano)

Coleta odds e deep links (links de compartilhamento) da Betano para apostas sem esses dados no banco.
**Escopo**: resolve UM jogo por execucao (tipicamente ~4 apostas por jogo).

## Quando usar

Quando houver apostas em `suggested_bets` com `odds IS NULL` ou `deep_link IS NULL`.

## Pre-requisitos

- Playwright MCP conectado (verificar com `/mcp`)
- Pacote: `@playwright/mcp@latest` no `.mcp.json`

## Fluxo Completo (testado e validado)

### 1. Escolher o proximo jogo para resolver

Buscar jogos nos proximos 3 dias que tenham apostas sem odds ou link, agrupados por jogo:

```bash
SUPABASE_SERVICE_KEY="<ver CLAUDE.md>" && \
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/suggested_bets?select=id,match_id,bet_market,bet_pick,odds,deep_link,bet_status,created_at,league_matches(home_team_name,away_team_name,kickoff_time)&or=(odds.is.null,deep_link.is.null)&bet_status=neq.posted&league_matches.kickoff_time=lt.$(date -u -v+3d '+%Y-%m-%dT%H:%M:%S')&order=league_matches.kickoff_time.asc&limit=50" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -m json.tool
```

Agrupar os resultados por `match_id` e apresentar ao usuario:

```
Jogos com apostas pendentes (proximos 3 dias):

1. Augsburg vs Hoffenheim (10/04 15:30) — 4 apostas sem odds/link
2. RB Leipzig vs Borussia M'gladbach (11/04 10:30) — 4 apostas sem odds/link
3. RCD Mallorca vs Rayo Vallecano (12/04 11:15) — 4 apostas sem odds/link

Qual jogo resolver agora?
```

Se o usuario nao escolher, pegar o mais proximo (menor kickoff_time).

Depois de resolver um jogo, perguntar se quer continuar com o proximo.

### 2. Identificar a liga do jogo escolhido

Com base nos times do jogo, determinar qual liga e necessaria na Betano (ver tabela de IDs no passo 4).

### 3. Abrir Betano e passar pelos popups

```
browser_navigate -> https://www.betano.bet.br/sport/futebol/
```

Na primeira visita, dois popups aparecem. Usar `browser_evaluate` para clicar:

```js
// N�O usar browser_snapshot — ele retorna >100k chars e estoura o limite.
// Usar browser_evaluate com JS direto.
() => {
  // Idade
  const simBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim() === 'Sim');
  if (simBtn) simBtn.click();
  
  // Cookies
  const cookieBtn = Array.from(document.querySelectorAll('button'))
    .find(b => b.textContent.trim() === 'SIM, EU ACEITO');
  if (cookieBtn) cookieBtn.click();
  
  return 'popups dismissed';
}
```

### 4. Navegar ate a liga e encontrar o jogo

**NAO usar URLs amigaveis** (ex: `/sport/futebol/alemanha/bundesliga/`) — elas redirecionam para `/sport/futebol/`.

**Usar o padrao de URL por competicao:**
```
browser_navigate -> https://www.betano.bet.br/sport/futebol/competicoes/alemanha/24/
```

Para ver todos os jogos (por padrao so mostra 3):
```
browser_navigate -> https://www.betano.bet.br/sport/futebol/competicoes/alemanha/24/?bt=matchresult
```

**Listar jogos disponiveis** com `browser_evaluate`:
```js
() => {
  const links = Array.from(document.querySelectorAll('a[data-qa="pre-event"]'));
  return links.map(el => ({
    text: el.textContent.trim(),
    href: el.getAttribute('href')
  }));
}
```

Resultado retorna links no padrao: `/odds/<slug>/<betano-id>/`

**IDs de ligas conhecidas:**

| Liga | URL |
|---|---|
| Bundesliga | `/sport/futebol/competicoes/alemanha/24/` |
| La Liga | `/sport/futebol/competicoes/espanha/8/` |
| Premier League | `/sport/futebol/competicoes/inglaterra/1/` |
| Serie A (Italia) | `/sport/futebol/competicoes/italia/4/` |
| Ligue 1 | `/sport/futebol/competicoes/franca/3/` |
| Brasileirao Serie A | `/sport/futebol/competicoes/brasil/102/` |

> Se nao souber o ID da liga, navegar para `/sport/futebol/` e usar `browser_evaluate` para buscar links com o nome do pais.

### 5. Entrar na pagina do jogo

```
browser_navigate -> https://www.betano.bet.br/odds/<slug>/<betano-id>/
```

Exemplo: `https://www.betano.bet.br/odds/rb-leipzig-borussia-monchengladbach/82020330/`

### 6. Expandir todos os mercados

A pagina do jogo tem abas: Principais, Mais/Menos, Gols, Intervalo, Especiais, Handicap, Todos.

**Clicar na aba "Todos" e depois "Expand all":**
```js
async (page) => {
  // Clicar aba "Todos"
  const tabContainer = await page.$('[data-qa="pre-event-details-market-tabs"]');
  const spans = await tabContainer.$$('span');
  for (const span of spans) {
    const text = await span.textContent();
    if (text.trim() === 'Todos') { await span.click(); break; }
  }
  await page.waitForTimeout(1500);
  
  // Expand all
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await btn.textContent();
    if (text && text.includes('Expand all')) { await btn.click(); break; }
  }
  await page.waitForTimeout(1500);
  return 'expanded';
}
```

### 7. Extrair odds

**Listar TODOS os mercados disponiveis:**
```js
() => {
  const headers = Array.from(document.querySelectorAll('[data-qa^="market-type-id"]'));
  return headers.map(el => ({ text: el.textContent.trim(), id: el.getAttribute('data-qa') }));
}
```

**Extrair odds de um mercado especifico** (ex: "Total de Gols Mais/Menos alternativas"):
```js
() => {
  const bodyText = document.body.innerText;
  const lines = bodyText.split('\n').filter(l => l.trim());
  const result = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Total de Gols Mais/Menos (alternativas)')) {
      // Pegar as proximas linhas (pares: "Mais de", "X.5", "ODD")
      for (let j = i+1; j < Math.min(i+50, lines.length); j++) {
        const line = lines[j].trim();
        if (line.match(/^(Total|Resultado|Ambas|Handicap|Chance|Empate|Intervalo|Bola)/)) break;
        result.push(line);
      }
      break;
    }
  }
  return result;
}
```

As odds aparecem em trios: `"Mais de"`, `"2.5"`, `"1.50"` (direcao/linha/odd).

### 8. Pegar o LINK DE COMPARTILHAMENTO (deep_link)

**IMPORTANTE**: O deep_link NAO e a URL da pagina. E o link de compartilhamento gerado pela Betano (bookingcode).

Fluxo para cada aposta:

```js
async (page) => {
  // 1. Clicar na odd desejada (ex: Mais de 2.5 @ 1.50)
  const selections = await page.$$('[data-qa="event-selection"]');
  for (const sel of selections) {
    const text = await sel.textContent();
    if (text.includes('Mais de') && text.includes('2.5') && text.includes('1.50')) {
      await sel.click();
      await page.waitForTimeout(1500);
      break;
    }
  }
  
  // 2. Clicar "Compartilhar" no cupom
  const shareBtn = await page.$('button:has-text("Compartilhar")');
  await shareBtn.click();
  await page.waitForTimeout(2000);
  
  // 3. Clicar "Link" para expandir opcoes de share
  const linkBtn = await page.$('button:has-text("Link")');
  await linkBtn.click();
  await page.waitForTimeout(1500);
  
  // 4. Extrair o link do href do botao Facebook (contem o bookingcode)
  const shareUrl = await page.evaluate(() => {
    const fbLink = document.querySelector('a[href*="facebook.com/sharer"]');
    if (fbLink) {
      const url = new URL(fbLink.href);
      return url.searchParams.get('u');
    }
    return null;
  });
  
  // 5. Fechar modal e desselecionar a aposta
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  
  // Desselecionar clicando na mesma odd de novo
  for (const sel of await page.$$('[data-qa="event-selection"]')) {
    const text = await sel.textContent();
    if (text.includes('Mais de') && text.includes('2.5') && text.includes('1.50')) {
      await sel.click();
      break;
    }
  }
  
  return shareUrl; // ex: "https://www.betano.bet.br/bookingcode/C7S4KYQH"
}
```

**Truque**: O link de compartilhamento esta no href do Facebook share button como parametro `u`. Formato: `https://www.betano.bet.br/bookingcode/<CODE>`

### 9. Validacao com agentes paralelos (OBRIGATORIO)

Antes de apresentar ao usuario, spawnar **3 agentes em paralelo** (via Agent tool) para validar os dados coletados. Cada agente recebe ZERO contexto da conversa — apenas os dados crus para verificar.

**TODOS os 3 devem retornar VALIDO para prosseguir.** Se qualquer um retornar INVALIDO, abortar e reportar o erro ao usuario.

Os 3 agentes devem ser spawnados em uma **unica mensagem** (paralelo real):

#### Agente 1 — Verificador de Mercado

Verifica se o `bet_market` do banco descreve o mesmo mercado que foi encontrado na Betano.

```
Prompt:
Voce e um verificador de apostas. Sua UNICA tarefa e comparar dois textos e dizer se descrevem o MESMO mercado de apostas.

DADOS DO BANCO:
- bet_market: "{bet_market do DB}"
- bet_pick: "{bet_pick do DB}"
- Jogo: "{home_team} vs {away_team}"

DADOS DA BETANO:
- Nome do mercado na Betano: "{nome do mercado encontrado}"
- Selecao clicada: "{texto do botao clicado}"

Responda EXATAMENTE neste formato:
VEREDICTO: VALIDO ou INVALIDO
MOTIVO: (uma frase explicando)

Exemplos de VALIDO:
- DB "Mais de 2.5 gols" → Betano "Total de Gols Mais/Menos - Mais de 2.5" = VALIDO
- DB "Leipzig acima de 1.5 gols" → Betano "RB Leipzig - Total de Gols - Mais de 1.5" = VALIDO

Exemplos de INVALIDO:
- DB "Mais de 2.5 gols" → Betano "Mais de 2.5 cartoes" = INVALIDO (gols != cartoes)
- DB "Ambas marcam" → Betano "Total de Gols - Mais de 2.5" = INVALIDO (mercados diferentes)
```

#### Agente 2 — Verificador de Odds

Verifica se o valor da odd e valido e faz sentido para o tipo de mercado.

```
Prompt:
Voce e um verificador de odds de apostas esportivas. Sua UNICA tarefa e verificar se um valor de odd faz sentido.

DADOS:
- Odd coletada: {valor}
- Mercado: "{bet_market}"
- Jogo: "{home_team} vs {away_team}"
- Data do jogo: "{kickoff_time}"

REGRAS DE VALIDACAO:
1. Odd deve ser um numero valido > 1.00
2. Odd deve ser < 100.00 (odds acima disso sao anomalas)
3. Odd deve ter no maximo 2 casas decimais
4. Verificacao de sanidade por tipo de mercado:
   - "Mais de 2.5 gols" em ligas top: tipicamente entre 1.30 e 2.50
   - "Ambas marcam": tipicamente entre 1.40 e 2.20
   - "Resultado final (favorito)": tipicamente entre 1.20 e 3.00
   - Odds fora dessas faixas NAO sao automaticamente invalidas, mas devem ser sinalizadas

Responda EXATAMENTE neste formato:
VEREDICTO: VALIDO ou INVALIDO
ODD: {valor}
FAIXA_ESPERADA: {min}-{max} para este tipo de mercado
ALERTA: (se a odd estiver fora da faixa tipica mas ainda valida, explicar)
MOTIVO: (uma frase)
```

#### Agente 3 — Verificador de Link

Verifica se o bookingcode URL tem formato valido e corresponde ao jogo correto.

```
Prompt:
Voce e um verificador de links de apostas da Betano. Sua UNICA tarefa e validar o link de compartilhamento.

DADOS:
- Link coletado: "{bookingcode_url}"
- Jogo esperado: "{home_team} vs {away_team}"
- Mercado esperado: "{bet_market}"
- Odd esperada: {odds}

REGRAS DE VALIDACAO:
1. URL deve comecar com "https://www.betano.bet.br/bookingcode/"
2. O codigo apos /bookingcode/ deve ter entre 6 e 12 caracteres alfanumericos
3. URL nao deve conter espacos ou caracteres especiais alem de letras e numeros no codigo
4. Cada aposta DEVE ter um bookingcode DIFERENTE (se duas apostas tiverem o mesmo codigo, INVALIDO)
5. O link NAO pode ser null ou vazio

LISTA DE TODOS OS LINKS COLETADOS NESTA SESSAO (para verificar duplicatas):
{lista de todos os bookingcodes coletados ate agora}

Responda EXATAMENTE neste formato:
VEREDICTO: VALIDO ou INVALIDO
URL: {url verificada}
FORMATO_OK: SIM/NAO
DUPLICATA: SIM/NAO
MOTIVO: (uma frase)
```

#### Como processar os resultados

Apos os 3 agentes retornarem, montar tabela de validacao:

```
## Validacao — {home_team} vs {away_team}

| Aposta | Agente 1 (Mercado) | Agente 2 (Odds) | Agente 3 (Link) | Status |
|---|---|---|---|---|
| Mais de 2.5 gols @ 1.50 | VALIDO | VALIDO | VALIDO | OK |
| Leipzig +1.5 gols @ 1.45 | VALIDO | VALIDO (alerta: faixa) | VALIDO | OK |
| Mais de 2.5 cartoes | - | - | - | INDISPONIVEL |
```

- Se TODOS os agentes retornarem VALIDO: prosseguir para o passo 10
- Se QUALQUER agente retornar INVALIDO: reportar ao usuario com detalhes e NAO atualizar o banco
- Se um agente tiver ALERTA mas VALIDO: prosseguir, mas mencionar o alerta ao usuario

### 10. Confirmar com o usuario

**SEMPRE** apresentar os dados validados ao usuario antes de atualizar o banco:

```
## Coleta — {home_team} vs {away_team}
Validacao: 3/3 agentes aprovaram

| ID | Aposta | Odd | Link | Status |
|---|---|---|---|---|
| 3593 | Mais de 2.5 gols | 1.50 | https://www.betano.bet.br/bookingcode/C7S4KYQH | VALIDO |
| 3596 | Leipzig +1.5 gols | 1.45 | https://www.betano.bet.br/bookingcode/XSDSWGNP | VALIDO |
| 3594 | Mais de 2.5 cartoes | - | - | INDISPONIVEL na Betano |

Deseja atualizar no banco? (IDs 3593 e 3596)
```

So atualizar no Supabase apos confirmacao do usuario.

### 11. Atualizar no banco (apos confirmacao)

```bash
SUPABASE_SERVICE_KEY="<ver CLAUDE.md>" && \
curl -s -X PATCH "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/suggested_bets?id=eq.<BET_ID>" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"odds": <VALOR>, "deep_link": "<BOOKINGCODE_URL>", "bet_status": "ready"}'
```

## Mapeamento de mercados (Betano data-qa IDs)

| data-qa | Mercado Betano | Mercado no banco |
|---|---|---|
| market-type-id-13 | Total de Gols Mais/Menos (alternativas) | Mais/Menos de X.5 gols |
| market-type-id-84 | RB Leipzig - Total de Gols Mais/Menos | Time X acima de Y.5 gols |
| market-type-id-85 | Away Team - Total de Gols Mais/Menos | Time Y acima de Y.5 gols |
| market-type-id-15 | Ambas equipes Marcam | Ambas equipes marcam |
| market-type-id-1 | Resultado Final | Resultado (1X2) |
| market-type-id-9 | Chance Dupla | Chance dupla |

**Mercados de cartoes e escanteios**: NAO existem na Betano para todos os jogos. Se nao aparecer na lista de `market-type-id-*`, o mercado nao esta disponivel. Reportar ao usuario.

## Armadilhas aprendidas

1. **Snapshot estoura**: `browser_snapshot` sem depth retorna >100k chars e falha. Usar `browser_evaluate` com JS direto.
2. **URLs amigaveis redirecionam**: `/sport/futebol/alemanha/bundesliga/` redireciona para `/sport/futebol/`. Usar `/sport/futebol/competicoes/alemanha/24/`.
3. **Jogos ocultos**: A pagina da liga mostra so 3 jogos. Adicionar `?bt=matchresult` para ver todos.
4. **Mercados colapsados**: Muitos mercados mostram "CA" (colapsado). Clicar em "Expand all" apos abrir aba "Todos".
5. **Clipboard nao funciona**: `navigator.clipboard.writeText` nao e interceptavel no Playwright headless. Extrair o link do `href` do botao Facebook share.
6. **Deep link != URL da pagina**: O deep_link correto e o bookingcode gerado ao compartilhar (ex: `/bookingcode/C7S4KYQH`), NAO a URL da pagina do jogo.
7. **Uma aposta por vez**: Adicionar ao cupom, compartilhar, copiar link, remover do cupom. Repetir para cada aposta.

## Estrutura de dados (suggested_bets)

| Coluna | Tipo | Descricao |
|---|---|---|
| id | BIGSERIAL | PK |
| odds | NUMERIC | Odd da aposta (null = nao coletada) |
| deep_link | TEXT | Link de compartilhamento Betano (bookingcode) |
| bet_status | TEXT | generated -> pending_link/pending_odds -> ready -> posted |
| bet_market | TEXT | Descricao do mercado |
| bet_pick | TEXT | Pick especifica |
| match_id | BIGINT | FK para league_matches |
