# Odds Collector (Betano)

Coleta odds e bookingcodes da Betano para apostas pendentes. Resolve **1 jogo por execucao** (~4 apostas).

## Pre-requisitos

- Playwright MCP conectado (`/mcp`)

## Fluxo

### 1. Selecionar jogo

Consultar `suggested_bets` com `odds IS NULL` e `deep_link IS NULL`, status != posted, kickoff nos proximos 3 dias. Agrupar por `match_id`. Filtrar **somente jogos com exatamente 4 apostas pendentes** (menos indica enrichment parcial — pular). Pegar o mais proximo automaticamente (nao perguntar).

### 2. Abrir Betano e navegar ate o jogo

1. `browser_navigate` -> `https://www.betano.bet.br/sport/futebol/`
2. Dismiss popups via `browser_evaluate`: clicar botao "Sim" (idade) e "SIM, EU ACEITO" (cookies)
3. Navegar para a liga do jogo (ver tabela abaixo) com `?bt=matchresult` para ver todos os jogos
4. Listar jogos via `document.querySelectorAll('a[data-qa="pre-event"]')` — retorna `/odds/<slug>/<id>/`
5. `browser_navigate` -> `https://www.betano.bet.br/odds/<slug>/<id>/`

**NUNCA usar `browser_snapshot`** na Betano — retorna >100k chars e estoura. Usar `browser_evaluate` com JS direto.

### 3. Expandir mercados e extrair odds

Via `browser_run_code`: clicar aba "Todos" (`span` dentro de `[data-qa="pre-event-details-market-tabs"]`), depois "Expand all".

Extrair odds via `browser_evaluate` parseando `document.body.innerText`:
- Odds aparecem em trios: `"Mais de"`, `"2.5"`, `"1.78"` (direcao/linha/odd)
- Validar contexto acima para distinguir gols vs cartoes vs escanteios
- Mercados de cartoes/escanteios podem ter linhas limitadas (ex: Betano oferece 4.5+ cartoes mas nao 3.5)
- Se a linha exata nao existir, marcar como INDISPONIVEL

### 4. Pegar bookingcode (para cada aposta disponivel)

Ciclo por aposta — clicar odd → Compartilhar → Link → extrair do Facebook share href:

```js
// Extrair bookingcode do href do Facebook share
const fbLink = document.querySelector('a[href*="facebook.com/sharer"]');
const bookingcode = new URL(fbLink.href).searchParams.get('u');
// Resultado: "https://www.betano.bet.br/bookingcode/XXXXXXXX"
```

Depois: Escape (fechar modal) → clicar mesma odd de novo (desselecionar) → repetir proxima aposta.

### 5. Validacao pre-gravacao (3 agentes paralelos, model: sonnet)

Spawnar **3 agentes em uma unica mensagem**. Cada um recebe ZERO contexto — apenas dados crus.

| Agente | Verifica | Retorna |
|---|---|---|
| **Mercado** | bet_market do DB descreve o mesmo mercado que o encontrado na Betano | VALIDO/INVALIDO + motivo |
| **Odds** | Valor numerico valido (>1, <100), dentro de faixa tipica para o mercado | VALIDO/INVALIDO + faixa esperada + alertas |
| **Link** | URL comeca com `/bookingcode/`, 6-12 chars alfanum, sem duplicatas entre apostas | VALIDO/INVALIDO + formato + duplicata |

Enviar TODAS as apostas do jogo para cada agente (nao 1 agente por aposta).

**3/3 VALIDO**: prosseguir automaticamente. **Qualquer INVALIDO**: parar e reportar.

### 6. Gravar no banco

PATCH em `suggested_bets` para cada aposta: `{"odds": X, "deep_link": "URL", "bet_status": "ready"}`.

### 7. Verificacao pos-gravacao (1 agente, model: sonnet)

Spawnar agente que executa `curl` no Supabase para cada ID atualizado e compara campo a campo (odds, deep_link, bet_status) com valores esperados. INVALIDO se qualquer campo nao bater.

### 8. Resumo final

```
Flamengo vs Santos — 3 atualizadas, 1 indisponivel

| ID | Aposta | Odd | Bookingcode | Status |
|---|---|---|---|---|
| 3553 | +2.5 gols | 1.78 | FDBPDTEJ | OK |
| 3556 | Flamengo +0.5 | 1.11 | MG3ANNJ7 | OK |
| 3555 | +8.5 escanteios | 1.38 | 77TDTMHR | OK |
| 3554 | +3.5 cartoes | - | - | INDISPONIVEL |
```

---

## Referencia rapida

### URLs de ligas (Betano)

| Liga | URL | OK? |
|---|---|---|
| Brasileirao Serie A | `/competicoes/brasil/10004/?sl=10016&bt=matchresult` | SIM |
| Bundesliga | `/competicoes/alemanha/24/?bt=matchresult` | SIM |
| Copa do Brasil | `/competicoes/brasil/10004/?sl=10008&bt=matchresult` | NAO |
| Serie B | `/competicoes/brasil/10004/?sl=10017&bt=matchresult` | NAO |
| La Liga | `/competicoes/espanha/8/?bt=matchresult` | NAO |
| Premier League | `/competicoes/inglaterra/1/?bt=matchresult` | NAO |
| Serie A (Italia) | `/competicoes/italia/4/?bt=matchresult` | NAO |
| Ligue 1 | `/competicoes/franca/3/?bt=matchresult` | NAO |
| Champions League | a descobrir | NAO |

Base: `https://www.betano.bet.br/sport/futebol`

Se liga desconhecida: navegar para `/sport/futebol/` e buscar links com `href` contendo o nome do pais via `browser_evaluate`.

**ATENCAO**: ID 102 para Brasileirao NAO funciona (redireciona). Correto: `10004/?sl=10016`.

### Seletores Betano (data-qa)

| Seletor | Uso |
|---|---|
| `a[data-qa="pre-event"]` | Links de jogos na pagina da liga |
| `[data-qa="pre-event-details-market-tabs"]` | Container de abas de mercados |
| `[data-qa="event-selection"]` | Botoes de selecao de odds |
| `[data-qa^="market-type-id"]` | Headers de mercados |
| `button:has-text("Compartilhar")` | Botao compartilhar no cupom |
| `a[href*="facebook.com/sharer"]` | Link Facebook (contem bookingcode) |

### Armadilhas

1. `browser_snapshot` estoura (>100k chars) — usar `browser_evaluate`
2. URLs amigaveis (`/alemanha/bundesliga/`) redirecionam — usar `/competicoes/pais/ID/`
3. Liga mostra so 3 jogos — adicionar `?bt=matchresult`
4. Mercados colapsados ("CA") — clicar "Expand all" apos aba "Todos"
5. Clipboard nao funciona no headless — extrair link do Facebook share href
6. Deep link = bookingcode (`/bookingcode/XXX`), NAO URL da pagina
7. Uma aposta por vez no cupom (adicionar → compartilhar → desselecionar → repetir)
8. Mercados de cartoes/escanteios podem nao ter a linha exata (ex: 3.5 cartoes nao existe, min=4.5)
9. Mesmo mercado aparece duplicado na pagina — a 2a ocorrencia tem todas as linhas alternativas
