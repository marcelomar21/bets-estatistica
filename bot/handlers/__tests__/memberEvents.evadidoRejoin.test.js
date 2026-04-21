/**
 * Tests for memberEvents.processNewMember — evadido rejoin branch.
 */

jest.mock('../../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

jest.mock('../../../lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../../lib/config', () => ({
  config: {
    membership: {
      trialDays: 7,
      checkoutUrl: 'https://pay.test/checkout',
      operatorUsername: 'testop',
      subscriptionPrice: 50,
    },
  },
}));

jest.mock('../../telegram', () => ({
  getBot: jest.fn(),
  getBotForGroup: jest.fn(() => null),
}));

jest.mock('../../services/memberService', () => ({
  getMemberByTelegramId: jest.fn(),
  createTrialMember: jest.fn(),
  canRejoinGroup: jest.fn(),
  reactivateMember: jest.fn(),
}));

jest.mock('../../services/metricsService', () => ({
  getSuccessRateForDays: jest.fn(),
}));

jest.mock('../../services/notificationHelper', () => ({
  insertAdminNotification: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('../../services/notificationService', () => ({
  registerNotification: jest.fn().mockResolvedValue({ success: true }),
}));

const { processNewMember } = require('../memberEvents');
const { getBot } = require('../../telegram');
const {
  getMemberByTelegramId,
  canRejoinGroup,
  reactivateMember,
} = require('../../services/memberService');

describe('processNewMember — evadido rejoin (Story fix: B2)', () => {
  let mockBot;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue({ message_id: 123 }),
    };
    getBot.mockReturnValue(mockBot);
  });

  test('R1: evadido with left_at < 24h reactivates as trial', async () => {
    getMemberByTelegramId.mockResolvedValue({
      success: true,
      data: {
        id: 'uuid-ev-1',
        telegram_id: 555,
        status: 'evadido',
        notes: null,
      },
    });
    canRejoinGroup.mockResolvedValue({
      success: true,
      data: { canRejoin: true, hoursSinceKick: 6.5 },
    });
    reactivateMember.mockResolvedValue({ success: true, data: { id: 'uuid-ev-1' } });

    const result = await processNewMember(
      { id: 555, username: 'tester', first_name: 'Tester', is_bot: false },
      'group-1',
    );

    expect(result.processed).toBe(true);
    expect(result.action).toBe('rejoin_after_evasion');
    expect(reactivateMember).toHaveBeenCalledWith('uuid-ev-1');
  });

  test('R2: evadido with left_at > 24h triggers payment_required_after_evasion', async () => {
    getMemberByTelegramId.mockResolvedValue({
      success: true,
      data: {
        id: 'uuid-ev-2',
        telegram_id: 556,
        status: 'evadido',
      },
    });
    canRejoinGroup.mockResolvedValue({
      success: true,
      data: { canRejoin: false, hoursSinceKick: 48 },
    });

    const result = await processNewMember(
      { id: 556, username: 'tester2', first_name: 'Tester', is_bot: false },
      'group-1',
    );

    expect(result.processed).toBe(true);
    expect(result.action).toBe('payment_required_after_evasion');
    expect(reactivateMember).not.toHaveBeenCalled();
    expect(mockBot.sendMessage).toHaveBeenCalled();
  });

  test('R3: evadido without left_at nor kicked_at (canRejoin=false) → payment_required_after_evasion', async () => {
    getMemberByTelegramId.mockResolvedValue({
      success: true,
      data: {
        id: 'uuid-ev-3',
        telegram_id: 557,
        status: 'evadido',
      },
    });
    canRejoinGroup.mockResolvedValue({
      success: true,
      data: { canRejoin: false, reason: 'no_exit_timestamp' },
    });

    const result = await processNewMember(
      { id: 557, username: 'tester3', first_name: 'Tester', is_bot: false },
      'group-1',
    );

    expect(result.processed).toBe(true);
    expect(result.action).toBe('payment_required_after_evasion');
  });

  test('reactivateMember failure returns reactivation_failed for evadido', async () => {
    getMemberByTelegramId.mockResolvedValue({
      success: true,
      data: { id: 'uuid-ev-4', telegram_id: 558, status: 'evadido' },
    });
    canRejoinGroup.mockResolvedValue({
      success: true,
      data: { canRejoin: true, hoursSinceKick: 3 },
    });
    reactivateMember.mockResolvedValue({
      success: false,
      error: { code: 'RACE_CONDITION', message: 'race' },
    });

    const result = await processNewMember(
      { id: 558, username: 'tester4', first_name: 'Tester', is_bot: false },
      'group-1',
    );

    expect(result.processed).toBe(false);
    expect(result.action).toBe('reactivation_failed');
  });
});
