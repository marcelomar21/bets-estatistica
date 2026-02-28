const { loadBaileys } = require('../baileys');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { useDatabaseAuthState } = require('../store/authStateStore');
const { phoneToJid } = require('../../lib/phoneUtils');

const DEFAULT_BACKOFF_MS = [1000, 5000, 15000, 30000, 60000];
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;

class BaileyClient {
  constructor(numberId, phoneNumber) {
    this.numberId = numberId;
    this.phoneNumber = phoneNumber;
    this.jid = phoneToJid(phoneNumber);
    this.socket = null;
    this.authState = null;
    this.reconnectAttempt = 0;
    this.totalReconnects = 0;
    this.isClosing = false;
    this.maxReconnectAttempts = config.whatsapp?.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.backoffMs = config.whatsapp?.reconnectBackoffMs ?? DEFAULT_BACKOFF_MS;
  }

  /**
   * Connect to WhatsApp. Sets up event handlers for QR, auth, and connection.
   */
  async connect() {
    const baileys = await loadBaileys();
    const { makeWASocket } = baileys;

    this.authState = await useDatabaseAuthState(this.numberId);

    // Update connection state to connecting
    await this._updateConnectionState('connecting');

    this.socket = makeWASocket({
      auth: this.authState.state,
      printQRInTerminal: false,
      logger: this._createPinoAdapter(),
      browser: ['GuruBet', 'Server', '1.0.0'],
    });

    this.socket.ev.on('connection.update', async (update) => {
      await this._handleConnectionUpdate(update);
    });

    this.socket.ev.on('creds.update', async () => {
      await this.authState.saveCreds();
    });

    logger.info('BaileyClient connecting', { numberId: this.numberId, phone: this.phoneNumber });
  }

  /**
   * Disconnect from WhatsApp. Closes WebSocket cleanly.
   */
  async disconnect() {
    this.isClosing = true;
    // Save auth state before closing (AC #3: graceful shutdown)
    if (this.authState) {
      try {
        await this.authState.saveCreds();
      } catch (err) {
        logger.error('Failed to save creds during disconnect', { numberId: this.numberId, error: err.message });
      }
    }
    if (this.socket) {
      this.socket.end(undefined);
      this.socket = null;
    }
    await this._updateConnectionState('disconnected');
    logger.info('BaileyClient disconnected', { numberId: this.numberId });
  }

  /**
   * Handle connection.update events from Baileys.
   */
  async _handleConnectionUpdate(update) {
    const { connection, lastDisconnect, qr } = update;

    // QR code generated — save to DB for admin panel display
    if (qr) {
      await this._saveQrCode(qr);
      logger.info('QR code generated', { numberId: this.numberId });
    }

    if (connection === 'open') {
      if (this.reconnectAttempt > 0) {
        this.totalReconnects++;
      }
      this.reconnectAttempt = 0;
      await this._updateConnectionState('open');
      await this._updateNumberStatus('available');
      await this._updateHeartbeat();
      // Clear QR code since we're connected
      await this._clearQrCode();
      logger.info('BaileyClient connected', { numberId: this.numberId, totalReconnects: this.totalReconnects });
    }

    if (connection === 'close') {
      if (this.isClosing) return;

      const baileys = await loadBaileys();
      const { DisconnectReason } = baileys;
      const statusCode = lastDisconnect?.error?.output?.statusCode;

      if (statusCode === DisconnectReason.loggedOut) {
        // 401 — device was logged out or banned
        await this._updateConnectionState('banned');
        await this._updateNumberStatus('banned');
        logger.warn('BaileyClient logged out / banned', { numberId: this.numberId, statusCode });
      } else if (this.reconnectAttempt >= this.maxReconnectAttempts) {
        // Max attempts reached — stop reconnecting
        await this._updateConnectionState('closed');
        await this._updateNumberStatus('cooldown');
        logger.error('BaileyClient max reconnect attempts reached', {
          numberId: this.numberId,
          attempts: this.reconnectAttempt,
          maxAttempts: this.maxReconnectAttempts,
        });
      } else {
        // Reconnect with exponential backoff
        await this._updateConnectionState('closed');
        const delay = this.backoffMs[Math.min(this.reconnectAttempt, this.backoffMs.length - 1)];
        this.reconnectAttempt++;
        logger.info('BaileyClient reconnecting', { numberId: this.numberId, attempt: this.reconnectAttempt, delayMs: delay });
        setTimeout(() => {
          this.connect().catch((err) => {
            logger.error('Reconnect failed', { numberId: this.numberId, error: err.message });
          });
        }, delay);
      }
    }
  }

  /**
   * Save QR code to whatsapp_sessions for admin panel to display.
   */
  async _saveQrCode(qr) {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .upsert({
        number_id: this.numberId,
        qr_code: qr,
        last_qr_update: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'number_id' });

    if (error) {
      logger.error('Failed to save QR code', { numberId: this.numberId, error: error.message });
    }
  }

  /**
   * Clear QR code from DB after successful connection.
   */
  async _clearQrCode() {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .upsert({
        number_id: this.numberId,
        qr_code: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'number_id' });

    if (error) {
      logger.error('Failed to clear QR code', { numberId: this.numberId, error: error.message });
    }
  }

  /**
   * Update connection_state in whatsapp_sessions.
   */
  async _updateConnectionState(state) {
    const { error } = await supabase
      .from('whatsapp_sessions')
      .upsert({
        number_id: this.numberId,
        connection_state: state,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'number_id' });

    if (error) {
      logger.error('Failed to update connection state', { numberId: this.numberId, state, error: error.message });
    }
  }

  /**
   * Update status in whatsapp_numbers.
   */
  async _updateNumberStatus(status) {
    const update = { status, updated_at: new Date().toISOString() };
    if (status === 'banned') {
      update.banned_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('whatsapp_numbers')
      .update(update)
      .eq('id', this.numberId);

    if (error) {
      logger.error('Failed to update number status', { numberId: this.numberId, status, error: error.message });
    }
  }

  /**
   * Update last_heartbeat in whatsapp_numbers.
   */
  async _updateHeartbeat() {
    const { error } = await supabase
      .from('whatsapp_numbers')
      .update({ last_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', this.numberId);

    if (error) {
      logger.error('Failed to update heartbeat', { numberId: this.numberId, error: error.message });
    }
  }

  /**
   * Get reconnect stats for health endpoint.
   */
  getStats() {
    return {
      numberId: this.numberId,
      phone: this.phoneNumber,
      connected: this.socket !== null,
      reconnectAttempt: this.reconnectAttempt,
      totalReconnects: this.totalReconnects,
    };
  }

  /**
   * Create a minimal pino-compatible logger adapter for Baileys.
   * Baileys expects a pino logger but we use our own logger.
   */
  _createPinoAdapter() {
    const noop = () => {};
    return {
      level: 'silent',
      trace: noop,
      debug: noop,
      info: noop,
      warn: (msg) => logger.warn('Baileys warn', { msg, numberId: this.numberId }),
      error: (msg) => logger.error('Baileys error', { msg, numberId: this.numberId }),
      fatal: (msg) => logger.error('Baileys fatal', { msg, numberId: this.numberId }),
      child: () => this._createPinoAdapter(),
    };
  }
}

module.exports = { BaileyClient };
