# Code Style

## Admin Panel (TypeScript / React / Next.js App Router)

- Functional components only, no classes
- Named exports: `export function ComponentName()` (not default)
- Props interfaces: `ComponentNameProps`
- `'use client'` directive for client components
- Tailwind classes directly in JSX, no CSS modules
- Absolute imports with `@/` alias: `import { x } from '@/lib/...'`
- Type-only imports: `import type { T } from '@/types/...'`

```tsx
'use client';

interface StatCardProps {
  title: string;
  value: number;
}

export function StatCard({ title, value }: StatCardProps) {
  return <div className="rounded-lg bg-white p-4 shadow">{title}: {value}</div>;
}
```

## Bot (JavaScript / CommonJS)

- CommonJS modules: `require()` / `module.exports`
- JSDoc for all public functions with `@param` and `@returns`
- Response pattern: `{ success: boolean, data?, error?: { code, message } }`
- Logger via `require('../lib/logger')` — never `console.log`
- Config via `require('../lib/config').config` — never hardcode values
- snake_case for DB columns, camelCase for JS variables

```js
const { config } = require('../lib/config');
const logger = require('../lib/logger');

/**
 * Fetch eligible bets for posting
 * @param {number} limit
 * @returns {Promise<{success: boolean, data?: Array, error?: object}>}
 */
async function getEligibleBets(limit = 10) {
  // ...
}

module.exports = { getEligibleBets };
```

## Shared Conventions

- Error codes: `VALIDATION_ERROR`, `DB_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`
- Never hardcode LLM models — use `config.llm.heavyModel` / `config.llm.lightModel`
- Never hardcode Supabase URLs or keys — use `config.supabase.*`
