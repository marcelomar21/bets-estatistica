# Story 14.6: Adicionar Paginação em Todos os Comandos

Status: review

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

- [x] Task 1: Criar helper de paginação (AC: #1, #2)
  - [x] 1.1: Criar função `paginateResults(items, page, pageSize = 10)`
  - [x] 1.2: Retornar { items, currentPage, totalPages, totalItems }
  - [x] 1.3: Criar função `formatPaginationFooter(pagination, commandName)`

- [x] Task 2: Atualizar regex FILTRAR_PATTERN (AC: #4)
  - [x] 2.1: Alterar de `/^\/filtrar\s*(\w+)?$/i`
  - [x] 2.2: Para `/^\/filtrar\s*(\w+)?\s*(\d+)?$/i`
  - [x] 2.3: Capturar grupo 2 como página

- [x] Task 3: Atualizar handleFiltrarCommand (AC: #4)
  - [x] 3.1: Aceitar parâmetro page
  - [x] 3.2: Aplicar paginação
  - [x] 3.3: Adicionar footer com instrução de navegação

- [x] Task 4: Atualizar regex FILA_PATTERN (AC: #5)
  - [x] 4.1: Alterar de `/^\/fila$/i`
  - [x] 4.2: Para `/^\/fila\s*(\d+)?$/i`
  - [x] 4.3: Capturar grupo 1 como página

- [x] Task 5: Atualizar handleFilaCommand (AC: #5)
  - [x] 5.1: Aceitar parâmetro page
  - [x] 5.2: Aplicar paginação em ativas e novas
  - [x] 5.3: Adicionar footer com instrução de navegação

- [x] Task 6: Validar página existente (AC: #6)
  - [x] 6.1: Se página > totalPages, usar totalPages
  - [x] 6.2: Se página < 1, usar 1

- [x] Task 7: Testar paginação (AC: #1-6)
  - [x] 7.1: /filtrar semlink 2 - verificar página 2
  - [x] 7.2: /fila 2 - verificar página 2
  - [x] 7.3: /apostas 999 - verificar última página

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

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Verificação de sintaxe: `node --check bot/utils/formatters.js` - OK
- Verificação de sintaxe: `node --check bot/handlers/adminGroup.js` - OK
- Testes unitários: `npm test` - 138 testes passaram (6 suites, 9 novos testes para paginação)

### Completion Notes List

1. ✅ Criados helpers de paginação em formatters.js:
   - `paginateResults(items, page, pageSize)` - retorna { items, currentPage, totalPages, totalItems }
   - `formatPaginationFooter(pagination, commandName)` - formata footer com navegação
2. ✅ Atualizado FILTRAR_PATTERN para aceitar página: `/^\/filtrar(?:\s+(sem_odds|sem_link|com_link|com_odds|prontas))?(?:\s+(\d+))?$/i`
3. ✅ Atualizado handleFiltrarCommand para usar paginação (10 itens por página)
4. ✅ Atualizado FILA_PATTERN para aceitar página: `/^\/fila(?:\s+(\d+))?$/i`
5. ✅ Atualizado handleFilaCommand para usar paginação (10 itens por página)
6. ✅ Implementada validação de página (AC6): página inválida redireciona para última página válida
7. ✅ Footer de paginação mostra "Pagina X de Y | Total: N" e instrução de navegação
8. ✅ Comando /apostas já tinha paginação (mantido)
9. ✅ Adicionados 9 novos testes unitários para paginateResults e formatPaginationFooter

### Change Log

- 2026-01-14: Implementada paginação em /filtrar e /fila (10 por página)

### File List

- bot/utils/formatters.js (modificado) - adicionados paginateResults e formatPaginationFooter
- bot/handlers/adminGroup.js (modificado) - paginação em /filtrar e /fila
- __tests__/utils/formatters.test.js (modificado) - 9 novos testes
