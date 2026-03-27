# Testing Rules

## Admin Panel — Vitest + React Testing Library

- Framework: `vitest` (not Jest)
- Run: `cd admin-panel && npm test`
- Mocking: `vi.mock()`, `vi.fn()` — never `jest.mock()`
- Test files colocated: `Component.test.tsx` next to `Component.tsx`
- API tests in: `src/app/api/__tests__/`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/supabase-server', () => ({
  createClient: vi.fn(),
}));

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName prop="value" />);
    expect(screen.getByText('value')).toBeInTheDocument();
  });
});
```

## Bot — Jest

- Framework: `jest` (not vitest)
- Run: `cd bot && npm test`
- Mocking: `jest.mock()`, `jest.fn()`
- Test files in: `services/__tests__/`, `handlers/__tests__/`

```js
jest.mock('../../../lib/supabase', () => {
  const mockChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() };
  return { supabase: { from: jest.fn(() => mockChain) } };
});
```

## Supabase Mock Pattern (Vitest)

Chain mocks for Supabase query builder:

```ts
const mockFrom = vi.fn(() => ({
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
}));
```

## E2E — Playwright MCP (OBRIGATORIO)

- **SEMPRE** rodar E2E via Playwright antes de commitar — nao e opcional
- Garantir dev server rodando (`npm run dev` no admin-panel)
- Navegar ate a pagina afetada e executar o fluxo completo
- Validar o resultado final, nao apenas acoes intermediarias
- Se o fluxo toca Telegram, verificar que a mensagem chegou

## General Rules

- Tests must pass before any PR: `npm test` + `npm run build` + **E2E Playwright**
- Never skip E2E validation — it catches real integration bugs that unit tests miss
- Test the result, not the implementation
- After retriggering CI, always monitor until completion and report the result
