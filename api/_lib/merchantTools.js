// api/_lib/merchantTools.js
// Shared business logic for AI-facing tools (Claude MCP, ChatGPT Custom Actions, Sarvam AI).

import { createClient } from '@supabase/supabase-js';

export function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable is not configured on Vercel.');
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Auth: resolve a bearer token to a merchant_id
// ---------------------------------------------------------------------------
export async function resolveMerchant(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    throw new Error('Missing Authorization header. Expected: Authorization: Bearer <token>');
  }
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('Invalid Authorization header format. Expected: Bearer <token>');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new Error('Empty Bearer token provided.');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('mcp_access_tokens')
    .select('merchant_id, revoked')
    .eq('token', token)
    .single();

  if (error) {
    throw new Error(`Database token lookup failed: ${error.message} (${error.code || 'UNKNOWN'})`);
  }
  if (!data) {
    throw new Error('Access token not found in database.');
  }
  if (data.revoked) {
    throw new Error('Access token has been revoked.');
  }

  // Update last used timestamp asynchronously
  supabase
    .from('mcp_access_tokens')
    .update({ last_used_at: Date.now() })
    .eq('token', token)
    .then(() => {});

  return data.merchant_id;
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------
export const EDITABLE_MERCHANT_FIELDS = [
  'shopName', 'ownerName', 'legalName', 'tradeName', 'businessType',
  'email', 'phone', 'address', 'state', 'city', 'pincode',
  'gstin', 'pan', 'bankName', 'accountType', 'accountNumber', 'ifsc',
  'upiId', 'brandName', 'brandColor', 'invoicePrefix',
];

export async function getAccountInfo(merchantId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('merchants')
    .select(
      'id, shopName, ownerName, legalName, tradeName, businessType, email, phone, ' +
      'address, state, city, pincode, gstin, pan, bankName, accountType, accountNumber, ' +
      'ifsc, upiId, brandName, brandColor, invoicePrefix, planName, planExpiresAt, status'
    )
    .eq('id', merchantId)
    .single();

  if (error) throw new Error(`Could not load account: ${error.message}`);
  return data;
}

export async function updateAccountInfo(merchantId, fields = {}) {
  const patch = {};
  for (const key of Object.keys(fields)) {
    if (EDITABLE_MERCHANT_FIELDS.includes(key)) {
      patch[key] = fields[key];
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new Error(
      `No editable fields provided. Editable fields are: ${EDITABLE_MERCHANT_FIELDS.join(', ')}`
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('merchants')
    .update(patch)
    .eq('id', merchantId)
    .select()
    .single();

  if (error) throw new Error(`Update failed: ${error.message}`);
  return { updated_fields: Object.keys(patch), account: data };
}

export async function listInvoices(merchantId, limit = 10) {
  const supabase = getSupabase();
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoiceNo, invoiceDate, customerName, grandTotal, totalTax, createdAt')
    .eq('merchantId', merchantId)
    .order('createdAt', { ascending: false })
    .limit(safeLimit);

  if (error) throw new Error(`Could not load invoices: ${error.message}`);
  return data;
}

export async function getInvoiceDetail(merchantId, invoiceId) {
  if (!invoiceId) throw new Error('Missing invoice_id');
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('merchantId', merchantId)
    .eq('id', invoiceId)
    .single();

  if (error) throw new Error(`Invoice not found: ${error.message}`);
  return data;
}

export async function callTool(merchantId, name, args = {}) {
  switch (name) {
    case 'get_account_info':
      return getAccountInfo(merchantId);
    case 'update_account_info':
      return updateAccountInfo(merchantId, args);
    case 'list_recent_invoices':
      return listInvoices(merchantId, args.limit ?? 10);
    case 'get_invoice_detail':
      return getInvoiceDetail(merchantId, args.invoice_id);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const TOOL_DEFS = [
  {
    name: 'get_account_info',
    description:
      "Get the merchant's own billing account details: shop/legal name, GSTIN, PAN, " +
      'address, bank details, UPI ID, branding, and current plan.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'update_account_info',
    description:
      "Update fields on the merchant's own account (corrections). Only pass the " +
      `fields that need to change. Editable fields: ${EDITABLE_MERCHANT_FIELDS.join(', ')}.`,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        EDITABLE_MERCHANT_FIELDS.map((f) => [f, { type: 'string' }])
      ),
    },
  },
  {
    name: 'list_recent_invoices',
    description: "List the merchant's most recent invoices (summary view).",
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'How many invoices to return (default 10, max 50)' },
      },
    },
  },
  {
    name: 'get_invoice_detail',
    description: 'Get full details of one invoice by its ID, including line items and tax breakdown.',
    parameters: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'The invoice ID (from list_recent_invoices)' },
      },
      required: ['invoice_id'],
    },
  },
];
