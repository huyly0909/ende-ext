# 🔐 Fernet EnDe

A simple Chrome extension to **encrypt & decrypt** text using [Fernet](https://github.com/fernet/spec/blob/master/Spec.md) symmetric encryption.

Zero dependencies. Pure vanilla JS + Web Crypto API.

## Features

- **Decrypt** — Paste a Fernet token → instantly decrypted + auto-copied to clipboard
- **Encrypt** — Enter plaintext → get a Fernet token + auto-copied to clipboard
- **Key Management** — Fernet key stored locally, never leaves your browser
- **Generate Key** — One-click random key generation
- **Keyboard Shortcut** — Press `N` to clear fields and start fresh
- **Cross-compatible** — Tokens work with Python's `cryptography.fernet.Fernet`

## Install

### From source (Developer mode)

```bash
git clone https://github.com/huyly0909/ende-ext.git
cd ende-ext
make build
```

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `dist/unpacked/`

### From zip

Download the latest zip from [Releases](https://github.com/huyly0909/ende-ext/releases), unzip, then load unpacked.

## Usage

### Decrypt

1. Click the extension icon → **Decrypt** tab (default)
2. Paste a Fernet token
3. Press `Enter` or click the 🔓 button
4. Decrypted text is **auto-copied** to your clipboard

### Encrypt

1. Switch to the **Encrypt** tab
2. Enter your Fernet key (or click 🔄 to generate one)
3. Save the key
4. Type your plaintext and press `Enter` or click 🔒
5. Encrypted token is **auto-copied** to your clipboard

### Generate a test key (Python)

```python
from cryptography.fernet import Fernet

key = Fernet.generate_key()
print(key.decode())  # Paste into extension

f = Fernet(key)
token = f.encrypt(b"Hello World")
print(token.decode())  # Paste to decrypt
```

## Build

```bash
make build    # Build → dist/unpacked/ + dist/versions/ende-<timestamp>.zip
make list     # List all builds
make clean    # Remove dist/
```

## Tech Stack

| Component | Technology |
|---|---|
| Crypto | Web Crypto API (AES-128-CBC + HMAC-SHA256) |
| Storage | `chrome.storage.local` |
| UI | Vanilla HTML/CSS/JS |
| Font | [Inter](https://fonts.google.com/specimen/Inter) |
| Bundler | None — zero dependencies |

## Security

- Fernet key is stored in `chrome.storage.local` (persists until extension is removed)
- Key never leaves your browser — no network requests, no telemetry
- Encryption follows the [Fernet Spec](https://github.com/fernet/spec/blob/master/Spec.md) exactly
- All crypto operations use the browser's native [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## License

MIT — free to use, modify, and distribute.

## Author

**huyly0909**
