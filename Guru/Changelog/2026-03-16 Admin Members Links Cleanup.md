---
title: 2026-03-16 Admin Members Links Cleanup
type: note
permalink: guru/changelog/2026-03-16-admin-members-links-cleanup
---

# 2026-03-16 — Admin Members Links Cleanup

## PRs
- #144 feat(admin): hide expiration for admin members, add bot invite link, remove group link
- #145 fix(rls): allow group_admin to read bot_pool for their group
- #146 fix(rls): add INSERT policies for group_admin on audit_log and notifications

## Mudanças
- Admins (`is_admin=true`) bypass cálculo de expiração — status sempre reflete o DB
- Coluna "Vencimento" mostra "-" para admins
- Card com link do bot (`https://t.me/{bot}?start=subscribe`) na página de membros
- Botão "Grupo Telegram" removido do GroupCard
- 3 RLS policies adicionadas: `bot_pool` SELECT, `audit_log` INSERT, `notifications` INSERT

## Migrations
- 056: `bot_pool_group_admin_select`
- 057: `audit_log_group_admin_insert` + `notifications_group_admin_insert`