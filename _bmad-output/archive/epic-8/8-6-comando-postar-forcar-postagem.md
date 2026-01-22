# Story 8.6: Comando /postar - Forçar Postagem

Status: done

## Story

As a operador,
I want forçar uma postagem imediata,
So that possa testar ou recuperar de falhas.

## Acceptance Criteria

1. **Given** operador envia `/postar`
   **When** bot processa comando
   **Then** executa job de postagem imediatamente

2. **Given** job executado
   **When** finaliza
   **Then** reporta quantas apostas foram postadas/repostadas

3. **Given** nenhuma aposta pronta
   **When** operador executa comando
   **Then** reporta que não havia apostas prontas

## Tasks / Subtasks

- [ ] **Task 1: Criar handler /postar** (AC: #1, #2, #3)
  - [ ] 1.1 Pattern: `/postar`
  - [ ] 1.2 Importar e chamar `runPostBets()` de postBets.js
  - [ ] 1.3 Retornar resultado ao operador

## Dev Notes

### Job Existente

`bot/jobs/postBets.js` exporta `runPostBets()` que retorna:
```javascript
{ 
  reposted: number, 
  repostFailed: number,
  posted: number, 
  skipped: number,
  totalSent: number
}
```

### Implementação Simples

```javascript
const POSTAR_PATTERN = /^\/postar$/i;

async function handlePostarCommand(bot, msg) {
  await bot.sendMessage(msg.chat.id, '⏳ Executando postagem...');
  
  const result = await runPostBets();
  
  await bot.sendMessage(msg.chat.id, 
    `✅ Postagem executada!\n\n` +
    `🔄 Repostadas: ${result.reposted}\n` +
    `🆕 Novas: ${result.posted}\n` +
    `📤 Total enviadas: ${result.totalSent}`
  );
}
```

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/handlers/adminGroup.js` | Handler para `/postar` |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (2026-01-11)

### Completion Notes List

1. ✅ Pattern `/postar` adicionado
2. ✅ Handler chama `runPostBets()` do postBets.js
3. ✅ Mostra mensagem "Aguarde" enquanto processa
4. ✅ Retorna contagem: reposted, posted, totalSent
5. ✅ Mensagem especial se nenhuma aposta postada
6. ✅ Tratamento de erros

### File List

| Arquivo | Modificação |
|---------|-------------|
| `bot/handlers/adminGroup.js` | +50 linhas - handler |
