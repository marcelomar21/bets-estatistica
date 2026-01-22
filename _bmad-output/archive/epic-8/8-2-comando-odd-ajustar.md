# Story 8.2: Comando para Ajustar Odd

Status: done

## Story

As a operador,
I want corrigir a odd de uma aposta,
So that o valor exibido seja o correto.

## Acceptance Criteria

1. **Given** operador envia `/odd 45 1.90` no grupo admin
   **When** bot processa comando
   **Then** atualiza odds da aposta ID 45 para 1.90

2. **Given** odd atualizada com sucesso
   **When** bot responde
   **Then** responde com ✅ confirmando alteração
   **And** mostra valor anterior e novo

3. **Given** bet ID não existe
   **When** operador tenta atualizar
   **Then** responde com ❌ e mensagem de erro

## Tasks / Subtasks

- [ ] **Task 1: Adicionar alias `/odd` ao comando existente `/odds`** (AC: #1)
  - [ ] 1.1 Modificar regex para aceitar `/odd` ou `/odds`
  
- [ ] **Task 2: Melhorar resposta para mostrar valor anterior** (AC: #2)
  - [ ] 2.1 Buscar odd atual antes de atualizar
  - [ ] 2.2 Mostrar `📊 1.85 → 1.90` na resposta

## Dev Notes

### Código Existente

O comando `/odds` já está implementado em `adminGroup.js`. Precisa apenas:
1. Aceitar `/odd` (sem 's') como alias
2. Mostrar valor anterior na resposta

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/handlers/adminGroup.js` | Ajustar regex e resposta |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (2026-01-11)

### Completion Notes List

1. ✅ Regex ajustado: `/odds?` aceita `/odd` ou `/odds`
2. ✅ Resposta mostra valor anterior: `📊 1.85 → 1.90`
3. ✅ Log inclui previousOdds e newOdds

### File List

| Arquivo | Modificação |
|---------|-------------|
| `bot/handlers/adminGroup.js` | 2 edits - regex + resposta |
