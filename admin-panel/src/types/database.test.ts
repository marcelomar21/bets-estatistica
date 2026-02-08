import type { Group, AdminUser, BotPool, BotHealth } from './database';

describe('Database Types', () => {
  describe('Group', () => {
    it('has all required fields', () => {
      const group: Group = {
        id: 'uuid-1234',
        name: 'Test Group',
        bot_token: null,
        telegram_group_id: null,
        telegram_admin_group_id: null,
        mp_product_id: null,
        render_service_id: null,
        checkout_url: null,
        status: 'active',
        created_at: '2024-01-01T00:00:00Z',
      };
      expect(group.id).toBeDefined();
      expect(group.name).toBe('Test Group');
      expect(group.bot_token).toBeNull();
      expect(group.telegram_group_id).toBeNull();
      expect(group.telegram_admin_group_id).toBeNull();
      expect(group.mp_product_id).toBeNull();
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
        mp_product_id: null,
        render_service_id: null,
        checkout_url: null,
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
        mp_product_id: null,
        render_service_id: null,
        checkout_url: null,
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
        mp_product_id: null,
        render_service_id: null,
        checkout_url: null,
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
        mp_product_id: null,
        render_service_id: null,
        checkout_url: null,
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
        mp_product_id: null,
        render_service_id: null,
        checkout_url: null,
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
        mp_product_id: 'mp-prod-001',
        render_service_id: 'srv-abc123',
        checkout_url: 'https://checkout.example.com',
        status: 'active',
        created_at: '2024-06-15T10:30:00Z',
      };
      expect(group.bot_token).toBe('bot-token-123');
      expect(group.telegram_group_id).toBe(-1001234567890);
      expect(group.telegram_admin_group_id).toBe(-1009876543210);
      expect(group.mp_product_id).toBe('mp-prod-001');
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
});
