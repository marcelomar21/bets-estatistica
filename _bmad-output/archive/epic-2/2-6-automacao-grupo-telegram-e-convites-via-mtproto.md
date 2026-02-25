# Story 2.6: Automação de Grupo Telegram e Convites via MTProto

Status: done

## Story

As a **Super Admin**,
I want que o onboarding crie automaticamente o grupo no Telegram, adicione o bot como admin e envie convites para founders e influencer,
So that o processo de onboarding seja 100% automatizado sem passos manuais no Telegram.

## Acceptance Criteria

1. **Given** onboarding de um novo influencer foi iniciado (Story 2.3) **When** o step de criação de grupo Telegram é executado **Then** sistema cria um supergrupo no Telegram via MTProto usando a conta do founder (FR59) **And** o bot selecionado do pool é adicionado ao grupo como administrador (FR60) **And** o título e descrição do grupo são configurados automaticamente **And** `telegram_group_id` é salvo na tabela `groups`

2. **Given** grupo Telegram foi criado com sucesso **When** o step de convites é executado **Then** Bot Super Admin (bot dedicado já autorizado pelos founders) envia mensagem com link de convite para cada founder (FR61) **And** sistema envia convite para o influencer via Telegram ou email conforme configurado (FR62) **And** sistema envia convites para convidados adicionais configurados para aquele grupo **And** convites são links de convite do grupo (`createChatInviteLink`)

3. **Given** MTProto requer autenticação **When** sistema precisa criar grupo **Then** usa sessão persistida da conta do founder (autenticada uma vez via code/2FA) **And** sessão é armazenada com criptografia autenticada (AES-256-GCM) **And** sistema verifica validade da sessão antes de cada uso e renova automaticamente **And** se sessão expirar ou for invalidada, sistema cria notificação alertando para re-autenticar

4. **Given** Bot Super Admin é um bot dedicado para notificações dos founders **When** novo grupo é criado em qualquer onboarding **Then** Bot Super Admin envia mensagem com: nome do grupo, link de convite, nome do influencer **And** founders já autorizaram o Bot Super Admin previamente (`/start`) **And** Bot Super Admin é separado dos bots do pool (não é associado a nenhum grupo) **And** falhas de envio individuais são logadas sem bloquear o fluxo

## Tasks / Subtasks

- [x] Task 1: Criar migration SQL 023 (AC: #3, #4, #2)
  - [x]1.1 Criar tabela `mtproto_sessions`:
    ```sql
    CREATE TABLE mtproto_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_number VARCHAR NOT NULL,
      session_string TEXT NOT NULL,          -- criptografado AES-256-GCM
      key_version INT NOT NULL DEFAULT 1,    -- versão da chave de criptografia (lazy rotation)
      label VARCHAR NOT NULL,                -- ex: "founder_marcelo"
      is_active BOOLEAN DEFAULT true,
      requires_reauth BOOLEAN DEFAULT false, -- true quando sessão expirou/invalidou
      locked_at TIMESTAMPTZ,                 -- mutex para concorrência (NULL = disponível)
      locked_by VARCHAR,                     -- identificador do processo que travou
      last_used_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,                -- estimativa de expiração da sessão
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(phone_number)                   -- apenas uma sessão ativa por phone
    );
    ```
  - [x]1.2 Criar tabela `super_admin_bot_config`:
    ```sql
    CREATE TABLE super_admin_bot_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      bot_token TEXT NOT NULL,               -- criptografado AES-256-GCM
      bot_username VARCHAR NOT NULL,
      founder_chat_ids JSONB NOT NULL DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    ```
  - [x]1.3 Adicionar colunas à tabela `groups`:
    ```sql
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS telegram_invite_link VARCHAR;
    ALTER TABLE groups ADD COLUMN IF NOT EXISTS additional_invitee_ids JSONB DEFAULT '[]';
    -- additional_invitee_ids: array de {type: "telegram"|"email", value: "chatId ou email"}
    ```
  - [x]1.4 Criar RLS policies — apenas super_admin pode acessar:
    ```sql
    ALTER TABLE mtproto_sessions ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "super_admin_all_mtproto" ON mtproto_sessions
      FOR ALL USING (public.get_my_role() = 'super_admin');

    ALTER TABLE super_admin_bot_config ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "super_admin_all_bot_config" ON super_admin_bot_config
      FOR ALL USING (public.get_my_role() = 'super_admin');
    ```
  - [x]1.5 Criar índices:
    ```sql
    CREATE INDEX idx_mtproto_sessions_active ON mtproto_sessions(is_active) WHERE is_active = true;
    CREATE INDEX idx_mtproto_sessions_locked ON mtproto_sessions(locked_at) WHERE locked_at IS NOT NULL;
    CREATE INDEX idx_mtproto_sessions_reauth ON mtproto_sessions(requires_reauth) WHERE requires_reauth = true;
    ```
  - [x]1.6 Atualizar `NotificationType` no SQL — adicionar check constraint ou documentar que a tabela `notifications` aceita qualquer string no campo `type` (verificar migration 022)

- [x] Task 2: Instalar dependências e criar serviços base (AC: #1, #3, #4)
  - [x]2.1 Instalar dependências no admin-panel:
    ```json
    "dependencies": {
      "telegram": "^2.26.22",
      "node-telegram-bot-api": "^0.67.0"
    },
    "devDependencies": {
      "@types/node-telegram-bot-api": "^0.64.0"
    }
    ```
  - [x]2.2 Atualizar `next.config.ts` — evitar problemas de bundling:
    ```typescript
    const nextConfig: NextConfig = {
      serverExternalPackages: ['telegram', 'node-telegram-bot-api'],
    };
    ```
  - [x]2.3 Criar `admin-panel/src/lib/encryption.ts` — módulo reutilizável de criptografia autenticada:
    ```typescript
    // AES-256-GCM (authenticated encryption — NÃO usar CBC)
    // Formato: keyVersion:iv:authTag:ciphertext (tudo hex)
    export function encrypt(plaintext: string, keyVersion?: number): string
    export function decrypt(encrypted: string): string
    // Key: process.env.ENCRYPTION_KEY (64-char hex = 32 bytes)
    // AuthTag garante integridade (previne tampering no DB)
    ```
  - [x]2.4 Criar `admin-panel/src/lib/audit.ts` — extrair logAudit do onboarding para módulo reutilizável:
    ```typescript
    export function logAudit(
      supabase: TenantContext['supabase'],
      userId: string,
      recordId: string,
      tableName: string,
      action: string,
      changes: Record<string, unknown>
    ): void // fire-and-forget (.then().catch())
    ```
  - [x]2.5 Criar `admin-panel/src/lib/mtproto.ts` — cliente MTProto:
    - `createTelegramClient(sessionString)` — inicializa GramJS com StringSession, `connectionRetries: 3`, update handling desabilitado
    - `withMtprotoSession(fn)` — wrapper que: busca sessão ativa, adquire lock no banco (`locked_at = now()`), conecta, executa `fn`, desconecta em `finally`, libera lock. Previne uso concorrente.
    - `createSupergroup(client, title, about)` — `channels.CreateChannel` com `megagroup: true`, retorna `{ groupId: number, accessHash }`. **Converter BigInt para number:** `Number(channel.id)`
    - `addBotAsAdmin(client, channel, botUsername)` — **resolver username primeiro:** `const botEntity = await client.getEntity("@" + botUsername)` → depois `channels.EditAdmin` com `botEntity` (NÃO string username direto)
    - `createInviteLink(client, channel, title, expireDays)` — `messages.ExportChatInvite`
    - `verifyBotIsAdmin(client, channel, botUsername)` — verificar se bot ainda é admin do grupo (para idempotência)
    - Tratar erros MTProto: `FloodWaitError` (retry com delay), `AuthKeyUnregisteredError` (marcar `requires_reauth`), `SessionRevokedError` (desativar sessão)
  - [x]2.6 Criar `admin-panel/src/lib/super-admin-bot.ts` — serviço do Bot Super Admin:
    - Singleton pattern para instância do `TelegramBot` (reutilizar entre invocações warm)
    - `sendFounderNotification(founderChatIds, groupName, influencerName, inviteLink)` — `Promise.allSettled`, logar falhas individuais no `notifications` table com metadata `{ failed_chat_id, error }`
    - `sendInvite(target, groupName, inviteLink)` — envia convite. `target` pode ser `{ type: 'telegram', chatId }` ou `{ type: 'email', email }`. Para email: usar serviço configurado (ou log warning se email não configurado)
    - `testFounderReachability(founderChatIds)` — testa envio para cada founder, retorna array de `{ chatId, reachable: boolean, error? }`

- [x] Task 3: Criar API Routes para setup de sessão MTProto (AC: #3)
  - [x]3.1 `POST /api/mtproto/setup` — `createApiHandler({ allowedRoles: ['super_admin'] })`:
    - Recebe `{ phone_number }` (validação Zod: formato internacional `+55...`)
    - Gera `setupToken` (UUID), salva no banco com TTL de 5 minutos
    - Inicia GramJS `client.start()` com o phone_number → Telegram envia código
    - **Mantém referência temporária do client** para o verify (ou armazena estado intermediário)
    - Retorna `{ success: true, data: { setup_token, phone_hash } }`
  - [x]3.2 `POST /api/mtproto/verify` — `createApiHandler({ allowedRoles: ['super_admin'] })`:
    - Recebe `{ setup_token, code, password? }` (2FA condicional)
    - **Rate limit: max 5 tentativas por setup_token** — após 5, invalidar token
    - Valida setup_token existe e não expirou (TTL 5min)
    - Completa autenticação GramJS
    - Salva sessão criptografada (AES-256-GCM via `lib/encryption.ts`)
    - Retorna `{ success: true, data: { session_id, label, phone_number } }`
    - **Nunca retornar session_string na response**
  - [x]3.3 `GET /api/mtproto/sessions` — lista sessões ativas:
    - Response: `{ id, phone_number, label, is_active, requires_reauth, last_used_at, created_at }`
    - **Nunca incluir session_string**
  - [x]3.4 `DELETE /api/mtproto/sessions/[id]` — desativa sessão (`is_active = false`)

- [x] Task 4: Criar API Routes para Bot Super Admin (AC: #4)
  - [x]4.1 `GET /api/super-admin-bot` — `createApiHandler({ allowedRoles: ['super_admin'] })`:
    - Retorna: `{ bot_username, founder_chat_ids, is_active }`
    - **Nunca retornar bot_token**
  - [x]4.2 `POST /api/super-admin-bot` — salva/atualiza config:
    - Recebe `{ bot_token, founder_chat_ids }` (Zod: array de numbers)
    - Valida token via Telegram API (`getMe`) antes de salvar
    - Criptografa bot_token via `lib/encryption.ts`
  - [x]4.3 `POST /api/super-admin-bot/test` — testa reachability:
    - Chama `testFounderReachability(founderChatIds)`
    - Retorna per-founder status: `{ results: [{ chat_id, reachable, error? }] }`
  - [x]4.4 Validação com Zod para todos os endpoints

- [x] Task 5: Integrar novo step no onboarding (AC: #1, #2)
  - [x]5.1 Atualizar `database.ts` — adicionar ao tipo `OnboardingStep`:
    ```typescript
    export type OnboardingStep = 'creating' | 'validating_bot' | 'configuring_mp'
      | 'deploying_bot' | 'creating_admin' | 'creating_telegram_group' | 'finalizing';
    ```
    E ao tipo `StepRequest` (discriminated union):
    ```typescript
    | { step: 'creating_telegram_group'; group_id: string }
    ```
  - [x]5.2 Adicionar schema Zod:
    ```typescript
    const creatingTelegramGroupSchema = z.object({
      step: z.literal('creating_telegram_group'),
      group_id: z.string().uuid('ID do grupo inválido'),
    });
    ```
    Adicionar ao `stepSchema` discriminated union
  - [x]5.3 Implementar `handleCreatingTelegramGroup()` com idempotência granular:
    ```
    1. Buscar grupo do banco (telegram_group_id, telegram_invite_link)
    2. Buscar bot associado: SELECT bot_token, bot_username FROM bot_pool
       WHERE group_id = $1 AND status = 'in_use' (se não encontrar: erro BOT_NOT_ASSIGNED)
    3. IDEMPOTÊNCIA GRANULAR:
       a. Se telegram_group_id existe → verificar bot é admin (verifyBotIsAdmin)
          - Se bot é admin E invite_link existe → skip, retornar dados existentes
          - Se bot NÃO é admin → erro BOT_NOT_ADMIN (não auto-criar)
       b. Se telegram_group_id NÃO existe → criar:
    4. Adquirir lock da sessão MTProto (withMtprotoSession)
    5. Criar supergrupo (createSupergroup) → Number(channel.id) = telegram_group_id
    6. Adicionar bot como admin (addBotAsAdmin com entity resolution)
    7. Gerar invite link (createInviteLink)
    8. Salvar telegram_group_id + telegram_invite_link na tabela groups
    9. Enviar notificação founders via Bot Super Admin (fire-and-forget com log de falhas)
    10. Enviar convite para influencer (Telegram ou email conforme configuração do grupo)
    11. Enviar convites para additional_invitee_ids do grupo (se configurado)
    12. Criar notificação persistida (telegram_group_created)
    ```
  - [x]5.4 Inserir step entre `creating_admin` e `finalizing` no switch do handler
  - [x]5.5 Classificação de erros:
    - **Transientes** (retryable): `FloodWaitError`, `SERVICE_UNAVAILABLE`, timeout de rede → retornar erro com `retryable: true`, NÃO marcar grupo como `failed`
    - **Permanentes**: `AUTH_KEY_UNREGISTERED`, `SESSION_REVOKED` → marcar sessão `requires_reauth = true`, retornar erro com código específico
    - **Configuração**: sessão não encontrada, bot não configurado → NÃO marcar grupo como `failed`, retornar erro orientando setup

- [x] Task 6: Atualizar frontend do OnboardingWizard (AC: #1, #2)
  - [x]6.1 Adicionar `{ key: 'creating_telegram_group', label: 'Criando Grupo Telegram' }` ao array STEPS entre `creating_admin` e `finalizing`
  - [x]6.2 Adicionar payload construction no `runSteps()`: `{ step: 'creating_telegram_group', group_id }`
  - [x]6.3 Exibir resultado do step: nome do grupo, link de convite, status de notificações enviadas (quantos founders notificados / quantos falharam)
  - [x]6.4 Manter retry funcional (idempotência granular no backend)
  - [x]6.5 Nota: onboarding agora tem 7 steps visuais (6 + finalizing). FR37 ("até 5 passos") refere-se a clicks/ações do usuário, não steps internos — o usuário ainda faz 1 submit e acompanha o progresso

- [x] Task 7: Criar UI de configuração Telegram (AC: #3, #4, #2)
  - [x]7.1 Criar página `/settings/telegram` com três seções:
    - **Seção "Sessão MTProto"**: wizard de 2 passos (enviar código → verificar código + 2FA se necessário) + lista de sessões ativas com status (ativa/requer reauth) + botão desativar
    - **Seção "Bot Super Admin"**: formulário bot_token + lista de founder_chat_ids (input numérico) + botão "Testar Notificação" com resultado per-founder
    - **Seção "Convidados Adicionais" (por grupo)**: link para configurar via página de edição do grupo (`/groups/[groupId]`)
  - [x]7.2 UX do wizard MTProto:
    - Passo 1: Input phone (formato internacional, validação Zod) → botão "Enviar Código"
    - Passo 2: Input código + input 2FA (condicional, mostrar se 2FA requerido) → botão "Verificar"
    - Estados de erro: código inválido (max 5 tentativas), timeout (5min), 2FA incorreto
    - Loading states em cada passo
  - [x]7.3 Atualizar GroupEditForm (`/groups/[groupId]`) — adicionar campo `additional_invitee_ids`:
    - Array de `{ type: "telegram" | "email", value: string }`
    - UI: lista editável com botão "adicionar convidado" + select type + input value
    - Salva na tabela `groups.additional_invitee_ids`

- [x] Task 8: Notificações persistidas para eventos Telegram (AC: #1, #2, #4, #3)
  - [x]8.1 Adicionar novos tipos ao `NotificationType` em `database.ts`:
    ```typescript
    export type NotificationType =
      | 'bot_offline' | 'group_failed' | 'onboarding_completed'
      | 'group_paused' | 'integration_error'
      | 'telegram_group_created'      // NOVO
      | 'telegram_group_failed'       // NOVO
      | 'telegram_notification_failed' // NOVO — falha de envio para founder individual
      | 'mtproto_session_expired';    // NOVO — sessão precisa re-autenticação
    ```
  - [x]8.2 Inserir notificações no handleCreatingTelegramGroup:
    - Sucesso: `telegram_group_created` (severity: success), metadata: `{ telegram_group_id, invite_link, influencer_name }`
    - Falha: `telegram_group_failed` (severity: error), metadata: `{ error_code, error_message, retryable }`
    - Falha de envio founder: `telegram_notification_failed` (severity: warning), metadata: `{ failed_chat_id, error }`
  - [x]8.3 Inserir notificação quando sessão MTProto expira/invalida:
    - `mtproto_session_expired` (severity: error), metadata: `{ session_id, phone_number, reason }`

- [x] Task 9: Testes (AC: todos)
  - [x]9.1 Testes unitários `lib/encryption.ts` — encrypt/decrypt roundtrip, key_version, authTag validation, tampering detection (GCM rejeita ciphertext modificado)
  - [x]9.2 Testes unitários `lib/mtproto.ts`:
    ```typescript
    import { describe, it, expect, beforeEach, vi } from 'vitest';
    vi.mock('telegram', () => ({ Api: MockApi, TelegramClient: MockClient }));
    ```
    - createSupergroup: sucesso, FloodWaitError, network error
    - addBotAsAdmin: sucesso com entity resolution, bot não encontrado
    - createInviteLink: sucesso, rate limit
    - withMtprotoSession: adquire lock, libera lock em finally, rejeita se locked
    - BigInt → Number conversion validado
  - [x]9.3 Testes unitários `lib/super-admin-bot.ts`:
    ```typescript
    vi.mock('node-telegram-bot-api', () => ({ default: MockBot }));
    ```
    - sendFounderNotification: sucesso para todos, falha parcial (allSettled), log de falhas
    - sendInvite: telegram, email, tipo inválido
    - testFounderReachability: mix de reachable/unreachable
    - Singleton pattern: mesma instância retornada
  - [x]9.4 Testes API `/api/mtproto/*`:
    - setup: sucesso, phone inválido, 401 (não autenticado), 403 (group_admin)
    - verify: sucesso, código inválido, rate limit (6a tentativa falha), setup_token expirado, 2FA requerido
    - sessions: lista sem session_string, 401/403
    - delete: desativa sessão, sessão não encontrada
  - [x]9.5 Testes API `/api/super-admin-bot/*`:
    - GET: retorna config sem token, 401/403
    - POST: salva config, token inválido (getMe falha), Zod validation
    - test: reachability results, 401/403
  - [x]9.6 Testes step `creating_telegram_group` no onboarding:
    - Sucesso completo (criar grupo + add bot + invite + notify)
    - Idempotência: grupo já existe + bot é admin → skip
    - Idempotência: grupo existe + bot NÃO é admin → erro BOT_NOT_ADMIN
    - Sessão não configurada → erro MTPROTO_SESSION_NOT_FOUND (grupo NÃO fica failed)
    - Sessão expirada → erro MTPROTO_SESSION_EXPIRED + marca requires_reauth
    - FloodWait → erro transiente com retryable: true
    - Bot não encontrado no pool → erro BOT_NOT_ASSIGNED
    - Notificação founder falha parcial → step continua com sucesso
    - Envio convite influencer (Telegram e email)
    - Convidados adicionais processados
  - [x]9.7 Testes frontend:
    - OnboardingWizard: novo step aparece, payload correto, resultado exibido
    - Settings/telegram: wizard MTProto (2 passos), Bot Super Admin config, test notification
    - GroupEditForm: campo additional_invitee_ids editável
  - [x]9.8 Zero regressões — todos os testes existentes passando

## Dev Notes

### Contexto Crítico

Esta story automatiza a parte do Telegram no onboarding de influencers. Atualmente, o onboarding (Story 2.3) cria grupo no banco, configura Mercado Pago, faz deploy do bot no Render e cria conta admin — mas o grupo Telegram precisa ser criado manualmente. Esta story fecha esse gap adicionando um novo step automatizado.

**IMPORTANTE — MTProto vs Bot API:**
MTProto (GramJS) opera com **conta de usuário real** (do founder), NÃO com Bot API. Isso requer um fluxo de autenticação one-time (phone + código + 2FA) e uma sessão persistida. A sessão deve ser criada uma vez no setup inicial via `/settings/telegram` e reutilizada em todos os onboardings subsequentes.

**DISTINÇÃO CRÍTICA — Três entidades Telegram:**
1. **Bot do Pool** — bot operacional associado ao grupo do influencer (já existe, gerenciado pelo pool). É adicionado como admin ao grupo via MTProto.
2. **Bot Super Admin** — bot dedicado para notificar founders sobre novos grupos/eventos. Separado do pool, configurado uma vez globalmente. Usa Bot API (node-telegram-bot-api).
3. **Conta do Founder (MTProto)** — conta de usuário real usada para criar supergrupos. Requer sessão autenticada. "Founders" = os donos/operadores da plataforma SaaS (tipicamente 1-3 pessoas como Marcelo). NÃO são group_admins (que são os influencers).

### Decisão Arquitetural: GramJS em Next.js API Routes

GramJS mantém conexão TCP persistente com servidores MTProto. Em ambiente serverless (API Routes):
- **Cold start**: cada invocação cria novo client, conecta, opera, desconecta (~1-3s overhead)
- **Cleanup obrigatório**: `client.disconnect()` em bloco `finally` para evitar leaked connections
- **Update handling desabilitado**: `connectionRetries: 3`, sem polling de updates
- **Concorrência**: mutex via coluna `locked_at` no banco — apenas um processo usa a sessão por vez

Padrão connect-per-request:
```typescript
export async function withMtprotoSession<T>(
  supabase: SupabaseClient,
  fn: (client: TelegramClient) => Promise<T>
): Promise<T> {
  // 1. Buscar sessão ativa e não-locked
  const { data: session } = await supabase
    .from('mtproto_sessions')
    .select('*')
    .eq('is_active', true)
    .eq('requires_reauth', false)
    .is('locked_at', null)
    .single();

  if (!session) throw new MtprotoError('MTPROTO_SESSION_NOT_FOUND');

  // 2. Adquirir lock (atomic update com check)
  const { data: locked } = await supabase
    .from('mtproto_sessions')
    .update({ locked_at: new Date().toISOString(), locked_by: crypto.randomUUID() })
    .eq('id', session.id)
    .is('locked_at', null)  // optimistic lock
    .select()
    .single();

  if (!locked) throw new MtprotoError('MTPROTO_SESSION_BUSY');

  const sessionString = decrypt(session.session_string);
  const client = new TelegramClient(
    new StringSession(sessionString),
    Number(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH!,
    { connectionRetries: 3 }
  );

  try {
    await client.connect();
    const result = await fn(client);

    // Atualizar last_used_at
    await supabase
      .from('mtproto_sessions')
      .update({ last_used_at: new Date().toISOString(), locked_at: null, locked_by: null })
      .eq('id', session.id);

    return result;
  } catch (error) {
    if (isAuthError(error)) {
      await supabase
        .from('mtproto_sessions')
        .update({ requires_reauth: true, is_active: false, locked_at: null, locked_by: null })
        .eq('id', session.id);
    } else {
      // Liberar lock mesmo em erro
      await supabase
        .from('mtproto_sessions')
        .update({ locked_at: null, locked_by: null })
        .eq('id', session.id);
    }
    throw error;
  } finally {
    await client.disconnect();
  }
}

function isAuthError(error: unknown): boolean {
  const msg = String(error);
  return msg.includes('AUTH_KEY_UNREGISTERED')
    || msg.includes('SESSION_REVOKED')
    || msg.includes('USER_DEACTIVATED');
}
```

### Stack Tecnológica

| Technology | Version | Notes |
|------------|---------|-------|
| Next.js | 16.1.6 | App Router |
| React | 19.2.3 | |
| TypeScript | 5.x | Strict mode |
| Tailwind CSS | 4.x | Styling |
| @supabase/supabase-js | ^2.95.3 | Database client |
| @supabase/ssr | ^0.8.0 | Auth helpers |
| Zod | 4.3.6 | Schema validation (v4: `.issues` não `.errors`) |
| Vitest | 3.2.4 | Testing (NÃO Jest) |
| telegram (GramJS) | ^2.26.22 | **NOVO** — MTProto client para conta de usuário |
| node-telegram-bot-api | ^0.67.0 | **NOVO** — Bot API para Bot Super Admin |
| @types/node-telegram-bot-api | ^0.64.0 | **NOVO** — Types |

### GramJS — Padrões Críticos

**Criar supergrupo:**
```typescript
import { Api } from 'telegram';

const result = await client.invoke(
  new Api.channels.CreateChannel({
    title: groupName,
    about: `Grupo de apostas - ${influencerName}`,
    megagroup: true, // supergrupo, NÃO canal
  })
);
const channel = result.chats[0];
// CRITICAL: converter BigInt para Number
const telegramGroupId = Number(channel.id);
```

**Adicionar bot como admin — RESOLVER ENTITY PRIMEIRO (NÃO usar string direto):**
```typescript
// 1. Resolver username → entity (necessário em sessão fria/serverless)
const botEntity = await client.getEntity(`@${botUsername}`);

// 2. Adicionar como admin usando entity resolvido
await client.invoke(
  new Api.channels.EditAdmin({
    channel: channel,
    userId: botEntity, // entity, NÃO string "@bot"
    adminRights: new Api.ChatAdminRights({
      postMessages: true,
      deleteMessages: true,
      banUsers: true,
      inviteUsers: true,
      pinMessages: true,
      changeInfo: false,
      addAdmins: false,
      anonymous: false,
      manageCall: false,
      other: true,
    }),
    rank: 'Bot',
  })
);
```

**Gerar link de convite:**
```typescript
const invite = await client.invoke(
  new Api.messages.ExportChatInvite({
    peer: channel,
    expireDate: Math.floor(Date.now() / 1000) + 30 * 86400, // 30 dias
    usageLimit: 100,
    title: `Convite ${groupName}`,
  })
);
// invite.link = "https://t.me/+AbCdEfGhIjK"
```

**Tratamento de erros MTProto:**
```typescript
import { errors } from 'telegram';

try {
  await mtprotoOperation();
} catch (error) {
  if (error instanceof errors.FloodWaitError) {
    // TRANSIENTE — retry depois de error.seconds
    return { success: false, error: {
      code: 'FLOOD_WAIT',
      message: `Telegram rate limit. Retry em ${error.seconds}s`,
      retryable: true, retryAfterSeconds: error.seconds
    }};
  }
  if (isAuthError(error)) {
    // PERMANENTE — sessão invalidada
    // Marcar requires_reauth, criar notificação mtproto_session_expired
    return { success: false, error: { code: 'MTPROTO_SESSION_EXPIRED', message: '...' }};
  }
  // TRANSIENTE genérico
  return { success: false, error: { code: 'TELEGRAM_ERROR', message: '...', retryable: true }};
}
```

### Criptografia Autenticada (AES-256-GCM) — `lib/encryption.ts`

```typescript
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;        // GCM recomenda 12 bytes
const AUTH_TAG_LENGTH = 16;   // 128 bits

export function encrypt(plaintext: string, keyVersion = 1): string {
  const key = getKey(keyVersion);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Formato: version:iv:authTag:ciphertext
  return `${keyVersion}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const [versionStr, ivHex, authTagHex, ciphertext] = encrypted.split(':');
  const key = getKey(Number(versionStr));
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function getKey(version: number): Buffer {
  // v1: ENCRYPTION_KEY, futuro: ENCRYPTION_KEY_V2, etc.
  const envKey = version === 1 ? 'ENCRYPTION_KEY' : `ENCRYPTION_KEY_V${version}`;
  const key = process.env[envKey];
  if (!key) throw new Error(`Encryption key ${envKey} not found`);
  return Buffer.from(key, 'hex'); // 64-char hex → 32 bytes
}
```

**Variáveis de ambiente necessárias:**
```env
ENCRYPTION_KEY=<64-char-hex-string>     # 32 bytes para AES-256-GCM
TELEGRAM_API_ID=<integer>               # my.telegram.org (constante de aplicação)
TELEGRAM_API_HASH=<string>              # my.telegram.org (constante de aplicação)
SUPER_ADMIN_BOT_TOKEN=<token>           # BotFather — bot separado do pool
```

### Bot Super Admin — Padrão de Notificação

```typescript
import TelegramBot from 'node-telegram-bot-api';

// Singleton — reutilizar entre invocações warm
let botInstance: TelegramBot | null = null;
function getBot(): TelegramBot {
  if (!botInstance) {
    botInstance = new TelegramBot(process.env.SUPER_ADMIN_BOT_TOKEN!, { polling: false });
  }
  return botInstance;
}

export async function sendFounderNotification(
  founderChatIds: number[],
  groupName: string,
  influencerName: string,
  inviteLink: string
): Promise<{ sent: number; failed: Array<{ chatId: number; error: string }> }> {
  const bot = getBot();
  const message =
    `<b>Novo Grupo Criado</b>\n\n` +
    `<b>Grupo:</b> ${groupName}\n` +
    `<b>Influencer:</b> ${influencerName}\n` +
    `<b>Convite:</b> ${inviteLink}\n\n` +
    `Grupo ativo com bot configurado.`;

  const results = await Promise.allSettled(
    founderChatIds.map(chatId =>
      bot.sendMessage(chatId, message, { parse_mode: 'HTML' })
    )
  );

  const failed: Array<{ chatId: number; error: string }> = [];
  let sent = 0;
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') sent++;
    else failed.push({ chatId: founderChatIds[i], error: result.reason?.message ?? 'Unknown' });
  });

  return { sent, failed };
}
```

### Idempotência Granular do Step (CRÍTICO)

```typescript
async function handleCreatingTelegramGroup(data, context) {
  const { group_id } = data;

  // 1. Buscar estado atual do grupo
  const { data: group } = await context.supabase
    .from('groups')
    .select('telegram_group_id, telegram_invite_link, name, additional_invitee_ids')
    .eq('id', group_id)
    .single();

  // 2. Buscar bot associado
  const { data: bot } = await context.supabase
    .from('bot_pool')
    .select('bot_token, bot_username')
    .eq('group_id', group_id)
    .eq('status', 'in_use')
    .single();

  if (!bot) {
    return error('BOT_NOT_ASSIGNED', 'Nenhum bot associado ao grupo');
  }

  // 3. IDEMPOTÊNCIA GRANULAR
  if (group.telegram_group_id) {
    // Grupo já existe — verificar sub-steps
    try {
      await withMtprotoSession(context.supabase, async (client) => {
        await verifyBotIsAdmin(client, group.telegram_group_id, bot.bot_username);
      });

      if (group.telegram_invite_link) {
        // Tudo OK — skip completo
        return success({ telegram_group_id: group.telegram_group_id,
          invite_link: group.telegram_invite_link, skipped: true });
      }
      // Falta invite link — gerar apenas o link
      // ... gerar link e salvar
    } catch (err) {
      return error('BOT_NOT_ADMIN',
        'Grupo existe mas bot não é admin. Verifique manualmente.',
        { telegram_group_id: group.telegram_group_id });
    }
  }

  // 4. Criar grupo completo
  // ... (criar supergrupo, add bot, gerar invite, notificar, etc.)
}
```

### Error Codes (OBRIGATÓRIO)

| Code | Quando usar | Retryable |
|------|-------------|-----------|
| `MTPROTO_SESSION_NOT_FOUND` | Nenhuma sessão ativa configurada | Não (config) |
| `MTPROTO_SESSION_EXPIRED` | Sessão invalidada pelo Telegram | Não (reauth) |
| `MTPROTO_SESSION_BUSY` | Sessão em uso por outro processo | Sim |
| `MTPROTO_VERIFICATION_FAILED` | Código de verificação inválido | Sim (max 5x) |
| `MTPROTO_2FA_REQUIRED` | 2FA necessário mas não fornecido | Sim |
| `BOT_NOT_ASSIGNED` | Nenhum bot associado ao grupo no pool | Não (config) |
| `BOT_NOT_ADMIN` | Grupo existe mas bot não é admin | Não (manual) |
| `BOT_SUPER_ADMIN_NOT_CONFIGURED` | Bot Super Admin não configurado | Não (config) |
| `FLOOD_WAIT` | Rate limit do Telegram | Sim (após N seg) |
| `TELEGRAM_GROUP_CREATION_FAILED` | Falha genérica ao criar grupo | Sim |
| `TELEGRAM_ERROR` | Erro transiente genérico do Telegram | Sim |

### Fluxo Completo do Onboarding Atualizado

```
Step 1: creating          → Cria grupo no banco (status=creating)
Step 2: validating_bot    → Valida token do bot via Telegram API (getMe)
Step 3: configuring_mp    → Cria produto no Mercado Pago
Step 4: deploying_bot     → Deploy do bot no Render
Step 5: creating_admin    → Cria conta admin via Supabase Auth
Step 6: creating_telegram_group → [NOVO] Cria supergrupo, add bot, gera convite, notifica
Step 7: finalizing        → Ativa grupo (status=active)
```

Nota: FR37 ("até 5 passos") refere-se a ações do usuário (1 formulário + 1 submit). Os 7 steps são internos e automatizados — o usuário acompanha o progresso visualmente sem intervenção.

### Pré-requisitos para o Step Funcionar

1. **Sessão MTProto ativa** — configurada previamente via `/settings/telegram`
2. **Bot Super Admin configurado** — token + founder_chat_ids via `/settings/telegram`
3. **Founders deram `/start`** no Bot Super Admin — verificável via `/api/super-admin-bot/test`

Se pré-requisitos não estiverem atendidos:
- Retornar erro claro com código específico (ex: `MTPROTO_SESSION_NOT_FOUND`)
- **NÃO marcar grupo como `failed`** (é problema de configuração, não de execução)
- Sugerir ao usuário configurar via `/settings/telegram`
- O step é retry-friendly: basta configurar e re-executar

### Tabelas Existentes Relevantes

- **`groups`**: id, name, bot_token, telegram_group_id (BIGINT), telegram_admin_group_id (BIGINT), mp_product_id, render_service_id, checkout_url, status, created_at
- **`bot_pool`**: id, bot_token, bot_username, status (available/in_use), group_id
- **`admin_users`**: id, user_id, email, role (super_admin/group_admin), group_id
- **`notifications`**: id, type (VARCHAR), severity, title, message, group_id, metadata (JSONB), read, created_at
- **`audit_log`**: id, table_name, record_id, action, changed_by, changes (JSONB), created_at

### Padrões Estabelecidos (SEGUIR)

1. **API Handler**: `createApiHandler()` de `@/middleware/api-handler` — context: `user`, `role`, `groupFilter`, `supabase`
2. **Response format**: `{ success: true, data: {...} }` ou `{ success: false, error: { code, message } }`
3. **Discriminated union schemas** (Zod) para steps do onboarding
4. **Audit log**: via `logAudit()` de `@/lib/audit` — non-blocking (fire-and-forget)
5. **Tokens NUNCA em responses** — bot_token, session_string, SUPER_ADMIN_BOT_TOKEN (NFR-S2)
6. **Zod v4** — `.issues` não `.errors` no safeParse
7. **Vitest** — NÃO Jest. `vi.mock`, `vi.fn()`, `describe/it/expect/beforeEach`
8. **Mock Supabase** — query builder table-aware no `from()`
9. **Naming conventions**: snake_case DB, camelCase TS, PascalCase componentes
10. **Client Components** — `'use client'` + `useEffect` + `useCallback` + loading/error/data states
11. **Criptografia**: usar `@/lib/encryption` (AES-256-GCM) — NÃO criar crypto inline
12. **Telegram IDs**: BIGINT no banco, `Number()` ao converter do GramJS BigInt

### Learnings das Stories Anteriores (APLICAR)

1. Zod v4 usa `.issues` (não `.errors`) no resultado de `safeParse()`
2. Mock de Supabase query builder deve diferenciar por table name no `from()`
3. Audit log NÃO bloqueia operação principal — `.then().catch()` sem await
4. `bot_token` NUNCA retornar em respostas de API (NFR-S2)
5. `formatDateTime` de `@/lib/format-utils.ts` para timestamps (DRY)
6. `useCallback` no fetch function para evitar re-renders
7. Migration numerada em sequência (próxima: 023)
8. Discriminated union Zod para step routing
9. Idempotência: verificar se recurso já existe antes de criar
10. Retry-friendly: frontend re-executa step sem side effects
11. `logAudit()` inline no onboarding — **extrair para `@/lib/audit`** (reutilização)

### Git Intelligence

```
d7e34a6 feat(admin): add notifications system with persistence, mark-as-read and unread badge (Story 2.5)
59a860f feat(admin): add consolidated dashboard with stats, alerts and group cards (Story 2.4)
c01fb2d refactor(admin): step-by-step onboarding API + wizard tests (Story 2.3)
e83c66e feat(admin): add influencer onboarding wizard with multi-step pipeline (Story 2.3)
```

Branch: criar `feature/telegram-mtproto` a partir de master (após merge do PR da branch `feature/dashboard-consolidado`)

### Project Structure Notes

**Novos arquivos:**
```
sql/migrations/023_mtproto_sessions.sql
admin-panel/src/lib/encryption.ts
admin-panel/src/lib/audit.ts
admin-panel/src/lib/mtproto.ts
admin-panel/src/lib/super-admin-bot.ts
admin-panel/src/app/api/mtproto/setup/route.ts
admin-panel/src/app/api/mtproto/verify/route.ts
admin-panel/src/app/api/mtproto/sessions/route.ts
admin-panel/src/app/api/mtproto/sessions/[id]/route.ts
admin-panel/src/app/api/super-admin-bot/route.ts
admin-panel/src/app/api/super-admin-bot/test/route.ts
admin-panel/src/app/(auth)/settings/telegram/page.tsx
admin-panel/src/lib/__tests__/encryption.test.ts
admin-panel/src/lib/__tests__/mtproto.test.ts
admin-panel/src/lib/__tests__/super-admin-bot.test.ts
admin-panel/src/app/api/__tests__/mtproto.test.ts
admin-panel/src/app/api/__tests__/super-admin-bot.test.ts
```

**Arquivos a modificar:**
```
admin-panel/next.config.ts                                  → serverExternalPackages
admin-panel/package.json                                    → telegram, node-telegram-bot-api, @types
admin-panel/src/types/database.ts                          → OnboardingStep, StepRequest, NotificationType, MtprotoSession, SuperAdminBotConfig
admin-panel/src/app/api/groups/onboarding/route.ts         → step creating_telegram_group + refatorar logAudit para usar @/lib/audit
admin-panel/src/components/features/groups/OnboardingWizard.tsx → step no array STEPS
admin-panel/src/components/features/groups/GroupEditForm.tsx → campo additional_invitee_ids
admin-panel/src/app/(auth)/layout.tsx                      → link /settings/telegram no nav
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.6]
- [Source: _bmad-output/planning-artifacts/epics.md#FR59, FR60, FR61, FR62]
- [Source: _bmad-output/planning-artifacts/prd.md#FR62 — "email ou Telegram" + "outras pessoas configuráveis"]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Multi-Tenant Architecture]
- [Source: _bmad-output/planning-artifacts/architecture-multitenant.md#Automated Onboarding Flow]
- [Source: _bmad-output/project-context.md#Service Response Pattern, Multi-Tenant Rules]
- [Source: admin-panel/src/app/api/groups/onboarding/route.ts — Pipeline steps + logAudit inline]
- [Source: admin-panel/src/components/features/groups/OnboardingWizard.tsx — Frontend wizard]
- [Source: admin-panel/src/middleware/api-handler.ts — createApiHandler + withTenant wrapper]
- [Source: admin-panel/src/middleware/tenant.ts — TenantContext interface]
- [Source: admin-panel/src/lib/telegram.ts — validateBotToken existente]
- [Source: admin-panel/src/lib/mercadopago.ts — Padrão de service file]
- [Source: admin-panel/src/lib/render.ts — Padrão de service file]
- [Source: admin-panel/src/types/database.ts — Tipos OnboardingStep, StepRequest existentes]
- [Source: sql/migrations/019_multitenant.sql — Schema groups, bot_pool, admin_users]
- [Source: sql/migrations/022_notifications.sql — Tabela notifications (Story 2.5)]
- [Source: GramJS docs — channels.CreateChannel, channels.EditAdmin, messages.ExportChatInvite]
- [Source: GramJS Issue #571 — EditAdmin para bots (NÃO InviteToChannel)]
- [Source: GramJS Issue #191 — Concorrência de sessão / AUTH_KEY_DUPLICATED]
- [Source: GramJS Issue #105 — Entity resolution necessária em sessão fria]
- [Source: GramJS Issue #615 — client.disconnect() cleanup]
- [Source: node-telegram-bot-api docs — sendMessage, createChatInviteLink]
- [Source: NIST SP 800-38D — AES-GCM recomendado sobre CBC para authenticated encryption]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Test failures fixed: import paths in API tests, MtprotoError assertion, GroupEditForm expected data shape, OnboardingWizard step mocks (7 steps instead of 6)
- Code review fixes: CRITICAL bug in handleCreatingTelegramGroup (removed `.eq('status', 'in_use')` filter), stale lock recovery in withMtprotoSession, HTML escaping in super-admin-bot, serverless limitation documented in setup/route.ts, added missing tests for creating_telegram_group, MTProto API routes, and Settings/Telegram page

### Completion Notes List

- All 9 tasks implemented following story Dev Notes patterns
- AES-256-GCM encryption with key versioning for session_string and bot_token
- MTProto connect-per-request pattern with DB mutex locking
- Idempotent `creating_telegram_group` step with granular sub-step checks
- Bot Super Admin singleton pattern with Promise.allSettled for partial failure handling
- 36 test files passing, 324 tests total, zero regressions
- Sidebar updated with Telegram settings link (super_admin only)

### Change Log

- Migration 023: mtproto_sessions, super_admin_bot_config tables; groups columns (telegram_invite_link, additional_invitee_ids); RLS policies; indexes; updated notifications CHECK constraint
- New libs: encryption.ts, audit.ts, mtproto.ts, super-admin-bot.ts
- New API routes: /api/mtproto/setup, /api/mtproto/verify, /api/mtproto/sessions, /api/mtproto/sessions/[id], /api/super-admin-bot, /api/super-admin-bot/test
- New page: /settings/telegram (MTProto wizard + Bot Super Admin config)
- Modified: onboarding route (new step), OnboardingWizard (7 steps), GroupEditForm (invitees), Sidebar (nav link), database.ts (types), next.config.ts (external packages)

### File List

**New files:**
- `sql/migrations/023_mtproto_sessions.sql`
- `admin-panel/src/lib/encryption.ts`
- `admin-panel/src/lib/audit.ts`
- `admin-panel/src/lib/mtproto.ts`
- `admin-panel/src/lib/super-admin-bot.ts`
- `admin-panel/src/app/api/mtproto/setup/route.ts`
- `admin-panel/src/app/api/mtproto/verify/route.ts`
- `admin-panel/src/app/api/mtproto/sessions/route.ts`
- `admin-panel/src/app/api/mtproto/sessions/[id]/route.ts`
- `admin-panel/src/app/api/super-admin-bot/route.ts`
- `admin-panel/src/app/api/super-admin-bot/test/route.ts`
- `admin-panel/src/app/(auth)/settings/telegram/page.tsx`
- `admin-panel/src/lib/__tests__/encryption.test.ts`
- `admin-panel/src/lib/__tests__/mtproto.test.ts`
- `admin-panel/src/lib/__tests__/super-admin-bot.test.ts`
- `admin-panel/src/app/api/__tests__/mtproto.test.ts`
- `admin-panel/src/app/api/__tests__/super-admin-bot.test.ts`
- `admin-panel/src/app/(auth)/settings/telegram/page.test.tsx`

**Modified files:**
- `admin-panel/next.config.ts`
- `admin-panel/package.json`
- `admin-panel/package-lock.json`
- `admin-panel/src/types/database.ts`
- `admin-panel/src/app/api/groups/onboarding/route.ts`
- `admin-panel/src/components/features/groups/OnboardingWizard.tsx`
- `admin-panel/src/components/features/groups/GroupEditForm.tsx`
- `admin-panel/src/components/layout/Sidebar.tsx`
- `admin-panel/src/components/features/groups/OnboardingWizard.test.tsx`
- `admin-panel/src/components/features/groups/GroupEditForm.test.tsx`
