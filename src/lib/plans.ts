/**
 * Plan catalog + branding policy.
 *
 * CORE PRINCIPLE: branding is decided by VALIDITY DURATION, not price.
 *   validity < 30 days  -> AK-LOGIC AI branding only (no custom logo)
 *   validity >= 30 days -> custom logo + brand name + custom invoice branding
 */

export interface PlanDef {
  id: string;
  name: string;
  price: number;        // ₹
  validityDays: number;
  credits: number;      // PDF credits granted
  tag?: string;         // marketing tag
  popular?: boolean;
  best?: boolean;
}

export const DAY_MS = 86400000;
export const CUSTOM_BRANDING_MIN_DAYS = 30;
/** Renewals within this many days of expiry are "timely" (carry-forward UX hint). */
export const CARRY_FORWARD_WINDOW_DAYS = 3;

export const FREE_PLAN: PlanDef = {
  id: 'free',
  name: 'Free Plan',
  price: 0,
  validityDays: 0,
  credits: 0,
};

/** Recharge plans (short-term <30d are trial/starter; >=30d unlock branding). */
export const PLANS: PlanDef[] = [
  { id: 'trial_20', name: '₹20 Trial', price: 20, validityDays: 1, credits: 10, tag: '1 Day' },
  { id: 'starter_50', name: '₹50 Starter', price: 50, validityDays: 3, credits: 30, tag: '3 Days' },
  { id: 'monthly_199', name: '₹199 Monthly', price: 199, validityDays: 30, credits: 300, tag: '30 Days', popular: true },
  { id: 'monthly_299', name: '₹299 Monthly', price: 299, validityDays: 30, credits: 600, tag: '30 Days' },
  { id: 'monthly_399', name: '₹399 Monthly', price: 399, validityDays: 30, credits: 1000, tag: '30 Days' },
  { id: 'monthly_900', name: '₹900 Monthly', price: 900, validityDays: 30, credits: 2500, tag: '30 Days', best: true },
];

/** ₹50 Validity Extension add-on: +30 days, no new credits. */
export const VALIDITY_ADDON = {
  id: 'addon_validity_50',
  name: '₹50 Validity Extension',
  price: 50,
  extendDays: 30,
};

export function planById(id: string): PlanDef | undefined {
  if (id === FREE_PLAN.id) return FREE_PLAN;
  return PLANS.find((p) => p.id === id);
}

/** Branding unlocked iff the plan validity is 30 days or more. */
export function planUnlocksBranding(validityDays: number): boolean {
  return validityDays >= CUSTOM_BRANDING_MIN_DAYS;
}

export function daysRemaining(expiresAt: number): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / DAY_MS));
}

export function isExpired(expiresAt: number): boolean {
  return !expiresAt || expiresAt < Date.now();
}
