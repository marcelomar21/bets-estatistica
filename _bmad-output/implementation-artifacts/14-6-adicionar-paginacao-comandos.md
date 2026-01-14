# Story 14.6: Adicionar Paginação em Todos os Comandos

Status: ready-for-dev

## Story

As a operador,
I want navegar por páginas de resultados,
so that não receba mensagens muito longas.

## Acceptance Criteria

1. **Given** comando de listagem com mais de 10 resultados
   **When** bot formata resposta
   **Then** mostra apenas 10 itens por página

2. **Given** lista paginada
   **When** mostrar footer
   **Then** indica "Página X de Y | Total: N apostas"
   **And** instrui como navegar: `/comando 2` para página 2

3. **Given** comando /apostas [página]
   **When** executado
   **Then** paginação já funciona (manter)

4. **Given** comando /filtrar [tipo] [página]
   **When** executado com página
   **Then** mostra página especificada

5. **Given** comando /fila [página]
   **When** executado com página
   **Then** mostra página especificada

6. **Given** página inválida (ex: 999)
   **When** executada
   **Then** mostra última página válida

## Tasks / Subtasks

- [ ] Task 1: Criar helper de paginação (AC: #1, #2)
  - [ ] 1.1: Criar função `paginateResults(items, page, pageSize = 10)`
  - [ ] 1.2: Retornar { items, currentPage, totalPages, totalItems }
  - [ ] 1.3: Criar função `formatPaginationFooter(pagination, commandName)`

- [ ] Task 2: Atualizar regex FILTRAR_PATTERN (AC: #4)
  - [ ] 2.1: Alterar de `/^\/filtrar\s*(\w+)?$/i`
  - [ ] 2.2: Para `/^\/filtrar\s*(\w+)?\s*(\d+)?$/i`
  - [ ] 2.3: Capturar grupo 2 como página

- [ ] Task 3: Atualizar handleFiltrarCommand (AC: #4)
  - [ ] 3.1: Aceitar parâmetro page
  - [ ] 3.2: Aplicar paginação
  - [ ] 3.3: Adicionar footer com instrução de navegação

- [ ] Task 4: Atualizar regex FILA_PATTERN (AC: #5)
  - [ ] 4.1: Alterar de `/^\/fila$/i`
  - [ ] 4.2: Para `/^\/fila\s*(\d+)?$/i`
  - [ ] 4.3: Capturar grupo 1 como página

- [ ] Task 5: Atualizar handleFilaCommand (AC: #5)
  - [ ] 5.1: Aceitar parâmetro page
  - [ ] 5.2: Aplicar paginação em ativas e novas
  - [ ] 5.3: Adicionar footer com instrução de navegação

- [ ] Task 6: Validar página existente (AC: #6)
  - [ ] 6.1: Se página > totalPages, usar totalPages
  - [ ] 6.2: Se página < 1, usar 1

- [ ] Task 7: Testar paginação (AC: #1-6)
  - [ ] 7.1: /filtrar semlink 2 - verificar página 2
  - [ ] 7.2: /fila 2 - verificar página 2
  - [ ] 7.3: /apostas 999 - verificar última página

## Dev Notes

### Paginação Existente (/apostas)

O comando /apostas já tem paginação implementada (linhas 200-205):

```javascript
// Pagination (10 per page for better formatting)
const PAGE_SIZE = 10;
const totalPages = Math.ceil(bets.length / PAGE_SIZE);
const currentPage = Math.min(Math.max(1, page), totalPages);
const startIdx = (currentPage - 1) * PAGE_SIZE;
const endIdx = startIdx + PAGE_SIZE;
```

### Helper paginateResults

```javascript
/**
 * Paginate array of results
 * @param {Array} items - Full array of items
 * @param {number} page - Requested page (1-indexed)
 * @param {number} pageSize - Items per page (default 10)
 * @returns {object} { items, currentPage, totalPages, totalItems }
 */
function paginateResults(items, page = 1, pageSize = 10) {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = startIdx + pageSize;

  return {
    items: items.slice(startIdx, endIdx),
    currentPage,
    totalPages,
    totalItems
  };
}
```

### Helper formatPaginationFooter

```javascript
/**
 * Format pagination footer for Telegram message
 * @param {object} pagination - From paginateResults
 * @param {string} commandName - Command for navigation hint
 * @returns {string}
 */
function formatPaginationFooter(pagination, commandName) {
  const { currentPage, totalPages, totalItems } = pagination;

  if (totalPages <= 1) {
    return `📊 Total: ${totalItems} apostas`;
  }

  const lines = [
    `━━━━━━━━━━━━━━━━━━━━`,
    `📄 Página ${currentPage} de ${totalPages} | Total: ${totalItems}`,
  ];

  if (currentPage < totalPages) {
    lines.push(`💡 Use \`${commandName} ${currentPage + 1}\` para próxima página`);
  }

  return lines.join('\n');
}
```

### Regex Updates

```javascript
// ANTES
const FILTRAR_PATTERN = /^\/filtrar\s*(\w+)?$/i;
const FILA_PATTERN = /^\/fila$/i;

// DEPOIS
const FILTRAR_PATTERN = /^\/filtrar\s*(\w+)?\s*(\d+)?$/i;
const FILA_PATTERN = /^\/fila\s*(\d+)?$/i;
```

### Handler Updates

```javascript
// handleFiltrarCommand
const filtrarMatch = text.match(FILTRAR_PATTERN);
if (filtrarMatch) {
  const filterType = filtrarMatch[1] || null;
  const page = filtrarMatch[2] ? parseInt(filtrarMatch[2], 10) : 1;
  await handleFiltrarCommand(bot, msg, filterType, page);
}

// handleFilaCommand
const filaMatch = text.match(FILA_PATTERN);
if (filaMatch) {
  const page = filaMatch[1] ? parseInt(filaMatch[1], 10) : 1;
  await handleFilaCommand(bot, msg, page);
}
```

### Comandos Afetados

| Comando | Status Atual | Ação |
|---------|--------------|------|
| `/apostas [N]` | ✅ Já tem paginação | Manter |
| `/filtrar [tipo] [N]` | ❌ Sem paginação | Adicionar |
| `/fila [N]` | ❌ Sem paginação | Adicionar |
| `/atualizados [N]` | Não existe | Criar com paginação (Story 14.9) |

### Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `bot/utils/formatters.js` | MODIFICAR | Adicionar helpers de paginação |
| `bot/handlers/adminGroup.js` | MODIFICAR | Atualizar patterns e handlers |

### Dependências

- Story 14.5 (agrupamento por dia) pode ser combinada com paginação
- Helpers devem funcionar juntos: `formatBetListWithDays` + `paginateResults`

### Project Structure Notes

- PAGE_SIZE = 10 (padrão do projeto)
- Paginação 1-indexed (página 1 é primeira)
- Footer sempre mostra total e instrução de navegação

### References

- [Source: bot/handlers/adminGroup.js:200-205] - Paginação existente em /apostas
- [Source: bot/handlers/adminGroup.js:20] - APOSTAS_PATTERN com página
- [Source: _bmad-output/planning-artifacts/epics.md#story-14.6] - Definição original

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/utils/formatters.js (modificar)
- bot/handlers/adminGroup.js (modificar)
