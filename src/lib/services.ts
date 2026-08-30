import { Table, CachedTable, genId, needsSeed, markSeeded } from './db';
import { supabase } from './supabase';

import type {
  Merchant,
  InvoiceRequest,
  Invoice,
  InvoiceItem,
  Subscription,
  RechargeRecord,
  Contact,
  AppNotification,
  SupportTicket,
  AuditLog,
  LoginActivity,
  QrInventoryItem,
} from './types';

import { resolveSupply, computeInvoice, nextInvoiceNumber } from './gstEngine';
import { learnFromInvoice, hydrateLearnedFromServer } from './hsnAi';
import { playNotificationSound } from './sound';
import { secureStorage } from './secureStorage';
import { apiRequest, ApiError } from './apiClient';
export { apiRequest, ApiError };
import { syncEngine } from './syncEngine';
import { offlineDb } from './offlineDb';
import {
  VALIDITY_ADDON,
  planById,
  planUnlocksBranding,
  CARRY_FORWARD_WINDOW_DAYS,
  DAY_MS,
} from './plans';

// The backend never sends the mpin digest back to the frontend (see
// backend/app/routers/merchant.py: _public_merchant()). The local cache
// keeps a harmless empty placeholder in that field so the Merchant type
// (which models the Postgres row 1:1) doesn't need an optional mpin just
// for this — nothing in the frontend ever reads merchant.mpin anymore
// now that verification happens server-side.
function withPlaceholderMpin(m: Record<string, unknown>): Merchant {
  return { mpin: '', ...m } as Merchant;
}

// ---------- Supabase error classification (merchants: Supabase is the only source of truth) ----------
//
// Used by both registration (writeMerchantToSupabase) and QR lookup
// (merchantService.lookupByQr) so the UI can show the user the real reason
// instead of a single generic "something went wrong" message.
export type MerchantSyncErrorKind = 'permission' | 'schema' | 'network' | 'unknown';

export class MerchantSyncError extends Error {
  kind: MerchantSyncErrorKind;
  constructor(kind: MerchantSyncErrorKind, message: string) {
    super(message);
    this.name = 'MerchantSyncError';
    this.kind = kind;
  }
}

function classifySupabaseError(error: { code?: string; message?: string } | null | undefined): MerchantSyncErrorKind {
  if (!error) return 'unknown';
  const code = error.code || '';
  const msg = (error.message || '').toLowerCase();
  // RLS / permission denied (Postgres 42501, PostgREST RLS rejection, JWT/role errors)
  if (code === '42501' || code === 'PGRST301' || code === '401' || code === '403' ||
      msg.includes('permission denied') || msg.includes('row-level security') || msg.includes('rls')) {
    return 'permission';
  }
  // Schema mismatch: unknown column/table/relation
  if (code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST116' ||
      msg.includes('column') || msg.includes('does not exist') || msg.includes('could not find') || msg.includes('schema cache')) {
    return 'schema';
  }
  // Postgres 23502 = not_null_violation. This is also a schema-consistency
  // problem, not a validation problem with the submitted data: the app
  // never sends a field it doesn't know about, so a NOT NULL failure here
  // means the live table has a column the app was never told about (see
  // supabase/migrations/0003_drop_legacy_snakecase_columns.sql, which
  // fixed exactly this for the legacy `shop_name` column). Classifying it
  // as 'schema' instead of 'unknown' surfaces the real cause to the user
  // ("contact support" / schema-mismatch messaging) instead of implying
  // they filled the form out incorrectly.
  if (code === '23502' || msg.includes('violates not-null constraint')) {
    return 'schema';
  }
  return 'unknown';
}

/** Public result type for cross-device QR lookups (see lookupByQr below). */
export type MerchantLookupResult =
  | { status: 'found'; merchant: Merchant }
  | { status: 'not_found' }
  | { status: 'permission_denied'; message: string }
  | { status: 'network_error'; message: string };

// ---------- credit / validity model ----------
export const credits = {
  /** Whether the current plan validity is still active. */
  isActive(m: Merchant): boolean {
    return m.planExpiresAt > 0 && m.planExpiresAt > Date.now();
  },
  /** Remaining PDF credits (0 if plan expired). */
  available(m: Merchant): number {
    if (!this.isActive(m)) return 0;
    return Math.max(0, m.pdfCredits);
  },
  /** Days left before expiry (0 if expired/none). */
  daysRemaining(m: Merchant): number {
    if (m.planExpiresAt <= 0) return 0;
    return Math.max(0, Math.ceil((m.planExpiresAt - Date.now()) / DAY_MS));
  },
  /** Can a new invoice PDF be generated right now? (paid credits OR free daily invoice) */
  canGenerate(m: Merchant): boolean {
    return (this.isActive(m) && m.pdfCredits >= 1) || this.freeInvoiceAvailable(m);
  },
  /** Whether custom branding is unlocked (validity >= 30 days AND active). */
  brandingEnabled(m: Merchant): boolean {
    return this.isActive(m) && planUnlocksBranding(m.planValidityDays);
  },
  /** Whether merchant is within the carry-forward renewal window. */
  inRenewalWindow(m: Merchant): boolean {
    return this.isActive(m) && this.daysRemaining(m) <= CARRY_FORWARD_WINDOW_DAYS;
  },
  /** Whether the free daily invoice (1 per 24h) is available right now. */
  freeInvoiceAvailable(m: Merchant): boolean {
    if (!m.lastFreeInvoiceAt) return true;
    return (Date.now() - m.lastFreeInvoiceAt) >= DAY_MS;
  },
  /** Epoch-ms timestamp when the next free invoice becomes available (0 if already available). */
  freeInvoiceNextAt(m: Merchant): number {
    if (!m.lastFreeInvoiceAt) return 0;
    const next = m.lastFreeInvoiceAt + DAY_MS;
    return next <= Date.now() ? 0 : next;
  },
};

// ---------- tables (== Postgres tables) ----------
export const db = {
  merchants: new Table<Merchant>('merchants'),
  // billing_requests + invoices are SHARED across devices (a customer's
  // phone and a merchant's laptop are different browsers entirely), so
  // these two are populated from the FastAPI backend (see routers/
  // billing.py) instead of localStorage-only `Table`. RLS hardening
  // Phase 3 (supabase/migrations/0007_billing_invoices_lockdown.sql) means
  // the browser can no longer reach these Supabase tables directly with
  // the anon key at all — every read/write goes through requestService /
  // invoiceService below, which call the backend and push results into
  // this cache via setAll()/upsert().
  requests: new CachedTable<InvoiceRequest>('billing_requests'),
  invoices: new CachedTable<Invoice>('invoices'),
  subscriptions: new Table<Subscription>('subscriptions'),
  recharge: new Table<RechargeRecord>('recharge_history'),
  notifications: new Table<AppNotification>('notifications'),
  contacts: new Table<Contact>('address_book'),
  tickets: new Table<SupportTicket>('support_tickets'),
  auditLogs: new Table<AuditLog>('admin_audit_logs'),
  loginActivity: new Table<LoginActivity>('login_activity'),
  // QR Inventory (Admin-only, additive feature — see types.ts QrInventoryItem
  // for why this is a separate table from `merchants`).
  qrInventory: new Table<QrInventoryItem>('qr_inventory'),
};

// ---------- AUTH: two fully-isolated realms ----------
// The Merchant and Super-Admin portals keep SEPARATE session storage so the
// two realms never share or overwrite each other's auth state. The Customer
// portal is fully public (no session at all).
const MERCHANT_SESSION_KEY = 'aklogic_merchant_session';
const ADMIN_SESSION_KEY = 'aklogic_admin_session';
const CUSTOMER_SESSION_KEY = 'aklogic_customer_session';
// Mirrors backend/app/config.py's access_token_ttl_min default (30 days for merchant/customer, 24h for admin).
const MERCHANT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CUSTOMER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface Session { merchantId: string | null; admin: boolean }
interface AdminSessionData { token: string | null; expiresAt: number }
interface MerchantSessionData { id: string; token: string | null; expiresAt: number }
interface CustomerSessionData { id: string; token: string | null; expiresAt: number }

/**
 * RLS hardening Phase 2: merchant login/register now goes through the
 * FastAPI backend (backend/app/routers/merchant.py) and returns a real
 * JWT, the same way admin login already did — so the merchant session
 * needs to carry a token too, not just an id. See supabase/migrations/
 * 0005_merchants_lockdown.sql for why the old direct-Supabase path (and
 * the local SHA-256 MPIN fast-path that went with it) is gone.
 */
interface MerchantSessionData { id: string; token: string | null; expiresAt: number }

function readMerchantData(): MerchantSessionData | null {
  try {
    const raw = secureStorage.getItem(MERCHANT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Backward-compatible with the old plain-id-string session shape
    // (pre-JWT). Treated as a session with no token — the next
    // authenticated call will simply fail and prompt a fresh login,
    // rather than crashing.
    if (typeof parsed === 'string') return { id: parsed, token: null, expiresAt: Date.now() + MERCHANT_SESSION_TTL_MS };
    return parsed as MerchantSessionData;
  } catch { return null; }
}
function readMerchantId(): string | null {
  const data = readMerchantData();
  if (!data) return null;
  if (data.expiresAt <= Date.now()) {
    secureStorage.removeItem(MERCHANT_SESSION_KEY);
    return null;
  }
  return data.id;
}
function readAdminData(): AdminSessionData | null {
  try {
    const raw = secureStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Backward-compatible with the old boolean-only session shape.
    if (parsed === true) return { token: null, expiresAt: Date.now() + ADMIN_SESSION_TTL_MS };
    return parsed as AdminSessionData;
  } catch { return null; }
}
function readAdmin(): boolean {
  const data = readAdminData();
  if (!data) return false;
  if (data.expiresAt <= Date.now()) {
    secureStorage.removeItem(ADMIN_SESSION_KEY);
    return false;
  }
  return true;
}

function readCustomerData(): CustomerSessionData | null {
  try {
    const raw = secureStorage.getItem(CUSTOMER_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomerSessionData;
  } catch { return null; }
}
function readCustomerId(): string | null {
  const data = readCustomerData();
  if (!data) return null;
  if (data.expiresAt <= Date.now()) {
    secureStorage.removeItem(CUSTOMER_SESSION_KEY);
    return null;
  }
  return data.id;
}

let authInitialized = false;
let authInitializing = false;

export const auth = {
  isInitialized(): boolean {
    return authInitialized;
  },
  async initialize(): Promise<void> {
    if (authInitialized || authInitializing) return;
    authInitializing = true;

    let shouldAwait = false;
    const id = readMerchantId();
    const token = auth.merchantToken();

    if (id && token) {
      const cached = db.merchants.byId(id);
      if (!cached) {
        shouldAwait = true;
      }
    }

    try {
      if (id && token) {
        if (shouldAwait) {
          try {
            const res = await apiRequest<Record<string, unknown>>('/api/merchant/me', { token });
            const merchant = withPlaceholderMpin(res);
            db.merchants.upsert(merchant);
          } catch (e) {
            console.warn('[auth] session validation error:', e);
          }
        } else {
          // Background revalidation (stale-while-revalidate)
          apiRequest<Record<string, unknown>>('/api/merchant/me', { token })
            .then((res) => {
              const merchant = withPlaceholderMpin(res);
              db.merchants.upsert(merchant);
            })
            .catch((e) => {
              console.warn('[auth] background session validation error:', e);
            });
        }
      }
    } finally {
      authInitialized = true;
      authInitializing = false;
      ping();
    }
  },
  /** Composite view used by hooks/guards. The two realms are independent. */
  session(): Session { return { merchantId: readMerchantId(), admin: readAdmin() }; },
  merchantSession(): string | null { return readMerchantId(); },
  adminSession(): boolean { return readAdmin(); },
  customerSession(): string | null { return readCustomerId(); },
  /** The admin JWT for attaching `Authorization: Bearer <token>` to admin
   * API calls. Returns null if there is no valid (non-expired) session. */
  adminToken(): string | null { return readAdmin() ? (readAdminData()?.token ?? null) : null; },
  /** The merchant JWT for attaching `Authorization: Bearer <token>` to
   * merchant self-service API calls. Returns null if there is no valid
   * (non-expired) session, or the session predates the JWT migration. */
  merchantToken(): string | null {
    const id = readMerchantId();
    if (!id) return null;
    return readMerchantData()?.token ?? null;
  },
  customerToken(): string | null {
    const id = readCustomerId();
    if (!id) return null;
    return readCustomerData()?.token ?? null;
  },

  /**
   * Establishes (or refreshes) the merchant session. `token` is only
   * provided by register()/login() right after the backend issues it —
   * callers that just want to re-affirm "yes, this merchant id is still
   * signed in" (e.g. Register.tsx's goToDashboard) can omit it and the
   * previously-stored token is preserved.
   */
  loginMerchant(id: string, token?: string) {
    const existing = readMerchantData();
    const data: MerchantSessionData = {
      id,
      token: token ?? (existing && existing.id === id ? existing.token : null),
      expiresAt: Date.now() + MERCHANT_SESSION_TTL_MS,
    };
    secureStorage.setItem(MERCHANT_SESSION_KEY, JSON.stringify(data));
    ping();
  },
  loginCustomer(id: string, token?: string) {
    const existing = readCustomerData();
    const data: CustomerSessionData = {
      id,
      token: token ?? (existing && existing.id === id ? existing.token : null),
      expiresAt: Date.now() + CUSTOMER_SESSION_TTL_MS,
    };
    secureStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(data));
    ping();
  },
  logoutCustomer() {
    secureStorage.removeItem(CUSTOMER_SESSION_KEY);
    ping();
  },
  loginAdmin(token?: string) {
    const data: AdminSessionData = { token: token ?? null, expiresAt: Date.now() + ADMIN_SESSION_TTL_MS };
    secureStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(data));
    ping();
  },
  /** Logs out the MERCHANT realm only. */
  logoutMerchant() { secureStorage.removeItem(MERCHANT_SESSION_KEY); ping(); },
  /** Logs out the ADMIN realm only. Clears the JWT, not just the flag. */
  logoutAdmin() { secureStorage.removeItem(ADMIN_SESSION_KEY); ping(); },
  /** Legacy combined logout (clears the current realm caller is in). */
  logout() { secureStorage.removeItem(MERCHANT_SESSION_KEY); ping(); },
};

// tiny re-render ping that also touches a table emit
import { emit } from './db';
function ping() { emit(); }

// ---------- notification service ----------
export const notificationService = {
  push(merchantId: string, type: AppNotification['type'], title: string, body: string) {
    const id = genId('n_');
    db.notifications.insert({ id, merchantId, type, title, body, read: false, createdAt: Date.now() });
    playNotificationSound(id);
  },
  broadcast(title: string, body: string) {
    db.merchants.all().forEach((m) => this.push(m.id, 'broadcast', title, body));
  },
  markRead(id: string) { db.notifications.update(id, { read: true }); },
  markAllRead(merchantId: string) {
    db.notifications.all().forEach((n) => { if (n.merchantId === merchantId && !n.read) db.notifications.update(n.id, { read: true }); });
  },
};

// ---------- address book service ----------
export const contactService = {
  upsert(merchantId: string, c: Omit<Contact, 'id' | 'merchantId' | 'createdAt'>) {
    const existing = db.contacts.find((x) => x.merchantId === merchantId && x.phone === c.phone && !!c.phone);
    if (existing) db.contacts.update(existing.id, c);
    else db.contacts.insert({ id: genId('c_'), merchantId, createdAt: Date.now(), ...c });
  },
  remove(id: string) { db.contacts.remove(id); },
};

// ---------- recharge / subscription service ----------
//
// RLS hardening Phase 2 (see supabase/migrations/0005_merchants_lockdown.sql):
// these three methods used to ONLY call db.merchants.update() — i.e. the
// local `Table` (localStorage), never Supabase. A merchant buying a plan,
// or an invoice consuming a credit, had no durable effect beyond the
// current browser tab; the same purchase on a second device or after
// clearing site data would show the merchant back on the Free plan. That
// was a real functional bug independent of the RLS gap. All three now
// call the JWT-authenticated backend (backend/app/routers/merchant.py),
// which is the actual source of truth for planId/pdfCredits/planExpiresAt
// etc., and mirror the result into the local cache afterwards purely for
// fast reads elsewhere in the UI.
export const subscriptionService = {
  /**
   * Purchase / renew a plan. Credit carry-forward and validity math are
   * computed server-side (backend/app/plans_ms.py) using the same rules
   * as src/lib/plans.ts, so the frontend and backend catalog must be kept
   * in sync if either changes.
   *
   * `orderId` must reference a payment_orders row that is already
   * status='paid' (see paymentService.checkout, which runs create-order ->
   * provider checkout -> verify-payment before ever calling this) — the
   * backend re-checks and consumes it atomically, so this call alone can
   * never grant a paid plan without a verified payment (supabase/
   * migrations/0008_payment_orders.sql). Omit only for the ₹0 free plan.
   */
  async purchasePlan(merchantId: string, planId: string, orderId?: string): Promise<{ ok: boolean; carried: number }> {
    const token = auth.merchantToken();
    if (!token) return { ok: false, carried: 0 };
    let res;
    try {
      res = await apiRequest<{ ok: boolean; carried: number; merchant: Record<string, unknown> }>(
        '/api/merchant/purchase-plan',
        { method: 'POST', token, body: { planId, orderId } },
      );
    } catch {
      return { ok: false, carried: 0 };
    }
    const merchant = withPlaceholderMpin(res.merchant);
    db.merchants.update(merchantId, merchant);

    const plan = planById(planId);
    const sub = db.subscriptions.find((s) => s.merchantId === merchantId);
    const subData = {
      planId: merchant.planId, planName: merchant.planName, validityDays: merchant.planValidityDays,
      startedAt: merchant.planStartedAt, expiresAt: merchant.planExpiresAt, active: true,
    };
    if (sub) db.subscriptions.update(sub.id, subData);
    else db.subscriptions.insert({ id: genId('s_'), merchantId, ...subData });

    if (plan) {
      db.recharge.insert({
        id: genId('x_'), merchantId, type: 'plan', amount: plan.price, credits: plan.credits,
        carriedForward: res.carried || undefined, validityDays: plan.validityDays, planName: plan.name,
        reason: res.carried > 0 ? `${plan.name} (renewed, ${res.carried} credits carried forward)` : plan.name,
        createdAt: Date.now(),
      });
      notificationService.push(merchantId, 'recharge', 'Plan activated',
        res.carried > 0
          ? `${plan.name} active. ${res.carried} unused credits carried forward → ${merchant.pdfCredits} total.`
          : `${plan.name} active · ${plan.credits} PDF credits, ${plan.validityDays}-day validity.`);
    }
    return { ok: true, carried: res.carried };
  },

  /** ₹50 validity add-on: +30 days, NO new credits, preserves remaining credits.
   * `orderId` must reference a paid, unconsumed payment_orders row for this
   * add-on — same payment gate as purchasePlan above; it is always
   * required here since the add-on is never free. */
  async extendValidity(merchantId: string, orderId?: string): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) return false;
    let res;
    try {
      res = await apiRequest<{ ok: boolean; merchant: Record<string, unknown> }>(
        '/api/merchant/extend-validity',
        { method: 'POST', token, body: { orderId } },
      );
    } catch {
      return false;
    }
    const merchant = withPlaceholderMpin(res.merchant);
    db.merchants.update(merchantId, merchant);
    const sub = db.subscriptions.find((s) => s.merchantId === merchantId);
    if (sub) db.subscriptions.update(sub.id, { expiresAt: merchant.planExpiresAt, active: true });
    db.recharge.insert({
      id: genId('x_'), merchantId, type: 'addon', amount: VALIDITY_ADDON.price, credits: 0,
      validityDays: VALIDITY_ADDON.extendDays, reason: 'Validity Extension (+30 days, no new credits)',
      createdAt: Date.now(),
    });
    notificationService.push(merchantId, 'recharge', 'Validity extended', `+${VALIDITY_ADDON.extendDays} days added. Credits unchanged (${merchant.pdfCredits}).`);
    return true;
  },

  /** Consume PDF credits (on invoice generation). Atomic on the backend —
   * see merchant_repo.py's consume_credit(): a single UPDATE ... WHERE
   * "pdfCredits" >= :count ... RETURNING, so it cannot be bypassed by a
   * tampered local cache and cannot double-spend under concurrent calls. */
  async consumeCredit(merchantId: string, count: number, reason: string): Promise<{ ok: boolean }> {
    const token = auth.merchantToken();
    if (!token) return { ok: false };
    let res;
    try {
      res = await apiRequest<{ ok: boolean; merchant: Record<string, unknown> }>(
        '/api/merchant/consume-credit',
        { method: 'POST', token, body: { count, reason } },
      );
    } catch {
      return { ok: false };
    }
    const merchant = withPlaceholderMpin(res.merchant);
    db.merchants.update(merchantId, merchant);
    db.recharge.insert({ id: genId('x_'), merchantId, type: 'debit', amount: 0, credits: -count, reason, createdAt: Date.now() });
    return { ok: true };
  },

  /** Compensating action for consumeCredit(): credits back PDF credits
   * that were already deducted for an invoice which then failed to be
   * created (see invoiceService.approve). Without this, a network/server
   * failure on the /invoices call — happening AFTER the credit was
   * already atomically deducted on the backend — would silently and
   * permanently cost the merchant a PDF credit for an invoice that was
   * never generated. This mirrors consumeCredit's shape exactly so it can
   * be dropped into the same catch block. */
  async refundCredit(merchantId: string, count: number, reason: string): Promise<{ ok: boolean }> {
    const token = auth.merchantToken();
    if (!token) return { ok: false };
    let res;
    try {
      res = await apiRequest<{ ok: boolean; merchant: Record<string, unknown> }>(
        '/api/merchant/refund-credit',
        { method: 'POST', token, body: { count, reason } },
      );
    } catch {
      return { ok: false };
    }
    const merchant = withPlaceholderMpin(res.merchant);
    db.merchants.update(merchantId, merchant);
    db.recharge.insert({ id: genId('x_'), merchantId, type: 'credit_refund', amount: 0, credits: count, reason, createdAt: Date.now() });
    return { ok: true };
  },
};

// ---------- payment orchestration (provider-agnostic) ----------
// Payment CAPTURE is fully decoupled from credit ALLOCATION:
//   1. POST /api/merchant/create-order asks the backend to compute the
//      real amount and open a payment_orders row (see payment_repo.py).
//   2. provider.checkout() hands that order to the payment provider
//      (mock or Razorpay) and gets back a providerPaymentId + signature.
//   3. POST /api/merchant/verify-payment independently re-verifies the
//      signature server-side and marks the order 'paid'. A ₹0 order (the
//      free plan) is already marked paid by /create-order, so this step
//      is skipped for it.
//   4. ONLY once the order is verified do we call the fulfilment
//      functions (purchasePlan / extendValidity), passing the orderId —
//      the backend re-checks + atomically consumes it before granting
//      anything (supabase/migrations/0008_payment_orders.sql).
// Swapping the mock provider for Razorpay needs zero changes here.

import { getProvider, type PaymentOrder } from './payments';

export const paymentService = {
  /** Run a full checkout for a plan/addon, then fulfil on success. */
  async checkout(
    merchantId: string,
    purpose: 'plan' | 'addon',
    itemId: string
  ): Promise<{ ok: true; carried: number } | { ok: false; error: string }> {
    const token = auth.merchantToken();
    if (!token) return { ok: false, error: 'Your session has expired. Please log in again.' };

    let orderRes: { ok: boolean; orderId: string; providerOrderId?: string | null; amount: number; keyId: string | null };
    try {
      orderRes = await apiRequest<{ ok: boolean; orderId: string; providerOrderId?: string | null; amount: number; keyId: string | null }>(
        '/api/merchant/create-order',
        { method: 'POST', token, body: { purpose, itemId } },
      );
    } catch (e) {
      return { ok: false, error: e instanceof ApiError ? e.message : 'Could not start payment. Please try again.' };
    }

    const order: PaymentOrder = {
      orderId: orderRes.orderId, providerOrderId: orderRes.providerOrderId, amount: orderRes.amount, currency: 'INR',
      keyId: orderRes.keyId, merchantId, purpose, itemId,
    };

    // ₹0 order (the free plan): already marked paid by create-order,
    // there is nothing for a payment provider to do.
    if (order.amount > 0) {
      const provider = getProvider();
      const result = await provider.checkout(order);
      if (result.status !== 'captured' || !result.providerPaymentId || !result.signature) {
        return { ok: false, error: result.error || 'Payment not completed' };
      }
      try {
        await apiRequest('/api/merchant/verify-payment', {
          method: 'POST', token,
          body: { orderId: order.orderId, providerPaymentId: result.providerPaymentId, signature: result.signature },
        });
      } catch (e) {
        return { ok: false, error: e instanceof ApiError ? e.message : 'Payment verification failed.' };
      }
    }

    return this.fulfil(merchantId, purpose, itemId, order.orderId);
  },

  /** Fulfilment: grant credits/validity for an already-verified order. */
  async fulfil(
    merchantId: string,
    purpose: 'plan' | 'addon',
    itemId: string,
    orderId: string,
  ): Promise<{ ok: true; carried: number } | { ok: false; error: string }> {
    if (purpose === 'addon') {
      const extended = await subscriptionService.extendValidity(merchantId, orderId);
      return extended ? { ok: true, carried: 0 } : { ok: false, error: 'fulfilment_failed' };
    }

    const res = await subscriptionService.purchasePlan(merchantId, itemId, orderId);
    return res.ok
      ? { ok: true, carried: res.carried }
      : { ok: false, error: 'fulfilment_failed' };
  },
};
/**
 * Supabase is the ONLY source of truth for merchants. This write is
 * AWAITED by every caller and THROWS on any failure — there is no
 * fire-and-forget path left. Callers must not consider a merchant
 * created/updated unless this resolves without throwing.
 *
 * Uses the Merchant type's own (camelCase) field names as the Supabase
 * column names — confirmed as the schema the app's two Supabase call
 * sites already send/query (this function and lookupByQr below).
 *
 * IMPORTANT: this function must only ever be changed together with the
 * Merchant type (src/lib/types.ts), the Register.tsx form state, and the
 * supabase/migrations/*.sql schema — all four must agree on every field
 * name. A past mismatch (the live table had a leftover legacy
 * snake_case `shop_name NOT NULL` column that this camelCase upsert
 * never populated) broke every registration; see
 * supabase/migrations/0003_drop_legacy_snakecase_columns.sql for the fix
 * and the full root-cause writeup.
 *
 * .select().single() after the upsert forces Supabase/PostgREST to read
 * the row back and return it. This also catches the case where an INSERT
 * is permitted by RLS but a SELECT policy is missing/too narrow — without
 * .select(), upsert() can "succeed" with no error while the row is not
 * actually readable, which would silently reproduce this exact bug again.
 */
type MerchantRegistration = Omit<
  Merchant,
  | "id"
  | "merchantCode"
  | "qrId"
  | "createdAt"
  | "balance"
  | "planId"
  | "planName"
  | "planValidityDays"
  | "planStartedAt"
  | "planExpiresAt"
  | "pdfCredits"
  | "customBranding"
>;

// Columns returned by the merchants_public Supabase view (see
// supabase/migrations/0005_merchants_lockdown.sql). Deliberately excludes
// accountNumber, ifsc, pan, address, mpin, phone, email — a customer
// scanning a QR code has no legitimate reason to receive the merchant's
// bank details, tax ID, or login credential digest. The base
// `public.merchants` table itself is no longer reachable with the anon
// key at all (RLS denies every anon/authenticated policy on it), so this
// view is the only way the frontend can read merchant data without a JWT.

export const merchantService = {
  /**
   * RLS hardening Phase 2 (see supabase/migrations/0005_merchants_lockdown.sql
   * and backend/app/routers/merchant.py): registration now goes through the
   * backend, which hashes the MPIN with bcrypt server-side and issues a JWT.
   * The backend is the only source of truth for merchant writes; nothing in
   * the frontend talks to the `merchants` base table directly anymore.
   */
  async register(data: MerchantRegistration): Promise<Merchant> {
    const res = await apiRequest<{ token: string; merchant: Record<string, unknown> }>(
      '/api/merchant/register',
      { method: 'POST', body: data },
    );
    const merchant = withPlaceholderMpin(res.merchant);
    auth.loginMerchant(merchant.id, res.token);
    db.merchants.append(merchant);
    return merchant;
  },

  /** Merchant self-service profile edit. Requires an active session — the
   * backend independently re-checks which fields a merchant is allowed to
   * touch (see MERCHANT_SELF_EDITABLE_FIELDS in merchant_repo.py), so a
   * patch containing e.g. `status` or `pdfCredits` is silently ignored
   * server-side rather than trusted from the client. */
  async update(id: string, patch: Partial<Merchant>): Promise<Merchant> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    const res = await apiRequest<Record<string, unknown>>('/api/merchant/me', {
      method: 'PATCH', token, body: patch,
    });
    const merchant = withPlaceholderMpin(res);
    db.merchants.upsert(merchant);
    return merchant;
  },

  async refreshMe(): Promise<void> {
    const token = auth.merchantToken();
    if (!token) return;
    try {
      const res = await apiRequest<Record<string, unknown>>('/api/merchant/me', { token });
      const merchant = withPlaceholderMpin(res);
      db.merchants.upsert(merchant);
    } catch (e) {
      console.error('[merchant] refresh profile failed:', e);
    }
  },

  async getMeFull(): Promise<Merchant | null> {
    const token = auth.merchantToken();
    if (!token) return null;
    try {
      const res = await apiRequest<Record<string, unknown>>('/api/merchant/me/full', { token });
      const merchant = withPlaceholderMpin(res);
      db.merchants.upsert(merchant);
      return merchant;
    } catch (e) {
      console.error('[merchant] getMeFull failed:', e);
      return null;
    }
  },

  async uploadBrandingAsset(assetType: 'logo' | 'signature' | 'companySeal', dataUrl: string): Promise<Merchant | null> {
    const token = auth.merchantToken();
    if (!token) return null;
    try {
      const res = await apiRequest<{ ok: boolean; assetUrl: string; merchant: Record<string, unknown> }>('/api/merchant/upload-branding', {
        method: 'POST',
        token,
        body: { assetType, dataUrl },
      });
      if (res.merchant) {
        const merchant = withPlaceholderMpin(res.merchant);
        db.merchants.upsert(merchant);
        return merchant;
      }
      return null;
    } catch (e) {
      console.error('[merchant] uploadBrandingAsset failed:', e);
      return null;
    }
  },

  async fetchPublic(id: string): Promise<Merchant | null> {
    try {
      const res = await apiRequest<Record<string, unknown>>(`/api/public/merchants/${id}`);
      const merchant = withPlaceholderMpin(res);
      db.merchants.upsert(merchant);
      return merchant;
    } catch (e) {
      console.error('[merchant] public merchant lookup failed:', e);
      return null;
    }
  },

  async fetchPublicByRequest(requestId: string): Promise<Merchant | null> {
    try {
      const res = await apiRequest<Record<string, unknown>>(`/api/public/merchants/by-request/${requestId}`);
      const merchant = withPlaceholderMpin(res);
      db.merchants.upsert(merchant);
      return merchant;
    } catch (e) {
      console.error('[merchant] public merchant by request lookup failed:', e);
      return null;
    }
  },

  /**
   * The ONLY merchant-by-QR lookup in the app (see store.getMerchantByQr).
   * Always queries Supabase directly — never resolves from the local cache
   * — so a QR generated on one device works immediately on every other
   * phone/computer. Reads from `merchants_public`, a view that only
   * exposes non-sensitive columns; the base table denies the anon key
   * entirely (see supabase/migrations/0005_merchants_lockdown.sql).
   */
  async lookupByQr(qrId: string): Promise<MerchantLookupResult> {
    try {
      const res = await apiRequest<Record<string, unknown>>(`/api/public/merchants/by-qr/${qrId}`);
      return { status: 'found', merchant: withPlaceholderMpin(res) };
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          return { status: 'not_found' };
        }
        return { status: 'permission_denied', message: err.message };
      }
      return { status: 'network_error', message: err instanceof Error ? err.message : String(err) };
    }
  },

  /**
   * Cross-device MPIN login (see store.verifyMpinRemote / MerchantLogin.tsx).
   * This is now the ONLY login path — the old local-cache SHA-256 fast
   * path (auth.verifyMpin) is gone; every login is verified by the backend
   * against a bcrypt hash, with a real server-side lockout after repeated
   * failures (see LOGIN_MAX_ATTEMPTS in backend/app/routers/merchant.py).
   * Merchants who registered before this migration are transparently
   * upgraded from the old salted-SHA-256 digest to bcrypt on their next
   * successful login (backend/app/security.py: verify_mpin_any) — no
   * forced password reset.
   */
  /**
   * Issues the next permanent Invoice Number for this merchant
   * (AKM-000125-000001, -000002, ...) from the backend's atomic per-
   * merchant counter (backend/app/merchant_repo.py: next_invoice_number).
   * This is the ONLY place an invoice number is generated — the frontend
   * never computes or guesses one. Returns null (rather than throwing) on
   * any failure so a hiccup here never blocks the existing approve/GST-
   * invoice flow, which does not depend on this value.
   */
  async nextInvoiceNumber(): Promise<string | null> {
    const token = auth.merchantToken();
    if (!token) return null;
    try {
      const res = await apiRequest<{ ok: boolean; invoiceNumber: string }>(
        '/api/merchant/next-invoice-number',
        { method: 'POST', token },
      );
      return res.invoiceNumber;
    } catch (e) {
      console.error('[merchant] next invoice number failed:', e instanceof Error ? e.message : e);
      return null;
    }
  },

  async verifyMpinRemote(phone: string, email: string, mpin: string): Promise<MerchantLoginResult> {
    try {
      const res = await apiRequest<{ token: string; merchant: Record<string, unknown> }>(
        '/api/merchant/login',
        { method: 'POST', body: { phone, email, mpin } },
      );
      const merchant = withPlaceholderMpin(res.merchant);
      auth.loginMerchant(merchant.id, res.token);
      if (db.merchants.byId(merchant.id)) db.merchants.update(merchant.id, merchant);
      else db.merchants.append(merchant);
      return { status: 'ok', merchant };
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) return { status: 'invalid' };
        return { status: 'error', message: e.message };
      }
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  },

  /**
   * "Forgot MPIN" recovery (see ForgotMpin.tsx). A returning merchant who
   * doesn't know their current MPIN can't use change-mpin (which requires
   * it), and until now had no way back into their account at all. Identity
   * here is proven by a fresh OTP check (authClient.requestOtp/verifyOtp)
   * instead of the old MPIN — `resetToken` is the backend's proof that the
   * OTP check just succeeded for this exact phone number (see
   * backend/app/routers/merchant.py: POST /reset-mpin).
   */
  async resetMpin(phone: string, email: string, resetToken: string, newMpin: string): Promise<MerchantResetResult> {
    try {
      await apiRequest<{ ok: boolean }>(
        '/api/merchant/reset-mpin',
        { method: 'POST', body: { phone, email, resetToken, newMpin } },
      );
      return { status: 'ok' };
    } catch (e) {
      if (e instanceof ApiError) return { status: 'error', message: e.message };
      return { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  },

  /** Tier 1 Verified Merchant Masked Customer Search (Step 1 of 2-step privacy flow) */
  async searchCustomer(query: string) {
    const token = auth.merchantToken();
    if (!token) return { found: false };
    try {
      return await apiRequest<{ found: boolean; customer?: { customerCode: string; name: string; phoneMasked: string; state: string } }>(
        `/api/customer/merchant/customer-search?q=${encodeURIComponent(query)}`,
        { token }
      );
    } catch {
      return { found: false };
    }
  },

  /** Tier 1 Verified Merchant Customer Selection (Step 2 unmasking for invoice creation) */
  async selectCustomer(customerCode: string) {
    const token = auth.merchantToken();
    if (!token) throw new Error('Merchant session required');
    return await apiRequest<{ ok: boolean; customer: any }>(
      '/api/customer/merchant/customer-select',
      { method: 'POST', token, body: { customerCode } }
    );
  },

  /** Tier 2 Normal Merchant PIN Autofill (Verifies AKC ID + PIN on device) */
  async autofillCustomer(customerCode: string, pin: string) {
    const token = auth.merchantToken();
    if (!token) throw new Error('Merchant session required');
    return await apiRequest<{ ok: boolean; customer: any }>(
      '/api/customer/merchant/customer-autofill',
      { method: 'POST', token, body: { customerCode, pin } }
    );
  },
};

/** Result of a "Forgot MPIN" reset attempt (see merchantService.resetMpin). */
export type MerchantResetResult =
  | { status: 'ok' }
  | { status: 'error'; message: string };

/** Result of a cross-device MPIN login attempt (see merchantService.verifyMpinRemote). */
export type MerchantLoginResult =
  | { status: 'ok'; merchant: Merchant }
  | { status: 'invalid' }
  | { status: 'error'; message: string };

/** Result of submitting/resolving a billing request against Supabase. */
export type RequestSyncResult =
  | { ok: true; request: InvoiceRequest; nextStep?: string }
  | { ok: false; message: string };

// ---------- billing request service (RLS hardening Phase 3) ----------
// The backend (backend/app/routers/billing.py) is the ONLY way to read or
// write billing_requests now — see supabase/migrations/0007_billing_
// invoices_lockdown.sql for why the browser can no longer talk to this
// table directly with the anon key. Every write here is async and AWAITED
// by every caller, matching the standard merchantService already uses.
export const requestService = {
  /**
   * Submitted by a customer (no login, often a different device from the
   * merchant) via the public, throttled endpoint. id/status/createdAt are
   * always assigned server-side. Must actually reach the backend before we
   * consider it created — otherwise the merchant would never see it.
   */
  async create(req: Omit<InvoiceRequest, 'id' | 'status' | 'createdAt'>): Promise<RequestSyncResult> {
    let res;
    try {
      res = await apiRequest<{ ok: boolean; request: InvoiceRequest; nextStep?: string }>(
        '/api/public/billing-requests',
        { method: 'POST', body: req },
      );
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not reach the server.';
      console.error('[billing] request create failed:', message);
      return { ok: false, message };
    }
    db.requests.upsert(res.request);
    notificationService.push(req.merchantId, 'request', 'New invoice request', `${req.customerName} has submitted a new billing request.`);
    return { ok: true, request: res.request, nextStep: res.nextStep };
  },

  /** Merchant self-service edit of their OWN still-pending request. */
  async update(id: string, patch: Partial<InvoiceRequest>): Promise<RequestSyncResult> {
    const token = auth.merchantToken();
    if (!token) return { ok: false, message: 'Your session has expired. Please log in again.' };
    let res;
    try {
      res = await apiRequest<{ ok: boolean; request: InvoiceRequest }>(
        `/api/merchant/billing-requests/${id}`,
        { method: 'PATCH', token, body: patch },
      );
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? e.message : 'Could not reach the server.' };
    }
    db.requests.upsert(res.request);
    return { ok: true, request: res.request };
  },

  async reject(id: string, notes: string): Promise<RequestSyncResult> {
    const token = auth.merchantToken();
    if (!token) return { ok: false, message: 'Your session has expired. Please log in again.' };
    const r = db.requests.byId(id);
    let res;
    try {
      res = await apiRequest<{ ok: boolean; request: InvoiceRequest }>(
        `/api/merchant/billing-requests/${id}/reject`,
        { method: 'POST', token, body: { reason: notes } },
      );
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'Could not reach the server.';
      console.error('[billing] request reject failed:', message);
      return { ok: false, message };
    }
    db.requests.upsert(res.request);
    if (r) notificationService.push(r.merchantId, 'rejected', 'Request rejected', `The request from ${r.customerName} was rejected.`);
    return { ok: true, request: res.request };
  },

  /** Populates the local cache with the logged-in merchant's own requests.
   * Call on Dashboard mount + poll (see Dashboard.tsx) — without it the
   * merchant's Requests/Invoices/Overview pages read an empty cache. */
  async refreshMine(): Promise<void> {
    const token = auth.merchantToken();
    if (!token) return;
    try {
      const res = await apiRequest<{ requests: InvoiceRequest[] }>('/api/merchant/billing-requests', { token });
      db.requests.setAll(res.requests);
    } catch (e) {
      console.error('[billing] loading merchant requests failed:', e instanceof Error ? e.message : e);
    }
  },

  /** Capability-style lookup by the request's own unguessable id — used by
   * the public customer tracking page (InvoiceStatus.tsx). No auth. */
  async fetchPublic(id: string): Promise<InvoiceRequest | null> {
    try {
      const row = await apiRequest<InvoiceRequest>(`/api/public/billing-requests/${id}`);
      db.requests.upsert(row);
      return row;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        console.error('[billing] public request lookup failed:', e instanceof Error ? e.message : e);
      }
      return null;
    }
  },
};

// ---------- invoice service (Phase 3 & 4) ----------
export type ApproveResult =
  | { ok: true; invoice: Invoice }
  | { ok: false; reason: 'no_credits' | 'expired' | 'not_found' | 'no_items' | 'suspended' | 'sync_failed'; message?: string };

export const invoiceService = {
  /**
   * Approve a request -> enforce credits & validity -> compute GST -> create
   * immutable invoice. RLS hardening Phase 3: the actual create-invoice +
   * approve-request write is now one atomic backend call
   * (POST /api/merchant/invoices -> billing_repo.approve_request_with_
   * invoice), which re-checks ownership/pending-status/suspension
   * server-side regardless of what this (already-gated) local check
   * believes — see routers/billing.py. A failed call must not silently
   * consume the merchant's PDF credit or leave the request stuck.
   */
  async approve(requestId: string, editedItems: InvoiceItem[], editedCustomer: Partial<InvoiceRequest>): Promise<ApproveResult> {
    const req = db.requests.byId(requestId);
    if (!req) return { ok: false, reason: 'not_found' };
    const merchant = db.merchants.byId(req.merchantId);
    if (!merchant) return { ok: false, reason: 'not_found' };

    // CRITICAL: a suspended/disabled merchant must not be able to approve
    // requests or generate invoices, even if their dashboard session is
    // still active (an active session alone does not revoke this
    // capability the moment an admin suspends the account).
    if (merchant.status === 'suspended' || merchant.status === 'disabled') {
      return { ok: false, reason: 'suspended' };
    }

    const items = editedItems.filter((i) => i.description && i.rate >= 0);
    if (items.length === 0) return { ok: false, reason: 'no_items' };

    // CREDIT GATE: plan must be active and have at least one PDF credit,
    // OR the free daily invoice (1 per 24h) must be available. The local
    // check below is just a fast, friendly pre-check — the REAL gate is
    // the atomic backend deduction/free-invoice claim inside
    // billing_repo.approve_request_with_invoice.
    if (!credits.canGenerate(merchant)) {
      if (!credits.isActive(merchant)) return { ok: false, reason: 'expired' };
      return { ok: false, reason: 'no_credits' };
    }

    const customer = { ...req, ...editedCustomer };

    const supply = resolveSupply({
      sellerState: merchant.state,
      sellerGstin: merchant.gstin,
      buyerGstin: customer.customerGstin,
      buyerState: customer.customerState,
    });
    const comp = computeInvoice(items, supply);

    const invoiceNo = nextInvoiceNumber(merchant.invoicePrefix || 'INV', db.invoices.all().map((iv) => iv.invoiceNo));

    // -----------------------------------------------------------------
    // LOCAL-FIRST OPTIMISTIC APPROVE:
    // Generate invoice locally in 0ms, commit to local state, and immediately
    // trigger background reconciliation with the backend.
    // -----------------------------------------------------------------
    const offRes = await syncEngine.createOfflineInvoice({
      requestId,
      merchantId: merchant.id,
      invoiceNo,
      customerName: customer.customerName || 'Walk-in Customer',
      customerPhone: customer.customerPhone || '',
      customerEmail: customer.customerEmail,
      customerGstin: customer.customerGstin,
      customerPan: customer.customerPan,
      customerAddress: customer.customerAddress,
      customerState: customer.customerState || merchant.state || 'Delhi',
      paymentMode: customer.paymentMode || 'cash',
      paymentRef: customer.paymentRef,
      notes: customer.notes,
      branded: credits.brandingEnabled(merchant) && !!merchant.logoDataUrl,
      items,
      sellerState: merchant.state || 'Delhi',
      sellerGstin: merchant.gstin || '',
    });

    const savedInvoice = offRes.invoice as any;

    // Mark local request as approved and link invoice
    db.requests.upsert({
      ...req,
      ...customer,
      status: 'approved',
      invoiceId: savedInvoice.id,
      invoiceNo: savedInvoice.invoiceNo,
      resolvedAt: Date.now(),
    });

    db.invoices.upsert(savedInvoice);

    notificationService.push(merchant.id, 'approved', 'Invoice generated', `Invoice ${savedInvoice.invoiceNo} was generated successfully.`);
    contactService.upsert(merchant.id, {
      name: savedInvoice.customerName,
      phone: savedInvoice.customerPhone,
      email: savedInvoice.customerEmail,
      gstin: savedInvoice.customerGstin,
      address: savedInvoice.customerAddress,
    });

    // AI: learn from this approved selection to improve future HSN/SAC suggestions.
    learnFromInvoice(merchant.id, items.map((i) => ({ description: i.description, hsn: i.hsn, gstRate: i.gstRate })));

    // Fire-and-forget: Immediately trigger background synchronization/reconciliation with the server
    syncEngine.syncPending().catch((err) => console.error('[sync] background sync failed:', err));

    // DB-backed learning: fire-and-forget, never blocks the invoice-generation success path.
    try {
      const lToken = auth.merchantToken();
      if (lToken) {
        apiRequest('/api/merchant/hsn-learning/record', {
          method: 'POST', token: lToken,
          body: { items: items.map((i) => ({ description: i.description, hsn: i.hsn, gst_rate: i.gstRate })) },
        }).catch((e) => console.error('[hsn-learning] record failed:', e instanceof Error ? e.message : e));
      }
    } catch { /* swallow — must never affect the success path */ }

    return { ok: true, invoice: savedInvoice };
  },
  byId(id: string) { return db.invoices.byId(id); },
  byRequest(requestId: string) { return db.invoices.find((iv) => iv.requestId === requestId); },

  /** Populates the local cache with the logged-in merchant's own invoices.
   * Call on Dashboard mount + poll (see Dashboard.tsx). */
  async refreshMine(): Promise<void> {
    const token = auth.merchantToken();
    if (!token) return;
    try {
      const res = await apiRequest<{ invoices: Invoice[] }>('/api/merchant/invoices', { token });
      db.invoices.setAll(res.invoices);
    } catch (e) {
      console.error('[billing] loading merchant invoices failed:', e instanceof Error ? e.message : e);
    }
  },

  /** Public lookup used by the customer tracking page (InvoiceStatus.tsx)
   * once a request has been approved. No auth; 404 until approved. */
  async fetchPublicByRequest(requestId: string): Promise<Invoice | null> {
    try {
      const row = await apiRequest<Invoice>(`/api/public/invoices/by-request/${requestId}`);
      db.invoices.upsert(row);
      return row;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) {
        console.error('[billing] public invoice lookup failed:', e instanceof Error ? e.message : e);
      }
      return null;
    }
  },
};

// ---------- support service ----------
export const supportService = {
  async create(t: Omit<SupportTicket, 'id' | 'createdAt' | 'status'>): Promise<boolean> {
    try {
      const token = auth.merchantToken();
      if (!token) return false;
      const res = await apiRequest<{ ok: boolean; ticket: SupportTicket }>(
        '/api/merchant/tickets',
        { method: 'POST', token, body: t }
      );
      db.tickets.upsert(res.ticket);
      return true;
    } catch (e) {
      console.error('[support] create ticket failed:', e);
      return false;
    }
  },
  async reply(id: string, reply: string): Promise<void> {
    const token = auth.merchantToken();
    if (!token) return;
    try {
      const res = await apiRequest<{ ok: boolean; ticket: SupportTicket }>(
        `/api/merchant/tickets/${id}/reply`,
        { method: 'POST', token, body: { reply, status: 'resolved' } }
      );
      db.tickets.upsert(res.ticket);
    } catch (e) {
      console.error('[support] reply ticket failed:', e);
    }
  },
  async setStatus(id: string, status: SupportTicket['status']): Promise<void> {
    db.tickets.update(id, { status });
  },
  async refreshMine(): Promise<void> {
    const token = auth.merchantToken();
    if (!token) return;
    try {
      const res = await apiRequest<{ tickets: SupportTicket[] }>('/api/merchant/tickets', { token });
      db.tickets.setAll(res.tickets);
    } catch (e) {
      console.error('[support] refresh tickets failed:', e);
    }
  }
};

// ---------- login activity (monitoring) ----------
const DEVICES = ['Android · Chrome', 'iOS · Safari', 'Windows · Edge', 'Mac · Chrome', 'Android · App'];
function randomIp() { return `${49 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`; }

export const activityService = {
  record(merchantId: string, success: boolean) {
    const ip = randomIp();
    const device = DEVICES[Math.floor(Math.random() * DEVICES.length)];
    db.loginActivity.insert({ id: genId('la_'), merchantId, ip, device, success, createdAt: Date.now() });
    if (success) db.merchants.update(merchantId, { lastLoginAt: Date.now(), lastIp: ip, lastDevice: device });
  },
  forMerchant(merchantId: string) {
    return db.loginActivity.filter((l) => l.merchantId === merchantId).sort((a, b) => b.createdAt - a.createdAt);
  },
};

// ---------- ADMIN command center ----------
const ADMIN_NAME = 'Super Admin';

/**
 * RLS hardening Phase 2 (see supabase/migrations/0005_merchants_lockdown.sql):
 * every admin action below used to call ONLY db.merchants.update() — the
 * local browser cache — never Supabase. That meant an admin suspending a
 * merchant, adjusting credits, or changing a plan had no durable effect:
 * it looked like it worked (the admin's own screen updated) but the real
 * row in Supabase was untouched, and the merchant's own dashboard (a
 * different browser/device) would never see it. It also meant the "RLS is
 * open" risk cut both ways — anyone with the anon key could make these
 * same changes to any merchant without ever going through an admin login
 * at all, since there was no server-side authorization check backing
 * these actions.
 *
 * adminPatchMerchant() is the one place all of that now goes through:
 * PATCH /api/admin/merchants/{id}, authenticated with the admin JWT
 * (backend/app/routers/admin.py: require_admin), server-side allowlisted
 * against ADMIN_EDITABLE_FIELDS (backend/app/merchant_repo.py) so this
 * can never be used to smuggle through an unintended column.
 */
async function adminPatchMerchant(
  merchantId: string,
  patch: Record<string, unknown>,
  action: string,
  reason: string,
): Promise<Merchant | null> {
  const token = auth.adminToken();
  if (!token) return null;
  try {
    const res = await apiRequest<{ ok: boolean; merchant: Record<string, unknown> }>(
      `/api/admin/merchants/${merchantId}`,
      { method: 'PATCH', token, body: { patch, action, reason } },
    );
    const merchant = withPlaceholderMpin(res.merchant);
    db.merchants.update(merchantId, merchant);
    return merchant;
  } catch (e) {
    console.error('[admin] merchant patch failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

export const adminService = {
  // audit logging — every sensitive action is recorded
  log(action: string, reason: string, target?: Merchant, meta?: string) {
    db.auditLogs.insert({
      id: genId('al_'), adminName: ADMIN_NAME, action, reason,
      targetMerchantId: target?.id, targetMerchantName: target?.shopName, meta,
      createdAt: Date.now(),
    });
  },

  /** Populates the local merchant cache from the real Supabase data via
   * the backend's admin-only listing endpoint. Call this once when the
   * admin console loads (see AdminDashboard.tsx) — without it, every
   * admin page reads an empty/stale local cache and never sees merchants
   * who registered on a different device. */
  async loadAll(): Promise<void> {
    const token = auth.adminToken();
    if (!token) return;
    try {
      const [merchRes, ticketRes] = await Promise.all([
        apiRequest<{ merchants: Record<string, unknown>[] }>('/api/admin/merchants', { token }),
        apiRequest<{ tickets: SupportTicket[] }>('/api/admin/tickets', { token }),
      ]);
      db.merchants.setAll(merchRes.merchants.map((m) => withPlaceholderMpin(m)));
      db.tickets.setAll(ticketRes.tickets);
    } catch (e) {
      console.error('[admin] loading merchants/tickets failed:', e instanceof Error ? e.message : e);
    }
  },

  /** Populates the local cache with EVERY merchant's billing_requests and
   * invoices (RLS hardening Phase 3: the admin's own read-only listing
   * endpoints — see routers/billing.py's admin_router). Call once when the
   * admin console loads (see AdminDashboard.tsx) — without it, the fraud
   * scanner, revenue view, invoice audit, and duplicate-UTR detection all
   * silently operate on an empty/stale cache. */
  async loadAllBilling(): Promise<void> {
    const token = auth.adminToken();
    if (!token) return;
    try {
      const [reqRes, invRes] = await Promise.all([
        apiRequest<{ requests: InvoiceRequest[] }>('/api/admin/billing-requests', { token }),
        apiRequest<{ invoices: Invoice[] }>('/api/admin/invoices', { token }),
      ]);
      db.requests.setAll(reqRes.requests);
      db.invoices.setAll(invRes.invoices);
    } catch (e) {
      console.error('[admin] loading billing data failed:', e instanceof Error ? e.message : e);
    }
  },

  /**
   * Manually onboard a merchant from the admin console — e.g. when the SMS
   * OTP provider is down and a merchant can't complete the self-service
   * /register flow. Hits POST /api/admin/merchants (see routers/admin.py),
   * which reuses the exact same validation/insert path as self-registration
   * (create_merchant_record in merchant.py) but is gated by the admin JWT
   * instead of an OTP — the admin is vouching for the merchant instead of
   * the merchant proving phone ownership themselves.
   *
   * IMPORTANT: this does NOT log the admin in as the merchant (no merchant
   * token is issued/stored). The MPIN passed in becomes the merchant's real
   * login MPIN — give it to the merchant so they can log in normally next
   * time via MerchantLogin.tsx (phone + MPIN, unchanged).
   */
  async createMerchant(data: MerchantRegistration): Promise<Merchant> {
    const token = auth.adminToken();
    if (!token) throw new Error('Your admin session has expired. Please log in again.');
    const res = await apiRequest<{ merchant: Record<string, unknown> }>('/api/admin/merchants', {
      method: 'POST', token, body: data,
    });
    const merchant = withPlaceholderMpin(res.merchant);
    db.merchants.append(merchant);
    this.log('Manually Registered Merchant', 'OTP provider unavailable — registered via admin console', merchant);
    return merchant;
  },

  // ----- PDF credit management -----
  async adjustCredits(merchantId: string, delta: number, reason: string) {
    const m = db.merchants.byId(merchantId);
    if (!m) return;
    const next = Math.max(0, m.pdfCredits + delta);
    const updated = await adminPatchMerchant(merchantId, { pdfCredits: next, balance: next }, 'Credit Adjustment', reason);
    if (!updated) return;
    db.recharge.insert({
      id: genId('x_'), merchantId, type: delta >= 0 ? 'plan' : 'debit', amount: 0, credits: delta,
      reason: `Admin: ${reason}`, createdAt: Date.now(),
    });
    this.log(delta >= 0 ? 'Gift PDF Credits' : 'Deduct PDF Credits', reason, updated, `${delta > 0 ? '+' : ''}${delta} credits`);
    notificationService.push(merchantId, 'recharge', delta >= 0 ? 'Credits gifted' : 'Credits adjusted',
      `${delta > 0 ? '+' : ''}${delta} PDF credits by admin · ${reason}`);
  },

  // ----- subscription / validity management -----
  async grantValidity(merchantId: string, days: number, reason: string) {
    const m = db.merchants.byId(merchantId);
    if (!m) return;
    const base = credits.isActive(m) ? m.planExpiresAt : Date.now();
    const expiresAt = base + days * DAY_MS;
    const validityDays = Math.max(m.planValidityDays, days);
    const updated = await adminPatchMerchant(merchantId, {
      planExpiresAt: expiresAt,
      planValidityDays: validityDays,
      customBranding: planUnlocksBranding(validityDays),
    }, 'Grant Validity', reason);
    if (!updated) return;
    const sub = db.subscriptions.find((s) => s.merchantId === merchantId);
    if (sub) db.subscriptions.update(sub.id, { expiresAt, active: true });
    db.recharge.insert({ id: genId('x_'), merchantId, type: 'addon', amount: 0, credits: 0, validityDays: days, reason: `Admin grant: ${reason}`, createdAt: Date.now() });
    this.log('Grant Validity', reason, updated, `+${days} days`);
    notificationService.push(merchantId, 'recharge', 'Free validity granted', `+${days} days added by admin · ${reason}`);
  },

  async setPlan(merchantId: string, planId: string, reason: string) {
    const m = db.merchants.byId(merchantId);
    const plan = planById(planId);
    if (!m || !plan) return;
    const now = Date.now();
    const expiresAt = plan.validityDays > 0 ? now + plan.validityDays * DAY_MS : 0;
    const newCredits = m.pdfCredits + plan.credits;
    const updated = await adminPatchMerchant(merchantId, {
      planId: plan.id, planName: plan.name, planValidityDays: plan.validityDays,
      planStartedAt: now, planExpiresAt: expiresAt, pdfCredits: newCredits, balance: newCredits,
      customBranding: planUnlocksBranding(plan.validityDays),
      plan: plan.validityDays >= 30 ? 'monthly' : 'recharge',
    }, 'Change Plan', reason);
    if (!updated) return;
    const sub = db.subscriptions.find((s) => s.merchantId === merchantId);
    const subData = { planId: plan.id, planName: plan.name, validityDays: plan.validityDays, startedAt: now, expiresAt, active: true };
    if (sub) db.subscriptions.update(sub.id, subData);
    else db.subscriptions.insert({ id: genId('s_'), merchantId, ...subData });
    db.recharge.insert({ id: genId('x_'), merchantId, type: 'plan', amount: 0, credits: plan.credits, validityDays: plan.validityDays, planName: plan.name, reason: `Admin plan change: ${reason}`, createdAt: now });
    this.log('Change Plan', reason, updated, `→ ${plan.name}`);
    notificationService.push(merchantId, 'recharge', 'Plan updated by admin', `${plan.name} active · ${reason}`);
  },

  async resetExpiry(merchantId: string, reason: string) {
    const m = db.merchants.byId(merchantId);
    if (!m) return;
    const expiresAt = Date.now() + m.planValidityDays * DAY_MS;
    const updated = await adminPatchMerchant(merchantId, { planStartedAt: Date.now(), planExpiresAt: expiresAt }, 'Reset Expiry', reason);
    if (!updated) return;
    this.log('Reset Expiry', reason, updated, new Date(expiresAt).toLocaleDateString('en-IN'));
  },

  async setBranding(merchantId: string, enabled: boolean, reason: string) {
    const m = db.merchants.byId(merchantId);
    if (!m) return;
    const updated = await adminPatchMerchant(merchantId, { customBranding: enabled }, enabled ? 'Enable Custom Branding' : 'Disable Custom Branding', reason);
    if (!updated) return;
    this.log(enabled ? 'Enable Custom Branding' : 'Disable Custom Branding', reason, updated);
  },

  // ----- merchant status -----
  async setStatus(merchantId: string, status: 'active' | 'suspended' | 'disabled', reason: string) {
    const m = db.merchants.byId(merchantId);
    if (!m) return;
    const action = status === 'active' ? 'Reactivate Merchant' : status === 'suspended' ? 'Suspend Merchant' : 'Disable Merchant';
    const updated = await adminPatchMerchant(merchantId, { status }, action, reason);
    if (!updated) return;
    this.log(action, reason, updated);
    notificationService.push(merchantId, 'alert', `Account ${status}`, `Admin action: ${reason}`);
  },

  async setKyc(merchantId: string, kyc: 'verified' | 'pending' | 'rejected', reason: string) {
    const m = db.merchants.byId(merchantId);
    if (!m) return;
    const updated = await adminPatchMerchant(merchantId, { kyc }, `KYC ${kyc}`, reason);
    if (!updated) return;
    this.log(`KYC ${kyc}`, reason, updated);
  },

  // ----- recharge control -----
  async manualRecharge(merchantId: string, amount: number, creditsAdded: number, reason: string) {
    const m = db.merchants.byId(merchantId);
    if (!m) return;
    const next = m.pdfCredits + creditsAdded;
    const updated = await adminPatchMerchant(merchantId, { pdfCredits: next, balance: next }, 'Manual Recharge', reason);
    if (!updated) return;
    db.recharge.insert({ id: genId('x_'), merchantId, type: 'plan', amount, credits: creditsAdded, reason: `Admin manual: ${reason}`, createdAt: Date.now() });
    this.log('Manual Recharge', reason, updated, `₹${amount} · ${creditsAdded} credits`);
  },

  async refund(rechargeId: string, reason: string) {
    const rec = db.recharge.byId(rechargeId);
    if (!rec) return;
    // Idempotency guard: a given recharge entry can only be refunded once.
    // Without this, a slow response + a second click of the Refund button
    // (or the button simply not being disabled after the first refund)
    // would subtract the same credits/amount from the merchant a second
    // time. See RechargeRecord.refundedFrom in types.ts.
    const alreadyRefunded = db.recharge.find((r) => r.refundedFrom === rec.id);
    if (alreadyRefunded) return;
    const m = db.merchants.byId(rec.merchantId);
    if (!m) return;
    const next = Math.max(0, m.pdfCredits - (rec.credits || 0));
    const updated = rec.credits ? await adminPatchMerchant(rec.merchantId, { pdfCredits: next, balance: next }, 'Refund Payment', reason) : m;
    if (!updated) return;
    db.recharge.insert({ id: genId('x_'), merchantId: rec.merchantId, type: 'debit', amount: -rec.amount, credits: -(rec.credits || 0), reason: `Refund: ${reason}`, createdAt: Date.now(), refundedFrom: rec.id });
    this.log('Refund Payment', reason, updated, `₹${rec.amount}`);
  },

  // ----- targeted notifications -----
  notifySelected(merchantIds: string[], title: string, body: string) {
    merchantIds.forEach((id) => notificationService.push(id, 'broadcast', title, body));
    this.log('Send Notification', `${merchantIds.length} merchant(s)`, undefined, title);
    const token = auth.adminToken();
    if (token) {
      apiRequest('/api/admin/broadcast', {
        method: 'POST',
        token,
        body: { title, body, merchantIds }
      }).catch((e) => console.error('[admin] broadcast selected failed:', e));
    }
  },
  notifyByPlanValidity(minDays: number, maxDays: number, title: string, body: string) {
    const targets = db.merchants.all().filter((m) => m.planValidityDays >= minDays && m.planValidityDays <= maxDays);
    targets.forEach((m) => notificationService.push(m.id, 'broadcast', title, body));
    this.log('Send Notification (plan segment)', `${targets.length} merchant(s)`, undefined, title);
    const token = auth.adminToken();
    if (token && targets.length > 0) {
      const merchantIds = targets.map((m) => m.id);
      apiRequest('/api/admin/broadcast', {
        method: 'POST',
        token,
        body: { title, body, merchantIds }
      }).catch((e) => console.error('[admin] broadcast segment failed:', e));
    }
    return targets.length;
  },
  broadcastAll(title: string, body: string) {
    notificationService.broadcast(title, body);
    this.log('Broadcast All', `${db.merchants.all().length} merchant(s)`, undefined, title);
    const token = auth.adminToken();
    if (token) {
      apiRequest('/api/admin/broadcast', {
        method: 'POST',
        token,
        body: { title, body, merchantIds: null }
      }).catch((e) => console.error('[admin] broadcast all failed:', e));
    }
  },

  // ----- support -----
  async replyTicket(id: string, reply: string, status: SupportTicket['status']) {
    const token = auth.adminToken();
    if (!token) return;
    try {
      const res = await apiRequest<{ ok: boolean; ticket: SupportTicket }>(
        `/api/admin/tickets/${id}/reply`,
        { method: 'POST', token, body: { reply, status } }
      );
      db.tickets.upsert(res.ticket);
      const t = res.ticket;
      this.log('Reply Support Ticket', t.subject, db.merchants.byId(t.merchantId) || undefined);
    } catch (e) {
      console.error('[admin] reply ticket failed:', e instanceof Error ? e.message : e);
    }
  },

  // ----- QR Inventory -----
  // Real, backend-only pool (see supabase/migrations/0008_qr_inventory.sql +
  // backend/app/qr_inventory_repo.py). Generating/assigning/unassigning here
  // writes to the actual Postgres `qr_inventory` table — assigning also
  // writes straight into merchants."qrId", the exact column the existing
  // customer /pay/:qrId flow already reads — so a printed sticker works for
  // every customer, on every device, the moment it's assigned. This
  // replaces the old admin-only-localStorage version of this feature, which
  // never left the admin's own browser (see the removed `db.qrInventory`
  // Table and the bug it caused: every scanned sticker 404'd with "No
  // merchant found for this QR code").
  async loadQrInventory(): Promise<QrInventoryItem[]> {
    const token = auth.adminToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ items: Record<string, unknown>[] }>('/api/admin/qr-inventory', { token });
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://gst.ak-logicai.in';
      const items: QrInventoryItem[] = res.items.map((r) => ({
        id: r.id as string,
        code: r.code as string,
        seq: r.seq as number,
        payUrl: `${origin}/pay/${r.code as string}`,
        status: r.status as 'available' | 'assigned',
        assignedMerchantId: (r.assignedMerchantId as string) || undefined,
        assignedAt: (r.assignedAt as number) || undefined,
        createdAt: r.createdAt as number,
      }));
      db.qrInventory.setAll(items);
      return items;
    } catch (e) {
      console.error('[admin] loading QR inventory failed:', e instanceof Error ? e.message : e);
      return [];
    }
  },

  /** Generates `count` new sequential Merchant Codes (AKM-000001 style) via
   * the backend's atomic Postgres sequence — never re-issues an existing
   * code, even across two admins clicking "Generate" at once. */
  async generateQrBatch(count = 500): Promise<QrInventoryItem[]> {
    const token = auth.adminToken();
    if (!token) throw new Error('Your admin session has expired. Please log in again.');
    await apiRequest<{ items: Record<string, unknown>[] }>('/api/admin/qr-inventory/generate', {
      method: 'POST', token, body: { count },
    });
    this.log('Generate QR Inventory', `${count} code(s) generated`);
    return this.loadQrInventory();
  },

  /** Assigns a printed sticker code to a merchant — writes the code into
   * that merchant's live qrId, so their /pay/:code link starts working
   * immediately. Fails with a clear error if the code is already assigned
   * to someone else (unassign it first) or the merchant doesn't exist. */
  async assignQr(code: string, merchantId: string): Promise<void> {
    const token = auth.adminToken();
    if (!token) throw new Error('Your admin session has expired. Please log in again.');
    await apiRequest(`/api/admin/qr-inventory/${code}/assign`, {
      method: 'POST', token, body: { merchantId },
    });
    const merchant = db.merchants.byId(merchantId);
    this.log('Assign QR Code', code, merchant, code);
    await this.loadQrInventory();
    await this.loadAll();
  },

  /** Frees a code back to "available" and clears it off whichever merchant
   * currently holds it — e.g. the merchant lost/stopped using their
   * sticker. The code can then be handed to a different merchant. */
  async unassignQr(code: string): Promise<void> {
    const token = auth.adminToken();
    if (!token) throw new Error('Your admin session has expired. Please log in again.');
    await apiRequest(`/api/admin/qr-inventory/${code}/unassign`, { method: 'POST', token });
    this.log('Unassign QR Code', code);
    await this.loadQrInventory();
    await this.loadAll();
  },

  qrInventoryStats() {
    const all = db.qrInventory.all();
    return {
      total: all.length,
      available: all.filter((q) => q.status === 'available').length,
      assigned: all.filter((q) => q.status === 'assigned').length,
    };
  },
  searchQrInventory(query: string): QrInventoryItem[] {
    const q = query.trim().toLowerCase();
    const all = db.qrInventory.all();
    if (!q) return all;
    return all.filter((r) => r.code.toLowerCase().includes(q));
  },

  // ----- Feature Flags & Per-Merchant Overrides -----
  // NOTE (2026-08-23): the old dedicated `getFeatureFlags()` /
  // `updateFeatureFlags()` pair (global-only, no merchant selection —
  // hitting /api/admin/network-feature-flags) has been removed. It was
  // duplicated in this file (defined twice, a TS2300 "Duplicate identifier"
  // compile error) and was already dead code — nothing in the UI called it
  // anymore once AdminSystem.tsx switched to the generic per-merchant
  // panel below, which covers `merchant_network_enabled` as just one more
  // entry in `supported_flags` (with full merchant search + select).
  async getAllFeatureFlags(): Promise<{
    ok: boolean;
    global_flags: Array<{ id: string; flag_key: string; enabled: boolean; updated_by_admin_id?: string; updated_at: number }>;
    merchant_overrides: Array<{
      id: string;
      flag_key: string;
      enabled: boolean;
      merchant_id: string;
      shopName: string;
      tradeName?: string;
      ownerName?: string;
      phone: string;
      email: string;
      merchantCode?: string;
      updated_by_admin_id?: string;
      updated_at: number;
    }>;
    supported_flags: Array<{ key: string; label: string; default: boolean }>;
  }> {
    const token = auth.adminToken();
    if (!token) throw new Error('Admin session expired.');
    return await apiRequest('/api/admin/feature-flags', { token });
  },

  async setMerchantFeatureFlagOverride(merchantId: string, flagKey: string, enabled: boolean): Promise<any> {
    const token = auth.adminToken();
    if (!token) throw new Error('Admin session expired.');
    return await apiRequest('/api/admin/feature-flags/merchant-override', {
      method: 'POST',
      token,
      body: { merchantId, flagKey, enabled }
    });
  },

  async removeMerchantFeatureFlagOverride(merchantId: string, flagKey: string): Promise<any> {
    const token = auth.adminToken();
    if (!token) throw new Error('Admin session expired.');
    return await apiRequest(`/api/admin/feature-flags/merchant-override?merchantId=${encodeURIComponent(merchantId)}&flagKey=${encodeURIComponent(flagKey)}`, {
      method: 'DELETE',
      token
    });
  },

  async setGlobalFeatureFlag(flagKey: string, enabled: boolean): Promise<any> {
    const token = auth.adminToken();
    if (!token) throw new Error('Admin session expired.');
    return await apiRequest('/api/admin/feature-flags/global', {
      method: 'POST',
      token,
      body: { flagKey, enabled }
    });
  },
};

// ---------- fraud detection engine ----------
export type Severity = 'high' | 'medium' | 'low';
export interface FraudFlag {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  detail: string;
  merchants: string[]; // merchant names involved
}

export const fraudService = {
  scan(): FraudFlag[] {
    const flags: FraudFlag[] = [];
    const merchants = db.merchants.all();
    const requests = db.requests.all();
    const invoices = db.invoices.all();

    const groupBy = <T,>(arr: T[], key: (t: T) => string | undefined) => {
      const map = new Map<string, T[]>();
      arr.forEach((x) => { const k = key(x); if (!k) return; map.set(k, [...(map.get(k) || []), x]); });
      return map;
    };

    // 1. Same GSTIN across multiple merchant accounts
    groupBy(merchants, (m) => m.gstin).forEach((ms, gstin) => {
      if (ms.length > 1) flags.push({ id: 'gst_' + gstin, severity: 'high', category: 'Duplicate GSTIN', title: 'Same GSTIN on multiple accounts', detail: `GSTIN ${gstin} is registered on ${ms.length} accounts.`, merchants: ms.map((m) => m.shopName) });
    });

    // 2. Same PAN linked to multiple accounts
    groupBy(merchants, (m) => m.pan).forEach((ms, pan) => {
      if (ms.length > 1) flags.push({ id: 'pan_' + pan, severity: 'high', category: 'Duplicate PAN', title: 'Same PAN on multiple accounts', detail: `PAN ${pan} appears on ${ms.length} accounts.`, merchants: ms.map((m) => m.shopName) });
    });

    // 3. Same bank account on different merchants
    groupBy(merchants, (m) => m.accountNumber).forEach((ms, acc) => {
      if (ms.length > 1) flags.push({ id: 'bank_' + acc, severity: 'medium', category: 'Shared Bank', title: 'Same bank account on multiple merchants', detail: `A/C ${acc} linked to ${ms.length} merchants.`, merchants: ms.map((m) => m.shopName) });
    });

    // 4. Same UPI ID repeated
    groupBy(merchants.filter((m) => m.upiId), (m) => m.upiId).forEach((ms, upi) => {
      if (ms.length > 1) flags.push({ id: 'upi_' + upi, severity: 'medium', category: 'Shared UPI', title: 'Same UPI ID repeated', detail: `UPI ${upi} used by ${ms.length} merchants.`, merchants: ms.map((m) => m.shopName) });
    });

    // 5. Same phone across multiple GSTINs (mobile reuse)
    const gstByPhone = new Map<string, Set<string>>();
    merchants.forEach((m) => { if (!gstByPhone.has(m.phone)) gstByPhone.set(m.phone, new Set()); gstByPhone.get(m.phone)!.add(m.gstin); });
    gstByPhone.forEach((gstins, phone) => {
      if (gstins.size > 1) flags.push({ id: 'phgst_' + phone, severity: 'medium', category: 'Mobile Reuse', title: 'One mobile, multiple GSTINs', detail: `Phone ${phone} linked to ${gstins.size} different GSTINs.`, merchants: [] });
    });

    // 6. Duplicate UTR / transaction IDs
    groupBy(requests.filter((r) => r.paymentRef), (r) => r.paymentRef).forEach((rs, ref) => {
      if (rs.length > 1) flags.push({ id: 'utr_' + ref, severity: 'high', category: 'Duplicate UTR', title: 'Duplicate UTR / Transaction ID', detail: `UTR ${ref} reused across ${rs.length} requests.`, merchants: [...new Set(rs.map((r) => db.merchants.byId(r.merchantId)?.shopName || '—'))] });
    });

    // 7. Invoice generation spikes (>8 invoices in last 24h)
    const dayAgo = Date.now() - DAY_MS;
    groupBy(invoices.filter((iv) => iv.createdAt >= dayAgo), (iv) => iv.merchantId).forEach((ivs, mid) => {
      if (ivs.length > 8) { const m = db.merchants.byId(mid); flags.push({ id: 'spike_' + mid, severity: 'medium', category: 'Volume Spike', title: 'Unusual invoice spike', detail: `${ivs.length} invoices generated in 24h.`, merchants: m ? [m.shopName] : [] }); }
    });

    // 8. Repeated failed logins (>=3)
    groupBy(db.loginActivity.filter((l) => !l.success), (l) => l.merchantId).forEach((ls, mid) => {
      if (ls.length >= 3) { const m = db.merchants.byId(mid); flags.push({ id: 'login_' + mid, severity: 'low', category: 'Failed Logins', title: 'Repeated failed login attempts', detail: `${ls.length} failed login attempts detected.`, merchants: m ? [m.shopName] : [] }); }
    });

    // 9. High-value B2C without GSTIN
    invoices.filter((iv) => iv.grandTotal > 50000 && !iv.customerGstin).forEach((iv) => {
      const m = db.merchants.byId(iv.merchantId);
      flags.push({ id: 'hv_' + iv.id, severity: 'low', category: 'High Value', title: 'High-value B2C invoice', detail: `${iv.invoiceNo} (₹${iv.grandTotal.toLocaleString('en-IN')}) without buyer GSTIN.`, merchants: m ? [m.shopName] : [] });
    });

    const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
    return flags.sort((a, b) => order[a.severity] - order[b.severity]);
  },

  /** Duplicate GSTIN groups (>=2 merchants share a GSTIN). */
  duplicateGstins(): { gstin: string; merchants: Merchant[] }[] {
    const map = new Map<string, Merchant[]>();
    db.merchants.all().forEach((m) => map.set(m.gstin, [...(map.get(m.gstin) || []), m]));
    return Array.from(map.entries()).filter(([, ms]) => ms.length > 1).map(([gstin, merchants]) => ({ gstin, merchants }));
  },

  /** Used at registration to block/flag duplicate GSTIN. */
  gstinExists(gstin: string): Merchant | undefined {
    return db.merchants.find((m) => m.gstin.toUpperCase() === gstin.toUpperCase());
  },
};

// ==========================================
// MODULE A: Merchant Network Service
// ==========================================

export const merchantNetworkService = {
  async getFeatureFlag(): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) return false;
    try {
      const res = await apiRequest<{ merchant_network_enabled: boolean }>('/api/merchant/merchant-network/feature-flag', { token });
      return res.merchant_network_enabled;
    } catch {
      return false;
    }
  },

  async createRequest(productName: string, quantity: number, unit: string, urgency: 'normal' | 'urgent'): Promise<any> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    return await apiRequest('/api/merchant/merchant-network/requests', {
      method: 'POST',
      token,
      body: { product_name: productName, quantity, unit, urgency }
    });
  },

  async getNearbyRequests(): Promise<any[]> {
    const token = auth.merchantToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ requests: any[] }>('/api/merchant/merchant-network/requests/nearby', { token });
      return res.requests;
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async updateRequest(requestId: string, payload: { product_name?: string; quantity?: number; unit?: string; urgency?: string }): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    try {
      const res = await apiRequest<{ ok: boolean }>(`/api/merchant/merchant-network/requests/${requestId}`, {
        method: 'PATCH',
        token,
        body: payload
      });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  async respondToRequest(requestId: string, availability: 'available' | 'not_available'): Promise<any> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    return await apiRequest(`/api/merchant/merchant-network/requests/${requestId}/respond`, {
      method: 'POST',
      token,
      body: { availability }
    });
  },

  async acceptResponse(requestId: string, responderMerchantId: string): Promise<any> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    return await apiRequest(`/api/merchant/merchant-network/requests/${requestId}/accept`, {
      method: 'POST',
      token,
      body: { responder_merchant_id: responderMerchantId }
    });
  },

  async dismissResponse(responseId: string): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    try {
      const res = await apiRequest<{ ok: boolean }>(`/api/merchant/merchant-network/responses/${responseId}/dismiss`, {
        method: 'PATCH',
        token
      });
      return res.ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  async getMessages(orderId: string): Promise<any[]> {
    const token = auth.merchantToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ messages: any[] }>(`/api/merchant/merchant-network/orders/${orderId}/messages`, { token });
      return res.messages;
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async sendMessage(orderId: string, body: string): Promise<any> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    return await apiRequest(`/api/merchant/merchant-network/orders/${orderId}/messages`, {
      method: 'POST',
      token,
      body: { body }
    });
  },

  async sendMessageWithImage(orderId: string, body: string, imageUrl: string): Promise<any> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    return await apiRequest(`/api/merchant/merchant-network/orders/${orderId}/messages`, {
      method: 'POST',
      token,
      body: { body, image_url: imageUrl }
    });
  },

  async confirmOrder(orderId: string): Promise<any> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Your session has expired. Please log in again.');
    return await apiRequest(`/api/merchant/merchant-network/orders/${orderId}/confirm`, {
      method: 'POST',
      token
    });
  },

  async getHistory(status?: string): Promise<{ requests: any[]; orders: any[] }> {
    const token = auth.merchantToken();
    if (!token) return { requests: [], orders: [] };
    try {
      const path = status ? `/api/merchant/merchant-network/history?status=${status}` : '/api/merchant/merchant-network/history';
      const res = await apiRequest<{ requests: any[]; orders: any[] }>(path, { token });
      return res;
    } catch (e) {
      console.error(e);
      return { requests: [], orders: [] };
    }
  },

  async getNotifications(): Promise<any[]> {
    const token = auth.merchantToken();
    if (!token) return [];
    try {
      const res = await apiRequest<{ notifications: any[] }>('/api/merchant/merchant-network/notifications', { token });
      return res.notifications;
    } catch (e) {
      console.error(e);
      return [];
    }
  },

  async cancelOrder(orderId: string, reason?: string): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Not logged in');
    try {
      const res = await apiRequest<{ ok: boolean }>(`/api/merchant/merchant-network/orders/${orderId}/cancel`, {
        method: 'PATCH',
        token,
        body: { reason }
      });
      return res.ok;
    } catch (e) {
      console.error('[network] cancel order failed:', e);
      return false;
    }
  },

  async submitReview(orderId: string, rating: number, comment?: string): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Not logged in');
    try {
      const res = await apiRequest<{ ok: boolean }>(`/api/merchant/merchant-network/orders/${orderId}/rate`, {
        method: 'POST',
        token,
        body: { rating, comment }
      });
      return res.ok;
    } catch (e) {
      console.error('[network] submit review failed:', e);
      return false;
    }
  },

  async reportDispute(orderId: string, reason: string, details?: string): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Not logged in');
    try {
      const res = await apiRequest<{ ok: boolean }>(`/api/merchant/merchant-network/orders/${orderId}/dispute`, {
        method: 'POST',
        token,
        body: { reason, details }
      });
      return res.ok;
    } catch (e) {
      console.error('[network] report dispute failed:', e);
      return false;
    }
  },

  async cancelRequest(requestId: string): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) throw new Error('Not logged in');
    try {
      const res = await apiRequest<{ ok: boolean }>(`/api/merchant/merchant-network/requests/${requestId}/cancel`, {
        method: 'PATCH',
        token,
      });
      return res.ok;
    } catch (e) {
      console.error('[network] cancel request failed:', e);
      return false;
    }
  },

  async markNotificationAsRead(id: string): Promise<any> {
    const token = auth.merchantToken();
    if (!token) return;
    return await apiRequest(`/api/merchant/merchant-network/notifications/${id}/read`, {
      method: 'PATCH',
      token
    });
  }
};

// ==========================================
// AKAI Business Controller / Live Audit feature flag
// ==========================================
// Separate from the @akai CHAT copilot (routers/akai.py: /query,
// /execute-action, gated by akai_assistant_enabled) — this gates ONLY the
// merchant-facing self-audit tool (AkaiTriggerButton, AkaiAuditOverlay,
// the Overview.tsx "AKAI Business Controller" banner). Previously shown
// to every merchant unconditionally with no flag check at all. See
// feature_flags_repo.py ("akai_audit_enabled") and routers/akai.py
// (GET /merchant/akai/audit-feature-flag). Mirrors the exact
// fetch/fail-closed pattern merchantNetworkService.getFeatureFlag() above
// already uses.
export const akaiAuditService = {
  async getFeatureFlag(): Promise<boolean> {
    const token = auth.merchantToken();
    if (!token) return false;
    try {
      const res = await apiRequest<{ ok?: boolean; akai_audit_enabled?: boolean; enabled?: boolean }>('/api/merchant/akai/audit-feature-flag', { token });
      return res.akai_audit_enabled ?? res.enabled ?? false;
    } catch {
      try {
        const res2 = await apiRequest<{ ok?: boolean; akai_audit_enabled?: boolean; enabled?: boolean }>('/api/merchant/akai-audit/feature-flag', { token });
        return res2.akai_audit_enabled ?? res2.enabled ?? false;
      } catch {
        return false;
      }
    }
  }
};

// ---------- HSN learning service ----------

export const hsnLearningService = {
  /** Fetch learned HSN signals from the backend and merge them into the
   *  in-memory LearnMap so suggestHsn() can use DB-backed data. */
  async fetchAndHydrate(merchantId: string): Promise<void> {
    const token = auth.merchantToken();
    if (!token || !merchantId) return;
    try {
      const res = await apiRequest<{ ok: boolean; signals: Array<{ normalized_item_name: string; hsn: string; gst_rate: number; approve_count: number; last_seen_at: number }> }>(
        '/api/merchant/hsn-learning', { token },
      );
      if (res.ok && res.signals) {
        hydrateLearnedFromServer(merchantId, res.signals);
      }
    } catch (e) {
      console.error('[hsn-learning] fetch failed:', e instanceof Error ? e.message : e);
    }
  },
};

// ---------- Customer Vault service ----------

export const customerService = {
  async register(
    name: string,
    phone: string,
    pin: string,
    resetToken: string,
    extraProfile?: { email?: string; gstin?: string; billingAddress?: string; companyName?: string; state?: string }
  ) {
    const res = await apiRequest<{ ok: boolean; token: string; customer: any }>('/api/customer/register', {
      method: 'POST',
      body: { name, phone, pin, resetToken, ...(extraProfile || {}) },
    });
    auth.loginCustomer(res.customer.id, res.token);
    return res.customer;
  },
  async login(identifier: string, pin: string) {
    const res = await apiRequest<{ ok: boolean; token: string; customer: any }>('/api/customer/login', {
      method: 'POST',
      body: { identifier, pin },
    });
    auth.loginCustomer(res.customer.id, res.token);
    return res.customer;
  },
  async resetPin(phone: string, resetToken: string, newPin: string) {
    return await apiRequest<{ ok: boolean; message: string }>('/api/customer/reset-pin', {
      method: 'POST',
      body: { phone, resetToken, newPin },
    });
  },
  async fetchMe() {
    const token = auth.customerToken();
    if (!token) return null;
    return await apiRequest<any>('/api/customer/me', { token });
  },
  async fetchInvoices() {
    const token = auth.customerToken();
    if (!token) return [];
    return await apiRequest<any[]>('/api/customer/invoices', { token });
  },
};

// ---------- seed ----------
/**
 * Production seed. No demo merchants, customers, invoices or transactions are
 * created. We only bump the schema marker so any stale demo dataset from an
 * earlier build is cleared and the platform starts completely empty.
 */
export function runSeed() {
  if (!needsSeed()) return;
  markSeeded();

  // Genuinely empty. No demo/dummy merchant, customer, invoice, or
  // transaction rows are created — this only clears any local cache from a
  // previous build so every device/browser starts with a blank slate. All
  // real data is written directly by registration/login/dashboard flows
  // against Supabase.
  db.merchants.seed([]);
  db.requests.seed([]);
  db.invoices.seed([]);
  db.subscriptions.seed([]);
  db.recharge.seed([]);
  db.notifications.seed([]);
  db.contacts.seed([]);
  db.tickets.seed([]);
  db.auditLogs.seed([]);
  db.loginActivity.seed([]);
}
runSeed();
