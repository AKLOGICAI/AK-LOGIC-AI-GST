/**
 * Payment abstraction layer — provider-agnostic.
 *
 * RLS/payment hardening (see supabase/migrations/0008_payment_orders.sql
 * and backend/app/routers/merchant.py): the amount and the "was this
 * actually paid" decision now live ENTIRELY on the backend.
 *   1. POST /api/merchant/create-order computes the real amount server-
 *      side and opens a payment_orders row (services.ts's paymentService
 *      does this before calling into this module).
 *   2. A PaymentProvider here only ever CAPTURES a payment against that
 *      already-created order — it has no say in the amount and cannot
 *      itself decide anything is "verified".
 *   3. POST /api/merchant/verify-payment independently re-checks the
 *      provider's signature server-side and marks the order 'paid'.
 *   4. Only THEN does services.ts call purchasePlan/extendValidity with
 *      the orderId, which the backend atomically consumes exactly once.
 *
 * This module never grants credits/validity itself and never decides a
 * payment is good — it only talks to the provider's checkout UI and hands
 * back whatever the provider returned, for the backend to verify.
 */
export type PaymentProviderId = 'mock' | 'razorpay';

/** A backend-issued order (see POST /api/merchant/create-order). */
export interface PaymentOrder {
  orderId: string;            // backend payment_orders.id
  providerOrderId?: string | null; // Razorpay order_id
  merchantId: string;
  purpose: 'plan' | 'addon';
  itemId: string;             // planId or 'addon_validity_50'
  amount: number;              // ₹ (server-computed; never trust a client-side price)
  currency: 'INR';
  keyId?: string | null;       // Razorpay's public key id (present once configured)
}

export interface PaymentResult {
  orderId: string;
  status: 'captured' | 'failed' | 'pending';
  providerPaymentId?: string; // e.g. Razorpay payment_id
  signature?: string;         // e.g. Razorpay signature (re-verified server-side)
  error?: string;
}

/** A pluggable payment provider. Only responsible for capture, never for
 * verification or fulfilment — see the module docstring above. */
export interface PaymentProvider {
  id: PaymentProviderId;
  /** Open the provider checkout UI against an already-created backend
   * order, and resolve once the user completes/cancels. */
  checkout(order: PaymentOrder): Promise<PaymentResult>;
}

/**
 * MOCK provider — simulates an instant successful capture so the app is
 * usable end-to-end without a real payment gateway configured. NOTE: the
 * backend's /verify-payment still independently checks the signature
 * against RAZORPAY_KEY_SECRET and fails closed (503) if that isn't
 * configured — this mock cannot itself grant a paid plan; it only stands
 * in for the "user completed checkout" step.
 */
export const mockProvider: PaymentProvider = {
  id: 'mock',
  async checkout(order) {
    // A ₹0 order (the free plan) is already marked paid by create-order —
    // paymentService.checkout() never calls a provider for it, but guard
    // here too in case this is invoked directly.
    if (order.amount === 0) return { orderId: order.orderId, status: 'captured' };
    return {
      orderId: order.orderId,
      status: 'captured',
      providerPaymentId: `pay_mock_${Date.now()}`,
      signature: 'mock_signature',
    };
  },
};

/**
 * RAZORPAY provider — opens the real Razorpay Checkout widget against the
 * backend-issued order.
 *
 * CAVEAT (see routers/merchant.py's /create-order): the backend does not
 * yet call Razorpay's own Orders API (`rzp.orders.create`) to mint a
 * provider-side order id — /create-order only returns keyId once
 * RAZORPAY_KEY_ID/SECRET are configured. Razorpay Checkout normally
 * expects a real `order_id` from their Orders API for signature
 * verification to work end-to-end. To fully activate real payments:
 *   1. In payment_repo.create_order / routers/merchant.py's create_order,
 *      call Razorpay's Orders API and store the returned id as
 *      providerOrderId on the payment_orders row.
 *   2. Return that providerOrderId here (alongside orderId) and pass it
 *      as `order_id` to the Checkout options below.
 * Until then this scaffold passes our internal orderId, matching the
 * `providerOrderId or order['id']` fallback already in /verify-payment's
 * HMAC check.
 */
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

let razorpayScriptPromise: Promise<void> | null = null;
function loadRazorpayScript(): Promise<void> {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve();
  if (!razorpayScriptPromise) {
    razorpayScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the payment gateway. Check your internet connection.'));
      document.body.appendChild(script);
    });
  }
  return razorpayScriptPromise;
}

export const razorpayProvider: PaymentProvider = {
  id: 'razorpay',
  async checkout(order) {
    if (order.amount === 0) return { orderId: order.orderId, status: 'captured' };
    if (!order.keyId) {
      return { orderId: order.orderId, status: 'failed', error: 'Payment gateway is not configured yet.' };
    }
    try {
      await loadRazorpayScript();
    } catch (e) {
      return { orderId: order.orderId, status: 'failed', error: e instanceof Error ? e.message : 'Could not load payment gateway.' };
    }
    return new Promise((resolve) => {
      const rzp = new window.Razorpay!({
        key: order.keyId,
        amount: Math.round(order.amount * 100), // paise
        currency: order.currency,
        order_id: order.providerOrderId || order.orderId,
        name: 'AK-LOGIC AI',
        description: order.purpose === 'plan' ? 'Plan purchase' : 'Validity extension',
        notes: { merchantId: order.merchantId, purpose: order.purpose, itemId: order.itemId },
        handler: (response: { razorpay_payment_id: string; razorpay_signature: string }) => {
          resolve({
            orderId: order.orderId,
            status: 'captured',
            providerPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        },
        modal: {
          ondismiss: () => resolve({ orderId: order.orderId, status: 'failed', error: 'Payment was cancelled.' }),
        },
      });
      rzp.open();
    });
  },
};

// ---- active provider selection (env-switchable) ----
const PROVIDERS: Record<PaymentProviderId, PaymentProvider> = {
  mock: mockProvider,
  razorpay: razorpayProvider,
};

/** Selected via VITE_PAYMENT_PROVIDER ('mock' | 'razorpay'); defaults to
 * 'mock' when unset or when the backend isn't configured at all, so local
 * dev without a payment gateway still works end-to-end for the free plan
 * and non-payment flows. */
const configuredProviderId = (import.meta.env.VITE_PAYMENT_PROVIDER as PaymentProviderId | undefined);
export const ACTIVE_PROVIDER_ID: PaymentProviderId =
  import.meta.env.PROD ? 'razorpay' : (configuredProviderId && PROVIDERS[configuredProviderId] ? configuredProviderId : 'mock');

export function getProvider(id: PaymentProviderId = ACTIVE_PROVIDER_ID): PaymentProvider {
  return PROVIDERS[id];
}
