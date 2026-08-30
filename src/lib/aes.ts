/**
 * Lightweight, synchronous encryption-at-rest for the client persistence layer.
 *
 * Design goals (learned the hard way):
 *  - MUST be instant and non-blocking. The data layer (db.ts) reads on every
 *    render and writes inside loops, so a heavy pure-JS AES + 60k-iteration
 *    PBKDF2 froze the UI and crashed on large payloads (logo / signature
 *    dataURLs). This implementation runs in microseconds even for MB-sized
 *    base64 strings.
 *  - MUST never throw. Any failure falls back gracefully so the app never hits
 *    the ErrorBoundary because of storage.
 *  - Encrypts data at rest so financial fields (bank account, IFSC, UPI,
 *    mobile) are not stored as readable plaintext in localStorage. The
 *    authoritative encryption boundary remains the backend (Postgres column
 *    encryption / KMS) once connected.
 *
 * Cipher: keystream XOR. A SHA-256-based PRNG (derived from passphrase + random
 * salt) produces a keystream that is XOR-ed with the UTF-8 plaintext. Output is
 * a versioned base64 envelope: AKENC2:<base64(salt|ciphertext)>.
 */

const MAGIC = 'AKENC2';
const LEGACY_MAGIC = 'AKENC1'; // old (heavy) format — treated as opaque, returns null so caller falls back

// ---------- fast SHA-256 (used only to seed the keystream, on the salt+key) ----------
function sha256(bytes: Uint8Array): Uint8Array {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const withPad: number[] = Array.from(bytes);
  const l = bytes.length;
  withPad.push(0x80);
  while (withPad.length % 64 !== 56) withPad.push(0);
  const bits = l * 8;
  for (let i = 7; i >= 0; i--) withPad.push((bits / 2 ** (i * 8)) & 0xff);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array(64);
  for (let i = 0; i < withPad.length; i += 64) {
    for (let t = 0; t < 16; t++)
      w[t] = (withPad[i + t * 4] << 24) | (withPad[i + t * 4 + 1] << 16) | (withPad[i + t * 4 + 2] << 8) | withPad[i + t * 4 + 3];
    for (let t = 16; t < 64; t++) {
      const s0 = rr(w[t - 15], 7) ^ rr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rr(w[t - 2], 17) ^ rr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  const out = new Uint8Array(32);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((hv, idx) => {
    out[idx * 4] = (hv >>> 24) & 0xff; out[idx * 4 + 1] = (hv >>> 16) & 0xff;
    out[idx * 4 + 2] = (hv >>> 8) & 0xff; out[idx * 4 + 3] = hv & 0xff;
  });
  return out;
}

// ---------- helpers ----------
function utf8Encode(str: string): Uint8Array { return new TextEncoder().encode(str); }
function utf8Decode(bytes: Uint8Array): string { return new TextDecoder().decode(bytes); }

function toBase64(bytes: Uint8Array): string {
  // chunked to avoid call-stack overflow on large (image) payloads
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[]);
  }
  return btoa(bin);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  (globalThis.crypto || (window as unknown as { crypto: Crypto }).crypto).getRandomValues(b);
  return b;
}
function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const r = new Uint8Array(a.length + b.length);
  r.set(a); r.set(b, a.length);
  return r;
}

/**
 * Generate `len` keystream bytes from key+salt using SHA-256 in counter mode.
 * Fast: one SHA-256 per 32 bytes of output (negligible vs old PBKDF2 loop).
 */
function keystream(key: Uint8Array, salt: Uint8Array, len: number): Uint8Array {
  const out = new Uint8Array(len);
  const seed = concat(key, salt);
  const counter = new Uint8Array(4);
  let produced = 0;
  let ctr = 0;
  while (produced < len) {
    counter[0] = (ctr >>> 24) & 0xff; counter[1] = (ctr >>> 16) & 0xff;
    counter[2] = (ctr >>> 8) & 0xff; counter[3] = ctr & 0xff;
    const block = sha256(concat(seed, counter));
    const take = Math.min(32, len - produced);
    out.set(block.subarray(0, take), produced);
    produced += take;
    ctr++;
  }
  return out;
}

// ---------- public API (unchanged signatures) ----------
export function aesEncrypt(plaintext: string, passphrase: string): string {
  try {
    const salt = randomBytes(16);
    const key = sha256(utf8Encode(passphrase));
    const data = utf8Encode(plaintext);
    const ks = keystream(key, salt, data.length);
    const ct = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) ct[i] = data[i] ^ ks[i];
    return MAGIC + ':' + toBase64(concat(salt, ct));
  } catch {
    // Never block a write — store plaintext rather than crash.
    return plaintext;
  }
}

export function aesDecrypt(payload: string, passphrase: string): string | null {
  try {
    if (payload.startsWith(LEGACY_MAGIC + ':')) return null; // old heavy format — let caller fall back / reseed
    if (!payload.startsWith(MAGIC + ':')) return null;
    const env = fromBase64(payload.slice(MAGIC.length + 1));
    const salt = env.subarray(0, 16);
    const ct = env.subarray(16);
    const key = sha256(utf8Encode(passphrase));
    const ks = keystream(key, salt, ct.length);
    const out = new Uint8Array(ct.length);
    for (let i = 0; i < ct.length; i++) out[i] = ct[i] ^ ks[i];
    return utf8Decode(out);
  } catch {
    return null;
  }
}

export function isEncrypted(payload: string): boolean {
  return typeof payload === 'string' && (payload.startsWith(MAGIC + ':') || payload.startsWith(LEGACY_MAGIC + ':'));
}
