import { vi } from 'vitest';

export const mockPush = vi.fn();
export const mockRefresh = vi.fn();
export const mockRedirect = vi.fn();

export function resetNavigationMocks() {
  mockPush.mockReset();
  mockRefresh.mockReset();
  mockRedirect.mockReset();
}
