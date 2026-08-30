// api/sarvam/assistant.js
// Sarvam AI tool-calling serverless endpoint.

import { resolveMerchant, callTool, TOOL_DEFS } from '../_lib/merchantTools.js';

const SARVAM_API_URL = 'https://api.sarvam.ai/v1/chat/completions';
const SARVAM_MODEL = 'sarvam-105b';

const SARVAM_TOOLS = TOOL_DEFS.map((t) => ({
  type: 'function',
  function: {
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  },
}));

const SYSTEM_PROMPT = `You are the billing assistant inside a GST invoicing app.
You can look up the merchant's own account details, list/inspect invoices,
and correct account fields — but ONLY for the merchant currently
authenticated in this conversation. Always confirm with the merchant in
plain language before calling update_account_info. Reply in the same
language (Hindi/English/Hinglish) the merchant used.`;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const merchantId = await resolveMerchant(req.headers.authorization);
  if (!merchantId) {
    res.status(401).json({ error: 'Invalid or missing access token.' });
    return;
  }

  const { message, history } = req.body ?? {};
  if (!message || typeof message !== 'string') {
    res.status(400).json({ error: 'Missing required field: message (string).' });
    return;
  }

  const sarvamKey = process.env.SARVAM_API_KEY;
  if (!sarvamKey) {
    res.status(500).json({ error: 'SARVAM_API_KEY is not configured on the server.' });
    return;
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(Array.isArray(history) ? history : []),
    { role: 'user', content: message },
  ];

  try {
    for (let i = 0; i < 5; i++) {
      const sarvamRes = await fetch(SARVAM_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sarvamKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: SARVAM_MODEL,
          messages,
          tools: SARVAM_TOOLS,
        }),
      });

      if (!sarvamRes.ok) {
        const text = await sarvamRes.text();
        throw new Error(`Sarvam API error (${sarvamRes.status}): ${text}`);
      }

      const data = await sarvamRes.json();
      const choice = data.choices?.[0]?.message;
      if (!choice) throw new Error('Sarvam API returned no message.');

      messages.push(choice);

      const toolCalls = choice.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        res.status(200).json({
          reply: choice.content,
          history: messages.filter((m) => m.role !== 'system'),
        });
        return;
      }

      for (const call of toolCalls) {
        const args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        let resultText;
        try {
          const result = await callTool(merchantId, call.function.name, args);
          resultText = JSON.stringify(result);
        } catch (toolErr) {
          resultText = JSON.stringify({ error: toolErr?.message ?? 'Tool execution failed' });
        }
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: resultText,
        });
      }
    }

    res.status(200).json({
      reply: 'Sorry, I could not complete this in time. Please try again.',
      history: messages.filter((m) => m.role !== 'system'),
    });
  } catch (err) {
    res.status(500).json({ error: err?.message ?? 'Unknown error' });
  }
}
