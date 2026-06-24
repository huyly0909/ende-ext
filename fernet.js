/**
 * Fernet Encryption/Decryption Engine
 * Pure implementation using Web Crypto API (no dependencies)
 *
 * Fernet Spec: https://github.com/fernet/spec/blob/master/Spec.md
 *
 * Token format: Version (1B) || Timestamp (8B) || IV (16B) || Ciphertext (var) || HMAC (32B)
 * Key format:   Base64url of SigningKey (16B) || EncryptionKey (16B)
 */

const Fernet = (() => {
  const VERSION = 0x80;

  // ── Base64url helpers ──────────────────────────────────────────────

  function base64urlToBytes(str) {
    // Fernet keys use standard base64 with = padding and +/ chars,
    // but tokens use base64url. Handle both.
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Add padding if missing
    while (b64.length % 4 !== 0) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function bytesToBase64url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
  }

  // ── Key parsing ────────────────────────────────────────────────────

  function parseKey(keyString) {
    const keyBytes = base64urlToBytes(keyString);
    if (keyBytes.length !== 32) {
      throw new Error(`Invalid Fernet key: expected 32 bytes, got ${keyBytes.length}`);
    }
    return {
      signingKey: keyBytes.slice(0, 16),
      encryptionKey: keyBytes.slice(16, 32),
    };
  }

  // ── PKCS7 padding ─────────────────────────────────────────────────

  function pkcs7Pad(data) {
    const blockSize = 16;
    const padLen = blockSize - (data.length % blockSize);
    const padded = new Uint8Array(data.length + padLen);
    padded.set(data);
    for (let i = data.length; i < padded.length; i++) {
      padded[i] = padLen;
    }
    return padded;
  }

  function pkcs7Unpad(data) {
    if (data.length === 0) throw new Error('Invalid padding: empty data');
    const padLen = data[data.length - 1];
    if (padLen < 1 || padLen > 16) throw new Error('Invalid PKCS7 padding value');
    for (let i = data.length - padLen; i < data.length; i++) {
      if (data[i] !== padLen) throw new Error('Invalid PKCS7 padding');
    }
    return data.slice(0, data.length - padLen);
  }

  // ── Timestamp helpers ──────────────────────────────────────────────

  function timestampToBytes(seconds) {
    const bytes = new Uint8Array(8);
    // Big-endian 64-bit unsigned integer
    // JS doesn't have native 64-bit int, but timestamps fit in 53 bits
    let remaining = seconds;
    for (let i = 7; i >= 0; i--) {
      bytes[i] = remaining & 0xff;
      remaining = Math.floor(remaining / 256);
    }
    return bytes;
  }

  // ── Core crypto operations ─────────────────────────────────────────

  async function computeHMAC(signingKey, data) {
    const key = await crypto.subtle.importKey(
      'raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, data);
    return new Uint8Array(sig);
  }

  async function verifyHMAC(signingKey, data, expectedHmac) {
    const key = await crypto.subtle.importKey(
      'raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    return crypto.subtle.verify('HMAC', key, expectedHmac, data);
  }

  async function aesEncrypt(encryptionKey, iv, plaintext) {
    const key = await crypto.subtle.importKey(
      'raw', encryptionKey, { name: 'AES-CBC' }, false, ['encrypt']
    );
    // Web Crypto AES-CBC does PKCS7 padding automatically
    const ct = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plaintext);
    return new Uint8Array(ct);
  }

  async function aesDecrypt(encryptionKey, iv, ciphertext) {
    const key = await crypto.subtle.importKey(
      'raw', encryptionKey, { name: 'AES-CBC' }, false, ['decrypt']
    );
    const pt = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext);
    return new Uint8Array(pt);
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Encrypt plaintext string with a Fernet key.
   * @param {string} keyString - Base64-encoded 32-byte Fernet key
   * @param {string} plaintext - UTF-8 string to encrypt
   * @returns {Promise<string>} - Fernet token (base64url)
   */
  async function encrypt(keyString, plaintext) {
    const { signingKey, encryptionKey } = parseKey(keyString);

    const iv = crypto.getRandomValues(new Uint8Array(16));
    const timestamp = Math.floor(Date.now() / 1000);
    const tsBytes = timestampToBytes(timestamp);

    const plaintextBytes = new TextEncoder().encode(plaintext);
    const ciphertext = await aesEncrypt(encryptionKey, iv, plaintextBytes);

    // Build token payload: Version || Timestamp || IV || Ciphertext
    const payload = new Uint8Array(1 + 8 + 16 + ciphertext.length);
    payload[0] = VERSION;
    payload.set(tsBytes, 1);
    payload.set(iv, 9);
    payload.set(ciphertext, 25);

    // HMAC over payload
    const hmac = await computeHMAC(signingKey, payload);

    // Final token: payload || HMAC
    const token = new Uint8Array(payload.length + 32);
    token.set(payload);
    token.set(hmac, payload.length);

    return bytesToBase64url(token);
  }

  /**
   * Decrypt a Fernet token with a Fernet key.
   * @param {string} keyString - Base64-encoded 32-byte Fernet key
   * @param {string} tokenString - Fernet token (base64url)
   * @returns {Promise<string>} - Decrypted UTF-8 string
   */
  async function decrypt(keyString, tokenString) {
    const { signingKey, encryptionKey } = parseKey(keyString);

    const tokenBytes = base64urlToBytes(tokenString);

    if (tokenBytes.length < 57) {
      throw new Error('Invalid token: too short');
    }

    // Extract components
    const version = tokenBytes[0];
    if (version !== VERSION) {
      throw new Error(`Invalid token version: expected 0x${VERSION.toString(16)}, got 0x${version.toString(16)}`);
    }

    const hmacOffset = tokenBytes.length - 32;
    const payload = tokenBytes.slice(0, hmacOffset);
    const hmac = tokenBytes.slice(hmacOffset);

    // Verify HMAC
    const valid = await verifyHMAC(signingKey, payload, hmac);
    if (!valid) {
      throw new Error('Invalid token: HMAC verification failed. Check your key.');
    }

    // Decrypt
    const iv = tokenBytes.slice(9, 25);
    const ciphertext = tokenBytes.slice(25, hmacOffset);

    const plaintext = await aesDecrypt(encryptionKey, iv, ciphertext);
    return new TextDecoder().decode(plaintext);
  }

  /**
   * Validate that a string is a valid Fernet key format.
   * @param {string} keyString
   * @returns {boolean}
   */
  function validateKey(keyString) {
    try {
      parseKey(keyString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new random Fernet key.
   * @returns {string} - Base64url-encoded 32-byte key
   */
  function generateKey() {
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    return bytesToBase64url(keyBytes);
  }

  return { encrypt, decrypt, validateKey, generateKey };
})();
