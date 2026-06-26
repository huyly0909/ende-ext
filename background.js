/**
 * Background Service Worker — EnDe Extension
 * Creates context menu items for Decrypt / Encrypt on selected text.
 */

// ── Fernet crypto (inlined for service worker — no importScripts for modules) ──

const FernetBG = (() => {
  const VERSION = 0x80;

  function base64urlToBytes(str) {
    let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_');
  }

  function parseKey(keyString) {
    const keyBytes = base64urlToBytes(keyString);
    if (keyBytes.length !== 32) throw new Error(`Invalid key: expected 32 bytes, got ${keyBytes.length}`);
    return { signingKey: keyBytes.slice(0, 16), encryptionKey: keyBytes.slice(16, 32) };
  }

  function timestampToBytes(seconds) {
    const bytes = new Uint8Array(8);
    let remaining = seconds;
    for (let i = 7; i >= 0; i--) { bytes[i] = remaining & 0xff; remaining = Math.floor(remaining / 256); }
    return bytes;
  }

  async function computeHMAC(signingKey, data) {
    const key = await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, data));
  }

  async function verifyHMAC(signingKey, data, expectedHmac) {
    const key = await crypto.subtle.importKey('raw', signingKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, expectedHmac, data);
  }

  async function aesEncrypt(encryptionKey, iv, plaintext) {
    const key = await crypto.subtle.importKey('raw', encryptionKey, { name: 'AES-CBC' }, false, ['encrypt']);
    return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plaintext));
  }

  async function aesDecrypt(encryptionKey, iv, ciphertext) {
    const key = await crypto.subtle.importKey('raw', encryptionKey, { name: 'AES-CBC' }, false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext));
  }

  async function encrypt(keyString, plaintext) {
    const { signingKey, encryptionKey } = parseKey(keyString);
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const tsBytes = timestampToBytes(Math.floor(Date.now() / 1000));
    const ciphertext = await aesEncrypt(encryptionKey, iv, new TextEncoder().encode(plaintext));
    const payload = new Uint8Array(1 + 8 + 16 + ciphertext.length);
    payload[0] = VERSION;
    payload.set(tsBytes, 1);
    payload.set(iv, 9);
    payload.set(ciphertext, 25);
    const hmac = await computeHMAC(signingKey, payload);
    const token = new Uint8Array(payload.length + 32);
    token.set(payload);
    token.set(hmac, payload.length);
    return bytesToBase64url(token);
  }

  async function decrypt(keyString, tokenString) {
    const { signingKey, encryptionKey } = parseKey(keyString);
    const tokenBytes = base64urlToBytes(tokenString);
    if (tokenBytes.length < 57) throw new Error('Invalid token: too short');
    if (tokenBytes[0] !== VERSION) throw new Error('Invalid token version');
    const hmacOffset = tokenBytes.length - 32;
    const payload = tokenBytes.slice(0, hmacOffset);
    const hmac = tokenBytes.slice(hmacOffset);
    const valid = await verifyHMAC(signingKey, payload, hmac);
    if (!valid) throw new Error('HMAC verification failed — wrong key?');
    const iv = tokenBytes.slice(9, 25);
    const ciphertext = tokenBytes.slice(25, hmacOffset);
    return new TextDecoder().decode(await aesDecrypt(encryptionKey, iv, ciphertext));
  }

  return { encrypt, decrypt };
})();

// ── Context Menu Setup ──────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'fernet-auto',
    title: 'EnDe',
    contexts: ['selection'],
  });
});

// ── Detect Fernet token ─────────────────────────────────────────────

function isFernetToken(text) {
  // Fernet tokens: base64url, start with gAAAAA (version 0x80 = 'gA' in b64),
  // min ~76 chars (57 bytes base64-encoded)
  return /^gAAAAA[A-Za-z0-9_-]{70,}={0,2}$/.test(text);
}

// ── Context Menu Handler ────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selectedText = (info.selectionText || '').trim();
  if (!selectedText) return;

  // Get saved key
  const result = await chrome.storage.local.get('fernetKey');
  const key = result.fernetKey;

  if (!key) {
    // Set flag so popup knows to show key setup flow
    await chrome.storage.local.set({ needsKeySetup: true });
    try {
      await chrome.action.openPopup();
    } catch {
      // Fallback: show notification if openPopup isn't supported
      await showNotification(tab.id, '❌ No key set. Click the EnDe extension icon to set one.');
    }
    return;
  }

  // Auto-detect: if it looks like a Fernet token → decrypt, otherwise → encrypt
  const shouldDecrypt = isFernetToken(selectedText);

  try {
    let output, message;

    if (shouldDecrypt) {
      output = await FernetBG.decrypt(key, selectedText);
      message = '✅ Decrypted & copied!';
    } else {
      output = await FernetBG.encrypt(key, selectedText);
      message = '✅ Encrypted & copied!';
    }

    // Copy to clipboard via content script injection
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text, msg) => {
        navigator.clipboard.writeText(text).then(() => {
          const toast = document.createElement('div');
          toast.textContent = msg;
          Object.assign(toast.style, {
            position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
            background: '#a855f7', color: '#fff', padding: '10px 22px', borderRadius: '10px',
            fontSize: '14px', fontWeight: '600', fontFamily: 'Inter, system-ui, sans-serif',
            zIndex: '2147483647', boxShadow: '0 8px 32px rgba(168,85,247,0.35)',
            opacity: '0', transition: 'opacity 0.25s',
          });
          document.body.appendChild(toast);
          requestAnimationFrame(() => { toast.style.opacity = '1'; });
          setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
          }, 2000);
        });
      },
      args: [output, message],
    });

  } catch (err) {
    const action = shouldDecrypt ? 'Decrypt' : 'Encrypt';
    await showNotification(tab.id, `❌ ${action} failed: ${err.message}`);
  }
});

// ── Helper: show notification on page ───────────────────────────────

async function showNotification(tabId, msg) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (message) => {
        const toast = document.createElement('div');
        toast.textContent = message;
        Object.assign(toast.style, {
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#ef4444', color: '#fff', padding: '10px 22px', borderRadius: '10px',
          fontSize: '14px', fontWeight: '600', fontFamily: 'Inter, system-ui, sans-serif',
          zIndex: '2147483647', boxShadow: '0 8px 32px rgba(239,68,68,0.35)',
          opacity: '0', transition: 'opacity 0.25s', maxWidth: '400px',
        });
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; });
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => toast.remove(), 300);
        }, 3000);
      },
      args: [msg],
    });
  } catch {
    // Tab might not support scripting (e.g. chrome:// pages)
  }
}
