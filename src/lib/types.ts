import type { PaymentMode } from './payment';

/**
 * Domain models — mirror the planned PostgreSQL schema 1:1.
 * Tables: merchants, billing_requests, invoices, subscriptions,
 * recharge_history, notifications, address_book, support_tickets.
 */

export type Plan = 'recharge' | 'monthly';

export interface Merchant {
  id: string;
  /** Permanent Merchant ID (e.g. AKM-000125). Backend-generated at
   * registration, shown on the dashboard/profile/QR/invoices/admin panel,
   * and never changes. Optional only so older cached/local records from
   * before this field existed don't break type-checking at compile time —
   * every merchant returned by the backend always has one. */
  merchantCode?: string;
  shopName: string;
  ownerName: string;
  legalName?: string;       // GST legal name
  tradeName?: string;       // GST trade name
  businessType?: string;    // Proprietorship / Partnership / etc.
  email: string;
  phone: string;
  mpin: string;
  gstin: string;
  pan: string;
  address: string;
  state: string;
  city?: string;
  pincode?: string;
  latitude?: number | null;
  longitude?: number | null;
  bankName: string;
  accountType?: 'current' | 'savings';
  accountNumber: string;
  ifsc: string;
  signatureDataUrl?: string;
  logoDataUrl?: string;
  companySealDataUrl?: string;
  logoUrl?: string;
  signatureUrl?: string;
  companySealUrl?: string;
  hasCustomLogo?: boolean;
  hasSignature?: boolean;
  hasCompanySeal?: boolean;
  brandName?: string;       // custom display name (monthly+ only)
  brandColor?: string;
  invoicePrefix?: string;

  // ---- subscription / credit state ----
  planId: string;           // FK to PLANS / FREE_PLAN
  planName: string;
  planValidityDays: number; // validity of the current plan in days
  planStartedAt: number;
  planExpiresAt: number;    // 0 = no active validity (free)
  pdfCredits: number;       // explicit remaining PDF credits
  lastFreeInvoiceAt?: number; // epoch-ms of last free daily invoice use (null/0 = never)
  customBranding: boolean;  // true when plan validity >= 30 days

  qrId: string;
  status?: 'active' | 'suspended' | 'disabled';
  kyc?: 'verified' | 'pending' | 'rejected';
  upiId?: string;
  networkTermsAccepted?: boolean;
  networkTermsAcceptedAt?: number;
  networkTermsVersion?: string;

  // monitoring
  lastLoginAt?: number;
  lastIp?: string;
  lastDevice?: string;

  createdAt: number;

  /** @deprecated legacy fields kept for backwards-compat in some views */
  plan?: Plan;
  balance?: number;
}

/** admin_audit_logs table — every sensitive admin action */
export interface AuditLog {
  id: string;
  adminName: string;
  action: string;
  targetMerchantId?: string;
  targetMerchantName?: string;
  reason: string;
  meta?: string;
  createdAt: number;
}

/**
 * QR Inventory — Admin-only feature (see AdminQrInventory.tsx).
 *
 * A pre-generated, pre-printed pool of Merchant Codes + QR stickers that
 * exists BEFORE any merchant is registered against them. This is entirely
 * separate from `Merchant.merchantCode` (which is generated automatically
 * at registration time via the Supabase `merchant_code_seq` sequence — see
 * migration 0006). Nothing here changes that flow: it stays 100% untouched.
 *
 * Each row's `code` reuses the exact same "AKM-000001" display format so a
 * printed sticker looks identical whether it came from this pool or from
 * organic registration. Assignment (linking a code here to a real merchant
 * at registration/onboarding time) is intentionally NOT implemented yet —
 * per spec this is a later phase. `status` exists now so the Admin UI and
 * future assignment logic have something to read/write.
 */
export interface QrInventoryItem {
  id: string;
  code: string; // e.g. "AKM-000001"
  seq: number; // numeric part, e.g. 1 — used for sorting/search
  payUrl: string; // e.g. "https://gst.ak-logicai.in/pay/AKM-000001"
  status: 'available' | 'assigned';
  assignedMerchantId?: string;
  assignedAt?: number;
  createdAt: number;
}

/** login_activity table — merchant login + device monitoring */
export interface LoginActivity {
  id: string;
  merchantId: string;
  ip: string;
  device: string;
  success: boolean;
  createdAt: number;
}

export interface InvoiceItem {
  id: string;
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstRate: number;
  inventoryItemId?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'rejected';

/** billing_requests table */
export interface InvoiceRequest {
  id: string;
  merchantId: string;
  invoiceNo?: string;
  /** Permanent, backend-generated Invoice Number (e.g. AKM-000125-000001)
   * — mirrored here from the Invoice once approved, purely so it's
   * searchable/visible on the request itself. Separate from invoiceNo
   * (the GST tax-invoice number), which is unchanged. */
  invoiceNumber?: string;
  invoiceId?: string; // FK to generated invoice once approved
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerGstin?: string;
  customerPan?: string;
  customerAddress: string;
  customerState?: string;
  paymentMode?: PaymentMode;
  paymentRef?: string; // UTR / Txn ID
  items: InvoiceItem[];
  notes?: string; // customer notes OR rejection reason
  rejectReason?: string;
  status: RequestStatus;
  createdAt: number;
  resolvedAt?: number;
  branded: boolean;
}

/** invoices table — immutable financial record created on approval */
export interface Invoice {
  id: string;
  requestId: string;
  merchantId: string;
  invoiceNo: string;
  /** Permanent, backend-generated Invoice Number (e.g. AKM-000125-000001).
   * Every invoice gets a unique running number scoped to its merchant's
   * own counter (see merchant_repo.next_invoice_number on the backend).
   * This is additive and separate from invoiceNo (the existing GST
   * tax-invoice number, format INV/2025-26/0001) — that field, and the
   * approve/reject/download workflow around it, is unchanged. Optional
   * only so an invoice created before this field existed, or one where
   * the backend call briefly failed, doesn't break type-checking. */
  invoiceNumber?: string;
  invoiceDate: number;
  // snapshot of buyer
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerGstin?: string;
  customerPan?: string;
  customerAddress: string;
  customerState?: string;
  paymentMode?: PaymentMode;
  paymentRef?: string;
  notes?: string;
  items: InvoiceItem[];
  // computed snapshot
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  amountInWords: string;
  placeOfSupply: string;
  isInterState: boolean;
  branded: boolean; // merchant branding vs AK-LOGIC AI
  createdAt: number;
}

/** subscriptions table */
export interface Subscription {
  id: string;
  merchantId: string;
  planId: string;
  planName: string;
  validityDays: number;
  startedAt: number;
  expiresAt: number;
  active: boolean;
}

/** recharge_history table */
export interface RechargeRecord {
  id: string;
  merchantId: string;
  // 'credit_refund' = a PDF credit that was deducted (via consumeCredit)
  // for an invoice that then failed to be created is credited back. Kept
  // distinct from 'debit' (money/credits going OUT) since this is credits
  // coming back IN, and from 'plan'/'addon' since no purchase happened.
  type: 'plan' | 'addon' | 'debit' | 'carry_forward' | 'credit_refund';
  amount: number;          // ₹ paid (0 for debit/carry/credit_refund)
  credits: number;         // PDF credits added/removed (+/-)
  carriedForward?: number; // credits carried from previous plan
  validityDays?: number;   // days granted (plan/addon)
  planName?: string;
  reason: string;
  createdAt: number;
  // Set on an admin "refund" entry to the id of the original recharge
  // record it refunds, so that record can never be refunded twice (see
  // adminService.refund in services.ts).
  refundedFrom?: string;
}

export interface Contact {
  id: string;
  merchantId: string;
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  createdAt: number;
}

export type NotificationType = 'request' | 'approved' | 'rejected' | 'recharge' | 'system' | 'alert' | 'broadcast';

export interface AppNotification {
  id: string;
  merchantId: string; // '*' = broadcast to all
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

export type TicketStatus = 'open' | 'pending' | 'resolved';

export interface SupportTicket {
  id: string;
  merchantId: string;
  subject: string;
  category: string;
  message: string;
  status: TicketStatus;
  createdAt: number;
  reply?: string;
}

export interface Analytics {
  totalRevenue: number;
  totalTax: number;
  invoiceCount: number;
  pendingCount: number;
}

/**
 * platform_settings table (single row). Managed by the Super Admin.
 * The default AK-LOGIC AI logo here is used for ALL free + short-duration
 * (validity < 30 days) merchants across dashboards, QR pages and invoice PDFs.
 */
export interface PlatformSettings {
  defaultLogoDataUrl?: string;   // custom default AK-LOGIC AI logo (overrides built-in SVG)
  brandName: string;             // platform brand name shown to free merchants
  tagline: string;
  updatedAt: number;
  updatedBy: string;
}

// ==========================================
// MODULE A: Merchant Network Types
// ==========================================

export interface MerchantNetworkRequest {
  id: string;
  requester_merchant_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  urgency: 'normal' | 'urgent';
  status: 'open' | 'responded' | 'accepted' | 'confirmed' | 'completed' | 'cancelled';
  city?: string;
  pincode?: string;
  state?: string;
  origin: 'direct' | 'customer_escalation';
  origin_customer_request_id?: string;
  match_source: 'manual' | 'inventory_auto';
  created_at: number;
  updated_at: number;
}

export interface MerchantNetworkResponse {
  id: string;
  request_id: string;
  responder_merchant_id: string;
  availability: 'available' | 'not_available';
  created_at: number;
}

export interface MerchantNetworkOrder {
  id: string;
  request_id: string;
  buyer_merchant_id: string;
  seller_merchant_id: string;
  delivery_mode: 'self_pickup' | 'delivery_partner';
  delivery_provider_code?: string;
  delivery_provider_ref?: string;
  buyer_confirmed_at?: number;
  seller_confirmed_at?: number;
  status: 'accepted' | 'confirmed' | 'completed' | 'cancelled';
  created_at: number;
  updated_at: number;
}

export interface MerchantNetworkMessage {
  id: string;
  order_id?: string;
  request_id?: string;
  sender_merchant_id: string;
  body: string;
  created_at: number;
}

export interface NetworkNotification {
  id: string;
  recipient_merchant_id: string;
  event_type: string;
  title: string;
  body: string;
  related_request_id?: string;
  related_order_id?: string;
  read: boolean;
  created_at: number;
}

// ==========================================
// HSN Learning Types
// ==========================================

/** HSN learning signal returned by GET /api/merchant/hsn-learning */
export interface HsnLearningSignal {
  normalized_item_name: string;
  hsn: string;
  gst_rate: number;
  approve_count: number;
  last_seen_at: number;
}
