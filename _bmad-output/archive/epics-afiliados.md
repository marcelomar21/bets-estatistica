---
stepsCompleted: [1, 2, 3, 4]
status: complete
completedAt: '2026-01-19'
inputDocuments:
  - _bmad-output/planning-artifacts/prd-afiliados.md
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/epics.md (Epic 16)
---

# Sistema de Afiliados - Epic Breakdown

## Overview

Este documento decompõe os requisitos do PRD de Afiliados em epics e stories implementáveis, estendendo o Epic 16 (Membership) existente.

## Requirements Inventory

### Functional Requirements

**Tracking de Afiliados:**
- FR1: Usuário pode acessar o bot via deep link com código de afiliado
- FR2: Bot pode extrair código de afiliado do parâmetro /start
- FR3: Bot pode armazenar código do afiliado atual no registro do usuário
- FR4: Bot pode armazenar histórico de todos os cliques de afiliado do usuário

**Gestão de Atribuição:**
- FR5: Sistema aplica modelo "último clique" (novo afiliado sobrescreve anterior)
- FR6: Sistema mantém janela de atribuição de 14 dias
- FR7: Sistema expira atribuição se último clique > 14 dias
- FR8: Sistema preserva histórico mesmo quando atribuição atual expira

**Fluxo de Pagamento:**
- FR9: Bot gera link de pagamento COM tracking quando há afiliado válido
- FR10: Bot gera link de pagamento SEM tracking quando não há afiliado válido
- FR11: Afiliado recebe comissão automaticamente via Cakto quando usuário paga

**Administração (Manual no Cakto):**
- FR12: Operador pode cadastrar afiliado manualmente no Cakto
- FR13: Operador pode definir comissão e desconto por afiliado no Cakto
- FR14: Operador pode acompanhar vendas e comissões pelo dashboard Cakto
- FR15: Sistema estorna comissão automaticamente em caso de chargeback (via Cakto)

### Non-Functional Requirements

**Reliability:**
- NFR1: Tracking de afiliado deve funcionar em 100% dos casos de deep link válido
- NFR2: Histórico de cliques nunca deve perder dados (append-only)
- NFR3: Expiração de 14 dias deve ser calculada corretamente sempre

**Integration:**
- NFR4: Webhook de pagamento Cakto deve ser processado em todas as requisições
- NFR5: Falha de webhook deve ser logada para investigação manual
- NFR6: Link de pagamento com tracking deve seguir formato exato da Cakto

### Additional Requirements (da Architecture e Epic 16)

**Infraestrutura existente a ser estendida:**
- Tabela `members` já existe com state machine (trial → ativo → inadimplente → removido)
- Webhook server Cakto já implementado (porta 3001)
- `memberService.js` já existe com CRUD de membros
- `caktoService.js` já existe com OAuth + API
- Jobs de membership já implementados

**Mudanças necessárias:**
- Adicionar campos `affiliate_code` e `affiliate_history` na tabela `members`
- Modificar handler de /start para extrair código de afiliado
- Modificar geração de link de pagamento para incluir tracking
- Implementar lógica de expiração de 14 dias
- Trial de afiliados: 2 dias (vs 7 dias regular)

### FR Coverage Map

| FR | Epic | Story | Descrição |
|----|------|-------|-----------|
| FR1 | 18 | 18.1 | Deep link com código afiliado |
| FR2 | 18 | 18.1 | Extrair código do /start |
| FR3 | 18 | 18.1 | Armazenar affiliate_code |
| FR4 | 18 | 18.1 | Armazenar affiliate_history |
| FR5 | 18 | 18.1 | Modelo último clique |
| FR6 | 18 | 18.2 | Janela 14 dias |
| FR7 | 18 | 18.2 | Expirar atribuição |
| FR8 | 18 | 18.1 | Preservar histórico |
| FR9 | 18 | 18.3 | Link COM tracking |
| FR10 | 18 | 18.3 | Link SEM tracking |
| FR11 | 18 | 18.3 | Comissão via Cakto |
| FR12-15 | N/A | N/A | Manual no Cakto |

## Epic List

- **Epic 18:** Sistema de Afiliados (Extensão Epic 16)

---

## Epic 18: Sistema de Afiliados

Permitir que afiliados tragam novos membros para o grupo, com atribuição correta de comissão via Cakto.

**Valor para o Usuário:**
- Afiliado pode promover o grupo e receber comissão (80% primeira venda)
- Usuário final tem desconto (10%) via link de afiliado
- Operador cresce base sem investir em ads

**FRs cobertos:** FR1-11
**NFRs endereçados:** NFR1-6
**Dependência:** Epic 16 (Membership) - estende infraestrutura existente

---

### Story 18.1: Tracking de Afiliados e Entrada

**As a** sistema,
**I want** detectar e armazenar código de afiliado quando usuário entra via deep link,
**So that** possa atribuir comissão corretamente quando o usuário pagar.

**Acceptance Criteria:**

**Given** migration executada no Supabase
**When** tabela `members` alterada
**Then** novos campos existem:
  - `affiliate_code` (TEXT, nullable)
  - `affiliate_history` (JSONB, default '[]')
  - `affiliate_clicked_at` (TIMESTAMPTZ, nullable)

**Given** usuário clica em `t.me/BetsBot?start=aff_CODIGO123`
**When** bot recebe comando /start com parâmetro
**Then** bot extrai `CODIGO123` do parâmetro (remove prefixo `aff_`)
**And** salva `affiliate_code = 'CODIGO123'` no registro do membro
**And** salva `affiliate_clicked_at = now()`
**And** adiciona ao `affiliate_history`: `[{code: 'CODIGO123', clicked_at: now()}]`

**Given** usuário já tem `affiliate_code` de afiliado anterior
**When** clica em novo link de afiliado diferente
**Then** `affiliate_code` é sobrescrito com novo código (último clique)
**And** novo clique é adicionado ao `affiliate_history` (append)
**And** histórico anterior é preservado

**Given** usuário clica em link sem parâmetro de afiliado (`t.me/BetsBot?start=`)
**When** bot processa /start
**Then** fluxo normal de entrada continua
**And** `affiliate_code` não é alterado

**Technical Notes:**
- Criar `sql/migrations/004_affiliate_tracking.sql`
- Modificar handler de /start em `bot/handlers/` para detectar prefixo `aff_`
- Usar `memberService.js` para atualizar campos

---

### Story 18.2: Lógica de Expiração de Atribuição

**As a** sistema,
**I want** expirar atribuição de afiliado após 14 dias,
**So that** afiliado só receba comissão de conversões recentes.

**Acceptance Criteria:**

**Given** membro tem `affiliate_code` definido
**When** `affiliate_clicked_at` é mais de 14 dias atrás
**Then** atribuição é considerada expirada
**And** `affiliate_code` deve ser limpo (set null)
**And** `affiliate_clicked_at` deve ser limpo (set null)
**And** `affiliate_history` é preservado (nunca apagar)

**Given** job `check-affiliate-expiration` agendado
**When** executa diariamente às 00:30 BRT
**Then** busca todos os membros com `affiliate_clicked_at < now() - 14 days`
**And** limpa `affiliate_code` e `affiliate_clicked_at` desses membros
**And** loga quantidade de atribuições expiradas

**Given** função `isAffiliateValid(member)` chamada
**When** `affiliate_code` existe e `affiliate_clicked_at` < 14 dias
**Then** retorna `true`
**And** quando `affiliate_code` é null ou `affiliate_clicked_at` >= 14 dias
**Then** retorna `false`

**Given** membro com atribuição expirada clica em novo link de afiliado
**When** bot processa /start com `aff_NEWCODE`
**Then** atribuição é renovada com novo código
**And** novo clique é adicionado ao histórico

**Technical Notes:**
- Criar `bot/jobs/membership/check-affiliate-expiration.js`
- Adicionar ao schedule existente em `bot/jobs/membership/index.js`
- Usar lock distribuído (padrão existente)
- Função helper `isAffiliateValid()` em `memberService.js`

---

### Story 18.3: Link de Pagamento Dinâmico com Tracking

**As a** sistema,
**I want** gerar link de pagamento com tracking de afiliado quando aplicável,
**So that** Cakto possa atribuir comissão automaticamente ao afiliado correto.

**Acceptance Criteria:**

**Given** membro em trial com `affiliate_code` válido (< 14 dias)
**When** bot gera link de pagamento
**Then** link inclui parâmetro de afiliado do Cakto
**And** formato: `{CAKTO_CHECKOUT_URL}?aff={affiliate_code}` (validar formato exato com Cakto)

**Given** membro em trial sem `affiliate_code` ou com atribuição expirada
**When** bot gera link de pagamento
**Then** link é gerado SEM parâmetro de afiliado
**And** formato: `{CAKTO_CHECKOUT_URL}` (link genérico)

**Given** função `generatePaymentLink(member)` chamada
**When** `isAffiliateValid(member)` retorna true
**Then** retorna link COM tracking: `{ url, hasAffiliate: true, affiliateCode }`
**And** quando `isAffiliateValid(member)` retorna false
**Then** retorna link SEM tracking: `{ url, hasAffiliate: false, affiliateCode: null }`

**Given** membro recebe mensagem de cobrança (trial dia 2, renewal reminder, etc.)
**When** mensagem inclui link de pagamento
**Then** link é gerado dinamicamente usando `generatePaymentLink()`
**And** log registra se link teve tracking ou não

**Given** webhook de `purchase_approved` recebido do Cakto
**When** pagamento processado
**Then** Cakto já atribuiu comissão ao afiliado (automático)
**And** sistema não precisa fazer nada adicional para comissão

**Technical Notes:**
- Criar função `generatePaymentLink(member)` em `memberService.js`
- Modificar mensagens de cobrança para usar função dinâmica
- Variável de ambiente: `CAKTO_AFFILIATE_PARAM` (descobrir formato exato)
- Logar com prefixo `[membership:payment-link]`

---

## Ordem de Implementação - Epic 18

1. Story 18.1 (Migration + Tracking) → Base de dados e captura
2. Story 18.2 (Expiração) → Lógica de janela de atribuição
3. Story 18.3 (Payment Link) → Integração final com Cakto

**Estimativa:** 1-2 dias de desenvolvimento

