/**
 * Tests for lib/validators.js
 * Story 17.4: Implementar Validação Padronizada de Input
 */

const {
  validateTelegramId,
  validateSubscriptionId,
  validateUUID,
  validateMemberId,
  validateBetId,
  validateEmail,
  validatePositiveInt,
  validateNonEmptyString,
  validateWebhookEventId,
} = require('../../lib/validators');

describe('lib/validators', () => {
  describe('validateTelegramId', () => {
    it('should accept valid positive integer', () => {
      expect(validateTelegramId(123456789)).toEqual({ valid: true, value: 123456789 });
    });

    it('should accept valid string number', () => {
      expect(validateTelegramId('123456789')).toEqual({ valid: true, value: 123456789 });
    });

    it('should reject null/undefined', () => {
      expect(validateTelegramId(null).valid).toBe(false);
      expect(validateTelegramId(null).error.code).toBe('INVALID_TELEGRAM_ID');
      expect(validateTelegramId(undefined).valid).toBe(false);
    });

    it('should reject non-numeric strings', () => {
      expect(validateTelegramId('abc').valid).toBe(false);
    });

    it('should reject zero and negative numbers', () => {
      expect(validateTelegramId(0).valid).toBe(false);
      expect(validateTelegramId(-1).valid).toBe(false);
    });

    it('should reject floating point numbers', () => {
      expect(validateTelegramId(123.45).valid).toBe(false);
    });
  });

  describe('validateSubscriptionId', () => {
    it('should accept valid non-empty string', () => {
      expect(validateSubscriptionId('sub_123')).toEqual({ valid: true, value: 'sub_123' });
    });

    it('should trim whitespace', () => {
      expect(validateSubscriptionId('  sub_123  ')).toEqual({ valid: true, value: 'sub_123' });
    });

    it('should reject null/undefined', () => {
      expect(validateSubscriptionId(null).valid).toBe(false);
      expect(validateSubscriptionId(null).error.code).toBe('INVALID_SUBSCRIPTION_ID');
    });

    it('should reject non-strings', () => {
      expect(validateSubscriptionId(123).valid).toBe(false);
    });

    it('should reject empty/whitespace strings', () => {
      expect(validateSubscriptionId('').valid).toBe(false);
      expect(validateSubscriptionId('   ').valid).toBe(false);
    });
  });

  describe('validateUUID', () => {
    it('should accept valid UUID v4', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(validateUUID(uuid)).toEqual({ valid: true, value: uuid.toLowerCase() });
    });

    it('should accept uppercase UUID and lowercase it', () => {
      const uuid = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
      expect(validateUUID(uuid).value).toBe(uuid.toLowerCase());
    });

    it('should reject null/undefined', () => {
      expect(validateUUID(null).valid).toBe(false);
      expect(validateUUID(null).error.code).toBe('INVALID_UUID');
    });

    it('should reject invalid format', () => {
      expect(validateUUID('not-a-uuid').valid).toBe(false);
      expect(validateUUID('123').valid).toBe(false);
    });

    it('should use custom field name in error message', () => {
      const result = validateUUID(null, 'Custom Field');
      expect(result.error.message).toContain('Custom Field');
    });
  });

  describe('validateMemberId', () => {
    it('should accept valid UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(validateMemberId(uuid).valid).toBe(true);
      expect(validateMemberId(uuid).value).toBe(uuid);
    });

    it('should accept positive integer', () => {
      expect(validateMemberId(123)).toEqual({ valid: true, value: 123 });
    });

    it('should accept numeric string', () => {
      expect(validateMemberId('456')).toEqual({ valid: true, value: '456' });
    });

    it('should accept any non-empty string ID', () => {
      expect(validateMemberId('uuid-1')).toEqual({ valid: true, value: 'uuid-1' });
      expect(validateMemberId('member-abc-123')).toEqual({ valid: true, value: 'member-abc-123' });
    });

    it('should reject null/undefined', () => {
      expect(validateMemberId(null).valid).toBe(false);
      expect(validateMemberId(null).error.code).toBe('INVALID_MEMBER_ID');
    });

    it('should reject zero and negative', () => {
      expect(validateMemberId(0).valid).toBe(false);
      expect(validateMemberId(-1).valid).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateMemberId('').valid).toBe(false);
      expect(validateMemberId('   ').valid).toBe(false);
    });
  });

  describe('validateBetId', () => {
    it('should accept valid UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(validateBetId(uuid).valid).toBe(true);
    });

    it('should return INVALID_BET_ID code on error', () => {
      expect(validateBetId(null).error.code).toBe('INVALID_BET_ID');
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email', () => {
      expect(validateEmail('user@example.com')).toEqual({ valid: true, value: 'user@example.com' });
    });

    it('should lowercase and trim email', () => {
      expect(validateEmail('  User@Example.COM  ')).toEqual({ valid: true, value: 'user@example.com' });
    });

    it('should accept emails with subdomains', () => {
      expect(validateEmail('user@mail.example.com').valid).toBe(true);
    });

    it('should accept emails with plus sign', () => {
      expect(validateEmail('user+tag@example.com').valid).toBe(true);
    });

    it('should reject null/undefined', () => {
      expect(validateEmail(null).valid).toBe(false);
      expect(validateEmail(null).error.code).toBe('INVALID_EMAIL');
    });

    it('should reject invalid formats', () => {
      expect(validateEmail('notanemail').valid).toBe(false);
      expect(validateEmail('@example.com').valid).toBe(false);
      expect(validateEmail('user@').valid).toBe(false);
      expect(validateEmail('user@example').valid).toBe(false);
    });

    it('should reject empty/whitespace', () => {
      expect(validateEmail('').valid).toBe(false);
      expect(validateEmail('   ').valid).toBe(false);
    });
  });

  describe('validatePositiveInt', () => {
    it('should accept positive integer', () => {
      expect(validatePositiveInt(42)).toEqual({ valid: true, value: 42 });
    });

    it('should accept string number', () => {
      expect(validatePositiveInt('42')).toEqual({ valid: true, value: 42 });
    });

    it('should reject zero and negative', () => {
      expect(validatePositiveInt(0).valid).toBe(false);
      expect(validatePositiveInt(-1).valid).toBe(false);
    });

    it('should use custom field name', () => {
      const result = validatePositiveInt(null, 'Age');
      expect(result.error.message).toContain('Age');
    });
  });

  describe('validateNonEmptyString', () => {
    it('should accept non-empty string', () => {
      expect(validateNonEmptyString('hello')).toEqual({ valid: true, value: 'hello' });
    });

    it('should trim whitespace', () => {
      expect(validateNonEmptyString('  hello  ')).toEqual({ valid: true, value: 'hello' });
    });

    it('should reject empty/whitespace', () => {
      expect(validateNonEmptyString('').valid).toBe(false);
      expect(validateNonEmptyString('   ').valid).toBe(false);
    });

    it('should reject non-strings', () => {
      expect(validateNonEmptyString(123).valid).toBe(false);
    });
  });

  describe('validateWebhookEventId', () => {
    it('should accept valid event ID', () => {
      expect(validateWebhookEventId('evt_123').valid).toBe(true);
    });

    it('should return INVALID_WEBHOOK_EVENT_ID code on error', () => {
      expect(validateWebhookEventId(null).error.code).toBe('INVALID_WEBHOOK_EVENT_ID');
    });
  });
});
