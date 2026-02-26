# Story 8.2: Preview de Mensagem Agendada

Status: ready-for-dev

## Story

As a **Super Admin ou Group Admin**,
I want pre-visualizar como a mensagem ficara antes de confirmar o envio,
So that eu possa verificar formatacao e conteudo antes de enviar para o grupo.

## Acceptance Criteria

1. **Given** operador preencheu o formulario de mensagem (texto e/ou midia)
   **When** clica no botao "Preview"
   **Then** exibe modal de preview mostrando texto formatado com Telegram Markdown renderizado (FR62)

2. **Given** midia e imagem (JPG/PNG)
   **When** preview e exibido
   **Then** exibe a imagem no preview com dimensoes proporcionais

3. **Given** midia e PDF
   **When** preview e exibido
   **Then** exibe icone de PDF com nome do arquivo e tamanho

4. **Given** preview esta aberto
   **When** operador verifica o conteudo
   **Then** preview inclui indicacao do grupo destino e horario agendado

5. **Given** preview esta aberto
   **When** operador clica "Editar"
   **Then** modal fecha e volta ao form com dados preservados
   **And** quando clica "Confirmar e Agendar" no preview, faz upload + POST e agenda a mensagem

6. **Given** operador esta na tabela de mensagens agendadas
   **When** clica numa mensagem agendada com midia
   **Then** pode ver o preview da midia (imagem inline ou link para PDF)

## Tasks / Subtasks

- [ ] Task 1: Componente PreviewModal (AC: #1, #2, #3, #4)
  - [ ] 1.1 Criar `components/features/messages/MessagePreview.tsx` com modal overlay
  - [ ] 1.2 Renderizar texto com formatacao Markdown basica (bold, italic, code)
  - [ ] 1.3 Se imagem: exibir `<img>` com max-width/max-height proporcionais
  - [ ] 1.4 Se PDF: exibir bloco com icone PDF, nome e tamanho do arquivo
  - [ ] 1.5 Exibir grupo destino e data/hora agendada no header do preview

- [ ] Task 2: Integrar Preview no formulario (AC: #5)
  - [ ] 2.1 Adicionar botao "Preview" no form (ao lado de "Agendar")
  - [ ] 2.2 Ao clicar Preview: validar form, abrir modal com dados preenchidos
  - [ ] 2.3 Botao "Editar" no modal: fecha modal, preserva dados do form
  - [ ] 2.4 Botao "Confirmar e Agendar" no modal: executa upload + POST (mesmo fluxo do handleSubmit)

- [ ] Task 3: Preview de midia na tabela (AC: #6)
  - [ ] 3.1 Criar endpoint `GET /api/messages/[id]/media` que retorna signed URL (60s) do Supabase Storage
  - [ ] 3.2 Na tabela, ao clicar na coluna Midia de uma mensagem com midia: abrir preview
  - [ ] 3.3 Imagem: exibir em modal; PDF: abrir signed URL em nova aba

- [ ] Task 4: Testes e validacao final
  - [ ] 4.1 `cd admin-panel && npm test` — todos os testes passando
  - [ ] 4.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### Markdown Rendering

Para renderizar Telegram Markdown no preview, implementar parsing basico:
- `*bold*` → `<strong>bold</strong>`
- `_italic_` → `<em>italic</em>`
- `` `code` `` → `<code>code</code>`
- No need for full Telegram parse_mode — just visual approximation

### Signed URL Pattern

Seguir o padrao do Epic 6 (analyses):
```typescript
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
const { data } = await supabaseAdmin.storage
  .from('message-media')
  .createSignedUrl(storagePath, 60); // 60 seconds
```

### Image Preview

Para imagens, usar `<img>` com `object-fit: contain` e max dimensions:
```tsx
<img src={signedUrl} alt={fileName} className="max-w-full max-h-96 object-contain" />
```

### Arquivos a modificar

| Arquivo | Mudanca |
|---------|---------|
| `admin-panel/src/components/features/messages/MessagePreview.tsx` | NOVO: modal de preview |
| `admin-panel/src/app/(auth)/messages/page.tsx` | Integrar botao Preview e modal |
| `admin-panel/src/app/api/messages/[id]/media/route.ts` | NOVO: endpoint signed URL |

### Padroes existentes a seguir

- Modal pattern: usar div overlay com backdrop blur (similar ao toast pattern)
- Signed URL pattern: seguir `analyses/[id]/pdf/route.ts`
- API handler pattern: `createApiHandler` com roles

### References

- [Source: _bmad-output/planning-artifacts/prd.md] FR62 (preview)
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8] Story 8.2 spec
- [Source: admin-panel/src/app/(auth)/analyses/page.tsx] PDF preview pattern

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
