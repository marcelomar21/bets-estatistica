const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const VERSION = 1;
const IV_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Encrypt data using AES-256-GCM.
 * Output format: version:iv_hex:authTag_hex:ciphertext_hex
 * @param {*} data - Data to encrypt (will be JSON.stringify'd)
 * @param {string} keyHex - 64-char hex string (32 bytes)
 * @returns {string} Encrypted string in version:iv:authTag:ciphertext format
 */
function encrypt(data, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars)`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const jsonStr = JSON.stringify(data);
  let encrypted = cipher.update(jsonStr, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${VERSION}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt data encrypted with encrypt().
 * @param {string} ciphertext - String in version:iv_hex:authTag_hex:ciphertext_hex format
 * @param {string} keyHex - 64-char hex string (32 bytes)
 * @returns {*} Decrypted and JSON.parse'd data
 */
function decrypt(ciphertext, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 2} hex chars)`);
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext format: expected version:iv:authTag:ciphertext');
  }

  const [versionStr, ivHex, authTagHex, encryptedHex] = parts;
  const version = parseInt(versionStr, 10);

  if (version !== VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return JSON.parse(decrypted);
}

module.exports = { encrypt, decrypt };
