// api/openai/account.js
// REST endpoint for ChatGPT Custom GPT Actions.
// GET    -> get_account_info
// PATCH  -> update_account_info

import { resolveMerchant, getAccountInfo, updateAccountInfo } from '../_lib/merchantTools.js';

async function getRequestBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
  }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const merchantId = await resolveMerchant(authHeader);
    if (!merchantId) {
      res.status(401).json({ error: 'Invalid or missing access token.' });
      return;
    }

    if (req.method === 'GET') {
      const data = await getAccountInfo(merchantId);
      res.status(200).json(data);
      return;
    }

    if (req.method === 'PATCH') {
      const body = await getRequestBody(req);
      const data = await updateAccountInfo(merchantId, body ?? {});
      res.status(200).json(data);
      return;
    }

    res.status(405).json({ error: 'Method not allowed. Use GET or PATCH.' });
  } catch (err) {
    console.error('OpenAI account handler error:', err);
    res.status(400).json({ error: err?.message ?? 'Unknown error' });
  }
}
