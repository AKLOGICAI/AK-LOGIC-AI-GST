/**
 * AI HSN/SAC suggestion engine (Android Client).
 * Matches Master Web App logic in src/lib/hsnAi.ts.
 */

export interface HsnSuggestion {
  hsn: string;
  gstRate: number;
  label: string;
  confidence: number;
  source: 'learned' | 'catalogue';
}

interface CatalogueEntry {
  keywords: string[];
  hsn: string;
  gstRate: number;
  label: string;
}

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

  // Stationery & books
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

  // Services (SAC)
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

export function suggestHsn(rawItemName: string): HsnSuggestion | null {
  const name = (rawItemName || '').toLowerCase().trim();
  if (!name || name.length < 2) return null;

  for (const entry of CATALOGUE) {
    for (const kw of entry.keywords) {
      if (name.includes(kw)) {
        return {
          hsn: entry.hsn,
          gstRate: entry.gstRate,
          label: entry.label,
          confidence: kw === name ? 0.95 : 0.8,
          source: 'catalogue',
        };
      }
    }
  }

  return null;
}
