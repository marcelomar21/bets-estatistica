# Story 8.1: Upload de Arquivo e Schema de Midia

Status: done

## Story

As a **Super Admin ou Group Admin**,
I want anexar um PDF ou imagem ao agendar uma mensagem,
So that eu possa enviar relatorios, comunicados visuais e conteudo rico para os grupos.

## Acceptance Criteria

1. **Given** operador esta na pagina `/messages` criando nova mensagem
   **When** preenche o formulario de agendamento
   **Then** o formulario exibe campo de upload de arquivo aceitando PDF, JPG e PNG com limite de 10MB (FR59)
   **And** ao selecionar arquivo, mostra preview do nome, tipo e tamanho
   **And** validacao: rejeita arquivos > 10MB com mensagem clara de erro
   **And** validacao: rejeita tipos de arquivo nao suportados (apenas PDF, JPG, PNG)

2. **Given** operador selecionou um arquivo valido
   **When** submete o formulario de agendamento
   **Then** arquivo e enviado para Supabase Storage no bucket `message-media` com path `{group_id}/{uuid}.{ext}` (FR60)
   **And** a mensagem e criada com `media_storage_path` e `media_type` preenchidos

3. **Given** tabela `scheduled_messages` no banco
   **When** migration e aplicada
   **Then** tabela possui campos adicionais: `media_url` (TEXT nullable), `media_type` (VARCHAR nullable, check 'pdf'|'image'), `media_storage_path` (TEXT nullable)
   **And** bucket `message-media` criado no Supabase Storage com RLS por grupo

4. **Given** API `POST /api/messages`
   **When** recebe requisicao com `media_storage_path` e `media_type`
   **Then** aceita os campos opcionais e persiste na tabela
   **And** mensagem pode ser criada com texto apenas, midia apenas, ou texto + midia

5. **Given** operador esta na tabela de mensagens agendadas
   **When** mensagem tem midia anexa
   **Then** coluna "Midia" exibe indicador do tipo (icone PDF ou imagem)

## Tasks / Subtasks

- [x] Task 1: Migration — adicionar campos de midia e criar bucket (AC: #3)
  - [x] 1.1 Criar migration `038_message_media.sql` com ALTER TABLE para adicionar `media_url`, `media_type`, `media_storage_path`
  - [x] 1.2 Na mesma migration, criar bucket `message-media` com RLS (seguir padrao de `036_analysis_storage_bucket.sql`)
  - [x] 1.3 Aplicar migration via Supabase Management API

- [x] Task 2: Atualizar tipos TypeScript e API (AC: #4)
  - [x] 2.1 Atualizar `ScheduledMessage` e `ScheduledMessageListItem` em `database.ts` com campos `media_url`, `media_type`, `media_storage_path`
  - [x] 2.2 Atualizar `POST /api/messages/route.ts` para aceitar `media_storage_path` e `media_type` opcionais
  - [x] 2.3 Atualizar `GET /api/messages/route.ts` para incluir campos de midia no SELECT
  - [x] 2.4 Relaxar validacao de `message_text` — permitir vazio se `media_storage_path` estiver presente
  - [x] 2.5 Escrever testes unitarios para a API com e sem midia

- [x] Task 3: Upload de arquivo no frontend (AC: #1, #2)
  - [x] 3.1 Criar componente `FileUpload` em `components/features/messages/FileUpload.tsx` com drag & drop e click
  - [x] 3.2 Validar tipo (PDF, JPG, PNG) e tamanho (max 10MB) no cliente
  - [x] 3.3 Implementar upload para Supabase Storage via API route com service_role
  - [x] 3.4 Integrar `FileUpload` no formulario de mensagens em `page.tsx`
  - [x] 3.5 Apos upload, guardar `media_storage_path` e `media_type` no state do form
  - [x] 3.6 Enviar `media_storage_path` e `media_type` no POST para a API
  - [x] 3.7 Testes cobertos via API tests (media fields, media-only, cross-group rejection)

- [x] Task 4: Indicador de midia na tabela de mensagens (AC: #5)
  - [x] 4.1 Adicionar coluna "Midia" na tabela de mensagens agendadas
  - [x] 4.2 Renderizar texto baseado no `media_type` (PDF, Imagem, ou "-")

- [x] Task 5: Testes e validacao final
  - [x] 5.1 `cd admin-panel && npm test` — 639 testes passando
  - [x] 5.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Migration SQL

```sql
BEGIN;

-- Story 8.1: Add media fields to scheduled_messages
ALTER TABLE scheduled_messages ADD COLUMN media_url TEXT;
ALTER TABLE scheduled_messages ADD COLUMN media_type VARCHAR(10)
  CHECK (media_type IN ('pdf', 'image'));
ALTER TABLE scheduled_messages ADD COLUMN media_storage_path TEXT;

-- Relax message_text constraint: allow null when media is present
-- Current: message_text TEXT NOT NULL
-- We need a CHECK constraint instead: at least one of text or media must be present
ALTER TABLE scheduled_messages ALTER COLUMN message_text DROP NOT NULL;
ALTER TABLE scheduled_messages ADD CONSTRAINT chk_text_or_media
  CHECK (message_text IS NOT NULL AND message_text != '' OR media_storage_path IS NOT NULL);

-- Create private bucket for message media
INSERT INTO storage.buckets (id, name, public)
VALUES ('message-media', 'message-media', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can read (for signed URL generation)
CREATE POLICY storage_message_media_auth_select ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'message-media');

-- Policy: service_role can manage files
CREATE POLICY storage_message_media_service_all ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'message-media')
  WITH CHECK (bucket_id = 'message-media');

COMMIT;
```

### Supabase Storage Upload Pattern

Seguir o padrao do Epic 6 (analysis-pdfs). Upload do client-side via Supabase JS:

```typescript
// Upload file to Supabase Storage
const ext = file.name.split('.').pop()?.toLowerCase();
const path = `${groupId}/${crypto.randomUUID()}.${ext}`;
const { error } = await supabase.storage.from('message-media').upload(path, file);
```

Para upload via client-side, precisamos de um Supabase client no browser. Verificar se ja existe instancia client-side no projeto ou se precisamos criar endpoint de upload na API.

**IMPORTANTE:** O admin-panel usa API routes server-side com `createApiHandler`. O upload deve ser feito via API route que recebe o file e faz upload com service_role key, NAO via client-side Supabase.

### Approach: Upload via API Route

Criar `POST /api/messages/upload` que:
1. Recebe o arquivo via FormData
2. Valida tipo e tamanho server-side
3. Faz upload para Supabase Storage com service key
4. Retorna o `media_storage_path`

Depois, o `POST /api/messages` recebe `media_storage_path` e `media_type` como campos normais.

### Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `sql/migrations/038_message_media.sql` | Migration: campos de midia + bucket |
| `admin-panel/src/types/database.ts` | Adicionar campos de midia ao ScheduledMessage |
| `admin-panel/src/app/api/messages/route.ts` | Aceitar campos de midia no POST; incluir no GET |
| `admin-panel/src/app/api/messages/upload/route.ts` | NOVO: endpoint de upload de arquivo |
| `admin-panel/src/components/features/messages/FileUpload.tsx` | NOVO: componente de upload |
| `admin-panel/src/app/(auth)/messages/page.tsx` | Integrar upload e coluna de midia |

### Padroes existentes a seguir

**API route pattern** (de `messages/route.ts`):
```typescript
export const POST = createApiHandler(
  async (req, context) => {
    const body = await req.json();
    // validate, insert, return
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
```

**File upload API pattern** — usar `req.formData()` do Next.js App Router:
```typescript
export const POST = createApiHandler(
  async (req, context) => {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    // validate, upload to storage, return path
  },
  { allowedRoles: ['super_admin', 'group_admin'] },
);
```

**Accepted MIME types:**
- `application/pdf` → media_type: 'pdf'
- `image/jpeg` → media_type: 'image'
- `image/png` → media_type: 'image'

### Constraint: message_text pode ser vazio com midia

Atualmente `message_text TEXT NOT NULL`. A migration precisa relaxar isso, mas garantir que pelo menos um (texto ou midia) esteja presente via CHECK constraint.

### Multi-tenant: Storage isolation

O path `{group_id}/{uuid}.{ext}` garante isolamento logico por grupo no bucket. RLS no Supabase Storage pode ser adicionado se necessario, mas como o upload e feito via service_role, o acesso e controlado pela API.

### Project Structure Notes

- Segue padrao App Router Next.js: `src/app/(auth)/messages/page.tsx`
- Componentes em `src/components/features/messages/`
- API routes em `src/app/api/messages/`
- Tipos em `src/types/database.ts`
- Migrations em `sql/migrations/`
- Bucket storage pattern existente: `036_analysis_storage_bucket.sql`
- Sem conflitos ou variancas detectadas

### References

- [Source: _bmad-output/planning-artifacts/prd.md] FR59 (upload), FR60 (storage)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8] Story 8.1 spec
- [Source: _bmad-output/planning-artifacts/architecture.md] Supabase Storage patterns
- [Source: sql/migrations/034_scheduled_messages.sql] Current schema
- [Source: sql/migrations/036_analysis_storage_bucket.sql] Storage bucket pattern
- [Source: admin-panel/src/app/api/messages/route.ts] Current messages API

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Migration 038 applied to production Supabase
- Upload uses API route with service_role (not client-side Supabase) for security
- Code review fixes: magic bytes validation, orphaned file cleanup, cross-group path validation
- Code review found 5 issues, 4 fixed (1 non-issue: FileUpload reset on form remount)

### File List
- `sql/migrations/038_message_media.sql` — NEW: migration adding media columns + storage bucket
- `admin-panel/src/types/database.ts` — MODIFIED: added MediaType, updated ScheduledMessage
- `admin-panel/src/app/api/messages/route.ts` — MODIFIED: media fields in POST, path validation
- `admin-panel/src/app/api/messages/upload/route.ts` — NEW: upload + cleanup endpoints
- `admin-panel/src/components/features/messages/FileUpload.tsx` — NEW: drag & drop upload component
- `admin-panel/src/app/(auth)/messages/page.tsx` — MODIFIED: FileUpload integration, Midia column
- `admin-panel/src/app/api/__tests__/messages.test.ts` — MODIFIED: 13 tests (3 new media tests)
