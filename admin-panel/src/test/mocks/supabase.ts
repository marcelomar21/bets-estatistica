import { vi } from 'vitest';

export const mockSignInWithPassword = vi.fn();
export const mockResetPasswordForEmail = vi.fn();
export const mockSignOut = vi.fn();
export const mockGetUser = vi.fn();

export const mockSupabaseClient = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    resetPasswordForEmail: mockResetPasswordForEmail,
    signOut: mockSignOut,
    getUser: mockGetUser,
  },
};

export function resetMocks() {
  mockSignInWithPassword.mockReset();
  mockResetPasswordForEmail.mockReset();
  mockSignOut.mockReset();
  mockGetUser.mockReset();
}
