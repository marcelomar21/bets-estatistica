---
title: 'Calculator Tool para Análise de Apostas'
slug: 'calculator-tool'
created: '2026-03-22'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Node.js (CommonJS)', 'LangChain DynamicStructuredTool', 'Zod 4.x', 'OpenAI GPT-5.4']
files_to_modify: ['agent/tools.js', 'agent/analysis/agentCore.js', 'agent/analysis/prompt.js', '__tests__/agent/runAnalysis.structuredOutput.test.js']
code_patterns: ['DynamicStructuredTool com schema Zod', 'Retorno JSON string', 'Boolean tracking para enforcement', 'TOOL_NAMES constantes']
test_patterns: ['Jest com mocks de tools', 'Testes de enforcement no loop de ferramentas']
---

# Tech-Spec: Calculator Tool para Análise de Apostas

**Created:** 2026-03-22

## Overview

### Problem Statement

A LLM (GPT-5.4) recebe dados brutos de estatísticas dos times via tools (`match_detail_raw` e `team_lastx_raw`), mas não faz cálculos precisos com esses dados. Em vez disso, "chuta" linhas genéricas — por exemplo, sempre recomendando "mais de 3,5 cartões" sem calcular se a média real de cartões justifica essa linha. LLMs são notoriamente ruins em aritmética, resultando em apostas padronizadas e pouco personalizadas por jogo.

### Solution

Criar uma tool `calculator` de computação pura (sem acesso a banco) que a LLM usa para fazer cálculos precisos com os dados que já recebeu. A LLM extrai valores numéricos dos raw payloads (cartões por jogo, gols por jogo, escanteios por jogo) e passa para a calculadora, que retorna resultados exatos. O prompt é atualizado para exigir uso da calculadora antes de recomendar cada linha de aposta.

### Scope

**In Scope:**
- Nova tool `calculator` em `agent/tools.js` com operações: average, sum, percentage_over, percentage_under, count
- Registro e enforcement da tool no loop do agente em `agent/analysis/agentCore.js`
- Atualização do prompt em `agent/analysis/prompt.js` para exigir uso da calculadora
- Aumento de `MAX_AGENT_STEPS` de 6 para 8
- Atualização dos testes existentes

**Out of Scope:**
- Validação de alinhamento título×categoria (não é um problema real)
- Mudanças no schema do banco de dados
- Mudanças no admin panel / frontend
- Nova tool de consulta ao banco (a calculadora é pura computação)

## Context for Development

### Codebase Patterns

- **Tools** usam `DynamicStructuredTool` do LangChain com schema Zod para validação de input
- Tools **sempre retornam JSON string** via `JSON.stringify()`
- Tools são criadas por factory functions assíncronas (`createXxxTool`) e agrupadas em `createAnalysisTools()`
- **Enforcement** de tools obrigatórias usa booleans de tracking + array `missingTools` + nudge message no loop
- Constantes de nomes ficam em `TOOL_NAMES` no `agentCore.js`
- Output de tools pode ser sanitizado via `sanitizeToolOutput()` antes de entrar na conversa

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `agent/tools.js` | Definição das tools existentes (`match_detail_raw`, `team_lastx_raw`) — adicionar `calculator` aqui |
| `agent/analysis/agentCore.js` | Loop do agente (Phase 1 tool calling, Phase 2 structured output), enforcement, `TOOL_NAMES`, `MAX_AGENT_STEPS` |
| `agent/analysis/prompt.js` | System prompt e human template — adicionar instruções sobre a calculadora |
| `__tests__/agent/runAnalysis.structuredOutput.test.js` | Testes de enforcement de tools (linhas 287-327) |

### Technical Decisions

1. **A calculator NÃO é required no mesmo sentido que match_detail e lastx.** As tools de dados são obrigatórias porque sem elas a LLM não tem informação. A calculator é obrigatória para garantir precisão — enforcement via prompt (instruções fortes) em vez de boolean tracking. Motivo: a LLM pode precisar chamar a calculator múltiplas vezes (uma por mercado), e o enforcement booleano só verifica "usou pelo menos uma vez".
2. **Operações da calculator são stateless** — recebe array de números + operação, retorna resultado. Sem acesso a banco, sem side effects.
3. **MAX_AGENT_STEPS sobe de 6 para 8** — para acomodar chamadas extras à calculadora sem estourar o limite.

## Implementation Plan

### Tasks

- [x] Task 1: Criar schema Zod da tool calculator
  - File: `agent/tools.js`
  - Action: Definir `calculatorSchema` com campos:
    - `operation`: enum `['average', 'sum', 'percentage_over', 'percentage_under', 'count', 'min', 'max', 'median']`
    - `values`: array de números (min 1 elemento)
    - `threshold`: número opcional (obrigatório para percentage_over/percentage_under)
    - `label`: string opcional (descritivo para o log, ex: "cartões dos últimos 10 jogos")
  - Notes: Seguir mesmo padrão de `matchDetailSchema` e `lastxSchema`

- [x] Task 2: Implementar a function da tool calculator
  - File: `agent/tools.js`
  - Action: Criar `createCalculatorTool()` seguindo o padrão factory async. Implementar as operações:
    - `average`: soma / count dos values
    - `sum`: soma simples
    - `percentage_over`: (count de values > threshold / total) × 100
    - `percentage_under`: (count de values < threshold / total) × 100
    - `count`: total de elementos
    - `min`: menor valor
    - `max`: maior valor
    - `median`: valor mediano
  - Retorno JSON string com:
    ```json
    {
      "operation": "percentage_over",
      "values_count": 10,
      "threshold": 3.5,
      "result": 60,
      "detail": "6 de 10 valores acima de 3.5",
      "label": "cartões dos últimos 10 jogos"
    }
    ```
  - Notes: Validar que `threshold` é fornecido quando `operation` é `percentage_over` ou `percentage_under`. Para operações sem threshold, ignorar o campo.

- [x] Task 3: Registrar a tool em `createAnalysisTools`
  - File: `agent/tools.js`
  - Action: Adicionar `createCalculatorTool()` ao array retornado por `createAnalysisTools()`:
    ```javascript
    const createAnalysisTools = async () => {
      const [matchDetailTool, lastxTool, calculatorTool] = await Promise.all([
        createMatchDetailTool(),
        createLastxTool(),
        createCalculatorTool(),
      ]);
      return [matchDetailTool, lastxTool, calculatorTool];
    };
    ```

- [x] Task 4: Adicionar constante TOOL_NAMES e ajustar MAX_AGENT_STEPS
  - File: `agent/analysis/agentCore.js`
  - Action:
    - Adicionar `CALCULATOR: 'calculator'` ao objeto `TOOL_NAMES` (linha ~730)
    - Alterar `MAX_AGENT_STEPS` default de `6` para `8` (linha 10)
  - Notes: Não adicionar boolean tracking nem enforcement de obrigatoriedade para a calculator — enforcement será via prompt.

- [x] Task 5: Atualizar o system prompt
  - File: `agent/analysis/prompt.js`
  - Action: Adicionar instruções sobre a calculator tool no `systemPrompt`:
    - Listar a tool `calculator` junto com `match_detail_raw` e `team_lastx_raw` nas ferramentas disponíveis
    - Adicionar regra: "Para cada safe_bet, ANTES de escolher a linha (.5), extraia os valores relevantes do raw_payload (ex: cartões por jogo nos últimos 10 jogos de cada time) e use a ferramenta `calculator` com operation `percentage_over` ou `percentage_under` para verificar qual linha os dados realmente sustentam. NUNCA escolha uma linha sem calcular primeiro."
    - Adicionar exemplo de uso: "Para recomendar 'mais de 3,5 cartões', primeiro extraia os cartões por jogo de cada time dos últimos 10 jogos, combine os valores, e use `calculator({ operation: 'percentage_over', values: [...], threshold: 3.5 })`. Se o resultado for abaixo de 55%, tente uma linha diferente (2.5 ou 4.5)."
  - Notes: Manter a instrução concisa mas clara. Não reescrever o prompt inteiro — apenas adicionar as novas instruções.

- [x] Task 6: Atualizar testes de enforcement
  - File: `__tests__/agent/runAnalysis.structuredOutput.test.js`
  - Action:
    - Adicionar mock da calculator tool no setup:
      ```javascript
      const mockCalculatorTool = {
        name: 'calculator',
        invoke: jest.fn().mockResolvedValue(JSON.stringify({
          operation: 'average',
          values_count: 10,
          result: 3.9,
          detail: 'Média de 10 valores',
          label: 'test'
        })),
      };
      ```
    - Atualizar mock de `createAnalysisTools` para incluir a calculator tool
    - Verificar que os testes existentes continuam passando (a calculator não é "required" no enforcement, então os testes de enforcement não devem quebrar)
  - Notes: A calculator pode aparecer nos tool_calls dos testes mas não precisa de teste específico de enforcement.

### Acceptance Criteria

- [ ] AC 1: Given a LLM chamou `team_lastx_raw` e tem dados de cartões, when ela chama `calculator({ operation: 'average', values: [4, 3, 5, 2, 6] })`, then recebe `{ result: 4.0, detail: 'Média de 5 valores' }`
- [ ] AC 2: Given um array de valores `[4, 3, 5, 2, 6, 3, 4, 5, 3, 4]` e threshold 3.5, when a LLM chama `calculator({ operation: 'percentage_over', values: [...], threshold: 3.5 })`, then recebe `{ result: 60, detail: '6 de 10 valores acima de 3.5' }`
- [ ] AC 3: Given um array de valores e threshold, when a LLM chama `calculator({ operation: 'percentage_under', values: [...], threshold: 2.5 })`, then recebe a porcentagem correta de valores abaixo do threshold
- [ ] AC 4: Given a LLM chama `calculator` sem fornecer `threshold` para operação `percentage_over`, then recebe erro de validação Zod
- [ ] AC 5: Given o pipeline roda com a nova tool, when a LLM gera safe_bets, then os logs mostram chamadas à calculator tool durante o Phase 1
- [ ] AC 6: Given `MAX_AGENT_STEPS=8`, when o agente precisa chamar 3 tools (match_detail, lastx×2, calculator×N), then o loop não estoura antes de completar
- [ ] AC 7: Given os testes existentes em `__tests__/agent/`, when `npm test` roda, then todos os testes passam sem regressão

## Additional Context

### Dependencies

- Nenhuma dependência externa nova. Usa apenas `zod` (já instalado) e `DynamicStructuredTool` do LangChain (já instalado).
- Depende das tools existentes (`match_detail_raw`, `team_lastx_raw`) funcionando corretamente — a calculator consome os dados que elas fornecem.

### Testing Strategy

- **Unit tests:** Testar cada operação da calculator isoladamente (average, sum, percentage_over, percentage_under, count, min, max, median) com edge cases (array vazio, um elemento, threshold nos limites)
- **Integration tests:** Atualizar o mock de `createAnalysisTools` nos testes existentes para incluir a calculator tool e verificar que o loop do agente funciona com 3 tools
- **Manual test:** Rodar `node agent/analysis/runAnalysis.js <match_id>` com `AGENT_DEBUG=true` e verificar nos logs que a LLM chamou a calculator antes de gerar cada safe_bet

### Notes

- **Risco:** A LLM pode extrair valores incorretos do raw payload antes de passar para a calculadora. A calculator garante precisão no cálculo, mas não garante que os inputs estejam corretos. Mitigação: o prompt deve instruir a LLM a ser explícita sobre quais valores extraiu e de onde.
- **Evolução futura:** Se a calculator se provar útil, considerar adicionar uma tool que consulta histórico de apostas anteriores para calcular probabilidades com base em resultados reais (não apenas estatísticas do time).
- **Custo:** Cada chamada à calculator conta como um step no loop, mas não gera tokens extras significativos — o retorno é um JSON pequeno. O aumento de `MAX_AGENT_STEPS` de 6→8 pode adicionar 1-2 chamadas LLM extras no pior caso.
