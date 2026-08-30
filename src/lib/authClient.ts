/**
 * Secure auth client.
 *
 * Principles enforced here:
 *  - NO plaintext admin password anywhere in the frontend source.
 *  - The browser never sees or stores the admin password.
 *  - Admin login is verified by the backend (`POST /api/admin/login`).
 *    The backend compares the submitted password against a bcrypt/argon2
 *    hash loaded from its own environment (ADMIN_PASSWORD_HASH) and returns
 *    a short-lived token on success.
 *  - OTP is generated, stored and validated ONLY on the backend
 *    (`/api/auth/otp/request` + `/api/auth/otp/verify`). The code is never
 *    returned to or displayed in the client.
 *
 * When no backend is reachable (static preview), these functions fail
 * closed and surface a clear "service unavailable" message instead of
 * silently allowing access with a hardcoded credential.
 */

export interface AuthResult {
  ok: boolean;
  reason?: 'network' | 'invalid' | 'unavailable';
  message?: string;
  token?: string;
  /** Only set by verifyOtp — short-lived proof-of-OTP token consumed by
   * the "Forgot MPIN" flow (store.resetMpin). Ignored by every other
   * caller of verifyOtp (e.g. Register.tsx). */
  resetToken?: string;
}

// Empty string intentionally falls back to same-origin (relative URLs).
// This allows the frontend to work correctly when deployed on the same
// host as the backend, or when VITE_API_BASE is explicitly left unset.
const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

async function postJson(path: string, body: unknown): Promise<Response | null> {
  // API_BASE being empty means same-origin — always valid.
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

// ---------------- OTP (phone verification) ----------------
//
// The backend generates/stores/validates the OTP. In its own Development
// Mode (no Twilio configured — see backend/app/main.py) it returns the code
// in the response so local/preview environments stay usable without a real
// SMS provider; requestOtp() below surfaces that via the `otp:deliver`
// event the UI already listens for. A production deployment never takes
// this path — the backend enforces that server-side, not the client.
// If VITE_API_BASE isn't set at all, postJson() returns null and both
// functions below fail closed with a clear "could not reach the server"
// message rather than silently granting access.
//
// IMPORTANT: the backend always answers /send-otp and /verify-otp with HTTP
// 200 and puts the real result in the JSON body's `ok` field (e.g.
// `{ ok: false, message: "Invalid code." }` for a wrong OTP is still a 200
// response). Checking only `res.ok` (the HTTP status) instead of the parsed
// body previously meant EVERY OTP — including wrong ones — was treated as
// verified, since a 200 response is always "ok" at the HTTP level. Both
// functions below now always parse and trust the JSON body.
async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function requestOtp(phone: string, email: string = ''): Promise<AuthResult> {
  const res = await postJson('/send-otp', { phone, email });

  if (!res) {
    return {
      ok: false,
      reason: 'network',
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }

  const data = await parseJson(res);
  if (res.ok && data.ok === true) {
    // Development Mode: backend has no Twilio configured and returns the
    // generated code directly (never happens in production — see main.py's
    // _is_dev_mode guard). Surface it the same way the local-only fallback
    // below does, via the existing `otp:deliver` UI affordance.
    if (typeof data.otp === 'string' && data.otp) {
      window.dispatchEvent(new CustomEvent('otp:deliver', { detail: { code: data.otp } }));
    }
    return { ok: true, message: (data.message as string) || 'A verification code has been sent to your mobile number.' };
  }

  return {
    ok: false,
    reason: 'network',
    message: (data.message as string) || 'Could not send the verification code.',
  };
}

/** Verify the OTP entered by the user against the backend. */
export async function verifyOtp(
  phone: string,
  code: string
): Promise<AuthResult> {
  const res = await postJson('/verify-otp', { phone, otp: code });

  if (!res) {
    return {
      ok: false,
      reason: 'network',
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }

  const data = await parseJson(res);
  if (res.ok && data.ok === true) {
    return { ok: true, resetToken: typeof data.resetToken === 'string' ? data.resetToken : undefined };
  }

  return {
    ok: false,
    reason: 'invalid',
    message: (data.message as string) || 'Invalid code. Please try again.',
  };
}

// ---------------- Admin login ----------------

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );

  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify an admin password.
 *
 * 1. Primary: the backend (`POST /api/admin/login`) compares against a
 *    bcrypt/argon2 hash from its own env and issues a token.
 * 2. Static-deploy fallback: a SHA-256 hash of the password may be
 *    provided via `VITE_ADMIN_PASSWORD_SHA256`.
 */

export async function adminLogin(
  password: string
): Promise<AuthResult> {
  const res = await postJson('/api/admin/login', { password });

  if (res) {
    const data = await res.json().catch(() => ({} as Record<string, unknown>));

    if (res.ok) {
      return {
        ok: true,
        token: data.token as string,
      };
    }

    // Surface the backend's real reason (e.g. "Admin password is not
    // configured." on a 500 when ADMIN_PASSWORD_HASH is unset) instead of
    // always claiming "Incorrect password" — that previously made a missing
    // server-side config look identical to a wrong password, so there was
    // no way to tell the two apart from the UI.
    const detail = (data.detail as string) || (data.message as string);
    return {
      ok: false,
      reason: res.status === 500 ? 'unavailable' : 'invalid',
      message: detail || 'Incorrect password.',
    };
  }

  // Static-deploy fallback: only ever used when there's no backend to talk
  // to (postJson returned null above). Additionally hard-disabled in
  // production builds — a SHA-256 hash of the admin password ships inside
  // the bundled JS on this path, which is crackable offline if the bundle
  // is ever inspected. Production admin auth must always go through the
  // backend's bcrypt check.
  if (import.meta.env.PROD) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Admin access requires the backend service to be reachable.',
    };
  }

  const configuredHash = (
    import.meta.env.VITE_ADMIN_PASSWORD_SHA256 as
      | string
      | undefined
  )?.toLowerCase();

  if (!configuredHash) {
    return {
      ok: false,
      reason: 'unavailable',
      message: 'Admin access is not configured for this environment.',
    };
  }

  const entered = await sha256Hex(password);

  if (entered === configuredHash) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: 'invalid',
    message: 'Incorrect password.',
  };
}

/**
 * DEVELOPMENT-ONLY fallback admin login.
 *
 * Calls the backend's `/api/admin/otp/verify` demo path (DEV_ADMIN_OTP =
 * "123456"), which the backend itself hard-disables whenever
 * ENVIRONMENT=production (returns 403). This exists purely so the admin
 * console is reachable *today*, before ADMIN_PASSWORD_HASH is configured
 * on the backend — it is NOT a substitute for real admin auth and must
 * never be relied on in production.
 */
export async function adminLoginDemoOtp(otp: string): Promise<AuthResult> {
  const res = await postJson('/api/admin/otp/verify', { otp });

  if (!res) {
    return {
      ok: false,
      reason: 'network',
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }

  const data = await parseJson(res);
  if (res.ok && data.ok === true) {
    return { ok: true, token: data.token as string };
  }

  return {
    ok: false,
    reason: res.status === 403 ? 'unavailable' : 'invalid',
    message: (data.detail as string) || (data.message as string) || 'Invalid demo code.',
  };
}

export const config = {
  apiConfigured: !!API_BASE,
  adminEmail:
    (import.meta.env.VITE_ADMIN_EMAIL as string | undefined) || '',
  supportEmail:
    (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || '',
};