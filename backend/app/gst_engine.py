"""GST computation engine — Python port of src/lib/gstEngine.ts.
Kept identical so frontend previews and backend invoices always match.
"""
from dataclasses import dataclass, field

STATE_CODES = {
    "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "19": "West Bengal", "24": "Gujarat", "27": "Maharashtra", "29": "Karnataka",
    "32": "Kerala", "33": "Tamil Nadu", "36": "Telangana", "37": "Andhra Pradesh",
}
NAME_TO_CODE = {v.lower(): k for k, v in STATE_CODES.items()}


def code_for_state(name: str | None) -> str | None:
    return NAME_TO_CODE.get((name or "").strip().lower())


def _round2(n: float) -> float:
    return round(n + 1e-9, 2)


@dataclass
class Computation:
    taxable_value: float = 0
    cgst: float = 0
    sgst: float = 0
    igst: float = 0
    total_tax: float = 0
    round_off: float = 0
    grand_total: float = 0
    is_inter_state: bool = False
    place_of_supply: str = ""
    amount_in_words: str = ""
    lines: list = field(default_factory=list)


def resolve_supply(seller_state: str, seller_gstin: str, buyer_gstin: str | None, buyer_state: str | None):
    seller_code = (seller_gstin[:2] if seller_gstin else None) or code_for_state(seller_state) or "09"
    buyer_code = None
    if buyer_gstin and len(buyer_gstin) >= 2 and buyer_gstin[:2] in STATE_CODES:
        buyer_code = buyer_gstin[:2]
    elif buyer_state:
        buyer_code = code_for_state(buyer_state)
    is_inter = bool(buyer_code) and buyer_code != seller_code
    pos_code = buyer_code or seller_code
    pos_name = STATE_CODES.get(pos_code, seller_state)
    return is_inter, f"{pos_code} - {pos_name}"


def compute(items: list[dict], is_inter_state: bool, place_of_supply: str) -> Computation:
    c = Computation(is_inter_state=is_inter_state, place_of_supply=place_of_supply)
    for it in items:
        taxable = _round2(it["qty"] * it["rate"])
        tax = _round2(taxable * it["gstRate"] / 100)
        cgst = 0 if is_inter_state else _round2(tax / 2)
        sgst = 0 if is_inter_state else _round2(tax - cgst)
        igst = tax if is_inter_state else 0
        c.taxable_value += taxable
        c.cgst += cgst
        c.sgst += sgst
        c.igst += igst
        c.lines.append({"taxable": taxable, "tax": tax})
    c.taxable_value = _round2(c.taxable_value)
    c.cgst, c.sgst, c.igst = _round2(c.cgst), _round2(c.sgst), _round2(c.igst)
    c.total_tax = _round2(c.cgst + c.sgst + c.igst)
    raw = c.taxable_value + c.total_tax
    c.grand_total = round(raw)
    c.round_off = _round2(c.grand_total - raw)
    c.amount_in_words = number_to_words(c.grand_total)
    return c


def next_invoice_number(prefix: str, existing: list[str]) -> str:
    from datetime import datetime
    now = datetime.now()
    start = now.year if now.month >= 4 else now.year - 1
    fy = f"{start}-{str((start + 1) % 100).zfill(2)}"
    mx = 0
    for n in existing:
        digits = "".join(ch for ch in n.split("/")[-1] if ch.isdigit())
        if digits:
            mx = max(mx, int(digits))
    return f"{prefix.rstrip('/')}/{fy}/{str(mx + 1).zfill(4)}"


_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
         "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return _TENS[n // 10] + ((" " + _ONES[n % 10]) if n % 10 else "")


def number_to_words(num: float) -> str:
    num = round(num)
    if num == 0:
        return "Zero Rupees Only"
    words = ""
    for div, label in ((10000000, "Crore"), (100000, "Lakh"), (1000, "Thousand"), (100, "Hundred")):
        q, num = divmod(num, div)
        if q:
            words += (_two(q) if div != 100 else _ONES[q]) + f" {label} "
    if num:
        words += ("and " if words else "") + _two(num) + " "
    return words.strip() + " Rupees Only"
