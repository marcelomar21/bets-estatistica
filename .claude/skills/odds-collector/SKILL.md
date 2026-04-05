# Odds Collector (Betano)

Coleta odds e deep links (links de compartilhamento) da Betano para apostas sem esses dados no banco.

## Quando usar

Quando houver apostas em `suggested_bets` com `odds IS NULL` ou `deep_link IS NULL`.

## Pre-requisitos

- Playwright MCP conectado (verificar com `/mcp`)
- Pacote: `@playwright/mcp@latest` no `.mcp.json`

## Fluxo Completo (testado e validado)

### 1. Buscar apostas sem odds/link

```bash
SUPABASE_SERVICE_KEY="<ver CLAUDE.md>" && \
curl -s "https://vqrcuttvcgmozabsqqja.supabase.co/rest/v1/suggested_bets?select=id,match_id,bet_market,bet_pick,odds,deep_link,bet_status,created_at,league_matches(home_team_name,away_team_name,kickoff_time)&or=(odds.is.null,deep_link.is.null)&bet_status=neq.posted&order=created_at.desc&limit=20" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -m json.tool
```

### 2. Abrir Betano e passar pelos popups

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

### 3. Navegar ate a liga e encontrar o jogo

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

### 4. Entrar na pagina do jogo

```
browser_navigate -> https://www.betano.bet.br/odds/<slug>/<betano-id>/
```

Exemplo: `https://www.betano.bet.br/odds/rb-leipzig-borussia-monchengladbach/82020330/`

### 5. Expandir todos os mercados

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

### 6. Extrair odds

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

### 7. Pegar o LINK DE COMPARTILHAMENTO (deep_link)

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

### 8. Confirmar com o usuario

**SEMPRE** apresentar os dados ao usuario antes de atualizar o banco:

```
| ID | Aposta | Odd | Link | 
|---|---|---|---|
| 3593 | Mais de 2.5 gols | 1.50 | https://www.betano.bet.br/bookingcode/C7S4KYQH |
```

So atualizar no Supabase apos confirmacao do usuario.

### 9. Atualizar no banco (apos confirmacao)

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
