"""
accounting_engine.py — Pure, stateless Double-Entry Accounting Engine for AK-LOGIC AI GST.

Designed strictly according to Indian GST Law and Double-Entry Accounting Standards.
Zero database dependencies — 100% unit-testable.
"""

from typing import Any, Dict, List, Optional, Tuple
from decimal import Decimal, ROUND_HALF_UP


def round_cur(val: Any) -> float:
    """Rounds float or Decimal to 2 decimal places reliably."""
    if val is None:
        return 0.0
    try:
        d = Decimal(str(val))
        return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    except Exception:
        return 0.0


# Standard System Chart of Accounts Template
DEFAULT_CHART_OF_ACCOUNTS = [
    # Assets (1000s)
    {"code": "1010", "name": "Cash in Hand", "type": "asset", "is_system": True, "description": "Physical cash collections"},
    {"code": "1011", "name": "Bank & UPI Account", "type": "asset", "is_system": True, "description": "Bank balance, UPI, QR and Online collections"},
    {"code": "1012", "name": "Cards & POS Settlements", "type": "asset", "is_system": True, "description": "Debit and Credit card swiped amounts"},
    {"code": "1013", "name": "Cheques & Bank Clearance", "type": "asset", "is_system": True, "description": "Cheques received and in clearing"},
    {"code": "1020", "name": "Accounts Receivable (Sundry Debtors)", "type": "asset", "is_system": True, "description": "Amounts owed by customers (Pay Later / Udhaar)"},
    {"code": "1030", "name": "Inventory / Stock in Hand", "type": "asset", "is_system": True, "description": "Valuation of goods in inventory"},
    {"code": "1041", "name": "Input CGST", "type": "asset", "is_system": True, "description": "Input Tax Credit - Central GST"},
    {"code": "1042", "name": "Input SGST", "type": "asset", "is_system": True, "description": "Input Tax Credit - State GST"},
    {"code": "1043", "name": "Input IGST", "type": "asset", "is_system": True, "description": "Input Tax Credit - Integrated GST"},

    # Liabilities (2000s)
    {"code": "2010", "name": "Accounts Payable (Sundry Creditors)", "type": "liability", "is_system": True, "description": "Amounts owed to suppliers"},
    {"code": "2041", "name": "Output CGST", "type": "liability", "is_system": True, "description": "Tax liability collected - Central GST"},
    {"code": "2042", "name": "Output SGST", "type": "liability", "is_system": True, "description": "Tax liability collected - State GST"},
    {"code": "2043", "name": "Output IGST", "type": "liability", "is_system": True, "description": "Tax liability collected - Integrated GST"},

    # Equity (3000s)
    {"code": "3010", "name": "Owner Capital / Retained Earnings", "type": "equity", "is_system": True, "description": "Capital invested and accumulated profits"},

    # Income (4000s)
    {"code": "4010", "name": "Sales Revenue (GST Goods & Services)", "type": "income", "is_system": True, "description": "Total revenue from sales invoices"},
    {"code": "4020", "name": "Other Income & Discounts Received", "type": "income", "is_system": True, "description": "Incidental non-operating income"},

    # Expenses (5000s)
    {"code": "5010", "name": "Purchase Account (COGS)", "type": "expense", "is_system": True, "description": "Direct cost of goods and raw materials purchased"},
    {"code": "5020", "name": "Round-Off Difference", "type": "expense", "is_system": True, "description": "Rounding adjustments on bills/invoices"},
]


def validate_journal_lines(lines: List[Dict[str, Any]]) -> Tuple[bool, float, float, str]:
    """
    Verifies that total debits == total credits.
    Returns: (is_balanced, total_debit, total_credit, error_msg)
    """
    if not lines:
        return False, 0.0, 0.0, "Journal entry cannot be empty."

    total_debit = sum(Decimal(str(round_cur(l.get("debit", 0.0)))) for l in lines)
    total_credit = sum(Decimal(str(round_cur(l.get("credit", 0.0)))) for l in lines)

    diff = abs(total_debit - total_credit)
    is_balanced = diff < Decimal("0.01")  # Tolerance for fractional rounding

    err = "" if is_balanced else f"Unbalanced entry: Total Debit ({total_debit}) != Total Credit ({total_credit}). Diff: {diff}"
    return is_balanced, float(total_debit), float(total_credit), err


def is_settled_payment(pmode_raw: Any) -> bool:
    """Checks if a payment mode represents an immediately settled cash/bank transaction."""
    if not pmode_raw:
        return True  # Default to cash/settled if unspecified
    pm = str(pmode_raw).strip().lower()
    return pm in (
        "cash", "upi", "online", "paid", "bank transfer", "card", "pos", "qr",
        "gpay", "phonepe", "paytm", "net banking", "cheque", "settled", "direct"
    )


def generate_purchase_journal_lines(
    purchase: Dict[str, Any],
    account_map: Dict[str, str],
) -> List[Dict[str, Any]]:
    """
    Translates a Purchase Bill into double-entry journal lines.
    
    Standard Double-Entry Posting for GST Purchase:
    Dr. Purchase Account (5010)       -> Taxable Value
    Dr. Input CGST Account (1041)     -> CGST Amount
    Dr. Input SGST Account (1042)     -> SGST Amount
    Dr. Input IGST Account (1043)     -> IGST Amount
        Cr. Cash/Bank (1010) or Accounts Payable (2010) -> Total Bill Amount (Party: Supplier)
    """
    total_amount = round_cur(purchase.get("total_amount") or purchase.get("totalAmount") or 0.0)
    total_tax = round_cur(purchase.get("total_tax") or purchase.get("totalTax") or 0.0)
    cgst = round_cur(purchase.get("cgst") or 0.0)
    sgst = round_cur(purchase.get("sgst") or 0.0)
    igst = round_cur(purchase.get("igst") or 0.0)

    # Taxable value is total amount minus total tax
    taxable_value = round_cur(total_amount - (cgst + sgst + igst))
    if taxable_value < 0:
        taxable_value = round_cur(total_amount - total_tax)

    supplier_name = purchase.get("supplier_name") or purchase.get("supplierName") or "Supplier"
    supplier_gstin = purchase.get("supplier_gstin") or purchase.get("supplierGstin") or ""
    party_ref = f"{supplier_name} ({supplier_gstin})" if supplier_gstin else supplier_name

    pmode = purchase.get("payment_mode") or purchase.get("paymentMode") or "credit"
    is_settled = is_settled_payment(pmode)

    lines: List[Dict[str, Any]] = []

    # 1. Dr. Purchase / COGS
    if taxable_value > 0:
        lines.append({
            "account_id": account_map.get("5010", "5010"),
            "account_code": "5010",
            "account_name": "Purchase Account (COGS)",
            "debit": taxable_value,
            "credit": 0.0,
            "party_type": "supplier",
            "party_ref": party_ref,
        })

    # 2. Dr. Input CGST
    if cgst > 0:
        lines.append({
            "account_id": account_map.get("1041", "1041"),
            "account_code": "1041",
            "account_name": "Input CGST",
            "debit": cgst,
            "credit": 0.0,
            "party_type": "supplier",
            "party_ref": party_ref,
        })

    # 3. Dr. Input SGST
    if sgst > 0:
        lines.append({
            "account_id": account_map.get("1042", "1042"),
            "account_code": "1042",
            "account_name": "Input SGST",
            "debit": sgst,
            "credit": 0.0,
            "party_type": "supplier",
            "party_ref": party_ref,
        })

    # 4. Dr. Input IGST
    if igst > 0:
        lines.append({
            "account_id": account_map.get("1043", "1043"),
            "account_code": "1043",
            "account_name": "Input IGST",
            "debit": igst,
            "credit": 0.0,
            "party_type": "supplier",
            "party_ref": party_ref,
        })

    # 5. Cr. Cash/Bank (1010) if settled, else Cr. Accounts Payable (2010)
    target_code = "1010" if is_settled else "2010"
    target_name = "Cash & Bank" if is_settled else "Accounts Payable (Sundry Creditors)"

    if total_amount > 0:
        # Check if there is a 1-2 paisa rounding difference
        sum_debits = sum(Decimal(str(l["debit"])) for l in lines)
        target_credit = Decimal(str(total_amount))
        diff = target_credit - sum_debits

        if abs(diff) > 0 and abs(diff) <= Decimal("0.05"):
            if lines:
                lines[0]["debit"] = round_cur(Decimal(str(lines[0]["debit"])) + diff)

        lines.append({
            "account_id": account_map.get(target_code, target_code),
            "account_code": target_code,
            "account_name": target_name,
            "debit": 0.0,
            "credit": total_amount,
            "party_type": "supplier",
            "party_ref": party_ref,
        })

    return lines


def generate_invoice_journal_lines(
    invoice: Dict[str, Any],
    account_map: Dict[str, str],
) -> List[Dict[str, Any]]:
    """
    Translates a Sales Invoice into double-entry journal lines.
    
    Standard Double-Entry Posting for GST Sales Invoice:
    Dr. Cash/Bank (1010) or Accounts Receivable (1020) -> Grand Total (Party: Customer)
        Cr. Sales Revenue (4010)     -> Taxable Value
        Cr. Output CGST (2041)       -> CGST Amount
        Cr. Output SGST (2042)       -> SGST Amount
        Cr. Output IGST (2043)       -> IGST Amount
        Cr./Dr. Round-Off (5020)     -> Round-off difference (if any)
    """
    grand_total = round_cur(invoice.get("grandTotal") or invoice.get("grand_total") or 0.0)
    taxable_value = round_cur(invoice.get("taxableValue") or invoice.get("taxable_value") or 0.0)
    cgst = round_cur(invoice.get("cgst") or 0.0)
    sgst = round_cur(invoice.get("sgst") or 0.0)
    igst = round_cur(invoice.get("igst") or 0.0)
    round_off = round_cur(invoice.get("roundOff") or invoice.get("round_off") or 0.0)

    # If taxableValue is 0 or missing, calculate from grandTotal - taxes
    if taxable_value <= 0 and grand_total > 0:
        taxable_value = round_cur(grand_total - (cgst + sgst + igst + round_off))

    cust_name = invoice.get("customerName") or invoice.get("customer_name") or "Customer"
    cust_phone = invoice.get("customerPhone") or invoice.get("customer_phone") or ""
    party_ref = f"{cust_name} ({cust_phone})" if cust_phone else cust_name

    pmode = invoice.get("paymentMode") or invoice.get("payment_mode") or "Cash"
    pm = str(pmode).strip().lower()

    if pm in ("credit", "pay later", "unpaid", "udhaar", "pending", "other / credit", "other/credit"):
        target_code = "1020"
        target_name = "Accounts Receivable (Sundry Debtors)"
    elif pm in ("cash",):
        target_code = "1010"
        target_name = "Cash in Hand"
    elif pm in ("upi", "online", "gpay", "phonepe", "paytm", "qr"):
        target_code = "1011"
        target_name = "Bank & UPI Account"
    elif pm in ("card", "debit / credit card", "debit card", "credit card", "pos"):
        target_code = "1012"
        target_name = "Cards & POS Settlements"
    elif pm in ("cheque", "net banking", "bank transfer", "netbanking"):
        target_code = "1013"
        target_name = "Cheques & Bank Clearance"
    else:
        target_code = "1010"
        target_name = "Cash in Hand"

    lines: List[Dict[str, Any]] = []

    # 1. Dr. Cash/Bank or Accounts Receivable
    if grand_total > 0:
        lines.append({
            "account_id": account_map.get(target_code, target_code),
            "account_code": target_code,
            "account_name": target_name,
            "debit": grand_total,
            "credit": 0.0,
            "party_type": "customer",
            "party_ref": party_ref,
        })

    # 2. Cr. Sales Revenue
    if taxable_value > 0:
        lines.append({
            "account_id": account_map.get("4010", "4010"),
            "account_code": "4010",
            "account_name": "Sales Revenue (GST Goods & Services)",
            "debit": 0.0,
            "credit": taxable_value,
            "party_type": "customer",
            "party_ref": party_ref,
        })

    # 3. Cr. Output CGST
    if cgst > 0:
        lines.append({
            "account_id": account_map.get("2041", "2041"),
            "account_code": "2041",
            "account_name": "Output CGST",
            "debit": 0.0,
            "credit": cgst,
            "party_type": "customer",
            "party_ref": party_ref,
        })

    # 4. Cr. Output SGST
    if sgst > 0:
        lines.append({
            "account_id": account_map.get("2042", "2042"),
            "account_code": "2042",
            "account_name": "Output SGST",
            "debit": 0.0,
            "credit": sgst,
            "party_type": "customer",
            "party_ref": party_ref,
        })

    # 5. Cr. Output IGST
    if igst > 0:
        lines.append({
            "account_id": account_map.get("2043", "2043"),
            "account_code": "2043",
            "account_name": "Output IGST",
            "debit": 0.0,
            "credit": igst,
            "party_type": "customer",
            "party_ref": party_ref,
        })

    # 6. Round-off adjustment if needed
    sum_credits = sum(Decimal(str(l["credit"])) for l in lines)
    sum_debits = sum(Decimal(str(l["debit"])) for l in lines)
    diff = sum_debits - sum_credits

    if abs(diff) > Decimal("0.001"):
        if diff > 0:
            lines.append({
                "account_id": account_map.get("5020", "5020"),
                "account_code": "5020",
                "account_name": "Round-Off Difference",
                "debit": 0.0,
                "credit": float(diff),
                "party_type": "customer",
                "party_ref": party_ref,
            })
        else:
            lines.append({
                "account_id": account_map.get("5020", "5020"),
                "account_code": "5020",
                "account_name": "Round-Off Difference",
                "debit": float(abs(diff)),
                "credit": 0.0,
                "party_type": "customer",
                "party_ref": party_ref,
            })

    return lines


def generate_reversal_lines(
    original_lines: List[Dict[str, Any]],
    reason: str = "Reversal / Credit Note",
) -> List[Dict[str, Any]]:
    """
    Creates equal-and-opposite journal lines to cleanly reverse an entry.
    Accounting-safe: Never hard-deletes journal records.
    """
    reversal_lines = []
    for l in original_lines:
        reversal_lines.append({
            "account_id": l["account_id"],
            "account_code": l.get("account_code", ""),
            "account_name": l.get("account_name", ""),
            "debit": l["credit"],  # Flip credit to debit
            "credit": l["debit"],  # Flip debit to credit
            "party_type": l.get("party_type"),
            "party_ref": f"{l.get('party_ref', '')} (Reversal: {reason})",
        })
    return reversal_lines
