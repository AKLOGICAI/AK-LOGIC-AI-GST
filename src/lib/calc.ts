import type { InvoiceItem } from './types';

/** Quick estimate of grand total for a set of items (assumes tax applies on top).
 *  Used for previews of *pending* requests where no immutable invoice exists yet. */
export function invoiceItemsTotal(items: InvoiceItem[]): number {
  return items.reduce((s, it) => {
    const taxable = it.qty * it.rate;
    return s + taxable + (taxable * it.gstRate) / 100;
  }, 0);
}
