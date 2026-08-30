/**
 * React binding layer + backward-compatible facade over the service layer.
 * Components import hooks from here; business logic lives in services.ts.
 */
import { useSyncExternalStore } from 'react';
import { subscribe, genId as uid } from './db';
import {
  db, auth, merchantService, customerService, requestService, invoiceService, subscriptionService,
  notificationService, contactService, supportService, credits,
  adminService, fraudService, activityService, paymentService,
} from './services';
import type { InvoiceItem, Merchant, InvoiceRequest, Contact } from './types';
import type { FraudFlag } from './services';

export { uid, credits, adminService, fraudService, activityService, paymentService, requestService, invoiceService, db, merchantService, customerService };
export type { ApproveResult, FraudFlag, Severity } from './services';
export { MerchantSyncError } from './services';
export type { MerchantLookupResult, MerchantLoginResult } from './services';

// ---------- reactive hooks ----------
export function useStore<T>(selector: () => T): T {
  return useSyncExternalStore(subscribe, selector, selector);
}
export function useAuthInitialized() { return useStore(() => auth.isInitialized()); }
export function useSession() { return useStore(() => auth.session()); }
/** Merchant-realm session only (string merchantId | null). */
export function useMerchantSession() { return useStore(() => auth.merchantSession()); }
/** Customer-realm session only (string customerId | null). */
export function useCustomerSession() { return useStore(() => auth.customerSession()); }
/** Admin-realm session only (boolean). */
export function useAdminSession() { return useStore(() => auth.adminSession()); }
export function useMerchants() { return useStore(() => db.merchants.all()); }
export function useRequests() { return useStore(() => db.requests.all()); }
export function useInvoices() { return useStore(() => db.invoices.all()); }
/**
 * `db.requests`/`db.invoices` are now Supabase-backed (RemoteTable) and
 * start with an empty cache until the first fetch resolves. Without this,
 * a merchant's dashboard would flash "No pending requests" for a moment on
 * every load, indistinguishable from actually having none. UI can use
 * these to show a loading state instead during that brief window.
 */
export function useRequestsReady() { return useStore(() => db.requests.isReady()); }
export function useInvoicesReady() { return useStore(() => db.invoices.isReady()); }
export function useContacts() { return useStore(() => db.contacts.all()); }
export function useNotifications() { return useStore(() => db.notifications.all()); }
export function useTickets() { return useStore(() => db.tickets.all()); }
export function useTxns() { return useStore(() => db.recharge.all()); }
export function useSubscriptions() { return useStore(() => db.subscriptions.all()); }
export function useAuditLogs() { return useStore(() => db.auditLogs.all()); }
export function useQrInventory() { return useStore(() => db.qrInventory.all()); }
export function useLoginActivity() { return useStore(() => db.loginActivity.all()); }
let lastMerchants: any = null;
let lastRequests: any = null;
let lastInvoices: any = null;
let lastLoginActivity: any = null;
let cachedFlags: FraudFlag[] = [];

export function useFraudFlags() {
  return useStore(() => {
    const m = db.merchants.all();
    const r = db.requests.all();
    const i = db.invoices.all();
    const l = db.loginActivity.all();
    if (m !== lastMerchants || r !== lastRequests || i !== lastInvoices || l !== lastLoginActivity) {
      lastMerchants = m;
      lastRequests = r;
      lastInvoices = i;
      lastLoginActivity = l;
      cachedFlags = fraudService.scan();
    }
    return cachedFlags;
  });
}

let lastDupMerchants: any = null;
let cachedDups: { gstin: string; merchants: Merchant[] }[] = [];

export function useDuplicateGstins() {
  return useStore(() => {
    const m = db.merchants.all();
    if (m !== lastDupMerchants) {
      lastDupMerchants = m;
      cachedDups = fraudService.duplicateGstins();
    }
    return cachedDups;
  });
}
export function useCurrentMerchant() {
  return useStore(() => {
    const s = auth.session();
    return s.merchantId ? db.merchants.byId(s.merchantId) : undefined;
  });
}
/**
 * True unless the logged-in merchant's account has been suspended/disabled
 * by an admin. Route guards use this to revoke dashboard access from an
 * already-active session the moment status changes, instead of only
 * checking that a merchantId session exists.
 */
export function useMerchantAccountActive() {
  return useStore(() => {
    const id = auth.merchantSession();
    if (!id) return true;
    const m = db.merchants.byId(id);
    return !m || m.status === 'active' || m.status === undefined;
  });
}

// ---------- facade (kept for existing components) ----------
export const store = {
  getMerchants: () => db.merchants.all(),
  getRequests: () => db.requests.all(),
  getInvoices: () => db.invoices.all(),
  getContacts: () => db.contacts.all(),
  getNotifications: () => db.notifications.all(),
  getTickets: () => db.tickets.all(),
  getTxns: () => db.recharge.all(),
  getSession: () => auth.session(),

  loginMerchant: (id: string, token?: string) => auth.loginMerchant(id, token),
  loginAdmin: (token?: string) => auth.loginAdmin(token),
  loginCustomer: (id: string, token?: string) => auth.loginCustomer(id, token),
  logout: () => auth.logout(),
  logoutMerchant: () => auth.logoutMerchant(),
  logoutAdmin: () => auth.logoutAdmin(),
  logoutCustomer: () => auth.logoutCustomer(),
  initializeAuth: () => auth.initialize(),
  /**
   * RLS hardening Phase 2 (see supabase/migrations/0005_merchants_lockdown.sql):
   * MPIN login is now verified only by the backend (bcrypt, server-side
   * lockout) — the old local-cache SHA-256 fast path is gone. See
   * MerchantLogin.tsx and merchantService.verifyMpinRemote.
   */
  verifyMpinRemote: (phone: string, email: string, mpin: string) => merchantService.verifyMpinRemote(phone, email, mpin),

  /** "Forgot MPIN" recovery — see ForgotMpin.tsx and merchantService.resetMpin. */
  resetMpin: (phone: string, email: string, resetToken: string, newMpin: string) =>
    merchantService.resetMpin(phone, email, resetToken, newMpin),

  /**
   * Registration is NOT considered successful until Supabase confirms the
   * write. Throws MerchantSyncError on failure — callers must catch this.
   */
  registerMerchant: (data: Parameters<typeof merchantService.register>[0]) => merchantService.register(data),
  /** Admin-console equivalent of registerMerchant — for when the OTP
   * provider is unavailable. See adminService.createMerchant. */
  adminCreateMerchant: (data: Parameters<typeof adminService.createMerchant>[0]) => adminService.createMerchant(data),
  updateMerchant: (id: string, patch: Partial<Merchant>) => merchantService.update(id, patch),
  /**
   * The ONLY merchant-by-QR lookup in the app. Always queries Supabase —
   * never resolves from localStorage alone. Returns a discriminated result
   * so the UI can distinguish "not found" from "couldn't reach Supabase"
   * from "permission denied", instead of one generic message.
   */
  getMerchantByQr: (qrId: string) => merchantService.lookupByQr(qrId),
  // Synchronous, local-cache read (InvoiceStatus.tsx and others call this
  // without awaiting it) — not a network round trip.
  getMerchant: (id: string) => db.merchants.byId(id),
  setMerchantStatus: (id: string, status: 'active' | 'suspended' | 'disabled', reason = 'Admin action') =>
    adminService.setStatus(id, status, reason),

  createRequest: (req: Omit<InvoiceRequest, 'id' | 'status' | 'createdAt'>) => requestService.create(req),
  updateRequest: (id: string, patch: Partial<InvoiceRequest>) => requestService.update(id, patch),
  rejectRequest: (id: string, notes: string) => requestService.reject(id, notes),

  /** Approve + enforce credits + compute GST + generate invoice. Returns ApproveResult. */
  approveRequest: (requestId: string, items: InvoiceItem[], customer: Partial<InvoiceRequest> = {}) =>
    invoiceService.approve(requestId, items, customer),
  getInvoice: (id: string) => invoiceService.byId(id),
  getInvoiceByRequest: (requestId: string) => invoiceService.byRequest(requestId),
  getRequest: (id: string) => db.requests.byId(id),
  credits,

  purchasePlan: (merchantId: string, planId: string) => subscriptionService.purchasePlan(merchantId, planId),
  extendValidity: (merchantId: string) => subscriptionService.extendValidity(merchantId),
  /** Provider-agnostic checkout: handles payment, then fulfils credits/validity. */
  checkoutPlan: (merchantId: string, planId: string) => paymentService.checkout(merchantId, 'plan', planId),
  checkoutAddon: (merchantId: string) => paymentService.checkout(merchantId, 'addon', 'addon_validity_50'),

  addNotification: (merchantId: string, type: Parameters<typeof notificationService.push>[1], title: string, body: string) => notificationService.push(merchantId, type, title, body),
  markNotifRead: (id: string) => notificationService.markRead(id),
  markAllNotifRead: (merchantId: string) => notificationService.markAllRead(merchantId),
  broadcast: (title: string, body: string) => notificationService.broadcast(title, body),

  upsertContact: (merchantId: string, c: Omit<Contact, 'id' | 'merchantId' | 'createdAt'>) => contactService.upsert(merchantId, c),
  deleteContact: (id: string) => contactService.remove(id),

  createTicket: (t: Parameters<typeof supportService.create>[0]) => supportService.create(t),
  replyTicket: (id: string, reply: string) => supportService.reply(id, reply),
  setTicketStatus: (id: string, status: Parameters<typeof supportService.setStatus>[1]) => supportService.setStatus(id, status),

  getAuditLogs: () => db.auditLogs.all(),
  getLoginActivity: () => db.loginActivity.all(),

  /** Merchant dashboard: (re)load the logged-in merchant's own requests +
   * invoices from the backend. Safe to call repeatedly (e.g. on a poll
   * interval) — see Dashboard.tsx. */
  refreshMyBilling: () => Promise.all([requestService.refreshMine(), invoiceService.refreshMine(), supportService.refreshMine(), merchantService.refreshMe()]),
  /** Admin console: (re)load EVERY merchant's requests + invoices. See
   * AdminDashboard.tsx. */
  loadAdminBilling: () => adminService.loadAllBilling(),
  /** Customer tracking page: capability-style single-row lookups by the
   * request's own id (no auth). See InvoiceStatus.tsx. */
  fetchPublicRequest: (id: string) => requestService.fetchPublic(id),
  fetchPublicInvoiceByRequest: (id: string) => invoiceService.fetchPublicByRequest(id),
  fetchPublicMerchant: (id: string) => merchantService.fetchPublic(id),
  fetchPublicMerchantByRequest: (requestId: string) => merchantService.fetchPublicByRequest(requestId),

  admin: adminService,
  fraud: fraudService,
  activity: activityService,
};