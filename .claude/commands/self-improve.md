Olhe para o GuruBet com dois chapéus: **PM criativo** e **Tech Lead pragmático**. Navegue a produção, investigue o backend, e traga findings reais — problemas, melhorias de UX, e ideias de produto.

## Setup
- LINEAR_API_KEY: `admin-panel/.env.local`
- Linear: `https://api.linear.app/graphql`, Team: `GURU`
- Produção: `https://admin.gurudabet.com.br`
- Login: `super@admin.test` / `admin123`

## Chapéu 1: PM Criativo

Usar Playwright pra navegar a produção como um operador real faria. Login e usar o app.

### Olhar de produto
- O fluxo faz sentido? Algo confuso, escondido, ou com muitos cliques?
- Falta alguma informação importante que o operador precisaria?
- Tem algo que poderia ser automatizado ou simplificado?
- A hierarquia visual faz sentido? O que é importante se destaca?
- Alguma tela vazia ou sem contexto? (empty states sem call-to-action)
- Oportunidades: algo que traria valor real pros operadores ou membros?

### Páginas pra navegar
Não só visitar — USAR. Filtrar, clicar, explorar como um operador no dia a dia:
- `/dashboard` — informação útil? Ações claras?
- `/members` — fácil encontrar quem precisa? Ações acessíveis?
- `/bets` — fluxo de apostas intuitivo?
- `/groups` — configuração de grupo faz sentido?
- `/postagem` — fluxo de postagem fluido?
- `/posting-history` — histórico útil?
- Qualquer outra página que encontrar na navegação

## Chapéu 2: Tech Lead Pragmático

### Estabilidade
- Bots vivos? Query `bot_health` via Supabase Management API
- Jobs falharam nas últimas 24h? Query `job_executions WHERE status='failed'`
- Render service rodando? Check via Render API
- Render logs com erros reais? (ERROR, FATAL, crash — ignorar noise)
- Console errors no Playwright durante navegação?
- HTTP 4xx/5xx durante navegação?

### Qualidade de código (observar, não auditar)
Se durante a navegação notar algo suspeito (dado errado, contagem que não bate, comportamento inesperado), investigar a causa no código.

## Como reportar

Para cada finding:
- **O quê:** descrição clara em 1-2 frases
- **Chapéu:** 🎩 PM ou 🔧 Tech
- **Impacto:** quem é afetado e como (concreto, não teórico)
- **Proposta:** solução direta ou ideia de melhoria
- **Severidade:** Critical / High / Medium

Ignorar findings Low — não valem o card. Foco em coisas que melhoram a vida do operador ou a estabilidade do produto.

## Deduplicação (OBRIGATÓRIO antes de criar cards)

Antes de criar qualquer card, buscar issues existentes no Linear:
```bash
source admin-panel/.env.local
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issues(filter: { team: { key: { eq: \"GURU\" } }, state: { type: { nin: [\"completed\", \"canceled\"] } } }) { nodes { identifier title description } } }"}'
```

Para cada finding, comparar com os cards existentes. Se já existe card sobre o mesmo problema (mesmo que com título diferente), NÃO criar duplicata. Mencionar no resumo: "Já existe: GURU-X".

## Criar cards no Linear (severity >= Medium, sem duplicata)

```bash
source admin-panel/.env.local
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { identifier url } } }", "variables": {"input": {"teamId": "<GURU_TEAM_ID>", "title": "<titulo>", "description": "<desc>", "priority": <1-3>}}}'
```

Team ID: buscar uma vez via `{ teams { nodes { id } } }`.

Label: `[PM]` ou `[Tech]` no título conforme o chapéu.

Descrição do card — OBRIGATÓRIO incluir tudo:
```markdown
## Problema
<o que foi observado — concreto, 1-2 frases>

## Impacto
<quem é afetado e como — operador? membros? receita?>

## Solução
<passo a passo do que fazer — ser específico>

## Arquivos
<lista exata dos arquivos que precisam mudar, com caminho completo>
- `admin-panel/src/app/(auth)/dashboard/page.tsx` — alterar X
- `bot/jobs/postBets.js` — adicionar Y

## Classificação
- **Dificuldade:** P / M / G (P = < 1h, M = 1-4h, G = 4h+)
- **Impacto:** Alto / Médio (já filtrou Low antes)
- **Tipo:** Bug / UX / Feature / Infra
```

IMPORTANTE: antes de criar o card, ler os arquivos relevantes no código pra confirmar a causa raiz e listar os arquivos corretos. Não chutar — investigar.

## Apresentar resumo

```
## Self-Improve — <data>

### Saúde
🟢/🟡/🔴 Bots | Jobs | App | Logs

### Findings
| # | 🎩/🔧 | O quê | Impacto | Proposta | Card |
|---|--------|-------|---------|----------|------|

### Tudo OK
Se nada encontrado: "✅ Produção saudável, sem melhorias identificadas."
```

NÃO corrigir nada. Apresentar findings pro usuário decidir o que atacar.
