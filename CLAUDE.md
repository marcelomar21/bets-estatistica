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

**SEMPRE** rodar **todos** os passos abaixo antes de criar PR ou mergear:

1. `cd admin-panel && npm test` — roda vitest (testes unitarios)
2. `npm run build` — roda o build do Next.js com checagem TypeScript strict
3. **Playwright E2E** — abrir o navegador via Playwright MCP e testar o fluxo afetado na aplicacao rodando (`localhost:3000`). Verificar que a mudanca funciona de verdade na UI.

Os tres devem passar sem erros. Nunca mergear apenas com testes unitarios + build.

## Testes no navegador (E2E) — OBRIGATORIO

O Playwright MCP esta configurado para testes via navegador.

**SEMPRE rodar testes E2E via Playwright antes de criar PR.** Isso nao e opcional — faz parte da validacao pre-merge assim como `npm test` e `npm run build`.

### Quando rodar

- **Qualquer mudanca em API routes** (`/api/**`): testar a funcionalidade correspondente na UI
- **Qualquer mudanca em componentes** (`/components/**`): testar o componente no navegador
- **Qualquer mudanca em lib** (`/lib/**`): testar o fluxo que usa aquela lib na UI
- Na duvida, **sempre rodar**. Melhor testar demais do que de menos.

### Como rodar

1. Garantir que o dev server esta rodando (`npm run dev` no admin-panel)
2. Usar o Playwright MCP para navegar ate a pagina afetada
3. Executar o fluxo completo que a mudanca afeta
4. Verificar resultado final (nao apenas acao intermediaria)

### Rigor nos testes E2E (OBRIGATORIO)

Ao testar fluxos via Playwright, ser **extremamente criterioso**:

- **Validar o resultado final**, nao apenas a acao intermediaria. Se o fluxo envolve enviar algo ao Telegram, abrir o Telegram Web e verificar que a mensagem chegou corretamente.
- **Questionar mensagens de sucesso**: se o sistema diz "promovido com sucesso" mas o item nao aparece onde deveria, isso e um bug — reportar imediatamente.
- **Testar fluxos completos end-to-end**: nao parar no meio. Se o teste e "promover e postar", ir ate o final e verificar no destino (Telegram, banco, etc).
- **Validar pre-condicoes**: antes de executar uma acao (ex: promover), verificar se a aposta tem os dados necessarios (link, odds). Se nao tem, o sistema deveria bloquear — se nao bloqueia, e bug.
- **Nao ignorar inconsistencias**: se algo parece errado (contadores nao batem, item sumiu, mensagem no lugar errado), investigar e reportar.
