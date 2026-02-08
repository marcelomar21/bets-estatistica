import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Enforcement test: Verifies that ALL API Routes in src/app/api/ use
 * createApiHandler() OR createPublicHandler(). Any route that exports
 * GET, POST, PUT, PATCH, DELETE without using one of the wrappers is
 * a SECURITY FAILURE.
 *
 * Checks per-export line (not just file-level import) to catch cases where
 * a wrapper is imported but raw handlers are also exported alongside.
 */

const API_DIR = join(__dirname, '../../app/api');

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (entry === '__tests__' || entry === '__mocks__') continue;
        results.push(...findRouteFiles(fullPath));
      } else if (entry === 'route.ts' || entry === 'route.tsx') {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return results;
}

describe('API Route Enforcement', () => {
  it('every exported handler must use createApiHandler or createPublicHandler', () => {
    const routeFiles = findRouteFiles(API_DIR);
    const violations: string[] = [];

    for (const file of routeFiles) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const exportMatch = line.match(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/);
        if (exportMatch) {
          const method = exportMatch[1];
          if (!/(?:createApiHandler|createPublicHandler)\s*\(/.test(line)) {
            const relativePath = file.replace(join(__dirname, '../../../'), '');
            violations.push(
              `${relativePath}: export const ${method} does not use createApiHandler/createPublicHandler`,
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('found at least one route file to validate', () => {
    const routeFiles = findRouteFiles(API_DIR);
    expect(routeFiles.length).toBeGreaterThan(0);
  });
});
