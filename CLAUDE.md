# Project: bets-estatistica (GuruBet)

## Supabase

- **Project ref:** `vqrcuttvcgmozabsqqja`
- **Region:** East US (North Virginia)
- **Env file:** `admin-panel/.env.local`

## Migrations

As migrations SQL ficam em `sql/migrations/` com numeracao sequencial (ex: `028_descricao.sql`).

### Como aplicar migrations

Usar a **Supabase Management API** via curl:

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/vqrcuttvcgmozabsqqja/database/query" \
  -H "Authorization: Bearer <SUPABASE_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"query": "<SQL_AQUI>"}'
```

O access token do CLI fica no macOS Keychain (service: "Supabase CLI"). Para extrair:

```bash
security find-generic-password -s "Supabase CLI" -w | sed 's/go-keyring-base64://' | base64 -d
```

### Verificar se a migration foi aplicada

Consultar as policies/tabelas via a mesma API para confirmar que o objeto foi criado.

Resposta `[]` (array vazio) indica sucesso para comandos DDL (CREATE, ALTER, DROP).

## Validacao pre-merge (OBRIGATORIO)

**SEMPRE** rodar os dois comandos antes de criar PR ou mergear:

```bash
cd admin-panel && npm test && npm run build
```

- `npm test` — roda vitest (testes unitarios), mas **nao** checa TypeScript completo
- `npm run build` — roda o build do Next.js com checagem TypeScript strict

Os dois devem passar sem erros. Nunca mergear apenas com testes passando.

## Testes no navegador (E2E)

O Playwright MCP esta configurado para testes via navegador. Para usar:

```bash
# Ja esta adicionado como MCP server no Claude Code
claude mcp add playwright npx @playwright/mcp@latest
```

Permite que o Claude Code abra o navegador, navegue pela aplicacao, clique em botoes e verifique resultados visualmente.

### Rigor nos testes E2E (OBRIGATORIO)

Ao testar fluxos via Playwright, ser **extremamente criterioso**:

- **Validar o resultado final**, nao apenas a acao intermediaria. Se o fluxo envolve enviar algo ao Telegram, abrir o Telegram Web e verificar que a mensagem chegou corretamente.
- **Questionar mensagens de sucesso**: se o sistema diz "promovido com sucesso" mas o item nao aparece onde deveria, isso e um bug — reportar imediatamente.
- **Testar fluxos completos end-to-end**: nao parar no meio. Se o teste e "promover e postar", ir ate o final e verificar no destino (Telegram, banco, etc).
- **Validar pre-condicoes**: antes de executar uma acao (ex: promover), verificar se a aposta tem os dados necessarios (link, odds). Se nao tem, o sistema deveria bloquear — se nao bloqueia, e bug.
- **Nao ignorar inconsistencias**: se algo parece errado (contadores nao batem, item sumiu, mensagem no lugar errado), investigar e reportar.
