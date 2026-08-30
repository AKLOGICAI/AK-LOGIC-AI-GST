import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShieldCheck, Lock, Database, Eye, Mail, FileText, ArrowLeft, MessageSquare, Bell, Wallet, Server } from 'lucide-react';
import Logo from '../components/Logo';
import LanguageSelector from '../components/LanguageSelector';
import { useI18n } from '../lib/i18n';

const sectionsEn = [
  {
    icon: Database,
    title: '1. Information We Collect',
    body: 'We collect information required to operate the platform securely: (a) Merchant Business Profile: Shop name, GSTIN, PAN, bank details, digital signature, company seal, brand logo, phone, email, and hashed MPIN. (b) Customer Vault (AKC ID): Name, phone, email, GSTIN, billing address, company name, state, and encrypted PIN for autofill. (c) Billing Data: Invoice items, HSN codes, tax rates (CGST/SGST/IGST), payment modes, and payment references. (d) Communication & Media: Realtime Customer ↔ Merchant and B2B network chat messages, price offers, and compressed media attachments (WebP). (e) Security Logs: IP addresses, device user-agents, and lookup audit logs.',
  },
  {
    icon: Eye,
    title: '2. How We Use Information',
    body: 'Information is used strictly to: (a) Generate legal, GST-compliant invoices and PDF documents. (b) Power instant customer autofill via AKC ID without requiring repetitive manual input. (c) Facilitate secure Customer ↔ Merchant communication and negotiation while masking private phone numbers. (d) Detect duplicate GSTINs/PANs, mitigate fraud, and maintain audit logs. (e) Process PDF credit recharges via Razorpay and deliver web push notifications. We never sell or rent personal data to third parties.',
  },
  {
    icon: Lock,
    title: '3. Data Security & DPDP Compliance',
    body: 'We enforce enterprise zero-trust security compliant with the Digital Personal Data Protection (DPDP) framework: (a) Row Level Security (RLS) is forced on all customer vault tables, completely blocking direct public database scraping. (b) Customer phone numbers are masked during initial search results. (c) All data is transmitted over HTTPS and sensitive credentials (MPINs, signatures) are encrypted at rest. (d) Merchant, Customer, and Admin portals run on isolated session contexts.',
  },
  {
    icon: MessageSquare,
    title: '4. Communication & Privacy Masking',
    body: 'Our integrated chat engine enables direct customer inquiries and price negotiation. Customer phone numbers and private addresses remain masked in chat interfaces to preserve privacy. Deal terms negotiated in chat can be automatically converted into invoice drafts upon customer confirmation.',
  },
  {
    icon: FileText,
    title: '5. Data Retention & Compliance',
    body: 'Generated GST invoices and tax records are retained as immutable financial records in compliance with statutory Indian GST laws. Non-statutory accounts and transient session data may be exported or deleted upon request by contacting our compliance team.',
  },
  {
    icon: Mail,
    title: '6. Contact & Support',
    body: 'For privacy inquiries, data export/deletion requests, or security reports, please contact us at aklogicaihelp@gmail.com. Our compliance team responds within 7 business days.',
  },
];

const sectionsHi = [
  {
    icon: Database,
    title: '1. हम कौन-सी जानकारी एकत्र करते हैं',
    body: 'हम प्लेटफ़ॉर्म के सुरक्षित संचालन के लिए आवश्यक जानकारी एकत्र करते हैं: (क) मर्चेंट प्रोफाइल: दुकान का नाम, GSTIN, PAN, बैंक विवरण, डिजिटल हस्ताक्षर, कंपनी सील, लोगो, फोन, ईमेल और MPIN। (ख) कस्टमर वॉल्ट (AKC ID): नाम, फोन, ईमेल, GSTIN, बिलिंग पता, कंपनी का नाम, राज्य और ऑटो-फिल के लिए PIN। (ग) बिलिंग डेटा: आइटम, HSN कोड, टैक्स दरें (CGST/SGST/IGST), भुगतान मोड और संदर्भ। (घ) संचार और मीडिया: रियलटाइम चैट संदेश, दर प्रस्ताव और कंप्रेस की गई WebP छवियां। (ङ) सुरक्षा लॉग: IP पता, डिवाइस विवरण और ऑडिट लॉग।',
  },
  {
    icon: Eye,
    title: '2. हम जानकारी का उपयोग कैसे करते हैं',
    body: 'जानकारी का उपयोग केवल इन कार्यों के लिए होता है: (क) जीएसटी-अनुपालक इनवॉइस और PDF दस्तावेज बनाना। (ख) AKC ID के माध्यम से बार-बार टाइप किए बिना ग्राहक विवरण ऑटो-फिल करना। (ग) फोन नंबर गुप्त रखते हुए ग्राहक-मर्चेंट चैट और बातचीत की सुविधा देना। (घ) डुप्लिकेट GSTIN/PAN और धोखाधड़ी रोकना। (ङ) Razorpay से रिचार्ज प्रोसेस करना और पुश नोटिफिकेशन भेजना। हम निजी डेटा किसी तीसरे पक्ष को नहीं बेचते।',
  },
  {
    icon: Lock,
    title: '3. डेटा सुरक्षा और DPDP अनुपालन',
    body: 'हम डिजिटल पर्सनल डेटा प्रोटेक्शन (DPDP) ढांचे के अनुपालन में ज़ीरो-ट्रस्ट सुरक्षा लागू करते हैं: (क) डेटाबेस स्तर पर Row Level Security (RLS) लागू है, जो प्रत्यक्ष सार्वजनिक डेटा निष्कर्षण को रोकती है। (ख) ग्राहक फोन नंबर खोज परिणामों में मास्क (गुप्त) रहते हैं। (ग) सभी अनुरोध HTTPS पर प्रेषित होते हैं और संवेदनशील क्रेडेंशियल एन्क्रिप्ट किए जाते हैं। (घ) मर्चेंट, ग्राहक और एडमिन पोर्टल पृथक सेशन पर चलते हैं।',
  },
  {
    icon: MessageSquare,
    title: '4. संचार और गोपनीयता मास्किंग',
    body: 'हमारा एकीकृत चैट इंजन फोन नंबर उजागर किए बिना मूल्य वार्ता की अनुमति देता है। चैट में तय किए गए सौदे ग्राहक की सहमति पर सीधे इनवॉइस ड्राफ्ट में परिवर्तित हो सकते हैं।',
  },
  {
    icon: FileText,
    title: '5. डेटा प्रतिधारण और अनुपालन',
    body: 'जीएसटी कानून के अनुसार जनरेट की गई इनवॉइस को अपरिवर्तनीय रिकॉर्ड के रूप में रखा जाता है। गैर-वैधानिक डेटा का निर्यात या विलोपन सहायता टीम से संपर्क करके किया जा सकता है।',
  },
  {
    icon: Mail,
    title: '6. संपर्क और सहायता',
    body: 'गोपनीयता प्रश्नों, डेटा निर्यात/विलोपन अनुरोधों के लिए aklogicaihelp@gmail.com पर संपर्क करें। हमारी टीम 7 कार्यदिवसों में जवाब देती है।',
  },
];

export default function Privacy() {
  const { t, lang } = useI18n();
  const sections = lang === 'hi' ? sectionsHi : sectionsEn;

  return (
    <div className="min-h-screen bg-[var(--color-ink)] text-[var(--color-ivory)] grid-bg">
      <div className="pointer-events-none fixed -top-40 -left-40 w-[480px] h-[480px] rounded-full blur-[120px]" style={{ background: 'radial-gradient(circle, rgba(56,224,200,0.12), transparent 70%)' }} />

      <header className="relative z-10 max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/"><Logo /></Link>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <Link to="/" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border border-[var(--color-line)] hover:border-[var(--color-aqua)] transition">
            <ArrowLeft size={16} /> {t('common.back')}
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-6 py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs text-[var(--color-aqua)] mb-5">
            <ShieldCheck size={14} /> {t('privacy.title')}
          </div>
          <h1 className="font-[var(--font-display)] text-4xl font-extrabold tracking-tight">{t('privacy.title')}</h1>
          <p className="text-[var(--color-mist)] mt-3 max-w-lg">
            {lang === 'hi'
              ? 'आपकी गोपनीयता हमारे लिए अत्यंत महत्वपूर्ण है। यह नीति बताती है कि हम AK-LOGIC AI प्लेटफ़ॉर्म पर जानकारी कैसे एकत्र, उपयोग और सुरक्षित करते हैं।'
              : 'Your privacy matters to us. This policy explains how we collect, use, and protect information across the AK-LOGIC AI platform.'}
          </p>
          <p className="text-xs text-[var(--color-mist-2)] mt-2">
            {lang === 'hi' ? 'अंतिम अद्यतन' : 'Last updated'}: {new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { month: 'long', year: 'numeric' })} · DPDP Compliant
          </p>
        </motion.div>

        <div className="mt-10 space-y-4">
          {sections.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className="depth-card rounded-2xl p-6 flex gap-4"
            >
              <div className="w-11 h-11 rounded-xl grid place-items-center depth-raised shrink-0" style={{ background: 'linear-gradient(150deg,#1b2942,#0c1322)' }}>
                <s.icon size={20} className="text-[var(--color-aqua)]" />
              </div>
              <div>
                <h2 className="font-[var(--font-display)] font-semibold text-lg">{s.title}</h2>
                <p className="text-sm text-[var(--color-mist)] mt-2 leading-relaxed">{s.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-[var(--color-line)] mt-8">
        <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size={28} />
          <p className="text-xs text-[var(--color-mist-2)]">{t('footer.rights', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  );
}
