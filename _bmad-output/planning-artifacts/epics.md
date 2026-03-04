---
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
completedAt: '2026-02-28'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
workflowType: 'epics-and-stories'
projectType: 'brownfield'
project_name: 'bets-estatistica'
scope: 'WhatsApp Integration'
---

# bets-estatistica - Epic Breakdown (WhatsApp Integration)

## Overview

Este documento contém o breakdown completo de épicos e stories para a integração WhatsApp do GuruBet, transformando os requisitos do PRD e decisões da Arquitetura em stories implementáveis.

## Requirements Inventory

### Functional Requirements (43 FRs)

**Pool de Números WhatsApp**
- FR1: Super admin pode adicionar novos números ao pool global da plataforma
- FR2: Super admin pode visualizar o status de todos os números do pool (disponível, alocado, banido, conectando)
- FR3: Sistema pode alocar automaticamente números do pool global para um grupo específico (3 por grupo: 1 ativo + 2 backup)
- FR4: Sistema pode desalocar números banidos de um grupo e marcá-los como indisponíveis
- FR5: Sistema pode alertar super admin quando o pool global está com estoque baixo

**Gestão de Grupos WhatsApp**
- FR6: Super admin pode criar um grupo WhatsApp para um influencer via admin panel (1-click)
- FR7: Sistema pode criar grupo WhatsApp programaticamente com 3 números como admin
- FR8: Sistema pode configurar grupo como "só admins enviam" (membros apenas leem)
- FR9: Sistema pode gerar e revogar links de convite do grupo WhatsApp
- FR10: Influencer pode solicitar adição de canal WhatsApp ao seu grupo existente

**Gestão de Membros WhatsApp**
- FR11: Sistema pode detectar novos membros entrando no grupo WhatsApp
- FR12: Sistema pode enviar mensagem privada (DM) a um membro via WhatsApp
- FR13: Sistema pode iniciar trial automático de 3 dias para novos membros do grupo WhatsApp
- FR14: Sistema pode enviar lembretes de trial e renovação via DM WhatsApp (dia 2, dia 3)
- FR15: Sistema pode remover (kick) membros inadimplentes ou com trial expirado do grupo WhatsApp
- FR16: Sistema pode reativar membro pós-pagamento enviando novo invite link por DM
- FR17: Membro pode pertencer a um grupo em mais de um canal simultaneamente (Telegram e/ou WhatsApp)
- FR18: Sistema pode revogar invite link anterior ao remover membro inadimplente

**Postagem Multi-Canal**
- FR19: Sistema pode postar apostas no grupo WhatsApp com mesmo conteúdo do Telegram
- FR20: Sistema pode adaptar formatação de mensagens do formato Telegram para o formato WhatsApp
- FR21: Sistema pode postar em ambos os canais (Telegram + WhatsApp) simultaneamente para grupos com dois canais
- FR22: Sistema pode respeitar o posting_schedule configurado por grupo para postagens WhatsApp

**Resiliência e Failover**
- FR23: Sistema pode detectar ban de número automaticamente (desconexão 401)
- FR24: Sistema pode promover automaticamente número backup a ativo quando o ativo é banido
- FR25: Sistema pode alocar novo número do pool global como backup após promoção de reserva
- FR26: Sistema pode executar failover completo sem intervenção humana
- FR27: Sistema pode enviar alerta no grupo Telegram admin quando um número é banido
- FR28: Sistema pode monitorar saúde dos números via heartbeat periódico
- FR29: Sistema pode alertar quando um número perde conexão sem ser ban (queda de rede, restart)

**Integração de Pagamentos**
- FR30: Webhook Mercado Pago pode ativar membro no canal WhatsApp (além do Telegram existente)
- FR31: Sistema pode enviar link de convite WhatsApp automaticamente após confirmação de pagamento
- FR32: Sistema pode processar cancelamento/inadimplência com kick no canal WhatsApp

**Admin Panel**
- FR34: Super admin pode adicionar canal WhatsApp a um grupo existente via painel (botão 1-click)
- FR35: Super admin pode visualizar status dos números alocados por grupo (ativo, backup, health)
- FR36: Super admin pode visualizar e gerenciar o pool global de números
- FR37: Gestão de membros no painel pode filtrar por canal (Telegram/WhatsApp)
- FR38: Dashboard e métricas funcionam de forma agnóstica de canal
- FR39: Onboarding de novo grupo pode incluir WhatsApp como opção de canal

**Conexão e Sessões**
- FR40: Super admin pode conectar número ao WhatsApp via escaneamento de QR code
- FR41: Sistema pode persistir sessões (auth state / Signal keys) no banco de dados
- FR42: Sistema pode reconectar automaticamente todas as sessões após restart do serviço
- FR43: Sistema pode gerenciar múltiplas conexões WebSocket simultâneas (1 por número alocado)
- FR44: Sistema pode respeitar rate limits implícitos do WhatsApp para evitar detecção anti-spam

### NonFunctional Requirements

**Performance**
- NFR1: Failover completo deve completar em menos de 5 minutos
- NFR2: Postagem no grupo WhatsApp em menos de 30 segundos após trigger
- NFR3: Rate limit de no máximo 10 mensagens por minuto por número
- NFR4: Reconexão após restart em menos de 60 segundos por número
- NFR5: Heartbeat a cada 60 segundos

**Reliability**
- NFR6: Serviço WhatsApp 24/7 sem spin-down
- NFR7: Uptime do grupo ≥ 99.9%
- NFR8: Sessões sobrevivem restarts sem re-escanear QR
- NFR9: Auth state persistido antes de confirmar ao Baileys
- NFR10: Reconexão automática com backoff exponencial (max 5 tentativas)
- NFR11: Serviço WhatsApp isolado do Telegram

**Security**
- NFR12: Signal keys criptografadas (AES-256-GCM) no Supabase
- NFR13: Telefones de membros protegidos por RLS
- NFR14: Pool global acessível apenas por super admin
- NFR15: Credenciais WhatsApp nunca logadas
- NFR16: RLS estendido para todas tabelas novas

**Scalability**
- NFR17: 50+ números conectados simultaneamente
- NFR18: Escala horizontal possível
- NFR19: Novos grupos não degradam performance existente
- NFR20: Pool global suporta 100+ números

**Integration**
- NFR21: Compatível com Baileys v6+
- NFR22: Abstração de canal substituível
- NFR23: Mercado Pago idêntico para ambos canais
- NFR24: Alertas via Telegram admin existente
- NFR25: Formatação WhatsApp suportada

### Additional Requirements

**From Architecture:**

- Brownfield — estender monorepo existente, sem starter template
- Auth state persistence com modelo híbrido: creds (JSONB) + keys separadas (tabela whatsapp_keys com upsert granular)
- Criptografia AES-256-GCM para Signal keys (consistente com mtproto_sessions)
- Channel adapter com interface uniforme (sendMessage, sendPhoto, getGroupMembers)
- Failover state machine com 5 estados: available, active, backup, banned, cooldown
- Health monitoring reutilizando bot_health + job_executions existentes
- Graceful shutdown: handler SIGTERM que salva auth state e fecha WebSockets
- QR code flow: admin insere número → serviço detecta → grava QR em whatsapp_sessions → admin panel polls
- 6 migrations SQL novas (029-034)
- Novos arquivos em lib/ (channelAdapter.js, phoneUtils.js)
- Novos componentes admin panel (NumberPoolTable, NumberStatusBadge, QrCodeModal, FailoverTimeline)

**Implementation Patterns (Architecture):**

- Nunca instanciar Baileys diretamente — usar BaileyClient wrapper
- Nunca salvar auth state em filesystem — usar authStateStore (Supabase)
- Nunca fazer transição de status direto no banco — usar failoverService
- Nunca enviar mensagens diretamente — usar channelAdapter
- Phone numbers: armazenar E.164, converter para JID on-the-fly

### FR Coverage Map

FR1: Epic 1 — Adicionar números ao pool global
FR2: Epic 1 — Visualizar status dos números no pool
FR3: Epic 1 — Alocar números do pool para grupo (1 ativo + 2 backup)
FR4: Epic 1 — Desalocar números banidos
FR5: Epic 1 — Alerta de estoque baixo no pool
FR6: Epic 2 — Criar grupo WhatsApp via admin panel (1-click)
FR7: Epic 2 — Criar grupo programaticamente com 3 números admin
FR8: Epic 2 — Configurar grupo como "só admins enviam"
FR9: Epic 2 — Gerar e revogar invite links do grupo
FR10: Epic 2 — Influencer solicita adição de canal WhatsApp
FR11: Epic 4 — Detectar novos membros no grupo WhatsApp
FR12: Epic 4 — Enviar DM via WhatsApp
FR13: Epic 4 — Trial automático de 3 dias para novos membros
FR14: Epic 4 — Lembretes de trial/renovação via DM
FR15: Epic 4 — Kick de membros inadimplentes/trial expirado
FR16: Epic 4 — Reativar membro pós-pagamento via invite DM
FR17: Epic 4 — Membro em múltiplos canais simultaneamente
FR18: Epic 4 — Revogar invite link ao remover membro
FR19: Epic 3 — Postar apostas no WhatsApp (mesmo conteúdo Telegram)
FR20: Epic 1 — Channel adapter com formatação Telegram → WhatsApp
FR21: Epic 3 — Postagem simultânea em ambos os canais
FR22: Epic 3 — Respeitar posting_schedule por grupo
FR23: Epic 5 — Detectar ban automaticamente (401)
FR24: Epic 5 — Promover backup a ativo no ban
FR25: Epic 5 — Alocar novo backup do pool após promoção
FR26: Epic 5 — Failover completo sem intervenção humana
FR27: Epic 5 — Alerta no Telegram admin quando número banido
FR28: Epic 5 — Heartbeat periódico de saúde dos números
FR29: Epic 5 — Alerta de perda de conexão (não-ban)
FR30: Epic 6 — Webhook MP ativa membro no canal WhatsApp
FR31: Epic 6 — Enviar invite WhatsApp após pagamento confirmado
FR32: Epic 6 — Kick no WhatsApp por cancelamento/inadimplência
FR34: Epic 2 — Botão 1-click para adicionar canal WhatsApp a grupo existente
FR35: Epic 5 — Visualizar status dos números por grupo no admin
FR36: Epic 1 — Gerenciar pool global no admin panel
FR37: Epic 4 — Filtrar membros por canal no admin
FR38: Epic 3 — Dashboard e métricas agnósticos de canal
FR39: Epic 2 — Onboarding de grupo inclui WhatsApp como opção
FR40: Epic 1 — Conectar número via QR code
FR41: Epic 1 — Persistir sessões (auth state + Signal keys) no banco
FR42: Epic 1 — Reconexão automática após restart
FR43: Epic 1 — Gerenciar múltiplas conexões WebSocket
FR44: Epic 1 — Rate limiting anti-spam

**Cobertura: 43/43 FRs mapeados (FR33 removido — canal determinado pela configuração do grupo, sem escolha no checkout)**

## Epic List

### Epic 1: Infraestrutura WhatsApp & Pool de Números
Super admin pode conectar números WhatsApp, gerenciar o pool global da plataforma, e o sistema mantém sessões persistentes e reconectáveis. Este épico estabelece toda a fundação técnica (Baileys, auth state, migrations, criptografia) necessária para os demais épicos.

**FRs cobertos:** FR1, FR2, FR3, FR4, FR5, FR20, FR36, FR40, FR41, FR42, FR43, FR44
**NFRs endereçados:** NFR3, NFR4, NFR6, NFR8, NFR9, NFR10, NFR11, NFR12, NFR14, NFR15, NFR16, NFR17, NFR20, NFR21, NFR22, NFR25
**Dependências:** Nenhuma (épico fundacional)

### Epic 2: Criação e Configuração de Grupos WhatsApp
Super admin pode criar grupos WhatsApp para influencers com 1-click, configurar permissões e gerar invite links. Influencers podem solicitar adição de canal WhatsApp ao grupo existente.

**FRs cobertos:** FR6, FR7, FR8, FR9, FR10, FR34, FR39
**NFRs endereçados:** NFR7, NFR22
**Dependências:** Epic 1 (precisa de números conectados e pool alocável)

### Epic 3: Postagem Multi-Canal
Sistema pode postar apostas simultaneamente no Telegram e WhatsApp, adaptando a formatação para cada canal. Dashboard e métricas funcionam de forma agnóstica de canal.

**FRs cobertos:** FR19, FR21, FR22, FR38
**NFRs endereçados:** NFR2
**Dependências:** Epic 1 + Epic 2 (precisa de números conectados e grupo criado)

### Epic 4: Ciclo de Vida de Membros no WhatsApp
Sistema gerencia membros no canal WhatsApp: detecta entrada, inicia trial, envia lembretes, remove inadimplentes e reativa após pagamento. Membros podem pertencer a ambos os canais simultaneamente.

**FRs cobertos:** FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR37
**NFRs endereçados:** NFR13, NFR16, NFR22, NFR23
**Dependências:** Epic 1 + Epic 2 (precisa de números conectados e grupo criado)

### Epic 5: Failover Automático & Health Monitoring
Sistema detecta bans e falhas automaticamente, promove backups, aloca novos números do pool e executa failover completo sem intervenção humana. Admin visualiza health e timeline no painel.

**FRs cobertos:** FR23, FR24, FR25, FR26, FR27, FR28, FR29, FR35
**NFRs endereçados:** NFR1, NFR5, NFR7, NFR10, NFR24
**Dependências:** Epic 1 (precisa de números conectados com status machine)

### Epic 6: Integração de Pagamentos (Canal WhatsApp)
Webhook Mercado Pago ativa e desativa membros no canal WhatsApp automaticamente, enviando invite links após pagamento e removendo inadimplentes. Membro recebe acesso a todos os canais que o grupo oferece.

**FRs cobertos:** FR30, FR31, FR32
**NFRs endereçados:** NFR23
**Dependências:** Epic 2 + Epic 4 (precisa de grupos criados e gestão de membros funcional)

---

## Epic 1: Infraestrutura WhatsApp & Pool de Números

Super admin pode conectar números WhatsApp, gerenciar o pool global da plataforma, e o sistema mantém sessões persistentes e reconectáveis. Este épico estabelece toda a fundação técnica (Baileys, auth state, migrations, criptografia) necessária para os demais épicos.

### Story 1.1: Adicionar e Conectar Número WhatsApp via QR Code

As a super admin,
I want adicionar um número telefônico e conectá-lo ao WhatsApp escaneando QR code,
So that a plataforma tenha um número WhatsApp conectado e pronto para uso.

**Escopo técnico:** Cria migrations (whatsapp_numbers, whatsapp_sessions, whatsapp_keys + RLS), BaileyClient wrapper, authStateStore (Supabase), phoneUtils.js, criptografia AES-256-GCM para Signal keys.

**FRs:** FR1, FR40, FR41, FR44

**Acceptance Criteria:**

**Given** super admin insere um número E.164 válido no sistema
**When** o serviço WhatsApp inicia conexão Baileys para esse número
**Then** um QR code é gerado e gravado em `whatsapp_sessions.qr_code`
**And** admin panel pode exibir o QR code para escaneamento

**Given** super admin escaneia o QR code com o celular
**When** Baileys confirma autenticação (connection.update → open)
**Then** auth state (creds) é persistido como JSONB em `whatsapp_sessions`
**And** Signal keys são criptografadas (AES-256-GCM) e salvas em `whatsapp_keys`
**And** status do número muda para `available` em `whatsapp_numbers`

**Given** número conectado e ativo
**When** sistema envia mensagens
**Then** rate limit de 10 msg/min por número é respeitado (NFR3)

### Story 1.2: Reconexão Automática de Sessões

As a super admin,
I want que o sistema reconecte automaticamente todas as sessões WhatsApp após restart do serviço,
So that os números permaneçam conectados 24/7 sem re-escanear QR code.

**FRs:** FR42, FR43

**Acceptance Criteria:**

**Given** serviço WhatsApp reinicia (deploy ou crash)
**When** o processo inicia
**Then** todas as sessões com auth state válido em `whatsapp_sessions` são reconectadas automaticamente
**And** reconexão completa em menos de 60 segundos por número (NFR4)

**Given** múltiplos números conectados (ex: 10+)
**When** serviço está rodando
**Then** cada número mantém sua própria conexão WebSocket independente (FR43)
**And** reconexão usa backoff exponencial (max 5 tentativas) (NFR10)

**Given** serviço recebe SIGTERM
**When** shutdown é iniciado
**Then** auth state de todas as sessões é salvo antes de fechar WebSockets (graceful shutdown)

### Story 1.3: Pool Global — Alocação e Gestão de Números

As a super admin,
I want visualizar o status de todos os números e ter alocação automática de números para grupos,
So that cada grupo tenha sempre 1 número ativo + 2 backups sem gestão manual.

**FRs:** FR2, FR3, FR4, FR5

**Acceptance Criteria:**

**Given** super admin acessa a listagem de números
**When** visualiza o pool global
**Then** cada número mostra seu status atual (available, active, backup, banned, cooldown)
**And** mostra a qual grupo está alocado (se aplicável)

**Given** um grupo precisa de números WhatsApp
**When** sistema executa alocação automática
**Then** 3 números `available` são alocados: 1 como `active`, 2 como `backup`
**And** se não há números suficientes, aloca o máximo possível e alerta super admin

**Given** um número é banido
**When** sistema detecta o ban
**Then** número é desalocado do grupo e marcado como `banned` em `whatsapp_numbers`

**Given** pool global tem menos que um threshold de números `available`
**When** sistema verifica estoque periodicamente
**Then** alerta é enviado ao super admin (via Telegram admin group)

### Story 1.4: Admin Panel — Gerenciamento do Pool de Números

As a super admin,
I want gerenciar o pool global de números via admin panel,
So that eu possa adicionar, visualizar e gerenciar números sem acesso direto ao banco.

**FRs:** FR36

**Acceptance Criteria:**

**Given** super admin acessa a página de pool de números no admin panel
**When** a página carrega
**Then** tabela exibe todos os números com status, grupo alocado e último heartbeat
**And** badge visual indica o status de cada número (NumberStatusBadge)

**Given** super admin quer adicionar um novo número
**When** clica em "Adicionar Número" e insere o telefone
**Then** número é adicionado ao pool com status `available`
**And** fluxo de QR code é iniciado (QrCodeModal)

**Given** super admin quer ver detalhes de um número
**When** clica no número na tabela
**Then** visualiza histórico de status, grupo atual e métricas de saúde

### Story 1.5: Channel Adapter — Abstração Multi-Canal

As a sistema,
I want uma abstração uniforme para enviar mensagens em qualquer canal (Telegram ou WhatsApp),
So that toda a lógica de negócio seja agnóstica de canal e novos canais possam ser adicionados sem alterar services existentes.

**Escopo técnico:** Cria `lib/channelAdapter.js` com interface uniforme. Implementa formatação Telegram→WhatsApp (bold, italic, monospace, links).

**FRs:** FR20

**Acceptance Criteria:**

**Given** `channelAdapter.js` é criado em `lib/`
**When** qualquer serviço precisa enviar mensagem para um grupo
**Then** usa `channelAdapter.sendMessage(groupId, content, channel)` com interface uniforme
**And** nunca envia diretamente via Baileys ou Telegram Bot API

**Given** uma mensagem formatada para Telegram (HTML/Markdown Telegram)
**When** channel adapter processa para o canal WhatsApp
**Then** formatação é convertida para WhatsApp (bold com `*`, italic com `_`, monospace com `` ` ``)
**And** emojis e estrutura visual são preservados
**And** links são mantidos como texto clicável

**Given** serviço precisa enviar DM a um membro
**When** `channelAdapter.sendDM(userId, message, channel)` é chamado
**Then** mensagem é enviada via Baileys (WhatsApp) ou Bot API (Telegram) conforme o canal
**And** rate limit de 10 msg/min por número é respeitado

**Given** mensagem contém imagem (ex: banner de aposta)
**When** channel adapter envia para WhatsApp
**Then** usa `channelAdapter.sendPhoto(groupId, image, caption, channel)` com caption formatada

---

## Epic 2: Criação e Configuração de Grupos WhatsApp

Super admin pode criar grupos WhatsApp para influencers com 1-click, configurar permissões e gerar invite links. Influencers podem solicitar adição de canal WhatsApp ao grupo existente.

### Story 2.1: Criar Grupo WhatsApp Programaticamente

As a super admin,
I want criar um grupo WhatsApp para um influencer com 1-click no admin panel,
So that o influencer tenha um grupo WhatsApp pronto com os números da plataforma como admins.

**FRs:** FR6, FR7, FR8

**Acceptance Criteria:**

**Given** super admin acessa a página de um grupo/influencer no admin panel
**When** clica em "Criar Grupo WhatsApp"
**Then** sistema cria grupo WhatsApp via Baileys usando o número `active` alocado ao grupo
**And** os 3 números alocados (1 ativo + 2 backup) são adicionados como admins do grupo
**And** grupo é configurado como "só admins enviam" (announce mode)

**Given** grupo WhatsApp foi criado com sucesso
**When** criação é confirmada pelo Baileys
**Then** `whatsapp_group_id` é salvo na tabela do grupo no banco
**And** status é exibido no admin panel como "WhatsApp ativo"

**Given** grupo não tem números suficientes alocados
**When** super admin tenta criar grupo WhatsApp
**Then** sistema exibe erro explicativo e sugere alocar números primeiro

### Story 2.2: Gestão de Invite Links do Grupo WhatsApp

As a super admin,
I want gerar e revogar links de convite do grupo WhatsApp,
So that eu possa controlar o acesso ao grupo e invalidar links antigos quando necessário.

**FRs:** FR9

**Acceptance Criteria:**

**Given** grupo WhatsApp existe e está ativo
**When** super admin solicita geração de invite link (via admin panel ou programaticamente)
**Then** sistema gera novo invite link via Baileys
**And** link é armazenado no banco vinculado ao grupo

**Given** existe um invite link ativo para o grupo
**When** super admin solicita revogação do link
**Then** link anterior é invalidado via Baileys
**And** novo link pode ser gerado imediatamente

**Given** sistema precisa revogar link (ex: após kick de membro)
**When** revogação é executada programaticamente
**Then** link antigo para de funcionar
**And** novo link é gerado automaticamente para uso futuro

### Story 2.3: Adicionar Canal WhatsApp a Grupo Existente

As a super admin ou influencer,
I want adicionar WhatsApp como canal a um grupo que já existe no Telegram,
So that o grupo passe a operar em ambos os canais sem recriar nada.

**FRs:** FR10, FR34, FR39

**Acceptance Criteria:**

**Given** grupo existe com canal Telegram ativo
**When** super admin clica em "Adicionar WhatsApp" no admin panel (botão 1-click)
**Then** sistema aloca 3 números do pool para o grupo
**And** cria grupo WhatsApp programaticamente (reusa lógica da Story 2.1)
**And** grupo passa a ter `channels: ['telegram', 'whatsapp']`

**Given** influencer quer adicionar WhatsApp ao seu grupo
**When** solicita via admin panel ou contato com super admin
**Then** super admin pode executar a adição com 1-click

**Given** onboarding de novo grupo está em andamento
**When** super admin configura o grupo
**Then** WhatsApp aparece como opção de canal disponível no formulário de criação

---

## Epic 3: Postagem Multi-Canal

Sistema pode postar apostas simultaneamente no Telegram e WhatsApp, adaptando a formatação para cada canal. Dashboard e métricas funcionam de forma agnóstica de canal.

### Story 3.1: Postagem Simultânea em Ambos os Canais

As a sistema (bot de apostas),
I want postar apostas no WhatsApp e Telegram simultaneamente quando o grupo tem ambos os canais,
So that membros de qualquer canal recebam as apostas ao mesmo tempo.

**Nota:** Usa channelAdapter criado na Story 1.5 (Epic 1).

**FRs:** FR19, FR21, FR22

**Acceptance Criteria:**

**Given** grupo tem canais `['telegram', 'whatsapp']` configurados
**When** job `distributeBets` ou `postBets` é executado
**Then** mensagem é enviada para ambos os canais em paralelo via channel adapter
**And** postagem no WhatsApp completa em menos de 30 segundos após trigger (NFR2)

**Given** grupo tem apenas canal `['telegram']`
**When** job de postagem é executado
**Then** comportamento atual é mantido sem alterações (retrocompatível)

**Given** grupo tem `posting_schedule` configurado
**When** horário de postagem é atingido
**Then** postagem WhatsApp respeita o mesmo schedule do Telegram (FR22)
**And** rate limit de 10 msg/min por número é respeitado

**Given** postagem falha em um canal mas sucede no outro
**When** erro é detectado
**Then** sucesso parcial é registrado em `job_executions`
**And** canal com falha é retentado conforme política de retry

### Story 3.2: Dashboard e Métricas Agnósticos de Canal

As a super admin,
I want que o dashboard e métricas funcionem de forma agnóstica de canal,
So that eu veja dados consolidados independente de onde os membros estão.

**FRs:** FR38

**Acceptance Criteria:**

**Given** super admin acessa o dashboard no admin panel
**When** visualiza métricas de membros, receita e engajamento
**Then** dados são consolidados entre Telegram e WhatsApp
**And** não há duplicação de contagem para membros em ambos os canais

**Given** super admin quer filtrar por canal
**When** seleciona filtro "Telegram" ou "WhatsApp" no dashboard
**Then** métricas são recalculadas apenas para o canal selecionado

**Given** grupo opera em ambos os canais
**When** métricas de postagem são exibidas
**Then** mostra taxa de entrega por canal separadamente

---

## Epic 4: Ciclo de Vida de Membros no WhatsApp

Sistema gerencia membros no canal WhatsApp: detecta entrada, inicia trial, envia lembretes, remove inadimplentes e reativa após pagamento. Membros podem pertencer a ambos os canais simultaneamente.

### Story 4.1: Detectar Novos Membros e Registro Multi-Canal

As a sistema,
I want detectar quando um novo membro entra no grupo WhatsApp e registrá-lo no banco,
So that o sistema conheça todos os membros e suporte pertencimento simultâneo a Telegram e WhatsApp.

**Escopo técnico:** Cria migration 032 (ALTER TABLE members ADD channel ENUM('telegram','whatsapp') DEFAULT 'telegram', ADD channel_user_id TEXT).

**FRs:** FR11, FR17

**Acceptance Criteria:**

**Given** um usuário entra no grupo WhatsApp via invite link
**When** Baileys emite evento `group-participants-update` com action `add`
**Then** sistema registra o membro em `members` com `channel = 'whatsapp'` e `channel_user_id = phone (E.164)`
**And** status inicial é `trial`

**Given** membro já existe no mesmo grupo via Telegram
**When** entra também no grupo WhatsApp
**Then** sistema cria um registro separado com `channel = 'whatsapp'` para o mesmo grupo
**And** ambos os registros coexistem (multi-canal simultâneo)
**And** membro não é contado em duplicata nas métricas consolidadas

**Given** membro sai voluntariamente do grupo WhatsApp
**When** Baileys emite evento `group-participants-update` com action `remove`
**Then** registro do membro é atualizado com status `left`

### Story 4.2: Enviar DM via WhatsApp

As a sistema,
I want enviar mensagens privadas (DM) a membros via WhatsApp,
So that eu possa comunicar trial, lembretes e invite links diretamente ao membro.

**Nota:** Usa `channelAdapter.sendDM()` criado na Story 1.5 (Epic 1).

**FRs:** FR12

**Acceptance Criteria:**

**Given** sistema precisa enviar DM a um membro WhatsApp
**When** `channelAdapter.sendDM(phoneE164, message, 'whatsapp')` é chamado
**Then** mensagem é enviada via Baileys para o JID do membro (phone@s.whatsapp.net)
**And** rate limit de 10 msg/min por número é respeitado

**Given** membro não tem WhatsApp ativo no número registrado
**When** envio de DM falha
**Then** erro é logado e membro é flagado para revisão
**And** sistema não retenta indefinidamente (max 3 tentativas com backoff)

**Given** DM é enviada com sucesso
**When** delivery é confirmado pelo Baileys
**Then** registro de envio é salvo para auditoria

### Story 4.3: Trial Automático e Lembretes

As a sistema,
I want iniciar trial de 3 dias para novos membros WhatsApp e enviar lembretes automáticos,
So that membros experimentem o serviço e sejam incentivados a pagar antes do trial expirar.

**FRs:** FR13, FR14

**Acceptance Criteria:**

**Given** novo membro é detectado no grupo WhatsApp (Story 4.1)
**When** registro é criado com status `trial`
**Then** trial de 3 dias é iniciado com `trial_expires_at = now() + 3 days`
**And** DM de boas-vindas é enviada explicando o trial e como assinar

**Given** membro está no dia 2 do trial
**When** job de lembretes executa
**Then** DM de lembrete é enviada via WhatsApp: "Seu trial expira amanhã, assine para continuar"

**Given** membro está no dia 3 (último dia) do trial
**When** job de lembretes executa
**Then** DM de urgência é enviada via WhatsApp com link de pagamento

**Given** membro já é assinante ativo via Telegram
**When** entra no grupo WhatsApp do mesmo grupo
**Then** trial NÃO é iniciado — membro recebe status `active` automaticamente

### Story 4.4: Kick de Inadimplentes e Revogação de Invite

As a sistema,
I want remover membros inadimplentes ou com trial expirado do grupo WhatsApp e revogar o invite link,
So that apenas membros pagantes tenham acesso ao grupo.

**FRs:** FR15, FR18

**Acceptance Criteria:**

**Given** trial de um membro expirou sem pagamento
**When** job de kick executa
**Then** membro é removido do grupo WhatsApp via Baileys (`groupParticipantsUpdate` → remove)
**And** status do membro muda para `kicked`

**Given** membro é removido por inadimplência
**When** kick é executado
**Then** invite link atual do grupo é revogado via Baileys
**And** novo invite link é gerado automaticamente
**And** link antigo para de funcionar imediatamente

**Given** membro tem assinatura ativa mas foi kickado por erro
**When** super admin identifica o problema
**Then** pode reativar manualmente via admin panel

### Story 4.5: Reativação Pós-Pagamento e Filtro por Canal

As a sistema / super admin,
I want reativar membros após pagamento enviando novo invite link e filtrar membros por canal no admin,
So that membros pagantes voltem ao grupo automaticamente e a gestão seja organizada por canal.

**FRs:** FR16, FR37

**Acceptance Criteria:**

**Given** membro foi kickado por inadimplência e depois efetuou pagamento
**When** pagamento é confirmado (webhook ou manual)
**Then** novo invite link é gerado e enviado via DM WhatsApp
**And** status do membro muda para `pending_rejoin`

**Given** membro reentrou no grupo via invite link
**When** sistema detecta reentrada (evento `add`)
**Then** status muda para `active`
**And** ciclo de cobrança é reiniciado

**Given** super admin acessa gestão de membros no admin panel
**When** visualiza a lista de membros de um grupo
**Then** pode filtrar por canal: "Todos", "Telegram", "WhatsApp"
**And** cada membro mostra em qual(is) canal(is) está ativo

---

## Epic 5: Failover Automático & Health Monitoring

Sistema detecta bans e falhas automaticamente, promove backups, aloca novos números do pool e executa failover completo sem intervenção humana. Admin visualiza health e timeline no painel.

### Story 5.1: Detecção de Ban e Failover Automático

As a sistema,
I want detectar bans automaticamente e promover número backup a ativo sem intervenção humana,
So that o grupo WhatsApp continue operando mesmo quando um número é banido.

**FRs:** FR23, FR24, FR25, FR26

**Acceptance Criteria:**

**Given** número `active` de um grupo perde conexão com código 401 (ban)
**When** Baileys emite evento `connection.update` com `lastDisconnect.error.statusCode === 401`
**Then** `failoverService` muda status do número para `banned`
**And** número é desalocado do grupo automaticamente

**Given** número ativo foi banido e grupo tem backup disponível
**When** failover é iniciado pelo failoverService
**Then** primeiro número `backup` é promovido a `active`
**And** número promovido assume como admin principal do grupo WhatsApp
**And** failover completa em menos de 5 minutos (NFR1)

**Given** backup foi promovido a ativo
**When** promoção é confirmada
**Then** sistema aloca novo número `available` do pool global como `backup`
**And** se pool não tem números disponíveis, alerta super admin

**Given** grupo tem 2 backups e ambos falham em sequência
**When** segundo failover é necessário
**Then** segundo backup é promovido seguindo a mesma lógica
**And** grupo opera com 0 backups até reposição do pool

### Story 5.2: Health Monitoring e Heartbeat

As a sistema,
I want monitorar a saúde de todos os números via heartbeat periódico e alertar sobre problemas,
So that eu detecte falhas de conexão antes que afetem a operação do grupo.

**Escopo técnico:** Cria migration 033 (ALTER TABLE bot_health ADD channel TEXT, ADD number_id UUID FK).

**FRs:** FR28, FR29

**Acceptance Criteria:**

**Given** números WhatsApp estão conectados
**When** a cada 60 segundos (NFR5)
**Then** sistema executa heartbeat para cada número verificando estado da conexão WebSocket
**And** resultado é registrado em `bot_health` (reutilizando tabela existente)

**Given** heartbeat detecta que um número perdeu conexão SEM ser ban (queda de rede, restart parcial)
**When** conexão está down mas sem código 401
**Then** sistema tenta reconexão automática com backoff exponencial (NFR10)
**And** alerta é enviado se reconexão falha após 5 tentativas

**Given** número não responde ao heartbeat por mais de 3 ciclos consecutivos (3 min)
**When** sistema avalia a situação
**Then** número é marcado como `unhealthy` temporariamente
**And** se não recuperar em 5 min, failover é iniciado como precaução

### Story 5.3: Alertas e Painel de Health por Grupo

As a super admin,
I want receber alertas quando números são banidos ou perdem conexão e visualizar o health no admin panel,
So that eu tenha visibilidade completa do estado da infraestrutura WhatsApp.

**FRs:** FR27, FR35

**Acceptance Criteria:**

**Given** um número é banido (failover iniciado)
**When** failoverService processa o ban
**Then** alerta é enviado no grupo Telegram admin com detalhes: número banido, grupo afetado, backup promovido
**And** alerta inclui status atual do pool (quantos disponíveis restam)

**Given** número perde conexão sem ser ban
**When** sistema detecta via heartbeat
**Then** alerta de warning é enviado no Telegram admin: "Número X perdeu conexão, tentando reconectar"

**Given** super admin acessa a página de um grupo no admin panel
**When** visualiza a seção de números WhatsApp
**Then** vê os 3 números alocados com status visual (active/backup/banned)
**And** vê último heartbeat e uptime de cada número
**And** timeline de eventos de failover (FailoverTimeline component)

---

## Epic 6: Integração de Pagamentos (Canal WhatsApp)

Webhook Mercado Pago ativa e desativa membros no canal WhatsApp automaticamente, enviando invite links após pagamento e removendo inadimplentes. Membro recebe acesso a todos os canais que o grupo oferece.

### Story 6.1: Ativação de Membro WhatsApp via Webhook de Pagamento

As a membro pagante,
I want receber acesso automático ao grupo WhatsApp após confirmar pagamento,
So that eu comece a receber apostas no WhatsApp sem ação manual.

**FRs:** FR30, FR31

**Acceptance Criteria:**

**Given** webhook Mercado Pago confirma pagamento de um membro
**When** sistema processa o webhook (`bets-webhook`)
**Then** membro é ativado em TODOS os canais que o grupo oferece (Telegram e/ou WhatsApp)
**And** lógica de ativação é idêntica para ambos os canais (NFR23)

**Given** grupo tem canal WhatsApp ativo e membro acabou de pagar
**When** ativação WhatsApp é processada
**Then** invite link do grupo WhatsApp é enviado via DM para o telefone do membro
**And** status do membro WhatsApp muda para `pending_rejoin` (aguardando entrada via link)

**Given** membro já está no grupo WhatsApp (ex: veio do trial)
**When** pagamento é confirmado
**Then** status muda diretamente para `active` sem necessidade de novo invite
**And** nenhuma ação adicional é necessária

**Given** grupo tem apenas canal Telegram (sem WhatsApp)
**When** pagamento é confirmado
**Then** comportamento atual é mantido sem alterações (retrocompatível)

### Story 6.2: Kick Automático por Cancelamento/Inadimplência via Webhook

As a sistema,
I want remover automaticamente membros inadimplentes do grupo WhatsApp quando o pagamento é cancelado,
So that apenas membros pagantes tenham acesso ao grupo em todos os canais.

**FRs:** FR32

**Acceptance Criteria:**

**Given** webhook Mercado Pago notifica cancelamento ou inadimplência de um membro
**When** sistema processa o webhook
**Then** membro é removido do grupo WhatsApp via Baileys (kick)
**And** membro é removido do grupo Telegram (comportamento existente mantido)
**And** processamento é idêntico para ambos os canais (NFR23)

**Given** membro é kickado do WhatsApp por inadimplência
**When** kick é executado
**Then** invite link atual é revogado (reusa lógica da Story 4.4)
**And** novo invite link é gerado para futuros membros

**Given** membro inadimplente está apenas no Telegram (sem WhatsApp)
**When** cancelamento é processado
**Then** apenas kick do Telegram é executado, sem erro no processamento WhatsApp

**Given** membro regulariza pagamento após kick
**When** novo webhook de pagamento é recebido
**Then** fluxo de reativação da Story 6.1 é executado automaticamente

---

## Epic 19: Campeonato por Cliente na Distribuição

Permitir que cada tenant/grupo configure quais campeonatos deseja receber na distribuição de apostas. Hoje todas as apostas são distribuídas igualmente para todos os grupos, sem filtro por campeonato.

**Dependências:** Nenhuma
**Prioridade:** Média — feature nova solicitada

**Decisões de Design (validadas 2026-03-03):**
- **Tabela relacional separada** `group_league_preferences` (não JSONB) — facilita queries `NOT EXISTS` na distribuição
- **group_admin pode configurar** as preferências do seu próprio grupo (RLS isola por group_id)
- **Ligas populadas de `league_seasons`** (não extraídas das apostas) — fonte de verdade mais confiável
- **Retrocompatível:** tabela vazia = recebe tudo (comportamento atual mantido)

### Story 19.1: Tabela de Preferências de Campeonato e API

As a admin (super_admin ou group_admin),
I want configurar quais campeonatos meu grupo recebe na distribuição,
So that cada grupo receba apenas apostas dos campeonatos relevantes para seu público.

**Escopo técnico:**
- Nova migration: tabela `group_league_preferences` (id SERIAL PK, group_id UUID FK→groups NOT NULL, league_name TEXT NOT NULL, enabled BOOLEAN DEFAULT true, created_at TIMESTAMPTZ, UNIQUE(group_id, league_name)) + RLS (super_admin: ALL, group_admin: ALL own group)
- API CRUD em `/api/groups/[id]/leagues` (GET lista preferências + ligas disponíveis, PUT atualiza toggles)
- UI: seção na página de edição/detalhe do grupo com lista de ligas e toggles on/off

**Acceptance Criteria:**

**Given** admin acessa as configurações de um grupo no admin panel
**When** visualiza a seção de campeonatos/ligas
**Then** vê lista de todos os campeonatos disponíveis (de `league_seasons` com `active = true`)
**And** cada campeonato tem um toggle on/off (default: on se não há registro)

**Given** admin desativa um campeonato para um grupo
**When** salva a configuração
**Then** registro é criado/atualizado em `group_league_preferences` com `enabled = false`
**And** próximas distribuições respeitam essa configuração

**Given** um grupo não tem nenhuma preferência configurada (tabela vazia para aquele group_id)
**When** distribuição é executada
**Then** grupo recebe TODAS as apostas — comportamento atual mantido (retrocompatível)

**Given** group_admin acessa as preferências de campeonato
**When** visualiza e modifica os toggles
**Then** vê e edita apenas as preferências do seu próprio grupo (RLS enforced)

### Story 19.2: Distribuição Respeita Filtro de Campeonato

As a sistema (job de distribuição),
I want filtrar as apostas por campeonato antes de distribuir para cada grupo,
So that cada grupo receba apenas apostas dos campeonatos que configurou.

**Escopo técnico:**
- `bot/jobs/distributeBets.js` — alterar `getUndistributedBets()` ou criar wrapper per-group
- Adicionar join com `league_seasons` para obter `league_name`
- Query de distribuição deve excluir apostas cujo `league_name` tem `enabled = false` para o grupo-alvo
- Lógica: se grupo não tem registros em `group_league_preferences`, recebe tudo (retrocompatível)

**Acceptance Criteria:**

**Given** grupo tem preferências de campeonato configuradas (alguns desativados)
**When** job `distribute-bets` executa
**Then** apostas de campeonatos desativados NÃO são distribuídas para aquele grupo
**And** apostas de campeonatos ativados são distribuídas normalmente

**Given** grupo recebe apostas de Brasileirão, Premier League e La Liga
**When** super admin desativa "La Liga" para esse grupo
**Then** próxima distribuição envia apenas Brasileirão e Premier League
**And** La Liga continua sendo distribuída normalmente para outros grupos que a têm ativada

**Given** aposta é de um campeonato novo (nunca visto antes)
**When** distribuição é executada
**Then** campeonato novo é tratado como "ativado" por padrão (se grupo não tem preferência explícita)

**Given** preferências de liga mudam para um grupo
**When** próximo ciclo de distribuição executa
**Then** apenas apostas NÃO-POSTADAS e NÃO-DISTRIBUÍDAS são afetadas (apostas já distribuídas permanecem)
