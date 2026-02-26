# Story 6.3: Página de Análises no Admin Panel

Status: done

## Story

As a **admin (Super ou Group)**,
I want uma página no painel para consultar análises por jogo e abrir os PDFs,
So that eu possa acessar as análises completas que sustentam as apostas recomendadas.

## Acceptance Criteria

1. **Given** admin acessa a página `/analyses` no painel
   **When** a página carrega
   **Then** vê lista de análises por jogo com: times, data, indicação se PDF está disponível (FR30, FR31)
   **And** análises ordenadas por data (mais recente primeiro)
   **And** carrega em < 2 segundos (NFR-P3)

2. **Given** admin quer filtrar análises
   **When** usa filtros de data ou time
   **Then** a lista é atualizada com os resultados filtrados (FR34)

3. **Given** admin clica em uma análise que tem PDF disponível
   **When** o clique é processado
   **Then** chama `GET /api/analyses/[id]/pdf` para obter signed URL (FR32)
   **And** abre o PDF em nova aba do navegador via `window.open()` (D3)

4. **Given** admin clica em uma análise sem PDF disponível
   **When** o clique é processado
   **Then** mostra indicação de que o PDF ainda não está disponível
   **And** NÃO tenta gerar signed URL

5. **Given** Super Admin acessa `/analyses`
   **When** a página carrega
   **Then** vê análises de todos os grupos

6. **Given** Group Admin acessa `/analyses`
   **When** a página carrega
   **Then** vê apenas análises dos jogos relacionados ao seu grupo (NFR-S5)

7. **Given** link para `/analyses` na sidebar do admin panel
   **When** admin navega
   **Then** o link está visível e acessível

## Tasks / Subtasks

- [ ] Task 1: Criar página `/analyses` (AC: #1, #5, #6)
  - [ ] 1.1 Criar `admin-panel/src/app/(auth)/analyses/page.tsx`
  - [ ] 1.2 Fetch `GET /api/analyses` com loading/error states
  - [ ] 1.3 Exibir tabela com times, data kickoff, status PDF

- [ ] Task 2: Filtros de data e time (AC: #2)
  - [ ] 2.1 Input de data (date picker) → param `?date=`
  - [ ] 2.2 Input de time (text) → param `?team=`
  - [ ] 2.3 Refetch ao alterar filtros

- [ ] Task 3: Abrir PDF via signed URL (AC: #3, #4)
  - [ ] 3.1 Botão "Ver PDF" habilitado apenas quando pdf_storage_path presente
  - [ ] 3.2 onClick: fetch `GET /api/analyses/[id]/pdf`, window.open(url)
  - [ ] 3.3 Indicação visual (badge) de "Sem PDF" quando não disponível

- [ ] Task 4: Adicionar link na sidebar (AC: #7)
  - [ ] 4.1 Adicionar item "Análises" no array `navigation` em Sidebar.tsx

- [ ] Task 5: Testes e validação
  - [ ] 5.1 `cd admin-panel && npm test` — todos passam
  - [ ] 5.2 `cd admin-panel && npm run build` — TypeScript strict OK

## Dev Notes

### API endpoints (from Story 6-2)

- `GET /api/analyses` — list analyses, supports `?date=` and `?team=` filters
- `GET /api/analyses/[id]/pdf` — returns `{ url, expiresAt }` signed URL

### Existing patterns

- Follow `/bets/page.tsx` pattern but simpler (no pagination, no modals, no selection)
- Use inline components (no need for separate component files for a simple table)
- Toast for errors when PDF URL generation fails

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#D3] — PDF viewer decision (window.open)
