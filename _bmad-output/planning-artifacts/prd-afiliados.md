---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
status: complete
completedAt: '2026-01-19'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/project-context.md
  - docs/architecture.md
workflowType: 'prd'
lastStep: 2
projectType: 'brownfield'
documentCounts:
  brief: 0
  research: 0
  brainstorming: 0
  projectDocs: 4
  externalDocs: 3
externalResearch:
  - url: https://ajuda.cakto.com.br/pt/article/afiliados-sjusjy/
    topic: Cakto Afiliados - Configuração e Modelos
  - url: https://blog.cakto.com.br/cakto-afiliado-como-funciona/
    topic: Cakto Afiliado - Como Funciona
  - url: https://docs.cakto.com.br/
    topic: Cakto API Documentation
classification:
  projectType: 'feature_addition_integration'
  domain: 'betting_gambling_affiliate_marketing'
  complexity: 'medium'
  projectContext: 'brownfield'
elicitationInsights:
  mvpFeatures:
    - name: 'Trial + Tracking'
      description: '2 dias trial, deep link com affiliate_code'
    - name: 'Modelo último clique'
      description: 'Último afiliado sobrescreve anterior'
    - name: 'Janela de atribuição'
      description: '14 dias para atribuição de comissão'
    - name: 'Histórico de afiliados'
      description: 'Campo JSONB affiliate_history com todos os cliques'
    - name: 'Link sempre com tracking'
      description: 'Bot NUNCA envia link genérico de pagamento'
  mvpMkt:
    - name: 'Kit do Afiliado'
      description: 'Criativos, copies, depoimentos prontos'
    - name: 'Guidelines de comunicação'
      description: 'Regras do que afiliado pode/não pode falar'
    - name: 'Processo de atualização'
      description: 'MKT atualiza kit 1x por mês'
  mvpSimplifications:
    - name: 'Dashboard de afiliado'
      description: 'Usar Cakto nativo, não criar próprio'
    - name: 'Gestão de comissão'
      description: 'Cakto cuida (pagamento + estorno automático)'
  p2Epics:
    - name: 'Métricas customizadas'
      description: 'Dashboard próprio com taxa de conversão'
    - name: 'LP auto-cadastro'
      description: 'Landing page para afiliados se registrarem'
  documentation:
    - name: 'Sunset policy'
      description: 'Como encerrar programa sem quebrar links'
businessModel:
  subscription: 'R$50/mês'
  trialDays: 2
  affiliateCommission: '80% primeira venda'
  affiliateDiscount: '10% para usuário'
  attributionWindow: '14 dias'
  attributionModel: 'last_click'
---

# Product Requirements Document - Sistema de Afiliados Bets Estatística

**Author:** Marcelomendes
**Date:** 2026-01-19

## Executive Summary

### Visão do Produto

O **Sistema de Afiliados Bets Estatística** é uma extensão do sistema de membership existente, permitindo que promotores externos tragam novos membros para o grupo de apostas em troca de comissão.

### Problema que Resolve

1. **Para o operador:** Acelera o crescimento da base de membros pagantes sem investir em ads
2. **Para afiliados:** Oferece produto de alta conversão (apostas com 70%+ de acerto) e comissão atrativa (80%)
3. **Para usuários:** Acesso ao grupo com desconto de 10% via link de afiliado

### Modelo de Negócio

| Aspecto | Valor |
|---------|-------|
| Assinatura | R$50/mês |
| Trial | 2 dias |
| Comissão afiliado | 80% da primeira venda (R$40) |
| Desconto usuário | Até 10% (R$45) |
| Atribuição | Último clique, janela 14 dias |

## Project Classification

| Aspecto | Classificação |
|---------|---------------|
| **Tipo de Projeto** | Feature Addition - Integração de Afiliados |
| **Domínio** | Betting/Gambling + Affiliate Marketing |
| **Complexidade** | Média |
| **Contexto** | Brownfield - Extensão do sistema existente |

## Success Criteria

### User Success (Afiliado)

| Critério | Métrica | Meta |
|----------|---------|------|
| **Conversão visível** | Taxa de conversão trial → pago | > 30% |
| **Produto que vende fácil** | Taxa de acerto das apostas | > 70% (já existe) |
| **Credibilidade** | Tempo médio até primeira comissão | < 7 dias |
| **"Aha moment"** | Afiliado vê que o produto converte sozinho | Primeira venda sem esforço |

### Business Success

| Critério | Métrica | Meta Mês 1 | Meta Mês 3 | Meta Mês 6 |
|----------|---------|------------|------------|------------|
| **Novos pagantes via afiliados** | Membros pagos | 100 | 500 | 2.000 |
| **Receita bruta** | MRR adicional | R$ 5.000 | R$ 25.000 | R$ 100.000 |
| **Custo de aquisição** | CAC via afiliado | R$ 40 | R$ 40 | R$ 40 |

### Technical Success

| Critério | Métrica | Meta |
|----------|---------|------|
| **Atribuição correta** | % de vendas atribuídas corretamente | **100%** |
| **Zero fricção** | Cliques até virar membro | ≤ 3 (link → /start → grupo) |
| **Fluxo sem erro** | Taxa de erro no tracking | < 0.1% |
| **Webhook confiável** | Processamento de pagamentos | 100% processados |

### Measurable Outcomes

**Definição de sucesso do programa:**

```
SUCESSO = 100 pagantes no mês 1
        + 100% atribuição correta
        + Afiliado vê produto que converte fácil
        + Zero fricção pro usuário final
```

## Product Scope

### MVP - Minimum Viable Product

**Objetivo:** Validar que afiliados conseguem trazer membros pagantes com tracking correto.

| Funcionalidade | Descrição |
|----------------|-----------|
| Deep link com tracking | `t.me/Bot?start=aff_CODIGO` |
| Registro de afiliado | Campo `affiliate_code` + `affiliate_history` (JSONB) |
| Modelo último clique | Afiliado mais recente sobrescreve anterior |
| Janela de atribuição | 14 dias |
| Link de pagamento dinâmico | Bot sempre inclui tracking do afiliado |
| Cadastro manual | Afiliados cadastrados no Cakto manualmente |
| Kit do Afiliado | Criativos, copies, guidelines (equipe MKT) |

**Fora do MVP:**
- Dashboard próprio de métricas (usar Cakto nativo)
- LP de auto-cadastro de afiliados
- Relatórios customizados
- Múltiplos níveis de comissão

### Growth Features (Post-MVP)

| Feature | Gatilho para Implementar |
|---------|--------------------------|
| Métricas customizadas para afiliados | Após 50 afiliados ativos |
| Relatório de conversão por afiliado | Após validar modelo no mês 1 |
| Múltiplos níveis de comissão | Se afiliados grandes pedirem |

### Vision (Future)

| Feature | Descrição |
|---------|-----------|
| LP auto-cadastro | Afiliado se registra sozinho e recebe link automaticamente |
| Programa de tiers | Bronze/Prata/Ouro com comissões diferentes |
| Recorrência opcional | Afiliado ganha % das renovações (negociável com top performers) |
| Indicação de afiliados | Afiliado indica afiliado e ganha bônus |

## User Journeys

### Jornada 1: Carlos (Afiliado) - Encontrando Produto que Vende Sozinho

**Persona:** Carlos, 28 anos, trabalha com marketing digital, já promoveu outros produtos sem sucesso consistente.

**Trigger:** Vê post sobre o Bets Estatística com 70%+ de acerto.

**Jornada:**
1. Carlos descobre o programa de afiliados através de indicação
2. Entra em contato e é cadastrado manualmente no Cakto
3. Recebe seu link único: `t.me/BetsBot?start=aff_CARLOS123`
4. Recebe Kit do Afiliado com criativos, copies e guidelines
5. Posta no Instagram usando o material do kit
6. Acompanha conversões pelo dashboard do Cakto
7. Primeira venda em 3 dias → recebe R$40 de comissão
8. **"Aha moment"**: Vê que o produto converte sozinho porque realmente entrega resultado

**Outcome:** Carlos se torna promotor ativo, trazendo 5-10 novos membros/mês.

---

### Jornada 2: Ricardo (Usuário via Afiliado) - Sucesso

**Persona:** Ricardo, 35 anos, interessado em apostas esportivas, viu post do Carlos.

**Trigger:** Vê anúncio com link de afiliado prometendo dicas com 70% de acerto.

**Jornada:**
1. Clica no link `t.me/BetsBot?start=aff_CARLOS123`
2. Abre Telegram, bot extrai `aff_CARLOS123` do /start
3. Bot salva `affiliate_code = CARLOS123` no registro do Ricardo
4. Ricardo entra no grupo de trial (2 dias)
5. Durante trial, recebe 3 tips e acerta 2 (vê valor real)
6. No dia 2, bot envia link de pagamento COM tracking: `cakto.com/pay?aff=CARLOS123`
7. Ricardo paga R$45 (com 10% desconto de afiliado)
8. Webhook confirma pagamento, Carlos recebe R$40 de comissão
9. Ricardo continua no grupo como membro pago

**Outcome:** Conversão trial → pago com atribuição correta.

---

### Jornada 3: Ricardo Part 2 - Falha e Recuperação

**Persona:** Mesmo Ricardo, mas não pagou no trial.

**Jornada:**
1. Ricardo entrou via link do Carlos, fez trial de 2 dias
2. Não pagou → bot remove do grupo automaticamente
3. 10 dias depois, Ricardo vê post de outro afiliado (Maria)
4. Clica no link `t.me/BetsBot?start=aff_MARIA456`
5. Bot atualiza: `affiliate_code = MARIA456` (último clique)
6. Bot adiciona ao `affiliate_history`: `[{CARLOS123, dia1}, {MARIA456, dia11}]`
7. Ricardo faz trial novamente
8. Desta vez paga → Maria recebe a comissão (não Carlos)
9. Histórico preservado para análise futura

**Outcome:** Modelo último clique funcionando, histórico preservado.

---

### Jornada 4: Marcelo (Operador) - Gestão

**Persona:** Marcelo, dono do Bets Estatística.

**Jornada:**
1. Afiliado interessado entra em contato
2. Marcelo cadastra no painel Cakto manualmente
3. Define comissão: 80% primeira venda, pode dar 10% desconto
4. Envia Kit do Afiliado (preparado pela equipe MKT)
5. Acompanha vendas e comissões pelo dashboard Cakto
6. Em caso de chargeback, Cakto estorna comissão automaticamente
7. Não precisa fazer nada manual para gestão de comissões

**Outcome:** Operação simplificada, delegando gestão financeira ao Cakto.

## Requisitos Técnicos - Integração de Afiliados

### Mudanças no Banco de Dados

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `affiliate_code` | TEXT | Código do afiliado atual (último clique) |
| `affiliate_history` | JSONB | Array com histórico: `[{code, clicked_at}, ...]` |

### Lógica de Atribuição

| Regra | Comportamento |
|-------|---------------|
| Modelo | Último clique sobrescreve anterior |
| Janela | 14 dias |
| Expiração | Se `clicked_at` > 14 dias, limpar `affiliate_code` |
| Link sem tracking | Gerar link genérico se não há afiliado válido |

### Fluxo do Bot

1. Usuário clica `t.me/Bot?start=aff_CODIGO`
2. Bot extrai `CODIGO` do parâmetro /start
3. Salva em `affiliate_code` e adiciona ao `affiliate_history`
4. No momento do pagamento:
   - Se `affiliate_code` válido (< 14 dias): gerar link COM tracking
   - Se expirado ou vazio: gerar link SEM tracking

### Integração Cakto

| Item | Status |
|------|--------|
| Webhook de pagamento | Já existe |
| Formato link afiliado | Descobrir no painel ao cadastrar afiliado |
| Gestão de comissões | Cakto cuida automaticamente |
| Estorno em chargeback | Cakto cuida automaticamente |

## Functional Requirements

### Tracking de Afiliados

- FR1: Usuário pode acessar o bot via deep link com código de afiliado
- FR2: Bot pode extrair código de afiliado do parâmetro /start
- FR3: Bot pode armazenar código do afiliado atual no registro do usuário
- FR4: Bot pode armazenar histórico de todos os cliques de afiliado do usuário

### Gestão de Atribuição

- FR5: Sistema aplica modelo "último clique" (novo afiliado sobrescreve anterior)
- FR6: Sistema mantém janela de atribuição de 14 dias
- FR7: Sistema expira atribuição se último clique > 14 dias
- FR8: Sistema preserva histórico mesmo quando atribuição atual expira

### Fluxo de Pagamento

- FR9: Bot gera link de pagamento COM tracking quando há afiliado válido
- FR10: Bot gera link de pagamento SEM tracking quando não há afiliado válido
- FR11: Afiliado recebe comissão automaticamente via Cakto quando usuário paga

### Administração

- FR12: Operador pode cadastrar afiliado manualmente no Cakto
- FR13: Operador pode definir comissão e desconto por afiliado no Cakto
- FR14: Operador pode acompanhar vendas e comissões pelo dashboard Cakto
- FR15: Sistema estorna comissão automaticamente em caso de chargeback (via Cakto)

## Non-Functional Requirements

### Reliability (Confiabilidade)

- NFR1: Tracking de afiliado deve funcionar em 100% dos casos de deep link válido
- NFR2: Histórico de cliques nunca deve perder dados (append-only)
- NFR3: Expiração de 14 dias deve ser calculada corretamente sempre

### Integration (Integração)

- NFR4: Webhook de pagamento Cakto deve ser processado em todas as requisições
- NFR5: Falha de webhook deve ser logada para investigação manual
- NFR6: Link de pagamento com tracking deve seguir formato exato da Cakto

