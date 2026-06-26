/**
 * Popup UI Logic — EnDe Extension
 */

document.addEventListener('DOMContentLoaded', () => {
  // ── DOM Elements ─────────────────────────────────────────────────

  const btnDecrypt = document.getElementById('btnDecrypt');
  const btnEncrypt = document.getElementById('btnEncrypt');
  const toggleIndicator = document.getElementById('toggleIndicator');

  const sectionDecrypt = document.getElementById('sectionDecrypt');
  const sectionEncrypt = document.getElementById('sectionEncrypt');

  const noKeyOverlay = document.getElementById('noKeyOverlay');
  const btnGoEncrypt = document.getElementById('btnGoEncrypt');

  // Decrypt
  const decryptInput = document.getElementById('decryptInput');
  const btnDoDecrypt = document.getElementById('btnDoDecrypt');
  const decryptOutput = document.getElementById('decryptOutput');
  const btnCopyDecrypt = document.getElementById('btnCopyDecrypt');

  // Encrypt
  const keyInput = document.getElementById('keyInput');
  const btnEye = document.getElementById('btnEye');
  const eyeIcon = document.getElementById('eyeIcon');
  const eyeOffIcon = document.getElementById('eyeOffIcon');
  const btnCopyKey = document.getElementById('btnCopyKey');
  const btnGenerateKey = document.getElementById('btnGenerateKey');
  const keyStatus = document.getElementById('keyStatus');

  const encryptInput = document.getElementById('encryptInput');
  const btnDoEncrypt = document.getElementById('btnDoEncrypt');
  const encryptOutput = document.getElementById('encryptOutput');
  const btnCopyEncrypt = document.getElementById('btnCopyEncrypt');

  // Toast
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const toastError = document.getElementById('toastError');
  const toastErrorMsg = document.getElementById('toastErrorMsg');

  // ── State ────────────────────────────────────────────────────────

  let currentMode = 'decrypt';
  let savedKey = null;
  let toastTimeout = null;
  let errorTimeout = null;
  let keyHidden = true;     // tracks whether key is in hidden mode
  let realKeyValue = '';    // the actual key value (since we mask the input)

  // ── Init ─────────────────────────────────────────────────────────

  init();

  async function init() {
    // Load key from storage
    const result = await chrome.storage.local.get(['fernetKey', 'needsKeySetup']);
    if (result.fernetKey) {
      savedKey = result.fernetKey;
      realKeyValue = savedKey;
      applyKeyMask();
      noKeyOverlay.classList.add('hidden');
      setKeyStatus('Key loaded', 'info');
    } else {
      noKeyOverlay.classList.remove('hidden');
    }

    // If opened via context menu with no key → redirect to key setup
    if (result.needsKeySetup) {
      await chrome.storage.local.remove('needsKeySetup');
      switchMode('encrypt');
      keyInput.placeholder = 'Paste key or press ↻ to generate';
      keyHidden = false;
      eyeIcon.classList.add('hidden');
      eyeOffIcon.classList.remove('hidden');
      applyKeyMask();
      keyInput.focus();
    }
  }

  // ── Key masking helpers ────────────────────────────────────────

  function applyKeyMask() {
    if (keyHidden && realKeyValue.length > 0) {
      const last4 = realKeyValue.slice(-4);
      keyInput.value = '••••••••' + last4;
      keyInput.type = 'text';
    } else {
      keyInput.value = realKeyValue;
      keyInput.type = 'text';
    }
  }

  // Track real key value when user types (only when not masked)
  keyInput.addEventListener('input', () => {
    if (!keyHidden) {
      realKeyValue = keyInput.value;
    }
  });

  // ── Toggle ───────────────────────────────────────────────────────

  function switchMode(mode) {
    currentMode = mode;

    if (mode === 'decrypt') {
      btnDecrypt.classList.add('active');
      btnEncrypt.classList.remove('active');
      toggleIndicator.classList.remove('right');
      sectionDecrypt.classList.remove('hidden');
      sectionEncrypt.classList.add('hidden');
      decryptInput.focus();
    } else {
      btnEncrypt.classList.add('active');
      btnDecrypt.classList.remove('active');
      toggleIndicator.classList.add('right');
      sectionEncrypt.classList.remove('hidden');
      sectionDecrypt.classList.add('hidden');
      if (!savedKey) {
        keyInput.focus();
      } else {
        encryptInput.focus();
      }
    }
  }

  btnDecrypt.addEventListener('click', () => switchMode('decrypt'));
  btnEncrypt.addEventListener('click', () => switchMode('encrypt'));
  btnGoEncrypt.addEventListener('click', () => switchMode('encrypt'));

  // ── Eye Toggle ───────────────────────────────────────────────────

  btnEye.addEventListener('click', () => {
    keyHidden = !keyHidden;
    eyeIcon.classList.toggle('hidden', !keyHidden);
    eyeOffIcon.classList.toggle('hidden', keyHidden);
    applyKeyMask();
  });

  // ── Generate Key ─────────────────────────────────────────────────

  btnGenerateKey.addEventListener('click', async () => {
    const newKey = Fernet.generateKey();
    realKeyValue = newKey;
    applyKeyMask();

    // Auto-save immediately
    await chrome.storage.local.set({ fernetKey: newKey });
    savedKey = newKey;
    noKeyOverlay.classList.add('hidden');
    setKeyStatus('New key generated & saved', 'success');
  });

  // ── Copy Key ────────────────────────────────────────────────────

  btnCopyKey.addEventListener('click', async () => {
    const key = realKeyValue.trim();
    if (!key) {
      showError('No key to copy');
      return;
    }
    await navigator.clipboard.writeText(key);
    showToast('Key copied to clipboard!');
  });

  // ── Auto-save key on blur (when dirty) ──────────────────────────

  keyInput.addEventListener('focus', () => {
    // When focusing, switch to reveal mode so user can edit
    if (keyHidden) {
      keyHidden = false;
      eyeIcon.classList.add('hidden');
      eyeOffIcon.classList.remove('hidden');
      applyKeyMask();
    }
  });

  keyInput.addEventListener('blur', async () => {
    const key = realKeyValue.trim();

    // Always re-mask on blur
    keyHidden = true;
    eyeIcon.classList.remove('hidden');
    eyeOffIcon.classList.add('hidden');
    realKeyValue = key; // trim stored value
    applyKeyMask();

    // Auto-save if dirty
    if (key && key !== savedKey) {
      await saveKey();
    }
  });

  async function saveKey() {
    const key = realKeyValue.trim();

    if (!key) {
      setKeyStatus('Please enter a key', 'error');
      return;
    }

    if (!Fernet.validateKey(key)) {
      setKeyStatus('Invalid Fernet key (must be 32 bytes base64)', 'error');
      return;
    }

    await chrome.storage.local.set({ fernetKey: key });
    savedKey = key;
    noKeyOverlay.classList.add('hidden');
    setKeyStatus('Key saved ✓', 'success');

    showToast('Key saved successfully');
  }

  function setKeyStatus(msg, type) {
    keyStatus.textContent = msg;
    keyStatus.className = 'key-status ' + type;
  }

  // ── Decrypt ──────────────────────────────────────────────────────

  btnDoDecrypt.addEventListener('click', doDecrypt);
  decryptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doDecrypt();
  });

  async function doDecrypt() {
    const token = decryptInput.value.trim();
    if (!token) {
      showError('Please enter an encrypted token');
      return;
    }

    if (!savedKey) {
      showError('No Fernet key set');
      switchMode('encrypt');
      return;
    }

    try {
      const plaintext = await Fernet.decrypt(savedKey, token);
      decryptOutput.value = plaintext;

      // Auto-copy to clipboard
      await navigator.clipboard.writeText(plaintext);
      showToast('Decrypted & copied to clipboard!');
    } catch (err) {
      decryptOutput.value = '';
      showError(err.message || 'Decryption failed');
    }
  }

  btnCopyDecrypt.addEventListener('click', async () => {
    const text = decryptOutput.value;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  });

  // ── Encrypt ──────────────────────────────────────────────────────

  btnDoEncrypt.addEventListener('click', doEncrypt);
  encryptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doEncrypt();
  });

  async function doEncrypt() {
    const plaintext = encryptInput.value;
    if (!plaintext) {
      showError('Please enter text to encrypt');
      return;
    }

    // Use the key from input (might be unsaved), fall back to saved
    let key = realKeyValue.trim() || savedKey;

    if (!key) {
      showError('Please set a Fernet key first');
      keyInput.focus();
      return;
    }

    if (!Fernet.validateKey(key)) {
      showError('Invalid Fernet key');
      return;
    }

    // Auto-save key if not saved yet
    if (key !== savedKey) {
      await chrome.storage.local.set({ fernetKey: key });
      savedKey = key;
      noKeyOverlay.classList.add('hidden');
      setKeyStatus('Key auto-saved ✓', 'success');
    }

    try {
      const token = await Fernet.encrypt(key, plaintext);
      encryptOutput.value = token;
      await navigator.clipboard.writeText(token);
      showToast('Encrypted & copied to clipboard!');
    } catch (err) {
      encryptOutput.value = '';
      showError(err.message || 'Encryption failed');
    }
  }

  btnCopyEncrypt.addEventListener('click', async () => {
    const text = encryptOutput.value;
    if (!text) return;
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  });

  // ── Toast ────────────────────────────────────────────────────────

  function showToast(msg) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastMsg.textContent = msg;
    toast.classList.add('visible');
    toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 2200);
  }

  function showError(msg) {
    if (errorTimeout) clearTimeout(errorTimeout);
    toastErrorMsg.textContent = msg;
    toastError.classList.add('visible');
    errorTimeout = setTimeout(() => {
      toastError.classList.remove('visible');
    }, 3000);
  }

  // ── Keyboard Shortcuts ───────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    // 'N' → clear all content in current mode
    if (e.key === 'n' || e.key === 'N') {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return; // don't hijack typing

      e.preventDefault();
      if (currentMode === 'decrypt') {
        decryptInput.value = '';
        decryptOutput.value = '';
        decryptInput.focus();
      } else {
        encryptInput.value = '';
        encryptOutput.value = '';
        encryptInput.focus();
      }
    }
  });

  // ── Delete Key (hidden feature via key status click) ─────────────

  keyStatus.addEventListener('dblclick', async () => {
    if (!savedKey) return;
    if (confirm('Delete saved Fernet key?')) {
      await chrome.storage.local.remove('fernetKey');
      savedKey = null;
      keyInput.value = '';
      noKeyOverlay.classList.remove('hidden');
      setKeyStatus('Key deleted', 'error');
    }
  });
});
