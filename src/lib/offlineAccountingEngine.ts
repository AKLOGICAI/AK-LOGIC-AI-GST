/**
 * offlineAccountingEngine.ts — Client-Side Double-Entry Accounting Verification & Journal Generator
 * 
 * Implements deterministic double-entry accounting rules matching backend/app/accounting_engine.py.
 * Ensures Debit == Credit mathematical equality offline.
 */

import { OfflineJournalEntry, OfflineJournalLine } from './offlineDb';

export function roundCur(val: number | string | null | undefined): number {
  if (val === null || val === undefined || isNaN(Number(val))) return 0.0;
  return Math.round(Number(val) * 100) / 100;
}

export interface ValidationResult {
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  error?: string;
}

export function validateJournalLines(lines: OfflineJournalLine[]): ValidationResult {
  if (!lines || lines.length === 0) {
    return { isBalanced: false, totalDebit: 0, totalCredit: 0, error: 'Journal entry cannot be empty.' };
  }

  let totalDebit = 0;
  let totalCredit = 0;

  for (const l of lines) {
    totalDebit += roundCur(l.debit || 0);
    totalCredit += roundCur(l.credit || 0);
  }

  totalDebit = roundCur(totalDebit);
  totalCredit = roundCur(totalCredit);

  const diff = roundCur(Math.abs(totalDebit - totalCredit));
  const isBalanced = diff < 0.05; // 0.05 INR tolerance for fractional currency round-off

  return {
    isBalanced,
    totalDebit,
    totalCredit,
    error: isBalanced ? undefined : `Unbalanced double-entry: Total Debit (${totalDebit}) != Total Credit (${totalCredit}). Diff: ${diff}`
  };
}

export function isSettledPayment(paymentMode: string): boolean {
  if (!paymentMode) return true;
  const pm = paymentMode.trim().toLowerCase();
  return [
    'cash', 'upi', 'online', 'paid', 'bank transfer', 'card', 'pos', 'qr',
    'gpay', 'phonepe', 'paytm', 'net banking', 'cheque', 'settled', 'direct'
  ].includes(pm);
}

/**
 * Generate balanced double-entry lines for a sales invoice
 */
export function generateInvoiceJournal(
  merchantId: string,
  invoice: {
    id: string;
    invoiceNo: string;
    invoiceDate: number;
    customerName: string;
    paymentMode: string;
    taxableValue: number;
    cgst: number;
    sgst: number;
    igst: number;
    roundOff: number;
    grandTotal: number;
  }
): { entry: OfflineJournalEntry; lines: OfflineJournalLine[] } {
  const entryId = `je_${invoice.id}`;
  const now = invoice.invoiceDate || Date.now();
  const entryDate = new Date(now).toISOString().split('T')[0];

  const entry: OfflineJournalEntry = {
    id: entryId,
    merchantId,
    entry_date: entryDate,
    narration: `Sales Invoice #${invoice.invoiceNo} (${invoice.customerName || 'Customer'})`,
    source_type: 'invoice',
    source_id: invoice.id,
    is_reversed: false,
    syncStatus: 'pending_sync',
    createdAt: now
  };

  const lines: OfflineJournalLine[] = [];
  const pmode = invoice.paymentMode || 'Cash';
  const pm = String(pmode).trim().toLowerCase();

  let targetCode = '1010';
  if (['credit', 'pay later', 'unpaid', 'udhaar', 'pending', 'other / credit', 'other/credit'].includes(pm)) {
    targetCode = '1020'; // Accounts Receivable (Sundry Debtors)
  } else if (['cash'].includes(pm)) {
    targetCode = '1010'; // Cash in Hand
  } else if (['upi', 'online', 'gpay', 'phonepe', 'paytm', 'qr'].includes(pm)) {
    targetCode = '1011'; // Bank & UPI Account
  } else if (['card', 'debit / credit card', 'debit card', 'credit card', 'pos'].includes(pm)) {
    targetCode = '1012'; // Cards & POS Settlements
  } else if (['cheque', 'net banking', 'bank transfer', 'netbanking'].includes(pm)) {
    targetCode = '1013'; // Cheques & Bank Clearance
  } else {
    targetCode = '1010';
  }

  // 1. Debit Asset: Cash (1010), UPI (1011), Card (1012), Cheque (1013), or Receivables (1020)
  lines.push({
    id: `jl_${invoice.id}_dr`,
    journal_entry_id: entryId,
    merchantId,
    account_id: `acc_${targetCode}`,
    account_code: targetCode,
    debit: roundCur(invoice.grandTotal),
    credit: 0,
    party_type: 'customer',
    party_ref: invoice.customerName || 'Customer',
    createdAt: now
  });

  // 2. Credit Income: Sales Revenue (4010)
  lines.push({
    id: `jl_${invoice.id}_cr_sales`,
    journal_entry_id: entryId,
    merchantId,
    account_id: 'acc_4010',
    account_code: '4010',
    debit: 0,
    credit: roundCur(invoice.taxableValue),
    party_type: 'income',
    party_ref: '',
    createdAt: now
  });

  // 3. Credit Liability: Output CGST (2041)
  if (invoice.cgst > 0) {
    lines.push({
      id: `jl_${invoice.id}_cr_cgst`,
      journal_entry_id: entryId,
      merchantId,
      account_id: 'acc_2041',
      account_code: '2041',
      debit: 0,
      credit: roundCur(invoice.cgst),
      party_type: 'tax',
      party_ref: 'Output CGST',
      createdAt: now
    });
  }

  // 4. Credit Liability: Output SGST (2042)
  if (invoice.sgst > 0) {
    lines.push({
      id: `jl_${invoice.id}_cr_sgst`,
      journal_entry_id: entryId,
      merchantId,
      account_id: 'acc_2042',
      account_code: '2042',
      debit: 0,
      credit: roundCur(invoice.sgst),
      party_type: 'tax',
      party_ref: 'Output SGST',
      createdAt: now
    });
  }

  // 5. Credit Liability: Output IGST (2043)
  if (invoice.igst > 0) {
    lines.push({
      id: `jl_${invoice.id}_cr_igst`,
      journal_entry_id: entryId,
      merchantId,
      account_id: 'acc_2043',
      account_code: '2043',
      debit: 0,
      credit: roundCur(invoice.igst),
      party_type: 'tax',
      party_ref: 'Output IGST',
      createdAt: now
    });
  }

  // 6. Round-off Difference (5020)
  if (invoice.roundOff !== 0) {
    const isRoundExpense = invoice.roundOff < 0;
    lines.push({
      id: `jl_${invoice.id}_round`,
      journal_entry_id: entryId,
      merchantId,
      account_id: 'acc_5020',
      account_code: '5020',
      debit: isRoundExpense ? roundCur(Math.abs(invoice.roundOff)) : 0,
      credit: isRoundExpense ? 0 : roundCur(invoice.roundOff),
      party_type: 'round_off',
      party_ref: '',
      createdAt: now
    });
  }

  // Double-Entry Verification
  const val = validateJournalLines(lines);
  if (!val.isBalanced) {
    console.warn('[OfflineAccounting] Auto-balancing fractional round-off discrepancy:', val.error);
    // Align cent fractional differences onto sales credit
    const diff = roundCur(val.totalDebit - val.totalCredit);
    const salesLine = lines.find((l) => l.account_code === '4010');
    if (salesLine) {
      salesLine.credit = roundCur(salesLine.credit + diff);
    }
  }

  return { entry, lines };
}
