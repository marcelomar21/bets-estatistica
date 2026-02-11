import type { Group, AdminUser, BotPool, BotHealth, Member, MemberListItem } from './database';

describe('Database Types', () => {
  describe('Group', () => {
    it('has all required fields', () => {
      const group: Group = {
        id: 'uuid-1234',
        name: 'Test Group',
        bot_token: null,
        telegram_group_id: null,
        telegram_admin_group_id: null,
        mp_plan_id: null,
        render_service_id: null,
        checkout_url: null,
        posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
        post_now_requested_at: null,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(group.id).toBeDefined();
      expect(group.name).toBe('Test Group');
      expect(group.bot_token).toBeNull();
      expect(group.telegram_group_id).toBeNull();
      expect(group.telegram_admin_group_id).toBeNull();
      expect(group.mp_plan_id).toBeNull();
      expect(group.render_service_id).toBeNull();
      expect(group.checkout_url).toBeNull();
      expect(group.status).toBe('active');
      expect(group.created_at).toBeDefined();
    });

    it('status accepts "creating"', () => {
      const group: Group = {
        id: 'uuid',
        name: 'G',
        bot_token: null,
        telegram_group_id: null,
        telegram_admin_group_id: null,
        mp_plan_id: null,
        render_service_id: null,
        checkout_url: null,
        posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
        post_now_requested_at: null,
        status: 'creating',
        created_at: '2024-01-01',
      };
      expect(group.status).toBe('creating');
    });

    it('status accepts "active"', () => {
      const group: Group = {
        id: 'uuid',
        name: 'G',
        bot_token: null,
        telegram_group_id: null,
        telegram_admin_group_id: null,
        mp_plan_id: null,
        render_service_id: null,
        checkout_url: null,
        posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
        post_now_requested_at: null,
        status: 'active',
        created_at: '2024-01-01',
      };
      expect(group.status).toBe('active');
    });

    it('status accepts "paused"', () => {
      const group: Group = {
        id: 'uuid',
        name: 'G',
        bot_token: null,
        telegram_group_id: null,
        telegram_admin_group_id: null,
        mp_plan_id: null,
        render_service_id: null,
        checkout_url: null,
        posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
        post_now_requested_at: null,
        status: 'paused',
        created_at: '2024-01-01',
      };
      expect(group.status).toBe('paused');
    });

    it('status accepts "inactive"', () => {
      const group: Group = {
        id: 'uuid',
        name: 'G',
        bot_token: null,
        telegram_group_id: null,
        telegram_admin_group_id: null,
        mp_plan_id: null,
        render_service_id: null,
        checkout_url: null,
        posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
        post_now_requested_at: null,
        status: 'inactive',
        created_at: '2024-01-01',
      };
      expect(group.status).toBe('inactive');
    });

    it('status accepts "failed"', () => {
      const group: Group = {
        id: 'uuid',
        name: 'G',
        bot_token: null,
        telegram_group_id: null,
        telegram_admin_group_id: null,
        mp_plan_id: null,
        render_service_id: null,
        checkout_url: null,
        posting_schedule: { enabled: true, times: ['10:00', '15:00', '22:00'] },
        post_now_requested_at: null,
        status: 'failed',
        created_at: '2024-01-01',
      };
      expect(group.status).toBe('failed');
    });

    it('accepts non-null values for nullable fields', () => {
      const group: Group = {
        id: 'uuid',
        name: 'Full Group',
        bot_token: 'bot-token-123',
        telegram_group_id: -1001234567890,
        telegram_admin_group_id: -1009876543210,
        mp_plan_id: 'mp-plan-001',
        render_service_id: 'srv-abc123',
        checkout_url: 'https://checkout.example.com',
        posting_schedule: { enabled: false, times: ['09:00', '14:00'] },
        post_now_requested_at: '2026-02-10T12:00:00Z',
        status: 'active',
        created_at: '2024-06-15T10:30:00Z',
      };
      expect(group.bot_token).toBe('bot-token-123');
      expect(group.telegram_group_id).toBe(-1001234567890);
      expect(group.telegram_admin_group_id).toBe(-1009876543210);
      expect(group.mp_plan_id).toBe('mp-plan-001');
      expect(group.render_service_id).toBe('srv-abc123');
      expect(group.checkout_url).toBe('https://checkout.example.com');
    });
  });

  describe('AdminUser', () => {
    it('has correct fields', () => {
      const user: AdminUser = {
        id: 'user-uuid',
        email: 'admin@example.com',
        role: 'super_admin',
        group_id: null,
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(user.id).toBeDefined();
      expect(user.email).toBe('admin@example.com');
      expect(user.role).toBe('super_admin');
      expect(user.group_id).toBeNull();
      expect(user.created_at).toBeDefined();
    });

    it('role accepts "super_admin"', () => {
      const user: AdminUser = {
        id: 'uuid',
        email: 'sa@test.com',
        role: 'super_admin',
        group_id: null,
        created_at: '2024-01-01',
      };
      expect(user.role).toBe('super_admin');
    });

    it('role accepts "group_admin"', () => {
      const user: AdminUser = {
        id: 'uuid',
        email: 'ga@test.com',
        role: 'group_admin',
        group_id: 'group-uuid',
        created_at: '2024-01-01',
      };
      expect(user.role).toBe('group_admin');
      expect(user.group_id).toBe('group-uuid');
    });
  });

  describe('BotPool', () => {
    it('has correct fields', () => {
      const bot: BotPool = {
        id: 'bot-uuid',
        bot_token: 'token-123',
        bot_username: 'test_bot',
        status: 'available',
        group_id: null,
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(bot.id).toBeDefined();
      expect(bot.bot_token).toBe('token-123');
      expect(bot.bot_username).toBe('test_bot');
      expect(bot.status).toBe('available');
      expect(bot.group_id).toBeNull();
      expect(bot.created_at).toBeDefined();
    });

    it('status accepts "available"', () => {
      const bot: BotPool = {
        id: 'uuid',
        bot_token: 'tok',
        bot_username: 'bot',
        status: 'available',
        group_id: null,
        created_at: '2024-01-01',
      };
      expect(bot.status).toBe('available');
    });

    it('status accepts "in_use"', () => {
      const bot: BotPool = {
        id: 'uuid',
        bot_token: 'tok',
        bot_username: 'bot',
        status: 'in_use',
        group_id: 'group-uuid',
        created_at: '2024-01-01',
      };
      expect(bot.status).toBe('in_use');
      expect(bot.group_id).toBe('group-uuid');
    });
  });

  describe('BotHealth', () => {
    it('has correct fields', () => {
      const health: BotHealth = {
        group_id: 'group-uuid',
        last_heartbeat: '2024-01-01T12:00:00Z',
        status: 'online',
        restart_requested: false,
        error_message: null,
        updated_at: '2024-01-01T12:00:00Z',
      };
      expect(health.group_id).toBeDefined();
      expect(health.last_heartbeat).toBeDefined();
      expect(health.status).toBe('online');
      expect(health.restart_requested).toBe(false);
      expect(health.error_message).toBeNull();
      expect(health.updated_at).toBeDefined();
    });

    it('status accepts "online"', () => {
      const health: BotHealth = {
        group_id: 'g',
        last_heartbeat: '2024-01-01',
        status: 'online',
        restart_requested: false,
        error_message: null,
        updated_at: '2024-01-01',
      };
      expect(health.status).toBe('online');
    });

    it('status accepts "offline"', () => {
      const health: BotHealth = {
        group_id: 'g',
        last_heartbeat: '2024-01-01',
        status: 'offline',
        restart_requested: true,
        error_message: 'Connection lost',
        updated_at: '2024-01-01',
      };
      expect(health.status).toBe('offline');
      expect(health.restart_requested).toBe(true);
      expect(health.error_message).toBe('Connection lost');
    });
  });

  describe('Member', () => {
    it('has all required fields', () => {
      const member: Member = {
        id: 1,
        telegram_id: 123456789,
        telegram_username: 'member_test',
        email: null,
        status: 'trial',
        mp_subscription_id: null,
        mp_payer_id: null,
        trial_started_at: null,
        subscription_started_at: null,
        subscription_ends_at: null,
        payment_method: null,
        last_payment_at: null,
        kicked_at: null,
        notes: null,
        group_id: 'group-uuid-1',
        created_at: '2026-02-09T12:00:00Z',
        updated_at: '2026-02-09T12:00:00Z',
      };
      expect(member.id).toBe(1);
      expect(member.telegram_id).toBe(123456789);
      expect(member.status).toBe('trial');
      expect(member.group_id).toBe('group-uuid-1');
    });

    it('status aceita todos os valores válidos da máquina de estados', () => {
      const trialMember: Member = {
        id: 1,
        telegram_id: 1,
        telegram_username: null,
        email: null,
        status: 'trial',
        mp_subscription_id: null,
        mp_payer_id: null,
        trial_started_at: null,
        subscription_started_at: null,
        subscription_ends_at: null,
        payment_method: null,
        last_payment_at: null,
        kicked_at: null,
        notes: null,
        group_id: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      const activeMember: Member = { ...trialMember, status: 'ativo' };
      const delinquentMember: Member = { ...trialMember, status: 'inadimplente' };
      const removedMember: Member = { ...trialMember, status: 'removido' };

      expect(trialMember.status).toBe('trial');
      expect(activeMember.status).toBe('ativo');
      expect(delinquentMember.status).toBe('inadimplente');
      expect(removedMember.status).toBe('removido');
    });
  });

  describe('MemberListItem', () => {
    it('expõe apenas campos necessários para listagem', () => {
      const memberListItem: MemberListItem = {
        id: 99,
        telegram_id: 555000,
        telegram_username: 'list-user',
        status: 'ativo',
        subscription_ends_at: '2026-02-20T00:00:00Z',
        created_at: '2026-02-01T00:00:00Z',
        group_id: 'group-uuid-1',
      };

      expect(memberListItem.id).toBe(99);
      expect(memberListItem.telegram_username).toBe('list-user');
      expect(memberListItem.subscription_ends_at).toBe('2026-02-20T00:00:00Z');
      expect(memberListItem.group_id).toBe('group-uuid-1');
    });
  });
});
