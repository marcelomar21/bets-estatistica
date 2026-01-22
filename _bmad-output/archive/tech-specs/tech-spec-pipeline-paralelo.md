# Tech-Spec: Pipeline de Análise Paralelo com Persistência Imediata

**Status: Completed**

## Review Notes
- Adversarial review completed
- Findings: 8 total, 8 fixed, 0 skipped
- Resolution approach: auto-fix all

## Problema

O GitHub Actions workflow `daily-pipeline.yml` está dando timeout (30 minutos) porque:

1. **Processamento sequencial**: `runAnalysis.js` processa jogos um a um
2. **Arquivos locais efêmeros**: Análises são salvas em JSON local, perdidos se timeout
3. **17 jogos na fila** × ~2-3 min cada = 34-51 min (excede 30 min)

## Solução

### 1. Paralelizar análises com limite de concorrência

Usar `p-limit` para processar até 5 jogos simultaneamente:

```javascript
// ANTES (sequencial)
for (const matchId of matchIds) {
  await processMatch(matchId);
}

// DEPOIS (paralelo com limite)
const pLimit = require('p-limit');
const limit = pLimit(CONCURRENCY_LIMIT); // 5

await Promise.all(
  matchIds.map(matchId => limit(() => processMatch(matchId)))
);
```

### 2. Persistir no banco imediatamente após cada análise

Após `processMatch()` gerar a análise, chamar `saveOutputs()` diretamente:

```javascript
const processMatch = async (matchId) => {
  // ... gera análise e salva JSON local (para debug) ...

  // NOVO: Persistir imediatamente no banco
  await saveOutputs(matchId);

  return { generatedAt, outputFile };
};
```

### 3. Aumentar timeout do workflow (backup)

```yaml
timeout-minutes: 45  # era 30
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `agent/analysis/runAnalysis.js` | Adicionar paralelização + persistência imediata |
| `package.json` | Adicionar `p-limit` como dependência |
| `.github/workflows/daily-pipeline.yml` | Aumentar timeout para 45 min |

## Implementação Detalhada

### Task 1: Instalar p-limit

```bash
npm install p-limit
```

### Task 2: Modificar runAnalysis.js

No topo do arquivo, adicionar:
```javascript
const pLimit = require('p-limit');
const { saveOutputs } = require('../persistence/saveOutputs');

const CONCURRENCY_LIMIT = Number(process.env.AGENT_CONCURRENCY || 5);
```

Modificar `processMatch()` para chamar `saveOutputs()` no final:
```javascript
const processMatch = async (matchId) => {
  // ... código existente até salvar o JSON ...

  // Persistir imediatamente no banco
  try {
    const persistResult = await saveOutputs(matchId);
    infoLog(`[${matchId}] Persistido: ${persistResult.betsPersisted} bet(s)`);
  } catch (persistErr) {
    infoLog(`[${matchId}] Falha ao persistir: ${persistErr.message}`);
    // Não falha o processo - JSON foi salvo como backup
  }

  return { generatedAt, outputFile };
};
```

Modificar `main()` para usar Promise.all com p-limit:
```javascript
async function main() {
  const matchIds = await resolveMatchTargets();
  const limit = pLimit(CONCURRENCY_LIMIT);

  infoLog(`Processando ${matchIds.length} jogo(s) com concorrência ${CONCURRENCY_LIMIT}`);

  const results = await Promise.allSettled(
    matchIds.map(matchId =>
      limit(async () => {
        infoLog(`Iniciando análise para match_id ${matchId}`);
        try {
          const { generatedAt } = await processMatch(matchId);
          await setQueueStatus(matchId, 'analise_completa', {
            analysisGeneratedAt: generatedAt,
            clearErrorReason: true,
          });
          return { matchId, success: true };
        } catch (err) {
          console.error(`[agent][analysis] Falha match ${matchId}: ${err.message}`);
          await setQueueStatus(matchId, 'pending', { errorReason: err.message });
          return { matchId, success: false, error: err.message };
        }
      })
    )
  );

  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success);
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));

  infoLog(`Resumo: ${succeeded.length} sucesso(s), ${failed.length} falha(s) de ${matchIds.length} total.`);

  if (succeeded.length === 0 && matchIds.length > 0) {
    process.exitCode = 1;
  }
}
```

### Task 3: Atualizar workflow timeout

```yaml
jobs:
  pipeline:
    runs-on: ubuntu-latest
    timeout-minutes: 45  # aumentado de 30
```

## Resultado Esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| Tempo para 17 jogos | ~34-51 min | ~8-12 min |
| Dados perdidos em timeout | Todos | Nenhum (já no banco) |
| Concorrência | 1 | 5 |

## Testes

1. Rodar localmente: `node scripts/pipeline.js --step=4`
2. Verificar se análises são salvas no banco imediatamente
3. Disparar workflow manual e verificar tempo de execução

## Variáveis de Ambiente

| Variável | Default | Descrição |
|----------|---------|-----------|
| `AGENT_CONCURRENCY` | 5 | Número de análises paralelas |
