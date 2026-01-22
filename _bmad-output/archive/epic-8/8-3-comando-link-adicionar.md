# Story 8.3: Comando para Adicionar Link

Status: done

## Story

As a operador,
I want adicionar link a uma aposta via comando,
So that fique pronta para postagem.

## Acceptance Criteria

1. **Given** operador envia `/link 45 https://betano.com/...`
   **When** bot processa comando
   **Then** valida se link é de casa conhecida

2. **Given** link válido
   **When** bot salva
   **Then** salva link na aposta
   **And** muda status para 'ready'
   **And** confirma com ✅

3. **Given** link inválido (casa não reconhecida)
   **When** bot valida
   **Then** responde com ❌ e lista casas aceitas

4. **Given** bet já postada (status='posted')
   **When** operador tenta adicionar link
   **Then** responde que não pode alterar

## Tasks / Subtasks

- [ ] **Task 1: Adicionar comando `/link ID URL`** (AC: #1, #2)
  - [ ] 1.1 Criar regex pattern `/link ID URL`
  - [ ] 1.2 Criar handler `handleLinkCommand()`
  - [ ] 1.3 Reutilizar validação e lógica existente

## Dev Notes

### Código Existente

Já existe o padrão `ID: URL` que faz exatamente isso. O comando `/link` é um alias mais explícito.

Fluxo existente em `adminGroup.js`:
- `LINK_PATTERN = /^(\d+):\s*(https?:\/\/\S+)/i`
- Valida URL com `isValidBookmakerUrl()`
- Usa `updateBetLink()` do betService

### Implementação

Apenas adicionar um novo pattern e reutilizar a lógica existente.

```javascript
const LINK_COMMAND_PATTERN = /^\/link\s+(\d+)\s+(https?:\/\/\S+)/i;
```

### Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `bot/handlers/adminGroup.js` | Adicionar pattern e handler |

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (2026-01-11)

### Completion Notes List

1. ✅ Adicionado pattern `/link ID URL`
2. ✅ Extraída função `handleLinkUpdate()` reutilizável
3. ✅ Ambos patterns (`/link` e `ID: URL`) usam mesma lógica
4. ✅ Resposta melhorada com detalhes do jogo

### File List

| Arquivo | Modificação |
|---------|-------------|
| `bot/handlers/adminGroup.js` | +80 linhas - refatoração + novo comando |
