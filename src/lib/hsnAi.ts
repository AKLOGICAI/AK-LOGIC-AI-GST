/**
 * AI HSN/SAC suggestion engine (Merchant Dashboard only).
 *
 * Pure suggestion system — it NEVER applies, locks, or forces a code.
 * The merchant always has final authority. Final GST responsibility
 * remains with the merchant.
 *
 * Two signal sources, ranked:
 *   1. LEARNED memory — previously merchant-approved (itemName -> hsn/gst)
 *      selections stored from real invoices. Highest priority + confidence.
 *   2. KNOWLEDGE base — a curated keyword catalogue of common HSN/SAC codes.
 *
 * Designed to be swappable: replace `suggestHsn` internals with a call to a
 * real LLM/API later without changing any UI.
 */

import type { Invoice, HsnLearningSignal } from './types';

export interface HsnSuggestion {
  hsn: string;
  gstRate: number;
  label: string;        // human-readable category
  confidence: number;   // 0..1
  source: 'learned' | 'catalogue';
}

// ---- curated knowledge base (keyword -> code) ----
interface CatalogueEntry { keywords: string[]; hsn: string; gstRate: number; label: string }

const CATALOGUE: CatalogueEntry[] = [
  // Electronics & appliances
  { keywords: ['tv', 'television', 'led tv', 'smart tv', '4k', 'oled'], hsn: '8528', gstRate: 18, label: 'Television / Monitor' },
  { keywords: ['mobile', 'smartphone', 'iphone', 'android phone', 'cellphone'], hsn: '8517', gstRate: 18, label: 'Mobile phone' },
  { keywords: ['laptop', 'notebook', 'macbook', 'ultrabook'], hsn: '8471', gstRate: 18, label: 'Laptop / Computer' },
  { keywords: ['computer', 'desktop', 'cpu', 'pc'], hsn: '8471', gstRate: 18, label: 'Computer' },
  { keywords: ['printer', 'scanner'], hsn: '8443', gstRate: 18, label: 'Printer / Scanner' },
  { keywords: ['washing machine', 'washer', 'front load', 'top load'], hsn: '8450', gstRate: 18, label: 'Washing machine' },
  { keywords: ['refrigerator', 'fridge'], hsn: '8418', gstRate: 18, label: 'Refrigerator' },
  { keywords: ['ac', 'air conditioner', 'split ac', 'window ac', 'inverter ac'], hsn: '8415', gstRate: 28, label: 'Air conditioner' },
  { keywords: ['microwave', 'oven', 'otg'], hsn: '8516', gstRate: 18, label: 'Microwave / Oven' },
  { keywords: ['mixer', 'grinder', 'blender', 'juicer', 'food processor'], hsn: '8509', gstRate: 18, label: 'Kitchen appliance' },
  { keywords: ['air fryer', 'fryer', 'induction', 'cooktop', 'toaster', 'iron', 'kettle', 'heater'], hsn: '8516', gstRate: 18, label: 'Electro-thermal appliance' },
  { keywords: ['fan', 'ceiling fan', 'table fan', 'cooler', 'air cooler'], hsn: '8414', gstRate: 18, label: 'Fan / Cooler' },
  { keywords: ['speaker', 'soundbar', 'headphone', 'earphone', 'earbuds', 'bluetooth audio'], hsn: '8518', gstRate: 18, label: 'Audio device' },
  { keywords: ['stabilizer', 'ups', 'inverter battery'], hsn: '8504', gstRate: 18, label: 'Stabilizer / UPS' },
  { keywords: ['cable', 'hdmi', 'wire', 'charger', 'adapter'], hsn: '8544', gstRate: 18, label: 'Cable / Wire' },
  { keywords: ['camera', 'dslr', 'cctv', 'webcam'], hsn: '8525', gstRate: 18, label: 'Camera' },
  { keywords: ['battery', 'cell', 'power bank'], hsn: '8507', gstRate: 18, label: 'Battery' },
  { keywords: ['watch', 'smartwatch', 'wristwatch'], hsn: '9102', gstRate: 18, label: 'Watch' },

  // Apparel & textiles
  { keywords: ['shirt', 't-shirt', 'tshirt', 'kurta', 'trouser', 'jeans', 'apparel', 'clothing', 'garment', 'saree', 'dress'], hsn: '6109', gstRate: 5, label: 'Apparel' },
  { keywords: ['shoe', 'footwear', 'sandal', 'sneaker', 'slipper'], hsn: '6403', gstRate: 18, label: 'Footwear' },
  { keywords: ['bag', 'handbag', 'backpack', 'luggage', 'suitcase'], hsn: '4202', gstRate: 18, label: 'Bag / Luggage' },

  // Food & groceries
  { keywords: ['rice', 'wheat', 'flour', 'atta', 'pulse', 'dal', 'grain', 'cereal'], hsn: '1006', gstRate: 5, label: 'Food grain' },
  { keywords: ['oil', 'cooking oil', 'edible oil', 'ghee', 'mustard oil'], hsn: '1512', gstRate: 5, label: 'Edible oil' },
  { keywords: ['grocery', 'snack', 'biscuit', 'namkeen', 'packaged food'], hsn: '2106', gstRate: 12, label: 'Packaged food' },
  { keywords: ['tea', 'coffee'], hsn: '0902', gstRate: 5, label: 'Tea / Coffee' },
  { keywords: ['milk', 'dairy', 'curd', 'paneer', 'butter', 'cheese'], hsn: '0401', gstRate: 5, label: 'Dairy' },
  { keywords: ['water', 'beverage', 'soft drink', 'juice', 'cold drink'], hsn: '2202', gstRate: 18, label: 'Beverage' },
  { keywords: ['chocolate', 'sweet', 'candy', 'confectionery'], hsn: '1806', gstRate: 18, label: 'Confectionery' },

  // Furniture & home
  { keywords: ['furniture', 'chair', 'table', 'sofa', 'bed', 'wardrobe', 'desk'], hsn: '9403', gstRate: 18, label: 'Furniture' },
  { keywords: ['mattress', 'cushion', 'pillow'], hsn: '9404', gstRate: 18, label: 'Mattress / Bedding' },
  { keywords: ['light', 'bulb', 'led light', 'lamp', 'tube light'], hsn: '9405', gstRate: 12, label: 'Lighting' },

  // Stationery, books, toys
  { keywords: ['book', 'notebook', 'register', 'diary'], hsn: '4820', gstRate: 12, label: 'Notebook / Register' },
  { keywords: ['pen', 'pencil', 'stationery', 'marker', 'eraser'], hsn: '9608', gstRate: 18, label: 'Stationery' },
  { keywords: ['toy', 'game', 'puzzle'], hsn: '9503', gstRate: 12, label: 'Toy' },

  // Pharma & cosmetics
  { keywords: ['medicine', 'tablet', 'syrup', 'pharma', 'drug', 'capsule'], hsn: '3004', gstRate: 12, label: 'Medicine' },
  { keywords: ['soap', 'shampoo', 'cosmetic', 'cream', 'lotion', 'perfume', 'sanitizer'], hsn: '3401', gstRate: 18, label: 'Cosmetic / Toiletry' },

  // Hardware / auto
  { keywords: ['cement', 'construction'], hsn: '2523', gstRate: 28, label: 'Cement' },
  { keywords: ['paint', 'varnish'], hsn: '3208', gstRate: 18, label: 'Paint' },
  { keywords: ['tyre', 'tire', 'tube'], hsn: '4011', gstRate: 28, label: 'Tyre' },
  { keywords: ['spare part', 'auto part', 'bike part', 'car part'], hsn: '8708', gstRate: 28, label: 'Auto part' },
  { keywords: ['tool', 'drill', 'hardware', 'screwdriver', 'hammer'], hsn: '8205', gstRate: 18, label: 'Hand tool' },

  // ---- Services (SAC) ----
  { keywords: ['installation', 'install', 'fitting', 'setup service'], hsn: '9954', gstRate: 18, label: 'Installation service' },
  { keywords: ['repair', 'service', 'maintenance', 'amc', 'servicing'], hsn: '9987', gstRate: 18, label: 'Repair / Maintenance service' },
  { keywords: ['consulting', 'consultancy', 'advisory'], hsn: '9983', gstRate: 18, label: 'Consultancy service' },
  { keywords: ['transport', 'delivery', 'freight', 'courier', 'shipping'], hsn: '9965', gstRate: 18, label: 'Transport service' },
  { keywords: ['software', 'license', 'subscription', 'saas', 'app development'], hsn: '9983', gstRate: 18, label: 'IT / Software service' },
  { keywords: ['design', 'designing', 'graphic', 'printing service'], hsn: '9989', gstRate: 18, label: 'Design / Printing service' },
  { keywords: ['rent', 'rental', 'lease', 'hire'], hsn: '9972', gstRate: 18, label: 'Rental service' },
  { keywords: ['training', 'coaching', 'tuition', 'course', 'education'], hsn: '9992', gstRate: 18, label: 'Training / Education service' },
  { keywords: ['catering', 'food service', 'restaurant'], hsn: '9963', gstRate: 5, label: 'Catering / Food service' },
  { keywords: ['salon', 'beauty', 'spa', 'haircut'], hsn: '9972', gstRate: 18, label: 'Beauty / Wellness service' },
  { keywords: ['labour', 'labor', 'job work', 'manpower'], hsn: '9988', gstRate: 18, label: 'Job work / Labour service' },
];

const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'for', 'with', 'of', 'new', 'set', 'pack', 'piece', 'pcs', 'unit', 'inch', 'kg', 'ltr', 'ml', 'model', 'series']);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// ---- learning store (merchant-approved selections) ----
const LEARN_KEY = 'aklogic_hsn_memory';

interface LearnedEntry { hsn: string; gstRate: number; count: number; updatedAt: number }
type LearnMap = Record<string, Record<string, LearnedEntry>>; // merchantId -> normItemName -> entry

function readLearn(): LearnMap {
  try { return JSON.parse(localStorage.getItem(LEARN_KEY) || '{}') as LearnMap; }
  catch { return {}; }
}
function writeLearn(m: LearnMap) { localStorage.setItem(LEARN_KEY, JSON.stringify(m)); }

function normName(s: string): string {
  return tokenize(s).sort().join(' ');
}

/**
 * Record a merchant-approved item selection so future suggestions improve.
 * Called after an invoice is approved.
 */
export function learnFromInvoice(merchantId: string, items: { description: string; hsn: string; gstRate: number }[]) {
  if (!merchantId) return;
  const mem = readLearn();
  mem[merchantId] = mem[merchantId] || {};
  for (const it of items) {
    const key = normName(it.description);
    if (!key || !it.hsn) continue;
    const sig = `${it.hsn}|${it.gstRate}`;
    const bucket = mem[merchantId];
    // collapse to most-recent dominant mapping per item name
    const existing = bucket[key];
    if (existing && `${existing.hsn}|${existing.gstRate}` === sig) {
      existing.count += 1;
      existing.updatedAt = Date.now();
    } else {
      bucket[key] = { hsn: it.hsn, gstRate: it.gstRate, count: (existing?.count || 0) + 1, updatedAt: Date.now() };
    }
  }
  writeLearn(mem);
}

/** Backfill learning memory from historical approved invoices (one-time per session). */
export function bootstrapLearning(invoices: Invoice[]) {
  const grouped: Record<string, { description: string; hsn: string; gstRate: number }[]> = {};
  for (const inv of invoices) {
    grouped[inv.merchantId] = grouped[inv.merchantId] || [];
    for (const it of inv.items) grouped[inv.merchantId].push({ description: it.description, hsn: it.hsn, gstRate: it.gstRate });
  }
  for (const [mid, items] of Object.entries(grouped)) learnFromInvoice(mid, items);
}

/**
 * Suggest an HSN/SAC + GST rate for an item description.
 * Returns null if nothing relevant is found.
 */
export function suggestHsn(itemName: string, merchantId?: string): HsnSuggestion | null {
  const name = (itemName || '').trim();
  if (name.length < 2) return null;

  // 1) learned memory (merchant-specific, exact-ish match)
  if (merchantId) {
    const mem = readLearn()[merchantId];
    if (mem) {
      const key = normName(name);
      // exact normalized match
      if (mem[key]) {
        const e = mem[key];
        const confidence = Math.min(0.98, 0.8 + Math.min(e.count, 8) * 0.02);
        return { hsn: e.hsn, gstRate: e.gstRate, label: 'Learned from your past invoices', confidence, source: 'learned' };
      }
      // partial overlap match (token subset)
      const tokens = new Set(tokenize(name));
      let best: { e: LearnedEntry; overlap: number } | null = null;
      for (const [k, e] of Object.entries(mem)) {
        const kt = k.split(' ');
        const overlap = kt.filter((t) => tokens.has(t)).length;
        if (overlap > 0 && (!best || overlap > best.overlap || (overlap === best.overlap && e.count > best.e.count))) {
          best = { e, overlap };
        }
      }
      if (best && best.overlap >= 1) {
        const confidence = Math.min(0.9, 0.6 + best.overlap * 0.1 + Math.min(best.e.count, 5) * 0.02);
        return { hsn: best.e.hsn, gstRate: best.e.gstRate, label: 'Learned from your past invoices', confidence, source: 'learned' };
      }
    }
  }

  // 2) catalogue keyword scoring
  const lower = name.toLowerCase();
  const tokens = tokenize(name);
  let best: { entry: CatalogueEntry; score: number } | null = null;
  for (const entry of CATALOGUE) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (kw.includes(' ')) {
        if (lower.includes(kw)) score += kw.split(' ').length * 2; // multi-word phrase match weighs more
      } else if (lower.includes(kw)) {
        // whole-token match weighs more than substring
        score += tokens.includes(kw) ? 2 : 1;
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  if (best) {
    const confidence = Math.min(0.92, 0.45 + best.score * 0.12);
    return { hsn: best.entry.hsn, gstRate: best.entry.gstRate, label: best.entry.label, confidence, source: 'catalogue' };
  }

  return null;
}

export function confidenceLabel(c: number): string {
  if (c >= 0.85) return 'High';
  if (c >= 0.6) return 'Medium';
  return 'Low';
}

/**
 * Hydrate the in-memory/localStorage learn map from server-side signals.
 * Called on page load to merge DB-backed learned data into the existing
 * LearnMap so suggestHsn() picks them up without any signature change.
 *
 * Merge rule: for each signal, if the server has a higher approve_count
 * or a newer last_seen_at than what's already in the local map, the
 * server version wins. This is additive — it never removes local entries.
 */
export function hydrateLearnedFromServer(merchantId: string, signals: HsnLearningSignal[]): void {
  if (!merchantId || !signals || signals.length === 0) return;

  const mem = readLearn();
  mem[merchantId] = mem[merchantId] || {};
  const bucket = mem[merchantId];

  for (const sig of signals) {
    const key = sig.normalized_item_name;
    if (!key || !sig.hsn) continue;

    const existing = bucket[key];
    const serverEntry: LearnedEntry = {
      hsn: sig.hsn,
      gstRate: sig.gst_rate,
      count: sig.approve_count,
      updatedAt: sig.last_seen_at,
    };

    if (
      !existing ||
      serverEntry.count > existing.count ||
      (serverEntry.count === existing.count && serverEntry.updatedAt > existing.updatedAt)
    ) {
      bucket[key] = serverEntry;
    }
  }

  writeLearn(mem);
}
