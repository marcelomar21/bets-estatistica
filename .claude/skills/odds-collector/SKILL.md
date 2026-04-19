# Odds Collector (Betano)

Coleta odds e bookingcodes da Betano para apostas pendentes. Resolve **1 jogo por execucao** (~4 apostas).

## REGRA CRITICA: Execucao continua

**Executar TODOS os 8 passos de uma vez, sem parar no meio.** Nao pausar para mostrar progresso, nao esperar confirmacao entre passos. A unica razao para parar e se um agente de validacao retornar INVALIDO. O usuario so ve o resumo final (passo 8).

## Pre-requisitos

- Playwright MCP conectado (`/mcp`)
- Pacote: `playwright-parallel-mcp@latest` no `.mcp.json` (com patch `--isolated` no backend)
- O backend `@playwright/mcp` deve ter `--isolated` nos args para multiplas sessoes sem conflito de perfil Chrome

## Fluxo

### 1. Selecionar jogo

Consultar `suggested_bets` com `odds IS NULL` **OU** `deep_link IS NULL`, status != posted, kickoff nos proximos 3 dias. Agrupar por `match_id`. Filtrar jogos com **4 apostas onde QUALQUER uma tenha pendencia** (sem odds, sem link, ou ambos). Pegar o mais proximo automaticamente (nao perguntar).

**IMPORTANTE na query**: usar `order=id.desc&limit=500` — existem milhares de apostas pendentes antigas no banco. Limit baixo (50-80) nao pega jogos recentes. Filtrar kickoff no Python apos receber os dados.

**BUG CONHECIDO**: O banco grava kickoff_time como se fosse UTC, mas o valor real e BRT (UTC-3). Ao filtrar `kickoff > now`, usar `now - 3h` para compensar. Na query Python: `if kt <= (now - timedelta(hours=3))` ao inves de `if kt <= now`.

Tipos de pendencia por aposta:
- **Full**: sem odds E sem link → pegar ambos
- **Só link**: tem odds mas sem link → só pegar bookingcode
- **Só odds**: tem link mas sem odds → só pegar odd na Betano

Apresentar antes de prosseguir:
```
Resolvendo: Corinthians vs Internacional (05/04 19:30) — jogo 1 de 5 restantes
```

### 2. Abrir Betano e navegar ate o jogo

1. `browser_navigate` -> `https://www.betano.bet.br/sport/futebol/`
2. Dismiss popups via `browser_evaluate`: clicar botao "Sim" (idade) e "SIM, EU ACEITO" (cookies)
3. Navegar para a liga do jogo (ver tabela abaixo) com `?bt=matchresult` para ver todos os jogos
4. Listar jogos via `document.querySelectorAll('a[data-qa="pre-event"]')` — retorna `/odds/<slug>/<id>/`
5. `browser_navigate` -> `https://www.betano.bet.br/odds/<slug>/<id>/`

**NUNCA usar `browser_snapshot`** na Betano — retorna >100k chars e estoura. Usar `browser_evaluate` com JS direto.

### 3. Expandir mercados e extrair odds

Via `browser_evaluate` (NAO usar `browser_run_code` — da timeout no playwright-parallel-mcp):

1. Clicar aba "Todos" (`span` dentro de `[data-qa="pre-event-details-market-tabs"]`)
2. Clicar "Expand all" (pode precisar de 2 cliques — verificar se mercados sairam de "CA")
3. Se ainda mostrar "CA", clicar headers individuais `.table-market-header` para expandir

Extrair odds via `browser_evaluate` parseando `document.body.innerText`:
- Odds aparecem em trios: `"Mais de"`, `"2.5"`, `"1.78"` (direcao/linha/odd)
- Validar contexto acima para distinguir gols vs cartoes vs escanteios
- Mercados de cartoes/escanteios podem ter linhas limitadas (ex: Betano oferece 4.5+ cartoes mas nao 3.5)
- Se a linha exata nao existir, marcar como INDISPONIVEL

### 4. Pegar bookingcodes

**REGRA CRITICA: 1 APOSTA POR BOOKINGCODE.** Cada bookingcode deve conter EXATAMENTE 1 selecao. Se o cupom acumular multiplas selecoes, o bookingcode gerado tera todas elas — isso e ERRADO. O usuario abre o link e ve 2-3 apostas em vez de 1.

**Fluxo para cada aposta (sequencial, 1 por vez):**

1. **Limpar cupom**: antes de clicar qualquer odd, garantir que o cupom esta vazio
   ```js
   // Remover TODAS as selecoes ativas do cupom
   document.querySelectorAll('[data-qa="event-selection"]').forEach(sel => {
     if (sel.classList.contains('active') || sel.getAttribute('aria-pressed') === 'true') sel.click();
   });
   // Tambem remover links de bookingcode antigos do DOM (cache stale)
   document.querySelectorAll('a[href*="bookingcode"]').forEach(a => a.remove());
   ```

2. **Clicar na odd especifica** da aposta (1 unica selecao)

3. **Verificar que o cupom tem exatamente 1 selecao** antes de compartilhar
   ```js
   const activeCount = document.querySelectorAll('[data-qa="event-selection"].active, [data-qa="event-selection"][aria-pressed="true"]').length;
   if (activeCount !== 1) throw new Error(`Cupom tem ${activeCount} selecoes, esperava 1`);
   ```

4. **Extrair bookingcode**: Compartilhar → Link → Facebook href
   ```js
   () => {
     // Remover links antigos primeiro (evita cache stale)
     document.querySelectorAll('a[href*="bookingcode"]').forEach(a => a.remove());
     const share = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Compartilhar'));
     if (share) share.click();
     return new Promise(resolve => {
       setTimeout(() => {
         const linkBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Link');
         if (linkBtn) linkBtn.click();
         setTimeout(() => {
           const fb = document.querySelector('a[href*="facebook.com/sharer"]');
           resolve(fb ? new URL(fb.href).searchParams.get('u') : 'not found');
         }, 2000);
       }, 2000);
     });
   }
   ```

5. **Desselecionar a aposta** apos extrair o bookingcode (clicar novamente para remover do cupom)

**Pattern otimizado para coleta sequencial (chained promises):**
```js
const getCode = (selText) => new Promise(resolve => {
  // 1. Clicar na odd
  const sels = document.querySelectorAll('[data-qa="event-selection"]');
  for (const sel of sels) { if (sel.textContent.trim() === selText) { sel.click(); break; } }
  setTimeout(() => {
    // 2. Limpar links antigos + Compartilhar + Link + Extrair
    document.querySelectorAll('a[href*="bookingcode"]').forEach(a => a.remove());
    const share = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Compartilhar'));
    if (share) share.click();
    setTimeout(() => {
      const linkBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Link');
      if (linkBtn) linkBtn.click();
      setTimeout(() => {
        const fb = document.querySelector('a[href*="facebook.com/sharer"]');
        const code = fb ? new URL(fb.href).searchParams.get('u') : 'not found';
        // 3. Desselecionar
        for (const sel of document.querySelectorAll('[data-qa="event-selection"]')) {
          if (sel.textContent.trim() === selText) { sel.click(); break; }
        }
        resolve(code);
      }, 2000);
    }, 2000);
  }, 500);
});

// Encadear todas as apostas do jogo
return getCode('Menos de3.51.53').then(c1 =>
  getCode('Mais de3.51.78').then(c2 =>
    getCode('Mais de9.51.62').then(c3 =>
      getCode('Sim1.75').then(c4 => ({c1, c2, c3, c4}))
    )
  )
);
```

**Sobre sessoes paralelas:** Se `--isolated` estiver configurado no backend, pode usar `create_session` para coletar em paralelo (1 sessao por aposta = cupom sempre limpo). Sem `--isolated`, usar sequencial com o pattern acima.

### 4.1. Verificacao dos bookingcodes (1 aposta por link)

**OBRIGATORIO.** Apos coletar todos os bookingcodes do jogo, verificar que CADA link contem exatamente 1 aposta.

Navegar para cada bookingcode URL e contar quantas selecoes aparecem:
```js
// Para cada bookingcode coletado:
// browser_navigate → https://www.betano.bet.br/bookingcode/XXXXXXXX
// browser_evaluate:
() => {
  // Contar selecoes no cupom carregado pelo bookingcode
  const selections = document.querySelectorAll('[data-qa="event-selection"].active, [data-qa="event-selection"][aria-pressed="true"]');
  // Alternativa: contar itens no betslip
  const betslipItems = document.querySelectorAll('.betslip-item, .bet-item, [data-qa="betslip-selection"]');
  return {
    activeSelections: selections.length,
    betslipItems: betslipItems.length,
    // Extrair texto das selecoes para confirmar qual aposta e
    details: Array.from(selections).map(s => s.textContent.trim().substring(0, 60))
  };
}
```

**Se qualquer bookingcode tiver != 1 selecao**: PARAR e reportar. Nao gravar no banco. O bookingcode esta errado e precisa ser recoletado com cupom limpo.

**Dica**: Se usar sessoes paralelas (`--isolated`), cada sessao tem cupom independente e este problema nao acontece. No modo sequencial (1 sessao), a limpeza do cupom entre apostas e critica.

### 5. Validacao pre-gravacao (3 agentes paralelos, model: sonnet)

Spawnar **3 agentes em uma unica mensagem**. Cada um recebe ZERO contexto — apenas dados crus.

| Agente | Verifica | Retorna |
|---|---|---|
| **Mercado** | bet_market do DB descreve o mesmo mercado que o encontrado na Betano | VALIDO/INVALIDO + motivo |
| **Odds** | Valor numerico valido (>1, <100). Odds extraidas da Betano sao validas por definicao — NUNCA retornar INVALIDO por faixa. Apenas ALERTA se fora da faixa tipica | VALIDO + faixa esperada + alertas (nunca INVALIDO por faixa) |
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

| ID | Aposta | Odd | Status | Link |
|---|---|---|---|---|
| 3553 | +2.5 gols | 1.78 | OK | https://www.betano.bet.br/bookingcode/FDBPDTEJ |
| 3556 | Flamengo +0.5 | 1.11 | OK | https://www.betano.bet.br/bookingcode/MG3ANNJ7 |
| 3555 | +8.5 escanteios | 1.38 | OK | https://www.betano.bet.br/bookingcode/77TDTMHR |
| 3554 | +3.5 cartoes | - | INDISPONIVEL | - |
```

**SEMPRE incluir a coluna Link com URL completa no resumo final.**

### 9. Ajuste dinamico do loop (quando rodando via /loop)

Apos o resumo final, re-consultar quantos jogos elegiveis restam (mesma query do passo 1).

- **Se restam jogos**: manter intervalo de 15 minutos (nao fazer nada)
- **Se ZERO jogos restantes**: deletar o cron atual (`CronDelete`) e criar novo com intervalo de 2 horas (`0 */2 * * *`). Informar ao usuario: "Sem jogos pendentes — loop ajustado para 2h"
- **Se estava em modo 2h e encontrou jogos novos**: deletar o cron de 2h e criar novo de 15 min (`*/15 * * * *`). Informar: "Novos jogos detectados — loop ajustado para 15min"

Para saber o modo atual, verificar com `CronList` qual cron esta ativo.

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
4. Mercados colapsados ("CA") — clicar "Expand all" apos aba "Todos". Pode precisar de 2 cliques ou clicar headers `.table-market-header` individuais
5. Clipboard nao funciona no headless — extrair link do Facebook share href
6. Deep link = bookingcode (`/bookingcode/XXX`), NAO URL da pagina
7. Coleta paralela via `playwright-parallel-mcp` (sumyapp) com backend `@playwright/mcp --isolated`. Cada sessao tem browser independente
8. Mercados de cartoes/escanteios podem nao ter a linha exata (ex: 3.5 cartoes nao existe, min=4.5)
9. Mesmo mercado aparece duplicado na pagina — a 2a ocorrencia tem todas as linhas alternativas
10. `playwright-mcp-parallel` (wangkouzhun) e bloqueado pela Betano (anti-bot). O correto e `playwright-parallel-mcp` (sumyapp) que usa `@playwright/mcp` como backend
11. O backend precisa de `--isolated` para multiplas sessoes (sem isso: "Browser already in use"). Patch manual no `dist/index.js` do pacote npx
12. `browser_run_code` da timeout no `playwright-parallel-mcp` — usar `browser_evaluate` com `Promise` + `setTimeout` para operacoes async
13. Sessoes paralelas abrem na aba "Principais" — clicar "Todos" + "Expand all" ANTES de buscar odds de escanteios/cartoes
14. **BOOKINGCODE COM MULTIPLAS APOSTAS** — Se nao desselecionar a aposta anterior antes de clicar a proxima, o cupom acumula selecoes e o bookingcode gerado contem 2+ apostas. SEMPRE limpar cupom antes de cada clique. Remover links `a[href*="bookingcode"]` do DOM antes de extrair (cache stale)
15. Ao encadear coletas sequenciais com `getCode()`, cada chamada deve desselecionar a aposta no final. Verificar com step 4.1 que cada bookingcode tem exatamente 1 selecao
