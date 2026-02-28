const { loadBaileys } = require('../baileys');
const { supabase } = require('../../lib/supabase');
const logger = require('../../lib/logger');
const { config } = require('../../lib/config');
const { encrypt, decrypt } = require('./encryptionHelper');

function getEncryptionKey() {
  const key = config.whatsapp?.encryptionKey;
  if (!key) {
    throw new Error('WHATSAPP_ENCRYPTION_KEY not configured');
  }
  return key;
}

/**
 * BufferJSON-aware serialization helpers.
 * Baileys stores Buffer objects in creds/keys that need special JSON handling.
 * Buffer.toJSON() returns { type: 'Buffer', data: [byte_array] }, so we handle both formats.
 */
function serializeForStorage(data) {
  return jsonDeepTransform(data, (value) => {
    if (Buffer.isBuffer(value)) {
      return { type: 'Buffer', data: value.toString('base64') };
    }
    if (value instanceof Uint8Array) {
      return { type: 'Buffer', data: Buffer.from(value).toString('base64') };
    }
    return value;
  });
}

function deserializeFromStorage(data) {
  return jsonDeepTransform(data, (value) => {
    if (value && typeof value === 'object' && value.type === 'Buffer') {
      if (typeof value.data === 'string') {
        return Buffer.from(value.data, 'base64');
      }
      if (Array.isArray(value.data)) {
        return Buffer.from(value.data);
      }
    }
    return value;
  });
}

/**
 * Recursively transform all values in a JSON-serializable structure.
 * Traverses objects and arrays depth-first, applying the transform fn to each value.
 */
function jsonDeepTransform(value, fn) {
  const transformed = fn(value);
  if (transformed !== value) return transformed;

  if (Array.isArray(value)) {
    return value.map((item) => jsonDeepTransform(item, fn));
  }
  if (value && typeof value === 'object' && value.constructor === Object) {
    const result = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = jsonDeepTransform(v, fn);
    }
    return result;
  }
  return value;
}

/**
 * Load encrypted credentials from whatsapp_sessions.
 * @param {string} numberId - UUID of the whatsapp_numbers row
 * @returns {Object|null} Decrypted creds or null if none exist
 */
async function loadCreds(numberId) {
  const { data, error } = await supabase
    .from('whatsapp_sessions')
    .select('creds')
    .eq('number_id', numberId)
    .single();

  if (error || !data?.creds) {
    return null;
  }

  const decrypted = decrypt(data.creds, getEncryptionKey());
  return deserializeFromStorage(decrypted);
}

/**
 * Save encrypted credentials to whatsapp_sessions.
 * @param {string} numberId - UUID of the whatsapp_numbers row
 * @param {Object} creds - Baileys credentials object
 */
async function saveCreds(numberId, creds) {
  const serialized = serializeForStorage(creds);
  const encrypted = encrypt(serialized, getEncryptionKey());

  const { error } = await supabase
    .from('whatsapp_sessions')
    .upsert({
      number_id: numberId,
      creds: encrypted,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'number_id' });

  if (error) {
    logger.error('Failed to save creds', { numberId, error: error.message });
    throw new Error(`Failed to save creds: ${error.message}`);
  }
}

/**
 * Load Signal keys from whatsapp_keys by type and IDs.
 * @param {string} numberId - UUID of the whatsapp_numbers row
 * @param {string} type - Key type (e.g. 'pre-key', 'sender-key')
 * @param {string[]} ids - Key IDs to fetch
 * @returns {Object} Map of id → decrypted key data
 */
async function loadKeys(numberId, type, ids) {
  const { data, error } = await supabase
    .from('whatsapp_keys')
    .select('key_id, key_data')
    .eq('number_id', numberId)
    .eq('key_type', type)
    .in('key_id', ids);

  if (error) {
    logger.error('Failed to load keys', { numberId, type, error: error.message });
    return {};
  }

  const result = {};
  for (const row of data || []) {
    const decrypted = decrypt(row.key_data, getEncryptionKey());
    result[row.key_id] = deserializeFromStorage(decrypted);
  }
  return result;
}

/**
 * Save Signal keys to whatsapp_keys (granular upsert).
 * @param {string} numberId - UUID of the whatsapp_numbers row
 * @param {Object} data - Map of type → { id: keyData | null }
 *                        null value means delete that key
 */
async function saveKeys(numberId, data) {
  const upserts = [];
  const deletes = [];

  for (const [type, keys] of Object.entries(data)) {
    for (const [id, keyData] of Object.entries(keys)) {
      if (keyData === null || keyData === undefined) {
        deletes.push({ type, id });
      } else {
        const serialized = serializeForStorage(keyData);
        const encrypted = encrypt(serialized, getEncryptionKey());
        upserts.push({
          number_id: numberId,
          key_type: type,
          key_id: id,
          key_data: encrypted,
          updated_at: new Date().toISOString(),
        });
      }
    }
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from('whatsapp_keys')
      .upsert(upserts, { onConflict: 'number_id,key_type,key_id' });

    if (error) {
      logger.error('Failed to save keys', { numberId, error: error.message });
      throw new Error(`Failed to save keys: ${error.message}`);
    }
  }

  for (const { type, id } of deletes) {
    const { error } = await supabase
      .from('whatsapp_keys')
      .delete()
      .eq('number_id', numberId)
      .eq('key_type', type)
      .eq('key_id', id);

    if (error) {
      logger.error('Failed to delete key', { numberId, type, id, error: error.message });
    }
  }
}

/**
 * Create a Baileys-compatible AuthenticationState backed by Supabase.
 * @param {string} numberId - UUID of the whatsapp_numbers row
 * @returns {{ state: { creds: Object, keys: Object }, saveCreds: Function }}
 */
async function useDatabaseAuthState(numberId) {
  const { initAuthCreds } = await loadBaileys();

  const creds = (await loadCreds(numberId)) || initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        return await loadKeys(numberId, type, ids);
      },
      set: async (data) => {
        await saveKeys(numberId, data);
      },
    },
  };

  return {
    state,
    saveCreds: async () => {
      // Reference state.creds (not captured variable) so Baileys mutations are saved
      await saveCreds(numberId, state.creds);
    },
  };
}

module.exports = { useDatabaseAuthState, loadCreds, saveCreds, loadKeys, saveKeys };
