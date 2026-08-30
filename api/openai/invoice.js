// api/openai/invoice.js
// REST endpoint for ChatGPT Custom GPT Actions.
// GET ?id=<invoiceId> -> get_invoice_detail

import { resolveMerchant, getInvoiceDetail } from '../_lib/merchantTools.js';

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

  const invoiceId = req.query.id;
  if (!invoiceId) {
    res.status(400).json({ error: 'Missing required query param: id' });
    return;
  }

  try {
    const data = await getInvoiceDetail(merchantId, invoiceId);
    res.status(200).json(data);
  } catch (err) {
    res.status(400).json({ error: err?.message ?? 'Unknown error' });
  }
}
