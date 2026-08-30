// AK-LOGIC AI GST — Domain Mock Data
// Mirrored 1:1 with Web App schemas (PostgreSQL domain models in src/lib/types.ts & store.ts)

export interface MockUser {
  id: string;
  merchantCode: string; // e.g. "AKM-000125"
  name: string;
  ownerName: string;
  shopName: string;
  legalName: string;
  tradeName: string;
  businessType: string;
  phone: string;
  email: string;
  gstin: string;
  pan: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  bankName: string;
  accountType: 'current' | 'savings';
  accountNumber: string;
  ifsc: string;
  pdfCredits: number;
  planId: string;
  planName: string;
  planValidityDays: number;
  planStartedAt: number;
  planExpiresAt: number;
  customBranding: boolean;
  qrId: string;
  kyc: 'verified' | 'pending' | 'rejected';
  status: 'active' | 'suspended' | 'disabled';
  invoicePrefix: string;
  hasCustomLogo: boolean;
  hasSignature: boolean;
  hasCompanySeal: boolean;
  upiId: string;
  networkTermsAccepted: boolean;
}

export const mockUser: MockUser = {
  id: 'm_001',
  merchantCode: 'AKM-000125',
  name: 'Amit Kumar',
  ownerName: 'Amit Kumar',
  shopName: 'Kumar Electronics',
  legalName: 'Kumar Electronics Pvt Ltd',
  tradeName: 'Kumar Electronics',
  businessType: 'Proprietorship',
  phone: '+91 98765 43210',
  email: 'amit@kumarelectronics.com',
  gstin: '27AAPFU0939F1ZV',
  pan: 'AAPFU0939F',
  address: '123, MG Road, Andheri West',
  city: 'Mumbai',
  state: 'Maharashtra',
  pincode: '400058',
  bankName: 'HDFC Bank',
  accountType: 'current',
  accountNumber: '50200012345678',
  ifsc: 'HDFC0000123',
  pdfCredits: 47,
  planId: 'monthly_199',
  planName: '₹199 Monthly',
  planValidityDays: 30,
  planStartedAt: Date.now() - 15 * 86400000,
  planExpiresAt: Date.now() + 15 * 86400000,
  customBranding: true,
  qrId: 'AKM-000125',
  kyc: 'verified',
  status: 'active',
  invoicePrefix: 'INV/2025-26/',
  hasCustomLogo: true,
  hasSignature: true,
  hasCompanySeal: true,
  upiId: 'kumarelectronics@okaxis',
  networkTermsAccepted: true,
};

export const mockDashboard = {
  todaySales: 24580,
  pendingRequests: 5,
  lowStockItems: 3,
  totalInvoices: 1247,
  monthSales: 385000,
  weekSales: 87500,
  gstCollected: 48600,
  cgst: 24300,
  sgst: 24300,
  igst: 0,
};

export interface MockInvoiceItem {
  id: string;
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  gstRate: number;
  inventoryItemId?: string;
}

export interface MockInvoiceRequest {
  id: string;
  merchantId: string;
  invoiceNo?: string;
  invoiceNumber?: string;
  invoiceId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerGstin?: string;
  customerPan?: string;
  customerAddress: string;
  customerState: string;
  paymentMode: 'cash' | 'upi' | 'card' | 'netbanking' | 'credit' | 'cheque';
  paymentRef?: string;
  items: MockInvoiceItem[];
  notes?: string;
  rejectReason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
  branded: boolean;
}

export const mockRequests: MockInvoiceRequest[] = [
  {
    id: 'REQ-001',
    merchantId: 'm_001',
    customerName: 'Rahul Sharma',
    customerPhone: '+91 98765 00001',
    customerEmail: 'rahul.sharma@gmail.com',
    customerGstin: '27AAPFU0939F1ZV',
    customerAddress: 'Flat 402, Sea View Apts, Bandra West, Mumbai',
    customerState: 'Maharashtra',
    paymentMode: 'upi',
    paymentRef: 'UPI/435219876523',
    items: [
      { id: 'it_1', description: 'Samsung LED TV 43"', hsn: '8528', qty: 1, rate: 24152.54, gstRate: 18 },
    ],
    notes: 'Please deliver on ground floor',
    status: 'pending',
    createdAt: Date.now() - 2 * 60 * 1000,
    branded: true,
  },
  {
    id: 'REQ-002',
    merchantId: 'm_001',
    customerName: 'Priya Patel',
    customerPhone: '+91 98765 00002',
    customerEmail: 'priya.patel@yahoo.com',
    customerGstin: '24AAPFU0939F1ZV', // Gujarat (Inter-state IGST)
    customerAddress: '12, Shanti Nagar, SG Highway, Ahmedabad',
    customerState: 'Gujarat',
    paymentMode: 'cash',
    items: [
      { id: 'it_2', description: 'LG Washing Machine 7kg', hsn: '8450', qty: 1, rate: 16016.95, gstRate: 18 },
    ],
    notes: 'Interstate supply for Ahmedabad office',
    status: 'pending',
    createdAt: Date.now() - 15 * 60 * 1000,
    branded: true,
  },
  {
    id: 'REQ-003',
    merchantId: 'm_001',
    customerName: 'Suresh Gupta',
    customerPhone: '+91 98765 00003',
    customerEmail: 'suresh.gupta@outlook.com',
    customerGstin: '',
    customerAddress: 'Shop 5, Station Road, Thane',
    customerState: 'Maharashtra',
    paymentMode: 'upi',
    paymentRef: 'UPI/987654321012',
    items: [
      { id: 'it_3', description: 'USB-C Fast Charger 65W', hsn: '8504', qty: 5, rate: 423.73, gstRate: 18 },
    ],
    status: 'pending',
    createdAt: Date.now() - 60 * 60 * 1000,
    branded: true,
  },
  {
    id: 'REQ-004',
    merchantId: 'm_001',
    invoiceNo: 'INV/2025-26/1244',
    invoiceNumber: 'AKM-000125-001244',
    customerName: 'Meena Devi',
    customerPhone: '+91 98765 00004',
    customerEmail: 'meenad@gmail.com',
    customerGstin: '',
    customerAddress: '24, Link Road, Borivali West, Mumbai',
    customerState: 'Maharashtra',
    paymentMode: 'credit',
    items: [
      { id: 'it_4', description: 'Philips Iron Box', hsn: '8516', qty: 1, rate: 1864.41, gstRate: 18 },
      { id: 'it_5', description: 'Mixer Grinder 750W', hsn: '8509', qty: 1, rate: 2711.86, gstRate: 18 },
    ],
    notes: 'Pay later within 7 days',
    status: 'approved',
    createdAt: Date.now() - 3 * 3600 * 1000,
    resolvedAt: Date.now() - 2.5 * 3600 * 1000,
    branded: true,
  },
  {
    id: 'REQ-005',
    merchantId: 'm_001',
    customerName: 'Vikram Singh',
    customerPhone: '+91 98765 00005',
    customerEmail: 'vikram.singh@corporate.in',
    customerGstin: '27BAPFU0939F1ZV',
    customerAddress: 'Sector 17, Vashi, Navi Mumbai',
    customerState: 'Maharashtra',
    paymentMode: 'card',
    items: [
      { id: 'it_6', description: 'Daikin AC 1.5 Ton Inverter', hsn: '8415', qty: 1, rate: 29687.50, gstRate: 28 },
    ],
    rejectReason: 'Out of stock — fresh delivery arriving next week',
    status: 'rejected',
    createdAt: Date.now() - 5 * 3600 * 1000,
    resolvedAt: Date.now() - 4.5 * 3600 * 1000,
    branded: true,
  },
];

export interface MockInvoice {
  id: string;
  requestId: string;
  merchantId: string;
  invoiceNo: string; // e.g. "INV/2025-26/1247"
  invoiceNumber: string; // e.g. "AKM-000125-001247"
  invoiceDate: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerGstin?: string;
  customerPan?: string;
  customerAddress: string;
  customerState: string;
  paymentMode: 'cash' | 'upi' | 'card' | 'netbanking' | 'credit' | 'cheque';
  paymentRef?: string;
  notes?: string;
  items: MockInvoiceItem[];
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  amountInWords: string;
  placeOfSupply: string;
  isInterState: boolean;
  branded: boolean;
  status: 'paid' | 'pending';
}

export const mockRecentInvoices: MockInvoice[] = [
  {
    id: 'inv_1247',
    requestId: 'REQ-1247',
    merchantId: 'm_001',
    invoiceNo: 'INV/2025-26/1247',
    invoiceNumber: 'AKM-000125-001247',
    invoiceDate: Date.now() - 2 * 3600 * 1000,
    customerName: 'Rahul Sharma',
    customerPhone: '+91 98765 00001',
    customerEmail: 'rahul.sharma@gmail.com',
    customerGstin: '27AAPFU0939F1ZV',
    customerAddress: 'Flat 402, Sea View Apts, Bandra West, Mumbai',
    customerState: 'Maharashtra',
    paymentMode: 'upi',
    paymentRef: 'UPI/9876123456',
    items: [
      { id: 'it_1', description: 'Bluetooth Speaker JBL Flip 6', hsn: '8518', qty: 1, rate: 3813.56, gstRate: 18 },
    ],
    taxableValue: 3813.56,
    cgst: 343.22,
    sgst: 343.22,
    igst: 0,
    totalTax: 686.44,
    roundOff: 0,
    grandTotal: 4500,
    amountInWords: 'INR Four Thousand Five Hundred Only',
    placeOfSupply: '27-Maharashtra',
    isInterState: false,
    branded: true,
    status: 'paid',
  },
  {
    id: 'inv_1246',
    requestId: 'REQ-1246',
    merchantId: 'm_001',
    invoiceNo: 'INV/2025-26/1246',
    invoiceNumber: 'AKM-000125-001246',
    invoiceDate: Date.now() - 5 * 3600 * 1000,
    customerName: 'Priya Patel',
    customerPhone: '+91 98765 00002',
    customerEmail: 'priya.patel@yahoo.com',
    customerGstin: '24AAPFU0939F1ZV',
    customerAddress: '12, Shanti Nagar, SG Highway, Ahmedabad',
    customerState: 'Gujarat',
    paymentMode: 'credit',
    notes: 'Payment pending — credit 15 days',
    items: [
      { id: 'it_2', description: 'LG Semi-Automatic Machine', hsn: '8450', qty: 1, rate: 10847.46, gstRate: 18 },
    ],
    taxableValue: 10847.46,
    cgst: 0,
    sgst: 0,
    igst: 1952.54,
    totalTax: 1952.54,
    roundOff: 0,
    grandTotal: 12800,
    amountInWords: 'INR Twelve Thousand Eight Hundred Only',
    placeOfSupply: '24-Gujarat',
    isInterState: true,
    branded: true,
    status: 'pending',
  },
  {
    id: 'inv_1245',
    requestId: 'REQ-1245',
    merchantId: 'm_001',
    invoiceNo: 'INV/2025-26/1245',
    invoiceNumber: 'AKM-000125-001245',
    invoiceDate: Date.now() - 24 * 3600 * 1000,
    customerName: 'Suresh Gupta',
    customerPhone: '+91 98765 00003',
    customerEmail: 'suresh.gupta@outlook.com',
    customerAddress: 'Shop 5, Station Road, Thane',
    customerState: 'Maharashtra',
    paymentMode: 'cash',
    items: [
      { id: 'it_3', description: 'Philips Iron Box Heavy Dry', hsn: '8516', qty: 1, rate: 1864.41, gstRate: 18 },
    ],
    taxableValue: 1864.41,
    cgst: 167.79,
    sgst: 167.79,
    igst: 0,
    totalTax: 335.59,
    roundOff: 0,
    grandTotal: 2200,
    amountInWords: 'INR Two Thousand Two Hundred Only',
    placeOfSupply: '27-Maharashtra',
    isInterState: false,
    branded: true,
    status: 'paid',
  },
  {
    id: 'inv_1244',
    requestId: 'REQ-1244',
    merchantId: 'm_001',
    invoiceNo: 'INV/2025-26/1244',
    invoiceNumber: 'AKM-000125-001244',
    invoiceDate: Date.now() - 48 * 3600 * 1000,
    customerName: 'Meena Devi',
    customerPhone: '+91 98765 00004',
    customerEmail: 'meenad@gmail.com',
    customerAddress: '24, Link Road, Borivali West, Mumbai',
    customerState: 'Maharashtra',
    paymentMode: 'credit',
    items: [
      { id: 'it_4', description: 'Philips Mixer Grinder 750W', hsn: '8509', qty: 2, rate: 3771.19, gstRate: 18 },
    ],
    taxableValue: 7542.37,
    cgst: 678.81,
    sgst: 678.81,
    igst: 0,
    totalTax: 1357.63,
    roundOff: 0,
    grandTotal: 8900,
    amountInWords: 'INR Eight Thousand Nine Hundred Only',
    placeOfSupply: '27-Maharashtra',
    isInterState: false,
    branded: true,
    status: 'pending',
  },
  {
    id: 'inv_1243',
    requestId: 'REQ-1243',
    merchantId: 'm_001',
    invoiceNo: 'INV/2025-26/1243',
    invoiceNumber: 'AKM-000125-001243',
    invoiceDate: Date.now() - 72 * 3600 * 1000,
    customerName: 'Vikram Singh',
    customerPhone: '+91 98765 00005',
    customerEmail: 'vikram.singh@corporate.in',
    customerGstin: '27BAPFU0939F1ZV',
    customerAddress: 'Sector 17, Vashi, Navi Mumbai',
    customerState: 'Maharashtra',
    paymentMode: 'card',
    paymentRef: 'POS-TXN-884920',
    items: [
      { id: 'it_5', description: 'Smart Home Security Camera x2', hsn: '8525', qty: 2, rate: 6610.17, gstRate: 18 },
    ],
    taxableValue: 13220.34,
    cgst: 1189.83,
    sgst: 1189.83,
    igst: 0,
    totalTax: 2379.66,
    roundOff: 0,
    grandTotal: 15600,
    amountInWords: 'INR Fifteen Thousand Six Hundred Only',
    placeOfSupply: '27-Maharashtra',
    isInterState: false,
    branded: true,
    status: 'paid',
  },
];

export const mockProducts = [
  { id: 'p_1', name: 'Samsung LED TV 43"', sku: 'SAM-TV-43', hsn: '8528', sellingPrice: 28500, costPrice: 22000, stock: 12, gst: 18, category: 'Electronics', unit: 'pcs' },
  { id: 'p_2', name: 'LG Washing Machine 7kg', sku: 'LG-WM-7K', hsn: '8450', sellingPrice: 18900, costPrice: 15000, stock: 5, gst: 18, category: 'Appliances', unit: 'pcs' },
  { id: 'p_3', name: 'USB-C Charger 65W', sku: 'CHG-65W', hsn: '8504', sellingPrice: 500, costPrice: 280, stock: 85, gst: 18, category: 'Accessories', unit: 'pcs' },
  { id: 'p_4', name: 'Philips Iron Box', sku: 'PHL-IRN', hsn: '8516', sellingPrice: 2200, costPrice: 1650, stock: 2, gst: 18, category: 'Appliances', unit: 'pcs', lowStock: true },
  { id: 'p_5', name: 'Mixer Grinder 750W', sku: 'MIX-750', hsn: '8509', sellingPrice: 3200, costPrice: 2400, stock: 0, gst: 18, category: 'Appliances', unit: 'pcs', outOfStock: true },
  { id: 'p_6', name: 'Bluetooth Speaker JBL', sku: 'JBL-SPK', hsn: '8518', sellingPrice: 4500, costPrice: 3400, stock: 23, gst: 18, category: 'Audio', unit: 'pcs' },
  { id: 'p_7', name: 'Daikin AC 1.5 Ton', sku: 'DAI-AC15', hsn: '8415', sellingPrice: 38000, costPrice: 30000, stock: 3, gst: 28, category: 'Electronics', unit: 'pcs', lowStock: true },
  { id: 'p_8', name: 'Wireless Mouse', sku: 'WL-MOUSE', hsn: '8471', sellingPrice: 650, costPrice: 380, stock: 45, gst: 18, category: 'Accessories', unit: 'pcs' },
];

export const mockNotifications = [
  { id: 1, type: 'request', title: 'New Billing Request', message: 'Rahul Sharma requested a bill for Samsung LED TV 43"', time: '2 min ago', read: false },
  { id: 2, type: 'payment', title: 'Payment Received', message: '₹4,500 received from Rahul Sharma via UPI', time: '15 min ago', read: false },
  { id: 3, type: 'stock', title: 'Low Stock Alert', message: 'Philips Iron Box has only 2 units left in warehouse', time: '1 hr ago', read: false },
  { id: 4, type: 'gst', title: 'GST Filing Reminder', message: 'GSTR-1 due date is approaching (11 Jan)', time: '2 hr ago', read: true },
  { id: 5, type: 'system', title: 'PDF Credits Status', message: 'You have 47 PDF credits remaining. Plan validity: 15 days left.', time: '5 hr ago', read: true },
  { id: 6, type: 'approved', title: 'Request Approved', message: 'Invoice INV/2025-26/1244 created for Meena Devi', time: '6 hr ago', read: true },
  { id: 7, type: 'alert', title: 'Payment Overdue', message: 'Payment of ₹8,900 from Meena Devi is 3 days overdue', time: '1 day ago', read: true },
];

export const mockCustomers = [
  { id: 'c_1', name: 'Rahul Sharma', customerCode: 'AKC-000412', phone: '+91 98765 00001', email: 'rahul.sharma@gmail.com', gstin: '27AAPFU0939F1ZV', address: 'Bandra West, Mumbai', state: 'Maharashtra', totalBusiness: 125000 },
  { id: 'c_2', name: 'Priya Patel', customerCode: 'AKC-000843', phone: '+91 98765 00002', email: 'priya.patel@yahoo.com', gstin: '24AAPFU0939F1ZV', address: 'SG Highway, Ahmedabad', state: 'Gujarat', totalBusiness: 89000 },
  { id: 'c_3', name: 'Suresh Gupta', customerCode: 'AKC-001209', phone: '+91 98765 00003', email: 'suresh.gupta@outlook.com', gstin: '', address: 'Station Road, Thane', state: 'Maharashtra', totalBusiness: 45000 },
  { id: 'c_4', name: 'Meena Devi', customerCode: 'AKC-001550', phone: '+91 98765 00004', email: 'meenad@gmail.com', gstin: '', address: 'Borivali West, Mumbai', state: 'Maharashtra', totalBusiness: 32000 },
  { id: 'c_5', name: 'Vikram Singh', customerCode: 'AKC-002100', phone: '+91 98765 00005', email: 'vikram.singh@corporate.in', gstin: '27BAPFU0939F1ZV', address: 'Vashi, Navi Mumbai', state: 'Maharashtra', totalBusiness: 210000 },
];

export const mockMerchants = [
  { id: 1, name: 'Sharma Wholesale Pvt Ltd', type: 'Electronics Distributor', city: 'Mumbai', state: 'Maharashtra', rating: 4.8, verified: true, distanceKm: 3.2 },
  { id: 2, name: 'Patel Home Appliances', type: 'Appliances Distributor', city: 'Ahmedabad', state: 'Gujarat', rating: 4.5, verified: true, distanceKm: 12.0 },
  { id: 3, name: 'Gupta Mobile & Accessories', type: 'Mobile Wholesale', city: 'Thane', state: 'Maharashtra', rating: 4.2, verified: false, distanceKm: 18.5 },
  { id: 4, name: 'Singh Power & Cooling', type: 'HVAC & AC Wholesaler', city: 'Navi Mumbai', state: 'Maharashtra', rating: 4.7, verified: true, distanceKm: 24.1 },
];

export const mockNetworkRequests = [
  {
    id: 'net_req_101',
    product_name: 'Daikin AC 1.5 Ton Inverter Copper',
    quantity: 2,
    unit: 'pcs',
    urgency: 'urgent' as const,
    status: 'open',
    city: 'Mumbai',
    state: 'Maharashtra',
    origin: 'customer_escalation',
    created_at: Date.now() - 45 * 60 * 1000,
    shopName: 'Metro Cooling Solutions',
  },
  {
    id: 'net_req_102',
    product_name: 'Samsung LED TV 43" 4K UHD',
    quantity: 5,
    unit: 'pcs',
    urgency: 'normal' as const,
    status: 'responded',
    city: 'Thane',
    state: 'Maharashtra',
    origin: 'direct',
    created_at: Date.now() - 3 * 3600 * 1000,
    shopName: 'Sharma Wholesale',
  },
];

// Plans catalog matching src/lib/plans.ts exactly
export const mockPlans = [
  { id: 'trial_20', name: '₹20 Trial', price: 20, validityDays: 1, credits: 10, tag: '1 Day', popular: false, unlocksBranding: false, features: ['10 PDF Credits', '1 Day Validity', 'Standard AK-LOGIC AI Branding', 'Basic Invoicing'] },
  { id: 'starter_50', name: '₹50 Starter', price: 50, validityDays: 3, credits: 30, tag: '3 Days', popular: false, unlocksBranding: false, features: ['30 PDF Credits', '3 Days Validity', 'Standard AK-LOGIC AI Branding', 'GST Calculation Engine'] },
  { id: 'monthly_199', name: '₹199 Monthly', price: 199, validityDays: 30, credits: 300, tag: '30 Days', popular: true, unlocksBranding: true, features: ['300 PDF Credits', '30 Days Validity', '👑 Custom Business Logo & Branding', 'Carry-Forward Support', 'Inventory & OCR Bills'] },
  { id: 'monthly_299', name: '₹299 Monthly', price: 299, validityDays: 30, credits: 600, tag: '30 Days', popular: false, unlocksBranding: true, features: ['600 PDF Credits', '30 Days Validity', '👑 Custom Business Logo & Branding', 'Deep Accounting & Ledgers', 'Merchant B2B Network'] },
  { id: 'monthly_399', name: '₹399 Monthly', price: 399, validityDays: 30, credits: 1000, tag: '30 Days', popular: false, unlocksBranding: true, features: ['1,000 PDF Credits', '30 Days Validity', '👑 Custom Branding & Seal', 'Online Store Builder', 'Priority Support'] },
  { id: 'monthly_900', name: '₹900 Enterprise', price: 900, validityDays: 30, credits: 2500, tag: '30 Days', best: true, unlocksBranding: true, features: ['2,500 PDF Credits', '30 Days Validity', 'Full Custom Branding Suite', 'AKAI Automated Audit Engine', 'Unlimited Multi-Device Sync'] },
];

export const mockValidityAddon = {
  id: 'addon_validity_50',
  name: '₹50 Validity Extension',
  price: 50,
  extendDays: 30,
};

export const mockChatMessages = [
  { id: 1, sender: 'user', text: 'What is my total sales and GST collected this month?', time: '10:30 AM' },
  { id: 2, sender: 'akai', text: '📊 **Month Summary (Dec 2024)**:\n\n• **Gross Sales**: ₹3,85,000 across 42 invoices\n• **Total GST Collected**: ₹48,600 (CGST: ₹24,300, SGST: ₹24,300)\n• **Growth**: +12.4% vs last month\n• **Pending Receivables**: ₹24,300\n\nYour books are 100% balanced! 🟢', time: '10:30 AM' },
  { id: 3, sender: 'user', text: 'Show me overdue customer payments', time: '10:32 AM' },
  { id: 4, sender: 'akai', text: '⚠️ **Overdue Credit Receivables (3 parties)**:\n\n1. **Meena Devi**: ₹8,900 (3 days overdue)\n2. **Raj Malhotra**: ₹10,400 (5 days overdue)\n3. **Deepak Jain**: ₹5,000 (7 days overdue)\n\nWould you like me to generate automated WhatsApp payment reminders?', time: '10:32 AM' },
];

// Deep Accounting matching accountingService.ts
export const mockAccounting = {
  sales_revenue: 385000,
  purchases_cost: 245000,
  gross_profit: 140000,
  receivables_outstanding: 67000,
  payables_outstanding: 32000,
  cash_bank_balance: 156000,
  total_itc_available: 44100,
  total_gst_liability: 69300,
  net_gst_payable: 25200,
  is_books_balanced: true,
  trialBalance: [
    { account_id: 'coa_1010', account_code: '1010', account_name: 'Cash in Hand', account_type: 'asset', debit: 45000, credit: 0 },
    { account_id: 'coa_1011', account_code: '1011', account_name: 'Bank & UPI Account', account_type: 'asset', debit: 111000, credit: 0 },
    { account_id: 'coa_1012', account_code: '1012', account_name: 'Cards & POS Settlements', account_type: 'asset', debit: 15600, credit: 0 },
    { account_id: 'coa_1020', account_code: '1020', account_name: 'Accounts Receivable (Sundry Debtors)', account_type: 'asset', debit: 67000, credit: 0 },
    { account_id: 'coa_1030', account_code: '1030', account_name: 'Inventory / Merchandise Stock', account_type: 'asset', debit: 198000, credit: 0 },
    { account_id: 'coa_1041', account_code: '1041', account_name: 'Input Tax Credit — CGST', account_type: 'asset', debit: 22050, credit: 0 },
    { account_id: 'coa_1042', account_code: '1042', account_name: 'Input Tax Credit — SGST', account_type: 'asset', debit: 22050, credit: 0 },
    { account_id: 'coa_2010', account_code: '2010', account_name: 'Accounts Payable (Sundry Creditors)', account_type: 'liability', debit: 0, credit: 32000 },
    { account_id: 'coa_2041', account_code: '2041', account_name: 'Output Tax Liability — CGST', account_type: 'liability', debit: 0, credit: 34650 },
    { account_id: 'coa_2042', account_code: '2042', account_name: 'Output Tax Liability — SGST', account_type: 'liability', debit: 0, credit: 34650 },
    { account_id: 'coa_3010', account_code: '3010', account_name: "Owner's Capital & Equity", account_type: 'equity', debit: 0, credit: 134400 },
    { account_id: 'coa_4010', account_code: '4010', account_name: 'Sales Revenue (Goods & Services)', account_type: 'income', debit: 0, credit: 385000 },
    { account_id: 'coa_5010', account_code: '5010', account_name: 'Purchases (Cost of Goods Sold)', account_type: 'expense', debit: 245000, credit: 0 },
  ],
  payables: [
    { supplier_name: 'Sharma Wholesale Pvt Ltd', supplier_gstin: '07AAPFU0939F1ZV', bill_number: 'SW-2024-5678', total_amount: 22000, outstanding_amount: 22000, due_date: '10 Jan 2025' },
    { supplier_name: 'Patel Home Appliances', supplier_gstin: '24AAPFU0939F1ZV', bill_number: 'PA-2024-1102', total_amount: 10000, outstanding_amount: 10000, due_date: '15 Jan 2025' },
  ],
  receivables: [
    { customer_name: 'Meena Devi', customer_phone: '+91 98765 00004', invoice_no: 'INV/2025-26/1244', total_amount: 8900, outstanding_amount: 8900, overdue_days: 3 },
    { customer_name: 'Priya Patel', customer_phone: '+91 98765 00002', invoice_no: 'INV/2025-26/1246', total_amount: 12800, outstanding_amount: 12800, overdue_days: 0 },
  ],
};

// AKAI Historical Audits matching akaiAuditStorage.ts
export const mockAkaiAudits = [
  {
    id: 'AUD-2024-1224',
    dateFormatted: '24 Dec 2024, 06:30 PM',
    healthScore: 98,
    healthGrade: 'A+ (Excellent)',
    accounting: { isBalanced: true, difference: 0 },
    metrics: { todaySales: 24580, monthlyRevenue: 385000, outstandingReceivables: 21700, activeStockCount: 8 },
    findings: [
      'Double-entry ledgers are 100% balanced with zero debit-credit drift.',
      'GSTR-1 output tax reconciles perfectly with active tax registers.',
      'Philips Iron Box stock is running low (2 units left). Restock suggested.',
    ],
  },
  {
    id: 'AUD-2024-1217',
    dateFormatted: '17 Dec 2024, 07:15 PM',
    healthScore: 95,
    healthGrade: 'A (Good)',
    accounting: { isBalanced: true, difference: 0 },
    metrics: { todaySales: 18400, monthlyRevenue: 285000, outstandingReceivables: 32000, activeStockCount: 9 },
    findings: [
      'Double-entry ledgers balanced.',
      'Overdue payment detected from Deepak Jain (7 days).',
    ],
  },
];

// Website store config matching websiteService.ts
export const mockWebsiteConfig = {
  storeName: 'Kumar Electronics',
  tagline: 'Authorized Electronics & Home Appliances Store',
  subdomain: 'kumarelectronics',
  fullUrl: 'https://shop.ak-logicai.in/store/AKM-000125',
  status: 'published' as 'published' | 'draft',
  theme: {
    name: 'Indigo & Emerald',
    primary: '#4F46E5',
    secondary: '#10B981',
  },
  phone: '+91 98765 43210',
  whatsapp: '+91 98765 43210',
  deliveryRadiusKm: 15,
  upiId: 'kumarelectronics@okaxis',
};

export const mockWebsiteThemes = [
  { id: 1, name: 'Indigo & Emerald', color: '#4F46E5', secondary: '#10B981', preview: 'Modern & Trustworthy' },
  { id: 2, name: 'Gold & Aqua', color: '#E9C46A', secondary: '#38E0C8', preview: 'High-Tech Financial Look' },
  { id: 3, name: 'Midnight Slate', color: '#3B82F6', secondary: '#8B5CF6', preview: 'Professional Enterprise' },
  { id: 4, name: 'Deep Cyan & Neon', color: '#06B6D4', secondary: '#10B981', preview: 'Vibrant Storefront' },
];

export const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa',
  'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka',
  'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya',
  'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
];
