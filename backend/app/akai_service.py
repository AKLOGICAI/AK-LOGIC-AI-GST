"""
akai_service.py — @akai AI Assistant Identity for AK-LOGIC AI GST Chat & Copilot.

Handles intelligent, context-grounded conversational AI inside Customer <-> Merchant
and Merchant <-> Merchant chat threads and global dashboard copilot without cross-merchant data leakage.
Supports Hindi, Hinglish, and English naturally.
"""

from typing import Any, Dict, List, Optional, Tuple
import time
import re
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from . import akai_tools, feature_flags_repo, rate_limit_repo, chat_repo

logger = logging.getLogger("akai_assistant")


def contains_akai_mention(text_content: str) -> bool:
    """Checks if message contains @akai or @AKAI mention."""
    if not text_content:
        return False
    return bool(re.search(r"@akai\b", text_content, re.IGNORECASE))


def clean_akai_prompt(text_content: str) -> str:
    """Strips @akai from the user's prompt."""
    cleaned = re.sub(r"@akai\b", "", text_content, flags=re.IGNORECASE).strip()
    return cleaned or "Hello @akai"


def parse_invoice_intent_entities(prompt: str) -> Tuple[str, List[Dict[str, Any]], float]:
    """
    Extracts customer name, items, quantities, and rates from natural language prompt.
    Examples:
    - "Rahul ko 2 hammer 500 ke aur 1 drill 1200 ka bill bana do"
    - "Anil ko 5 packet Cement 350 rate ka invoice ready karo"
    - "Amit ka bill banao"
    """
    text_p = prompt.strip()
    customer_name = "Walk-in Customer"
    items: List[Dict[str, Any]] = []
    discount = 0.0

    # 1. Extract Customer Name
    cust_match = re.search(r"^([A-Za-z0-9_\s]+?)(?:\s+(?:ko|ka|ke|ki|for))\b", text_p, re.IGNORECASE)
    if cust_match:
        extracted_cust = cust_match.group(1).strip()
        if extracted_cust.lower() not in ("please", "kripya", "bhai", "sir", "namaste", "create", "make"):
            customer_name = extracted_cust

    # 2. Extract multiple items with qty and rate
    # Match patterns like: "2 hammer 500", "5 packet Cement rate 350", "1 drill 1200"
    item_pattern = re.compile(
        r"(\d+(?:\.\d+)?)\s*(?:packet|pcs|nag|katta|box|unit)?\s+([A-Za-z0-9_\s\-]+?)\s+(?:ke|ka|rate|@|at|pr)?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)",
        re.IGNORECASE
    )
    matches = item_pattern.findall(text_p)
    for m in matches:
        qty_val = float(m[0])
        name_val = m[1].strip()
        rate_val = float(m[2])
        if name_val.lower() not in ("rupaye", "rupees", "rs", "ka", "ke", "bill", "invoice"):
            items.append({"name": name_val, "qty": qty_val, "rate": rate_val})

    # 3. Fallback: if no multi-match, match single item with qty
    if not items:
        single_match = re.search(r"(\d+)\s+([A-Za-z0-9_\s]+?)(?:\s+bill|\s+invoice|\s+ready|$)", text_p, re.IGNORECASE)
        if single_match:
            items.append({"name": single_match.group(2).strip(), "qty": float(single_match.group(1)), "rate": 0})

    # 4. Fallback if only customer was mentioned (e.g. "Rahul ka bill banao")
    if not items:
        items.append({"name": "General Goods", "qty": 1, "rate": 100})

    return customer_name, items, discount


async def handle_akai_copilot_turn(
    db: AsyncSession,
    merchant_id: str,
    raw_prompt: str,
) -> Dict[str, Any]:
    """
    Main intelligence router for @AKAI queries and actions.
    1. Classifies intent.
    2. Calls deterministic backend tool.
    3. Formats response & action cards with confirmation guardrails.
    """
    prompt = clean_akai_prompt(raw_prompt)
    p_lower = prompt.lower()

    # =========================================================================
    # INTENT 1: Invoice / Bill Creation (Action Preparation -> Confirmation)
    # =========================================================================
    if any(w in p_lower for w in ["invoice bana", "bill bana", "invoice ready", "bill ready", "create invoice", "generate bill", "tax invoice"]):
        customer_name, items, discount = parse_invoice_intent_entities(prompt)
        preview_res = await akai_tools.tool_calculate_invoice_preview(
            db=db,
            merchant_id=merchant_id,
            customer_query=customer_name,
            items_raw=items,
            discount_amount=discount,
        )

        if not preview_res.get("ok"):
            return {
                "ok": False,
                "reply": f"Invoice preview calculate nahi ho paya: {preview_res.get('message')}",
            }

        calc = preview_res["preview_card"]
        reply_text = (
            f"Maine **{calc['customer_name']}** ke liye GST Invoice draft prepare kar diya hai:\n\n"
            f"• **Grand Total:** ₹{calc['grand_total']:,.2f} (Taxable: ₹{calc['taxable_value']:,.2f}, Total GST: ₹{calc['total_tax']:,.2f})\n\n"
            f"Kripya niche diye gaye preview ko verify karke **Confirm** karein taaki official invoice create ho sake:"
        )

        return {
            "ok": True,
            "reply": reply_text,
            "action_card": preview_res["preview_card"],
            "confirmation_token": preview_res["confirmation_token"],
            "confirmation_required": True,
        }

    # =========================================================================
    # INTENT 2: Sales & GST Summary / Reports
    # =========================================================================
    if any(w in p_lower for w in ["aaj ki sale", "kitni sale", "total sale", "gst kitna", "today sale", "sales summary", "hisab"]):
        period = "today" if "aaj" in p_lower or "today" in p_lower else "this_month"
        sales_res = await akai_tools.tool_get_sales_summary(db, merchant_id, period=period)
        if sales_res.get("ok"):
            reply = (
                f"📊 **{sales_res['period']} Sales & Tax Summary:**\n\n"
                f"• **Total Sales:** ₹{sales_res['total_sales']:,.2f}\n"
                f"• **Invoices Issued:** {sales_res['invoice_count']}\n"
                f"• **Taxable Value:** ₹{sales_res['taxable_value']:,.2f}\n"
                f"• **CGST:** ₹{sales_res['cgst']:,.2f} | **SGST:** ₹{sales_res['sgst']:,.2f} | **IGST:** ₹{sales_res['igst']:,.2f}\n"
                f"• **Total GST Collected:** ₹{sales_res['total_tax']:,.2f}"
            )
            return {"ok": True, "reply": reply}

    # =========================================================================
    # INTENT 3: Stock / Inventory Status & Pricing
    # =========================================================================
    if any(w in p_lower for w in ["stock", "maal", "saman", "item", "product", "low stock", "rate"]):
        if "low stock" in p_lower or "kam stock" in p_lower:
            inv_summary = await akai_tools.tool_get_inventory_summary(db, merchant_id)
            low_items = inv_summary.get("low_stock_samples", [])
            if low_items:
                items_list = "\n".join([f"• **{it['product_name']}**: {it['stock_quantity']} {it.get('unit', 'units')} (Rate: ₹{it['selling_price']})" for it in low_items])
                reply = f"⚠️ **Low Stock Alert:** {inv_summary['low_stock_count']} items reorder level par hain:\n\n{items_list}"
            else:
                reply = f"✅ Sabhi inventory items me paryapt stock available hai (Total active items: {inv_summary['total_items']})."
            return {"ok": True, "reply": reply}

        # Search specific item
        search_term = re.sub(r"(check|karo|batao|ka|rate|stock|kitna|hai|me|in)", "", prompt, flags=re.IGNORECASE).strip()
        if search_term:
            prod_res = await akai_tools.tool_find_product(db, merchant_id, search_term)
            if prod_res.get("found"):
                items_list = "\n".join([f"• **{p['product_name']}**: Stock: {p['stock_quantity']} {p.get('unit', 'unit')} | Rate: ₹{p['selling_price']} | GST: {p['gst_rate']}%" for p in prod_res.get("products", [])])
                reply = f"📦 **Inventory Results for '{search_term}':**\n\n{items_list}\n\nKya is item ka invoice banana hai?"
                return {"ok": True, "reply": reply}
            return {"ok": True, "reply": prod_res.get("message")}

    # =========================================================================
    # INTENT 4: PDF Credits & Subscription Balance
    # =========================================================================
    if any(w in p_lower for w in ["credit", "balance", "recharge", "plan", "validity"]):
        cred_res = await akai_tools.tool_get_credit_balance(db, merchant_id)
        if cred_res.get("ok"):
            return {"ok": True, "reply": f"💳 **PDF Credits Status:**\n\n• {cred_res['status_text']}\n\nEk approved invoice generate karne par 1 PDF credit consume hota hai."}

    # =========================================================================
    # INTENT 5: Pending Customer Billing Requests
    # =========================================================================
    if any(w in p_lower for w in ["pending", "request", "order", "orders", "baki"]):
        req_res = await akai_tools.tool_get_pending_requests(db, merchant_id)
        if req_res.get("ok"):
            return {"ok": True, "reply": req_res.get("message")}

    # =========================================================================
    # INTENT 6: Tenant-Isolated Customer Search & Verification (CRIT-01 Protected)
    # =========================================================================
    if any(w in p_lower for w in ["customer", "grahak", "phone number", "mobile", "address", "details", "find customer", "search customer"]):
        # Clean search term
        cleaned_term = re.sub(
            r"(customer|grahak|find|search|check|batao|details|ka|ki|ke|phone|number|mobile|address|dikhao|karo|all|global|dusre|merchant)",
            "",
            prompt,
            flags=re.IGNORECASE
        ).strip()
        search_query = cleaned_term or prompt

        cust_res = await akai_tools.tool_find_customer(db, merchant_id, search_query)
        if cust_res.get("found"):
            custs = cust_res.get("customers", [])
            lines = []
            for c in custs:
                p_display = c.get("phoneMasked") or c.get("phone") or "N/A"
                loc = f" ({c.get('state')})" if c.get('state') else ""
                lines.append(f"• **{c.get('name')}**: Phone: `{p_display}`{loc}")
            reply = f"👤 **Aapke store ke Customer Records for '{search_query}':**\n\n" + "\n".join(lines)
            return {"ok": True, "reply": reply}
        else:
            return {"ok": True, "reply": cust_res.get("message", f"Aapke store par '{search_query}' se juda koi customer nahi mila.")}

    # =========================================================================
    # DEFAULT: General Smart Assistance
    # =========================================================================
    return {
        "ok": True,
        "reply": (
            "Namaste! Mai **@AKAI** hoon — aapka Smart Business Operating Copilot.\n\n"
            "Mai aapke liye ye sab kar sakta hoon:\n"
            "• **Invoice Creation**: '@akai Rahul ko 2 cement 350 ka bill bana do'\n"
            "• **Sales & GST Summary**: '@akai Aaj ki sale kitni hui?'\n"
            "• **Stock Check**: '@akai Hammer ka stock check karo'\n"
            "• **PDF Credits**: '@akai Mera credit balance kitna hai?'\n\n"
            "Aap kya karna chahte hain?"
        )
    }


async def process_akai_mention_if_present(
    db: AsyncSession,
    thread_id: str,
    message_content: str,
    sender_type: str,
    sender_id: str,
    manager: Any,
) -> Optional[Dict[str, Any]]:
    """Checks if @akai was mentioned in chat. If yes, processes and broadcasts @akai response."""
    if not contains_akai_mention(message_content):
        return None

    try:
        thread = await chat_repo.get_thread_by_id(db, thread_id)
        if not thread:
            return None

        mid = thread["merchant_id"]

        # Check feature flag
        if not await feature_flags_repo.is_enabled(db, "akai_assistant_enabled", merchant_id=mid):
            return None

        # Rate limit check (15 mentions per minute)
        rate_key = f"akai:{sender_id}"
        allowed = await rate_limit_repo.check_rate_limit(db, rate_key, max_hits=15, window_seconds=60)
        if not allowed:
            return None
        await rate_limit_repo.record_hit(db, rate_key, window_seconds=60)

        # Process Turn
        copilot_res = await handle_akai_copilot_turn(db, mid, message_content)
        reply_text = copilot_res.get("reply", "Namaste! Mai aapki madad ke liye taiyar hoon.")
        action_card = copilot_res.get("action_card")

        msg_metadata = {
            "is_ai": True,
            "bot_name": "@AKAI Business Copilot",
            "prompt": clean_akai_prompt(message_content),
        }
        if action_card:
            msg_metadata["action_card"] = action_card
            msg_metadata["confirmation_token"] = copilot_res.get("confirmation_token")

        # Save AI message into thread
        saved_msg = await chat_repo.send_message(
            db=db,
            thread_id=thread_id,
            sender_type="akai",
            sender_id="akai_ai_assistant",
            content=reply_text,
            msg_type="text",
            metadata=msg_metadata,
        )

        # Broadcast to WebSocket
        await manager.broadcast(thread_id, {"type": "new_message", "message": saved_msg})
        return saved_msg
    except Exception as e:
        logger.warning(f"Error processing @akai AI mention: {e}")
        return None
