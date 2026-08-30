import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookOpen, Layers, ShieldCheck, Store, Users, QrCode, FileText, CreditCard,
  AlertTriangle, Map, Crown, Lock, Printer,
} from 'lucide-react';
import Logo from '../components/Logo';

function Section({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      className="depth-card rounded-2xl p-6 sm:p-8 scroll-mt-24"
    >
      <h2 className="font-[var(--font-display)] text-xl font-bold flex items-center gap-3 mb-4">
        <span className="w-10 h-10 rounded-xl grid place-items-center depth-soft text-[var(--color-gold)]">{icon}</span>
        {title}
      </h2>
      <div className="space-y-3 text-[var(--color-mist)] leading-relaxed text-[15px]">{children}</div>
    </motion.section>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="text-left font-semibold text-[var(--color-ivory)] px-3 py-2 border-b border-[var(--color-line)]">{children}</th>; }
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 border-b border-[var(--color-line)]/60 align-top ${className}`}>{children}</td>; }

const NAV = [
  ['overview', 'Overview'],
  ['admin', 'Admin Panel'],
  ['merchant', 'Merchant Panel'],
  ['customer', 'Customer Flow'],
  ['features', 'Key Features'],
  ['plans', 'Plans & Credits'],
  ['limits', 'Known Limits'],
  ['routes', 'App Map'],
];

export default function Docs() {
  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid-bg">
      <div className="pointer-events-none fixed inset-0 opacity-40" style={{ background: 'radial-gradient(900px 500px at 80% -10%, rgba(233,196,106,0.08), transparent)' }} />
      <header className="relative max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <span className="text-xs px-3 py-1.5 rounded-full glass text-[var(--color-mist)]">Product Documentation · v1.0</span>
      </header>

      <div className="relative max-w-6xl mx-auto px-6 pb-20 grid lg:grid-cols-[220px_1fr] gap-8">
        {/* side nav */}
        <aside className="hidden lg:block">
          <div className="sticky top-6 depth-soft rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-mist-2)] px-2 mb-2">Contents</p>
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block px-2.5 py-2 rounded-lg text-sm text-[var(--color-mist)] hover:text-[var(--color-ivory)] hover:bg-white/5 transition">{label}</a>
            ))}
          </div>
        </aside>

        <main className="space-y-6 min-w-0">
          {/* hero */}
          <div className="depth-card rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-20" style={{ background: 'var(--color-gold)' }} />
            <h1 className="font-[var(--font-display)] text-3xl sm:text-4xl font-bold flex items-center gap-3">
              <BookOpen className="text-[var(--color-gold)]" /> AK-LOGIC AI
            </h1>
            <p className="text-[var(--color-mist)] mt-3 max-w-2xl">
              Complete product & technical reference for developers, AI tools, and investors.
              GST Invoicing Platform: <strong className="text-[var(--color-ivory)]">Scan → Request → Approve → GST Invoice PDF</strong>.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['React 19', 'TypeScript', 'Tailwind v4', 'Client-side (backend-ready)', 'GST Engine', 'AES-at-rest'].map((t) => (
                <span key={t} className="text-xs px-3 py-1.5 rounded-full depth-soft text-[var(--color-mist)]">{t}</span>
              ))}
            </div>
          </div>

          <Section id="overview" icon={<Layers size={20} />} title="1. App Overview">
            <p><strong className="text-[var(--color-ivory)]">AK-LOGIC AI</strong> chhote merchants ko bina accountant ke GST-compliant tax invoices banane deta hai. Customer QR scan karta hai, detail bharta hai, aur merchant ek tap me invoice approve karke PDF generate kar deta hai.</p>
            <p><strong className="text-[var(--color-ivory)]">Roles (3):</strong> Customer (public, no login) · Merchant (dashboard) · Super Admin (separate console).</p>
            <p><strong className="text-[var(--color-ivory)]">Client-side ya backend?</strong> Abhi fully client-side hai — data browser ke encrypted localStorage me. Domain models + service layer PostgreSQL tables ke saath 1:1 map karte hain, isliye FastAPI + Postgres future me easily connect ho sakta hai.</p>
          </Section>

          <Section id="admin" icon={<ShieldCheck size={20} />} title="2. Admin Panel (Super Admin)">
            <p>Admin portal merchant portal se <strong className="text-[var(--color-ivory)]">bilkul alag</strong> hai — alag URL (<code className="text-[var(--color-gold)]">/admin</code>), alag password login, alag session.</p>
            <p className="text-[var(--color-ivory)] font-medium">Features:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Command:</strong> Master Dashboard, Merchant Management (suspend/disable/KYC), Merchant Monitoring (login/device/IP).</li>
              <li><strong>Billing:</strong> PDF Credit Control, Subscriptions, Recharge Control, Revenue analytics.</li>
              <li><strong>Risk & Audit:</strong> Fraud Detection, Duplicate-GST flagging, Invoice Audit, Security Logs.</li>
              <li><strong>Engage:</strong> Analytics, Broadcast Notifications, Support Tickets.</li>
              <li><strong>Platform:</strong> Logo Management (default invoice logo), System Settings.</li>
            </ul>
          </Section>

          <Section id="merchant" icon={<Store size={20} />} title="3. Merchant Panel">
            <p className="text-[var(--color-ivory)] font-medium">Registration (5 steps):</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li>Verify — Mobile + OTP.</li>
              <li>MPIN — 4-digit (SHA-256 hashed, never plain).</li>
              <li>Business — shop name, GSTIN, PAN, address, state.</li>
              <li>Bank — account no, IFSC, UPI (AES-encrypted).</li>
              <li>Signature — in-app pad; prints on every invoice.</li>
            </ol>
            <p className="mt-2">Complete hone par <strong className="text-[var(--color-ivory)]">unique QR code</strong> milta hai. Login: mobile + MPIN.</p>

            <p className="text-[var(--color-ivory)] font-medium mt-3">Dashboard sections:</p>
            <p>Overview · Pending Requests · Invoices · My QR · Reports · GST Returns · Analytics · Address Book · Notifications · Recharge · Profile · Settings · Support.</p>

            <div className="rounded-xl p-4 mt-2" style={{ background: 'rgba(255,180,84,0.08)' }}>
              <p className="flex items-center gap-2 text-[var(--color-amber)] font-semibold"><FileText size={16} /> Core Rule</p>
              <p className="text-sm mt-1">Merchant kabhi manually invoice nahi banata. Sirf: <strong>Customer QR Scan → Request → Merchant Approves → Auto GST PDF → 1 credit deduct</strong>. Approve karte waqt customer/items/HSN/GST% edit kar sakta hai.</p>
            </div>

            <p className="text-[var(--color-ivory)] font-medium mt-3 flex items-center gap-2"><Crown size={16} className="text-[var(--color-aqua)]" /> Free vs Premium (validity decides branding):</p>
            <div className="overflow-x-auto rounded-xl depth-soft">
              <table className="w-full text-sm">
                <thead><tr><Th>Feature</Th><Th>Short-term (&lt;30d)</Th><Th>Premium (≥30d)</Th></tr></thead>
                <tbody>
                  <tr><Td>Invoice branding</Td><Td>AK-LOGIC AI (forced)</Td><Td>Merchant's own logo & name</Td></tr>
                  <tr><Td>Custom logo upload</Td><Td>❌ Locked</Td><Td>✅ Unlocked</Td></tr>
                  <tr><Td>Custom brand name</Td><Td>❌ Locked</Td><Td>✅ Unlocked</Td></tr>
                  <tr><Td>PDF invoices</Td><Td>✅ (credits)</Td><Td>✅ (credits)</Td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm"><strong className="text-[var(--color-ivory)]">Settings:</strong> shop/GST, bank (encrypted), signature pad, and Custom Invoice Branding (Premium). Free users ko "Upgrade to Premium to add your own brand name & logo" prompt dikhta hai.</p>
          </Section>

          <Section id="customer" icon={<Users size={20} />} title="4. Customer Flow">
            <p>No register, no login, no install — pura flow public web page par.</p>
            <ol className="list-decimal pl-5 space-y-1">
              <li><QrCode size={14} className="inline mr-1 text-[var(--color-aqua)]" /> QR scan → <code className="text-[var(--color-gold)]">/pay/:qrId</code>, merchant auto-detect.</li>
              <li>Form: <strong>Required</strong> — Name, Address, State, Payment Mode, Item, Qty, Amount, HSN, GST Rate. <strong>Optional</strong> — Mobile, Email, GSTIN, PAN, UTR, Notes.</li>
              <li>Submit → Billing Request banta hai, merchant ko live notification.</li>
              <li>Track page (<code className="text-[var(--color-gold)]">/track/:id</code>, bookmarkable): Pending / Rejected / <strong className="text-[var(--color-ivory)]">"✅ Your GST Invoice is Ready"</strong> with Download & Share PDF.</li>
            </ol>
          </Section>

          <Section id="features" icon={<CreditCard size={20} />} title="5. Key Features">
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ['GST Invoice Generation', 'Auto CGST/SGST vs IGST, round-off, words, FY numbers, HSN summary'],
                ['Digital Signature', 'In-app transparent signature pad on every invoice'],
                ['QR Code System', 'Unique per-merchant public entry point'],
                ['OTP Verification', 'Mobile OTP at registration'],
                ['MPIN Auth', '4-digit, SHA-256 hashed'],
                ['Encryption', 'AES-at-rest for bank/IFSC/UPI/mobile'],
                ['Premium/Free Plans', 'Validity-based credits + branding policy'],
                ['Credit Carry-Forward', 'Unused credits roll over on timely renewal'],
                ['Reports & GST Returns', 'GSTR-1 summaries + CSV export'],
                ['Support Tickets', 'Merchant raises, admin resolves; FAQs'],
                ['Fraud & Audit', 'Risk signals, duplicate GST, audit logs'],
                ['Multi-language UI', 'English + Hindi (i18n)'],
              ].map(([t, d]) => (
                <div key={t} className="depth-soft rounded-xl p-3">
                  <p className="text-[var(--color-ivory)] font-medium text-sm">{t}</p>
                  <p className="text-xs text-[var(--color-mist-2)] mt-0.5">{d}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="plans" icon={<Crown size={20} />} title="6. Plans & Credits">
            <div className="overflow-x-auto rounded-xl depth-soft">
              <table className="w-full text-sm">
                <thead><tr><Th>Plan</Th><Th>Validity</Th><Th>Credits</Th><Th>Branding</Th></tr></thead>
                <tbody>
                  <tr><Td>Free</Td><Td>—</Td><Td>0</Td><Td>AK-LOGIC AI</Td></tr>
                  <tr><Td>₹20 Trial</Td><Td>1 Day</Td><Td>10</Td><Td>AK-LOGIC AI</Td></tr>
                  <tr><Td>₹50 Starter</Td><Td>3 Days</Td><Td>30</Td><Td>AK-LOGIC AI</Td></tr>
                  <tr><Td>₹199 Monthly</Td><Td>30 Days</Td><Td>300</Td><Td className="text-[var(--color-aqua)]">Custom</Td></tr>
                  <tr><Td>₹299 Monthly</Td><Td>30 Days</Td><Td>600</Td><Td className="text-[var(--color-aqua)]">Custom</Td></tr>
                  <tr><Td>₹399 Monthly</Td><Td>30 Days</Td><Td>1000</Td><Td className="text-[var(--color-aqua)]">Custom</Td></tr>
                  <tr><Td>₹900 Monthly</Td><Td>30 Days</Td><Td>2500</Td><Td className="text-[var(--color-aqua)]">Custom</Td></tr>
                  <tr><Td>₹50 Validity Add-on</Td><Td>+30 Days</Td><Td>0 (preserves)</Td><Td>—</Td></tr>
                </tbody>
              </table>
            </div>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong className="text-[var(--color-ivory)]">Carry-forward:</strong> timely renew (last ~3 days) par unused credits add (e.g. 100 + 300 = 400).</li>
              <li><strong className="text-[var(--color-ivory)]">Trial reuse:</strong> ₹20 trial expire ke baad dobara (10 credits + 1 day).</li>
              <li><strong className="text-[var(--color-ivory)]">Branding:</strong> &lt;30d → AK-LOGIC AI; ≥30d → custom.</li>
            </ul>
          </Section>

          <Section id="limits" icon={<AlertTriangle size={20} />} title="7. Known Limitations">
            <ul className="list-disc pl-5 space-y-1.5">
              <li><Lock size={13} className="inline mr-1" /> Backend abhi connected nahi — data localStorage me (cross-device sync nahi). FastAPI + Postgres architecture-ready hai.</li>
              <li>OTP & payments simulated hain (real SMS/Razorpay future).</li>
              <li><Printer size={13} className="inline mr-1" /> PDF = browser print-to-PDF (server-side WeasyPrint future).</li>
              <li>QR render-only (real QR-encode lib production me).</li>
              <li>Encryption client-side AES-at-rest (true server KMS backend ke saath).</li>
              <li>Single super-admin (multi-admin roles nahi).</li>
              <li>GST/HSN validation light; full GSTN verification nahi.</li>
              <li>Email/WhatsApp invoice delivery future scope (abhi share-link).</li>
            </ul>
          </Section>

          <Section id="routes" icon={<Map size={20} />} title="8. App Map (Routes)">
            <div className="overflow-x-auto rounded-xl depth-soft">
              <table className="w-full text-sm">
                <thead><tr><Th>Route</Th><Th>Who</Th><Th>Purpose</Th></tr></thead>
                <tbody>
                  {[
                    ['/', 'Public', 'Landing'],
                    ['/register', 'Public', 'Merchant registration'],
                    ['/login', 'Public', 'Merchant login'],
                    ['/dashboard/*', 'Merchant', 'Merchant portal'],
                    ['/pay/:qrId', 'Customer', 'QR billing request'],
                    ['/track/:requestId', 'Customer', 'Invoice status + download'],
                    ['/admin/login', 'Admin', 'Admin login'],
                    ['/admin/*', 'Admin', 'Super-admin console'],
                  ].map(([r, w, p]) => (
                    <tr key={r}><Td><code className="text-[var(--color-gold)]">{r}</code></Td><Td>{w}</Td><Td>{p}</Td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="text-center text-xs text-[var(--color-mist-2)] py-4">AK-LOGIC AI · Product Documentation v1.0 · End of document</div>
        </main>
      </div>
    </div>
  );
}
