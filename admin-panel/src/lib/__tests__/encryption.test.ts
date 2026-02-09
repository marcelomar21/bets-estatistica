import { describe, it, expect, beforeEach, vi } from 'vitest';

// Set up encryption key before importing module
const TEST_KEY = 'a'.repeat(64); // 32 bytes in hex
vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);

import { encrypt, decrypt } from '../encryption';

describe('encryption', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
  });

  it('should encrypt and decrypt roundtrip correctly', () => {
    const plaintext = 'my-secret-session-string-12345';
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce format version:iv:authTag:ciphertext', () => {
    const encrypted = encrypt('test');
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe('1'); // key version
    expect(parts[1]).toHaveLength(24); // 12 bytes = 24 hex chars
    expect(parts[2]).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(parts[3].length).toBeGreaterThan(0);
  });

  it('should use specified key version', () => {
    vi.stubEnv('ENCRYPTION_KEY_V2', 'b'.repeat(64));
    const encrypted = encrypt('test', 2);
    expect(encrypted.startsWith('2:')).toBe(true);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('test');
  });

  it('should produce different ciphertext for same plaintext (random IV)', () => {
    const encrypted1 = encrypt('same-text');
    const encrypted2 = encrypt('same-text');
    expect(encrypted1).not.toBe(encrypted2);
    // Both should decrypt to same value
    expect(decrypt(encrypted1)).toBe('same-text');
    expect(decrypt(encrypted2)).toBe('same-text');
  });

  it('should detect tampering (GCM auth tag validation)', () => {
    const encrypted = encrypt('sensitive-data');
    const parts = encrypted.split(':');
    // Tamper with ciphertext
    const tamperedCiphertext = parts[3].split('').reverse().join('');
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCiphertext}`;

    expect(() => decrypt(tampered)).toThrow();
  });

  it('should detect tampered auth tag', () => {
    const encrypted = encrypt('sensitive-data');
    const parts = encrypted.split(':');
    // Tamper with auth tag
    const tamperedTag = '0'.repeat(32);
    const tampered = `${parts[0]}:${parts[1]}:${tamperedTag}:${parts[3]}`;

    expect(() => decrypt(tampered)).toThrow();
  });

  it('should throw if encryption key not found', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    // Need to reimport or the cached key from module level won't change
    // Since encrypt reads env at call time, unsetting should cause error
    vi.unstubAllEnvs();
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('Encryption key ENCRYPTION_KEY not found');
  });

  it('should handle empty string', () => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
    const encrypted = encrypt('');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe('');
  });

  it('should handle unicode text', () => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
    const text = 'Olá mundo! 🌍 日本語';
    const encrypted = encrypt(text);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(text);
  });
});
