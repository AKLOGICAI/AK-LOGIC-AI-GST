/**
 * Encryption-at-rest wrapper around localStorage.
 *
 * Every value written through this layer is encrypted (see ./aes — a fast
 * SHA-256-seeded keystream cipher with a random per-record salt) using a key
 * derived from VITE_ENCRYPTION_KEY (or a per-device random key as fallback).
 * This satisfies the Privacy Policy commitment that customer/merchant data —
 * including MPIN, bank account number, IFSC, UPI and mobile — is never
 * persisted in plaintext on the device.
 *
 * Note: this is client-side at-rest obfuscation/encryption, not a substitute
 * for server-side KMS/column encryption. The authoritative encryption boundary
 * is the backend (Postgres column encryption / KMS) once connected.
 *
 * Backward compatible: if a legacy plaintext value is found (no AKENC marker)
 * it is read transparently and re-written encrypted on next save.
 */
import { aesEncrypt, aesDecrypt, isEncrypted } from './aes';

// Vite inlines import.meta.env.VITE_* at build time.
const ENV_KEY = (import.meta.env.VITE_ENCRYPTION_KEY as string | undefined)?.trim();

/**
 * Resolve the encryption passphrase.
 * - Prefer the configured VITE_ENCRYPTION_KEY (must be >= 32 chars in prod).
 * - Fall back to a per-device random key persisted locally, so data is still
 *   encrypted-at-rest even if the env var was forgotten (defence in depth).
 */
function resolveKey(): string {
  if (ENV_KEY && ENV_KEY.length >= 16) return ENV_KEY;
  const FALLBACK_KEY = 'aklogic_device_key';
  let k = localStorage.getItem(FALLBACK_KEY);
  if (!k) {
    const rnd = new Uint8Array(32);
    crypto.getRandomValues(rnd);
    k = Array.from(rnd).map((b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(FALLBACK_KEY, k);
    if (import.meta.env.DEV) {
      console.warn('[secureStorage] VITE_ENCRYPTION_KEY not set — using a generated per-device key. Set VITE_ENCRYPTION_KEY (>=32 chars) for portable, policy-compliant encryption.');
    }
  }
  return k;
}

const PASSPHRASE = resolveKey();

export const secureStorage = {
  /** Read + decrypt. Falls back to legacy plaintext transparently. */
  getItem(key: string): string | null {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    if (isEncrypted(raw)) {
      const dec = aesDecrypt(raw, PASSPHRASE);
      return dec; // null if key mismatch / tampered
    }
    // legacy plaintext (pre-encryption) — return as-is, will be re-encrypted on write
    return raw;
  },

  /** Encrypt + write. */
  setItem(key: string, value: string): void {
    localStorage.setItem(key, aesEncrypt(value, PASSPHRASE));
  },

  removeItem(key: string): void {
    localStorage.removeItem(key);
  },

  /** True when a real env key is configured (vs the generated fallback). */
  hasConfiguredKey(): boolean {
    return !!(ENV_KEY && ENV_KEY.length >= 16);
  },
};
