# Story 14.9: Implementar Comando /atualizados

Status: ready-for-dev

## Story

As a operador,
I want consultar historico de atualizacoes,
so that saiba o que mudou nas ultimas horas.

## Acceptance Criteria

1. **Given** operador envia `/atualizados` no grupo admin
   **When** bot processa comando
   **Then** lista atualizacoes das ultimas 48 horas
   **And** agrupa por dia e hora
   **And** mostra tipo (odds ou analise) e IDs afetados

2. **Given** muitas atualizacoes no periodo
   **When** formatar lista
   **Then** tem paginacao (10 por pagina)
   **And** indica "Pagina X de Y"
   **And** instrui como navegar: `/atualizados 2`

3. **Given** atualizacoes de odds
   **When** exibir na lista
   **Then** mostra ID, valor anterior e novo (old -> new)
   **And** agrupa por horario do job

4. **Given** nenhuma atualizacao no periodo
   **When** operador envia `/atualizados`
   **Then** mostra mensagem informativa
   **And** indica periodo consultado (48h)

5. **Given** comando com parametro de pagina
   **When** operador envia `/atualizados 2`
   **Then** exibe pagina 2 dos resultados
   **And** mantem formatacao consistente

## Tasks / Subtasks

- [ ] Task 1: Adicionar regex para comando /atualizados (AC: #1, #5)
  - [ ] 1.1: Definir ATUALIZADOS_PATTERN em adminGroup.js
  - [ ] 1.2: Aceitar formato `/atualizados` e `/atualizados N`

- [ ] Task 2: Criar funcao getOddsHistory em betService.js (AC: #1)
  - [ ] 2.1: Definir interface (periodo em horas, limit, offset)
  - [ ] 2.2: Query tabela odds_update_history
  - [ ] 2.3: Ordenar por created_at DESC
  - [ ] 2.4: Retornar com join em suggested_bets para dados do jogo

- [ ] Task 3: Implementar handleAtualizadosCommand (AC: #1, #2, #3)
  - [ ] 3.1: Buscar historico das ultimas 48h
  - [ ] 3.2: Agrupar por dia (HOJE/ONTEM)
  - [ ] 3.3: Dentro de cada dia, agrupar por hora/job
  - [ ] 3.4: Formatar mensagem com emojis e markdown

- [ ] Task 4: Implementar paginacao (AC: #2, #5)
  - [ ] 4.1: Definir PAGE_SIZE = 10
  - [ ] 4.2: Calcular total de paginas
  - [ ] 4.3: Adicionar footer com navegacao

- [ ] Task 5: Tratar caso sem atualizacoes (AC: #4)
  - [ ] 5.1: Verificar se resultado vazio
  - [ ] 5.2: Mostrar mensagem amigavel

- [ ] Task 6: Registrar handler no processamento de mensagens (AC: #1)
  - [ ] 6.1: Adicionar match para ATUALIZADOS_PATTERN
  - [ ] 6.2: Chamar handleAtualizadosCommand

## Dev Notes

### Dependencias

**IMPORTANTE:** Esta story DEPENDE de:
- **Story 14.7:** Tabela odds_update_history deve existir
- **Story 14.8:** Registros devem estar sendo inseridos

### Regex do Comando

```javascript
// Regex to match "/atualizados" or "/atualizados N" command (Story 14.9)
const ATUALIZADOS_PATTERN = /^\/atualizados(?:\s+(\d+))?$/i;
```

### Funcao getOddsHistory em betService.js

```javascript
/**
 * Busca historico de atualizacoes de odds (Story 14.9)
 * @param {number} hoursBack - Quantas horas atras buscar (default: 48)
 * @param {number} limit - Limite de registros (default: 100)
 * @param {number} offset - Offset para paginacao (default: 0)
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getOddsHistory(hoursBack = 48, limit = 100, offset = 0) {
  try {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    const { data, error, count } = await supabase
      .from('odds_update_history')
      .select(`
        id,
        bet_id,
        update_type,
        old_value,
        new_value,
        job_name,
        created_at,
        suggested_bets!inner (
          bet_market,
          league_matches!inner (
            home_team_name,
            away_team_name
          )
        )
      `, { count: 'exact' })
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error('Erro ao buscar historico de odds', { error: error.message });
      return { success: false, error: { code: 'DB_ERROR', message: error.message } };
    }

    const history = (data || []).map(h => ({
      id: h.id,
      betId: h.bet_id,
      updateType: h.update_type,
      oldValue: h.old_value,
      newValue: h.new_value,
      jobName: h.job_name,
      createdAt: h.created_at,
      betMarket: h.suggested_bets?.bet_market,
      homeTeamName: h.suggested_bets?.league_matches?.home_team_name,
      awayTeamName: h.suggested_bets?.league_matches?.away_team_name,
    }));

    return {
      success: true,
      data: {
        history,
        total: count || 0,
        limit,
        offset
      }
    };

  } catch (err) {
    logger.error('Erro inesperado ao buscar historico', { error: err.message });
    return { success: false, error: { code: 'FETCH_ERROR', message: err.message } };
  }
}
```

### Handler handleAtualizadosCommand

```javascript
/**
 * Handle /atualizados command - Lista historico de atualizacoes (Story 14.9)
 * Usage: /atualizados or /atualizados 2 (for page 2)
 */
async function handleAtualizadosCommand(bot, msg, page = 1) {
  logger.info('Received /atualizados command', { chatId: msg.chat.id, page });

  const PAGE_SIZE = 10;
  const offset = (page - 1) * PAGE_SIZE;

  const result = await getOddsHistory(48, 100, 0); // Buscar todos para agrupar

  if (!result.success) {
    await bot.sendMessage(
      msg.chat.id,
      `Erro ao buscar historico: ${result.error.message}`,
      { reply_to_message_id: msg.message_id }
    );
    return;
  }

  const { history, total } = result.data;

  if (history.length === 0) {
    await bot.sendMessage(
      msg.chat.id,
      `*HISTORICO DE ATUALIZACOES*\n\nNenhuma atualizacao nas ultimas 48 horas.\n\n_Atualizacoes aparecem apos jobs de enrichOdds ou comandos /odds_`,
      { parse_mode: 'Markdown' }
    );
    return;
  }

  // Agrupar por dia e hora
  const grouped = groupHistoryByDayAndHour(history);

  // Formatar mensagem
  let message = `*HISTORICO DE ATUALIZACOES* (Pag ${page})\n\n`;

  const days = Object.keys(grouped).sort().reverse();
  let itemCount = 0;
  let startIndex = offset;
  let endIndex = offset + PAGE_SIZE;

  for (const day of days) {
    const dayLabel = formatDayLabel(day);
    message += `━━━━ *${dayLabel}* ━━━━\n\n`;

    const hours = Object.keys(grouped[day]).sort().reverse();
    for (const hour of hours) {
      const items = grouped[day][hour];
      for (const item of items) {
        if (itemCount >= startIndex && itemCount < endIndex) {
          message += formatHistoryItem(item);
        }
        itemCount++;
      }
    }
  }

  // Footer com paginacao
  const totalPages = Math.ceil(total / PAGE_SIZE);
  message += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;
  message += `Pagina ${page} de ${totalPages}\n`;
  if (page < totalPages) {
    message += `Use \`/atualizados ${page + 1}\` para mais`;
  }

  await bot.sendMessage(msg.chat.id, message, { parse_mode: 'Markdown' });
}

// Helpers
function groupHistoryByDayAndHour(history) {
  const grouped = {};
  for (const item of history) {
    const date = new Date(item.createdAt);
    const day = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const hour = `${date.getHours().toString().padStart(2, '0')}:00`;

    if (!grouped[day]) grouped[day] = {};
    if (!grouped[day][hour]) grouped[day][hour] = [];
    grouped[day][hour].push(item);
  }
  return grouped;
}

function formatDayLabel(day) {
  const date = new Date(day + 'T12:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (day === today.toISOString().split('T')[0]) {
    return `HOJE - ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  }
  if (day === yesterday.toISOString().split('T')[0]) {
    return `ONTEM - ${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatHistoryItem(item) {
  const time = new Date(item.createdAt).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });

  const match = item.homeTeamName && item.awayTeamName
    ? `${item.homeTeamName} x ${item.awayTeamName}`
    : `#${item.betId}`;

  if (item.updateType === 'odds_change') {
    return `${time} #${item.betId}\n   ${match}\n   ${item.oldValue?.toFixed(2) || '?'} -> ${item.newValue?.toFixed(2)}\n\n`;
  }
  if (item.updateType === 'new_analysis') {
    return `${time} #${item.betId} (nova)\n   ${match}\n   Odd: ${item.newValue?.toFixed(2)}\n\n`;
  }
  return `${time} #${item.betId}\n   ${item.updateType}: ${item.newValue}\n\n`;
}
```

### Formato de Saida

```
*HISTORICO DE ATUALIZACOES* (Pag 1/2)

━━━━ *HOJE - 14/01* ━━━━

13:00 #45
   Liverpool vs Arsenal
   1.85 -> 1.92

13:00 #52
   Man City vs Chelsea
   1.68 -> 1.71

08:00 #61 (nova)
   Bayern vs Dortmund
   Odd: 1.75

━━━━ *ONTEM - 13/01* ━━━━

20:00 #41
   Real Madrid vs Barcelona
   1.72 -> 1.78

━━━━━━━━━━━━━━━━━━━━

Pagina 1 de 2
Use `/atualizados 2` para mais
```

### Arquivos a Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `bot/handlers/adminGroup.js` | MODIFICAR | Adicionar ATUALIZADOS_PATTERN e handler |
| `bot/services/betService.js` | MODIFICAR | Adicionar getOddsHistory e exportar |

### Adicao ao Handler Principal

```javascript
// Em adminGroup.js, no processamento de mensagens:

// Check for /atualizados command (Story 14.9)
const atualizadosMatch = text.match(ATUALIZADOS_PATTERN);
if (atualizadosMatch) {
  const page = atualizadosMatch[1] ? parseInt(atualizadosMatch[1], 10) : 1;
  await handleAtualizadosCommand(bot, msg, page);
  return;
}
```

### Project Structure Notes

- Segue padrao de outros comandos de listagem (/apostas, /filtrar)
- Paginacao consistente com PAGE_SIZE = 10
- Agrupamento por dia facilita leitura
- Formato Markdown para melhor visualizacao

### References

- [Source: bot/handlers/adminGroup.js:157-255] - handleApostasCommand (referencia paginacao)
- [Source: bot/services/betService.js:997-1154] - getFilaStatus (referencia formatacao)
- [Source: _bmad-output/planning-artifacts/epics.md#story-14.9] - Definicao original
- [Source: _bmad-output/implementation-artifacts/14-7-criar-tabela-odds-update-history.md] - Dependencia
- [Source: _bmad-output/implementation-artifacts/14-8-registrar-mudancas-odds-historico.md] - Dependencia

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- bot/handlers/adminGroup.js (modificar)
- bot/services/betService.js (modificar)
