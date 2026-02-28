const { validateE164, phoneToJid, jidToPhone } = require('../../lib/phoneUtils');

describe('phoneUtils', () => {
  describe('validateE164', () => {
    it('should accept valid Brazilian mobile numbers', () => {
      expect(validateE164('+5511999887766')).toEqual({ valid: true });
      expect(validateE164('+5521988776655')).toEqual({ valid: true });
    });

    it('should accept valid international numbers', () => {
      expect(validateE164('+14155552671')).toEqual({ valid: true }); // US
      expect(validateE164('+447911123456')).toEqual({ valid: true }); // UK
      expect(validateE164('+351912345678')).toEqual({ valid: true }); // Portugal
    });

    it('should reject numbers without +', () => {
      const result = validateE164('5511999887766');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('E.164');
    });

    it('should reject numbers starting with +0', () => {
      const result = validateE164('+0511999887766');
      expect(result.valid).toBe(false);
    });

    it('should reject too short numbers', () => {
      const result = validateE164('+12345');
      expect(result.valid).toBe(false);
    });

    it('should reject too long numbers', () => {
      const result = validateE164('+1234567890123456');
      expect(result.valid).toBe(false);
    });

    it('should reject numbers with non-digit characters', () => {
      expect(validateE164('+55(11)99988-7766').valid).toBe(false);
      expect(validateE164('+55 11 99988 7766').valid).toBe(false);
    });

    it('should reject null/undefined/empty', () => {
      expect(validateE164(null).valid).toBe(false);
      expect(validateE164(undefined).valid).toBe(false);
      expect(validateE164('').valid).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(validateE164(5511999887766).valid).toBe(false);
    });
  });

  describe('phoneToJid', () => {
    it('should convert E.164 to JID', () => {
      expect(phoneToJid('+5511999887766')).toBe('5511999887766@s.whatsapp.net');
    });

    it('should handle US numbers', () => {
      expect(phoneToJid('+14155552671')).toBe('14155552671@s.whatsapp.net');
    });
  });

  describe('jidToPhone', () => {
    it('should convert JID to E.164', () => {
      expect(jidToPhone('5511999887766@s.whatsapp.net')).toBe('+5511999887766');
    });

    it('should handle US numbers', () => {
      expect(jidToPhone('14155552671@s.whatsapp.net')).toBe('+14155552671');
    });
  });

  describe('roundtrip', () => {
    it('should preserve number through phoneToJid → jidToPhone', () => {
      const phone = '+5511999887766';
      expect(jidToPhone(phoneToJid(phone))).toBe(phone);
    });

    it('should preserve JID through jidToPhone → phoneToJid', () => {
      const jid = '5511999887766@s.whatsapp.net';
      expect(phoneToJid(jidToPhone(jid))).toBe(jid);
    });
  });
});
