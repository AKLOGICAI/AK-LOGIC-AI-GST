# AK-LOGIC AI — Complete Product & Technical Documentation

> Version 1.0 · Master reference for new developers, AI tools, and investors.
> Format: Hinglish + English. Last updated on current build.

---

## 1. APP OVERVIEW

**App Name:** AK-LOGIC AI

**Purpose:**
AK-LOGIC AI ek **GST Invoicing Platform** hai jahan chhote merchants (dukaandaar,
service providers) apne customers ke liye **GST-compliant tax invoices** generate
kar sakte hain — bina kisi accountant ke. Customer sirf ek QR code scan karta hai,
apni detail bharta hai, aur merchant ek tap me invoice approve karke PDF generate
kar deta hai.

**Core idea:** "Scan → Request → Approve → GST Invoice PDF" — pura flow seconds me.

### Technology Stack
| Layer | Technology |
|-------|-----------|
| Frontend Framework | React 19 + TypeScript |
| Build Tool | Vite |
| Styling | Tailwind CSS v4 (custom design tokens, glassmorphism, 3D depth) |
| Routing | react-router-dom |
| Animation | framer-motion |
| Icons | lucide-react |
| State / Data | Custom reactive store (`useSyncExternalStore`) over a typed `Table` abstraction |
| Persistence (current) | Encrypted browser `localStorage` (AES at rest) |
| GST Engine | Pure TypeScript module (`gstEngine.ts`) |
| PDF | HTML-template → browser print-to-PDF (`invoicePdf.ts`) |
| QR | In-app deterministic QR renderer |
| Planned Backend | FastAPI + PostgreSQL (schema already mirrored in code) |

### Roles (3)
1. **Customer** — public, no login, no app install. Sirf QR scan karta hai.
2. **Merchant** — registers, gets a dashboard, approves requests, generates invoices.
3. **Super Admin** — completely separate portal, manages the whole platform.

### Client-side ya Backend?
- **Abhi:** Fully **client-side** (frontend-only). Saara data browser ke encrypted
  localStorage me rehta hai. Isse demo, pilot, aur single-device use turant chalu
  ho jaata hai — koi server setup nahi.
- **Architecture-ready for backend:** Domain models (`types.ts`) aur service layer
  (`services.ts`) ko is tarah likha gaya hai ki PostgreSQL tables ke saath 1:1 map
  ho. FastAPI + Postgres connect karna future me straightforward hai — sirf data
  layer swap karna padega, UI same rahega.

---

## 2. ADMIN PANEL (Super Admin)

Admin portal **merchant portal se bilkul alag** hai — alag URL (`/admin`), alag
login, alag session storage (dono realms kabhi ek-doosre ka auth overwrite nahi
karte).

### Admin Login kaise karta hai
- URL: `/admin/login`
- Sirf **password** se login (single super-admin realm).
- Login success hone par ek separate admin session ban-ti hai.
- Galat password par access deny.

### Admin kya dekh sakta hai / kya kar sakta hai (Saare Features)

**Command**
- **Master Dashboard** — poore platform ka overview: total merchants, revenue,
  invoices, credits, active subscriptions, alerts.
- **Merchant Management** — saare merchants ki list; suspend / disable / reactivate;
  KYC status; plan & credit dekho.
- **Merchant Monitoring** — login activity, device & IP monitoring per merchant.

**Billing**
- **PDF Credit Control** — kisi bhi merchant ko credits add/adjust karo, usage dekho.
- **Subscriptions** — sab merchants ke active plans, validity, expiry, carry-forward
  status, branding-enabled status.
- **Recharge Control** — recharge history aur manual recharge management.
- **Revenue** — platform revenue analytics (plan-wise, time-wise).

**Risk & Audit**
- **Fraud Detection** — automated risk signals (high-value B2C, suspicious patterns).
- **Duplicate GST** — same GSTIN multiple merchants par flag.
- **Invoice Audit** — har generated invoice ka audit trail.
- **Security Logs** — har sensitive admin action ka immutable log (who/what/why).

**Engage**
- **Analytics** — GST slab distribution, top products, inter/intra-state split.
- **Notifications / Broadcast** — saare merchants ko ek saath message bhejo.
- **Support Tickets** — merchant tickets dekho, reply karo, resolve karo.

**Platform**
- **Logo Management** — platform ka default invoice logo (jo free/short-term
  merchants ke invoice par lagta hai) upload/manage karo.
- **System Settings** — global toggles & configuration.

---

## 3. MERCHANT PANEL

### 3.1 Registration Flow (step by step)
Register page (`/register`) ek 5-step wizard hai:

1. **Verify** — Mobile number + OTP verification.
2. **MPIN** — 4-digit MPIN set karo (login ke liye). MPIN **SHA-256 hashed** store
   hota hai, kabhi plain-text me nahi.
3. **Business** — Shop/Display name, Owner name, GSTIN, PAN, Address, State, etc.
4. **Bank** — Bank name, account type, account number, IFSC, optional UPI ID.
   (Account number, IFSC, UPI **AES-encrypted** store hote hain.)
5. **Signature** — In-app signature pad par sign karo (transparent background),
   jo har invoice par "Authorised Signatory" ke roop me print hota hai.

Registration complete hone par merchant ko ek **unique QR ID** + QR code milta hai.

### 3.2 Login
- URL: `/login`
- **Mobile number + 4-digit MPIN**.

### 3.3 Dashboard me kya-kya option hai (Navigation)

**Workspace**
- **Overview** — revenue, pending requests, credits, days remaining, recent activity,
  live QR, quick actions.
- **Pending Requests** — customer se aaye billing requests review/approve/reject.
- **Invoices** — saari generated invoices, download/re-share.
- **My QR Code** — apna QR dekho, download/print/share.

**Insights**
- **Reports** — GST summary, rate breakdown, CSV export.
- **GST Returns** — GSTR-1 style summary center.
- **Analytics** — monthly revenue, top products, top customers, repeat rate.

**Manage**
- **Address Book** — saved customers (approval par auto-save).
- **Notifications** — live request/approval/recharge alerts.
- **Recharge** — plans, PDF credits, validity, carry-forward, ₹50 add-on.

**Account**
- **Profile** — business + plan + credit summary, transactions.
- **Settings** — business/GST/bank/signature/**custom branding** manage.
- **Support** — tickets raise karo, FAQ dekho.

### 3.4 Invoice kaise banate hain (CRITICAL RULE)
**Merchant kabhi bhi manually invoice nahi bana sakta.** Sirf ek hi valid path hai:

```
Customer QR Scan → Customer submits request → Merchant reviews
→ Merchant approves → System auto-generates GST PDF → Customer downloads
```

Approve karte waqt merchant customer details, items, HSN code, aur GST % edit kar
sakta hai. Approve par:
- GST automatically calculate hota hai (CGST/SGST ya IGST).
- Invoice number FY format me auto-generate hota hai.
- **1 PDF credit deduct** hota hai.
- Invoice immutable record ban-ke Invoice History me store hota hai.

### 3.5 QR code kaise kaam karta hai
- Har merchant ka ek **unique QR ID** hota hai (e.g. `AK-SHARMA-9X2K`).
- QR/My-QR page se merchant QR download/print/share kar sakta hai.
- Customer QR scan karta hai → `/pay/:qrId` public page khulta hai, jisme merchant
  auto-detect ho jaata hai. Suspended merchant ka QR block ho jaata hai.

### 3.6 Settings me kya change kar sakte hain
- **Shop & GST:** trade name, legal name, display name, owner, business type, GSTIN,
  PAN, state, city, pincode, address.
- **Bank Details:** bank name, account type, account number, IFSC, UPI (encrypted).
- **Digital Signature:** in-app signature pad (re-sign anytime).
- **Custom Invoice Branding:** brand name + business logo (Premium only — niche dekho).

### 3.7 Free vs Premium features ka difference
Branding ka deciding factor **plan ki validity duration** hai, price nahi.

| | Short-term (validity < 30 days) | Premium / Monthly (validity ≥ 30 days) |
|---|---|---|
| Examples | Free, ₹20 Trial (1d), ₹50 Starter (3d) | ₹199 / ₹299 / ₹399 / ₹900 Monthly |
| Invoice Branding | **AK-LOGIC AI logo & name** (forced) | **Merchant ka apna logo & brand name** |
| Custom Logo Upload | ❌ Locked | ✅ Unlocked |
| Custom Brand Name | ❌ Locked | ✅ Unlocked |
| PDF Invoices | ✅ (credit-based) | ✅ (credit-based) |

> Short-term plan par merchant ko clearly dikhta hai:
> "AK-LOGIC AI branding will appear on generated invoices. Upgrade to a monthly plan
> to unlock your own business logo and branding."

### 3.8 Bank details, Signature, Logo — kaise manage hota hai
- **Bank details:** Settings → Bank Details. Sensitive fields AES-encrypted.
- **Signature:** Settings → Digital Signature pad; auto-saved; har invoice par print.
- **Logo (Premium):** Settings → Custom Invoice Branding → upload logo + set brand
  name; live invoice-header preview milta hai. Free users ko upgrade prompt dikhta hai.

---

## 4. CUSTOMER FLOW

Customer ko **na register karna padta hai, na login, na app install** — pura flow
ek public web page par chalta hai.

1. **QR Scan** — Customer merchant ka QR scan karta hai → `/pay/:qrId` khulta hai;
   merchant auto-detect ho jaata hai.
2. **Form bharta hai** (mobile-friendly):
   - **Required:** Full Name, Address, State (place of supply), Payment Mode, Item
     Name, Quantity, Amount, HSN Code, GST Rate.
   - **Optional:** Mobile, Email, GSTIN, PAN, UTR/Transaction ID, Notes.
3. **Submit** — ek **Billing Request** ban-ke sahi merchant se link ho jaata hai;
   merchant ko live notification jaata hai; request "Pending Requests" me aata hai.
4. **Track** — Submit ke baad customer ko ek **status-tracking page** (`/track/:id`)
   milta hai (bookmarkable, no login):
   - **Pending** → "Awaiting Approval".
   - **Rejected** → reason ke saath.
   - **Approved** → **"✅ Your GST Invoice is Ready"** with **Download PDF** &
     **Share PDF** buttons.
5. **Payment details** — customer apne submitted payment mode + UTR/ref aur full
   GST breakdown (taxable, CGST/SGST/IGST, total) tracking page par dekh sakta hai.

---

## 5. KEY FEATURES LIST

- **GST Invoice Generation** — automatic CGST/SGST (intra-state) vs IGST
  (inter-state) via place-of-supply logic; round-off; amount-in-words; FY-format
  invoice numbers; HSN-wise tax summary.
- **Digital Signature** — in-app transparent signature pad, printed on every invoice.
- **QR Code System** — unique per-merchant QR; public customer entry point.
- **"Original for Buyer" watermark** + professional invoice layout.
- **OTP Verification** — mobile OTP at registration.
- **MPIN Auth** — 4-digit MPIN, SHA-256 hashed (never stored plain).
- **Encryption / Security** — AES-at-rest for sensitive fields (bank account, IFSC,
  UPI, mobile); isolated merchant/admin sessions; admin audit logs; login/device
  monitoring.
- **Premium / Free Plan System** — validity-based PDF credit plans + branding policy.
- **Credit Carry-Forward** — timely renewal par unused credits add ho jaate hain.
- **₹50 Validity Extension Add-on** — +30 days validity, no new credits.
- **Custom Invoice Branding** — Premium merchants ka apna logo + brand name invoice par.
- **Address Book** — auto-saved customers.
- **Reports & GST Returns** — GSTR-1 style summaries + CSV export.
- **Analytics** — revenue trends, top products/customers.
- **Notifications / Broadcast** — live alerts + admin broadcasts.
- **Help Center / Support Tickets** — merchant raises, admin resolves; FAQs.
- **Admin Fraud & Duplicate-GST detection**, invoice audit, system health monitoring.
- **Multi-language UI** (i18n: English + Hindi).

---

## 6. PLAN & CREDIT SYSTEM (Reference)

| Plan | Validity | PDF Credits | Branding |
|------|----------|-------------|----------|
| Free | — | 0 | AK-LOGIC AI |
| ₹20 Trial | 1 Day | 10 | AK-LOGIC AI |
| ₹50 Starter | 3 Days | 30 | AK-LOGIC AI |
| ₹199 Monthly | 30 Days | 300 | **Custom** |
| ₹299 Monthly | 30 Days | 600 | **Custom** |
| ₹399 Monthly | 30 Days | 1000 | **Custom** |
| ₹900 Monthly | 30 Days | 2500 | **Custom** |
| ₹50 Validity Add-on | +30 Days | 0 (preserves existing) | — |

- **Carry-forward:** Expiry se pehle (preferably last 3 days) renew karne par unused
  credits new plan me add ho jaate hain (e.g. 100 + 300 = 400).
- **Trial reuse:** ₹20 trial expire hone ke baad dobara liya jaa sakta hai (har baar
  10 credits + 1 day).
- **Branding rule:** validity < 30 days → AK-LOGIC AI; validity ≥ 30 days → custom.

---

## 7. KNOWN LIMITATIONS

1. **Backend abhi connected nahi** — data browser ke localStorage me hai, isliye
   data device/browser ke saath bandha hai (cross-device sync nahi). FastAPI +
   PostgreSQL integration architecture-ready hai par live nahi.
2. **OTP simulated hai** — real SMS gateway (e.g. MSG91/Twilio) connect nahi; demo
   OTP flow hai.
3. **Payments simulated hain** — recharge/plan purchase me real payment gateway
   (Razorpay/UPI) integration abhi placeholder hai; actual paisa nahi katta.
4. **PDF = browser print** — invoice HTML template ko browser ke "Save as PDF" se
   generate kiya jaata hai; server-side PDF rendering (WeasyPrint) future me.
5. **QR is render-only** — visually scannable style QR; ek real QR-encode library
   se replace karna production me behtar hoga.
6. **Encryption is client-side** — AES-at-rest browser-level hai (true server-side
   KMS nahi); real security backend ke saath aati hai.
7. **Single super-admin** — abhi ek hi admin realm (role-based multi-admin nahi).
8. **GST validation light hai** — GSTIN/HSN format checks basic hain; full
   government GSTN verification integrated nahi.
9. **No email/SMS delivery** — invoice share link/clipboard se hota hai; automated
   email/WhatsApp delivery future scope.

---

## 8. APP MAP (Routes)

| Route | Who | Purpose |
|-------|-----|---------|
| `/` | Public | Landing page |
| `/register` | Public | Merchant registration wizard |
| `/login` | Public | Merchant login (mobile + MPIN) |
| `/dashboard/*` | Merchant | Merchant portal (12 sections) |
| `/pay/:qrId` | Customer | QR-linked billing request form |
| `/scan` | Customer | Manual QR-ID entry |
| `/track/:requestId` | Customer | Invoice status + download/share |
| `/admin/login` | Admin | Admin login |
| `/admin/*` | Admin | Super-admin console (17 sections) |
| `/privacy`, `/terms`, `/contact` | Public | Legal & contact |

---

*End of document.*
