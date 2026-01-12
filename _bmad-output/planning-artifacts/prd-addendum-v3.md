---
version: 3
baseDocument: prd.md
createdAt: 2026-01-12
author: Marcelomendes
status: draft
type: addendum
---

# PRD Addendum v3 - Bets Estatística

**Referência:** Este documento complementa o PRD original (`prd.md`) e o Addendum v2 (`prd-addendum-v2.md`) com novos requisitos identificados em operação.

**Contexto:** Após implementação dos épicos 1-11, foram identificados bugs e necessidades de novos comandos admin para melhor gestão operacional do sistema.

---

## 1. Bugs Críticos

### BUG-003: Comando /atualizar odds Falha - Coluna 'notes' Não Existe

**Severidade:** 🔴 Crítica
**Status:** Identificado

**Descrição:**
Ao usar o comando `/atualizar odds` no grupo admin, o sistema retorna erro:
```
❌ Erro ao salvar odds: Could not find the 'notes' column of 'suggested_bets' in the schema cache
```

**Causa Raiz:**
O código em `bot/services/betService.js` (funções `updateBetOdds` e `setBetPendingWithNote`) tenta escrever na coluna `notes` que não existe na tabela `suggested_bets`.

**Código Problemático:**
```javascript
// betService.js linha 534-539
async function updateBetOdds(betId, odds, notes = null) {
  const updateData = { odds };
  if (notes) {
    updateData.notes = notes;  // ❌ Coluna não existe!
  }
  // ...
}
```

**Correção Necessária:**
- **Opção A:** Adicionar coluna `notes TEXT` na tabela `suggested_bets`
- **Opção B:** Remover lógica de `notes` do código (simplificar)

**Recomendação:** Opção A - ter histórico de alterações é útil para auditoria.

**Migration SQL:**
```sql
ALTER TABLE suggested_bets ADD COLUMN IF NOT EXISTS notes TEXT;
```

**Critério de Resolução:**
Comando `/atualizar odds` executa sem erros e atualiza as odds das apostas.

---

### BUG-004: Overview Mostra "[object Object]" nos IDs Postados

**Severidade:** 🟡 Média
**Status:** Identificado

**Descrição:**
Ao usar o comando `/overview`, a seção "IDs Postadas" mostra `#[object Object]` ao invés dos IDs reais das apostas.

**Causa Raiz:**
No `bot/handlers/adminGroup.js`, o código trata `stats.postedIds` como array de números, mas `getOverviewStats()` retorna array de objetos.

**Código Problemático:**
```javascript
// adminGroup.js linha 277-279
const postedIdsList = stats.postedIds.length > 0
  ? stats.postedIds.map(id => `#${id}`).join(', ')  // ❌ 'id' é objeto!
  : 'Nenhuma';
```

`getOverviewStats()` retorna:
```javascript
postedIds: [{ id: 45, match: 'Liverpool x Arsenal', ... }, ...]
```

**Correção Necessária:**
```javascript
const postedIdsList = stats.postedIds.length > 0
  ? stats.postedIds.map(item => `#${item.id}`).join(', ')  // ✅
  : 'Nenhuma';
```

**Critério de Resolução:**
Comando `/overview` exibe corretamente os IDs numéricos das apostas postadas.

---

### BUG-005: Health Check Alertando Excessivamente

**Severidade:** 🟡 Média
**Status:** Investigação Necessária

**Descrição:**
O health check está enviando alertas frequentes ("apitando direto") mesmo quando o sistema está funcionando normalmente.

**Possíveis Causas:**
1. Threshold `PENDING_LINK_MAX_HOURS = 4` muito baixo para operação manual
2. Threshold `READY_NOT_POSTED_HOURS = 2` muito baixo
3. Lógica de "postagem antiga" detectando como falha quando é apenas intervalo normal
4. Alertas duplicados sendo enviados

**Investigação Necessária:**
- [ ] Revisar logs do health check para identificar quais alertas estão sendo disparados
- [ ] Verificar se há apostas stuck em estados intermediários
- [ ] Avaliar se thresholds são adequados para operação real

**Correção Provável:**
- Aumentar `PENDING_LINK_MAX_HOURS` para 6-8 horas
- Aumentar `READY_NOT_POSTED_HOURS` para 4 horas
- Adicionar debounce para evitar alertas repetidos do mesmo tipo
- Adicionar flag para silenciar alertas temporariamente

**Critério de Resolução:**
Health check envia alertas apenas quando há problemas reais que requerem ação.

---

## 2. Bugs de Regras de Negócio

### BUG-006: Limite de Elegibilidade Ignorado (2 Dias)

**Severidade:** 🟡 Média
**Status:** Regressão Identificada

**Descrição:**
O sistema deveria considerar apenas jogos com pelo menos 2 dias de antecedência para elegibilidade (FR39 do PRD original). Esta regra não está sendo aplicada corretamente.

**Referência PRD:**
> FR39: Sistema deve considerar apenas jogos com pelo menos 2 dias de antecedência

**Correção Necessária:**
Verificar e restaurar filtro de elegibilidade nas funções:
- `getEligibleBets()` em betService.js
- Pipeline de geração de apostas
- Job de enriquecimento de odds

**Critério de Resolução:**
Apenas jogos com kickoff >= 48h no futuro são considerados elegíveis para postagem.

---

## 3. Novas Features - Visibilidade Admin

### FEAT-008: Comando /filtrar - Listar Apostas por Status

**Prioridade:** Alta
**Categoria:** Admin Tools

**Descrição:**
O operador precisa visualizar rapidamente apostas filtradas por critérios específicos para gestão operacional eficiente.

**Requisitos Funcionais:**

| ID | Requisito |
|----|-----------|
| FR-F1 | `/filtrar sem_odds` lista todas apostas sem odds |
| FR-F2 | `/filtrar sem_link` lista apostas sem link (exceto posted/success/failure) |
| FR-F3 | `/filtrar com_link` lista apostas com link |
| FR-F4 | `/filtrar com_odds` lista apostas com odds |
| FR-F5 | `/filtrar prontas` lista apostas com status 'ready' (link + odds) |
| FR-F6 | Cada item mostra: ID, jogo, mercado, status, odds, link (sim/não) |
| FR-F7 | Lista ordenada por data do jogo (mais próximo primeiro) |

**Comandos:**
```
/filtrar sem_odds    → Apostas sem odds definida
/filtrar sem_link    → Apostas sem link (aguardando operador)
/filtrar com_link    → Apostas com link cadastrado
/filtrar com_odds    → Apostas com odds definida
/filtrar prontas     → Apostas prontas para postagem
```

**Formato de Saída:**
```
📋 *APOSTAS SEM ODDS* (5)

1️⃣ #45 Liverpool vs Arsenal
   🎯 Over 2.5 gols
   📅 15/01 17:00
   ⚠️ SEM ODD │ ❌ SEM LINK

2️⃣ #47 Real Madrid vs Barcelona
   🎯 Ambas marcam
   📅 16/01 21:00
   ⚠️ SEM ODD │ 🔗 Com link

💡 Use `/odd ID valor` para definir odds
```

---

### FEAT-009: Comando /simular - Preview de Copy

**Prioridade:** Alta
**Categoria:** Admin Tools

**Descrição:**
Antes de postar, o operador quer ver exatamente como será a mensagem publicada no grupo público, incluindo o copy gerado pela LLM. Permite ajustes antes da publicação.

**Requisitos Funcionais:**

| ID | Requisito |
|----|-----------|
| FR-S1 | `/simular` gera preview das próximas 3 apostas a serem postadas |
| FR-S2 | Preview mostra mensagem completa com copy LLM |
| FR-S3 | Preview mostra qual seria o link incluído |
| FR-S4 | Se copy tiver problema, operador pode regenerar com `/simular novo` |
| FR-S5 | Preview não altera estado das apostas |
| FR-S6 | Pode simular aposta específica com `/simular ID` |

**Fluxo de Uso:**
```
Operador: /simular
Bot: 
📤 *PREVIEW - PRÓXIMA POSTAGEM*

━━━━━━━━━━━━━━━━━━━━
🔥 *APOSTAS DO DIA - NOITE*

⚽ *Liverpool vs Arsenal*
Os Reds em casa são máquina de gols. 
Últimos 5 confrontos: 4.2 gols/jogo em média.
🎯 Over 2.5 @ 1.85

👉 [APOSTAR AGORA](https://betano.com/...)

📈 Taxa de acerto: 72%
━━━━━━━━━━━━━━━━━━━━

⚠️ Este é apenas um preview.
💡 Use `/postar` para publicar ou `/simular novo` para regenerar copy.
```

**Caso de Uso - Edição:**
```
Operador: /simular
Bot: [preview com erro de português]
Operador: /simular novo
Bot: [preview com novo copy]
Operador: /postar
Bot: ✅ Postagem enviada!
```

---

## 4. Melhorias de UX Admin

### FEAT-010: Overview Aprimorado

**Prioridade:** Média
**Categoria:** Enhancement

**Descrição:**
Melhorar o comando `/overview` para ser mais completo e útil operacionalmente.

**Requisitos Funcionais:**

| ID | Requisito |
|----|-----------|
| FR-O1 | Mostrar contagem por status (generated, pending_link, ready, posted) |
| FR-O2 | Mostrar lista de IDs por categoria (sem odds, sem link, prontas) |
| FR-O3 | Mostrar próximo jogo (data/hora mais próxima) |
| FR-O4 | Mostrar última postagem (quando foi) |
| FR-O5 | Mostrar taxa de acerto atual (30 dias) |

**Novo Formato Proposto:**
```
📊 *OVERVIEW - APOSTAS*

*Status Atual:*
🆕 Geradas: 8
⏳ Aguardando link: 3
✅ Prontas: 4
📤 Postadas (ativas): 3

*Próximo Jogo:*
⚽ Liverpool vs Arsenal
📅 15/01 às 17:00 (em 6h)

*Última Postagem:*
🕐 Hoje às 15:00

*Pendências:*
⚠️ Sem odds: #45, #47, #52
❌ Sem link: #45, #48, #51, #53

*Métricas:*
📈 Taxa 30d: 72% (18/25)

💡 Comandos: /filtrar | /simular | /postar
```

---

## 5. Correções Técnicas

### TECH-004: Adicionar Coluna 'notes' no Schema

**Prioridade:** Alta (bloqueante para BUG-003)
**Categoria:** Schema

**Descrição:**
Adicionar coluna para armazenar notas/histórico de alterações nas apostas.

**Migration:**
```sql
-- Migration: Add notes column to suggested_bets
ALTER TABLE suggested_bets 
ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON COLUMN suggested_bets.notes IS 'Notes about manual changes (odds, status, etc)';
```

---

### TECH-005: Ajustar Thresholds do Health Check

**Prioridade:** Média
**Categoria:** Configuration

**Descrição:**
Ajustar thresholds do health check para operação mais realista.

**Mudanças Propostas:**
```javascript
const THRESHOLDS = {
  DB_TIMEOUT_MS: 5000,           // Manter
  PENDING_LINK_MAX_HOURS: 8,     // Antes: 4 → Agora: 8
  READY_NOT_POSTED_HOURS: 4,     // Antes: 2 → Agora: 4
  POSTED_NO_RESULT_HOURS: 8,     // Antes: 6 → Agora: 8
  POST_SCHEDULE_GRACE_MIN: 15,   // Antes: 10 → Agora: 15
};
```

---

## 6. Priorização Sugerida

### Sprint Imediata (Bugs Críticos)

| Item | Descrição | Esforço | Dependência |
|------|-----------|---------|-------------|
| BUG-003 | /atualizar odds falha (notes) | Baixo | TECH-004 |
| BUG-004 | Overview object object | Baixo | - |
| TECH-004 | Migration coluna notes | Baixo | - |

### Sprint 1 (Operacional)

| Item | Descrição | Esforço | Dependência |
|------|-----------|---------|-------------|
| BUG-005 | Health check excessivo | Médio | Investigação |
| BUG-006 | Limite 2 dias | Médio | - |
| TECH-005 | Ajustar thresholds | Baixo | BUG-005 |

### Sprint 2 (Admin Tools)

| Item | Descrição | Esforço |
|------|-----------|---------|
| FEAT-008 | /filtrar por status | Médio |
| FEAT-009 | /simular preview | Médio |
| FEAT-010 | Overview aprimorado | Baixo |

---

## 7. Mapeamento para Épicos

Estes requisitos serão organizados em um novo épico:

### Epic 12: Correções e Ferramentas Admin v2

**Objetivo:** Corrigir bugs identificados e adicionar ferramentas de visibilidade para operação eficiente.

**Stories Propostas:**
1. 12-1: Corrigir bug coluna notes (BUG-003 + TECH-004)
2. 12-2: Corrigir overview object object (BUG-004)
3. 12-3: Investigar e ajustar health check (BUG-005 + TECH-005)
4. 12-4: Restaurar filtro 2 dias elegibilidade (BUG-006)
5. 12-5: Implementar comando /filtrar (FEAT-008)
6. 12-6: Implementar comando /simular (FEAT-009)
7. 12-7: Aprimorar comando /overview (FEAT-010)

---

## Aprovação

| Papel | Nome | Data | Status |
|-------|------|------|--------|
| Product Owner | Marcelomendes | 2026-01-12 | ⏳ Pendente |

---

*Este documento será atualizado conforme novos requisitos forem identificados.*
