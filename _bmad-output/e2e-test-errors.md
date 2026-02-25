# E2E Test Errors — Multi-Bot Evolution (E06)

Data: 2026-02-25
Branch: feature/phase1-bug-fixes
PR: #69

## Erros Encontrados

### Erro 1: Migration 032 — coluna `kickoff_time` não existe em `suggested_bets`
- **Severidade:** Bug no SQL da migration
- **Descrição:** O índice `idx_bets_tracking_recovery` referenciava `kickoff_time` em `suggested_bets`, mas essa coluna fica em `league_matches`. A tabela `suggested_bets` só tem `match_id` como FK.
- **Fix aplicado:** Criado índice parcial sem `kickoff_time`: `CREATE INDEX idx_bets_tracking_recovery ON suggested_bets (bet_status, bet_result) WHERE bet_status = 'posted' AND bet_result = 'pending'`
- **Arquivo a corrigir:** `sql/migrations/032_tracking_recovery_index.sql`

### Erro 2: Admin panel conectado ao Supabase DEV, não ao PROD
- **Severidade:** Configuração — impede testes E2E com dados reais
- **Descrição:** `.env.local` aponta para `xsiaifqlbrpagnhmlpmm` (Dev), mas as migrations foram aplicadas em `vqrcuttvcgmozabsqqja` (Prod). Os grupos no dashboard são "Guru da Bet (Dev)" e "Osmar Palpites (Dev)" com UUIDs fake (`11111111-...`, `22222222-...`), não os dados reais de produção.
- **Impacto:** Testes E2E rodam contra dados dev/seed. Para testar com infra real (Telegram, bots no Render), precisamos apontar para prod OU aplicar migrations no Dev também.
- **Decisão:** Aplicar migrations no Dev e testar contra dados de seed. Teste Telegram será feito via API direta.

### Erro 3: Resumo da Fila mostra "3 prontas" mas Fila mostra "2 apostas elegíveis"
- **Severidade:** Inconsistência visual (baixa)
- **Descrição:** Na página Postagem do Osmar, o card "Resumo da Fila" mostra **3 prontas**, mas a tabela "Fila de Postagem" mostra **(2 apostas elegíveis)**. A diferença é a bet 13 (odds 1.30, não promovida) que tem `bet_status=ready` mas é filtrada da fila elegível por odds baixa.
- **Causa raiz:** O contador "prontas" conta todas as bets com `bet_status=ready`, enquanto a fila de postagem aplica o filtro adicional de odds mínimas. São queries diferentes.
- **Arquivo a corrigir:** O endpoint de contagem (`/api/bets` ou componente de resumo) deveria aplicar o mesmo filtro de elegibilidade que a fila.

### Erro 4: Telegram Web requer login — não foi possível screenshot visual das mensagens
- **Severidade:** Limitação de teste (não é bug)
- **Descrição:** Telegram Web pede QR code login, impossibilitando screenshot automático das mensagens enviadas nos grupos.
- **Evidência alternativa:** Confirmado via API que msg 93 chegou no Osmar e msg 383 no Guru. Isolamento confirmado: bot Osmar não tem acesso ao grupo Guru (`ok: false`).

---

## Resumo dos Testes

| # | Teste | Resultado | Evidência |
|---|-------|-----------|-----------|
| 1 | Login admin panel | PASS | `e2e-evidence/01-dashboard-login.png` |
| 2 | Schema check (7 cols/tables) | PASS | API query: todas `ok: true` |
| 3 | Tone API — PUT (Osmar) | PASS | Status 200, config salva |
| 4 | Tone API — GET (Osmar) | PASS | Config persistida corretamente |
| 5 | Preview (Osmar) | PASS | `previewId: prev_6b683801`, 1 bet |
| 5b | Preview (Guru) | PASS | `previewId: prev_94729c55`, 1 bet (isolada) |
| 6 | Post Now — odds baixa SEM promoção | PASS | Bet 13 (1.30) rejeitada em `issues` |
| 7 | Post Now — odds baixa COM promoção | PASS | Bet 14 (1.25, `promovida_manual`) aceita |
| 8 | Post Now — isolamento Guru vs Osmar | PASS | Guru: 1 bet (id 6). Osmar: 2 bets (ids 7,14) |
| 9 | Telegram — msg no Osmar | PASS | `msg_id: 93` em "Osmar Palpites" |
| 9b | Telegram — msg no Guru | PASS | `msg_id: 383` em "Guru da Bet" |
| 9c | Telegram — isolamento cross-group | PASS | Bot Osmar NÃO acessa grupo Guru |
| 10 | Supabase — post_previews | PASS | 2 previews, group_ids corretos |
| 10b | Supabase — post_now flag | PASS | Flag setada em ambos grupos |
| 10c | Supabase — tone config | PASS | Osmar: config salva. Guru: {} |
| UI | Postagem Osmar | PASS | `e2e-evidence/02-postagem-osmar.png` |
| UI | Postagem Guru (isolamento) | PASS | `e2e-evidence/03-postagem-guru-isolamento.png` |

**Total: 17 verificações, 17 PASS. 0 bugs bloqueantes. 2 issues menores (Erros 1 e 3).**
