import { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, Copy, Check, AlertTriangle, ShieldCheck, ShieldX, ExternalLink } from 'lucide-react';
import { PageHeader } from '../../components/ui';

/**
 * Admin-only viewer for SECURITY-AUDIT-PROMPT.md (re-verified 2026-08-14).
 *
 * This page renders the CONFIRMED findings from the security audit and
 * lets the admin copy the full report or a single finding to the
 * clipboard for pasting into an issue tracker / patch-plan doc.
 *
 * IMPORTANT: this content is deliberately free of secrets, tokens, API
 * keys, and real customer PII — every finding describes a vulnerability
 * CLASS with illustrative pseudocode, not a live credential or a real
 * customer record. Safe to copy/paste/share with developers.
 *
 * No fixes are applied from this page — it is a read-only report viewer,
 * matching the audit brief's "verify and document, don't fix yet" rule.
 */

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

interface Finding {
  id: string;
  title: string;
  severity: Severity;
  location: string;
  proof: string;
  impact: string;
  fix: string;
}

const FINDINGS: Finding[] = [
  {
    id: 'RLS-001',
    title: 'merchant_websites / website_gallery_images: RLS grants unrestricted read+write+delete',
    severity: 'CRITICAL',
    location: 'Supabase RLS policies "allow_all_merchant_websites" / "allow_all_gallery" on public.merchant_websites and public.website_gallery_images',
    proof: 'Live pg_policies query shows cmd=ALL, qual=true, with_check=true on both tables — RLS is enabled but the only policy present grants every operation to any role, including anon using the public VITE_SUPABASE_ANON_KEY shipped in the frontend bundle. Every other core table (merchants, billing_requests, customers, invoices, payment_orders, merchant_network_*) has RLS enabled with ZERO policies (safe default-deny) — these two tables are the only wide-open exception.',
    impact: 'Any internet user who extracts the public anon key can read, insert, modify, or delete ANY merchant\u2019s published website configuration and gallery images, entirely bypassing require_merchant ownership checks in website.py — e.g. defacing a competitor\u2019s storefront or wiping their gallery.',
    fix: 'Drop the "allow_all_*" policies. Either scope them to a JWT-derived merchant identity, or remove PostgREST access to these tables entirely and rely solely on the backend\u2019s already-correct authenticated routes (matching the default-deny posture used everywhere else).',
  },
  {
    id: 'RLS-002',
    title: 'chat_threads / chat_messages: RLS grants unrestricted read to anyone',
    severity: 'HIGH',
    location: 'supabase/migrations/0025_customer_merchant_chat.sql — "Chat Threads/Messages Service Role Read" policies',
    proof: 'Live pg_policies query confirms cmd=SELECT, qual=true on both tables. Despite the "Service Role Read" name, the policy is not restricted to the service_role — it applies to anon as well.',
    impact: 'Full read access to every merchant\u2194customer chat conversation on the platform (including attachment URLs) for anyone holding the public anon key.',
    fix: 'Drop the using(true) SELECT policy. Scope to a JWT-derived identity, or remove PostgREST access and rely solely on chat.py\u2019s existing backend ownership checks.',
  },
  {
    id: 'CUST-001',
    title: 'customer-select exposes full unmasked PII via a guessable sequential ID, no rate limit',
    severity: 'HIGH',
    location: 'backend/app/routers/customer.py \u2192 POST /api/customer/merchant/customer-select (select_customer_unmasked)',
    proof: 'Requires only that the caller be SOME KYC-verified merchant (require_verified_merchant) \u2014 not scoped to an existing relationship with that specific customer. No PIN check. No rate limiting (confirmed absent — only the Tier-2 customer-autofill endpoint has lockout/rate-limit protection). AKC customer codes are generated sequentially (AKC-00000001, AKC-00000002, ...), making them trivially enumerable. The two-step "search then select" UI flow is a frontend convention only \u2014 the backend never verifies step 1 happened before step 2 succeeds.',
    impact: 'Any verified-merchant account (legitimate but potentially malicious, or compromised) can enumerate and exfiltrate the full PII (name, phone, email, GSTIN, billing address, company name) of every customer in the database, not just customers they\u2019ve actually dealt with.',
    fix: 'Add rate limiting to customer-search / customer-select identical to the existing customer-autofill pattern. Require an existing transaction relationship (or the PIN step) before unmasked data is returned \u2014 the masked search step must be an enforced gate, not just a UI convention.',
  },
  {
    id: 'CREDIT-001',
    title: 'refund-credit allows unlimited self-serve PDF credit generation',
    severity: 'HIGH',
    location: 'backend/app/routers/merchant.py \u2192 POST /api/merchant/refund-credit; backend/app/merchant_repo.py \u2192 refund_credit',
    proof: 'refund_credit runs an unconditional UPDATE merchants SET "pdfCredits" = "pdfCredits" + :count WHERE id = :id. No ledger check, no matching-consume verification, no idempotency key \u2014 despite the route\u2019s own docstring claiming it\u2019s only ever called by an already-verified failed-invoice flow. The backend does not enforce that claim. count is capped at 100 per call, but nothing stops calling the endpoint an unlimited number of times.',
    impact: 'Any authenticated merchant can call this endpoint repeatedly with their own valid JWT to self-generate unlimited free PDF invoice credits, bypassing the entire paid-plan revenue model.',
    fix: 'Require refund_credit to reference a specific prior consume_credit transaction id (ledger-based) and mark it consumed/non-reusable, instead of accepting an arbitrary count with no backing record.',
  },
  {
    id: 'B2B-001',
    title: 'Order confirmation replay inflates trust-score without bound',
    severity: 'HIGH',
    location: 'backend/app/routers/merchant_network.py \u2192 confirm_order; backend/app/merchant_network_repo.py \u2192 increment_successful_transactions',
    proof: 'The "if final_status == \'confirmed\':" branch fires whenever both confirmation timestamps are present AFTER the call \u2014 including when the order was ALREADY confirmed from a previous call. There is no check that this specific call is the transition that just completed it. increment_successful_transactions has no idempotency guard.',
    impact: 'Either party to a real, one-time B2B trade can call /orders/{id}/confirm repeatedly after the deal is already done, each call incrementing BOTH their own and their counterparty\u2019s trust-score metric with no new real transaction \u2014 undermining the B2B trust system entirely.',
    fix: 'Guard the increment block with "and order[\'status\'] != \'confirmed\'" (only fire on the actual open\u2192confirmed transition), or make the increment idempotent per order_id via a confirmed_trust_applied flag.',
  },
  {
    id: 'B2B-002',
    title: 'Duplicate reviews from the same reviewer on the same order',
    severity: 'MEDIUM',
    location: 'backend/app/routers/merchant_network.py \u2192 rate_order_endpoint; backend/app/merchant_network_repo.py \u2192 create_review',
    proof: 'Only checks the caller is a party to the order \u2014 no check of order status, and no check of whether this reviewer already rated this order. No UNIQUE(order_id, reviewer_merchant_id) constraint. Trust score is an average over all review rows.',
    impact: 'A merchant can call /orders/{id}/rate an unlimited number of times on the same order to inflate a colluding partner\u2019s rating, or spam low ratings to sabotage a partner\u2019s reputation \u2014 disproportionate to actual trade count.',
    fix: 'Add a unique constraint (or app-level check) on (order_id, reviewer_merchant_id); reject a second rating attempt on the same order from the same reviewer.',
  },
  {
    id: 'B2B-003',
    title: 'accept_response has a TOCTOU race producing duplicate orders for one request',
    severity: 'MEDIUM',
    location: 'backend/app/routers/merchant_network.py \u2192 accept_response',
    proof: 'Classic check-then-act: reads request status, then later updates \u2014 with no SELECT ... FOR UPDATE row lock and no atomic conditional UPDATE (the pattern this codebase correctly uses elsewhere, e.g. merchant_repo.try_use_free_invoice). Two near-simultaneous accept calls for two different responders can both pass the status check before either UPDATE commits.',
    impact: 'Two orders could be created referencing the same B2B request, with only one buyer/seller pairing intended \u2014 a confused/duplicated trade state.',
    fix: 'Wrap the read-check-write in a transaction with SELECT ... FOR UPDATE, or use an atomic conditional UPDATE ... WHERE status IN (...) RETURNING * and only proceed if a row was actually returned.',
  },
  {
    id: 'PAY-001',
    title: 'Razorpay webhook signature check fails open if the secret is unset',
    severity: 'MEDIUM',
    location: 'backend/app/main.py \u2192 razorpay_webhook',
    proof: 'The HMAC signature check only runs "if settings.razorpay_webhook_secret:" \u2014 if the env var is ever unset, verification is skipped entirely rather than rejecting the request. (Same root cause as the previously-documented BUG-025; still unresolved in current main.)',
    impact: 'If the webhook secret is ever unset (misconfiguration, env rotation mistake, new environment), a forged webhook claiming payment.captured against an existing unpaid order would be accepted as genuine.',
    fix: 'Fail closed: if the secret is empty, reject the webhook with a 500 instead of skipping verification.',
  },
  {
    id: 'JWT-001',
    title: 'Admin JWTs share the merchant 30-day TTL; no revocation mechanism',
    severity: 'MEDIUM',
    location: 'backend/app/config.py (access_token_ttl_min = 30 days, shared by every realm); backend/app/security.py \u2192 create_token / require_admin',
    proof: 'create_token uses a single global TTL for merchant, admin, and customer tokens alike \u2014 no shorter admin-specific expiry. Unlike require_merchant (which re-validates the token\u2019s embedded mpin_hash against the merchant\u2019s CURRENT mpin, so changing MPIN invalidates old sessions), require_admin performs no equivalent revalidation, so changing the admin password does not invalidate already-issued admin JWTs. The frontend\u2019s own 24-hour session assumption is a client-side-only convention that doesn\u2019t match the actual 30-day server-side token validity.',
    impact: 'A leaked admin JWT remains fully valid against the API for up to 30 days regardless of a subsequent password change, and regardless of the frontend\u2019s 24-hour assumption.',
    fix: 'Issue admin tokens with a materially shorter TTL, and/or add a revocation mechanism (token_version / sessions_invalidated_at checked on every admin request).',
  },
  {
    id: 'RATE-001',
    title: 'Public website-store endpoints have no rate limiting',
    severity: 'LOW',
    location: 'backend/app/routers/website.py \u2192 GET /public/store/{slug}, GET /public/store/{slug}/products, POST /public/store/{slug}/order',
    proof: 'Unlike billing.py and merchant.py, website.py never imports or calls rate_limit_repo. (Previously documented as BUG-011; still unresolved.)',
    impact: 'Unauthenticated scraping/flooding of merchant storefronts and product catalogs, or spam order submissions.',
    fix: 'Add the same per-IP rate_limit_repo window check already used elsewhere in the codebase.',
  },
];

const FALSE_POSITIVES_SUMMARY =
  'A (OTP verification), H/I (reset token replay \u2014 no privilege beyond a single legitimate use), ' +
  'J (invoice number sequence burning \u2014 no security consequence), M (broad CORS \u2014 mitigated by allow_credentials=False), ' +
  'N (30-day merchant JWT \u2014 mitigated by mpin_hash self-revocation on MPIN change), ' +
  'P (signature/seal base64 in DB \u2014 gated by default-deny RLS + backend auth), ' +
  'S/T/U/V (merchant/inventory/B2B/chat app-layer IDOR \u2014 ownership checks consistently enforced), ' +
  'W (admin privilege escalation \u2014 no backdoor found, dev-OTP bypass is fail-safe by default). ' +
  'G, Q, R marked NOT CONFIRMED \u2014 insufficient evidence within safe-testing scope (no destructive/production testing performed).';

function severityColor(s: Severity) {
  switch (s) {
    case 'CRITICAL': return { text: 'text-[var(--color-rose)]', bg: 'bg-[rgba(244,63,94,0.14)]', border: 'border-[rgba(244,63,94,0.35)]' };
    case 'HIGH': return { text: 'text-[#ff9f5a]', bg: 'bg-[rgba(255,159,90,0.14)]', border: 'border-[rgba(255,159,90,0.35)]' };
    case 'MEDIUM': return { text: 'text-[#facc15]', bg: 'bg-[rgba(250,204,21,0.14)]', border: 'border-[rgba(250,204,21,0.35)]' };
    case 'LOW': return { text: 'text-[var(--color-mist)]', bg: 'bg-[rgba(255,255,255,0.06)]', border: 'border-[var(--color-line)]' };
  }
}

function findingToText(f: Finding): string {
  return `## [${f.severity}] ${f.id} — ${f.title}

### Location
${f.location}

### Proof
${f.proof}

### Impact
${f.impact}

### Fix
${f.fix}
`;
}

function fullReportText(): string {
  const header = `# AK-LOGIC AI — SECURITY AUDIT (verified 2026-08-14)

Full findings, false positives, and fix order: see SECURITY-AUDIT-PROMPT.md in the repo.
This copy contains only the CONFIRMED findings below (10 total: 1 critical, 4 high, 4 medium, 1 low).

`;
  const body = FINDINGS.map(findingToText).join('\n---\n\n');
  const footer = `\n---\n\n## False Positives / Already Fixed / Not Confirmed\n${FALSE_POSITIVES_SUMMARY}\n`;
  return header + body + footer;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API can fail (permissions/insecure context) — nothing
      // destructive to fall back to here beyond letting the admin
      // select-and-copy the visible text manually.
    }
  };
  return (
    <button
      onClick={onCopy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition border ${
        copied
          ? 'text-[var(--color-emerald)] border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.12)]'
          : 'text-[var(--color-mist)] border-[var(--color-line)] hover:text-[var(--color-ivory)] hover:border-[var(--color-violet)]'
      }`}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? 'Copied ✓' : label}
    </button>
  );
}

export default function AdminSecurityAudit() {
  const critical = FINDINGS.filter((f) => f.severity === 'CRITICAL').length;
  const high = FINDINGS.filter((f) => f.severity === 'HIGH').length;
  const medium = FINDINGS.filter((f) => f.severity === 'MEDIUM').length;
  const low = FINDINGS.filter((f) => f.severity === 'LOW').length;

  return (
    <div>
      <PageHeader title="Security Audit" subtitle="Re-verified findings from SECURITY-AUDIT-PROMPT.md — read-only, no fixes applied from this page." />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="depth-card rounded-2xl px-4 py-3 flex items-center gap-2">
          <ShieldAlert size={16} className="text-[var(--color-rose)]" />
          <span className="text-sm font-semibold">{critical} Critical</span>
        </div>
        <div className="depth-card rounded-2xl px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-[#ff9f5a]" />
          <span className="text-sm font-semibold">{high} High</span>
        </div>
        <div className="depth-card rounded-2xl px-4 py-3 flex items-center gap-2">
          <ShieldX size={16} className="text-[#facc15]" />
          <span className="text-sm font-semibold">{medium} Medium</span>
        </div>
        <div className="depth-card rounded-2xl px-4 py-3 flex items-center gap-2">
          <ShieldCheck size={16} className="text-[var(--color-mist)]" />
          <span className="text-sm font-semibold">{low} Low</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a
            href="https://github.com/anilk359901-hash/AK-LOGIC-AI-GST/blob/main/SECURITY-AUDIT-PROMPT.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-mist)] border border-[var(--color-line)] hover:text-[var(--color-ivory)] hover:border-[var(--color-violet)] transition"
          >
            <ExternalLink size={13} /> Full .md on GitHub
          </a>
          <CopyButton text={fullReportText()} label="Copy Security Report" />
        </div>
      </div>

      <div className="space-y-3">
        {FINDINGS.map((f, i) => {
          const c = severityColor(f.severity);
          return (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="depth-card rounded-2xl p-5"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${c.text} ${c.bg} ${c.border}`}>
                    {f.severity}
                  </span>
                  <span className="text-[11px] font-mono text-[var(--color-mist-2)]">{f.id}</span>
                  <span className="font-semibold text-sm">{f.title}</span>
                </div>
                <CopyButton text={findingToText(f)} label="Copy Finding" />
              </div>

              <div className="mt-3 text-xs text-[var(--color-mist-2)] font-mono break-all">{f.location}</div>

              <div className="mt-3 grid gap-3 sm:grid-cols-1">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-mist-2)] mb-1">Proof</div>
                  <p className="text-sm text-[var(--color-mist)] leading-relaxed">{f.proof}</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-mist-2)] mb-1">Impact</div>
                  <p className="text-sm text-[var(--color-mist)] leading-relaxed">{f.impact}</p>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-mist-2)] mb-1">Recommended Fix</div>
                  <p className="text-sm text-[var(--color-mist)] leading-relaxed">{f.fix}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="depth-card rounded-2xl p-5 mt-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-mist-2)] mb-2">False Positives / Already Fixed / Not Confirmed</div>
        <p className="text-sm text-[var(--color-mist)] leading-relaxed">{FALSE_POSITIVES_SUMMARY}</p>
      </div>
    </div>
  );
}
