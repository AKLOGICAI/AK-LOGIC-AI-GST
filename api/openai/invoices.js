// api/openai/invoices.js
// REST endpoint for ChatGPT Custom GPT Actions.
// GET ?limit=10 -> list_recent_invoices

import { resolveMerchant, listInvoices } from '../_lib/merchantTools.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const merchantId = await resolveMerchant(req.headers.authorization);
  if (!merchantId) {
    res.status(401).json({ error: 'Invalid or missing access token.' });
    return;
  }

  try {
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const data = await listInvoices(merchantId, limit);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'Unknown error' });
  }
}
