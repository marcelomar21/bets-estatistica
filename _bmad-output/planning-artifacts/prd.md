---
stepsCompleted: [1, 2, 3, 4, 7, 8, 9, 10, 11]
inputDocuments:
  - docs/index.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/data-models.md
  - docs/source-tree-analysis.md
  - docs/development-guide.md
workflowType: 'prd'
lastStep: 2
projectType: 'brownfield'
documentCounts:
  brief: 0
  research: 0
  brainstorming: 0
  projectDocs: 6
projectClassification:
  type: 'api_backend + automation_bot'
  domain: 'betting/gambling'
  complexity: 'medium-high'
lastEdited: '2026-01-17'
editHistory:
  - date: '2026-01-17'
    changes: 'Adição de sistema de gestão de membros e pagamentos: modelo de monetização (R$50/mês, trial 7 dias), integração Cakto via webhooks, 27 novos FRs (FR-MB1-MB27) para entrada/trial/notificações/remoção/comandos admin, 4 novos NFRs (NFR21-24), 3 novas User Journeys (Lucas trial, Lucas não pagou, Marcelo membros), modelo de dados members/member_notifications, métricas de MRR/conversão/churn'
  - date: '2026-01-12'
    changes: 'Revisão do ciclo de vida da aposta: novo modelo de elegibilidade (elegivel/removida/expirada), suporte a promoção manual (/promover), remoção da fila (/remover), comando de status (/status), lógica de seleção por job com histórico de múltiplas postagens'
---

# Product Requirements Document - bets-estatistica

**Author:** Marcelomendes
**Date:** 2026-01-10

## Executive Summary

### Visão do Produto

O **Bets Estatística** está pivotando de uma ferramenta de análise individual para um **canal de distribuição automatizado de apostas** via Telegram. O sistema continuará utilizando a inteligência artificial existente (LangChain + GPT-5) para gerar análises estatísticas, mas focará exclusivamente em **apostas seguras (safe_bets)** curadas por odds reais do mercado.

A proposta de valor é simples: membros do grupo recebem 3x ao dia as melhores oportunidades de aposta, com análise completa e **link direto para apostar em 1 clique**.

### Problema que Resolve

1. **Para apostadores:** Elimina horas de pesquisa - recebem apostas analisadas por IA, rankeadas por odds, prontas para clicar
2. **Para o operador:** Transforma análises em canal de aquisição/monetização escalável
3. **Para o mercado:** Oferece transparência com tracking público de resultados

### O Que Torna Isso Especial

- **Curadoria por IA + Odds Reais:** Não é só análise estatística - são apostas rankeadas pelo melhor retorno potencial
- **Ação em 1 Clique:** Deep links pré-configurados eliminam fricção entre "ver a dica" e "apostar"
- **Engajamento Recorrente:** 3 posts diários mantêm o grupo ativo e criam hábito nos membros
- **Credibilidade via Dados:** Tracking de resultados constrói confiança ao longo do tempo
- **Escala:** Sistema automatizado permite crescer sem esforço manual proporcional

### Modelo de Monetização

**Assinatura mensal de R$ 50,00** com trial gratuito de 7 dias:

- **Entrada gratuita:** Qualquer pessoa pode entrar no grupo via link de campanha
- **Trial automático:** 7 dias para experimentar as dicas gratuitamente
- **Conversão:** Após o trial, usuário deve pagar para continuar no grupo
- **Cobrança via Cakto:** Integração com webhooks para gestão automática de assinaturas
- **Remoção automática:** Inadimplentes são removidos automaticamente do grupo

### Meta Principal

**10.000 membros pagantes no grupo Telegram até o fim de 2026**

## Project Classification

**Technical Type:** Backend Automation + Bot
**Domain:** Betting/Gambling
**Complexity:** Média-Alta
**Project Context:** Brownfield - estendendo sistema existente

### Integrações Necessárias

| Integração | Status | Notas |
|------------|--------|-------|
| **The Odds API** | ✅ Definido | $30/mês, cobre Bet365, Betano e 50+ casas |
| **Telegram Bot API** | ✅ Conhecida | API oficial bem documentada |
| **Deep Links** | ✅ Manual | Operador gera manualmente via grupo admin |
| **Supabase** | ✅ Definido | PostgreSQL gerenciado, free tier para MVP |
| **Render** | ✅ Definido | Hosting, free tier para MVP |
| **Cakto** | ✅ Definido | Webhooks para gestão de pagamentos e assinaturas |

### Fluxo de Links (Decisão de Arquitetura)

```
Bot posta no GRUPO ADMIN (8h, 13h, 20h)
    → "Preciso do link para: Liverpool vs Arsenal - Over 2.5"
    → Operador vai na casa, monta aposta, copia link
    → Operador responde com o link
    → Bot valida e salva no BD
    → Se demorar, bot manda lembrete
    → Nos horários (10h, 15h, 22h), bot posta no GRUPO PÚBLICO
    → Só posta se tiver link válido
```

### Escopo Atual

- **Ligas:** Manter as já configuradas (expansão futura)
- **Tipo de apostas:** Apenas safe_bets (gols, cartões, escanteios, extra)
- **Janela temporal:** Jogos com pelo menos 2 dias de antecedência
- **Frequência:** 3 posts fixos por dia (horários a definir)
- **Tracking:** Sucesso/fracasso salvo no BD (não publicado no grupo)

## Success Criteria

### User Success

| Critério | Meta | Descrição |
|----------|------|-----------|
| **Taxa de Acerto** | > 70% | Das apostas sugeridas, mais de 70% devem ser assertivas |
| **Odds Mínimas** | ≥ 1.60 | Nenhuma aposta com odds abaixo de 1.60 é publicada |
| **Aha Moment** | Consistência | Usuário percebe que as dicas acertam regularmente com retorno real |

**Indicadores de satisfação:**
- Usuário segue as dicas com frequência
- Usuário recomenda o grupo para amigos
- Baixa taxa de saída do grupo

### Business Success

| Período | Meta de Membros Pagantes | MRR Estimado | Status |
|---------|--------------------------|--------------|--------|
| 3 meses | 150 | R$ 7.500 | 🎯 Validação inicial |
| 6 meses | 1.000 | R$ 50.000 | 📈 Tração comprovada |
| 12 meses | 10.000 | R$ 500.000 | 🚀 Escala |

**Métrica principal de sucesso:** MRR (Monthly Recurring Revenue) e membros pagantes

**Métricas de monetização:**
- Taxa de conversão trial → pago: meta > 30%
- Churn mensal: meta < 10%
- LTV (Lifetime Value): meta > R$ 300 (6 meses de retenção média)

**Indicadores secundários:**
- Taxa de engajamento (cliques nos links)
- Retenção de membros (quem fica vs quem sai)
- Viralidade (membros que convidam outros)

### Technical Success

| Aspecto | Critério | Importância |
|---------|----------|-------------|
| **Disponibilidade do Bot** | 3 posts/dia nos horários fixos, sem falha | Crítico |
| **Atualização de Odds** | Odds verificadas antes de cada postagem | Crítico |
| **Tracking de Resultados** | 100% dos jogos com resultado registrado no BD | Alto |
| **Latência** | Postagem em < 5s após horário programado | Médio |

### Measurable Outcomes

**Para declarar o projeto um sucesso em 12 meses:**

1. ✅ 10.000 membros pagantes no grupo Telegram
2. ✅ MRR de R$ 500.000
3. ✅ Taxa de conversão trial → pago > 30%
4. ✅ Churn mensal < 10%
5. ✅ Taxa de acerto histórica > 70%
6. ✅ Todas as apostas com odds ≥ 1.60
7. ✅ Zero dias sem postagem (disponibilidade 100%)
8. ✅ 100% dos resultados trackeados no BD

## Product Scope

### MVP - Minimum Viable Product

**Objetivo:** Validar que o sistema funciona e converte os primeiros 150 membros pagantes

| Componente | Descrição |
|------------|-----------|
| **Geração de Apostas** | Manter pipeline atual, apenas safe_bets |
| **Filtro de Odds** | Integrar API de odds, filtrar ≥ 1.60 |
| **Ranking** | Ordenar por odds (maior primeiro) |
| **Bot Telegram** | Postar 3x/dia com top 3 apostas |
| **Deep Links** | Links Bet365 com aposta pré-configurada |
| **Tracking Básico** | Registrar sucesso/fracasso no BD |
| **Gestão de Membros** | Trial 7 dias, detecção de entrada, tracking de status |
| **Integração Cakto** | Webhooks para pagamento e assinatura |
| **Notificações de Cobrança** | Lembretes automáticos (dia 5, 6, 7 do trial) |
| **Remoção Automática** | Kick de inadimplentes no dia 8 ou falha de renovação |

**Fora do MVP:**
- PDF/relatórios (removido)
- Value bets (apenas safe_bets)
- Múltiplas casas de apostas (apenas Bet365)
- Bloqueio de re-entrada de inadimplentes (P2)

### Growth Features (Post-MVP)

| Feature | Gatilho | Descrição |
|---------|---------|-----------|
| **Comandos Admin Membros** | Logo após MVP | /membros, /membro, /estender, /add_trial |
| **Bloqueio Re-entrada** | 500 membros | Impedir inadimplentes de voltarem sem pagar |
| **Expansão de Ligas** | 1.000 membros | Adicionar mais ligas/campeonatos |
| **Múltiplas Casas** | Demanda | Suporte a outras casas além de Bet365 |
| **Dashboard Público** | 500 membros | Página com histórico de acertos + métricas |
| **Notificações Personalizadas** | 2.000 membros | Filtro por liga/tipo de aposta |

### Vision (Future)

- **Afiliados:** Programa de afiliados Bet365
- **App Mobile:** App próprio com push notifications
- **Comunidade:** Fórum/discussão entre membros
- **IA Avançada:** Modelo próprio treinado no histórico de acertos
- **Planos Premium:** Diferentes tiers de assinatura com benefícios exclusivos

## User Journeys

### Journey 1: Ricardo - O Apostador Casual Que Busca Consistência

Ricardo tem 32 anos, trabalha como analista de TI e sempre gostou de futebol. Aposta ocasionalmente nos fins de semana, mas está cansado de perder dinheiro com "achismos" e palpites de amigos. Ele já tentou estudar estatísticas sozinho, mas não tem tempo nem paciência para analisar dezenas de jogos por semana.

Um dia, um colega de trabalho menciona um grupo no Telegram que está "acertando bastante". Ricardo entra cético, esperando mais um grupo de palpites aleatórios. Na primeira semana, apenas observa. Percebe que as dicas são diferentes: vêm com análises detalhadas, odds sempre acima de 1.60, e links diretos para apostar.

Na segunda semana, decide testar. Clica no link de uma aposta de "mais de 2.5 gols" em um jogo da Premier League. A aposta é feita em segundos - zero fricção. Naquela noite, o jogo termina 3-1. Primeira vitória.

Três semanas depois, Ricardo já acompanha as 3 postagens diárias religiosamente. Das 15 apostas que seguiu, acertou 11. Começa a indicar o grupo para os amigos do trabalho. O "aha moment" veio quando percebeu: **não precisa mais pesquisar - só seguir e apostar**.

### Journey 2: Ricardo - Quando a Aposta Não Dá Certo

É quarta-feira à noite. Ricardo viu a postagem das 18h e apostou nos 3 jogos sugeridos. Dois acertaram, mas o terceiro - um "ambas marcam" em um jogo do Brasileirão - não entrou. O jogo terminou 2-0.

Ricardo não fica frustrado. Ele já entendeu que o sistema mira em **70% de acerto, não 100%**. Ao longo do mês, os acertos compensam. O que importa para ele é que as dicas são **consistentes e justificadas** - não são chutes.

O que ele não vê: nos bastidores, o sistema já registrou automaticamente que aquela aposta falhou. Quando o resultado final do jogo foi confirmado, o tracking atualizou o BD.

### Journey 3: Marcelo - O Operador Que Monitora Tudo

Marcelo é o criador do Bets Estatística. Toda manhã, antes de começar o trabalho, ele abre o painel de logs para verificar se as 3 postagens do dia anterior foram enviadas corretamente.

Hoje, algo chamou sua atenção: a postagem das 22h de ontem não foi enviada. O log mostra que a API de odds retornou erro 500. O bot detectou isso e não postou (melhor não postar do que postar sem odds).

Marcelo corrige a configuração, força um retry manual, e às 9h30 a postagem atrasada vai pro grupo. 

Às segundas-feiras, Marcelo verifica as métricas da semana:
- Novos membros: +23
- Taxa de acerto: 72%
- Postagens enviadas: 21/21
- Cliques nos links: 847

### Journey 4: Ana - A Apostadora Veterana Que Quer Mais

Ana está no grupo há 3 meses. Ela é mais experiente - entende de odds, sabe o que é value bet, acompanha múltiplas casas. O grupo está funcionando bem, mas ela quer expansão para outras ligas.

Marcelo responde que está no roadmap para quando chegarem a 1.000 membros. Ana entende que qualidade é mais importante que quantidade e continua no grupo.

### Journey 5: Lucas - O Membro que Entra pelo Trial

Lucas viu uma campanha no Instagram sobre o grupo de tips de apostas. Clicou no link e entrou no grupo do Telegram. Imediatamente recebeu uma mensagem de boas-vindas explicando que tem 7 dias grátis para testar.

No dia 5, Lucas recebeu uma mensagem privada: "Seu trial termina em 2 dias! Clique aqui para continuar recebendo as melhores apostas: [link do checkout]". No dia 6, outro lembrete. No dia 7, o último aviso.

Lucas clicou no link, pagou R$ 50,00 via PIX. Em segundos, recebeu confirmação: "Pagamento confirmado! Você agora é membro ativo até DD/MM/AAAA."

Um mês depois, 5 dias antes da renovação, Lucas começou a receber lembretes diários (porque pagou com PIX, não cartão). Dessa vez pagou antes do vencimento.

### Journey 6: Lucas - Quando Não Paga

Lucas 2 (outro usuário) entrou no grupo pelo mesmo link de campanha. Gostou das dicas nos primeiros dias, mas no dia 5 ignorou o lembrete. No dia 6, outro lembrete. No dia 7, o aviso final com tom de urgência.

No dia 8, Lucas 2 tentou acessar o grupo e viu: "Você foi removido por não completar o pagamento." Junto veio o link do checkout caso queira voltar.

O sistema registrou automaticamente: `status = 'removido'`, `motivo = 'trial_expirado'`.

### Journey 7: Marcelo - Gerenciando Membros

Marcelo digita `/membros` no grupo admin. O bot responde:

```
📊 MEMBROS DO GRUPO

✅ Ativos: 847
🆓 Trial: 23
⚠️ Inadimplentes: 5
❌ Removidos (30d): 12

MRR: R$ 42.350
Conversão trial: 34%
```

Ele quer ver detalhes de um membro específico. Digita `/membro @lucas` e vê:
- Data de entrada: 10/01/2026
- Status: Ativo
- Tipo pagamento: PIX
- Próxima renovação: 10/02/2026 (em 8 dias)
- Histórico: 2 pagamentos realizados

Um amigo pede cortesia. Marcelo digita `/estender @amigo 30` e o bot confirma: "✅ Assinatura de @amigo estendida por 30 dias."

### Journey Requirements Summary

| Jornada | Requisitos Revelados |
|---------|---------------------|
| **Ricardo - Sucesso** | Mensagens claras (análise + odds + link), Deep links funcionais, Frequência 3x/dia |
| **Ricardo - Falha** | Tracking automático de resultados, Transparência sobre taxa esperada |
| **Marcelo - Operador** | Logs de execução, Painel de métricas, Retry manual, Alertas de falha |
| **Ana - Expansão** | Roadmap público, Comunicação com membros, Sistema extensível |
| **Lucas - Trial Sucesso** | Detecção de entrada, trial automático, lembretes dia 5-7, integração Cakto, confirmação de pagamento |
| **Lucas - Não Pagou** | Kick automático dia 8, mensagem de remoção com link para voltar, registro de motivo |
| **Marcelo - Membros** | Comandos /membros, /membro, /estender, visualização de MRR e conversão |

## Backend + Bot Specific Requirements

### Arquitetura de Integrações

| Integração | Tipo | Autenticação | Rate Limit | Status |
|------------|------|--------------|------------|--------|
| **FootyStats API** | REST | API Key | ~1000/dia | ✅ Existente |
| **The Odds API** | REST | API Key | 500/mês (free), 20k ($30) | ✅ Definido |
| **Telegram Bot API** | REST | Bot Token | 30 msg/s | ✅ Conhecida |
| **Supabase** | REST/SDK | API Key | Generous | ✅ Definido |
| **Cakto API** | Webhooks | Secret + Bearer | Resposta < 5s | ✅ Definido |

### Infraestrutura

| Componente | Escolha | Tier | Custo Estimado |
|------------|---------|------|----------------|
| **Hosting** | Render | Free → Starter | $0 → $7/mês |
| **Banco de Dados** | Supabase PostgreSQL | Free | $0 (500MB) |
| **API de Odds** | The Odds API | Free → 20k | $0 → $30/mês |
| **OpenAI** | GPT-4o-mini | Pay-as-you-go | ~$20-50/mês |

**Custo total MVP:** ~$0-50/mês (depende do volume)

### Scheduling & Automação

**Timezone:** America/Sao_Paulo (UTC-3)

**Postagens Programadas:**

| Horário | Grupo | Tipo | Descrição |
|---------|-------|------|-----------|
| 08:00 | Admin | Pedido | Pedir links para apostas da manhã |
| 10:00 | Público | Post | Top 3 apostas do dia - manhã |
| 13:00 | Admin | Pedido | Pedir links para apostas da tarde |
| 15:00 | Público | Post | Top 3 apostas do dia - tarde |
| 20:00 | Admin | Pedido | Pedir links para apostas da noite |
| 22:00 | Público | Post | Top 3 apostas do dia - noite |

**Lembretes (se operador não responder):**

| Tempo após pedido | Ação |
|-------------------|------|
| 30 min | 1º lembrete |
| 60 min | 2º lembrete (urgente) |
| 90 min | Alerta final |

**Triggers de Evento:**

| Trigger | Ação | Descrição |
|---------|------|-----------|
| Jogo termina | Update BD | Registrar resultado (sucesso/fracasso) da aposta |
| Operador responde | Salvar link | Validar e associar link à aposta |
| Novo membro entra | Registrar trial | Iniciar contagem de 7 dias |
| Webhook Cakto | Processar pagamento | Atualizar status do membro |
| Trial dia 5-7 | Enviar lembrete | Notificação de cobrança |
| Trial expirado | Kick membro | Remover do grupo automaticamente |

### Integração Cakto (Pagamentos)

**Endpoint Webhook:** `POST /api/webhooks/cakto`

**Eventos Processados:**

| Evento | Ação no Sistema |
|--------|-----------------|
| `purchase_approved` | Marcar membro como `ativo`, registrar pagamento |
| `subscription_created` | Registrar tipo de assinatura (cartão/pix) |
| `subscription_renewed` | Atualizar `data_proxima_renovacao` |
| `subscription_renewal_refused` | Marcar para kick imediato |
| `subscription_canceled` | Marcar para kick imediato |

**Fluxo de Processamento:**

```
┌─────────────────────────────────────────────────────────────────┐
│              CICLO DE VIDA DO MEMBRO                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Link Campanha] → [Entra no Grupo] → [Trial Inicia (7 dias)]  │
│                                              │                  │
│                    ┌─────────────────────────┼─────────────────┐│
│                    │                         │                 ││
│                    ▼                         ▼                 ▼│
│               Dia 5: Aviso 1          Dia 6: Aviso 2      Dia 7│
│               (se não pagou)          (se não pagou)         │ │
│                                                              │ │
│                    ┌─────────────────────────────────────────┤ │
│                    │                                         │ │
│                    ▼                                         ▼ │
│               [PAGOU] ─────────────────────────────► [NÃO PAGOU]
│                    │                                         │ │
│                    ▼                                         ▼ │
│          [Membro Ativo]                                  [KICK]│
│                    │                                           │
│     ┌──────────────┼──────────────┐                           │
│     │              │              │                           │
│     ▼              ▼              ▼                           │
│  [Cartão]     [PIX/Boleto]   [Renovação]                      │
│  Recorrente    Avulso         Falhou                          │
│     │              │              │                           │
│     ▼              ▼              ▼                           │
│  Sem avisos    Avisos 5d       [KICK]                         │
│  (auto-renew)  antes           Imediato                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Jobs de Gestão de Membros:**

| Job | Horário | Descrição |
|-----|---------|-----------|
| `check_trial_reminders` | 09:00 | Envia lembretes para membros no dia 5, 6, 7 do trial |
| `check_renewal_reminders` | 09:00 | Envia lembretes para membros com renovação em 5 dias (só PIX/Boleto) |
| `kick_expired_trials` | 00:01 | Remove membros que completaram 8 dias sem pagar |
| `process_failed_renewals` | Contínuo | Remove membros com renovação recusada (via webhook) |

### Modelo de Dados - Tabela `members`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `telegram_id` | bigint | ID único do Telegram |
| `telegram_username` | varchar | @username |
| `telegram_name` | varchar | Nome de exibição |
| `email` | varchar | Email do pagamento (via Cakto) |
| `status` | enum | `trial`, `ativo`, `inadimplente`, `removido` |
| `data_entrada` | timestamp | Quando entrou no grupo |
| `data_pagamento` | timestamp | Último pagamento |
| `data_proxima_renovacao` | timestamp | Próxima cobrança |
| `tipo_pagamento` | enum | `cartao_recorrente`, `pix`, `boleto`, `manual` |
| `cakto_subscription_id` | varchar | ID da assinatura no Cakto |
| `trial_dias` | int | Dias de trial (override individual) |
| `cortesia_dias` | int | Dias extras por cortesia |
| `motivo_remocao` | varchar | trial_expirado, inadimplente, cancelado, manual |
| `created_at` | timestamp | Criação do registro |
| `updated_at` | timestamp | Última atualização |

### Modelo de Dados - Tabela `member_notifications`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | uuid | PK |
| `member_id` | uuid | FK → members |
| `tipo` | enum | `trial_reminder`, `renewal_reminder`, `kick_warning`, `welcome`, `payment_confirmed` |
| `enviado_em` | timestamp | Quando foi enviado |
| `mensagem` | text | Conteúdo enviado |

### Modelo de Dados - Tabela `config` (campos adicionais)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `trial_dias_padrao` | int | Default: 7 |
| `cakto_checkout_url` | varchar | Link do checkout para mensagens |
| `cakto_webhook_secret` | varchar | Para validar webhooks |
| `preco_assinatura` | decimal | R$ 50,00 |

### Pipeline de Dados

```
┌─────────────────────────────────────────────────────────────────┐
│                     PIPELINE DIÁRIO                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [FootyStats] ──► [Supabase: Jogos] ──► [IA Agent] ──► [bets]  │
│                                              │                  │
│                                              ▼                  │
│  [The Odds API] ──────────────────► [Enriquecer com odds]      │
│                                              │                  │
│                                              ▼                  │
│                            [elegibilidade = 'elegivel']         │
│                                              │                  │
│  ┌───────────────────────────────────────────┼─────────────────┐│
│  │         OVERRIDE DE ADMIN (a qualquer momento)              ││
│  │  /promover <id> → adiciona à fila (ignora odds min)         ││
│  │  /remover <id>  → remove da fila                            ││
│  │  /status        → lista fila atual                          ││
│  └───────────────────────────────────────────┼─────────────────┘│
│                                              │                  │
│                                              ▼                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  SELEÇÃO POR JOB (10h, 15h, 22h)                          │  │
│  │  WHERE elegibilidade = 'elegivel'                         │  │
│  │    AND odds_preenchidas = true                            │  │
│  │    AND data_jogo entre agora e +2 dias                    │  │
│  │    AND (odds >= 1.60 OR promovida_manual = true)          │  │
│  │  ORDER BY odds DESC LIMIT 3                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│                    [Postar no GRUPO PÚBLICO]                    │
│                              │                                  │
│                              ▼                                  │
│                    [Registrar em historico_postagens]           │
│                              │                                  │
│                              ▼                                  │
│                    [Jogo termina → atualizar resultado]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Formato da Mensagem Telegram

**Estrutura sugerida:**

```
🔥 APOSTAS DO DIA - [MANHÃ/TARDE/NOITE]

━━━━━━━━━━━━━━━━━━━━

⚽ JOGO 1: [Time A] vs [Time B]
📅 [Data] às [Hora]
🎯 Aposta: [Tipo de aposta]
📊 Odd: [X.XX]

💡 Análise: [Justificativa resumida]

👉 APOSTAR AGORA: [Deep Link Bet365]

━━━━━━━━━━━━━━━━━━━━

⚽ JOGO 2: ...

⚽ JOGO 3: ...

━━━━━━━━━━━━━━━━━━━━

📈 Taxa de acerto: XX% (últimos 30 dias)
```

### Ciclo de Vida da Aposta

O ciclo de vida da aposta tem **três dimensões independentes**:

| Dimensão | Campo | Valores | Descrição |
|----------|-------|---------|-----------|
| **Elegibilidade** | `elegibilidade` | `elegivel`, `removida`, `expirada` | Define se a aposta pode entrar na seleção dos jobs |
| **Promoção Manual** | `promovida_manual` | `true`, `false` | Se true, ignora filtro de odds mínimas |
| **Resultado** | `resultado` | `pendente`, `sucesso`, `falha`, `cancelado` | Resultado após o jogo terminar |

**Fluxo de elegibilidade:**

```
[GERADA] → [odds_preenchidas=true] → [elegibilidade='elegivel']
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
            Admin /promover         Seleção automática      Admin /remover
            (promovida_manual=true)    (top 3 odds)        (elegibilidade='removida')
                    │                      │                      │
                    └──────────────────────┼──────────────────────┘
                                           │
                                           ▼
                                    [Job posta no grupo]
                                           │
                                           ▼
                               [Registra em historico_postagens]
                                           │
                                           ▼
                                    [Jogo termina]
                                           │
                                           ▼
                               [resultado = sucesso/falha/cancelado]
```

**Regras de elegibilidade:**
- Uma aposta `elegivel` pode ser selecionada por múltiplos jobs até o jogo acontecer
- Uma aposta `removida` não será selecionada, mas pode voltar a ser `elegivel` via `/promover`
- Uma aposta `expirada` tem data do jogo no passado (atualização automática)

### Modelo de Dados - Tabela `suggested_bets`

**Campos de Elegibilidade e Publicação:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `elegibilidade` | enum | `elegivel`, `removida`, `expirada` |
| `promovida_manual` | boolean | Se true, ignora filtro de odds ≥ 1.60 |
| `odds_preenchidas` | boolean | Se true, odds foram obtidas da API |
| `historico_postagens` | jsonb | Array de timestamps de cada postagem |
| `odds_at_post` | decimal | Odd no momento da última postagem |

**Campos de Resultado:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `resultado` | enum | `pendente`, `sucesso`, `falha`, `cancelado` |
| `result_updated_at` | timestamp | Quando o resultado foi registrado |

### Lógica de Seleção por Job

Cada job (10h, 15h, 22h) executa a seguinte lógica:

```sql
SELECT * FROM suggested_bets
WHERE elegibilidade = 'elegivel'
  AND odds_preenchidas = true
  AND data_jogo BETWEEN now() AND now() + interval '2 days'
  AND (odds >= 1.60 OR promovida_manual = true)
ORDER BY odds DESC
LIMIT 3;
```

**Após postagem:**
1. Adiciona timestamp atual ao array `historico_postagens`
2. Atualiza `odds_at_post` com odd atual
3. Aposta continua `elegivel` para próximos jobs (até jogo acontecer)

### Tracking de Resultados

**Fluxo de atualização:**

1. Jogo termina → sistema verifica resultado
2. Resultado comparado com aposta → `resultado` = `sucesso` ou `falha`
3. Se jogo cancelado/adiado → `resultado` = `cancelado`
4. Métricas agregadas atualizadas

### Requisitos de Disponibilidade

| Componente | SLA Target | Fallback |
|------------|------------|----------|
| Postagem 10h/15h/22h | 99.9% | Retry automático, alerta se falhar |
| API de Odds | 99% | Cache de última consulta, não postar se offline |
| Tracking de Resultados | 99% | Retry em background, não bloqueia postagem |

### Monitoramento & Logs

| Evento | Log Level | Ação |
|--------|-----------|------|
| Post enviado com sucesso | INFO | Registrar message_id |
| API de Odds indisponível | ERROR | Alerta + não postar |
| Resultado registrado | INFO | Atualizar métricas |
| Erro de postagem | ERROR | Alerta + retry |

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**Abordagem:** Problem-Solving MVP
**Objetivo:** Validar sistema e atingir 150 membros em 3 meses
**Filosofia:** Lançar rápido, iterar com feedback real

**Recursos Necessários (MVP):**
- 1 desenvolvedor (você)
- Conta Bet365 para testar deep links
- Créditos OpenAI (~$50/mês estimado)
- API de Odds (~$30-100/mês dependendo do provider)
- VPS para rodar o bot 24/7 (~$10-20/mês)

### MVP Feature Set (Phase 1) - Meta: 150 membros

**Must-Have (Sem isso, não funciona):**

| Feature | Prioridade | Complexidade | Dependência |
|---------|------------|--------------|-------------|
| Filtrar apenas safe_bets | P0 | Baixa | Nenhuma |
| Integrar The Odds API | P0 | Média | API Key |
| Filtrar odds ≥ 1.60 | P0 | Baixa | The Odds API |
| Rankear por odds | P0 | Baixa | Filtro de odds |
| Bot Telegram (2 grupos) | P0 | Média | Bot Token |
| Grupo Admin: pedir links | P0 | Média | Bot Telegram |
| Grupo Admin: receber links | P0 | Média | Bot Telegram |
| Grupo Admin: validar links | P0 | Baixa | Regex |
| Grupo Admin: lembretes | P0 | Baixa | Cron |
| Postagem pública 3x/dia | P0 | Baixa | Links coletados |
| Migrar para Supabase | P0 | Média | Supabase account |
| Tracking sucesso/fracasso | P0 | Média | Resultado dos jogos |

**Nice-to-Have (MVP pode funcionar sem):**

| Feature | Prioridade | Quando Adicionar |
|---------|------------|------------------|
| Mensagens variadas/engajadoras | P1 | Após lançamento |
| Taxa de acerto na mensagem | P1 | Após 30 dias de dados |
| Retry automático em falhas | P1 | Quando ocorrer primeira falha |
| Alertas para operador | P2 | Quando escalar |

### Phase 2: Growth - Meta: 1.000 membros

**Gatilho:** MVP validado + 150 membros + taxa > 70%

| Feature | Objetivo |
|---------|----------|
| Dashboard público de resultados | Credibilidade + viralidade |
| Múltiplas mensagens por horário | Variedade de conteúdo |
| Análise de cliques nos links | Entender engajamento |
| Webhook para resultados | Tracking em tempo real |

### Phase 3: Expansion - Meta: 10.000 membros

**Gatilho:** 1.000 membros + demanda clara

| Feature | Objetivo |
|---------|----------|
| Expansão de ligas | Mais conteúdo |
| Múltiplas casas de apostas | Melhores odds |
| Grupo premium/pago | Monetização |
| Programa de afiliados | Revenue |

### Risk Mitigation Strategy

**Riscos Técnicos:**

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Bet365 não tem API de odds pública | Alta | Alto | Usar The Odds API ou Betfair |
| Deep links não funcionam como esperado | Média | Médio | Testar antes, ter fallback de URL simples |
| API de odds cara demais | Média | Médio | Começar com tier gratuito, escalar com membros |

**Riscos de Mercado:**

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Taxa de acerto < 70% | Média | Crítico | Refinar modelo de IA, ajustar critérios |
| Baixo engajamento no grupo | Média | Alto | Mensagens mais atrativas, horários diferentes |
| Crescimento lento de membros | Média | Médio | Marketing orgânico, indicação com incentivo |

**Riscos de Recursos:**

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| Custos de API maiores que esperado | Média | Médio | Monitorar, cachear dados, otimizar chamadas |
| Tempo de desenvolvimento maior | Média | Médio | Focar no P0, adiar P1/P2 |

### Definition of Done - MVP

O MVP está pronto quando:

- [ ] Bot posta automaticamente 3x/dia nos horários certos
- [ ] Cada post tem 3 apostas com odds ≥ 1.60
- [ ] Cada aposta tem justificativa e deep link funcional
- [ ] Sistema registra sucesso/fracasso de cada aposta
- [ ] Funcionou por 7 dias consecutivos sem falha crítica

## Functional Requirements

### Geração de Apostas

- FR1: Sistema pode gerar análises estatísticas para jogos usando IA (LangChain + OpenAI)
- FR2: Sistema pode filtrar apenas apostas do tipo safe_bets das análises geradas
- FR3: Sistema pode descartar value_bets e manter apenas safe_bets
- FR4: Sistema pode armazenar apostas geradas na tabela suggested_bets

### Integração de Odds

- FR5: Sistema pode consultar odds em tempo real de uma API externa
- FR6: Sistema pode associar odds a cada aposta gerada
- FR7: Sistema pode filtrar apostas com odds < 1.60, exceto quando `promovida_manual = true`
- FR8: Sistema pode ordenar apostas por odds (maior primeiro)
- FR9: Sistema pode selecionar as top 3 apostas com maiores odds

### Publicação Telegram (Grupo Público)

- FR10: Bot pode enviar mensagens para o grupo público do Telegram
- FR11: Bot pode postar automaticamente nos horários 10h, 15h e 22h (America/Sao_Paulo)
- FR12: Bot pode formatar mensagens com informações do jogo, aposta, odds e justificativa
- FR13: Bot pode incluir link de aposta fornecido pelo operador
- FR14: Bot pode variar o texto das mensagens para manter engajamento
- FR15: Bot pode exibir taxa de acerto histórica na mensagem

### Grupo Admin (Coleta de Links)

- FR16: Bot pode postar pedidos de links no grupo admin (8h, 13h, 20h)
- FR17: Bot pode formatar pedido com detalhes da aposta (jogo, mercado, odd esperada)
- FR18: Bot pode detectar quando operador responde com um link
- FR19: Bot pode validar se o link é de uma casa de apostas conhecida (Bet365, Betano, etc.)
- FR20: Bot pode salvar link associado à aposta no BD
- FR21: Bot pode enviar lembrete se operador não responder em X minutos
- FR22: Bot pode confirmar recebimento do link com ✅

### Deep Links

- FR23: Sistema pode armazenar links de aposta fornecidos pelo operador
- FR24: Sistema só posta no grupo público se a aposta tiver link válido
- FR25: Usuário pode clicar no link e ser direcionado para a aposta na casa

### Tracking de Resultados

- FR26: Sistema pode registrar status de cada aposta (pending, success, failure, cancelled)
- FR27: Sistema pode detectar quando um jogo termina
- FR28: Sistema pode comparar resultado do jogo com a aposta sugerida
- FR29: Sistema pode atualizar automaticamente o status da aposta após o jogo
- FR30: Sistema pode armazenar odds no momento da postagem
- FR31: Sistema pode armazenar timestamp de cada postagem

### Métricas e Monitoramento

- FR32: Sistema pode calcular taxa de acerto (últimos 30 dias)
- FR33: Sistema pode calcular taxa de acerto histórica (all-time)
- FR34: Operador pode visualizar logs de execução do bot
- FR35: Operador pode verificar status de postagens (enviadas/falhadas)
- FR36: Operador pode forçar retry manual de postagem falhada
- FR37: Sistema pode alertar operador em caso de falha crítica

### Regras de Negócio

- FR38: Sistema deve manter pelo menos 3 apostas ativas a qualquer momento
- FR39: Sistema deve considerar apenas jogos com pelo menos 2 dias de antecedência
- FR40: Sistema não deve postar no grupo público se aposta não tiver link válido
- FR41: Sistema não deve postar se API de odds estiver indisponível
- FR42: Sistema deve pedir links 2h antes do horário de postagem pública

### Gestão de Dados

- FR43: Sistema pode buscar dados de jogos da API FootyStats
- FR44: Sistema pode armazenar jogos, times e estatísticas no PostgreSQL (Supabase)
- FR45: Sistema pode gerenciar fila de análise de partidas
- FR46: Sistema pode sincronizar dados com Supabase

### Gestão de Elegibilidade (Grupo Admin)

- FR47: Bot pode processar comando `/promover <id>` para marcar aposta como `elegivel` e `promovida_manual = true`, ignorando filtro de odds mínimas
- FR48: Bot pode processar comando `/remover <id>` para marcar aposta como `elegibilidade = 'removida'`, excluindo-a da seleção de jobs futuros
- FR49: Bot pode processar comando `/status` para listar apostas elegíveis, próximo horário de postagem e contagem de apostas na fila
- FR50: Sistema pode incluir apostas com `promovida_manual = true` na seleção mesmo quando odds < 1.60
- FR51: Bot pode confirmar execução de comandos admin com feedback visual (✅ ou ❌)

### Gestão de Membros - Entrada e Trial (FR-MB1-MB6)

- FR-MB1: Bot pode detectar quando um novo usuário entra no grupo público via Telegram API
- FR-MB2: Sistema pode registrar novo membro no BD com `telegram_id`, `username`, `data_entrada`, `status = 'trial'`
- FR-MB3: Sistema pode calcular dias restantes de trial para cada membro
- FR-MB4: Sistema pode identificar método de pagamento do membro (cartão recorrente vs avulso)
- FR-MB5: Bot pode enviar mensagem de boas-vindas ao novo membro explicando o trial de 7 dias
- FR-MB6: Sistema pode armazenar configuração global de dias de trial (default: 7)

### Gestão de Membros - Integração Cakto Webhooks (FR-MB7-MB12)

- FR-MB7: Sistema pode receber webhooks do Cakto via endpoint HTTPS com validação de secret
- FR-MB8: Sistema pode processar evento `purchase_approved` e marcar membro como `status = 'ativo'`
- FR-MB9: Sistema pode processar evento `subscription_created` e registrar tipo de assinatura
- FR-MB10: Sistema pode processar evento `subscription_renewed` e atualizar `data_proxima_renovacao`
- FR-MB11: Sistema pode processar evento `subscription_renewal_refused` e marcar membro para remoção imediata
- FR-MB12: Sistema pode processar evento `subscription_canceled` e marcar membro para remoção imediata

### Gestão de Membros - Notificações (FR-MB13-MB17)

- FR-MB13: Sistema pode enviar mensagem privada no Telegram para membros em trial
- FR-MB14: Sistema pode enviar lembrete diário a partir do dia 5 do trial para membros que não pagaram
- FR-MB15: Sistema pode enviar lembrete diário a partir de 5 dias antes da renovação para membros com pagamento avulso (PIX/Boleto)
- FR-MB16: Sistema não envia lembretes de renovação para membros com cartão de crédito recorrente
- FR-MB17: Sistema pode incluir link de checkout do Cakto nas mensagens de cobrança

### Gestão de Membros - Remoção Automática (FR-MB18-MB21)

- FR-MB18: Sistema pode remover (kick) membro do grupo Telegram via API
- FR-MB19: Sistema pode executar kick automático no dia 8 (trial expirado) se membro não pagou
- FR-MB20: Sistema pode executar kick imediato quando renovação falha ou assinatura é cancelada
- FR-MB21: Sistema pode enviar mensagem ao membro removido com motivo e link para voltar

### Gestão de Membros - Comandos Admin (FR-MB22-MB27) [P1]

- FR-MB22: Bot pode processar comando `/membros` e listar membros ativos, em trial, e inadimplentes com MRR e taxa de conversão
- FR-MB23: Bot pode processar comando `/membro @user` e exibir status detalhado (data entrada, status, dias restantes, histórico de pagamentos)
- FR-MB24: Bot pode processar comando `/trial <dias>` e configurar duração padrão do trial
- FR-MB25: Bot pode processar comando `/add_trial @user` e adicionar usuário manualmente ao trial
- FR-MB26: Bot pode processar comando `/remover_membro @user` e remover membro manualmente do grupo
- FR-MB27: Bot pode processar comando `/estender @user <dias>` e estender assinatura por cortesia

## Non-Functional Requirements

### Performance

| Requisito | Métrica | Prioridade |
|-----------|---------|------------|
| NFR1: Postagem deve ocorrer no horário programado | ± 30 segundos do horário | Alta |
| NFR2: Consulta de odds deve completar rapidamente | < 5 segundos por aposta | Alta |
| NFR3: Geração de deep links pode ser pré-processada | < 5 minutos (job pré-envio) | Baixa |
| NFR4: Tracking de resultados pode ter delay razoável | < 30 minutos após fim do jogo | Baixa |

### Reliability (Confiabilidade)

| Requisito | Métrica | Prioridade |
|-----------|---------|------------|
| NFR5: Bot deve estar disponível nos horários de postagem | Online às 10h, 15h, 22h. Cold start OK | Alta |
| NFR6: Postagens não devem ser perdidas | 0 postagens perdidas por mês | Crítica |
| NFR7: Sistema deve recuperar de falhas automaticamente | Retry em < 5 minutos | Alta |
| NFR8: Dados de tracking não devem ser perdidos | 100% dos resultados registrados | Alta |

### Security

| Requisito | Métrica | Prioridade |
|-----------|---------|------------|
| NFR9: API keys devem ser armazenadas de forma segura | Variáveis de ambiente, não hardcoded | Alta |
| NFR10: Bot token do Telegram deve ser protegido | Rotação possível sem downtime | Média |
| NFR11: Logs não devem expor credenciais | Auditoria de logs | Média |

### Scalability

| Requisito | Métrica | Prioridade |
|-----------|---------|------------|
| NFR12: Sistema deve suportar crescimento de membros | Até 10.000 membros sem degradação | Média |
| NFR13: Custos de API devem ser previsíveis | Orçamento máximo definido | Média |

### Integration

| Requisito | Métrica | Prioridade |
|-----------|---------|------------|
| NFR14: Sistema deve tolerar indisponibilidade de APIs externas | Fallback graceful, não quebrar | Média-Baixa |
| NFR15: Sistema deve cachear dados de odds | Cache de 5 minutos para reduzir chamadas | Média |
| NFR16: Sistema deve logar todas as chamadas de API | Debugging e auditoria | Média |

### Operabilidade

| Requisito | Métrica | Prioridade |
|-----------|---------|------------|
| NFR17: Operador deve ser alertado de falhas críticas | Notificação em < 5 minutos | Alta |
| NFR18: Sistema deve ter logs estruturados | JSON logs com timestamp, level, context | Média |
| NFR19: Deploy deve ser simples | 1 comando para deploy | Média |
| NFR20: Rollback deve ser possível | Voltar versão anterior em < 5 minutos | Média |

### Gestão de Membros

| Requisito | Métrica | Prioridade |
|-----------|---------|------------|
| NFR21: Webhook do Cakto deve ser processado rapidamente | < 5 segundos (requisito do Cakto) | Alta |
| NFR22: Remoção de membro inadimplente deve ocorrer no horário correto | ± 1 hora do momento programado | Alta |
| NFR23: Mensagens de cobrança devem ser entregues | 99% de entrega via Telegram API | Alta |
| NFR24: Dados de membros devem ser protegidos | Criptografia em trânsito, acesso restrito | Alta |
