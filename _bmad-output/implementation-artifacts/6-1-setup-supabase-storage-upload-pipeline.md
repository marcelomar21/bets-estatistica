# Story 6.1: Setup Supabase Storage e Upload no Pipeline

Status: done

## Story

As a **sistema**,
I want armazenar PDFs de análise no Supabase Storage automaticamente após geração,
So that as análises fiquem disponíveis de forma segura para consulta no painel admin.

## Acceptance Criteria

1. **Given** a migration 035 é executada
   **When** aplicada no banco
   **Then** adiciona colunas `pdf_storage_path` (TEXT) e `pdf_uploaded_at` (TIMESTAMPTZ) à tabela `game_analysis`

2. **Given** a migration 036 é executada
   **When** aplicada no banco
   **Then** cria bucket `analysis-pdfs` no Supabase Storage com acesso privado (NFR-S3)
   **And** configura storage policies: apenas service_role pode fazer upload; leitura via signed URLs apenas

3. **Given** o pipeline de análise gera um PDF com sucesso
   **When** `agent/persistence/saveOutputs.js` processa o resultado
   **Then** faz upload do PDF para `analysis-pdfs/{match_id}/{filename}.pdf` (P1)
   **And** atualiza `game_analysis` com `pdf_storage_path` e `pdf_uploaded_at = NOW()` (FR29)
   **And** usa `upsert: true` para sobrescrever se já existe

4. **Given** o upload do PDF falha por erro temporário (timeout, rede)
   **When** a falha é detectada
   **Then** faz retry até 3 tentativas com backoff (NFR-R4)
   **And** se todas falharem, registra erro no log
   **And** a falha de upload NÃO bloqueia o restante do pipeline (NFR-R4)

5. **Given** o upload é bem-sucedido
   **When** o registro é atualizado
   **Then** `pdf_storage_path` contém o path relativo no bucket (ex: `12345/analysis-2026-02-25.pdf`)
   **And** o path é compatível com `createSignedUrl` do Supabase Storage API v2 (NFR-I1)

## Tasks / Subtasks

- [ ] Task 1: Criar migration 035_game_analysis_pdf.sql (AC: #1)
  - [ ] 1.1 ALTER TABLE game_analysis ADD COLUMN pdf_storage_path TEXT
  - [ ] 1.2 ALTER TABLE game_analysis ADD COLUMN pdf_uploaded_at TIMESTAMPTZ
  - [ ] 1.3 Aplicar migration via Supabase Management API (project xsiaifqlbrpagnhmlpmm)

- [ ] Task 2: Criar migration 036_analysis_storage_bucket.sql (AC: #2)
  - [ ] 2.1 INSERT INTO storage.buckets (analysis-pdfs, private)
  - [ ] 2.2 CREATE POLICY: service_role can insert/update/delete
  - [ ] 2.3 CREATE POLICY: authenticated users can select (for signed URLs)
  - [ ] 2.4 Aplicar migration via Supabase Management API

- [ ] Task 3: Criar agent/persistence/storageUpload.js (AC: #3, #4, #5)
  - [ ] 3.1 Importar supabase client com service_role key
  - [ ] 3.2 Funcao uploadPdfToStorage(matchId, pdfBuffer, filename)
  - [ ] 3.3 Upload via supabase.storage.from('analysis-pdfs').upload(path, buffer, { upsert: true })
  - [ ] 3.4 Retry logic: 3 tentativas com exponential backoff (1s, 2s, 4s)
  - [ ] 3.5 Return { success, storagePath } ou { success: false, error }

- [ ] Task 4: Integrar upload no saveOutputs.js (AC: #3, #4)
  - [ ] 4.1 Após persistInDatabase, chamar generateReportForMatch para obter pdfBuffer
  - [ ] 4.2 Chamar uploadPdfToStorage com o buffer
  - [ ] 4.3 Se upload bem-sucedido, UPDATE game_analysis SET pdf_storage_path, pdf_uploaded_at
  - [ ] 4.4 Se upload falhar, apenas logar erro (nao bloquear pipeline)

- [ ] Task 5: Adicionar tipos GameAnalysis ao database.ts
  - [ ] 5.1 Interface GameAnalysis com todos os campos incluindo pdf_storage_path e pdf_uploaded_at

- [ ] Task 6: Validacao completa
  - [ ] 6.1 `cd admin-panel && npm test` — todos os testes passam
  - [ ] 6.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Migration numbering

034 foi usado por scheduled_messages (Epic 5). Proximo: **035** e **036**.

### Pipeline architecture

O pipeline usa `pg` Pool direto (NOT Supabase client):
- `agent/db.js` — PostgreSQL pool via `pg` package
- `agent/persistence/saveOutputs.js` — persiste no banco via pool.connect()
- `agent/persistence/reportService.js` — gera PDF buffer via `html-pdf-node`

Para o Supabase Storage, precisamos do Supabase JS client com service_role key. O `lib/supabase.js` ja existe no projeto e exporta `{ supabase }` com service key.

### reportService.js — PDF buffer

```javascript
const generatePdfFromHtml = async (html) => {
  const file = { content: html };
  const pdfBuffer = await htmlPdfNode.generatePdf(file, PDF_OPTIONS);
  return pdfBuffer; // Buffer
};
```

`generateReportForMatch({ matchId, payload })` gera o HTML a partir do payload e retorna `{ htmlPath, pdfPath }`. Para o upload, precisamos obter o buffer diretamente (antes de salvar em disco) ou ler do disco depois. A abordagem mais limpa e gerar o buffer e fazer upload dele.

### Storage path convention

```
analysis-pdfs/{match_id}/analysis-{YYYY-MM-DD}.pdf
```

Exemplo: `analysis-pdfs/12345/analysis-2026-02-25.pdf`

### Upload com retry

```javascript
async function uploadWithRetry(supabase, bucket, path, buffer, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true });

    if (!error) return { success: true, data };

    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return { success: false, error: 'Max retries exceeded' };
}
```

### Bucket policies

```sql
-- Create private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('analysis-pdfs', 'analysis-pdfs', false);

-- service_role can manage files
CREATE POLICY storage_analysis_service_role ON storage.objects
  FOR ALL USING (bucket_id = 'analysis-pdfs')
  WITH CHECK (bucket_id = 'analysis-pdfs');

-- authenticated users can read (for signed URLs)
CREATE POLICY storage_analysis_auth_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'analysis-pdfs'
    AND auth.role() = 'authenticated'
  );
```

### Existing Files (context)

| File | Purpose |
|------|---------|
| `agent/persistence/saveOutputs.js` | Pipeline persistence (MODIFY) |
| `agent/persistence/reportService.js` | PDF generation (READ for buffer) |
| `agent/persistence/reportUtils.js` | Paths and payload loading |
| `lib/supabase.js` | Supabase client with service_role key |
| `sql/agent_schema.sql` | Current game_analysis schema |
| `sql/migrations/034_scheduled_messages.sql` | Latest migration |
| `admin-panel/src/types/database.ts` | Types (add GameAnalysis) |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1] — AC
- [Source: _bmad-output/planning-artifacts/architecture.md#P1] — Storage pattern
- [Source: _bmad-output/planning-artifacts/architecture.md#D3] — PDF via signed URLs
- [Source: agent/persistence/reportService.js] — PDF generation
- [Source: agent/persistence/saveOutputs.js] — Pipeline persistence

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Completion Notes List
- Task 1: Migration 035 — added pdf_storage_path and pdf_uploaded_at columns to game_analysis
- Task 2: Migration 036 — created analysis-pdfs private bucket with RLS policies
- Task 3: Created storageUpload.js with 3-attempt retry and exponential backoff
- Task 4: Integrated PDF generation + upload into saveOutputs.js (non-blocking on failure)
- Task 5: Added GameAnalysis and GameAnalysisListItem types to database.ts
- Task 6: 533 admin-panel tests pass, build OK

### File List
- sql/migrations/035_game_analysis_pdf.sql (NEW — ALTER TABLE add PDF columns)
- sql/migrations/036_analysis_storage_bucket.sql (NEW — bucket + policies)
- agent/persistence/storageUpload.js (NEW — upload with retry)
- agent/persistence/saveOutputs.js (MODIFIED — integrated PDF upload after persist)
- admin-panel/src/types/database.ts (MODIFIED — GameAnalysis types)
- _bmad-output/implementation-artifacts/sprint-status.yaml (MODIFIED — v2 status)
