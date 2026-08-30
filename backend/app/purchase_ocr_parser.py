"""Purchase Invoice OCR & PDF/Image Parser.
Extracts Supplier Details, Bill Number, Date, Line Items, HSN, Tax Rates, and ITC.
Uses existing working `ocr_service` (Google Cloud Vision API key) with resilient regex extraction.
STRICT AUDIT RULE: Never return or save fake/sample invoice data when OCR fails.
"""
import re
import io
import base64
import logging
import secrets
from typing import Dict, Any, List

from . import ocr_service

logger = logging.getLogger("purchase_ocr")

_GSTIN_RE = re.compile(r'\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b')
_DATE_RE = re.compile(
    r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[\s\-\/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-\/]\d{2,4})\b',
    re.IGNORECASE
)
_INV_NO_RE = re.compile(
    r'(?:invoice|inv|bill|ref)[\s._\-:]*(?:no|num|number|code)?[\s._#:]*([A-Z0-9/\-_]{3,25})',
    re.IGNORECASE
)
_HSN_RE = re.compile(r'\b(\d{4,8})\b')
_UNITS_RE = re.compile(r'\b(pcs|kg|g|ltr|ltrs|ml|box|boxes|set|sets|meter|m|pkt|pkts|unit|units|pair|pairs)\b', re.IGNORECASE)


def clean_ocr_gstin(gstin_raw: str) -> str:
    """Corrects common OCR character confusions in GSTIN strings."""
    if not gstin_raw or len(gstin_raw) != 15:
        return gstin_raw
    s = list(gstin_raw.upper())
    # State code (first 2 chars must be digits)
    s[0] = '0' if s[0] == 'O' else s[0]
    s[1] = '0' if s[1] == 'O' else s[1]
    # PAN portion chars 3..7 must be letters
    for idx in range(2, 7):
        if s[idx] == '0': s[idx] = 'O'
        if s[idx] == '1': s[idx] = 'I'
        if s[idx] == '5': s[idx] = 'S'
    # PAN portion chars 8..11 must be digits
    for idx in range(7, 11):
        if s[idx] == 'O': s[idx] = '0'
        if s[idx] == 'I': s[idx] = '1'
        if s[idx] == 'S': s[idx] = '5'
    # 12th char must be letter
    if s[11] == '0': s[11] = 'O'
    # 13th char Z
    s[13] = 'Z'
    return "".join(s)


def parse_ocr_text(text: str) -> Dict[str, Any]:
    """Extracts structured purchase invoice fields from raw OCR text."""
    if not text or len(text.strip()) < 15:
        raise ValueError("Document contains insufficient readable text. Please upload a clear photo or PDF of your purchase bill.")

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    full_text = "\n".join(lines)

    # 1. Supplier GSTIN
    gstin_match = _GSTIN_RE.search(full_text)
    supplier_gstin = clean_ocr_gstin(gstin_match.group(0)) if gstin_match else ""

    # 2. Supplier Name (usually top non-generic line)
    supplier_name = ""
    for line in lines[:8]:
        line_low = line.lower()
        if len(line) > 3 and not any(kw in line_low for kw in ["tax invoice", "bill of supply", "gstin", "invoice no", "date", "original", "duplicate", "page"]):
            supplier_name = line
            break

    # 3. Bill / Invoice Number
    bill_number = ""
    inv_match = _INV_NO_RE.search(full_text)
    if inv_match:
        extracted_no = inv_match.group(1).strip()
        if len(extracted_no) >= 3 and not extracted_no.lower().startswith("oice"):
            bill_number = extracted_no

    if not bill_number:
        # Fallback token matching
        for line in lines[:12]:
            if "inv" in line.lower() or "bill" in line.lower():
                parts = line.split()
                for p in parts:
                    clean_p = p.strip(":#,")
                    if len(clean_p) >= 3 and any(c.isdigit() for c in clean_p) and not _DATE_RE.match(clean_p):
                        bill_number = clean_p
                        break

    # 4. Bill Date
    bill_date = ""
    date_match = _DATE_RE.search(full_text)
    if date_match:
        bill_date = date_match.group(0)

    # 5. Extract Line Items & Amounts
    items: List[Dict[str, Any]] = []
    HEADER_META_KEYWORDS = [
        "tax invoice", "bill of supply", "gstin", "invoice no", "inv no",
        "bill no", "date", "total", "subtotal", "payable", "amount in words",
        "terms & conditions", "bank details", "ifsc", "account no", "page 1"
    ]

    for line in lines:
        line_low = line.lower()
        # Skip invoice header/metadata lines that shouldn't be parsed as product line items
        if any(line_low.startswith(kw) for kw in ["date", "invoice", "gstin", "bill no", "total", "subtotal"]):
            continue

        if any(char.isdigit() for char in line) and len(line) > 5:
            # Check for HSN
            hsn_match = _HSN_RE.search(line)
            hsn = hsn_match.group(0) if hsn_match else "9983"
            
            # Check for unit
            unit_match = _UNITS_RE.search(line)
            unit = unit_match.group(0).lower() if unit_match else "pcs"

            # Find numbers in line
            line_nums = [float(x.replace(",", "")) for x in re.findall(r'\b\d+(?:\.\d{1,2})?\b', line)]
            if len(line_nums) >= 2:
                # Heuristic: line_nums[-1] is total, line_nums[-2] is rate, line_nums[0] is qty
                rate = line_nums[-2] if len(line_nums) >= 2 else line_nums[0]
                raw_qty = line_nums[0] if line_nums[0] <= 5000 else 1.0
                amount = line_nums[-1]

                # Clean item description
                desc = re.sub(r'\b\d+(?:\.\d{1,2})?\b', '', line).strip()
                desc = re.sub(r'[^\w\s]', '', desc).strip()
                if len(desc) < 2:
                    desc = f"Item {len(items)+1}"

                if amount > 0 and amount < 1000000 and not any(kw in desc.lower() for kw in ["gstin", "date", "total"]):
                    items.append({
                        "name": desc,
                        "description": desc,
                        "hsn": hsn,
                        "qty": round(float(raw_qty), 2),
                        "unit": unit,
                        "rate": round(float(rate), 2),
                        "gstRate": 18,
                        "amount": round(float(amount), 2),
                    })

    # Limit maximum extracted items
    if len(items) > 25:
        items = items[:25]

    # Overall Bill Totals
    total_amount = sum(item["amount"] for item in items) if items else 0.0
    
    # Try finding grand total from OCR text
    total_matches = re.findall(r'(?:grand\s+total|net\s+amount|total|payable)[:#\s]*₹?\s*(\d+(?:\.\d{1,2})?)', full_text, re.IGNORECASE)
    if total_matches:
        try:
            total_amount = float(total_matches[-1])
        except ValueError:
            pass

    total_tax = round(total_amount * 0.18 / 1.18, 2) if total_amount > 0 else 0.0
    cgst = round(total_tax / 2, 2)
    sgst = round(total_tax / 2, 2)

    # Calculation Mismatch Warning Check
    item_sum = sum(i["amount"] for i in items)
    calculation_mismatch = abs(item_sum - total_amount) > 2.0 if (items and total_amount > 0) else False

    # Validation check: if no fields extracted, fail cleanly rather than inventing dummy data
    if not items and not supplier_gstin and total_amount == 0 and not bill_number:
        raise ValueError("Could not recognize valid purchase fields (Supplier, Bill No, or Amount) from document.")

    return {
        "supplierName": supplier_name,
        "supplierGstin": supplier_gstin,
        "billNumber": bill_number,
        "billDate": bill_date,
        "totalAmount": round(total_amount, 2),
        "totalTax": round(total_tax, 2),
        "cgst": cgst,
        "sgst": sgst,
        "igst": 0.0,
        "items": items,
        "calculationMismatch": calculation_mismatch,
        "itemSum": round(item_sum, 2),
        "rawText": full_text[:1000]
    }


async def process_file_bytes(file_bytes: bytes, filename: str = "") -> Dict[str, Any]:
    """Processes PDF or Image bytes using `ocr_service` (Google Cloud Vision API key) or internal text extraction.
    NEVER returns fictional or sample fallback invoice data.
    """
    if not file_bytes:
        raise ValueError("Uploaded file is empty.")

    is_pdf = file_bytes.startswith(b'%PDF-') or filename.lower().endswith('.pdf')
    raw_text = ""

    # 1. Image OCR using existing working `ocr_service` (Vision API Key REST)
    if not is_pdf:
        if ocr_service.is_configured():
            try:
                b64_str = base64.b64encode(file_bytes).decode('utf-8')
                raw_text = await ocr_service.extract_text(b64_str)
            except Exception as e:
                logger.warning(f"[PURCHASE OCR] `ocr_service` Vision API failed: {e}")
        
        # Fallback to Google Cloud Vision SDK if ocr_service key isn't set
        if not raw_text:
            try:
                from google.cloud import vision
                client = vision.ImageAnnotatorClient()
                image = vision.Image(content=file_bytes)
                response = client.text_detection(image=image)
                if response.text_annotations:
                    raw_text = response.text_annotations[0].description
            except Exception as e:
                logger.info(f"[PURCHASE OCR] Google Vision SDK unavailable or unconfigured: {e}")

    # 2. PDF Text Stream Extraction
    if is_pdf:
        try:
            # Extract text stream from PDF content
            extracted = re.sub(r'[^\x20-\x7E\n]', ' ', file_bytes.decode('utf-8', errors='ignore'))
            if len(extracted.strip()) > 30:
                raw_text = extracted
        except Exception:
            pass

    # 3. Fail safely if no readable text could be recognized
    if not raw_text or len(raw_text.strip()) < 15:
        if not ocr_service.is_configured():
            raise ValueError("OCR service is not configured (GOOGLE_VISION_API_KEY missing) and no text could be extracted from file.")
        raise ValueError("Could not extract readable text from document. Please ensure the uploaded purchase invoice photo or PDF is clear and legible.")

    # 4. Parse extracted text into structured purchase fields
    return parse_ocr_text(raw_text)
