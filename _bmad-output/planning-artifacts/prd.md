---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation-skipped', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
completedAt: '2026-02-27'
inputDocuments:
  - _bmad-output/project-context.md
  - docs/project-overview.md
  - docs/architecture.md
  - docs/data-models.md
  - docs/development-guide.md
  - docs/metrics.md
  - docs/source-tree-analysis.md
  - docs/index.md
workflowType: 'prd'
projectType: 'brownfield'
documentCounts:
  brief: 0
  research: 0
  brainstorming: 0
  projectDocs: 8
classification:
  projectType: 'Feature Addition — API Backend + Multi-Channel Messaging'
  domain: 'Betting/Gambling + SaaS Multi-tenant'
  complexity: 'medium-high'
  projectContext: 'brownfield'
---

# Product Requirements Document - bets-estatistica

**Author:** Marcelomendes
**Date:** 2026-02-27

## Project Classification

| Aspecto | Valor |
|---------|-------|
| **Tipo** | Feature Addition — API Backend + Multi-Channel Messaging |
| **Domínio** | Betting/Gambling + SaaS Multi-tenant |
| **Complexidade** | Média-Alta |
| **Contexto** | Brownfield (estendendo sistema existente) |

## Executive Summary

**Objetivo:** Tornar o GuruBet multi-canal, adicionando WhatsApp como canal de entrega paralelo ao Telegram. Clientes escolhem onde receber (Telegram, WhatsApp ou ambos). A lógica de negócio, admin panel e pipeline de apostas permanecem idênticos — apenas o transporte muda.

**Motivação:** WhatsApp é o mensageiro dominante no Brasil. Pelo menos 10 clientes grandes já pedem WhatsApp, e o canal habilita novos influencers que hoje não operam no Telegram.

**Abordagem técnica:** Baileys (biblioteca Node.js, API não-oficial do WhatsApp Web) com pool de 3+ números por grupo para resiliência contra bans. Serviço isolado no Render, reaproveitando 100% da lógica de negócio existente.

## Success Criteria

### User Success
- Cliente entra no grupo WhatsApp em menos de 2 cliques após confirmação de pagamento (recebe link de convite automaticamente)
- Postagens de apostas chegam no WhatsApp com a mesma qualidade e timing do Telegram
- Cliente nunca percebe troca de número admin — serviço é contínuo
- Experiência de "primeira aposta acertada" mantida (mesma lógica de seleção IA)

### Business Success
- 10+ clientes grandes migram ou adicionam WhatsApp nos primeiros 30 dias
- Canal WhatsApp habilita novos influencers que hoje não operam no Telegram — expansão de mercado
- Mesma taxa de conversão trial→pago que o Telegram (fluxo de pagamento idêntico)
- Zero perda de grupo por ban — pool de números garante continuidade

### Technical Success
- Failover < 5 minutos — número banido é substituído automaticamente, sem intervenção manual
- Mínimo 3 números admin por grupo (1 ativo + 2 reservas), rotação automática
- Grupo WhatsApp sobrevive a qualquer ban individual — a gestão é do grupo, não do número
- Serviço WhatsApp isolado do Telegram — falha em um não afeta o outro
- Sessões Baileys persistidas no Supabase — reconexão automática após restart do serviço

### Measurable Outcomes
- Tempo de entrada no grupo pós-pagamento: < 60 segundos
- Tempo de failover pós-ban: < 5 minutos
- Uptime do grupo: 99.9% (graças ao pool de 3+)
- Postagens entregues: 100% das apostas postadas no Telegram também vão pro WhatsApp

## Product Scope

### MVP — Tudo que o Telegram já faz, mas no WhatsApp

**Infraestrutura WhatsApp:**
- Conexão Baileys com pool de 3+ números por grupo
- Failover automático (ban detectado → próximo número assume → provisionar reserva)
- Persistência de sessões no Supabase
- Serviço separado no Render (isolado do Telegram)

**Gestão de Membros (reaproveitando lógica existente):**
- Entrada controlada via invite link pós-pagamento
- Kick automático de inadimplentes
- Notificações 1:1 (trial reminder, renewal, farewell) — via WhatsApp
- Mesma state machine de membership (trial → ativo → inadimplente → removido)

**Postagem (reaproveitando copy existente):**
- Apostas postadas no WhatsApp com mesma lógica e timing do Telegram
- Formatação adaptada (Markdown Telegram → formatação WhatsApp)
- Mesmo schedule configurável por grupo

**Admin Panel (reutilizar 100% do existente):**
- Onboarding de grupo WhatsApp pelo painel (1-click, como Telegram)
- Gestão de membros funciona independente do canal
- Dashboard, métricas, bets — tudo agnóstico de canal
- Gestão de números WhatsApp (status, health, rotação) integrada no painel existente
- Cliente escolhe canal preferido no checkout (Telegram / WhatsApp / ambos)

**Abstração de canal:**
- Lógica de negócio 100% agnóstica de plataforma
- Membro tem `preferred_channel` — sistema roteia pro canal certo
- Mesma API, mesmos services, só o transporte muda

### Fora de Escopo
- WhatsApp Communities
- Bot commands / inline keyboards (WhatsApp não suporta em grupos)
- Funcionalidades novas que não existem no Telegram

## User Journeys

### Jornada 1: Lucas (Membro) — Entra no grupo e ganha trial

Lucas é apostador e segue o Osmar no Instagram. Vê um story com o link do grupo WhatsApp VIP.

**Entrada no grupo:**
- **Opção A (grupo aberto com aprovação):** Lucas pede pra entrar no grupo. Sistema aprova automaticamente.
- **Opção B (link direto):** Lucas clica no invite link e entra direto.

**Trial automático:**
1. Bot detecta novo membro no grupo
2. Lucas recebe mensagem privada automática: _"Bem-vindo ao Guru da Bet! Você tem 3 dias de trial gratuito. Após isso, assine para continuar recebendo: [link checkout]"_
3. Recebe apostas normalmente durante o trial
4. Dia 2: lembrete _"Seu trial acaba amanhã. Assine para continuar: [link]"_
5. Dia 3 sem pagar: kick suave — removido do grupo + mensagem: _"Seu trial acabou. Para voltar, assine aqui: [link checkout]"_

**Reativação pós-pagamento:**
1. Lucas paga via Mercado Pago
2. Webhook confirma pagamento → status muda pra `ativo`
3. Lucas recebe novo invite link automaticamente por DM no WhatsApp
4. Entra no grupo como membro ativo

**Inadimplência (membro ativo que para de pagar):**
1. Webhook `subscription_renewal_refused` → status `inadimplente`
2. Grace period de 2 dias com lembretes
3. Dia 3: kick suave + mensagem de despedida com link de checkout
4. Link de convite anterior revogado

_Fluxo idêntico ao Telegram — mesma state machine (trial → ativo → inadimplente → removido), apenas o canal de entrega muda._

### Jornada 2: Osmar (Influencer) — "Quero WhatsApp"

Osmar já opera no Telegram com 200 membros. Quer oferecer WhatsApp.

1. Osmar fala com o super admin: "Quero um grupo WhatsApp"
2. Super admin vai no admin panel → grupo do Osmar → "Adicionar canal WhatsApp"
3. Sistema aloca 3 números do **pool global** da plataforma
4. Cria o grupo WhatsApp automaticamente com os 3 como admin
5. Configura grupo como "só admins enviam" (membros só leem)
6. Osmar recebe: "Seu grupo WhatsApp está ativo! Link de convite: [link]"
7. Osmar divulga o link nas redes sociais
8. Apostas passam a ser postadas automaticamente nos dois canais

_Osmar não sabe e não precisa saber quais números são. Os números são recurso da plataforma._

### Jornada 3: Failover Automático — Ban de número

3h da manhã. O número principal do grupo do Osmar é banido pelo WhatsApp.

1. Baileys detecta desconexão com `DisconnectReason.loggedOut` (status 401)
2. Sistema marca número como `banned`, desaloca do grupo
3. Próximo número do **pool global** é alocado automaticamente ao grupo
4. Grupo continua com 3 admins (2 originais + 1 novo do pool)
5. Tempo total: < 5 minutos, sem intervenção humana
6. Alerta no admin Telegram: _"🔴 Número +5511XXXX banido. Substituído por +5511ZZZZ. Pool global: 12/15 disponíveis."_
7. Quando pool fica baixo (< 5 disponíveis): _"🟡 Pool de números baixo. Considere adicionar mais."_

_Ninguém acordou. Ninguém fez nada. O grupo continuou funcionando._

### Jornada 4: Postagem Diária Multi-Canal

9:55, cinco minutos antes da postagem das 10h.

1. `distributeBets` roda, seleciona apostas elegíveis pro grupo do Osmar
2. Sistema verifica canais ativos do grupo: Telegram + WhatsApp
3. **Telegram:** fluxo existente (confirmação admin → post público)
4. **WhatsApp:** número ativo do pool → `sendMessage()` via Baileys → grupo WhatsApp
5. Formatação adaptada: `*bold*` funciona igual, links inline, emojis
6. Mensagem postada em ambos os canais simultaneamente
7. Job registra sucesso em `job_executions` com metadata de canal

## Domain-Specific Requirements

### Riscos da API Não-Oficial (Baileys)

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| Ban de número pelo WhatsApp | Alta probabilidade | Pool de 3+ números/grupo + failover automático < 5 min |
| Detecção aumentada pela Meta (2025+) | Média | Rate limiting (10-20 msgs/min), comportamento orgânico |
| Mudança no protocolo WhatsApp Web | Média | Baileys é ativamente mantido (8.4K stars, releases regulares) |
| Sem SLA ou garantia de serviço | Aceitar | WhatsApp é canal complementar, não substituto do Telegram |
| Sessão WebSocket cai após 24h+ | Conhecida | Persistência no Supabase + reconexão automática |
| Baileys instável em sessões longas | Média | Reconexão automática + heartbeat 60s |
| Signal keys desatualizam | Alta | Persistir TODA atualização no Supabase imediatamente |
| Baileys para de ser mantido | Baixa | Abstração de canal permite migrar pra alternativa |
| Serviço 24/7 custa mais que webhook | Baixa | Render Starter ($7/mês) — custo mínimo |
| Chips pré-pagos expiram | Média | Heartbeat mantém ativos, monitorar expiração |

### Restrições Técnicas
- Rate limit implícito: máximo ~10-20 mensagens/minuto por número antes de trigger anti-spam
- Sessões Baileys exigem conexão WebSocket persistente (não funciona com spin-down)
- Auth state (Signal keys) atualiza a cada mensagem — persistir no banco, não em arquivo
- Serviço precisa rodar 24/7 (diferente do bot Telegram que acorda por webhook)

### Postura de Risco
- WhatsApp é **canal complementar**, nunca substituto do Telegram
- Se API não-oficial se tornar inviável no futuro, o sistema continua funcionando 100% via Telegram
- Investimento em abstração de canal permite trocar Baileys por API oficial se/quando Meta liberar grupos maiores

## Technical Architecture

### Modelo de Dados

**Tabelas existentes (alterações):**

| Tabela | Alteração | Detalhes |
|--------|-----------|----------|
| `groups` | Nova coluna | `whatsapp_group_id TEXT` — ID do grupo no WhatsApp |
| `members` | Novas colunas | `channel TEXT DEFAULT 'telegram'`, `whatsapp_phone TEXT` |

Membro que usa ambos os canais = 2 linhas na tabela `members` (uma por canal, mesmo `group_id`).

**Tabelas novas:**

**`whatsapp_numbers`** — Pool global de números
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador |
| `phone_number` | TEXT | Número formatado (+5511...) |
| `status` | TEXT | `available`, `allocated`, `banned`, `connecting` |
| `group_id` | UUID FK NULL | NULL se available, FK groups se allocated |
| `role` | TEXT | `active` (1 por grupo) ou `backup` |
| `session_data` | JSONB | Auth state do Baileys (credentials) |
| `last_heartbeat` | TIMESTAMP | Último heartbeat de conexão |
| `banned_at` | TIMESTAMP NULL | Quando foi banido |
| `allocated_at` | TIMESTAMP NULL | Quando foi alocado ao grupo |

**`whatsapp_sessions`** — Signal keys do Baileys
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `number_id` | UUID FK | Referência ao número |
| `key_type` | TEXT | Tipo da chave Signal |
| `key_data` | JSONB | Dados da chave |
| `updated_at` | TIMESTAMP | Última atualização |

### Arquitetura de Serviço

```
Render:
  bets-bot-unified        → Telegram (todos os grupos)     [EXISTENTE]
  bets-whatsapp-unified   → WhatsApp (todos os grupos)     [NOVO]
  bets-webhook            → Pagamentos Mercado Pago        [EXISTENTE]
```

- **1 processo Node.js** gerencia todos os grupos WhatsApp
- **N instâncias Baileys** (1 por número alocado, não por grupo)
- WebSocket persistente por número — serviço roda **24/7** (sem spin-down)
- Startup: carrega todos os números alocados do banco, reconecta sessões

### Fluxo de Alocação de Números

```
Pool Global: [N1, N2, N3, N4, N5, ...] (status: available)

Onboarding grupo Osmar:
  1. Aloca N1, N2, N3 → group_id = osmar_uuid
  2. N1.role = 'active', N2.role = 'backup', N3.role = 'backup'
  3. Cria grupo WhatsApp com N1, N2, N3 como admin
  4. Pool restante: [N4, N5, ...]

Ban de N1:
  1. N1.status = 'banned', N1.banned_at = now()
  2. N2 promovido a role = 'active'
  3. N4 alocado ao grupo como 'backup'
  4. Pool restante: [N5, ...]
  5. Número alocado é do grupo para sempre
```

### Estrutura do Módulo no Repo

```
whatsapp/
├── client.js                 # Wrapper Baileys (connect, events, send)
├── pool.js                   # Pool manager (allocate, deallocate, failover)
├── sessionStore.js           # Auth state persistido no Supabase
├── handlers/
│   ├── groupEvents.js        # Membro entrou/saiu do grupo
│   └── connectionEvents.js   # Ban detection, reconnection
├── services/
│   ├── groupService.js       # Criar grupo, invite link, kick
│   └── messageService.js     # Formatar e enviar (adaptar copy)
├── jobs/
│   ├── postBets.js           # Postar apostas (reusa lógica existente)
│   ├── kickExpired.js        # Kick inadimplentes (reusa lógica existente)
│   └── healthCheck.js        # Heartbeat dos números
└── server.js                 # Entry point do serviço
```

## Scoping — Implementação em Camadas

Não há fases de produto (MVP/Growth/Vision) — tudo que existe no Telegram deve existir no WhatsApp desde o dia 0. A organização é por **ordem de implementação**:

### Camada 1: Fundação
_Sem ela, nada funciona._
- Conexão Baileys + persistência de sessões no Supabase
- Pool de números (tabela `whatsapp_numbers`, alocação/desalocação)
- Conectar número via QR code
- Criar grupo WhatsApp programaticamente
- Enviar mensagem no grupo

### Camada 2: Operação Básica
_Grupo funciona e gera valor._
- Postagem de apostas no grupo (reutilizando copy, adaptando formato)
- Detecção de novo membro no grupo
- Trial automático (3 dias) + mensagem privada de boas-vindas
- Kick de inadimplentes/trial expirado
- Configurar grupo como "só admins enviam"

### Camada 3: Resiliência
_Sobrevive a bans sem intervenção humana._
- Failover automático (detectar ban → promover backup → alocar novo do pool)
- Health check dos números (heartbeat)
- Alerta no Telegram admin quando número é banido
- Alerta de pool baixo

### Camada 4: Integração Completa
_Paridade total com Telegram._
- Webhook MP → ativar membro no WhatsApp (invite link automático)
- Notificações 1:1 (trial reminder, renewal, farewell)
- Admin panel: botão "Adicionar WhatsApp" no grupo
- Admin panel: visualização do pool de números
- Admin panel: status dos números por grupo

## Functional Requirements

### Pool de Números WhatsApp

- FR1: Super admin pode adicionar novos números ao pool global da plataforma
- FR2: Super admin pode visualizar o status de todos os números do pool (disponível, alocado, banido, conectando)
- FR3: Sistema pode alocar automaticamente números do pool global para um grupo específico (3 por grupo: 1 ativo + 2 backup)
- FR4: Sistema pode desalocar números banidos de um grupo e marcá-los como indisponíveis
- FR5: Sistema pode alertar super admin quando o pool global está com estoque baixo

### Gestão de Grupos WhatsApp

- FR6: Super admin pode criar um grupo WhatsApp para um influencer via admin panel (1-click)
- FR7: Sistema pode criar grupo WhatsApp programaticamente com 3 números como admin
- FR8: Sistema pode configurar grupo como "só admins enviam" (membros apenas leem)
- FR9: Sistema pode gerar e revogar links de convite do grupo WhatsApp
- FR10: Influencer pode solicitar adição de canal WhatsApp ao seu grupo existente

### Gestão de Membros WhatsApp

- FR11: Sistema pode detectar novos membros entrando no grupo WhatsApp
- FR12: Sistema pode enviar mensagem privada (DM) a um membro via WhatsApp
- FR13: Sistema pode iniciar trial automático de 3 dias para novos membros do grupo WhatsApp
- FR14: Sistema pode enviar lembretes de trial e renovação via DM WhatsApp (dia 2, dia 3)
- FR15: Sistema pode remover (kick) membros inadimplentes ou com trial expirado do grupo WhatsApp
- FR16: Sistema pode reativar membro pós-pagamento enviando novo invite link por DM
- FR17: Membro pode pertencer a um grupo em mais de um canal simultaneamente (Telegram e/ou WhatsApp)
- FR18: Sistema pode revogar invite link anterior ao remover membro inadimplente

### Postagem Multi-Canal

- FR19: Sistema pode postar apostas no grupo WhatsApp com mesmo conteúdo do Telegram
- FR20: Sistema pode adaptar formatação de mensagens do formato Telegram para o formato WhatsApp
- FR21: Sistema pode postar em ambos os canais (Telegram + WhatsApp) simultaneamente para grupos com dois canais
- FR22: Sistema pode respeitar o posting_schedule configurado por grupo para postagens WhatsApp

### Resiliência e Failover

- FR23: Sistema pode detectar ban de número automaticamente (desconexão 401)
- FR24: Sistema pode promover automaticamente número backup a ativo quando o ativo é banido
- FR25: Sistema pode alocar novo número do pool global como backup após promoção de reserva
- FR26: Sistema pode executar failover completo sem intervenção humana
- FR27: Sistema pode enviar alerta no grupo Telegram admin quando um número é banido (com detalhes do número substituído e status do pool)
- FR28: Sistema pode monitorar saúde dos números via heartbeat periódico
- FR29: Sistema pode alertar quando um número perde conexão sem ser ban (queda de rede, restart)

### Integração de Pagamentos

- FR30: Webhook Mercado Pago pode ativar membro no canal WhatsApp (além do Telegram existente)
- FR31: Sistema pode enviar link de convite WhatsApp automaticamente após confirmação de pagamento
- FR32: Sistema pode processar cancelamento/inadimplência com kick no canal WhatsApp
- FR33: Checkout pode oferecer escolha de canal preferido (Telegram / WhatsApp / ambos)

### Admin Panel

- FR34: Super admin pode adicionar canal WhatsApp a um grupo existente via painel (botão 1-click)
- FR35: Super admin pode visualizar status dos números alocados por grupo (ativo, backup, health)
- FR36: Super admin pode visualizar e gerenciar o pool global de números
- FR37: Gestão de membros no painel pode filtrar por canal (Telegram/WhatsApp)
- FR38: Dashboard e métricas funcionam de forma agnóstica de canal
- FR39: Onboarding de novo grupo pode incluir WhatsApp como opção de canal

### Conexão e Sessões

- FR40: Super admin pode conectar número ao WhatsApp via escaneamento de QR code
- FR41: Sistema pode persistir sessões (auth state / Signal keys) no banco de dados
- FR42: Sistema pode reconectar automaticamente todas as sessões após restart do serviço
- FR43: Sistema pode gerenciar múltiplas conexões WebSocket simultâneas (1 por número alocado)
- FR44: Sistema pode respeitar rate limits implícitos do WhatsApp para evitar detecção anti-spam

## Non-Functional Requirements

### Performance

- NFR1: Failover completo (ban detectado → número substituído → grupo operacional) deve completar em menos de 5 minutos
- NFR2: Postagem de aposta no grupo WhatsApp deve ocorrer em menos de 30 segundos após trigger do job
- NFR3: Envio de mensagens deve respeitar rate limit de no máximo 10 mensagens por minuto por número para evitar detecção anti-spam
- NFR4: Reconexão de sessão Baileys após restart do serviço deve completar em menos de 60 segundos por número
- NFR5: Heartbeat de saúde dos números deve executar a cada 60 segundos

### Reliability

- NFR6: Serviço WhatsApp deve rodar 24/7 sem spin-down (conexões WebSocket persistentes)
- NFR7: Uptime do grupo WhatsApp deve ser ≥ 99.9% (máximo ~8.7h de downtime/ano), garantido pelo pool de 3+ números
- NFR8: Sessões Baileys devem sobreviver a restarts do serviço sem necessidade de re-escanear QR code
- NFR9: Toda atualização de auth state (Signal keys) deve ser persistida no Supabase antes de confirmar ao Baileys
- NFR10: Perda de conexão não-ban (rede, restart) deve reconectar automaticamente com backoff exponencial (max 5 tentativas)
- NFR11: Serviço WhatsApp deve ser isolado do serviço Telegram — falha em um não afeta o outro

### Security

- NFR12: Chaves criptográficas Signal (auth state Baileys) devem ser armazenadas criptografadas no Supabase
- NFR13: Números de telefone de membros devem ser protegidos por RLS multi-tenant (group admin só vê seus membros)
- NFR14: Pool global de números deve ser acessível apenas por super admin
- NFR15: Tokens de sessão e credenciais WhatsApp não devem ser logados em nenhum nível de logging
- NFR16: Isolamento multi-tenant existente (RLS) deve ser estendido para todas as tabelas novas (whatsapp_numbers, whatsapp_sessions)

### Scalability

- NFR17: Sistema deve suportar pelo menos 50 números conectados simultaneamente em um único processo Node.js
- NFR18: Arquitetura deve permitir escalar horizontalmente (múltiplas instâncias do serviço, cada uma gerenciando um subset de números)
- NFR19: Adição de novos grupos WhatsApp não deve degradar performance de grupos existentes
- NFR20: Pool global deve suportar no mínimo 100 números cadastrados

### Integration

- NFR21: Sistema deve funcionar com Baileys v6+ (manter compatibilidade com releases ativos)
- NFR22: Abstração de canal deve permitir substituir Baileys por outra lib/API sem alterar lógica de negócio
- NFR23: Integração com Mercado Pago deve funcionar identicamente para membros WhatsApp e Telegram (mesmo webhook, mesma lógica)
- NFR24: Alertas de ban/failover devem ser entregues via canal Telegram admin existente (não criar novo canal de alertas)
- NFR25: Formatação de mensagens deve suportar os padrões WhatsApp (*bold*, _italic_, ~strikethrough~, ```monospace```)
