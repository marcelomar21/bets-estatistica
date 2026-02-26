/**
 * Tests for termsService.js
 * Story 3.1: Tabela terms_acceptance com Imutabilidade
 */

// Mock supabase before importing the service
jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock config
jest.mock('../../lib/config', () => ({
  config: {
    membership: { groupId: 'default-group-id' }
  }
}));

const { acceptTerms, getLatestAcceptance, hasAcceptedVersion } = require('../../bot/services/termsService');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');

/**
 * Create a chainable query builder mock.
 * Every method returns itself, and `then` resolves to the provided result.
 */
function createQueryMock(result) {
  const mock = {
    select: jest.fn(),
    eq: jest.fn(),
    order: jest.fn(),
    limit: jest.fn(),
    not: jest.fn(),
    insert: jest.fn(),
    then: (resolve) => resolve(result),
  };
  // Every method returns the mock itself (chainable)
  mock.select.mockReturnValue(mock);
  mock.eq.mockReturnValue(mock);
  mock.order.mockReturnValue(mock);
  mock.limit.mockReturnValue(mock);
  mock.not.mockReturnValue(mock);
  mock.insert.mockReturnValue(mock);
  return mock;
}

describe('termsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('acceptTerms', () => {
    test('inserts acceptance and returns id + accepted_at', async () => {
      const mockRecord = {
        id: 'acceptance-uuid-1',
        accepted_at: '2026-02-25T12:00:00Z'
      };

      const mockSelect = jest.fn().mockResolvedValue({
        data: [mockRecord],
        error: null
      });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      supabase.from.mockReturnValue({ insert: mockInsert });

      const result = await acceptTerms(123456, 'group-1', '1.0', 'https://terms.example.com');

      expect(result).toEqual({ success: true, data: mockRecord });
      expect(supabase.from).toHaveBeenCalledWith('terms_acceptance');
      expect(mockInsert).toHaveBeenCalledWith([{
        telegram_id: 123456,
        group_id: 'group-1',
        terms_version: '1.0',
        terms_url: 'https://terms.example.com',
        ip_metadata: {}
      }]);
      expect(mockSelect).toHaveBeenCalledWith('id, accepted_at');
      expect(logger.info).toHaveBeenCalledWith(
        '[terms] Terms accepted',
        expect.objectContaining({ telegramId: 123456, termsVersion: '1.0' })
      );
    });

    test('returns error on database failure', async () => {
      const mockSelect = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'connection refused' }
      });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      supabase.from.mockReturnValue({ insert: mockInsert });

      const result = await acceptTerms(123456, 'group-1', '1.0', 'https://terms.example.com');

      expect(result).toEqual({
        success: false,
        error: { code: 'DB_ERROR', message: 'connection refused' }
      });
      expect(logger.error).toHaveBeenCalled();
    });

    test('returns error on unexpected exception', async () => {
      supabase.from.mockImplementation(() => {
        throw new Error('unexpected crash');
      });

      const result = await acceptTerms(123456, 'group-1', '1.0', 'https://terms.example.com');

      expect(result).toEqual({
        success: false,
        error: { code: 'UNEXPECTED_ERROR', message: 'unexpected crash' }
      });
    });

    test('passes ipMetadata when provided', async () => {
      const mockSelect = jest.fn().mockResolvedValue({
        data: [{ id: 'uuid', accepted_at: '2026-02-25T12:00:00Z' }],
        error: null
      });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      supabase.from.mockReturnValue({ insert: mockInsert });

      await acceptTerms(123456, 'group-1', '1.0', 'https://terms.example.com', { ip: '1.2.3.4' });

      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({ ip_metadata: { ip: '1.2.3.4' } })
      ]);
    });

    test('uses config groupId when groupId is undefined', async () => {
      const mockSelect = jest.fn().mockResolvedValue({
        data: [{ id: 'uuid', accepted_at: '2026-02-25T12:00:00Z' }],
        error: null
      });
      const mockInsert = jest.fn().mockReturnValue({ select: mockSelect });
      supabase.from.mockReturnValue({ insert: mockInsert });

      await acceptTerms(123456, undefined, '1.0', 'https://terms.example.com');

      expect(mockInsert).toHaveBeenCalledWith([
        expect.objectContaining({ group_id: 'default-group-id' })
      ]);
    });
  });

  describe('getLatestAcceptance', () => {
    test('returns most recent acceptance record', async () => {
      const mockRecord = {
        id: 'uuid-1',
        telegram_id: 123456,
        group_id: 'group-1',
        terms_version: '1.0',
        accepted_at: '2026-02-25T12:00:00Z'
      };

      const queryMock = createQueryMock({ data: [mockRecord], error: null });
      supabase.from.mockReturnValue(queryMock);

      const result = await getLatestAcceptance(123456, 'group-1');

      expect(result).toEqual({ success: true, data: mockRecord });
      expect(supabase.from).toHaveBeenCalledWith('terms_acceptance');
      expect(queryMock.select).toHaveBeenCalledWith('*');
      expect(queryMock.eq).toHaveBeenCalledWith('telegram_id', 123456);
      expect(queryMock.eq).toHaveBeenCalledWith('group_id', 'group-1');
      expect(queryMock.order).toHaveBeenCalledWith('accepted_at', { ascending: false });
      expect(queryMock.limit).toHaveBeenCalledWith(1);
    });

    test('returns null when no acceptance exists', async () => {
      const queryMock = createQueryMock({ data: [], error: null });
      supabase.from.mockReturnValue(queryMock);

      const result = await getLatestAcceptance(123456, 'group-1');

      expect(result).toEqual({ success: true, data: null });
    });

    test('returns error on database failure', async () => {
      const queryMock = createQueryMock({
        data: null,
        error: { message: 'query failed' }
      });
      supabase.from.mockReturnValue(queryMock);

      const result = await getLatestAcceptance(123456, 'group-1');

      expect(result).toEqual({
        success: false,
        error: { code: 'DB_ERROR', message: 'query failed' }
      });
    });

    test('returns error on unexpected exception', async () => {
      supabase.from.mockImplementation(() => {
        throw new Error('connection lost');
      });

      const result = await getLatestAcceptance(123456, 'group-1');

      expect(result).toEqual({
        success: false,
        error: { code: 'UNEXPECTED_ERROR', message: 'connection lost' }
      });
    });
  });

  describe('hasAcceptedVersion', () => {
    test('returns accepted: true when version exists', async () => {
      const mockRecord = {
        id: 'uuid-1',
        telegram_id: 123456,
        terms_version: '1.0',
        accepted_at: '2026-02-25T12:00:00Z'
      };

      const queryMock = createQueryMock({ data: [mockRecord], error: null });
      supabase.from.mockReturnValue(queryMock);

      const result = await hasAcceptedVersion(123456, 'group-1', '1.0');

      expect(result).toEqual({
        success: true,
        data: { accepted: true, acceptance: mockRecord }
      });
      expect(queryMock.eq).toHaveBeenCalledWith('telegram_id', 123456);
      expect(queryMock.eq).toHaveBeenCalledWith('terms_version', '1.0');
      expect(queryMock.eq).toHaveBeenCalledWith('group_id', 'group-1');
    });

    test('returns accepted: false when version not accepted', async () => {
      const queryMock = createQueryMock({ data: [], error: null });
      supabase.from.mockReturnValue(queryMock);

      const result = await hasAcceptedVersion(123456, 'group-1', '2.0');

      expect(result).toEqual({
        success: true,
        data: { accepted: false }
      });
    });

    test('returns error on database failure', async () => {
      const queryMock = createQueryMock({
        data: null,
        error: { message: 'timeout' }
      });
      supabase.from.mockReturnValue(queryMock);

      const result = await hasAcceptedVersion(123456, 'group-1', '1.0');

      expect(result).toEqual({
        success: false,
        error: { code: 'DB_ERROR', message: 'timeout' }
      });
    });

    test('uses config groupId as fallback when groupId is undefined', async () => {
      const queryMock = createQueryMock({ data: [], error: null });
      supabase.from.mockReturnValue(queryMock);

      await hasAcceptedVersion(123456, undefined, '1.0');

      expect(queryMock.eq).toHaveBeenCalledWith('group_id', 'default-group-id');
    });

    test('returns error on unexpected exception', async () => {
      supabase.from.mockImplementation(() => {
        throw new Error('socket hang up');
      });

      const result = await hasAcceptedVersion(123456, 'group-1', '1.0');

      expect(result).toEqual({
        success: false,
        error: { code: 'UNEXPECTED_ERROR', message: 'socket hang up' }
      });
    });
  });
});
