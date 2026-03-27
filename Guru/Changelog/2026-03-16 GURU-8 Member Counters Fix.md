---
title: 2026-03-16 GURU-8 Member Counters Fix
type: note
permalink: guru/changelog/2026-03-16-guru-8-member-counters-fix
---

# 2026-03-16 — GURU-8 Member Counters Fix

## PR
- #148 fix(members): include admins in counters.total to match pagination total

## Mudança
- `counters.total` fazia `total - adminsCount` mostrando 24, enquanto `pagination.total` mostrava 27
- Agora ambos mostram o mesmo valor — admins incluídos no total
- Card roxo Admins continua com contagem separada

## Arquivo
- `admin-panel/src/app/api/members/route.ts` L186 — 1 linha alterada