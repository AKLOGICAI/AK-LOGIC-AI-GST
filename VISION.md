# AK LOGIC AI — MASTER VISION DOCUMENT

This is a LIVE production project.

- Never redesign the project.
- Never rewrite working modules.
- Never replace existing architecture unless absolutely necessary.
- Always preserve backward compatibility.

The GST Invoice System is already production ready.
Everything new must be built ON TOP OF the existing system.

## LONG TERM VISION

AK LOGIC AI is not just a GST Invoice Software.
Its long-term vision is to become India's AI Powered Merchant Network.
The GST Invoice System is only the foundation.

## CORE PRINCIPLE

The existing GST invoice data is the ONLY source of truth.
Merchants should NEVER manually maintain a product catalogue.
The system must automatically learn from real GST invoices.
Every intelligence inside the platform must evolve from existing invoice
history.

## DATA AVAILABLE

Every invoice already contains:
- Merchant
- Customer
- Product Name
- HSN
- GST Rate
- Quantity
- Invoice Date
- Invoice History

Use only this existing data. Never duplicate unnecessary data.

## LONG TERM ROADMAP

**PHASE 1 — Merchant Intelligence Foundation**
Safely prepare backend structures so future intelligence can be built.
No UI changes. No behaviour changes. No AI. No notifications. No nearby
search.

**PHASE 2 — Merchant Product Intelligence**
Automatically understand: what products a merchant sells, frequently
sold products, rarely sold products, product confidence. Everything must
come from invoice history. No manual catalogue.

**PHASE 3 — Merchant Behaviour Intelligence**
Automatically understand: active merchants, trusted merchants, fast
responding merchants, frequently trading merchants, merchant reliability.
Everything must evolve automatically.

**PHASE 4 — Nearby Merchant Intelligence**
Use merchant location. When a merchant creates a request, search nearby
merchants first. Future expansion: 10km → 25km → 50km → 100km → 250km →
500km → finally nationwide if required.

**PHASE 5 — AI Merchant Matching**
Backend should automatically combine: Product Name, HSN, Invoice History,
Merchant Behaviour, Merchant Trust, Confidence Score, Distance, Previous
Trade History. Then rank merchants automatically.

**PHASE 6 — Smart Notification Engine**
Do NOT spam everyone. Notify only the best matching merchants first. If
nobody responds, increase search radius, repeat. Finally broadcast more
widely if required.

**PHASE 7 — Merchant Relationship Intelligence**
Backend should automatically learn: who buys from whom, frequently
connected merchants, repeat suppliers, preferred suppliers, business
relationships. No manual setup.

**PHASE 8 — Future AI**
Demand prediction, stock prediction, business recommendation, smart
supplier recommendation, auto reorder, price intelligence, regional
demand analysis. Everything must evolve automatically.

## VERY IMPORTANT — GOVERNING RULES FOR EVERY FUTURE TASK

- Every future feature must be built using the existing GST invoice data.
- Do NOT introduce unnecessary manual data entry.
- Do NOT redesign working systems.
- Do NOT break production.
- Always work in very small phases.
- Complete one phase. Stop. Wait for approval. Then continue.
- Never skip phases.
- Think like a Senior Software Architect protecting a LIVE production
  system.

## MERCHANT PRODUCTIVITY FEATURES

Small merchant productivity and UX enhancements (such as utility
tools, workflow shortcuts, calculators, quick actions, etc.) are
considered continuous product improvements and do not constitute a
new roadmap phase. These enhancements should be implemented through
individual tasks in prompt.md while preserving the existing
architecture and business logic.

This vision must remain unchanged unless explicitly approved by the
project owner.
