const { loadBaileys } = require('../baileys');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { useDatabaseAuthState } = require('../store/authStateStore');
const { phoneToJid } = require('../../lib/phoneUtils');

const DEFAULT_BACKOFF_MS = [1000, 5000, 15000, 30000, 60000];
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const SEND_TIMEOUT_MS = 30000;

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
    this._onGroupParticipantsUpdate = null;
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

    // Story 15-1: Listen for group participant changes (member joins/leaves)
    this.socket.ev.on('group-participants.update', async (event) => {
      if (this._onGroupParticipantsUpdate) {
        try {
          await this._onGroupParticipantsUpdate(event, this);
        } catch (err) {
          logger.error('Error in group-participants.update handler', {
            numberId: this.numberId, error: err.message,
          });
        }
      }
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

    logger.info('Connection update received', {
      numberId: this.numberId,
      connection,
      hasQr: !!qr,
      qrLen: qr ? qr.length : 0,
      statusCode: lastDisconnect?.error?.output?.statusCode,
      errorMsg: lastDisconnect?.error?.message,
      updateKeys: Object.keys(update),
    });

    // QR code generated — save to DB for admin panel display
    if (qr) {
      await this._saveQrCode(qr);
      logger.info('QR code generated and saved', { numberId: this.numberId, qrLen: qr.length });
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

        // Trigger automatic failover (async, non-blocking)
        this._triggerFailover().catch((err) => {
          logger.error('BaileyClient failover trigger failed', { numberId: this.numberId, error: err.message });
        });
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
   * Trigger automatic failover after a ban is detected.
   * Resolves the group_id for this number and delegates to failoverService.
   */
  async _triggerFailover() {
    // Resolve group_id for this number (may already be cleared by _updateNumberStatus)
    const { data: numberRow, error: queryErr } = await supabase
      .from('whatsapp_numbers')
      .select('group_id')
      .eq('id', this.numberId)
      .single();

    if (queryErr) {
      logger.error('[failover] Failed to query group_id for banned number', { numberId: this.numberId, error: queryErr.message });
      return;
    }

    const groupId = numberRow?.group_id;
    if (!groupId) {
      logger.info('[failover] Banned number has no group_id, skipping failover', { numberId: this.numberId });
      return;
    }

    const { handleFailover } = require('../services/failoverService');
    const result = await handleFailover(this.numberId, groupId, 'ban');

    if (result.success) {
      logger.info('[failover] Automatic failover completed', { numberId: this.numberId, groupId, data: result.data });
    } else {
      logger.error('[failover] Automatic failover failed', { numberId: this.numberId, groupId, error: result.error });
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
   * Send a text message to a JID (group or individual).
   * @param {string} jid - Target JID (group@g.us or user@s.whatsapp.net)
   * @param {string} text - Message text (WhatsApp formatting)
   * @returns {Promise<{success: boolean, data?: {messageId: string}, error?: {code: string, message: string}}>}
   */
  async sendMessage(jid, text) {
    if (!this.socket) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Client is not connected' } };
    }

    try {
      const result = await Promise.race([
        this.socket.sendMessage(jid, { text }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), SEND_TIMEOUT_MS)),
      ]);
      return { success: true, data: { messageId: result.key.id } };
    } catch (err) {
      logger.error('Failed to send message', { numberId: this.numberId, jid, error: err.message });
      return { success: false, error: { code: 'SEND_FAILED', message: err.message } };
    }
  }

  /**
   * Send an image message with optional caption.
   * @param {string} jid - Target JID
   * @param {string} imageUrl - URL of the image
   * @param {string} [caption] - Optional caption text (WhatsApp formatting)
   * @returns {Promise<{success: boolean, data?: {messageId: string}, error?: {code: string, message: string}}>}
   */
  async sendImage(jid, imageUrl, caption) {
    if (!this.socket) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Client is not connected' } };
    }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return { success: false, error: { code: 'INVALID_IMAGE_URL', message: 'imageUrl is required and must be a string' } };
    }

    try {
      const content = { image: { url: imageUrl } };
      if (caption) content.caption = caption;
      const result = await Promise.race([
        this.socket.sendMessage(jid, content),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), SEND_TIMEOUT_MS)),
      ]);
      return { success: true, data: { messageId: result.key.id } };
    } catch (err) {
      logger.error('Failed to send image', { numberId: this.numberId, jid, error: err.message });
      return { success: false, error: { code: 'SEND_FAILED', message: err.message } };
    }
  }

  /**
   * Create a WhatsApp group and set it to announce mode (only admins can post).
   * @param {string} groupName - Name of the group
   * @param {string[]} participantJids - JIDs of participants to add
   * @returns {Promise<{success: boolean, data?: {groupJid: string}, error?: {code: string, message: string}}>}
   */
  async createGroup(groupName, participantJids) {
    if (!this.socket) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Client is not connected' } };
    }

    if (!groupName || typeof groupName !== 'string') {
      return { success: false, error: { code: 'INVALID_GROUP_NAME', message: 'groupName is required' } };
    }

    try {
      const createAndConfigure = async () => {
        const result = await this.socket.groupCreate(groupName, participantJids || []);
        const groupJid = result.id || result.gid;
        // Set to announce mode (only admins can post)
        await this.socket.groupSettingUpdate(groupJid, 'announcement');
        return groupJid;
      };

      const groupJid = await Promise.race([
        createAndConfigure(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Group creation timeout')), SEND_TIMEOUT_MS)),
      ]);

      logger.info('WhatsApp group created', { numberId: this.numberId, groupJid, groupName });
      return { success: true, data: { groupJid } };
    } catch (err) {
      logger.error('Failed to create WhatsApp group', { numberId: this.numberId, groupName, error: err.message });
      return { success: false, error: { code: 'GROUP_CREATE_FAILED', message: err.message } };
    }
  }

  /**
   * Get the current invite link for a WhatsApp group.
   * @param {string} groupJid - Group JID (e.g. '120363xxx@g.us')
   * @returns {Promise<{success: boolean, data?: {inviteLink: string}, error?: {code: string, message: string}}>}
   */
  async getGroupInviteLink(groupJid) {
    if (!this.socket) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Client is not connected' } };
    }

    if (!groupJid || typeof groupJid !== 'string') {
      return { success: false, error: { code: 'INVALID_JID', message: 'groupJid is required' } };
    }

    try {
      const code = await Promise.race([
        this.socket.groupInviteCode(groupJid),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Invite link timeout')), SEND_TIMEOUT_MS)),
      ]);

      const inviteLink = `https://chat.whatsapp.com/${code}`;
      logger.info('Got group invite link', { numberId: this.numberId, groupJid });
      return { success: true, data: { inviteLink } };
    } catch (err) {
      logger.error('Failed to get group invite link', { numberId: this.numberId, groupJid, error: err.message });
      return { success: false, error: { code: 'INVITE_LINK_FAILED', message: err.message } };
    }
  }

  /**
   * Revoke the current invite link and get a new one.
   * @param {string} groupJid - Group JID
   * @returns {Promise<{success: boolean, data?: {inviteLink: string}, error?: {code: string, message: string}}>}
   */
  async revokeGroupInviteLink(groupJid) {
    if (!this.socket) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Client is not connected' } };
    }

    if (!groupJid || typeof groupJid !== 'string') {
      return { success: false, error: { code: 'INVALID_JID', message: 'groupJid is required' } };
    }

    try {
      const newCode = await Promise.race([
        this.socket.groupRevokeInvite(groupJid),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Revoke invite timeout')), SEND_TIMEOUT_MS)),
      ]);

      const inviteLink = `https://chat.whatsapp.com/${newCode}`;
      logger.info('Revoked and regenerated group invite link', { numberId: this.numberId, groupJid });
      return { success: true, data: { inviteLink } };
    } catch (err) {
      logger.error('Failed to revoke group invite link', { numberId: this.numberId, groupJid, error: err.message });
      return { success: false, error: { code: 'REVOKE_INVITE_FAILED', message: err.message } };
    }
  }

  /**
   * Set callback for group participant update events.
   * Story 15-1: Used to detect new members joining/leaving WhatsApp groups.
   * @param {Function} callback - async (event, client) => void
   */
  setGroupParticipantsHandler(callback) {
    this._onGroupParticipantsUpdate = callback;
  }

  /**
   * Remove a participant from a WhatsApp group.
   * Story 15-1: Used for kicking inadimplent members.
   * @param {string} groupJid - Group JID
   * @param {string} participantJid - Participant JID to remove
   * @returns {Promise<{success: boolean, error?: {code: string, message: string}}>}
   */
  async removeGroupParticipant(groupJid, participantJid) {
    if (!this.socket) {
      return { success: false, error: { code: 'NOT_CONNECTED', message: 'Client is not connected' } };
    }

    if (!groupJid || !participantJid) {
      return { success: false, error: { code: 'INVALID_INPUT', message: 'groupJid and participantJid are required' } };
    }

    try {
      await Promise.race([
        this.socket.groupParticipantsUpdate(groupJid, [participantJid], 'remove'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Remove participant timeout')), SEND_TIMEOUT_MS)),
      ]);

      logger.info('Removed participant from group', { numberId: this.numberId, groupJid, participantJid });
      return { success: true };
    } catch (err) {
      logger.error('Failed to remove participant', { numberId: this.numberId, groupJid, participantJid, error: err.message });
      return { success: false, error: { code: 'REMOVE_FAILED', message: err.message } };
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
