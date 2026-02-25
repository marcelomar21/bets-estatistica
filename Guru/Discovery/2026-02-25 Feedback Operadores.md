---
date: "2026-02-25"
participants: [Operador Guru, Operador Osmar, Marcelomendes]
tags: [discovery]
---

# Feedback dos Operadores — 2026-02-25

## Fonte: Operadores dos grupos Guru da Bet e Osmar Palpites

---

## BUGS REPORTADOS

**B1 — Guru não faz disparos automáticos**
- Severidade: CRÍTICA
- O scheduler depende de `posting_schedule.enabled` na tabela `groups` + `BOT_MODE` correto no Render
- Pode ser config errada ou bot crashando silenciosamente
- Osmar funciona → código é compartilhado, provável problema de infra/config do deploy Guru
- Arquivos relevantes: `bot/server.js`, `bot/server.scheduler.js`

**B2 — Guru não responde comandos no Telegram**
- Severidade: CRÍTICA
- Webhook pode estar desconfigurado ou bot offline
- Osmar responde normalmente → mesmo código, problema isolado no deploy Guru
- Diagnóstico: checar `getWebhookInfo` + logs no Render (`srv-d5hp23a4d50c7397o1q0`)

**B3 — Alerta de acerto/erro invertido**
- Severidade: ALTA
- `trackResults.js` usa LLM (atualmente `config.llm.heavyModel` = `gpt-5.2`) via `evaluateBetsWithLLM()` para determinar resultado
- Avaliação é não-determinística — LLM pode alucinar resultados
- Não há validação determinística como fallback (comparação direta de score)
- Arquivo: `bot/jobs/trackResults.js`, `bot/services/resultEvaluator.js`

**B4 — Alerta só cobre 2 de 3 apostas**
- Severidade: ALTA
- `getBetsToTrack()` filtra por `kickoff_time` numa janela 2h-4h após o jogo
- Se a 3ª aposta tem kickoff fora dessa janela, ela escapa do tracking
- Pode ser que jogos de horários diferentes (ex: 10h, 15h, 22h) caiam em ciclos diferentes do cron
- Arquivo: `bot/jobs/trackResults.js`

**B5 — Osmar só envia até 3 apostas (selecionando 4+)**
- Severidade: MÉDIA
- Comportamento é **by design**: `getFilaStatus()` tem limite hardcoded de max 3 bets por slot
- Decisão do usuário: **remover o limite**, permitir quantas apostas quiser
- Arquivo: `bot/services/betService.js` (`getFilaStatus`)

---

## DISTRIBUIÇÃO DESBALANCEADA

**D1 — Apostas do Osmar parecem preferenciais às do Guru**
- O round-robin em `distributeBets.js` usa `groups[i % len]`
- Grupos ordenados por `created_at ASC` → Osmar (criado primeiro) sempre pega bet[0], bet[2], bet[4]...
- Sem randomização, o primeiro grupo sistematicamente leva o "primeiro pick"
- Arquivo: `bot/jobs/distributeBets.js` (`distributeRoundRobin`)

**D2 — Guru tem odds e jogos inferiores**
- Consequência direta de D1
- Apostas no início do array tendem a ser as de maior confiança/odds do pipeline de IA
- Solução: randomizar ou implementar distribuição por qualidade equilibrada

---

## CUSTOMIZAÇÃO / TOM DE VOZ

**V1 — Osmar: não pode falar "apostas"**
- `copyService.js` usa LLM para gerar copy das mensagens
- O prompt atual não tem restrições de vocabulário por grupo
- Necessário: configuração per-group de palavras proibidas/tom

**V2 — Bot erra tradução de nome de time**
- `enrichOdds.js` usa fuzzy matching (Jaccard similarity) para encontrar times
- Nomes podem vir em inglês da API (FootyStats/Odds API)
- O copy final herda o nome como veio da API, sem tradução consistente

**V3 — Tom de voz configurável**
- Não existe configuração per-group de tom/persona no sistema atual
- Decisão do usuário: criar seção "Tom de Voz" no admin panel
- Super admins selecionam o grupo e editam o tom de voz
- O tom vira parte do system prompt do `copyService` para aquele grupo

---

## FEATURE: PREVIEW + EDIÇÃO DE MENSAGENS

**F1 — Preview e edição antes do disparo**
- Hoje o fluxo é: admin clica "Postar" → bot gera copy via LLM → envia direto
- Pedido: ver a mensagem gerada, poder editar texto/tom/nome de time, e só depois confirmar envio
- Impacto: muda o fluxo do `postBets.js` e do endpoint `post-now`
- Precisa de design de UI (chamar design)

---

## DECISÃO ARQUITETURAL: SERVIDOR ÚNICO MULTI-BOT

**A1 — Migrar de 1 serviço/bot para 1 serviço/N bots**
- Situação atual: cada bot é um deploy separado no Render com seu próprio processo
  - `srv-d5hp23a4d50c7397o1q0` → Guru da Bet
  - `srv-d6678u1r0fns73ciknn0` → Osmar Palpites
- Problema: operacionalmente complexo, difícil de escalar, config duplicada, N deploys
- Decisão: consolidar em **1 processo Node.js que gerencia N bots**
- Impactos:
  - Múltiplos tokens/webhooks no mesmo processo
  - Scheduler precisa orquestrar jobs de N grupos
  - Isolamento de falhas (1 grupo crashar não pode derrubar os outros)
  - Deploy no Render muda completamente (1 serviço vs N)
  - **Mudança grande — requer refinamento dedicado**

---

## DECISÃO TÉCNICA: VALIDAÇÃO DE RESULTADOS COM CONSENSO MULTI-LLM

**T1 — Substituir avaliação single-LLM por consenso de 3 LLMs**
- Hoje: 1 chamada LLM (heavy model) decide acerto/erro (não-determinístico, pode alucinar)
- Proposta do usuário: usar 3 LLMs independentes de **provedores distintos**
  - **GPT-5.1-mini** (OpenAI) + **Claude Sonnet 4.6** (Anthropic) + **Kimi 2.5** (Moonshot)
  - Se as 3 concordam → resultado confirmado
  - Se há divergência → step adicional de confirmação (flag para revisão manual)
- Aumenta custo de API mas reduz drasticamente erros de avaliação

---

## Action Items

| Item | Tasks Relacionadas |
|---|---|
| B1 + B2 (Guru offline + sem resposta) | [[1.1 Guru Offline]] |
| B3 (Alertas invertidos) | [[1.6 Precisão Evaluator LLM]] e [[3.2 Consenso Multi-LLM]] |
| B4 (Tracking incompleto) | [[1.5 Recovery Sweep Tracking]] |
| B5 (Limite 3 apostas) | [[1.2 Remover Limite 3 Bets]] |
| D1 + D2 (Distribuição desbalanceada) | [[3.1 Distribuição Fair]] |
| V1 + V2 + V3 (Tom de voz) | [[4.1 API Tom de Voz]], [[4.2 UI Tom de Voz]], [[4.3 Integrar Tom copyService]] |
| F1 (Preview/Edição) | [[4.4 API Preview Mensagens]], [[4.5 UI Preview Edição]] |
| A1 (Servidor único) | [[E06 Multi-Bot Evolution/_Overview]] |
| T1 (Consenso multi-LLM) | [[3.2 Consenso Multi-LLM]] |