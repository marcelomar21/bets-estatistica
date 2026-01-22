---
version: 2
baseDocument: prd.md
createdAt: 2026-01-11
author: Marcelomendes
status: draft
type: addendum
---

# PRD Addendum v2 - Bets Estatística

**Referência:** Este documento complementa o PRD original (`prd.md`) com novos requisitos identificados após a implementação inicial do MVP.

**Contexto:** O sistema foi implementado seguindo o PRD original, mas durante a operação foram identificados bugs críticos e oportunidades de melhoria que precisam ser endereçados.

---

## 1. Bugs Críticos

### BUG-001: Postagens Telegram Não Estão Sendo Enviadas nos Horários

**Severidade:** 🔴 Crítica
**Status:** Causa Raiz Identificada

**Descrição:**
O bot não envia mensagens nos horários programados (10h, 15h, 22h). Apostas postadas manualmente funcionam, mas o cron não está repostando.

**Impacto:**
- Postagens manuais funcionam, mas automáticas não
- Grupo público não recebe atualizações nos horários
- MVP não está operacional de forma autônoma

**Contexto Confirmado:**
- ✅ UptimeRobot configurado - serviço está acordado
- ✅ Render rodando (health check passa)
- ✅ Existem 10 apostas elegíveis com odds >= 1.60
- ✅ 3 apostas foram postadas manualmente e funcionaram
- ❌ Cron não está repostando as apostas ativas

**Causa Raiz Identificada:**

Bug de lógica no `bot/jobs/postBets.js`:

```javascript
// Linha 171-175 - PROBLEMA
const availableSlots = await calculatePostingSlots();
if (availableSlots === 0) {
  return { posted: 0, skipped: 0 };  // ❌ SAI SEM FAZER NADA!
}
```

**O código atual:**
1. Verifica se tem slots disponíveis (3 - apostas posted)
2. Se já tem 3 `posted`, `availableSlots = 0` → sai sem fazer nada
3. Só busca apostas com status `ready` → não reposta as `posted`
4. **Resultado:** Posta uma vez e nunca mais reposta!

**Lógica Esperada:**
1. Apostas `posted` com jogo ainda não iniciado devem ser **repostadas** em cada horário
2. Sempre manter 3 apostas ativas sendo postadas 3x/dia
3. Só substituir uma aposta quando o jogo dela terminar

**Correção Necessária:**
- Modificar `postBets.js` para:
  1. Buscar apostas `posted` com jogo futuro
  2. Repostar essas apostas nos horários programados
  3. Só buscar novas quando slots ficarem disponíveis

**Critério de Resolução:**
Bot reposta as 3 apostas ativas automaticamente nos horários 10h, 15h, 22h até os jogos acontecerem.

---

### BUG-002: Odds Incorretas (Matching Errado)

**Severidade:** 🔴 Crítica
**Status:** Aberto

**Descrição:**
As odds exibidas não correspondem às odds reais na Betano. Exemplo: sistema mostra 1.90 mas a odd real é 1.09. Suspeita de matching incorreto entre mercados da API e mercados reais.

**Impacto:**
- Usuários veem odds falsas
- Credibilidade do sistema comprometida
- Apostas podem ter retorno muito diferente do esperado

**Contexto adicional:**
- ✅ OK pegar odds de qualquer casa (não precisa ser Betano)
- O problema é o valor errado (1.90 vs 1.09 - diferença muito grande)

**Causa Provável:**
Mapeamento incorreto entre o nome do mercado na API de odds e o mercado correspondente - pode estar pegando linha ou tipo errado (ex: Over 0.5 ao invés de Over 2.5, ou Under ao invés de Over).

**Investigação Necessária:**
- [ ] Revisar lógica de matching em `marketInterpreter.js`
- [ ] Comparar nomes de mercados da API vs Betano
- [ ] Verificar se está pegando a odd correta do array de outcomes
- [ ] Adicionar logs de debug no processo de matching

**Critério de Resolução:**
Odds exibidas correspondem às odds reais da Betano com margem de ±0.05.

---

## 2. Novas Features - Painel Admin

### FEAT-001: Visualizar Todas as Apostas Disponíveis

**Prioridade:** Alta
**Categoria:** Admin Tools

**Descrição:**
O operador precisa visualizar no grupo admin todas as apostas geradas que ainda podem ser utilizadas (jogos com data futura).

**Requisitos Funcionais:**
- FR-A1: Bot pode listar apostas com jogos de data futura quando solicitado
- FR-A2: Cada aposta deve mostrar: jogo (times), mercado, odd, data/hora
- FR-A3: Lista deve ser ordenada por data do jogo (mais próximo primeiro)
- FR-A4: Cada item deve ter identificador único para referência

**Formato Sugerido da Mensagem:**

```
📋 APOSTAS DISPONÍVEIS

1️⃣ Liverpool vs Arsenal
   📅 15/01 às 17:00
   🎯 Over 2.5 gols
   📊 Odd: 1.85
   
2️⃣ Real Madrid vs Barcelona  
   📅 16/01 às 21:00
   🎯 Ambas marcam
   📊 Odd: 1.72

[Responda com número + nova odd para ajustar]
[Ex: "1 1.90" para mudar odd do item 1]
```

**Trigger:**
- Comando: `/apostas` ou `/listar`

---

### FEAT-002: Corrigir/Ajustar Odd e Link

**Prioridade:** Alta
**Categoria:** Admin Tools

**Descrição:**
O operador precisa poder corrigir a odd de uma aposta quando identificar que está incorreta, e adicionar/atualizar o link de aposta.

**Requisitos Funcionais:**
- FR-A5: Operador pode responder com número + nova odd para atualizar
- FR-A6: Operador pode responder com número + link para adicionar link
- FR-A7: Bot confirma a alteração com ✅
- FR-A8: Alterações são salvas no banco de dados
- FR-A9: Histórico de alterações é mantido (quem alterou, quando)

**Exemplos de Interação:**

```
Operador: 1 1.90
Bot: ✅ Odd do item 1 atualizada: 1.85 → 1.90

Operador: 1 https://betano.com/...
Bot: ✅ Link adicionado ao item 1 (Liverpool vs Arsenal)
```

---

### FEAT-003: Adicionar Aposta Manual

**Prioridade:** Média
**Categoria:** Admin Tools

**Descrição:**
O operador quer poder adicionar manualmente uma aposta à lista de postagens, mesmo que não tenha sido gerada automaticamente pelo sistema.

**Requisitos Funcionais:**
- FR-A10: Operador pode adicionar aposta via comando no grupo admin
- FR-A11: Bot solicita informações: jogo, mercado, odd, link
- FR-A12: Aposta manual é marcada como `source: manual` no BD
- FR-A13: Aposta manual entra na fila de postagem normalmente

**Fluxo de Interação:**

```
Operador: /adicionar
Bot: Qual o jogo? (Ex: Liverpool vs Arsenal)
Operador: Palmeiras vs Flamengo
Bot: Qual o mercado? (Ex: Over 2.5, Ambas marcam)
Operador: Vitória Palmeiras
Bot: Qual a odd?
Operador: 2.10
Bot: Link da aposta (ou "pular"):
Operador: https://betano.com/...
Bot: ✅ Aposta adicionada:
     Palmeiras vs Flamengo - Vitória Palmeiras @ 2.10
```

---

### FEAT-004: Forçar Atualizações

**Prioridade:** Média
**Categoria:** Admin Tools

**Descrição:**
O operador precisa poder forçar a execução de jobs manualmente (atualizar odds, reprocessar apostas, etc).

**Requisitos Funcionais:**
- FR-A14: Comando `/atualizar odds` força refresh de odds da API
- FR-A15: Comando `/atualizar apostas` reprocessa ranking de apostas
- FR-A16: Comando `/forcar postagem` envia postagem imediatamente
- FR-A17: Bot confirma execução e reporta resultado

---

## 3. Melhorias de Monitoramento

### FEAT-005: Alerta de Status Page no Grupo Admin

**Prioridade:** Alta
**Categoria:** Monitoramento

**Descrição:**
Quando o sistema detectar falha ou a status page indicar problema, o bot deve alertar no grupo admin mencionando o operador.

**Requisitos Funcionais:**
- FR-M1: Bot monitora health check do sistema
- FR-M2: Se falha detectada, envia alerta no grupo admin
- FR-M3: Alerta menciona o operador (@username)
- FR-M4: Alerta inclui: tipo de falha, timestamp, ação sugerida

**Formato do Alerta:**

```
🚨 ALERTA DE SISTEMA

@marcelomendes Problema detectado!

❌ Falha: Postagem das 10h não executada
⏰ Detectado: 10:05
💡 Ação: Verificar logs do cron

[/status] para mais detalhes
```

---

## 4. Melhorias de Produto

### FEAT-006: Copy Dinâmico com LLM

**Prioridade:** Baixa
**Categoria:** Enhancement

**Descrição:**
Atualmente o texto das postagens é fixo/template. Usar LLM para gerar copy mais engajador e variado.

**Requisitos Funcionais:**
- FR-P1: Cada postagem tem texto gerado por LLM
- FR-P2: Copy deve ser conciso (máx 2-3 linhas por aposta)
- FR-P3: Manter consistência de tom (profissional mas acessível)
- FR-P4: Cache de copies para evitar custo excessivo

**Antes (fixo):**
```
⚽ Liverpool vs Arsenal
🎯 Over 2.5 gols
📊 Odd: 1.85
```

**Depois (LLM):**
```
⚽ Liverpool vs Arsenal
Os Reds em casa são máquina de gols. Over 2.5 @ 1.85 é aposta segura.
👉 [APOSTAR]
```

---

### FEAT-007: Adicionar Mais Ligas

**Prioridade:** Baixa
**Categoria:** Expansão

**Descrição:**
Expandir cobertura para mais ligas além das atualmente configuradas.

**Requisitos:**
- Identificar ligas com maior demanda
- Verificar disponibilidade na API FootyStats
- Verificar disponibilidade na API de odds
- Adicionar configuração das novas ligas

---

## 5. Melhorias Técnicas

### TECH-001: Simplificar Estrutura de Pastas

**Prioridade:** Baixa
**Categoria:** Refactoring

**Descrição:**
Reorganizar estrutura de pastas do projeto para melhor manutenibilidade.

**Escopo:**
- [ ] Definir nova estrutura proposta
- [ ] Migrar arquivos
- [ ] Atualizar imports
- [ ] Atualizar documentação

---

### TECH-002: Configurar CI/CD com Testes

**Prioridade:** Baixa
**Categoria:** DevOps

**Descrição:**
Implementar pipeline de CI/CD com testes automatizados para garantir que deploys não quebrem funcionalidades.

**Requisitos:**
- Pipeline no GitHub Actions
- Testes unitários para funções críticas
- Testes de integração para APIs
- Deploy automático após testes passarem

---

### TECH-003: Validar Métricas

**Prioridade:** Baixa
**Categoria:** QA

**Descrição:**
Testar e validar que as métricas (taxa de acerto, contagem de apostas, etc) estão sendo calculadas corretamente.

**Escopo:**
- [ ] Testar cálculo de taxa de acerto
- [ ] Testar contagem de apostas por status
- [ ] Testar agregações por período
- [ ] Comparar com cálculo manual

---

## 6. Priorização Sugerida

### Sprint Imediata (Bugs Críticos)

| Item | Descrição | Esforço |
|------|-----------|---------|
| BUG-001 | Postagens não sendo enviadas | Alto |
| BUG-002 | Odds incorretas (matching) | Médio |

### Sprint 1 (Admin Essencial)

| Item | Descrição | Esforço |
|------|-----------|---------|
| FEAT-001 | Visualizar apostas disponíveis | Médio |
| FEAT-002 | Corrigir odd e link | Médio |
| FEAT-005 | Alertas no grupo admin | Médio |

### Sprint 2 (Admin Completo)

| Item | Descrição | Esforço |
|------|-----------|---------|
| FEAT-003 | Adicionar aposta manual | Médio |
| FEAT-004 | Forçar atualizações | Baixo |

### Backlog (Melhorias)

| Item | Descrição | Esforço |
|------|-----------|---------|
| FEAT-006 | Copy dinâmico com LLM | Médio |
| FEAT-007 | Adicionar mais ligas | Baixo |
| TECH-001 | Simplificar pastas | Baixo |
| TECH-002 | CI/CD com testes | Alto |
| TECH-003 | Validar métricas | Baixo |

---

## Aprovação

| Papel | Nome | Data | Status |
|-------|------|------|--------|
| Product Owner | Marcelomendes | | ⏳ Pendente |

---

*Este documento será atualizado conforme novos requisitos forem identificados.*
