import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;        // GCM recommends 12 bytes
const AUTH_TAG_LENGTH = 16;   // 128 bits

export function encrypt(plaintext: string, keyVersion = 1): string {
  const key = getKey(keyVersion);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: version:iv:authTag:ciphertext
  return `${keyVersion}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(encrypted: string): string {
  const [versionStr, ivHex, authTagHex, ciphertext] = encrypted.split(':');
  const key = getKey(Number(versionStr));
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function getKey(version: number): Buffer {
  const envKey = version === 1 ? 'ENCRYPTION_KEY' : `ENCRYPTION_KEY_V${version}`;
  const key = process.env[envKey];
  if (!key) throw new Error(`Encryption key ${envKey} not found`);
  return Buffer.from(key, 'hex'); // 64-char hex → 32 bytes
}
