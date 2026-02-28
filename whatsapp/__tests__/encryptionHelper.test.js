const crypto = require('crypto');
const { encrypt, decrypt } = require('../store/encryptionHelper');

// Generate a valid 256-bit key for testing
const TEST_KEY = crypto.randomBytes(32).toString('hex');
const WRONG_KEY = crypto.randomBytes(32).toString('hex');

describe('encryptionHelper', () => {
  describe('encrypt', () => {
    it('should encrypt data and return version:iv:authTag:ciphertext format', () => {
      const data = { foo: 'bar', num: 42 };
      const result = encrypt(data, TEST_KEY);

      const parts = result.split(':');
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe('1'); // version
      expect(parts[1]).toHaveLength(32); // 16 bytes iv in hex
      expect(parts[2]).toHaveLength(32); // 16 bytes authTag in hex
      expect(parts[3].length).toBeGreaterThan(0); // ciphertext
    });

    it('should produce different ciphertexts for same data (random IV)', () => {
      const data = { test: 'value' };
      const result1 = encrypt(data, TEST_KEY);
      const result2 = encrypt(data, TEST_KEY);

      expect(result1).not.toBe(result2);
    });

    it('should throw on invalid key length', () => {
      expect(() => encrypt({ a: 1 }, 'short')).toThrow('Encryption key must be 32 bytes');
    });

    it('should handle string data', () => {
      const result = encrypt('hello world', TEST_KEY);
      expect(result.split(':')).toHaveLength(4);
    });

    it('should handle array data', () => {
      const result = encrypt([1, 2, 3], TEST_KEY);
      expect(result.split(':')).toHaveLength(4);
    });

    it('should handle null data', () => {
      const result = encrypt(null, TEST_KEY);
      expect(result.split(':')).toHaveLength(4);
    });
  });

  describe('decrypt', () => {
    it('should decrypt data back to original', () => {
      const data = { foo: 'bar', nested: { a: [1, 2] } };
      const encrypted = encrypt(data, TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);

      expect(decrypted).toEqual(data);
    });

    it('should decrypt strings', () => {
      const encrypted = encrypt('hello', TEST_KEY);
      expect(decrypt(encrypted, TEST_KEY)).toBe('hello');
    });

    it('should decrypt arrays', () => {
      const encrypted = encrypt([1, 'two', 3], TEST_KEY);
      expect(decrypt(encrypted, TEST_KEY)).toEqual([1, 'two', 3]);
    });

    it('should decrypt null', () => {
      const encrypted = encrypt(null, TEST_KEY);
      expect(decrypt(encrypted, TEST_KEY)).toBeNull();
    });

    it('should throw on wrong key', () => {
      const encrypted = encrypt({ secret: true }, TEST_KEY);
      expect(() => decrypt(encrypted, WRONG_KEY)).toThrow();
    });

    it('should throw on tampered ciphertext', () => {
      const encrypted = encrypt({ data: 1 }, TEST_KEY);
      const parts = encrypted.split(':');
      parts[3] = 'ff' + parts[3].slice(2); // tamper ciphertext
      expect(() => decrypt(parts.join(':'), TEST_KEY)).toThrow();
    });

    it('should throw on invalid format', () => {
      expect(() => decrypt('not:valid', TEST_KEY)).toThrow('Invalid ciphertext format');
    });

    it('should throw on unsupported version', () => {
      const encrypted = encrypt({ a: 1 }, TEST_KEY);
      const tampered = '99' + encrypted.slice(1);
      expect(() => decrypt(tampered, TEST_KEY)).toThrow('Unsupported encryption version');
    });

    it('should throw on invalid key length', () => {
      const encrypted = encrypt({ a: 1 }, TEST_KEY);
      expect(() => decrypt(encrypted, 'short')).toThrow('Encryption key must be 32 bytes');
    });
  });

  describe('roundtrip with large data', () => {
    it('should handle Baileys-sized credential objects', () => {
      // Simulate a Baileys creds object
      const bigCreds = {
        noiseKey: { private: crypto.randomBytes(32).toString('base64'), public: crypto.randomBytes(32).toString('base64') },
        pairingEphemeralKeyPair: { private: crypto.randomBytes(32).toString('base64'), public: crypto.randomBytes(32).toString('base64') },
        signedIdentityKey: { private: crypto.randomBytes(32).toString('base64'), public: crypto.randomBytes(32).toString('base64') },
        signedPreKey: { keyPair: { private: crypto.randomBytes(32).toString('base64'), public: crypto.randomBytes(32).toString('base64') }, signature: crypto.randomBytes(64).toString('base64'), keyId: 1 },
        registrationId: 12345,
        advSecretKey: crypto.randomBytes(32).toString('base64'),
        me: { id: '5511999887766@s.whatsapp.net', name: 'Test' },
        account: { details: 'test', accountSignature: crypto.randomBytes(64).toString('base64') },
      };

      const encrypted = encrypt(bigCreds, TEST_KEY);
      const decrypted = decrypt(encrypted, TEST_KEY);
      expect(decrypted).toEqual(bigCreds);
    });
  });
});
