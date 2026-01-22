# Story 8.5: Comando /atualizar - Forçar Refresh

Status: done

## Story

As a operador,
I want forçar atualização de odds,
So that não precise esperar o cron.

## Acceptance Criteria

1. **Given** operador envia `/atualizar odds`
   **When** bot processa comando
   **Then** executa job de enriquecimento de odds

2. **Given** job executado
   **When** finaliza
   **Then** reporta quantas odds foram atualizadas

3. **Given** erro durante execução
   **When** job falha
   **Then** reporta erros ao operador

## Tasks / Subtasks

- [ ] **Task 1: Criar handler /atualizar** (AC: #1, #2, #3)
  - [ ] 1.1 Pattern: `/atualizar odds`
  - [ ] 1.2 Importar e chamar `runEnrichment()` de enrichOdds.js
  - [ ] 1.3 Retornar resultado ao operador

## Dev Notes

### Job Existente

`bot/jobs/enrichOdds.js` exporta `runEnrichment()` que retorna:
```javascript
{ enriched: number, skipped: number, errors: number }
```

### Implementação Simples

```javascript
const ATUALIZAR_PATTERN = /^\/atualizar\s+odds$/i;

async function handleAtualizarCommand(bot, msg) {
  await bot.sendMessage(msg.chat.id, '⏳ Atualizando odds...');
  
  const result = await runEnrichment();
  
  await bot.sendMessage(msg.chat.id, 
    `✅ Odds atualizadas!\n\n` +
    `📊 Enriquecidas: ${result.enriched}\n` +
    `⏭️ Puladas: ${result.skipped}\n` +
    `❌ Erros: ${result.errors}`
  );
}
```

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/handlers/adminGroup.js` | Handler para `/atualizar odds` |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (2026-01-11)

### Completion Notes List

1. ✅ Pattern `/atualizar odds` adicionado
2. ✅ Handler chama `runEnrichment()` do enrichOdds.js
3. ✅ Mostra mensagem "Aguarde" enquanto processa
4. ✅ Retorna contagem: enriched, skipped, errors
5. ✅ Tratamento de erros

### File List

| Arquivo | Modificação |
|---------|-------------|
| `bot/handlers/adminGroup.js` | +40 linhas - handler |
