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

## Testes

```bash
cd admin-panel && npm test
```
