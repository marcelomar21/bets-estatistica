# Story 5.5: Controle de Postagem no Painel Admin

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Super Admin / Admin de grupo**,
I want controlar postagens automaticas pelo painel admin,
So that eu possa ligar/desligar postagens, configurar horarios, ver a fila e disparar postagens manualmente.

## Acceptance Criteria

1. **AC1: Toggle liga/desliga postagem automatica por grupo**
   - Given o admin esta logado no painel e acessa as configuracoes do grupo
   - When altera o toggle de postagem automatica
   - Then o campo `posting_schedule.enabled` e atualizado no banco (tabela `groups`, coluna JSONB)
   - And quando `enabled = false`, os cron jobs do bot NAO executam postagem automatica (job roda mas verifica flag e sai silenciosamente)
   - And quando `enabled = true`, os cron jobs do bot executam postagem nos horarios configurados
   - And o bot recarrega a configuracao periodicamente (a cada 5 min) sem necessidade de restart
   - And tanto Super Admin quanto Admin de Grupo podem alterar o toggle do seu grupo

2. **AC2: Configuracao de horarios de postagem pelo painel**
   - Given o admin esta na tela de configuracao do grupo
   - When adiciona/remove horarios de postagem via time picker
   - Then pode configurar multiplos horarios (ex: 10:00, 15:00, 22:00)
   - And horarios sao salvos em `posting_schedule.times[]` como array de strings `"HH:mm"` em JSONB
   - And interface e user-friendly: inputs `type="time"` nativos, nao expressoes cron
   - And minimo 1 horario, maximo 12 horarios por grupo
   - And validacao impede horarios duplicados
   - And o bot recria cron jobs dinamicamente baseado nos horarios do banco (no proximo reload)
   - And distribuicao automatica e agendada 5 min antes de cada horario configurado

3. **AC3: Visualizacao da fila de postagem no painel**
   - Given o admin esta na pagina de apostas (`/bets`)
   - When visualiza o painel
   - Then ve um card "Proxima Postagem" com: horario da proxima postagem, apostas prontas (ready), pendencias (sem link/odds)
   - And dados sao buscados via API Route que consulta a fila do grupo
   - And card mostra status visual por aposta: pronta, faltando link, faltando odds
   - And card atualiza via refresh manual (botao) ou ao navegar para a pagina
   - And Group Admin ve apenas fila do seu grupo; Super Admin pode filtrar por grupo

4. **AC4: Botao "Postar Agora" no painel**
   - Given o admin esta na pagina de apostas e existem apostas prontas na fila
   - When clica no botao "Postar Agora"
   - Then um dialog de confirmacao aparece mostrando quantas apostas serao postadas
   - And ao confirmar, o admin panel grava `post_now_requested_at = now()` na tabela `groups`
   - And bot detecta a flag (polling a cada 30s) e executa `runPostBets(true)` imediatamente
   - And bot limpa a flag apos execucao (`post_now_requested_at = NULL`)
   - And admin ve feedback: "Postagem solicitada" → atualiza card da fila para refletir resultado
   - And botao fica desabilitado durante processamento (loading state)
   - And se nao ha apostas prontas, botao fica desabilitado com tooltip "Nenhuma aposta pronta"

5. **AC5: Distribuicao automatica antes dos horarios configurados**
   - Given horarios de postagem estao configurados para o grupo
   - When se aproxima um horario de postagem (5 minutos antes)
   - Then o bot agenda automaticamente `runDistributeBets()` 5 minutos antes de cada horario configurado
   - And a distribuicao e dinamica: quando horarios mudam no banco, os cron jobs de distribuicao tambem mudam no proximo reload
   - And distribuicao continua idempotente (filtra `group_id IS NULL`)

## Tasks / Subtasks

- [x] Task 1: Migration SQL — Adicionar `posting_schedule` e `post_now_requested_at` na tabela `groups` (AC: #1, #2, #4)
  - [x] 1.1 Criar `sql/migrations/027_add_posting_schedule.sql` com:
    - Coluna `posting_schedule JSONB DEFAULT '{"enabled": true, "times": ["10:00", "15:00", "22:00"]}'::jsonb`
    - Coluna `post_now_requested_at TIMESTAMPTZ DEFAULT NULL`
  - [x] 1.2 Atualizar tipos TypeScript em `admin-panel/src/types/database.ts` com as novas colunas

- [x] Task 2: Bot — Scheduler dinamico com reload periodico (AC: #1, #2, #5)
  - [x] 2.1 Criar funcao `loadPostingSchedule()` que le `posting_schedule` do grupo no banco
  - [x] 2.2 Criar funcao `setupDynamicScheduler(schedule)` que:
    - Destroi cron jobs de postagem/distribuicao antigos (`.stop()` e remove referencia)
    - Cria novos cron jobs baseados nos horarios `schedule.times[]`
    - Cria cron jobs de distribuicao 5 min antes de cada horario
    - Cada job de postagem verifica `schedule.enabled` antes de executar
  - [x] 2.3 Na inicializacao do bot (`startServer()`), chamar `loadPostingSchedule()` + `setupDynamicScheduler()`
  - [x] 2.4 Adicionar `setInterval(reloadPostingSchedule, 5 * 60 * 1000)` para refresh periodico
  - [x] 2.5 Funcao `reloadPostingSchedule()`: recarrega do banco, compara com config atual, se mudou chama `setupDynamicScheduler()` novamente
  - [x] 2.6 Remover cron jobs hardcoded de postagem (10:00, 15:00, 22:00) e distribuicao (09:55, 14:55, 21:55) — substituidos pelo dinamico
  - [x] 2.7 MANTER cron jobs NAO relacionados a postagem (health check, kick-expired, etc) — eles continuam hardcoded

- [x] Task 3: Bot — Polling de "Postar Agora" via flag no banco (AC: #4)
  - [x] 3.1 Adicionar check no `setInterval` existente (30s do webhook processing) ou novo interval:
    - Query: `SELECT post_now_requested_at FROM groups WHERE id = GROUP_ID AND post_now_requested_at IS NOT NULL`
    - Se flag existe: executar `runPostBets(true)`, depois limpar flag: `UPDATE groups SET post_now_requested_at = NULL WHERE id = GROUP_ID`
  - [x] 3.2 Logging: `logger.info('[scheduler] Post Now requested via admin panel', { groupId, requestedAt })`
  - [x] 3.3 Se `runPostBets()` falhar, limpar flag mesmo assim (nao ficar em loop)

- [x] Task 4: Bot — Atualizar `getNextPostTime()` para ser dinamico (AC: #3)
  - [x] 4.1 Modificar `getNextPostTime()` em `betService.js` para aceitar array de horarios como parametro: `getNextPostTime(postTimes)`
  - [x] 4.2 Se parametro nao for passado, usar default `[10, 15, 22]` (backward compatible)
  - [x] 4.3 Bot passa os horarios da config atual ao chamar `getNextPostTime()`

- [x] Task 5: Admin Panel — API de posting schedule (AC: #1, #2)
  - [x] 5.1 Estender schema Zod no `PUT /api/groups/[groupId]/route.ts` para aceitar `posting_schedule`:
    ```typescript
    posting_schedule: z.object({
      enabled: z.boolean(),
      times: z.array(z.string().regex(/^\d{2}:\d{2}$/)).min(1).max(12)
    }).optional()
    ```
  - [x] 5.2 Validacao adicional: sem horarios duplicados em `times[]`
  - [x] 5.3 Usar `createApiHandler` com `allowedRoles: ['super_admin', 'group_admin']`
  - [x] 5.4 Group Admin so pode alterar schedule do proprio grupo (withTenant garante)

- [x] Task 6: Admin Panel — UI de configuracao de postagem no grupo (AC: #1, #2)
  - [x] 6.1 Adicionar secao "Postagem Automatica" no `GroupEditForm.tsx`:
    - Toggle switch para `enabled`
    - Lista de horarios com inputs `type="time"`
    - Botoes "Adicionar Horario" / "Remover" por horario
    - Validacao: min 1, max 12, sem duplicados
  - [x] 6.2 Estado inicial carregado do `posting_schedule` do grupo (API GET)
  - [x] 6.3 Submit envia `posting_schedule` junto com demais campos do form

- [x] Task 7: Admin Panel — API da fila de postagem (AC: #3)
  - [x] 7.1 Criar `GET /api/bets/queue/route.ts`:
    - Usar `createApiHandler` com `allowedRoles: ['super_admin', 'group_admin']`
    - Query: apostas com `bet_status IN ('generated', 'pending_link', 'pending_odds', 'ready')` e `group_id = groupFilter`
    - Retornar: `readyCount`, `pendingLinkCount`, `pendingOddsCount`, lista resumida das apostas
    - Calcular `nextPostTime` baseado no `posting_schedule.times[]` do grupo
  - [x] 7.2 Incluir `posting_schedule` do grupo na response (enabled + times)

- [x] Task 8: Admin Panel — Card da fila de postagem (AC: #3)
  - [x] 8.1 Criar componente `PostingQueueCard.tsx` em `components/features/bets/`:
    - Exibe: "Proxima Postagem: 15:00 (em 2h)"
    - Contadores: "3 prontas | 2 faltando link | 1 faltando odds"
    - Badge de status: postagem habilitada/desabilitada
    - Botao de refresh manual
  - [x] 8.2 Integrar no topo da pagina `/bets/page.tsx`, acima da tabela de apostas

- [x] Task 9: Admin Panel — API e botao "Postar Agora" (AC: #4)
  - [x] 9.1 Criar `POST /api/bets/post-now/route.ts`:
    - Usar `createApiHandler` com `allowedRoles: ['super_admin', 'group_admin']`
    - Gravar `post_now_requested_at = now()` na tabela `groups` para o grupo do admin
    - Retornar `{ success: true, data: { message: 'Postagem solicitada' } }`
  - [x] 9.2 Criar componente `PostNowButton.tsx`:
    - Botao com dialog de confirmacao (AlertDialog)
    - Mostra quantas apostas prontas serao postadas
    - Loading state durante processamento
    - Desabilitado se `readyCount === 0`
  - [x] 9.3 Integrar botao no `PostingQueueCard.tsx`

- [x] Task 10: Testes (AC: #1-#5)
  - [x] 10.1 Testes bot: scheduler dinamico (criacao/destruicao de cron jobs, reload, toggle)
  - [x] 10.2 Testes bot: polling "Postar Agora" (detecta flag, executa, limpa)
  - [x] 10.3 Testes admin: API posting-schedule (validacao Zod, update, roles)
  - [x] 10.4 Testes admin: API bets/queue (retorno correto, filtragem multi-tenant)
  - [x] 10.5 Testes admin: API bets/post-now (grava flag, resposta)
  - [x] 10.6 Testes admin: componentes UI (PostingQueueCard, PostNowButton)

- [x] Task 11: Regressao completa (OBRIGATORIO antes de PR)
  - [x] 11.1 Rodar `npm test` no bot — todos os testes existentes devem passar (856/856)
  - [x] 11.2 Rodar `npm test` no admin-panel — todos os testes existentes devem passar (519/519)
  - [x] 11.3 Verificar que cron jobs NAO-postagem (health check, kick-expired, etc) continuam funcionando
  - [x] 11.4 Verificar que postagem manual via `/postar` no Telegram continua funcionando

## Dev Notes

### Contexto Critico: EXTENSAO do scheduling existente — substituir hardcoded por dinamico

**IMPORTANTE:** O scheduler de postagem JA EXISTE com 6 cron jobs hardcoded no `server.js` (Story 5.4). Esta story SUBSTITUI esses cron jobs hardcoded por um sistema dinamico que le horarios do banco de dados. NAO recriar mecanismos de postagem — apenas mudar como os horarios sao definidos.

### Componentes JA Existentes (NAO RECRIAR)

| Componente | Arquivo | O que ja faz |
|------------|---------|--------------|
| `runPostBets(skipConfirmation)` | `bot/jobs/postBets.js` | Job completo de postagem com confirmacao + auto-post |
| `getFilaStatus(groupId)` | `bot/services/betService.js` | Fonte unica de verdade: apostas ativas + novas elegiveis |
| `getNextPostTime()` | `bot/services/betService.js` | Calcula proximo horario (MODIFICAR para aceitar array) |
| `validateBetForPosting()` | `bot/jobs/postBets.js` | Valida deep_link, odds >= 1.60, promovida_manual, kickoff futuro |
| `markBetAsPosted()` | `bot/services/betService.js` | Atualiza status + telegram_posted_at + message_id + odds_at_post |
| `formatBetMessage()` | `bot/jobs/postBets.js` | Formata mensagem com template + LLM copy + link |
| `sendToPublic()` | `bot/telegram.js` | Envia mensagem ao grupo publico do Telegram |
| `sendPostWarn()` | `bot/jobs/jobWarn.js` | Envia resumo ao grupo admin apos postagem |
| `runDistributeBets()` | `bot/jobs/distributeBets.js` | Round-robin de apostas entre grupos ativos |
| `withExecutionLogging()` | `bot/services/jobExecutionService.js` | Wrapper para logging de execucao de jobs |
| `createApiHandler()` | `admin-panel/src/middleware/api-handler.ts` | Wrapper de API Routes com tenant + roles |
| `GroupEditForm` | `admin-panel/src/components/features/groups/GroupEditForm.tsx` | Form de edicao de grupo (ESTENDER) |
| Scheduler (node-cron) | `bot/server.js` | Agendamento — SUBSTITUIR postagem/distribuicao por dinamico |

### O que CRIAR/MODIFICAR nesta story

| Tipo | Arquivo | Descricao |
|------|---------|-----------|
| **NOVO** | `sql/migrations/027_add_posting_schedule.sql` | Migration: posting_schedule JSONB + post_now_requested_at |
| **MODIFICAR** | `bot/server.js` | Substituir 6 cron jobs hardcoded por scheduler dinamico; adicionar reload + polling post-now |
| **MODIFICAR** | `bot/services/betService.js` | `getNextPostTime()` aceitar array de horarios como parametro |
| **MODIFICAR** | `admin-panel/src/app/api/groups/[groupId]/route.ts` | Aceitar `posting_schedule` no PUT |
| **MODIFICAR** | `admin-panel/src/components/features/groups/GroupEditForm.tsx` | Secao de configuracao de postagem |
| **MODIFICAR** | `admin-panel/src/app/(auth)/bets/page.tsx` | Integrar PostingQueueCard e PostNowButton |
| **NOVO** | `admin-panel/src/app/api/bets/queue/route.ts` | API: status da fila de postagem |
| **NOVO** | `admin-panel/src/app/api/bets/post-now/route.ts` | API: disparar postagem manual via flag |
| **NOVO** | `admin-panel/src/components/features/bets/PostingQueueCard.tsx` | Card da fila com contadores |
| **NOVO** | `admin-panel/src/components/features/bets/PostNowButton.tsx` | Botao com dialog de confirmacao |
| **NOVO** | Testes bot scheduler dinamico | Testes unitarios do novo scheduler |
| **NOVO** | Testes admin APIs + componentes | Testes das novas APIs e componentes UI |

### Arquitetura: Comunicacao Admin Panel → Bot ("Postar Agora")

**Decisao: Database Flag Polling** (opcao mais simples, sem nova infraestrutura)

```
Admin Panel                  Supabase                    Bot
    |                           |                         |
    |-- POST /api/bets/post-now |                         |
    |                           |                         |
    |   UPDATE groups           |                         |
    |   SET post_now_requested_at = now()                 |
    |   WHERE id = groupId      |                         |
    |                           |                         |
    |                           |  (polling cada 30s)     |
    |                           |<--- SELECT post_now_... |
    |                           |                         |
    |                           |  flag found!            |
    |                           |                         |
    |                           |  runPostBets(true)      |
    |                           |                         |
    |                           |<--- UPDATE groups       |
    |                           |     SET post_now_requested_at = NULL
    |                           |                         |
```

**Por que flag polling e nao Supabase Realtime?**
- Bot JA usa polling a cada 30s para webhooks (setInterval existente)
- Adicionar mais um check no mesmo interval e trivial
- Nao adiciona nova dependencia (Realtime channels)
- Latencia de 0-30s e aceitavel para "Postar Agora"
- Simplicidade > complexidade

### Arquitetura: Scheduler Dinamico no Bot

```javascript
// ANTES (Story 5.4 — hardcoded):
cron.schedule('55 9 * * *', ...);   // distribute 09:55
cron.schedule('0 10 * * *', ...);   // post 10:00
cron.schedule('55 14 * * *', ...);  // distribute 14:55
cron.schedule('0 15 * * *', ...);   // post 15:00
cron.schedule('55 21 * * *', ...);  // distribute 21:55
cron.schedule('0 22 * * *', ...);   // post 22:00

// DEPOIS (Story 5.5 — dinamico):
let activePostingJobs = [];   // Referencia para .stop()
let currentSchedule = null;   // Cache para comparacao

async function loadPostingSchedule() {
  const { data } = await supabase
    .from('groups')
    .select('posting_schedule')
    .eq('id', config.membership.groupId)
    .single();
  return data?.posting_schedule || { enabled: true, times: ['10:00', '15:00', '22:00'] };
}

function setupDynamicScheduler(schedule) {
  // 1. Parar jobs antigos
  activePostingJobs.forEach(job => job.stop());
  activePostingJobs = [];

  // 2. Criar novos jobs para cada horario
  for (const time of schedule.times) {
    const [hours, minutes] = time.split(':').map(Number);

    // Job de distribuicao (5 min antes)
    const distMinutes = minutes >= 5 ? minutes - 5 : 55 + minutes;
    const distHours = minutes >= 5 ? hours : hours - 1;
    if (distHours >= 0) {
      const distJob = cron.schedule(`${distMinutes} ${distHours} * * *`, async () => {
        // ... runDistributeBets()
      }, { timezone: TZ });
      activePostingJobs.push(distJob);
    }

    // Job de postagem
    const postJob = cron.schedule(`${minutes} ${hours} * * *`, async () => {
      if (!schedule.enabled) {
        logger.info('[scheduler] Posting disabled for group, skipping', { groupId });
        return;
      }
      await withExecutionLogging('post-bets', () => runPostBets(true));
    }, { timezone: TZ });
    activePostingJobs.push(postJob);
  }
}

// Refresh periodico
setInterval(async () => {
  const newSchedule = await loadPostingSchedule();
  if (JSON.stringify(newSchedule) !== JSON.stringify(currentSchedule)) {
    logger.info('[scheduler] Posting schedule changed, reconfiguring', {
      old: currentSchedule, new: newSchedule
    });
    setupDynamicScheduler(newSchedule);
    currentSchedule = newSchedule;
  }
}, 5 * 60 * 1000);
```

**ATENCAO ao `enabled` check:** O check de `enabled` deve ser feito NO MOMENTO DA EXECUCAO do cron job (nao na criacao). Isso permite que o admin desabilite postagens e a mudanca tenha efeito imediato (no proximo ciclo de 5 min de reload, os jobs recriam com `enabled` atualizado). OU, cada job pode re-consultar o banco antes de executar — mais seguro mas com query extra.

### Schema: Novas Colunas na Tabela `groups`

```sql
-- Migration 027_add_posting_schedule.sql
ALTER TABLE groups
ADD COLUMN posting_schedule JSONB DEFAULT '{"enabled": true, "times": ["10:00", "15:00", "22:00"]}'::jsonb;

ALTER TABLE groups
ADD COLUMN post_now_requested_at TIMESTAMPTZ DEFAULT NULL;

-- Adicionar constraint para validar estrutura JSONB
ALTER TABLE groups
ADD CONSTRAINT check_posting_schedule CHECK (
  posting_schedule IS NULL
  OR (
    posting_schedule ? 'enabled'
    AND posting_schedule ? 'times'
    AND jsonb_typeof(posting_schedule -> 'enabled') = 'boolean'
    AND jsonb_typeof(posting_schedule -> 'times') = 'array'
  )
);

COMMENT ON COLUMN groups.posting_schedule IS 'Configuracao de postagem automatica: {enabled: bool, times: ["HH:mm",...]}';
COMMENT ON COLUMN groups.post_now_requested_at IS 'Flag para postagem manual imediata via admin panel — bot limpa apos execucao';
```

**DEFAULT `enabled: true`** para backward compatibility — grupos existentes continuam postando nos horarios padrao.

### Cron Jobs que PERMANECEM hardcoded (NAO remover)

| Cron | Job | Motivo |
|------|-----|--------|
| `0 8 * * *` | morning-prep (enrich-odds) | Pre-analise, nao depende de schedule do grupo |
| `*/5 * * * *` | health-check | Monitoramento, independente |
| `1 0 * * *` | kick-expired | Membership, independente |
| `30 0 * * *` | check-affiliate-expiration | Affiliates, independente |
| `0 10 * * *` | renewal-reminders | Membership, independente (manter SEPARADO do post-bets) |
| interval 30s | process-webhooks | Webhooks, independente |

**IMPORTANTE:** O cron job de `10:00` no server.js atualmente roda TANTO `renewal-reminders` QUANTO `post-bets`. Ao dinamizar, separar: `renewal-reminders` fica hardcoded em `0 10 * * *`, e `post-bets` passa pro scheduler dinamico.

### Componente PostingQueueCard — Mockup Visual

```
┌─────────────────────────────────────────────────┐
│ Proxima Postagem                          [↻]   │
├─────────────────────────────────────────────────┤
│                                                 │
│  ⏰ 15:00 (em 2h)       ● Postagem habilitada  │
│                                                 │
│  ┌─────┐  ┌─────────┐  ┌──────────┐            │
│  │  3  │  │    2    │  │    1     │            │
│  │ready│  │sem link │  │sem odds  │            │
│  └─────┘  └─────────┘  └──────────┘            │
│                                                 │
│  [Postar Agora]                                 │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Admin Panel — Padrao de Time Picker

```tsx
// Exemplo de UI para configuracao de horarios
<div className="space-y-2">
  <label className="text-sm font-medium">Horarios de Postagem</label>
  {times.map((time, index) => (
    <div key={index} className="flex items-center gap-2">
      <input
        type="time"
        value={time}
        onChange={(e) => updateTime(index, e.target.value)}
        className="border rounded px-3 py-1"
      />
      {times.length > 1 && (
        <button onClick={() => removeTime(index)} className="text-red-500">
          Remover
        </button>
      )}
    </div>
  ))}
  {times.length < 12 && (
    <button onClick={addTime} className="text-blue-500 text-sm">
      + Adicionar Horario
    </button>
  )}
</div>
```

### Padrao createApiHandler — Referencia para novas APIs

```typescript
// admin-panel/src/middleware/api-handler.ts
export const GET = createApiHandler(
  async (req, context) => {
    const { supabase, groupFilter, role, user } = context;
    // groupFilter = null para super_admin, uuid para group_admin

    let query = supabase.from('table').select('*');
    if (groupFilter) {
      query = query.eq('group_id', groupFilter);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  },
  { allowedRoles: ['super_admin', 'group_admin'] }
);
```

### Learnings da Story 5.4 (Anterior)

- **`withLock()` NAO existe** no `jobExecutionService.js` — a story 5.4 DevNotes estavam incorretas sobre isso. O DB-level guard (`group_id IS NULL` WHERE clause) e suficiente para idempotencia da distribuicao.
- **`runPostBets(true)` retorna objeto detalhado:** `{ reposted, posted, skipped, totalSent, cancelled }` — util para feedback no UI do "Postar Agora".
- **Startup pending bets query:** Usa `league_matches.kickoff_time` (nao `suggested_bets.kickoff_time` que nao existe). Fix aplicado na 5.4 review.
- **Falha parcial nao aborta:** Se uma aposta falha postagem, as demais continuam — padrao ja implementado.
- **Suite de testes bot:** 39 suites / 837 testes passando (baseline pos-5.4).
- **Suite de testes admin:** 498 testes em 45 arquivos (baseline pos-5.3).
- **`runDistributeBetsWithFailureGuard()`:** Wrapper que propaga failures do `runDistributeBets()` corretamente para `withExecutionLogging()`. Usar este wrapper nos novos cron jobs dinamicos tambem.

### Git Intelligence

**Commits recentes (Epic 5):**
```
0d361c1 Merge PR #32 (story 5.3 - links management)
9b45b77 feat(admin): close story 5.3 with code review fixes
0017957 Merge PR #31 (story 5.2 - odds management)
4457962 feat(admin): close story 5.2 with review fixes
5e0eaaa Merge PR #30 (story 5.1 - round-robin distribution)
```

**Branch atual:** `feature/story-5.4-postagem-automatica-de-apostas-nos-grupos-telegram` (review)

**Branch para esta story:** `feature/story-5.5-controle-de-postagem-no-painel-admin`
- Criar a partir de `master` apos merge da 5.4

**Commit pattern:** `feat(admin,bot): implement posting control panel (story 5.5)`

### Riscos e Mitigacoes

| Risco | Impacto | Mitigacao |
|-------|---------|-----------|
| Bot nao recarrega schedule (crash no reload) | Horarios antigos persistem | Try/catch no reload; se falhar, manter schedule anterior |
| Race condition no post-now polling | Postagem duplicada | Limpar flag ANTES de executar `runPostBets()`; ou usar `UPDATE ... RETURNING` atomico |
| Cron jobs orfaos (nao parados antes de recriar) | Memory leak, jobs duplicados | Manter array `activePostingJobs` e chamar `.stop()` em TODOS antes de recriar |
| Admin configura horario invalido (ex: 25:99) | Cron job falha | Validacao Zod no frontend E backend; regex `/^\d{2}:\d{2}$/` + check 0-23:0-59 |
| Distribuicao roda sem apostas para distribuir | Noop silencioso | Ja e idempotente — OK, termina sem erro |
| Posting disabled mas admin clica "Postar Agora" | Confusao UX | "Postar Agora" funciona INDEPENDENTE do toggle — e acao manual explicita |

### Project Structure Notes

**Alinhamento com estrutura existente:**
```
bot/
├── server.js                  # MODIFICAR - scheduler dinamico, post-now polling
├── services/
│   └── betService.js          # MODIFICAR - getNextPostTime() parametrizado
├── jobs/
│   ├── postBets.js            # NAO MODIFICAR
│   ├── distributeBets.js      # NAO MODIFICAR
│   └── __tests__/
│       ├── postBets.test.js   # NAO MODIFICAR (testes 5.4)
│       └── scheduler.test.js  # NOVO (testes scheduler dinamico)

admin-panel/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── groups/[groupId]/route.ts  # MODIFICAR - aceitar posting_schedule
│   │   │   └── bets/
│   │   │       ├── route.ts               # NAO MODIFICAR
│   │   │       ├── [id]/route.ts          # NAO MODIFICAR
│   │   │       ├── queue/route.ts         # NOVO
│   │   │       └── post-now/route.ts      # NOVO
│   │   └── (auth)/
│   │       ├── bets/page.tsx              # MODIFICAR - integrar cards
│   │       └── groups/[groupId]/edit/     # NAO MODIFICAR (GroupEditForm e importado)
│   ├── components/features/
│   │   ├── groups/
│   │   │   └── GroupEditForm.tsx           # MODIFICAR - secao postagem
│   │   └── bets/
│   │       ├── PostingQueueCard.tsx        # NOVO
│   │       └── PostNowButton.tsx          # NOVO
│   └── types/
│       └── database.ts                    # MODIFICAR - tipos novas colunas
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md - Epic 5, Story 5.5]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md - Multi-tenant, withTenant(), createApiHandler()]
- [Source: _bmad-output/project-context.md - Bet State Machine, Job Execution Pattern, Scheduler Pattern]
- [Source: _bmad-output/implementation-artifacts/stories/5-4-postagem-automatica-de-apostas-nos-grupos-telegram.md - Previous story learnings]
- [Source: bot/server.js - Scheduler atual (cron jobs hardcoded linhas 272-345)]
- [Source: bot/services/betService.js - getNextPostTime() (linha 1230), getFilaStatus() (linha 1260)]
- [Source: bot/jobs/postBets.js - runPostBets(skipConfirmation)]
- [Source: bot/jobs/distributeBets.js - runDistributeBets()]
- [Source: admin-panel/src/middleware/api-handler.ts - createApiHandler()]
- [Source: admin-panel/src/components/features/groups/GroupEditForm.tsx - Form existente]
- [Source: admin-panel/src/app/api/groups/[groupId]/route.ts - PUT schema]
- [Source: admin-panel/src/app/(auth)/bets/page.tsx - Pagina de apostas]
- [Source: sql/migrations/019_multitenant.sql - Schema tabela groups]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Bot test regression: 856/856 passing (41 suites)
- Admin test regression: 523/523 passing (47 files)
- Dynamic scheduler tested: 14 tests in scheduler.test.js
- getNextPostTime parametrized: 5 tests in getNextPostTime.test.js
- API tests: 10 tests in posting-schedule.test.ts
- UI component tests: 10 tests in PostingComponents.test.tsx

### Completion Notes List

- Replaced 6 hardcoded cron jobs (3 posting + 3 distribution) with dynamic scheduler module (`server.scheduler.js`)
- Separated renewal-reminders from posting cron — stays hardcoded at `0 10 * * *`
- Used database flag polling pattern for "Post Now" (admin panel → DB flag → bot polls every 30s)
- Post-now flag is now cleared AFTER execution attempt (success/failure), with in-memory guard against concurrent runs and conditional clear by `requestedAt`
- `calcDistributionTime()` handles midnight boundary (00:00 posting → 23:55 distribution)
- `getNextPostTime()` now accepts optional `string[]` parameter, backward compatible with defaults
- `runPostBets()` now loads `posting_schedule.times` and forwards dynamic post times to `getFilaStatus(groupId, postTimes)`
- Group routes (GET/PUT) now allow `group_admin` for their own group (previously super_admin only)
- GroupEditForm extended with toggle switch and time picker UI for posting schedule
- Queue card now renders visual status por aposta (pronta/faltando link/faltando odds)
- "Postar Agora" now shows explicit success feedback (`Postagem solicitada`)
- Super Admin queue UX: requires group selection before loading queue/post-now actions
- Updated existing test expectations to match new group_admin access rules (split 403 tests into own-group-allowed + other-group-forbidden)
- Added/updated tests for duplicate schedule validation, queue per-bet statuses, post-now feedback, and not-found behavior in post-now API

### Senior Developer Review (AI)

- Findings identified in review: 1 critical, 3 high, 3 medium.
- Action taken: fixed all high/medium issues in code + tests and resolved the critical implementation gap from Task 4.3.
- Validation executed after fixes:
  - `npm test` (root) → 856/856 passing.
  - `cd admin-panel && npm test` → 523/523 passing.

### Change Log

- `sql/migrations/027_add_posting_schedule.sql` — NEW: Migration adding posting_schedule JSONB + post_now_requested_at columns
- `admin-panel/src/types/database.ts` — MODIFIED: Added PostingSchedule interface, new fields to Group/GroupListItem
- `bot/server.scheduler.js` — NEW: Dynamic scheduler module (loadPostingSchedule, setupDynamicScheduler, reloadPostingSchedule, checkPostNow)
- `bot/server.js` — MODIFIED: Replaced hardcoded posting crons with dynamic scheduler, added reload interval + post-now polling
- `bot/jobs/postBets.js` — MODIFIED: Loads posting_schedule times and forwards postTimes to `getFilaStatus(groupId, postTimes)`
- `bot/services/betService.js` — MODIFIED: getNextPostTime() accepts optional postTimes array parameter, exported function
- `admin-panel/src/app/api/groups/[groupId]/route.ts` — MODIFIED: Added posting_schedule Zod schema, allowed group_admin role, group access control
- `admin-panel/src/components/features/groups/GroupEditForm.tsx` — MODIFIED: Added "Postagem Automatica" section with toggle + time picker
- `admin-panel/src/app/api/bets/queue/route.ts` — NEW: GET endpoint returning posting queue status
- `admin-panel/src/app/api/bets/post-now/route.ts` — NEW: POST endpoint setting post_now_requested_at flag (+ validates target group existence)
- `admin-panel/src/components/features/bets/PostingQueueCard.tsx` — NEW: Queue status card with counters + refresh + per-bet visual statuses
- `admin-panel/src/components/features/bets/PostNowButton.tsx` — NEW: Button with confirmation dialog + success feedback
- `admin-panel/src/app/(auth)/bets/page.tsx` — MODIFIED: Integrated PostingQueueCard above BetStatsBar
- `bot/jobs/__tests__/scheduler.test.js` — NEW: 14 tests for dynamic scheduler
- `bot/jobs/__tests__/postBets.test.js` — MODIFIED: Validates forwarding of dynamic postTimes to `getFilaStatus`
- `bot/services/__tests__/getNextPostTime.test.js` — NEW: 5 tests for parametrized getNextPostTime
- `admin-panel/src/app/api/__tests__/posting-schedule.test.ts` — NEW: 10 tests for post-now, queue, posting_schedule APIs (incluindo not-found)
- `admin-panel/src/components/features/bets/__tests__/PostingComponents.test.tsx` — NEW: 10 tests for PostNowButton + PostingQueueCard
- `admin-panel/src/types/database.test.ts` — MODIFIED: Added posting_schedule to Group fixtures
- `admin-panel/src/components/features/groups/GroupCard.test.tsx` — MODIFIED: Added posting_schedule to baseGroup fixture
- `admin-panel/src/components/features/groups/GroupEditForm.test.tsx` — MODIFIED: Added posting_schedule fixture + validations for duplicate schedule and schedule submit
- `admin-panel/src/app/api/__tests__/groups.test.ts` — MODIFIED: Updated group_admin tests to reflect new access rules (own group allowed, other group forbidden)

### File List

#### New Files
- `sql/migrations/027_add_posting_schedule.sql`
- `bot/server.scheduler.js`
- `bot/jobs/__tests__/scheduler.test.js`
- `bot/services/__tests__/getNextPostTime.test.js`
- `admin-panel/src/app/api/bets/queue/route.ts`
- `admin-panel/src/app/api/bets/post-now/route.ts`
- `admin-panel/src/components/features/bets/PostingQueueCard.tsx`
- `admin-panel/src/components/features/bets/PostNowButton.tsx`
- `admin-panel/src/app/api/__tests__/posting-schedule.test.ts`
- `admin-panel/src/components/features/bets/__tests__/PostingComponents.test.tsx`

#### Modified Files
- `admin-panel/src/types/database.ts`
- `bot/server.js`
- `bot/jobs/postBets.js`
- `bot/services/betService.js`
- `admin-panel/src/app/api/groups/[groupId]/route.ts`
- `admin-panel/src/components/features/groups/GroupEditForm.tsx`
- `admin-panel/src/app/(auth)/bets/page.tsx`
- `bot/jobs/__tests__/postBets.test.js`
- `admin-panel/src/types/database.test.ts`
- `admin-panel/src/components/features/groups/GroupCard.test.tsx`
- `admin-panel/src/components/features/groups/GroupEditForm.test.tsx`
- `admin-panel/src/app/api/__tests__/groups.test.ts`
