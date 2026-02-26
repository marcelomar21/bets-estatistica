# Story 3.2: Exibição e Aceite do Termo no Fluxo /start

Status: ready-for-dev

## Story

As a **membro potencial**,
I want ver e aceitar o termo de adesão antes de entrar no grupo,
So that eu esteja ciente das regras e o influencer tenha respaldo legal.

## Acceptance Criteria

1. **Given** `TRIAL_MODE = 'internal'` e um usuário envia `/start` ao bot
   **When** o bot processa o comando
   **Then** exibe mensagem com resumo do termo + link para documento completo + botão inline "Li e aceito" (FR2)
   **And** NÃO adiciona o membro ao grupo antes do aceite (FR6)

2. **Given** o membro clica no botão "Li e aceito"
   **When** o callback é processado
   **Then** registra aceite via `termsService` com telegram_id, group_id, terms_version e terms_url (FR3)
   **And** após registro, cria trial member e adiciona ao grupo Telegram (FR4)
   **And** segue o fluxo normal: boas-vindas + trial interno (conforme Story 2.2)
   **And** o fluxo completo (termo → aceite → grupo) leva menos de 5 segundos (NFR-P1)

3. **Given** o membro NÃO clica em "Li e aceito" (ignora ou fecha)
   **When** tenta interagir com o bot novamente via `/start`
   **Then** re-exibe o termo para aceite (FR6)
   **And** o membro continua fora do grupo até aceitar

4. **Given** o membro já aceitou o termo para este grupo
   **When** envia `/start` novamente
   **Then** NÃO exibe o termo novamente (já aceito)
   **And** segue o fluxo normal (status do trial ou boas-vindas)

5. **Given** a versão do termo foi atualizada (terms_version mudou)
   **When** um membro que aceitou a versão anterior envia `/start`
   **Then** exibe o novo termo para aceite
   **And** registra novo aceite com a nova versão (sem apagar o anterior — append-only)

## Tasks / Subtasks

- [ ] Task 1: Adicionar config keys TERMS_VERSION e TERMS_URL (AC: #1, #5)
  - [ ] 1.1 Inserir TERMS_VERSION='1.0' e TERMS_URL com URL padrão no system_config via migration ou getConfig default
  - [ ] 1.2 Usar `getConfig('TERMS_VERSION', '1.0')` e `getConfig('TERMS_URL', defaultUrl)` no código

- [ ] Task 2: Modificar fluxo /start para exibir termo antes do trial (AC: #1, #3, #4, #5)
  - [ ] 2.1 Importar `acceptTerms`, `hasAcceptedVersion` de termsService no startCommand.js
  - [ ] 2.2 Na branch `trialMode === 'internal'` (linha 167), antes de `handleInternalTrialStart`:
    - Ler TERMS_VERSION e TERMS_URL via getConfig
    - Chamar `hasAcceptedVersion(telegramId, groupId, termsVersion)`
    - Se já aceitou: prosseguir com handleInternalTrialStart (AC#4)
    - Se NÃO aceitou: chamar nova função `showTermsForAcceptance()`
  - [ ] 2.3 Criar função `showTermsForAcceptance(bot, chatId, termsVersion, termsUrl)`
    - Enviar mensagem com resumo do termo + link para doc completo
    - Botão inline: "Li e aceito os termos" com callback_data `terms_accept`
    - Retornar `{ success: true, action: 'terms_shown' }`
  - [ ] 2.4 Quando membro envia `/start` novamente sem ter aceito, re-exibir termos (AC#3)

- [ ] Task 3: Adicionar callback handler para aceite do termo (AC: #2)
  - [ ] 3.1 No server.js, adicionar routing para callbacks em chat privado (não apenas admin group)
  - [ ] 3.2 Detectar callback_data que começa com `terms_accept` e rotear para handler
  - [ ] 3.3 Criar handler `handleTermsAcceptCallback(bot, callbackQuery, botCtx)` em startCommand.js
    - Extrair telegramId, chatId, username do callbackQuery
    - Ler TERMS_VERSION e TERMS_URL via getConfig
    - Chamar `acceptTerms(telegramId, groupId, termsVersion, termsUrl)`
    - Responder callback com `answerCallbackQuery`
    - Editar mensagem original para confirmar aceite
    - Prosseguir com `handleInternalTrialStart()` para criar trial e enviar invite
  - [ ] 3.4 Exportar `handleTermsAcceptCallback` de startCommand.js

- [ ] Task 4: Escrever testes unitários (AC: #1-#5)
  - [ ] 4.1 Testar: novo usuário + internal → mostra termos (não cria trial imediatamente)
  - [ ] 4.2 Testar: callback aceite → registra + cria trial + envia invite
  - [ ] 4.3 Testar: membro já aceitou versão atual → pula termos
  - [ ] 4.4 Testar: versão do termo mudou → re-exibe termos
  - [ ] 4.5 Testar: TRIAL_MODE=mercadopago → não exibe termos (fluxo MP inalterado)
  - [ ] 4.6 Testar: callback handler roteado corretamente em server.js

- [ ] Task 5: Validação completa
  - [ ] 5.1 `npm test` no bot — todos os testes passam
  - [ ] 5.2 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 5.3 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Fluxo Atual (Story 2-2)

```
/start → TRIAL_MODE check → 'internal' → handleInternalTrialStart()
                                            → createTrialMember()
                                            → generateAndSendInvite()
```

### Fluxo Novo (Story 3-2)

```
/start → TRIAL_MODE check → 'internal'
  → hasAcceptedVersion(telegramId, groupId, TERMS_VERSION)
  → SE JÁ ACEITOU: handleInternalTrialStart() (igual antes)
  → SE NÃO ACEITOU: showTermsForAcceptance()
      → Envia mensagem com botão "Li e aceito"
      → Usuário clica → callback_query
      → handleTermsAcceptCallback()
          → acceptTerms()
          → handleInternalTrialStart()
          → generateAndSendInvite()
```

### server.js — Callback Routing

Atualmente callbacks só são roteados para admin group (line 162). Precisamos adicionar routing para private chat:

```javascript
if (update.callback_query) {
  const callbackQuery = update.callback_query;
  const data = callbackQuery.data || '';
  const chatType = callbackQuery.message?.chat?.type;

  // Private chat callbacks (terms acceptance)
  if (chatType === 'private' && data.startsWith('terms_accept')) {
    await handleTermsAcceptCallback(bot, callbackQuery, botCtx);
    return;
  }

  // Admin group callbacks (existing)
  if (callbackQuery.message?.chat?.id?.toString() === adminGroupId) {
    // ... existing logic
  }
}
```

### Config Keys

| Key | Default | Propósito |
|-----|---------|-----------|
| `TERMS_VERSION` | `'1.0'` | Versão atual do termo de adesão |
| `TERMS_URL` | URL do Google Docs | Link para o documento completo |

Não precisa de migration — `getConfig` com defaults é suficiente.

### Mensagem do Termo

```
📋 *Termo de Adesão*

Antes de entrar no grupo, é necessário aceitar nosso termo de adesão.

📄 [Leia o termo completo](${termsUrl})

Ao clicar em "Li e aceito", você confirma que leu e concorda com os termos.
```

### Funções a Reutilizar

| Função | Arquivo | Propósito |
|--------|---------|-----------|
| `acceptTerms()` | bot/services/termsService.js | Registrar aceite (Story 3-1) |
| `hasAcceptedVersion()` | bot/services/termsService.js | Verificar se já aceitou (Story 3-1) |
| `getConfig()` | bot/lib/configHelper.js | Ler TERMS_VERSION / TERMS_URL |
| `handleInternalTrialStart()` | bot/handlers/startCommand.js | Criar trial (Story 2-2) |
| `registerMemberEvent()` | bot/handlers/startCommand.js | Log de eventos |
| `bot.answerCallbackQuery()` | Telegram API | Responder callback |
| `bot.editMessageText()` | Telegram API | Editar mensagem após aceite |

### Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `bot/handlers/startCommand.js` | MODIFICAR — adicionar terms check + callback handler |
| `bot/server.js` | MODIFICAR — adicionar routing de callback para private chat |
| `bot/handlers/__tests__/startCommand.test.js` | MODIFICAR — adicionar testes para termos |

### Previous Story Learnings (Story 3-1)

- termsService funciona com padrão `{ success, data/error }`
- resolveGroupId lida com multi-tenancy
- Migration 035 já aplicada — tabela pronta para uso

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#P3] — Branching pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#P4] — Insert-only terms
- [Source: bot/handlers/startCommand.js:164-169] — TRIAL_MODE branching
- [Source: bot/handlers/startCommand.js:349-392] — handleInternalTrialStart
- [Source: bot/server.js:158-175] — Callback routing
- [Source: bot/services/termsService.js] — termsService API (Story 3-1)

## Dev Agent Record

### Agent Model Used

### Completion Notes List

### File List
