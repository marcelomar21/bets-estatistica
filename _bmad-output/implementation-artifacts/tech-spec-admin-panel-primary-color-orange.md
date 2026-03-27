---

## title: 'Trocar cor primária do admin panel para laranja'
slug: 'admin-panel-primary-color-orange'
created: '2026-03-25'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Tailwind CSS v4', 'Next.js 16', 'React 19', 'Vitest 3.2']
files_to_modify:
  - 'src/app/(public)/login/page.tsx'
  - 'src/app/(auth)/bets/page.tsx'
  - 'src/app/(auth)/bots/page.tsx'
  - 'src/app/(auth)/dashboard/page.tsx'
  - 'src/app/(auth)/groups/page.tsx'
  - 'src/app/(auth)/groups/new/page.tsx'
  - 'src/app/(auth)/groups/[groupId]/page.tsx'
  - 'src/app/(auth)/groups/[groupId]/edit/page.tsx'
  - 'src/app/(auth)/groups/[groupId]/leagues/page.tsx'
  - 'src/app/(auth)/members/page.tsx'
  - 'src/app/(auth)/messages/page.tsx'
  - 'src/app/(auth)/postagem/page.tsx'
  - 'src/app/(auth)/admin-users/page.tsx'
  - 'src/app/(auth)/settings/telegram/page.tsx'
  - 'src/app/(auth)/analytics/page.tsx'
  - 'src/app/(auth)/analyses/page.tsx'
  - 'src/app/(auth)/job-executions/page.tsx'
  - 'src/app/(auth)/posting-history/page.tsx'
  - 'src/app/(auth)/onboarding/page.tsx'
  - 'src/app/(auth)/community-settings/page.tsx'
  - 'src/app/(auth)/team-names/page.tsx'
  - 'src/app/(auth)/whatsapp-pool/page.tsx'
  - 'src/components/features/bets/BetStatusBadge.tsx'
  - 'src/components/features/bets/BetFilters.tsx'
  - 'src/components/features/bets/BetStatsBar.tsx'
  - 'src/components/features/bets/BetTable.tsx'
  - 'src/components/features/bets/BetEditDrawer.tsx'
  - 'src/components/features/bets/OddsEditModal.tsx'
  - 'src/components/features/bets/LinkEditModal.tsx'
  - 'src/components/features/bets/DistributeModal.tsx'
  - 'src/components/features/bets/BulkOddsModal.tsx'
  - 'src/components/features/bets/BulkLinksModal.tsx'
  - 'src/components/features/bets/BulkDistributeModal.tsx'
  - 'src/components/features/bets/PostingQueueCard.tsx'
  - 'src/components/features/bots/BotForm.tsx'
  - 'src/components/features/bots/bot-utils.ts'
  - 'src/components/features/groups/GroupForm.tsx'
  - 'src/components/features/groups/GroupEditForm.tsx'
  - 'src/components/features/groups/OnboardingWizard.tsx'
  - 'src/components/features/groups/group-utils.ts'
  - 'src/components/features/members/MemberList.tsx'
  - 'src/components/features/members/CancelMemberModal.tsx'
  - 'src/components/features/members/member-utils.ts'
  - 'src/components/features/messages/MessagePreview.tsx'
  - 'src/components/features/messages/FileUpload.tsx'
  - 'src/components/features/dashboard/GroupSummaryCard.tsx'
  - 'src/components/features/dashboard/GroupAdminDashboard.tsx'
  - 'src/components/features/dashboard/PerformanceCards.tsx'
  - 'src/components/features/dashboard/NotificationsPanel.tsx'
  - 'src/components/features/posting/PostingQueueTable.tsx'
  - 'src/components/features/posting/ResultEditModal.tsx'
  - 'src/components/features/posting/PostingScheduleSection.tsx'
  - 'src/components/features/community/CommunitySettingsForm.tsx'
  - 'src/components/features/community/OnboardingEditor.tsx'
  - 'src/components/features/tone/ToneConfigForm.tsx'
  - 'src/components/features/tone/DynamicInputList.tsx'
  - 'src/components/features/whatsapp-pool/whatsapp-pool-utils.ts'
  - 'src/lib/bet-categories.ts'
  - 'src/components/features/bots/BotCard.test.tsx'
  - 'src/components/features/bets/**tests**/BetComponents.test.tsx'
code_patterns:
  - 'Tailwind inline classes — sem CSS variables ou design tokens'
  - 'Botões primários: bg-blue-600 hover:bg-blue-700 text-white'
  - 'Focus rings: focus:border-blue-500 focus:ring-blue-500'
  - 'Status badges: bg-blue-100 text-blue-800'
  - 'Links/ações: text-blue-600 hover:text-blue-800'
  - 'Loading spinners: border-t-blue-600'
  - 'Info cards: border-blue-200 bg-blue-50 text-blue-800'
  - 'Toggles habilitados: bg-blue-600'
  - 'Disabled buttons: bg-blue-700/60 text-blue-200'
  - 'Checkboxes: text-blue-600'
test_patterns:
  - 'Vitest + @testing-library/react'
  - 'Tests colocados: ComponentName.test.tsx'
  - 'Tests em pasta: **tests**/ComponentName.test.tsx'
  - 'Assertions de classe: expect(el.className).toContain("bg-blue-100")'
  - 'Sem visual regression testing'

# Tech-Spec: Trocar cor primária do admin panel para laranja

**Created:** 2026-03-25

## Overview

### Problem Statement

A cor primária atual do admin panel (blue-600) não reflete a identidade visual desejada. Precisa ser laranja, com consistência em todos os componentes que usam azul como cor de ação/primária.

### Solution

Substituir todas as ocorrências de `blue-`* usadas como cor primária (botões, badges de status, links ativos, focus rings) por `orange-*` equivalente. Manter sidebar (gray-900), header (white), e cores semânticas (green=sucesso, red=erro, amber=warning) inalteradas.

### Scope

**In Scope:**

- Botões primários (blue-600/700 → orange-600/700)
- Badges de status que usam blue como "ativo/em uso"
- Links/estados ativos que usam blue
- Focus rings e hover states em blue
- Loading spinners
- Info cards com blue
- Checkboxes e toggles
- Disabled states
- Testes unitários que assertam classes blue-*

**Out of Scope:**

- Sidebar (mantém gray-900)
- Cores semânticas (green, red, amber, teal)
- Criação de design tokens / CSS variables
- Dark mode

## Context for Development

### Codebase Patterns

- **Framework de cores:** Tailwind CSS v4, sem config file, sem CSS variables — tudo inline
- **Padrão de botão primário:** `bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2`
- **Padrão de focus ring:** `focus:border-blue-500 focus:ring-blue-500` em todos os inputs
- **Padrão de badge:** `bg-blue-100 text-blue-800` para status informacionais (posted, trial, em uso, creating)
- **Padrão de link:** `text-blue-600 hover:text-blue-800` para ações secundárias
- **Padrão de info card:** `border-blue-200 bg-blue-50` com `text-blue-800` ou `text-blue-700`
- **Padrão de spinner:** `border-t-blue-600` para loading indicators
- **Padrão de toggle:** `bg-blue-600` para estado habilitado
- **Padrão de disabled:** `bg-blue-700/60 text-blue-200`
- **Padrão de checkbox:** `text-blue-600` para accent color

### Files to Reference


| File                                                            | Purpose                                     |
| --------------------------------------------------------------- | ------------------------------------------- |
| `src/lib/bet-categories.ts`                                     | Mapeamento de cores por categoria de aposta |
| `src/components/features/bots/bot-utils.ts`                     | Status badges de bots                       |
| `src/components/features/groups/group-utils.ts`                 | Status badges de grupos                     |
| `src/components/features/members/member-utils.ts`               | Status badges de membros                    |
| `src/components/features/whatsapp-pool/whatsapp-pool-utils.ts`  | Status badges do pool WhatsApp              |
| `src/components/features/bets/BetStatusBadge.tsx`               | Badge de status da aposta                   |
| `src/components/features/bots/BotCard.test.tsx`                 | Teste que asserta classes blue              |
| `src/components/features/bets/__tests__/BetComponents.test.tsx` | Teste que asserta classes blue              |


### Technical Decisions

1. **Estratégia A — Mapeamento direto blue → orange (score 8.35/10):** Substituição 1:1 de shade (blue-50→orange-50, blue-100→orange-100, etc.). Venceu sobre alternativas "ajustado" (7.35) e "híbrido" (4.45) por simplicidade de implementação, consistência interna e manutenibilidade.
2. **Amber vs Orange — separação semântica:** Amber continua exclusivo para warnings. Orange é para ações primárias e status. Embora `orange-100` (#ffedd5) e `amber-100` (#fef3c7) sejam visualmente próximos, nunca aparecem lado a lado no mesmo componente — a distinção é semântica (status vs warning), não visual lado-a-lado.
3. **Sem CSS variables:** Manter o padrão atual de inline classes. Mudança é find-and-replace direto `blue-` → `orange-`.
4. **Acessibilidade (WCAG AA):**
   - `orange-600` (#ea580c) em fundo branco = contraste 4.6:1 — passa para texto grande e botões
   - `text-orange-800` (#9a3412) em `bg-orange-100` (#ffedd5) = contraste 7.1:1 — excelente para badges
   - `text-orange-700` (#c2410c) em `bg-orange-50` (#fff7ed) = contraste 5.8:1 — passa para info cards
5. **Convenção para devs futuros:** `orange-100/text-orange-800` = status primário (posted, trial, em uso). `amber-100/text-amber-800` = warning/alerta. Documentar no code review.

## Implementation Plan

### Mapeamento de Substituição

Regra única para todos os arquivos — substituição literal:

| De | Para |
|---|---|
| `blue-50` | `orange-50` |
| `blue-100` | `orange-100` |
| `blue-200` | `orange-200` |
| `blue-300` | `orange-300` |
| `blue-500` | `orange-500` |
| `blue-600` | `orange-600` |
| `blue-700` | `orange-700` |
| `blue-800` | `orange-800` |

Prefixos Tailwind preservados: `bg-`, `text-`, `border-`, `border-t-`, `focus:border-`, `focus:ring-`, `focus-within:border-`, `focus-within:ring-`, `hover:bg-`, `hover:text-`.

### Tasks

#### Task 1: Utility files — color mappings (dependência zero, fazer primeiro)

Estes arquivos definem constantes de cor usadas por componentes. Alterar primeiro garante consistência.

- [ ] Task 1.1: Substituir blue → orange em `src/lib/bet-categories.ts`
  - Linha 20: `'bg-blue-100 text-blue-800'` → `'bg-orange-100 text-orange-800'`

- [ ] Task 1.2: Substituir blue → orange em `src/components/features/bots/bot-utils.ts`
  - Linha 5: `'bg-blue-100 text-blue-800'` → `'bg-orange-100 text-orange-800'`

- [ ] Task 1.3: Substituir blue → orange em `src/components/features/groups/group-utils.ts`
  - Linha 7: `'bg-blue-100 text-blue-800'` → `'bg-orange-100 text-orange-800'`

- [ ] Task 1.4: Substituir blue → orange em `src/components/features/members/member-utils.ts`
  - Linha 13: `'bg-blue-100 text-blue-800'` → `'bg-orange-100 text-orange-800'`

- [ ] Task 1.5: Substituir blue → orange em `src/components/features/whatsapp-pool/whatsapp-pool-utils.ts`
  - Linha 5: `'bg-blue-100 text-blue-800'` → `'bg-orange-100 text-orange-800'`

- [ ] Task 1.6: Substituir blue → orange em `src/components/features/bets/BetStatusBadge.tsx`
  - Linha 10: `'bg-blue-100 text-blue-800'` → `'bg-orange-100 text-orange-800'`

#### Task 2: Componentes de Bets (maior volume — ~12 arquivos)

- [ ] Task 2.1: `src/components/features/bets/BetFilters.tsx` — focus rings, botão search, checkbox accent
- [ ] Task 2.2: `src/components/features/bets/BetStatsBar.tsx` — counter "Postadas"
- [ ] Task 2.3: `src/components/features/bets/BetTable.tsx` — checkboxes, sort indicators, action links, row selection bg
- [ ] Task 2.4: `src/components/features/bets/BetEditDrawer.tsx` — focus rings, botões save, link display, spinner
- [ ] Task 2.5: `src/components/features/bets/OddsEditModal.tsx` — focus ring, botão save
- [ ] Task 2.6: `src/components/features/bets/LinkEditModal.tsx` — focus ring, link preview, botão save
- [ ] Task 2.7: `src/components/features/bets/DistributeModal.tsx` — focus ring, botão distribute
- [ ] Task 2.8: `src/components/features/bets/BulkOddsModal.tsx` — focus ring, botão save
- [ ] Task 2.9: `src/components/features/bets/BulkLinksModal.tsx` — focus ring, link example, botão save
- [ ] Task 2.10: `src/components/features/bets/BulkDistributeModal.tsx` — focus ring
- [ ] Task 2.11: `src/components/features/bets/PostingQueueCard.tsx` — info card, spinner

Action para todas: substituir toda ocorrência de `blue-` por `orange-` no arquivo.

#### Task 3: Componentes de Dashboard (~4 arquivos)

- [ ] Task 3.1: `src/components/features/dashboard/GroupSummaryCard.tsx` — badge Telegram
- [ ] Task 3.2: `src/components/features/dashboard/GroupAdminDashboard.tsx` — botão primário
- [ ] Task 3.3: `src/components/features/dashboard/PerformanceCards.tsx` — link "View Analytics"
- [ ] Task 3.4: `src/components/features/dashboard/NotificationsPanel.tsx` — link "View Details"

#### Task 4: Componentes de Groups (~4 arquivos)

- [ ] Task 4.1: `src/components/features/groups/GroupForm.tsx` — focus rings, botão create
- [ ] Task 4.2: `src/components/features/groups/GroupEditForm.tsx` — focus rings, checkbox, links, botão save
- [ ] Task 4.3: `src/components/features/groups/OnboardingWizard.tsx` — spinner, info card, help link, focus rings, botão next, step indicators

#### Task 5: Componentes de Members, Messages, Posting (~7 arquivos)

- [ ] Task 5.1: `src/components/features/members/MemberList.tsx` — badge canal TG
- [ ] Task 5.2: `src/components/features/members/CancelMemberModal.tsx` — focus ring
- [ ] Task 5.3: `src/components/features/messages/MessagePreview.tsx` — botão send
- [ ] Task 5.4: `src/components/features/messages/FileUpload.tsx` — drag-over state
- [ ] Task 5.5: `src/components/features/posting/PostingQueueTable.tsx` — sort indicator, links, focus ring, action buttons
- [ ] Task 5.6: `src/components/features/posting/ResultEditModal.tsx` — focus rings, botão save
- [ ] Task 5.7: `src/components/features/posting/PostingScheduleSection.tsx` — toggle, focus ring, link, botão confirm

#### Task 6: Componentes de Community, Tone, Bots (~4 arquivos)

- [ ] Task 6.1: `src/components/features/community/CommunitySettingsForm.tsx` — focus rings, botão save
- [ ] Task 6.2: `src/components/features/community/OnboardingEditor.tsx` — focus ring, tags, botão save, disabled states
- [ ] Task 6.3: `src/components/features/tone/ToneConfigForm.tsx` — focus rings, link, spinner, info card, rich text editors, botão save
- [ ] Task 6.4: `src/components/features/tone/DynamicInputList.tsx` — focus rings, link add
- [ ] Task 6.5: `src/components/features/bots/BotForm.tsx` — focus ring, botão add

#### Task 7: Pages (22 arquivos)

- [ ] Task 7.1: `src/app/(public)/login/page.tsx` — focus rings, botão submit, links forgot/back
- [ ] Task 7.2: `src/app/(auth)/bets/page.tsx` — bulk selection bar, botões bulk, spinner
- [ ] Task 7.3: `src/app/(auth)/bots/page.tsx` — botões add, counter "In Use"
- [ ] Task 7.4: `src/app/(auth)/dashboard/page.tsx` — botão retry, focus ring
- [ ] Task 7.5: `src/app/(auth)/groups/page.tsx` — botões create
- [ ] Task 7.6: `src/app/(auth)/groups/new/page.tsx` — link cancel, focus ring, botão create
- [ ] Task 7.7: `src/app/(auth)/groups/[groupId]/page.tsx` — links edit, badge TG, botão post manual
- [ ] Task 7.8: `src/app/(auth)/groups/[groupId]/edit/page.tsx` — links cancel/back
- [ ] Task 7.9: `src/app/(auth)/groups/[groupId]/leagues/page.tsx` — links delete, spinner, toggle, info card, botão save
- [ ] Task 7.10: `src/app/(auth)/members/page.tsx` — botão add, info card, link copy
- [ ] Task 7.11: `src/app/(auth)/messages/page.tsx` — botões send, focus rings, link clear, spinner, link preview
- [ ] Task 7.12: `src/app/(auth)/postagem/page.tsx` — focus rings, spinners, info cards, badges, links edit, botões copy/post/schedule
- [ ] Task 7.13: `src/app/(auth)/admin-users/page.tsx` — botões add/invite/update, focus rings, links revoke/copy
- [ ] Task 7.14: `src/app/(auth)/settings/telegram/page.tsx` — focus rings, botões send/verify, loading text, link resend
- [ ] Task 7.15: `src/app/(auth)/analytics/page.tsx` — focus rings, spinner, botão export, results card
- [ ] Task 7.16: `src/app/(auth)/analyses/page.tsx` — focus rings, spinner, botão export
- [ ] Task 7.17: `src/app/(auth)/job-executions/page.tsx` — checkbox accent
- [ ] Task 7.18: `src/app/(auth)/posting-history/page.tsx` — hit rate text
- [ ] Task 7.19: `src/app/(auth)/onboarding/page.tsx` — focus ring
- [ ] Task 7.20: `src/app/(auth)/community-settings/page.tsx` — focus ring
- [ ] Task 7.21: `src/app/(auth)/team-names/page.tsx` — focus ring, checkbox, edit border, override badge
- [ ] Task 7.22: `src/app/(auth)/whatsapp-pool/page.tsx` — botões add/primary, focus ring, counter, spinners, info card

Action para todas: substituir toda ocorrência de `blue-` por `orange-` no arquivo.

#### Task 8: Testes unitários

- [ ] Task 8.1: `src/components/features/bots/BotCard.test.tsx` — atualizar assertions `bg-blue-100`/`text-blue-800` → `bg-orange-100`/`text-orange-800`
- [ ] Task 8.2: `src/components/features/bets/__tests__/BetComponents.test.tsx` — atualizar assertion `bg-blue-100` → `bg-orange-100`

#### Task 9: Validação

- [ ] Task 9.1: Rodar `npm test` no admin-panel — todos os testes devem passar
- [ ] Task 9.2: Rodar `npm run build` no admin-panel — build deve completar sem erros
- [ ] Task 9.3: Verificar via grep que não restam ocorrências de `blue-` em `admin-panel/src/` (exceto se houver blue usado em contexto não-primário, o que não é o caso)
- [ ] Task 9.4: Teste visual via Playwright MCP — navegar pelas páginas principais (login, dashboard, bets, groups, members) e confirmar que tudo está laranja e consistente

### Acceptance Criteria

- [ ] AC 1: Given o admin panel está rodando, when navego para qualquer página, then todos os botões primários são laranja (`orange-600`) com hover `orange-700`
- [ ] AC 2: Given uma lista de apostas com status "posted", when vejo o badge de status, then ele mostra `bg-orange-100 text-orange-800` em vez de azul
- [ ] AC 3: Given qualquer formulário do admin panel, when clico em um input, then o focus ring é laranja (`orange-500`) em vez de azul
- [ ] AC 4: Given qualquer link de ação (edit, view, cancel), when vejo o link, then ele é `text-orange-600` com hover `text-orange-800`
- [ ] AC 5: Given qualquer loading spinner no admin panel, when está carregando, then o spinner usa `border-t-orange-600`
- [ ] AC 6: Given uma info card (help panel, status card), when é exibida, then usa `bg-orange-50 border-orange-200 text-orange-800`
- [ ] AC 7: Given checkboxes e toggles, when visíveis, then usam `orange-600` como accent color
- [ ] AC 8: Given a sidebar do admin panel, when visível, then continua `bg-gray-900` (inalterada)
- [ ] AC 9: Given badges de warning/alerta, when visíveis, then continuam usando `amber-*` (inalterados)
- [ ] AC 10: Given cores semânticas (sucesso, erro), when visíveis, then green e red continuam inalterados
- [ ] AC 11: Given `npm test` executado, when completa, then todos os testes passam (incluindo os 2 que assertavam classes blue)
- [ ] AC 12: Given `npm run build` executado, when completa, then build sem erros TypeScript
- [ ] AC 13: Given um grep por `blue-` em `admin-panel/src/`, when executado, then retorna 0 ocorrências

## Additional Context

### Dependencies

Nenhuma dependência externa. Tailwind CSS v4 já inclui a palette `orange-*` por padrão.

### Testing Strategy

1. **Testes unitários (automatizado):** Atualizar 2 arquivos de teste que assertam classes `bg-blue-*`. Rodar `npm test` — todos devem passar.
2. **Build check (automatizado):** `npm run build` deve completar sem erros TypeScript.
3. **Grep de verificação (automatizado):** `grep -r "blue-" admin-panel/src/` deve retornar 0 ocorrências.
4. **Teste visual E2E (Playwright MCP):** Navegar pelas 5 páginas mais usadas (login, dashboard, bets, groups, members) e verificar que:
   - Botões são laranja
   - Focus rings são laranja
   - Badges de status são laranja
   - Links de ação são laranja
   - Sidebar continua cinza escuro
   - Alertas continuam amber/red/green

### Notes

- 256 ocorrências de `blue-*` em 61 arquivos — mudança é mecânica (find-and-replace) mas volume alto exige verificação cuidadosa
- Tailwind CSS v4 sem config file — cores inline por componente, sem single source of truth
- Sidebar escura (`gray-900`) NÃO muda
- Cores semânticas (green, red, amber, teal) NÃO mudam
- `orange-100` e `amber-100` são visualmente próximos mas nunca coexistem no mesmo componente — distinção é semântica
- **Dica de implementação:** A substituição pode ser feita via `sed -i '' 's/blue-/orange-/g'` em cada arquivo listado, seguida de verificação manual dos testes e build

