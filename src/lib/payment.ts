export type PaymentMode = 'cash' | 'upi' | 'card' | 'netbanking' | 'cheque' | 'credit';

export const PAYMENT_MODES: { value: PaymentMode; label: string; icon: string; needsRef: boolean }[] = [
  { value: 'cash', label: 'Cash', icon: '💵', needsRef: false },
  { value: 'upi', label: 'UPI', icon: '⚡', needsRef: true },
  { value: 'card', label: 'Debit / Credit Card', icon: '💳', needsRef: true },
  { value: 'netbanking', label: 'Bank Transfer', icon: '🏛️', needsRef: true },
  { value: 'cheque', label: 'Cheque', icon: '✍️', needsRef: true },
  { value: 'credit', label: 'Other / Credit', icon: '🕒', needsRef: false },
];

export function paymentLabel(mode?: PaymentMode): string {
  return PAYMENT_MODES.find((p) => p.value === mode)?.label ?? 'Cash';
}

export function paymentNeedsRef(mode?: PaymentMode): boolean {
  return PAYMENT_MODES.find((p) => p.value === mode)?.needsRef ?? false;
}
