---
title: 'Ajustes UI — Admin sem expiração e links de convite'
slug: 'admin-members-links-cleanup'
created: '2026-03-16'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'React 19', 'TypeScript 5', 'Tailwind CSS 4', 'Vitest 3.2', 'React Testing Library']
files_to_modify:
  - 'admin-panel/src/components/features/members/member-utils.ts'
  - 'admin-panel/src/components/features/members/member-utils.test.ts'
  - 'admin-panel/src/components/features/members/MemberList.tsx'
  - 'admin-panel/src/components/features/members/MemberList.test.tsx'
  - 'admin-panel/src/app/(auth)/members/page.tsx'
  - 'admin-panel/src/app/(auth)/members/page.test.tsx'
  - 'admin-panel/src/components/features/groups/GroupCard.tsx'
  - 'admin-panel/src/components/features/groups/GroupCard.test.tsx'
code_patterns:
  - 'Service response: { success: true, data } / { success: false, error }'
  - 'Copy-to-clipboard: navigator.clipboard.writeText() + 2s "Copiado!" feedback (GroupCard pattern)'
  - 'Status badges via memberStatusConfig map (label + Tailwind classes)'
  - 'getDisplayStatus() accepts Pick<Member, status | subscription_ends_at>'
  - 'Groups data with bot_pool already fetched in members page via /api/groups'
test_patterns:
  - 'Vitest + React Testing Library (render, screen, waitFor, userEvent)'
  - 'vi.useFakeTimers() + vi.setSystemTime() for date-dependent tests'
  - 'Fixture data at test scope (baseMembers, baseGroup)'
  - 'vi.mock(next/navigation) for router mocking'
  - 'vi.spyOn(global, fetch) for API mocking'
---

# Tech-Spec: Ajustes UI — Admin sem expiração e links de convite

**Created:** 2026-03-16

## Overview

### Problem Statement

1. Membros com `is_admin=true` mostram datas de expiração e status "Vencendo"/"Expirado" irrelevantes — admins não têm assinatura paga e não devem ter prazo.
2. O link de convite do bot (usado para novos membros assinarem) não aparece na aba de membros, obrigando o admin a navegar até a página de grupos para copiar.
3. O botão "Grupo Telegram" (link direto do grupo) aparece no GroupCard e na página de detalhes, expondo o link direto do grupo desnecessariamente — o fluxo correto é via bot.

### Solution

- Ignorar `subscription_ends_at` para membros admin no cálculo de status e na exibição da coluna "Vencimento".
- Adicionar um card/banner no topo da página de membros com o link do bot e botão de copiar.
- Remover o botão "Grupo Telegram" do GroupCard e da página de detalhes do grupo.

### Scope

**In Scope:**
- Esconder coluna "Vencimento" para membros `is_admin=true` (mostrar "-")
- Impedir cálculo de status "Vencendo"/"Expirado" para admins em `member-utils.ts`
- Adicionar card com link do bot + botão copiar no topo da página de membros
- Remover botão "Grupo Telegram" do `GroupCard.tsx`
- Remover link direto do grupo da página de detalhes (`/groups/[groupId]`)

**Out of Scope:**
- Alterações no banco de dados (schema, migrations)
- Mudanças no backend/API routes
- WhatsApp invite link management
- Alterações em outros fluxos de membros (cancelamento, reativação, etc.)

## Context for Development

### Codebase Patterns

- **Status calculation:** `getDisplayStatus()` em `member-utils.ts` aceita `Pick<Member, 'status' | 'subscription_ends_at'>` — precisa aceitar `is_admin` também.
- **Copy-to-clipboard:** `GroupCard.tsx` já implementa o padrão `navigator.clipboard.writeText()` com state toggle "Copiado!" por 2s. Reutilizar mesmo padrão na página de membros.
- **Badge de admin:** `MemberList.tsx` já renderiza badge roxo "Admin" quando `member.is_admin === true`.
- **Groups data no members page:** A página de membros já busca `/api/groups` para popular o dropdown de filtro. O response inclui `bot_pool[0].bot_username`. Para `group_admin`, retorna apenas seu grupo.
- **Bot invite link format:** `https://t.me/{botUsername}?start=subscribe` (construído dinamicamente a partir de `bot_pool`).

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `admin-panel/src/components/features/members/member-utils.ts` | `getDisplayStatus()` + `memberStatusConfig` — adicionar check `is_admin` |
| `admin-panel/src/components/features/members/member-utils.test.ts` | 5 testes existentes — adicionar caso admin |
| `admin-panel/src/components/features/members/MemberList.tsx` | Tabela de membros — esconder Vencimento para admins |
| `admin-panel/src/components/features/members/MemberList.test.tsx` | 5 testes — adicionar caso admin vencimento |
| `admin-panel/src/app/(auth)/members/page.tsx` | Página de membros — adicionar card com link do bot |
| `admin-panel/src/app/(auth)/members/page.test.tsx` | 11 testes — adicionar teste do card de link |
| `admin-panel/src/components/features/groups/GroupCard.tsx` | Card de grupo — remover botão "Grupo Telegram" |
| `admin-panel/src/components/features/groups/GroupCard.test.tsx` | 5 testes — ajustar se testa link do grupo |

### Technical Decisions

- **`getDisplayStatus` input type:** Expandir de `Pick<Member, 'status' | 'subscription_ends_at'>` para incluir `is_admin`. Se `is_admin === true`, retornar `member.status` diretamente (bypass do cálculo de expiração).
- **Bot link na página de membros:** Usar dados de `groups` já disponíveis no state. Para `group_admin` (1 grupo), mostrar sempre. Para `super_admin`, mostrar quando um grupo está selecionado no filtro. Sem grupo selecionado, não mostrar (ambíguo qual link exibir).
- **Remoção do link do grupo:** Remover o `<a>` "Grupo Telegram" do `GroupCard.tsx`. A página de detalhes (`/groups/[groupId]`) NÃO busca `telegram_invite_link` na query, então já não mostra — nada a fazer lá.

## Implementation Plan

### Tasks

#### Task 1: Admins bypass expiração no cálculo de status

- [x] **1.1** Atualizar `getDisplayStatus()` em `member-utils.ts`
  - File: `admin-panel/src/components/features/members/member-utils.ts`
  - Action: Expandir `DisplayStatusInput` de `Pick<Member, 'status' | 'subscription_ends_at'>` para `Pick<Member, 'status' | 'subscription_ends_at' | 'is_admin'>`
  - Action: Adicionar early return no início de `getDisplayStatus()`: se `member.is_admin === true`, retornar `member.status` diretamente (sem calcular vencendo/expirado)
  - Notes: Manter backward-compatible — `is_admin` pode ser opcional (`is_admin?: boolean`) para não quebrar chamadas existentes

- [x] **1.2** Adicionar testes para admin em `member-utils.test.ts`
  - File: `admin-panel/src/components/features/members/member-utils.test.ts`
  - Action: Adicionar teste: admin com `subscription_ends_at` expirado deve retornar `'ativo'` (não `'expirado'`)
  - Action: Adicionar teste: admin com `subscription_ends_at` em 3 dias deve retornar `'ativo'` (não `'vencendo'`)
  - Notes: Seguir padrão existente com `vi.useFakeTimers()`

#### Task 2: Esconder "Vencimento" para admins na tabela

- [x] **2.1** Atualizar coluna "Vencimento" em `MemberList.tsx`
  - File: `admin-panel/src/components/features/members/MemberList.tsx`
  - Action: Na célula da coluna "Vencimento", adicionar condição: se `member.is_admin === true`, renderizar `'-'` em vez de `formatDate(member.subscription_ends_at)`
  - Notes: Manter o `'-'` existente para `subscription_ends_at === null`

- [x] **2.2** Adicionar teste em `MemberList.test.tsx`
  - File: `admin-panel/src/components/features/members/MemberList.test.tsx`
  - Action: Adicionar teste: membro admin com `subscription_ends_at` preenchido deve exibir `'-'` na coluna Vencimento
  - Notes: Usar fixture `baseMembers` com `is_admin: true`

#### Task 3: Card com link do bot na página de membros

- [x] **3.1** Adicionar card de convite em `page.tsx`
  - File: `admin-panel/src/app/(auth)/members/page.tsx`
  - Action: Criar state `copied` (`useState(false)`) para feedback do botão copiar
  - Action: Derivar `botInviteLink` a partir dos groups data: para `group_admin` (1 grupo), usar `groups[0]?.bot_pool?.[0]?.bot_username`; para `super_admin` com grupo selecionado, buscar no array `groups` pelo `selectedGroupId`
  - Action: Renderizar card entre os filtros e a tabela (antes do `{error && ...}`):
    ```
    Se botInviteLink existir:
    <div> card com fundo azul claro, flex row, ícone link + texto do link + botão "Copiar"/"Copiado!" </div>
    ```
  - Action: Handler `copyBotLink`: `navigator.clipboard.writeText(botInviteLink)`, set `copied(true)`, `setTimeout(() => copied(false), 2000)`
  - Notes: Seguir exatamente o padrão visual do `GroupCard.tsx` (cores, tamanhos, feedback). Card deve ter `rounded-lg border border-blue-200 bg-blue-50 p-3`

- [x] **3.2** Adicionar testes em `page.test.tsx`
  - File: `admin-panel/src/app/(auth)/members/page.test.tsx`
  - Action: Adicionar teste: `group_admin` com bot configurado deve exibir link do bot
  - Action: Adicionar teste: `super_admin` sem grupo selecionado não deve exibir link do bot
  - Action: Adicionar teste: `super_admin` com grupo selecionado deve exibir link do bot
  - Notes: Ajustar mock de `/api/groups` para incluir `bot_pool` nos fixtures

#### Task 4: Remover botão "Grupo Telegram" do GroupCard

- [x] **4.1** Remover link do grupo em `GroupCard.tsx`
  - File: `admin-panel/src/components/features/groups/GroupCard.tsx`
  - Action: Remover a variável `groupInviteLink` (`const groupInviteLink = group.telegram_invite_link`)
  - Action: Remover o bloco JSX `{groupInviteLink && (<a ...>Grupo Telegram</a>)}`
  - Action: Ajustar a condição do container: de `{(botInviteLink || groupInviteLink) && ...}` para `{botInviteLink && ...}`
  - Notes: Manter intacto o botão do bot (`@username`). Remover `telegram_invite_link` do tipo se não for mais usado no componente

- [x] **4.2** Atualizar testes em `GroupCard.test.tsx`
  - File: `admin-panel/src/components/features/groups/GroupCard.test.tsx`
  - Action: Remover qualquer assertion que teste "Grupo Telegram" no card
  - Action: Garantir que testes do bot link continuam passando
  - Notes: Se não existem testes específicos para "Grupo Telegram", apenas verificar que nenhum teste quebrou

### Acceptance Criteria

- [x] **AC 1:** Given um membro com `is_admin=true` e `status='ativo'` e `subscription_ends_at` expirado, when a tabela de membros renderiza, then o status exibido é "Ativo" (não "Expirado") e a coluna Vencimento mostra "-"
- [x] **AC 2:** Given um membro com `is_admin=true` e `status='ativo'` e `subscription_ends_at` em 3 dias, when a tabela renderiza, then o status é "Ativo" (não "Vencendo") e Vencimento mostra "-"
- [x] **AC 3:** Given um membro regular (não admin) com `subscription_ends_at` em 3 dias, when a tabela renderiza, then o status é "Vencendo" e Vencimento mostra a data formatada (comportamento inalterado)
- [x] **AC 4:** Given um `group_admin` logado com bot configurado no grupo, when acessa a página de membros, then vê um card com o link `https://t.me/{bot}?start=subscribe` e botão "Copiar"
- [x] **AC 5:** Given o admin clica no botão "Copiar" do link do bot, when o clique é processado, then o link é copiado para o clipboard e o botão muda para "Copiado!" por 2 segundos
- [x] **AC 6:** Given um `super_admin` sem grupo selecionado no filtro, when acessa a página de membros, then o card de link do bot NÃO é exibido
- [x] **AC 7:** Given um `super_admin` com grupo selecionado no filtro, when o grupo tem bot configurado, then o card de link do bot é exibido com o link correto
- [x] **AC 8:** Given a página de listagem de grupos, when o GroupCard renderiza, then NÃO exibe o botão "Grupo Telegram" (apenas o botão do bot)
- [x] **AC 9:** Given todos os testes existentes (`npm test`), when rodados após as mudanças, then passam sem regressões

## Additional Context

### Dependencies

- Nenhuma dependência externa nova. Todas as bibliotecas necessárias já estão no projeto.
- Dados de `bot_pool` já disponíveis via `/api/groups` — nenhuma mudança no backend necessária.

### Testing Strategy

**Testes unitários (Vitest):**
- `member-utils.test.ts`: 2 novos testes (admin bypass expirado, admin bypass vencendo)
- `MemberList.test.tsx`: 1 novo teste (admin mostra "-" no Vencimento)
- `page.test.tsx`: 3 novos testes (group_admin vê link, super_admin sem grupo não vê, super_admin com grupo vê)
- `GroupCard.test.tsx`: ajustar testes existentes se necessário

**Validação manual (Playwright E2E):**
1. Login como `super@admin.test`
2. Navegar para `/members` — verificar que admins não mostram "Vencendo"/"Expirado"
3. Selecionar um grupo no filtro — verificar que card de link aparece
4. Clicar "Copiar" — verificar clipboard
5. Navegar para `/groups` — verificar que GroupCard não tem "Grupo Telegram"
6. Clicar no grupo — verificar que detalhes não mostram link direto

### Notes

- A página de detalhes do grupo (`/groups/[groupId]`) já NÃO busca `telegram_invite_link` na query Supabase, então já não mostra o link direto. Nenhuma alteração necessária.
- O campo `telegram_invite_link` continua no banco e no type `Group`/`GroupListItem` — pode ser útil futuramente. Não remover do schema.
- O `GroupListItem` type em `database.ts` inclui `telegram_invite_link` — poderia ser removido do Pick, mas é baixo risco deixar (não afeta funcionalidade).

## Review Notes
- Adversarial review completed
- Findings: 9 total, 9 addressed (6 real fixes, 3 noise acknowledged with comments)
- Resolution approach: auto-fix all
- Key fixes applied: clipboard error handling with try/catch, setTimeout cleanup via useRef, added tests for admin cancelled/removido edge cases, clipboard copy test, role added to useEffect deps
